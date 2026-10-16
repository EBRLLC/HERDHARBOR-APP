(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborCanineIdentity = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "2.0.1-k1";
  const MAX_REGISTRATIONS = 20;
  const MAX_TITLES = 40;
  const trim = (value, max = 200) => String(value == null ? "" : value).trim().slice(0, max);
  const canonical = (value) => trim(value).toLowerCase().replace(/\s+/g, " ");
  const isDog = (animal) => canonical(typeof animal === "string" ? animal : animal?.species) === "dog";
  const esc = (value) => trim(value, 500).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  function registration(value = {}, position = 0) {
    return {
      id: trim(value.id, 90) || "reg-" + position,
      registry: trim(value.registry, 120),
      number: trim(value.number || value.registrationNumber, 160),
      registrationType: trim(value.registrationType, 100),
      status: trim(value.status, 80),
      source: trim(value.source, 120) || "Breeder entered",
      verification: "unverified",
      evidenceNote: trim(value.evidenceNote, 400)
    };
  }
  function title(value = {}, position = 0) {
    return {
      id: trim(value.id, 90) || "title-" + position,
      organization: trim(value.organization, 120),
      abbreviation: trim(value.abbreviation, 45),
      fullLabel: trim(value.fullLabel, 160),
      placement: value.placement === "prefix" ? "prefix" : "suffix",
      displayOrder: Number.isFinite(Number(value.displayOrder)) && value.displayOrder !== ""
        ? Math.max(0, Math.min(999, Math.trunc(Number(value.displayOrder)))) : position,
      earnedOn: /^\d{4}-\d{2}-\d{2}$/.test(trim(value.earnedOn, 30)) ? trim(value.earnedOn, 30) : "",
      source: trim(value.source, 120) || "Breeder entered",
      verification: "unverified",
      evidenceNote: trim(value.evidenceNote, 400)
    };
  }
  function normalize(input = {}) {
    const obj = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const regs = Array.isArray(obj.registrations) ? obj.registrations.slice(0, MAX_REGISTRATIONS) : [];
    const titles = Array.isArray(obj.titles) ? obj.titles.slice(0, MAX_TITLES) : [];
    return {
      schemaVersion: 1,
      callName: trim(obj.callName, 160),
      registeredName: trim(obj.registeredName, 200),
      preferredRegistrationId: trim(obj.preferredRegistrationId, 90),
      registrations: regs.map(registration).filter(r => r.registry || r.number),
      titles: titles.map(title).filter(t => t.abbreviation || t.fullLabel)
    };
  }
  function validate(input = {}) {
    const value = normalize(input);
    const errors = [];
    if ((input?.registrations?.length || 0) > MAX_REGISTRATIONS) errors.push("Too many registrations.");
    if ((input?.titles?.length || 0) > MAX_TITLES) errors.push("Too many titles.");
    const identifiers = new Set();
    value.registrations.forEach((r, i) => {
      if (!r.registry || !r.number) errors.push("Registration " + (i + 1) + " requires both registry and number.");
      const key = canonical(r.registry) + "|" + canonical(r.number);
      if (identifiers.has(key)) errors.push("Duplicate registry and number.");
      identifiers.add(key);
    });
    value.titles.forEach((t, i) => {
      if (!t.abbreviation) errors.push("Title " + (i + 1) + " requires an abbreviation.");
      if (!t.organization) errors.push("Title " + (i + 1) + " requires its issuing organization.");
    });
    if (value.preferredRegistrationId && !value.registrations.some(r => r.id === value.preferredRegistrationId))
      errors.push("Preferred registration does not exist.");
    return { valid: errors.length === 0, errors, value };
  }
  function displayName(animal, options = {}) {
    const meta = normalize(animal?.canine);
    const registered = meta.registeredName || trim(animal?.name) || "Unnamed dog";
    if (options.includeTitles === false) return registered;
    const titles = [...meta.titles].sort((a, b) => a.displayOrder - b.displayOrder);
    const prefix = titles.filter(t => t.placement === "prefix").map(t => t.abbreviation).filter(Boolean).join(" ");
    const suffix = titles.filter(t => t.placement === "suffix").map(t => t.abbreviation).filter(Boolean).join(" ");
    return [prefix, registered, suffix].filter(Boolean).join(" ");
  }
  function preferredRegistration(animal) {
    const meta = normalize(animal?.canine);
    return meta.registrations.find(r => r.id === meta.preferredRegistrationId) || meta.registrations[0] || null;
  }

  function regRow(record = {}, index = 0) {
    const r = registration(record, index);
    return '<div class="canine-entry" data-canine-reg-row>' +
      '<label>Registry / organization<input data-reg-field="registry" maxlength="120" value="' + esc(r.registry) + '" placeholder="AKC, UKC, or other"></label>' +
      '<label>Registration number<input data-reg-field="number" maxlength="160" value="' + esc(r.number) + '"></label>' +
      '<label>Type (optional)<input data-reg-field="registrationType" value="' + esc(r.registrationType) + '"></label>' +
      '<label>Status (owner reported)<input data-reg-field="status" value="' + esc(r.status) + '"></label>' +
      '<label>Source<input data-reg-field="source" value="' + esc(r.source) + '"></label>' +
      '<label>Evidence note (optional)<input data-reg-field="evidenceNote" value="' + esc(r.evidenceNote) + '"></label>' +
      '<input type="hidden" data-reg-field="id" value="' + esc(r.id) + '">' +
      '<button type="button" class="button button-ghost button-small" data-remove-canine-row>Remove registration</button></div>';
  }
  function titleRow(record = {}, index = 0) {
    const t = title(record, index);
    return '<div class="canine-entry" data-canine-title-row>' +
      '<label>Issuing organization<input data-title-field="organization" maxlength="120" value="' + esc(t.organization) + '" placeholder="AKC, UKC, ..."></label>' +
      '<label>Abbreviation<input data-title-field="abbreviation" maxlength="45" value="' + esc(t.abbreviation) + '" placeholder="CH, CGC, CD"></label>' +
      '<label>Full title (optional)<input data-title-field="fullLabel" value="' + esc(t.fullLabel) + '"></label>' +
      '<label>Placement<select data-title-field="placement"><option value="prefix"' + (t.placement === "prefix" ? " selected" : "") + '>Before registered name</option><option value="suffix"' + (t.placement === "suffix" ? " selected" : "") + '>After registered name</option></select></label>' +
      '<label>Display order<input type="number" min="0" max="999" data-title-field="displayOrder" value="' + esc(t.displayOrder) + '"></label>' +
      '<label>Date earned (optional)<input type="date" data-title-field="earnedOn" value="' + esc(t.earnedOn) + '"></label>' +
      '<label>Source<input data-title-field="source" value="' + esc(t.source) + '"></label>' +
      '<label>Evidence note (optional)<input data-title-field="evidenceNote" value="' + esc(t.evidenceNote) + '"></label>' +
      '<input type="hidden" data-title-field="id" value="' + esc(t.id) + '">' +
      '<button type="button" class="button button-ghost button-small" data-remove-canine-row>Remove title</button></div>';
  }
  function editorHtml(animal = {}) {
    const meta = normalize(animal.canine);
    return '<section class="canine-identity-panel' + (isDog(animal) ? '' : ' hidden') + '" data-canine-panel' + (isDog(animal) ? '' : ' hidden') + '>' +
      '<h3>Dog identity, registrations and titles</h3>' +
      '<p class="muted">Records are breeder-entered and not independently verified by AKC or HerdHarbor. Do not use official seals.</p>' +
      '<div class="form-grid two"><label>Call name<input maxlength="160" data-canine-call-name value="' + esc(meta.callName) + '"></label>' +
      '<label>Registered name (without titles)<input maxlength="200" data-canine-registered-name value="' + esc(meta.registeredName) + '"></label></div>' +
      '<h4>Registry records</h4><div data-canine-reg-list>' + meta.registrations.map(regRow).join("") + '</div>' +
      '<button type="button" class="button button-ghost button-small" data-add-canine-reg>+ Registration</button>' +
      '<h4>Earned titles</h4><div data-canine-title-list>' + meta.titles.map(titleRow).join("") + '</div>' +
      '<button type="button" class="button button-ghost button-small" data-add-canine-title>+ Title</button></section>';
  }
  function bindEditor(form, speciesSelect) {
    const panel = form?.querySelector('[data-canine-panel]');
    if (!panel) return;
    const toggle = () => {
      const active = isDog(speciesSelect?.value);
      panel.hidden = !active;
      panel.classList.toggle("hidden", !active);
      panel.querySelectorAll('input,select,textarea,button').forEach(control => control.disabled = !active);
    };
    speciesSelect?.addEventListener("change", toggle);
    panel.addEventListener("click", (event) => {
      const action = event.target.closest('[data-add-canine-reg],[data-add-canine-title],[data-remove-canine-row]');
      if (!action) return;
      if (action.hasAttribute("data-remove-canine-row")) action.closest(".canine-entry")?.remove();
      else if (action.hasAttribute("data-add-canine-reg")) {
        const list = panel.querySelector('[data-canine-reg-list]');
        if (list.children.length < MAX_REGISTRATIONS)
          list.insertAdjacentHTML("beforeend", regRow({id:"reg-" + Date.now() + "-" + list.children.length},list.children.length));
      } else {
        const list = panel.querySelector('[data-canine-title-list]');
        if (list.children.length < MAX_TITLES)
          list.insertAdjacentHTML("beforeend", titleRow({id:"title-" + Date.now() + "-" + list.children.length},list.children.length));
      }
    });
    toggle();
  }
  function readEditor(form, previous = {}) {
    const panel = form?.querySelector('[data-canine-panel]');
    if (!panel || panel.hidden) return normalize(previous);
    const field = (row, attribute, key) => trim(row.querySelector('[' + attribute + '="' + key + '"]')?.value, 500);
    const registrations = [...panel.querySelectorAll('[data-canine-reg-row]')].map(row => {
      const result = {};
      for (const key of ["id","registry","number","registrationType","status","source","evidenceNote"])
        result[key] = field(row, "data-reg-field", key);
      return result;
    });
    const titles = [...panel.querySelectorAll('[data-canine-title-row]')].map(row => {
      const result = {};
      for (const key of ["id","organization","abbreviation","fullLabel","placement","displayOrder","earnedOn","source","evidenceNote"])
        result[key] = field(row, "data-title-field", key);
      return result;
    });
    return validate({
      callName: panel.querySelector('[data-canine-call-name]')?.value,
      registeredName: panel.querySelector('[data-canine-registered-name]')?.value,
      registrations, titles, preferredRegistrationId: previous?.preferredRegistrationId
    });
  }
  return Object.freeze({ VERSION, isDog, normalize, validate, displayName, preferredRegistration, editorHtml, bindEditor, readEditor });
});
