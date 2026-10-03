(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborPedigreeCustomization = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "2.0.0-a3";
  const PREF_KEY = "herdharbor_pedigree_visuals_v1";
  const GENERATION_OPTIONS = Object.freeze([3, 4, 5]);
  const FIELD_ORDER = Object.freeze([
    "name", "prefix", "sex", "dob", "breed", "color", "weight",
    "registrationNumber", "gcNumber", "genotype"
  ]);
  const FIELD_LABELS = Object.freeze({
    name: "Name",
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
  const DENSITIES = Object.freeze(["comfortable", "compact"]);
  const UNKNOWN_DISPLAYS = Object.freeze(["label", "blank"]);
  const LAYOUTS = Object.freeze(["balanced", "columns"]);
  const STYLES = Object.freeze(["classic", "minimal", "professional", "buyer", "rabbitry-branded"]);

  const TEMPLATES = Object.freeze({
    "Classic": Object.freeze({
      generations: 4,
      rootFields: Object.freeze(["name", "sex", "dob", "breed", "color", "registrationNumber"]),
      ancestorFields: Object.freeze(["name", "sex", "breed", "color", "registrationNumber"]),
      photos: false,
      unknownDisplay: "label",
      density: "comfortable",
      layout: "balanced",
      style: "classic"
    }),
    "Minimal": Object.freeze({
      generations: 3,
      rootFields: Object.freeze(["name", "sex", "breed", "color"]),
      ancestorFields: Object.freeze(["name", "sex", "breed"]),
      photos: false,
      unknownDisplay: "blank",
      density: "compact",
      layout: "columns",
      style: "minimal"
    }),
    "Professional": Object.freeze({
      generations: 4,
      rootFields: Object.freeze(["name", "prefix", "sex", "dob", "breed", "color", "registrationNumber", "gcNumber"]),
      ancestorFields: Object.freeze(["name", "prefix", "sex", "breed", "color", "registrationNumber", "gcNumber"]),
      photos: false,
      unknownDisplay: "label",
      density: "compact",
      layout: "balanced",
      style: "professional"
    }),
    "Buyer": Object.freeze({
      generations: 3,
      rootFields: Object.freeze(["name", "prefix", "sex", "dob", "breed", "color", "weight"]),
      ancestorFields: Object.freeze(["name", "sex", "breed", "color"]),
      photos: true,
      unknownDisplay: "label",
      density: "comfortable",
      layout: "columns",
      style: "buyer"
    }),
    "Rabbitry Branded": Object.freeze({
      generations: 4,
      rootFields: Object.freeze(["name", "prefix", "sex", "dob", "breed", "color", "registrationNumber"]),
      ancestorFields: Object.freeze(["name", "prefix", "sex", "breed", "color", "registrationNumber"]),
      photos: true,
      unknownDisplay: "label",
      density: "comfortable",
      layout: "balanced",
      style: "rabbitry-branded"
    })
  });

  const DEFAULT_TEMPLATE = "Classic";

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

  function normalizeTemplate(value) {
    const wanted = clean(value);
    return Object.prototype.hasOwnProperty.call(TEMPLATES, wanted) ? wanted : DEFAULT_TEMPLATE;
  }

  function normalizeFields(value, fallback) {
    const source = Array.isArray(value) ? value : fallback;
    const unique = [...new Set((source || []).map(clean).filter((field) => FIELD_ORDER.includes(field)))];
    return unique.length ? unique : [...fallback];
  }

  function templateConfig(name = DEFAULT_TEMPLATE) {
    const template = normalizeTemplate(name);
    const source = TEMPLATES[template];
    return {
      template,
      generations: source.generations,
      rootFields: [...source.rootFields],
      ancestorFields: [...source.ancestorFields],
      photos: source.photos,
      unknownDisplay: source.unknownDisplay,
      density: source.density,
      layout: source.layout,
      style: source.style
    };
  }

  function normalize(config = {}) {
    const template = normalizeTemplate(config.template);
    const base = templateConfig(template);
    const generations = GENERATION_OPTIONS.includes(Number(config.generations))
      ? Number(config.generations)
      : base.generations;
    return {
      template,
      generations,
      rootFields: normalizeFields(config.rootFields, base.rootFields),
      ancestorFields: normalizeFields(config.ancestorFields, base.ancestorFields),
      photos: config.photos == null ? base.photos : config.photos === true,
      unknownDisplay: UNKNOWN_DISPLAYS.includes(config.unknownDisplay) ? config.unknownDisplay : base.unknownDisplay,
      density: DENSITIES.includes(config.density) ? config.density : base.density,
      layout: LAYOUTS.includes(config.layout) ? config.layout : base.layout,
      style: STYLES.includes(config.style) ? config.style : base.style
    };
  }

  function parseStored(storage) {
    try {
      const raw = storage?.getItem?.(PREF_KEY);
      const saved = raw ? JSON.parse(raw) : {};
      return saved && typeof saved === "object" ? saved : {};
    } catch {
      return {};
    }
  }

  function loadPreferences(storage) {
    const saved = parseStored(storage);
    if (saved.customization && typeof saved.customization === "object") {
      return normalize(saved.customization);
    }
    const migrated = templateConfig(DEFAULT_TEMPLATE);
    if (saved.photoMode === "compact" || saved.photoMode === "visual" || saved.printPhotos === true) {
      migrated.photos = true;
    }
    return normalize(migrated);
  }

  function savePreferences(storage, config) {
    const normalized = normalize(config);
    if (!storage?.setItem) return normalized;
    const existing = parseStored(storage);
    const next = {
      ...existing,
      customization: normalized,
      photoMode: normalized.photos ? "compact" : "off",
      printPhotos: normalized.photos
    };
    storage.setItem(PREF_KEY, JSON.stringify(next));
    return normalized;
  }

  function option(value, current) {
    return `<option value="${escapeHtml(value)}" ${value === current ? "selected" : ""}>${escapeHtml(value)}</option>`;
  }

  function fieldChecks(name, selected) {
    const selectedSet = new Set(selected);
    return FIELD_ORDER.map((field) => `<label class="hh-pedigree-config-check"><input type="checkbox" name="${escapeHtml(name)}" value="${escapeHtml(field)}" ${selectedSet.has(field) ? "checked" : ""}><span>${escapeHtml(FIELD_LABELS[field])}</span></label>`).join("");
  }

  function controlsHtml(config = {}) {
    const value = normalize(config);
    return `<div class="hh-pedigree-config" data-hh-pedigree-config>
      <div class="form-grid two">
        <label>Template
          <select name="template">${Object.keys(TEMPLATES).map((name) => option(name, value.template)).join("")}</select>
        </label>
        <label>Generations
          <select name="generations">${GENERATION_OPTIONS.map((count) => `<option value="${count}" ${count === value.generations ? "selected" : ""}>${count} generations</option>`).join("")}</select>
        </label>
        <label>Density
          <select name="density">${DENSITIES.map((name) => option(name, value.density)).join("")}</select>
        </label>
        <label>Unknown ancestors
          <select name="unknownDisplay"><option value="label" ${value.unknownDisplay === "label" ? "selected" : ""}>Show “Unknown”</option><option value="blank" ${value.unknownDisplay === "blank" ? "selected" : ""}>Keep blank position</option></select>
        </label>
        <label>Layout
          <select name="layout"><option value="balanced" ${value.layout === "balanced" ? "selected" : ""}>Balanced</option><option value="columns" ${value.layout === "columns" ? "selected" : ""}>Straight columns</option></select>
        </label>
        <label>Style
          <select name="style">${STYLES.map((name) => option(name, value.style)).join("")}</select>
        </label>
      </div>
      <label class="hh-pedigree-config-photo"><input type="checkbox" name="photos" ${value.photos ? "checked" : ""}><span>Show stored animal photos when available</span></label>
      <div class="hh-pedigree-config-fields">
        <fieldset><legend>Animal fields</legend><div class="hh-pedigree-config-checks">${fieldChecks("rootFields", value.rootFields)}</div></fieldset>
        <fieldset><legend>Ancestor fields</legend><div class="hh-pedigree-config-checks">${fieldChecks("ancestorFields", value.ancestorFields)}</div></fieldset>
      </div>
    </div>`;
  }

  function checkedValues(root, name) {
    return Array.from(root?.querySelectorAll?.(`input[name="${name}"]:checked`) || []).map((input) => clean(input.value));
  }

  function readControls(root, fallback = {}) {
    const base = normalize(fallback);
    const value = (name) => clean(root?.querySelector?.(`[name="${name}"]`)?.value);
    return normalize({
      template: value("template") || base.template,
      generations: Number(value("generations") || base.generations),
      rootFields: checkedValues(root, "rootFields"),
      ancestorFields: checkedValues(root, "ancestorFields"),
      photos: Boolean(root?.querySelector?.('input[name="photos"]')?.checked),
      unknownDisplay: value("unknownDisplay") || base.unknownDisplay,
      density: value("density") || base.density,
      layout: value("layout") || base.layout,
      style: value("style") || base.style
    });
  }

  function rendererOptions(config, formatDate) {
    const value = normalize(config);
    return {
      mode: "private-herd",
      rootFields: [...value.rootFields, ...(value.photos ? ["photo"] : [])],
      ancestorFields: [...value.ancestorFields, ...(value.photos ? ["photo"] : [])],
      density: value.density,
      unknownDisplay: value.unknownDisplay,
      layout: value.layout,
      style: value.style,
      formatDate
    };
  }

  return Object.freeze({
    VERSION,
    PREF_KEY,
    GENERATION_OPTIONS,
    FIELD_ORDER,
    FIELD_LABELS,
    DENSITIES,
    UNKNOWN_DISPLAYS,
    LAYOUTS,
    STYLES,
    TEMPLATES,
    DEFAULT_TEMPLATE,
    normalizeTemplate,
    normalize,
    templateConfig,
    loadPreferences,
    savePreferences,
    controlsHtml,
    readControls,
    rendererOptions
  });
});
