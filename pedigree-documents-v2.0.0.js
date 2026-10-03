(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborPedigreeDocuments = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const VERSION = "2.0.0-a4";
  const DOCUMENT_TYPES = Object.freeze(["pedigree", "birthCertificate"]);
  const DEFAULT_STORE = Object.freeze({
    templates: Object.freeze([]),
    defaults: Object.freeze({ pedigree: "", birthCertificate: "" }),
    branding: Object.freeze({
      rabbitryName: "",
      rabbitryText: "",
      logoData: "",
      logoFileName: "",
      accent: "#2e7d7b",
      website: "",
      social: "",
      contact: Object.freeze({
        includeEmail: false,
        email: "",
        includePhone: false,
        phone: "",
        includeAddress: false,
        address: ""
      })
    })
  });

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

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function safeConfig(value) {
    const customization = root?.HerdHarborPedigreeCustomization;
    if (customization?.normalize) return customization.normalize(value || {});
    const input = value && typeof value === "object" ? value : {};
    return clone(input);
  }

  function normalizeTemplate(value) {
    if (!value || typeof value !== "object") return null;
    const id = clean(value.id);
    const name = clean(value.name);
    if (!id || !name) return null;
    return {
      id,
      name,
      config: safeConfig(value.config || {}),
      createdAt: clean(value.createdAt),
      updatedAt: clean(value.updatedAt)
    };
  }

  function normalizeStore(value) {
    const input = value && typeof value === "object" ? value : {};
    const templates = [];
    const ids = new Set();
    for (const raw of Array.isArray(input.templates) ? input.templates : []) {
      const template = normalizeTemplate(raw);
      if (!template || ids.has(template.id)) continue;
      ids.add(template.id);
      templates.push(template);
    }
    const defaults = {
      pedigree: clean(input.defaults?.pedigree),
      birthCertificate: clean(input.defaults?.birthCertificate)
    };
    for (const type of DOCUMENT_TYPES) {
      if (defaults[type] && !ids.has(defaults[type])) defaults[type] = "";
    }
    return {
      templates,
      defaults,
      branding: {
        rabbitryName: clean(input.branding?.rabbitryName),
        rabbitryText: clean(input.branding?.rabbitryText),
        logoData: clean(input.branding?.logoData),
        logoFileName: clean(input.branding?.logoFileName),
        accent: /^#[0-9a-f]{6}$/i.test(clean(input.branding?.accent)) ? clean(input.branding.accent) : "#2e7d7b",
        website: clean(input.branding?.website),
        social: clean(input.branding?.social),
        contact: {
          includeEmail: input.branding?.contact?.includeEmail === true,
          email: clean(input.branding?.contact?.email),
          includePhone: input.branding?.contact?.includePhone === true,
          phone: clean(input.branding?.contact?.phone),
          includeAddress: input.branding?.contact?.includeAddress === true,
          address: clean(input.branding?.contact?.address)
        }
      }
    };
  }

  function idFactory() {
    if (root?.crypto?.randomUUID) return root.crypto.randomUUID();
    return `pedigree-template-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function saveTemplate(store, name, config, options = {}) {
    const next = normalizeStore(store);
    const templateName = clean(name);
    if (!templateName) throw new Error("Template name is required.");
    const id = clean(options.id) || idFactory();
    if (next.templates.some((template) => template.id === id)) throw new Error("Template id already exists.");
    const now = clean(options.now) || nowIso();
    next.templates.push({
      id,
      name: templateName,
      config: safeConfig(config),
      createdAt: now,
      updatedAt: now
    });
    return next;
  }

  function renameTemplate(store, id, name, now = "") {
    const next = normalizeStore(store);
    const templateName = clean(name);
    if (!templateName) throw new Error("Template name is required.");
    const template = next.templates.find((item) => item.id === clean(id));
    if (!template) throw new Error("Template was not found.");
    template.name = templateName;
    template.updatedAt = clean(now) || nowIso();
    return next;
  }

  function duplicateTemplate(store, id, options = {}) {
    const current = normalizeStore(store);
    const source = current.templates.find((item) => item.id === clean(id));
    if (!source) throw new Error("Template was not found.");
    const name = clean(options.name) || `${source.name} Copy`;
    return saveTemplate(current, name, source.config, {
      id: clean(options.id),
      now: clean(options.now)
    });
  }

  function deleteTemplate(store, id) {
    const next = normalizeStore(store);
    const wanted = clean(id);
    next.templates = next.templates.filter((item) => item.id !== wanted);
    for (const type of DOCUMENT_TYPES) {
      if (next.defaults[type] === wanted) next.defaults[type] = "";
    }
    return next;
  }

  function setDefaultTemplate(store, documentType, templateId) {
    const next = normalizeStore(store);
    const type = clean(documentType);
    if (!DOCUMENT_TYPES.includes(type)) throw new Error("Unknown document type.");
    const id = clean(templateId);
    if (id && !next.templates.some((item) => item.id === id)) throw new Error("Default template was not found.");
    next.defaults[type] = id;
    return next;
  }

  function updateBranding(store, branding = {}) {
    const next = normalizeStore(store);
    next.branding = {
      ...next.branding,
      ...(Object.prototype.hasOwnProperty.call(branding, "rabbitryName") ? { rabbitryName: clean(branding.rabbitryName) } : {}),
      ...(Object.prototype.hasOwnProperty.call(branding, "rabbitryText") ? { rabbitryText: clean(branding.rabbitryText) } : {}),
      ...(Object.prototype.hasOwnProperty.call(branding, "logoData") ? { logoData: clean(branding.logoData) } : {}),
      ...(Object.prototype.hasOwnProperty.call(branding, "logoFileName") ? { logoFileName: clean(branding.logoFileName) } : {}),
      ...(Object.prototype.hasOwnProperty.call(branding, "accent") && /^#[0-9a-f]{6}$/i.test(clean(branding.accent)) ? { accent: clean(branding.accent) } : {}),
      ...(Object.prototype.hasOwnProperty.call(branding, "website") ? { website: clean(branding.website) } : {}),
      ...(Object.prototype.hasOwnProperty.call(branding, "social") ? { social: clean(branding.social) } : {}),
      ...(branding.contact && typeof branding.contact === "object" ? {
        contact: {
          ...next.branding.contact,
          ...(Object.prototype.hasOwnProperty.call(branding.contact, "includeEmail") ? { includeEmail: branding.contact.includeEmail === true } : {}),
          ...(Object.prototype.hasOwnProperty.call(branding.contact, "email") ? { email: clean(branding.contact.email) } : {}),
          ...(Object.prototype.hasOwnProperty.call(branding.contact, "includePhone") ? { includePhone: branding.contact.includePhone === true } : {}),
          ...(Object.prototype.hasOwnProperty.call(branding.contact, "phone") ? { phone: clean(branding.contact.phone) } : {}),
          ...(Object.prototype.hasOwnProperty.call(branding.contact, "includeAddress") ? { includeAddress: branding.contact.includeAddress === true } : {}),
          ...(Object.prototype.hasOwnProperty.call(branding.contact, "address") ? { address: clean(branding.contact.address) } : {})
        }
      } : {})
    };
    return next;
  }

  function resolveBranding(store, profile = {}) {
    const normalized = normalizeStore(store);
    return {
      rabbitryName: normalized.branding.rabbitryName || clean(profile?.operationName) || "HerdHarbor Breeder",
      rabbitryText: normalized.branding.rabbitryText,
      logoData: normalized.branding.logoData || clean(profile?.logoData),
      logoFileName: normalized.branding.logoFileName,
      accent: normalized.branding.accent,
      website: normalized.branding.website,
      social: normalized.branding.social,
      contact: {
        email: normalized.branding.contact.includeEmail ? normalized.branding.contact.email : "",
        phone: normalized.branding.contact.includePhone ? normalized.branding.contact.phone : "",
        address: normalized.branding.contact.includeAddress ? normalized.branding.contact.address : ""
      }
    };
  }

  function defaultTemplate(store, documentType) {
    const normalized = normalizeStore(store);
    const type = DOCUMENT_TYPES.includes(documentType) ? documentType : "pedigree";
    const id = normalized.defaults[type];
    return normalized.templates.find((item) => item.id === id) || null;
  }

  function resolveDocumentContext(store, documentType, profile = {}, fallbackConfig = {}) {
    const normalized = normalizeStore(store);
    const template = defaultTemplate(normalized, documentType);
    return {
      documentType: DOCUMENT_TYPES.includes(documentType) ? documentType : "pedigree",
      template,
      config: safeConfig(template?.config || fallbackConfig),
      branding: resolveBranding(normalized, profile)
    };
  }

  function readCanonicalStore() {
    const state = root?.HerdHarborApp?.getState?.();
    return normalizeStore(state?.settings?.pedigreeDocuments);
  }

  function persistCanonicalStore(store, message = "Pedigree document settings updated.") {
    const app = root?.HerdHarborApp;
    const current = app?.getState?.();
    if (!current || typeof current !== "object" || typeof app?.commitState !== "function") return false;
    const nextState = clone(current);
    nextState.settings = nextState.settings && typeof nextState.settings === "object" ? nextState.settings : {};
    nextState.settings.pedigreeDocuments = normalizeStore(store);
    return app.commitState(nextState, message);
  }

  function currentCustomization() {
    const customization = root?.HerdHarborPedigreeCustomization;
    return customization?.loadPreferences?.(root.localStorage) || customization?.templateConfig?.("Classic") || {};
  }

  function applyTemplate(template) {
    const customization = root?.HerdHarborPedigreeCustomization;
    if (!template || !customization?.savePreferences) return false;
    customization.savePreferences(root.localStorage, template.config);
    try {
      root.dispatchEvent(new CustomEvent("herdharbor:pedigree-settings-refresh", {
        detail: { templateId: template.id }
      }));
    } catch {}
    return true;
  }

  function templateOptions(store, selected = "") {
    return ['<option value="">Use current customization</option>']
      .concat(store.templates.map((template) =>
        `<option value="${escapeHtml(template.id)}" ${template.id === selected ? "selected" : ""}>${escapeHtml(template.name)}</option>`
      )).join("");
  }

  function renderTemplateRows(store) {
    if (!store.templates.length) return '<p class="muted">No saved templates yet.</p>';
    return `<div class="hh-pedigree-template-list">${store.templates.map((template) => `
      <article class="hh-pedigree-template-row" data-template-id="${escapeHtml(template.id)}">
        <div><strong>${escapeHtml(template.name)}</strong><small>${escapeHtml(template.config.generations || 4)} generations · ${escapeHtml(template.config.style || "classic")}</small></div>
        <div class="hh-pedigree-template-actions">
          <button type="button" class="button button-ghost button-small" data-template-action="apply">Apply</button>
          <button type="button" class="button button-ghost button-small" data-template-action="rename">Rename</button>
          <button type="button" class="button button-ghost button-small" data-template-action="duplicate">Duplicate</button>
          <button type="button" class="button button-ghost button-small" data-template-action="delete">Delete</button>
        </div>
      </article>`).join("")}</div>`;
  }

  function managerHtml(store, profile = {}) {
    const normalized = normalizeStore(store);
    const branding = resolveBranding(normalized, profile);
    return `<section class="hh-pedigree-document-manager" data-hh-pedigree-document-manager>
      <h4>Saved templates</h4>
      <p class="muted">Save the current pedigree setup, reuse it later, or make it the default for a document type.</p>
      <div class="hh-pedigree-template-save">
        <input type="text" id="hh-pedigree-template-name" maxlength="60" placeholder="Template name">
        <button type="button" class="button button-primary button-small" id="hh-pedigree-template-save">Save current</button>
      </div>
      <div data-hh-template-rows>${renderTemplateRows(normalized)}</div>
      <div class="form-grid two hh-pedigree-defaults">
        <label>Default pedigree template<select id="hh-default-pedigree-template">${templateOptions(normalized, normalized.defaults.pedigree)}</select></label>
        <label>Default birth certificate template<select id="hh-default-birth-template">${templateOptions(normalized, normalized.defaults.birthCertificate)}</select></label>
      </div>
      <h4>Document branding</h4>
      <div class="form-grid two">
        <label>Rabbitry / operation name<input id="hh-pedigree-brand-name" value="${escapeHtml(normalized.branding.rabbitryName)}" placeholder="${escapeHtml(profile?.operationName || "Rabbitry name")}"></label>
        <label>Branding line<input id="hh-pedigree-brand-text" value="${escapeHtml(normalized.branding.rabbitryText)}" maxlength="120" placeholder="Optional subtitle"></label>
        <label>Accent color<input id="hh-pedigree-brand-accent" type="color" value="${escapeHtml(normalized.branding.accent)}"></label>
        <label>Website<input id="hh-pedigree-brand-website" value="${escapeHtml(normalized.branding.website)}" placeholder="Optional website"></label>
        <label>Social information<input id="hh-pedigree-brand-social" value="${escapeHtml(normalized.branding.social)}" placeholder="Optional social handle or page"></label>
      </div>
      <div class="hh-pedigree-contact-options">
        <p class="muted"><strong>Optional private/printed contact information</strong><br>Nothing from your account is inserted automatically. Enter a value and enable it only if you want it printed.</p>
        <label class="hh-pedigree-contact-row"><input type="checkbox" id="hh-pedigree-brand-email-on" ${normalized.branding.contact.includeEmail ? "checked" : ""}><span>Email</span><input id="hh-pedigree-brand-email" value="${escapeHtml(normalized.branding.contact.email)}" placeholder="Email to print"></label>
        <label class="hh-pedigree-contact-row"><input type="checkbox" id="hh-pedigree-brand-phone-on" ${normalized.branding.contact.includePhone ? "checked" : ""}><span>Phone</span><input id="hh-pedigree-brand-phone" value="${escapeHtml(normalized.branding.contact.phone)}" placeholder="Phone to print"></label>
        <label class="hh-pedigree-contact-row"><input type="checkbox" id="hh-pedigree-brand-address-on" ${normalized.branding.contact.includeAddress ? "checked" : ""}><span>Address</span><input id="hh-pedigree-brand-address" value="${escapeHtml(normalized.branding.contact.address)}" placeholder="Address to print"></label>
      </div>
      <div class="hh-pedigree-brand-logo">
        <div class="hh-pedigree-brand-logo-preview">${branding.logoData ? `<img src="${escapeHtml(branding.logoData)}" alt="">` : '<span>No logo</span>'}</div>
        <div>
          <label class="button button-ghost button-small">Upload document logo<input id="hh-pedigree-brand-logo-input" type="file" accept="image/jpeg,image/png,image/webp" hidden></label>
          <button type="button" class="button button-ghost button-small" id="hh-pedigree-brand-logo-clear">Use operation logo</button>
          <small>Document branding uses the operation logo by default. A custom logo overrides it only for breeder documents.</small>
        </div>
      </div>
    </section>`;
  }

  function ensureSettingsUI(doc) {
    const settingsCard = doc?.querySelector?.("#hh-pedigree-settings");
    if (!settingsCard || settingsCard.querySelector("[data-hh-pedigree-document-manager]")) return false;
    const state = root?.HerdHarborApp?.getState?.() || {};
    let store = readCanonicalStore();
    const host = doc.createElement("div");
    host.innerHTML = managerHtml(store, state.profile || {});
    const manager = host.firstElementChild;
    settingsCard.appendChild(manager);

    const rerenderRows = () => {
      const rowHost = manager.querySelector("[data-hh-template-rows]");
      if (rowHost) rowHost.innerHTML = renderTemplateRows(store);
      const pedigreeDefault = manager.querySelector("#hh-default-pedigree-template");
      const birthDefault = manager.querySelector("#hh-default-birth-template");
      if (pedigreeDefault) pedigreeDefault.innerHTML = templateOptions(store, store.defaults.pedigree);
      if (birthDefault) birthDefault.innerHTML = templateOptions(store, store.defaults.birthCertificate);
    };

    manager.querySelector("#hh-pedigree-template-save")?.addEventListener("click", () => {
      const input = manager.querySelector("#hh-pedigree-template-name");
      try {
        store = saveTemplate(store, input?.value, currentCustomization());
        if (!persistCanonicalStore(store, "Pedigree template saved.")) return;
        if (input) input.value = "";
        rerenderRows();
      } catch (error) {
        root?.HerdHarborApp?.toast?.(error?.message || "Template could not be saved.", "error");
      }
    });

    manager.addEventListener("click", (event) => {
      const button = event.target?.closest?.("[data-template-action]");
      if (!button) return;
      const row = button.closest("[data-template-id]");
      const id = clean(row?.dataset?.templateId);
      const template = store.templates.find((item) => item.id === id);
      if (!template) return;
      try {
        const action = button.dataset.templateAction;
        if (action === "apply") {
          applyTemplate(template);
          return;
        }
        if (action === "rename") {
          const name = root.prompt?.("Rename pedigree template", template.name);
          if (name == null) return;
          store = renameTemplate(store, id, name);
        } else if (action === "duplicate") {
          store = duplicateTemplate(store, id);
        } else if (action === "delete") {
          if (root.confirm && !root.confirm(`Delete pedigree template "${template.name}"?`)) return;
          store = deleteTemplate(store, id);
        }
        persistCanonicalStore(store, "Pedigree templates updated.");
        rerenderRows();
      } catch (error) {
        root?.HerdHarborApp?.toast?.(error?.message || "Template could not be updated.", "error");
      }
    });

    manager.querySelector("#hh-default-pedigree-template")?.addEventListener("change", (event) => {
      store = setDefaultTemplate(store, "pedigree", event.currentTarget.value);
      persistCanonicalStore(store, "Default pedigree template updated.");
    });
    manager.querySelector("#hh-default-birth-template")?.addEventListener("change", (event) => {
      store = setDefaultTemplate(store, "birthCertificate", event.currentTarget.value);
      persistCanonicalStore(store, "Default birth certificate template updated.");
    });

    const persistBrandText = () => {
      store = updateBranding(store, {
        rabbitryName: manager.querySelector("#hh-pedigree-brand-name")?.value,
        rabbitryText: manager.querySelector("#hh-pedigree-brand-text")?.value,
        accent: manager.querySelector("#hh-pedigree-brand-accent")?.value,
        website: manager.querySelector("#hh-pedigree-brand-website")?.value,
        social: manager.querySelector("#hh-pedigree-brand-social")?.value,
        contact: {
          includeEmail: manager.querySelector("#hh-pedigree-brand-email-on")?.checked === true,
          email: manager.querySelector("#hh-pedigree-brand-email")?.value,
          includePhone: manager.querySelector("#hh-pedigree-brand-phone-on")?.checked === true,
          phone: manager.querySelector("#hh-pedigree-brand-phone")?.value,
          includeAddress: manager.querySelector("#hh-pedigree-brand-address-on")?.checked === true,
          address: manager.querySelector("#hh-pedigree-brand-address")?.value
        }
      });
      persistCanonicalStore(store, "Pedigree branding updated.");
      root.dispatchEvent(new CustomEvent("herdharbor:pedigree-branding-change", {
        detail: { branding: resolveBranding(store, state.profile || {}) }
      }));
    };
    [
      "#hh-pedigree-brand-name", "#hh-pedigree-brand-text", "#hh-pedigree-brand-accent",
      "#hh-pedigree-brand-website", "#hh-pedigree-brand-social",
      "#hh-pedigree-brand-email-on", "#hh-pedigree-brand-email",
      "#hh-pedigree-brand-phone-on", "#hh-pedigree-brand-phone",
      "#hh-pedigree-brand-address-on", "#hh-pedigree-brand-address"
    ].forEach((selector) => manager.querySelector(selector)?.addEventListener("change", persistBrandText));

    manager.querySelector("#hh-pedigree-brand-logo-clear")?.addEventListener("click", () => {
      store = updateBranding(store, { logoData: "", logoFileName: "" });
      persistCanonicalStore(store, "Document logo reset to operation logo.");
      root.dispatchEvent(new CustomEvent("herdharbor:pedigree-settings-refresh"));
    });

    manager.querySelector("#hh-pedigree-brand-logo-input")?.addEventListener("change", async (event) => {
      const file = event.currentTarget.files?.[0];
      if (!file) return;
      try {
        const prepared = await root?.HerdHarborApp?.prepareDocumentImage?.(file);
        if (!prepared?.dataUrl) throw new Error("The logo could not be prepared.");
        store = updateBranding(store, { logoData: prepared.dataUrl, logoFileName: prepared.fileName || file.name });
        persistCanonicalStore(store, "Document logo updated.");
        root.dispatchEvent(new CustomEvent("herdharbor:pedigree-settings-refresh"));
      } catch (error) {
        root?.HerdHarborApp?.toast?.(error?.message || "The logo could not be saved.", "error");
      } finally {
        event.currentTarget.value = "";
      }
    });

    return true;
  }

  return Object.freeze({
    VERSION,
    DOCUMENT_TYPES,
    DEFAULT_STORE,
    normalizeStore,
    saveTemplate,
    renameTemplate,
    duplicateTemplate,
    deleteTemplate,
    setDefaultTemplate,
    updateBranding,
    resolveBranding,
    defaultTemplate,
    resolveDocumentContext,
    readCanonicalStore,
    persistCanonicalStore,
    currentCustomization,
    applyTemplate,
    managerHtml,
    ensureSettingsUI
  });
});
