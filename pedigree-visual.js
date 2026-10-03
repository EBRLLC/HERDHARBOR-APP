(() => {
  "use strict";

  const PREF_KEY = "herdharbor_pedigree_visuals_v1";
  const STATE_KEY = "herdharbor_pre_alpha_v1";
  const DEFAULTS = {
    sexColors: true,
    photoMode: "off",
    printPhotos: false
  };
  const PRINT_BOUNDS = {
    width: 10.56 * 96,
    height: 8.04 * 96,
    minimumScale: 0.72
  };

  let pending = false;
  let observer = null;
  let startQueued = false;

  function loadPreferences() {
    try {
      const saved = JSON.parse(localStorage.getItem(PREF_KEY) || "{}");
      const customization = window.HerdHarborPedigreeCustomization;
      if (customization?.loadPreferences) {
        const config = customization.loadPreferences(localStorage);
        return {
          sexColors: saved.sexColors !== false,
          photoMode: config.photos ? "compact" : "off",
          printPhotos: config.photos
        };
      }
      return {
        sexColors: saved.sexColors !== false,
        photoMode: ["off", "compact", "visual"].includes(saved.photoMode) ? saved.photoMode : DEFAULTS.photoMode,
        printPhotos: saved.printPhotos === true
      };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function savePreferences(next) {
    localStorage.setItem(PREF_KEY, JSON.stringify(next));
  }

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function readAnimals() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STATE_KEY) || "null");
      if (!parsed || typeof parsed !== "object") return [];
      if (Array.isArray(parsed.animals)) return parsed.animals;
      if (Array.isArray(parsed.data?.animals)) return parsed.data.animals;
      if (Array.isArray(parsed.state?.animals)) return parsed.state.animals;
    } catch {}
    return [];
  }

  function firstImageValue(value, depth = 0) {
    if (depth > 4 || value == null) return "";
    if (typeof value === "string") {
      const text = value.trim();
      return /^(data:image\/|blob:|https?:\/\/)/i.test(text) ? text : "";
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = firstImageValue(item, depth + 1);
        if (found) return found;
      }
      return "";
    }
    if (typeof value === "object") {
      const preferred = [
        "photoDataUrl", "photoUrl", "photo", "profilePhotoDataUrl", "profilePhoto",
        "imageDataUrl", "imageUrl", "image", "thumbnail", "photos", "images", "media"
      ];
      for (const key of preferred) {
        if (!(key in value)) continue;
        const found = firstImageValue(value[key], depth + 1);
        if (found) return found;
      }
      for (const [key, nested] of Object.entries(value)) {
        if (!/(photo|image|thumbnail|media)/i.test(key)) continue;
        const found = firstImageValue(nested, depth + 1);
        if (found) return found;
      }
    }
    return "";
  }

  function cardText(element) {
    return String(element?.innerText || element?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function looksLikePedigreeCard(element) {
    if (element?.matches?.("[data-hh-pedigree-card]")) return false;
    const text = cardText(element);
    if (!/\bCOLOR\s*:/i.test(text) || !/\bBREEDER\s*:/i.test(text)) return false;
    if (!/(?:♀|♂|\bDOE\b|\bBUCK\b|\bFEMALE\b|\bMALE\b)/i.test(text)) return false;
    const colorCount = (text.match(/\bCOLOR\s*:/gi) || []).length;
    return colorCount === 1;
  }

  function findCards(doc) {
    if (!doc?.querySelectorAll) return [];
    const all = Array.from(doc.querySelectorAll("article, section, div, td, li"))
      .filter(looksLikePedigreeCard);
    return all.filter((candidate) =>
      !Array.from(candidate.children || []).some((child) => looksLikePedigreeCard(child))
    );
  }

  function smallestContaining(card, label) {
    const matcher = new RegExp(`\\b${label}\\s*:`, "i");
    const candidates = [card, ...card.querySelectorAll("div, span, p, small, li, td, dd")]
      .filter((el) => matcher.test(cardText(el)))
      .sort((a, b) => cardText(a).length - cardText(b).length);
    return candidates[0] || null;
  }

  function markProtectedFields(card) {
    card.querySelectorAll(".hh-protected-field, .hh-protected-row").forEach((field) => {
      field.classList.remove("hh-protected-field", "hh-protected-row", "hh-protected-color", "hh-protected-breeder");
    });

    ["COLOR", "BREEDER"].forEach((label) => {
      const fieldName = label.toLowerCase();
      const row = card.querySelector(`[data-field="${fieldName}"]`) || smallestContaining(card, label);
      if (!row) return;
      const value = row.matches("[data-field]")
        ? row.querySelector(":scope > span[title], :scope > .pedigree-protected-value") || row
        : row;
      row.classList.add("hh-protected-row");
      value.classList.add("hh-protected-field", `hh-protected-${fieldName}`);
    });
  }

  function fitPrintSheet(doc) {
    const sheet = doc?.querySelector?.(".sheet");
    if (!sheet) return;
    doc.documentElement.classList.add("hh-pedigree-print-document");
    sheet.classList.add("hh-pedigree-one-page");

    const fit = () => {
      sheet.style.removeProperty("zoom");
      const width = Math.max(sheet.scrollWidth, sheet.getBoundingClientRect?.().width || 0);
      const height = Math.max(sheet.scrollHeight, sheet.getBoundingClientRect?.().height || 0);
      const scale = Math.min(1, PRINT_BOUNDS.width / Math.max(width, 1), PRINT_BOUNDS.height / Math.max(height, 1));
      sheet.style.zoom = String(Math.max(PRINT_BOUNDS.minimumScale, scale));
    };

    window.requestAnimationFrame(() => window.requestAnimationFrame(fit));
    const fontsReady = doc.fonts?.ready;
    if (fontsReady?.then) fontsReady.then(fit).catch(() => {});
    Promise.all(Array.from(doc.images || []).map((image) => image.decode?.().catch(() => {}) || Promise.resolve()))
      .then(fit)
      .catch(() => {});
  }

  function markEmptySecondary(card) {
    if (card.dataset.hhGeneration !== "3") return;
    card.querySelectorAll("div, span, p, small, li, td, dd").forEach((el) => {
      const text = cardText(el)
        .replace(/\u2014/g, "—")
        .replace(/\s+/g, " ")
        .trim();
      if (/^(?:(?:ID|DOB|REG)\s*:\s*(?:—|-|N\/A)\s*)+$/i.test(text)) {
        el.classList.add("hh-empty-secondary");
      }
    });
  }

  function sexForCard(card) {
    const text = cardText(card);
    if (/(?:♀|\bDOE\b|\bFEMALE\b)/i.test(text)) return "female";
    if (/(?:♂|\bBUCK\b|\bMALE\b)/i.test(text)) return "male";
    return "unknown";
  }

  function assignGenerations(cards) {
    const positioned = cards
      .map((card) => ({ card, left: card.getBoundingClientRect?.().left ?? 0 }))
      .sort((a, b) => a.left - b.left);

    const columns = [];
    positioned.forEach(({ left }) => {
      const existing = columns.find((value) => Math.abs(value - left) <= 28);
      if (existing == null) columns.push(left);
    });
    columns.sort((a, b) => a - b);

    positioned.forEach(({ card, left }) => {
      let generation = columns.findIndex((value) => Math.abs(value - left) <= 28);
      if (generation < 0) generation = 0;
      card.dataset.hhGeneration = String(Math.min(3, generation));
    });
  }

  function nameFromCard(card) {
    const excluded = /^(?:ANIMAL|SIRE|DAM|SIRE'S SIRE|SIRE'S DAM|DAM'S SIRE|DAM'S DAM|BUCK|DOE|MALE|FEMALE)$/i;
    const tagged = Array.from(card.querySelectorAll("h1,h2,h3,h4,h5,h6,strong,b"))
      .map((el) => cardText(el))
      .filter((text) => text && text.length <= 80 && !excluded.test(text) && !/:/.test(text) && !/[♀♂]/.test(text));
    if (tagged.length) return tagged[0];

    const lines = String(card.innerText || "")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.find((line) =>
      line.length <= 80 &&
      !excluded.test(line) &&
      !/:/.test(line) &&
      !/(?:♀|♂|\bBUCK\b|\bDOE\b|\bMALE\b|\bFEMALE\b)/i.test(line)
    ) || "";
  }

  function photoIndex() {
    const map = new Map();
    readAnimals().forEach((animal) => {
      const name = normalize(animal?.name || animal?.animalName || animal?.registeredName);
      if (!name) return;
      const photo = firstImageValue(animal);
      if (photo && !map.has(name)) map.set(name, photo);
    });
    return map;
  }

  function removeThumbnail(card) {
    card.querySelectorAll(":scope > .hh-pedigree-thumb").forEach((img) => img.remove());
    card.classList.remove("hh-has-photo");
  }

  function addThumbnail(card, photos, prefs, printContext) {
    removeThumbnail(card);
    const generation = Number(card.dataset.hhGeneration || 0);
    

    const enabled = printContext ? prefs.printPhotos : prefs.photoMode !== "off";
    if (!enabled) return;

    const name = nameFromCard(card);
let src = photos.get(normalize(name));

if (!src && generation === 0) {
  const headerPhoto = card.ownerDocument.querySelector(".print-animal-photo img");
  src = headerPhoto?.src || "";
}

if (!src) return;

    const image = card.ownerDocument.createElement("img");
    image.className = "hh-pedigree-thumb";
    image.alt = name ? `Photo of ${name}` : "Animal photo";
    image.src = src;
    image.loading = printContext ? "eager" : "lazy";
    image.decoding = "async";
    card.insertBefore(image, card.firstChild);
    card.classList.add("hh-has-photo");
  }

  function enhanceDocument(doc, printContext = false) {
    if (!doc?.documentElement) return;
    if (printContext) fitPrintSheet(doc);
    const prefs = loadPreferences();
    const cards = findCards(doc);
    if (!cards.length) return;

    assignGenerations(cards);
    doc.documentElement.dataset.hhPhotoMode = printContext ? "compact" : prefs.photoMode;
    const photos = photoIndex();

    cards.forEach((card) => {
      card.classList.add("hh-pedigree-card");
      card.classList.remove("hh-sex-male", "hh-sex-female", "hh-sex-unknown", "hh-sex-colors-off");
      card.classList.add(`hh-sex-${sexForCard(card)}`);
      if (!prefs.sexColors) card.classList.add("hh-sex-colors-off");
      markProtectedFields(card);
      markEmptySecondary(card);
      addThumbnail(card, photos, prefs, printContext);
    });
    if (printContext) fitPrintSheet(doc);
  }

  function ensureStyles(doc) {
    if (!doc?.head || doc.getElementById("hh-pedigree-visual-style")) return;
    const link = doc.createElement("link");
    link.id = "hh-pedigree-visual-style";
    link.rel = "stylesheet";
    link.href = "pedigree-visual.css?v=2";
    const styleTarget = doc.head || doc.documentElement || doc.body;
    if (styleTarget) styleTarget.appendChild(link);
  }

  function enhanceFrame(frame) {
    try {
      const doc = frame.contentDocument;
      if (!doc) return;
      ensureStyles(doc);
      enhanceDocument(doc, true);
    } catch {}
  }

  function watchPrintFrames(doc) {
    doc.querySelectorAll("iframe").forEach((frame) => {
      if (frame.dataset.hhPedigreeWatch === "1") return;
      const id = frame.id || "";
      if (!/pedigree/i.test(id) && !/pedigree/i.test(frame.title || "")) return;
      frame.dataset.hhPedigreeWatch = "1";
      frame.addEventListener("load", () => enhanceFrame(frame));
      enhanceFrame(frame);
    });
  }

  function ensureSettingsUI(doc) {
    const settings = doc.querySelector("#view-settings");
    if (!settings || settings.querySelector("#hh-pedigree-settings")) return;
    const host = settings.querySelector(".settings-grid") || settings;
    const customization = window.HerdHarborPedigreeCustomization;
    const stored = (() => {
      try { return JSON.parse(localStorage.getItem(PREF_KEY) || "{}"); } catch { return {}; }
    })();

    const card = doc.createElement("article");
    card.id = "hh-pedigree-settings";
    card.className = "settings-card hh-pedigree-settings";

    if (!customization?.controlsHtml || !customization?.loadPreferences || !customization?.savePreferences) {
      const prefs = loadPreferences();
      card.innerHTML = `
        <h3>Pedigree appearance</h3>
        <p>Pedigree customization is unavailable until the pedigree tools finish loading.</p>
        <div class="hh-setting-row">
          <label class="hh-setting-check">
            <input type="checkbox" id="hh-pedigree-sex-colors" ${prefs.sexColors ? "checked" : ""}>
            <span>Color-code pedigree cards by sex</span>
          </label>
        </div>
      `;
      host.appendChild(card);
      card.querySelector("#hh-pedigree-sex-colors")?.addEventListener("change", (event) => {
        savePreferences({ ...prefs, sexColors: event.currentTarget.checked });
        schedule();
      });
      return;
    }

    let config = customization.loadPreferences(localStorage);
    card.innerHTML = `
      <h3>Pedigree defaults</h3>
      <p>Choose the default pedigree depth, visible fields, photos, unknown-animal display, density, layout, and style. These settings do not change animal or ancestry records.</p>
      <div class="hh-setting-row">
        <label class="hh-setting-check">
          <input type="checkbox" id="hh-pedigree-sex-colors" ${stored.sexColors !== false ? "checked" : ""}>
          <span>Color-code legacy printed pedigree cards by sex</span>
        </label>
      </div>
      <div data-hh-pedigree-config-host>${customization.controlsHtml(config)}</div>
    `;
    host.appendChild(card);

    const configHost = card.querySelector("[data-hh-pedigree-config-host]");

    const persist = () => {
      const savedConfig = customization.savePreferences(localStorage, config);
      let existing = {};
      try { existing = JSON.parse(localStorage.getItem(PREF_KEY) || "{}"); } catch {}
      localStorage.setItem(PREF_KEY, JSON.stringify({
        ...existing,
        sexColors: card.querySelector("#hh-pedigree-sex-colors")?.checked !== false
      }));
      config = savedConfig;
      window.dispatchEvent(new CustomEvent("herdharbor:pedigree-customization-change", {
        detail: { config }
      }));
      schedule();
    };

    const bindControls = () => {
      configHost.querySelectorAll("input,select").forEach((control) => {
        control.addEventListener("change", (event) => {
          if (event.currentTarget?.name === "template") {
            config = customization.templateConfig(event.currentTarget.value);
            configHost.innerHTML = customization.controlsHtml(config);
            bindControls();
          } else {
            config = customization.readControls(configHost, config);
          }
          persist();
        });
      });
    };

    card.querySelector("#hh-pedigree-sex-colors")?.addEventListener("change", persist);
    bindControls();
  }

  function patchPrintWindows() {
    if (window.__hhPedigreePrintPatched) return;
    window.__hhPedigreePrintPatched = true;
    const nativeOpen = window.open.bind(window);
    window.open = function (...args) {
      const child = nativeOpen(...args);
      if (!child) return child;
      try {
        const nativePrint = child.print.bind(child);
        child.print = function () {
          try {
            ensureStyles(child.document);
            enhanceDocument(child.document, true);
          } catch {}
          window.setTimeout(() => nativePrint(), 60);
        };
      } catch {}
      return child;
    };
  }

  function run() {
    pending = false;
    ensureSettingsUI(document);
    enhanceDocument(document, false);
    watchPrintFrames(document);
  }

  function schedule() {
    if (pending) return;
    pending = true;
    window.requestAnimationFrame(run);
  }

  function deferStart() {
    if (startQueued) return;
    startQueued = true;
    const retry = () => {
      startQueued = false;
      start();
    };
    if (document.readyState === "loading" && document.addEventListener) {
      document.addEventListener("DOMContentLoaded", retry, { once: true });
      return;
    }
    const defer = typeof window.setTimeout === "function" ? window.setTimeout : setTimeout;
    defer(retry, 0);
  }

  function start() {
    if (observer) return;
    const target = document.body;
    if (!target) {
      deferStart();
      return;
    }
    ensureStyles(document);
    patchPrintWindows();
    run();
    if (observer) return;
    observer = new MutationObserver(schedule);
    observer.observe(target, { childList: true, subtree: true });
  }

  window.HerdHarborPedigreeVisuals = {
    enhance: () => enhanceDocument(document, false),
    preferences: loadPreferences
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
