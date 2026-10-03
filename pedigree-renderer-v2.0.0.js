(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.HerdHarborPedigreeRenderer = api;
    if (root.document) api.start(root);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "2.0.0-a2";
  const FIELD_ORDER = Object.freeze([
    "name", "prefix", "sex", "dob", "breed", "color", "weight",
    "registrationNumber", "gcNumber", "genotype", "photo"
  ]);

  const MODES = Object.freeze({
    "private-herd": Object.freeze({
      interactive: true,
      density: "comfortable",
      fields: Object.freeze(["name", "sex", "dob", "breed", "color", "registrationNumber", "prefix", "weight", "gcNumber", "genotype", "photo"])
    }),
    "print-preview": Object.freeze({
      interactive: false,
      density: "compact",
      fields: Object.freeze(["name", "sex", "dob", "breed", "color", "registrationNumber", "prefix", "weight", "gcNumber", "genotype", "photo"])
    }),
    "marketplace": Object.freeze({
      interactive: true,
      density: "compact",
      fields: Object.freeze(["name", "prefix", "sex", "dob", "breed", "color", "registrationNumber", "photo"])
    }),
    "transfer-preview": Object.freeze({
      interactive: true,
      density: "comfortable",
      fields: Object.freeze(["name", "prefix", "sex", "dob", "breed", "color", "weight", "registrationNumber", "photo"])
    }),
    "relationship-analysis": Object.freeze({
      interactive: true,
      density: "compact",
      fields: Object.freeze(["name", "sex", "breed", "color", "registrationNumber"])
    })
  });

  const FIELD_LABELS = Object.freeze({
    prefix: "Rabbitry / prefix",
    sex: "Sex",
    dob: "DOB",
    breed: "Breed",
    color: "Variety / color",
    weight: "Weight",
    registrationNumber: "Registration",
    gcNumber: "GC number",
    genotype: "Genotype"
  });

  let started = false;

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function escapeHtml(value) {
    return clean(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeMode(value) {
    const mode = clean(value) || "private-herd";
    return MODES[mode] ? mode : "private-herd";
  }

  function normalizeFields(fields, mode) {
    const source = Array.isArray(fields) && fields.length ? fields : MODES[mode].fields;
    return [...new Set(source.filter((field) => FIELD_ORDER.includes(field)))];
  }

  function normalizeRelationshipAnnotations(value) {
    const source = value && typeof value === "object" ? value : {};
    const cleanList = (items) => Array.isArray(items) ? items.map(clean).filter(Boolean) : [];
    const counts = source.occurrenceCounts && typeof source.occurrenceCounts === "object"
      ? Object.fromEntries(Object.entries(source.occurrenceCounts).map(([key, count]) => [clean(key), Math.max(1, Number(count) || 1)]))
      : {};
    return {
      sharedIdentities: new Set(cleanList(source.sharedIdentities)),
      closestKeys: new Set(cleanList(source.closestKeys)),
      occurrenceCounts: counts
    };
  }

  function relationshipMeta(node, annotations) {
    const identity = clean(node?.identity);
    const key = clean(node?.key);
    const shared = Boolean(identity) && annotations.sharedIdentities.has(identity);
    const closest = Boolean(key) && annotations.closestKeys.has(key);
    const occurrenceCount = shared ? Math.max(1, Number(annotations.occurrenceCounts[identity]) || 1) : 0;
    return { identity, shared, closest, occurrenceCount };
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
      for (const key of ["photoData", "photoDataUrl", "photoUrl", "photo", "profilePhotoDataUrl", "profilePhoto", "imageDataUrl", "imageUrl", "image", "thumbnail", "photos", "images", "media"]) {
        if (!(key in value)) continue;
        const found = firstImageValue(value[key], depth + 1);
        if (found) return found;
      }
    }
    return "";
  }

  function readableGenotype(value) {
    if (value == null || value === "") return "";
    if (typeof value === "string" || typeof value === "number") return clean(value);
    if (Array.isArray(value)) return value.map(readableGenotype).filter(Boolean).join(" · ");
    if (typeof value === "object") {
      if (value.text) return clean(value.text);
      if (value.genotype) return readableGenotype(value.genotype);
      const loci = value.loci && typeof value.loci === "object" ? value.loci : value;
      return Object.entries(loci).map(([locus, row]) => {
        const alleles = Array.isArray(row?.alleles) ? row.alleles.filter(Boolean).join("") : readableGenotype(row);
        return alleles ? `${locus}: ${alleles}` : "";
      }).filter(Boolean).join(" · ");
    }
    return "";
  }

  function fieldValue(animal, field, formatDate) {
    if (!animal) return "";
    switch (field) {
      case "name": return clean(animal.name || animal.registeredName || animal.animalName);
      case "prefix": return clean(animal.prefix || animal.rabbitry || animal.rabbitryName || animal.breeder);
      case "sex": return clean(animal.sex || animal.gender);
      case "dob": {
        const value = clean(animal.dob || animal.dateOfBirth || animal.birthDate);
        return value && typeof formatDate === "function" ? clean(formatDate(value)) : value;
      }
      case "breed": return clean(animal.breed);
      case "color": return clean(animal.variety || animal.color);
      case "weight": return clean(animal.currentWeight || animal.weight);
      case "registrationNumber": return clean(animal.registrationNumber || animal.registration || animal.regNumber || animal.regNo);
      case "gcNumber": return clean(animal.gcNumber || animal.grandChampionNumber || animal.grandChampionNo);
      case "genotype": return readableGenotype(animal.genotype || animal.genetics);
      case "photo": return firstImageValue(animal);
      default: return "";
    }
  }

  function sexLabel(animal) {
    const sex = clean(animal?.sex || animal?.gender).toLowerCase();
    const rabbit = clean(animal?.species).toLowerCase() === "rabbit";
    if (sex === "male") return rabbit ? "♂ Buck" : "♂ Male";
    if (sex === "female") return rabbit ? "♀ Doe" : "♀ Female";
    return "Unknown";
  }

  function statusLabel(node) {
    switch (node?.status) {
      case "repeat": return "Repeated ancestor";
      case "cycle": return "Circular reference";
      case "missing-reference": return "Missing linked record";
      case "malformed-reference": return "Invalid linked record";
      case "unknown": return "Unknown ancestor";
      default: return "";
    }
  }

  function renderFieldRows(animal, fields, formatDate) {
    return fields
      .filter((field) => !["name", "photo"].includes(field))
      .map((field) => {
        const value = field === "sex" ? sexLabel(animal) : fieldValue(animal, field, formatDate);
        if (!value) return "";
        return `<div class="hh-pedigree-field" data-field="${escapeHtml(field)}"><dt>${escapeHtml(FIELD_LABELS[field] || field)}</dt><dd>${escapeHtml(value)}</dd></div>`;
      })
      .join("");
  }

  function renderCard(node, options) {
    const animal = node?.animal || null;
    const relationship = relationshipMeta(node, options.relationship);
    const isKnown = Boolean(animal) && ["known", "repeat"].includes(node?.status);
    const subject = Number(node?.generation || 0) === 0;
    const fields = subject ? options.rootFields : options.ancestorFields;
    const photo = fields.includes("photo") && isKnown ? fieldValue(animal, "photo") : "";
    const blankUnknown = !isKnown && node?.status === "unknown" && options.unknownDisplay === "blank";
    const name = isKnown && fields.includes("name")
      ? fieldValue(animal, "name")
      : (isKnown ? "Recorded ancestor" : (blankUnknown ? "—" : "Unknown"));
    const relation = clean(node?.relation) || "Ancestor";
    const status = blankUnknown ? "" : statusLabel(node);
    const expanded = !options.interactive || subject || options.expandedKeys.has(clean(node?.key));
    const detailRows = isKnown ? renderFieldRows(animal, fields, options.formatDate) : "";
    const canExpand = options.interactive && Boolean(detailRows || node?.issue);
    const summarySex = isKnown && fields.includes("sex") ? sexLabel(animal) : "";
    const repeat = node?.status === "repeat" && node?.repeatOf
      ? `<span class="hh-pedigree-repeat">Repeated occurrence · Also appears as ${escapeHtml(node.repeatOf)}</span>`
      : "";
    const sharedMarker = relationship.shared
      ? `<button type="button" class="hh-pedigree-shared-marker" data-hh-shared-identity="${escapeHtml(relationship.identity)}" aria-pressed="false"><span aria-hidden="true">↔</span> Shared ancestor${relationship.occurrenceCount > 1 ? ` · ${relationship.occurrenceCount} appearances` : ""}</button>`
      : "";
    const closestMarker = relationship.closest
      ? `<span class="hh-pedigree-closest-marker"><span aria-hidden="true">◎</span> Closest path</span>`
      : "";
    const issue = node?.issue ? `<p class="hh-pedigree-issue">${escapeHtml(node.issue)}</p>` : "";

    return `<article class="hh-pedigree-card${subject ? " is-subject" : ""}${isKnown ? "" : " is-unknown"}${expanded ? " is-expanded" : ""}${relationship.shared ? " is-shared-ancestor" : ""}${relationship.closest ? " is-closest-path" : ""}" data-hh-pedigree-card data-pedigree-key="${escapeHtml(node?.key)}" data-pedigree-identity="${escapeHtml(relationship.identity)}" data-pedigree-status="${escapeHtml(node?.status)}">
      <div class="hh-pedigree-card-summary">
        ${photo ? `<img class="hh-pedigree-photo" src="${escapeHtml(photo)}" alt="" loading="lazy" decoding="async">` : ""}
        <div class="hh-pedigree-card-title">
          <small>${escapeHtml(relation)}</small>
          <strong>${escapeHtml(name || "Unknown")}</strong>
          ${summarySex ? `<span>${escapeHtml(summarySex)}</span>` : ""}
          ${status ? `<span class="hh-pedigree-status">${escapeHtml(status)}</span>` : ""}
          ${repeat}
          ${sharedMarker}
          ${closestMarker}
        </div>
        ${canExpand ? `<button type="button" class="hh-pedigree-toggle" data-hh-pedigree-toggle="${escapeHtml(node?.key)}" aria-expanded="${expanded ? "true" : "false"}" aria-label="${expanded ? "Collapse" : "Expand"} ${escapeHtml(relation)} details"><span aria-hidden="true">⌄</span></button>` : ""}
      </div>
      <div class="hh-pedigree-card-details" ${expanded ? "" : "hidden"}>
        ${detailRows ? `<dl>${detailRows}</dl>` : ""}
        ${issue}
      </div>
    </article>`;
  }

  function render(options = {}) {
    const graph = options.graph;
    if (!graph || !Array.isArray(graph.nodes)) {
      throw new Error("Pedigree renderer requires a canonical pedigree graph.");
    }
    const mode = normalizeMode(options.mode);
    const modeConfig = MODES[mode];
    const sharedFields = normalizeFields(options.fields, mode);
    const rootFields = normalizeFields(options.rootFields || sharedFields, mode);
    const ancestorFields = normalizeFields(options.ancestorFields || sharedFields, mode);
    const density = ["compact", "comfortable"].includes(options.density) ? options.density : modeConfig.density;
    const unknownDisplay = ["label", "blank"].includes(options.unknownDisplay) ? options.unknownDisplay : "label";
    const layout = ["balanced", "columns"].includes(options.layout) ? options.layout : "balanced";
    const style = ["classic", "minimal", "professional", "buyer", "rabbitry-branded"].includes(options.style) ? options.style : "classic";
    const interactive = options.interactive == null ? modeConfig.interactive : options.interactive === true;
    const expandedKeys = new Set(Array.isArray(options.expandedKeys) ? options.expandedKeys.map(clean) : []);
    const relationship = mode === "relationship-analysis"
      ? normalizeRelationshipAnnotations(options.relationship)
      : normalizeRelationshipAnnotations(null);
    const generations = Math.max(1, Number(graph.generations || 1));
    const columns = [];

    for (let generation = 0; generation < generations; generation += 1) {
      const nodes = graph.nodes.filter((node) => Number(node.generation) === generation);
      if (!nodes.length) continue;
      columns.push(`<section class="hh-pedigree-generation" data-generation="${generation}" aria-label="${generation === 0 ? "Animal" : `Generation ${generation + 1}`}">
        <div class="hh-pedigree-generation-label">${generation === 0 ? "Animal" : generation === 1 ? "Parents" : generation === 2 ? "Grandparents" : `Generation ${generation + 1}`}</div>
        <div class="hh-pedigree-generation-cards">
          ${nodes.map((node) => renderCard(node, { rootFields, ancestorFields, density, unknownDisplay, interactive, expandedKeys, relationship, formatDate: options.formatDate })).join("")}
        </div>
      </section>`);
    }

    const subjectName = graph.root?.animal ? fieldValue(graph.root.animal, "name") : "animal";
    const branding = options.branding && typeof options.branding === "object" ? options.branding : {};
    const brandName = clean(branding.rabbitryName);
    const brandText = clean(branding.rabbitryText);
    const brandLogo = clean(branding.logoData);
    const brandWebsite = clean(branding.website);
    const brandSocial = clean(branding.social);
    const brandContact = branding.contact && typeof branding.contact === "object" ? branding.contact : {};
    const brandContactItems = [
      clean(brandContact.email),
      clean(brandContact.phone),
      clean(brandContact.address)
    ].filter(Boolean);
    const brandAccent = /^#[0-9a-f]{6}$/i.test(clean(branding.accent)) ? clean(branding.accent) : "#2e7d7b";
    const brandingMeta = [brandWebsite, brandSocial, ...brandContactItems].filter(Boolean);
    const brandingHtml = brandName || brandText || brandLogo || brandingMeta.length
      ? `<header class="hh-pedigree-branding" style="--hh-pedigree-accent:${escapeHtml(brandAccent)}">${brandLogo ? `<img src="${escapeHtml(brandLogo)}" alt="">` : ""}<div>${brandName ? `<strong>${escapeHtml(brandName)}</strong>` : ""}${brandText ? `<small>${escapeHtml(brandText)}</small>` : ""}${brandingMeta.length ? `<span>${brandingMeta.map(escapeHtml).join(" · ")}</span>` : ""}</div></header>`
      : "";
    return `<div class="hh-pedigree-renderer density-${escapeHtml(density)} mode-${escapeHtml(mode)} layout-${escapeHtml(layout)} style-${escapeHtml(style)}" data-hh-pedigree-renderer data-pedigree-mode="${escapeHtml(mode)}" data-pedigree-layout="${escapeHtml(layout)}" data-pedigree-style="${escapeHtml(style)}" data-unknown-display="${escapeHtml(unknownDisplay)}" style="--hh-pedigree-generations:${columns.length}" aria-label="Pedigree chart for ${escapeHtml(subjectName || "animal")}">
      ${brandingHtml}
      <div class="hh-pedigree-columns">${columns.join("")}</div>
    </div>`;
  }

  function toggleCard(button) {
    const card = button?.closest?.("[data-hh-pedigree-card]");
    if (!card) return false;
    const details = card.querySelector(".hh-pedigree-card-details");
    if (!details) return false;
    const expanded = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", expanded ? "false" : "true");
    button.setAttribute("aria-label", button.getAttribute("aria-label")?.replace(expanded ? "Collapse" : "Expand", expanded ? "Expand" : "Collapse") || "");
    card.classList.toggle("is-expanded", !expanded);
    details.hidden = expanded;
    return true;
  }

  function selectSharedIdentity(scope, identity) {
    const cleanIdentity = clean(identity);
    const root = scope?.querySelectorAll ? scope : null;
    if (!root || !cleanIdentity) return 0;
    let count = 0;
    root.querySelectorAll("[data-pedigree-identity]").forEach((card) => {
      const selected = clean(card.dataset?.pedigreeIdentity) === cleanIdentity;
      card.classList.toggle("is-shared-selected", selected);
      if (selected) count += 1;
    });
    root.querySelectorAll("[data-hh-shared-identity]").forEach((button) => {
      button.setAttribute("aria-pressed", clean(button.dataset?.hhSharedIdentity) === cleanIdentity ? "true" : "false");
    });
    return count;
  }

  function start(target = globalThis) {
    const doc = target?.document;
    if (!doc || started) return false;
    started = true;
    doc.addEventListener("click", (event) => {
      const sharedButton = event.target?.closest?.("[data-hh-shared-identity]");
      if (sharedButton) {
        const scope = sharedButton.closest?.("[data-hh-relationship-view]") || doc;
        const identity = clean(sharedButton.dataset?.hhSharedIdentity);
        const selectedCount = selectSharedIdentity(scope, identity);
        if (typeof CustomEvent === "function") {
          sharedButton.dispatchEvent(new CustomEvent("herdharbor:relationship-ancestor-selected", {
            bubbles: true,
            detail: { identity, selectedCount }
          }));
        }
        return;
      }
      const button = event.target?.closest?.("[data-hh-pedigree-toggle]");
      if (!button) return;
      toggleCard(button);
    });
    return true;
  }

  return Object.freeze({
    VERSION,
    FIELD_ORDER,
    MODES,
    normalizeMode,
    normalizeFields,
    normalizeRelationshipAnnotations,
    fieldValue,
    render,
    toggleCard,
    selectSharedIdentity,
    start
  });
});
