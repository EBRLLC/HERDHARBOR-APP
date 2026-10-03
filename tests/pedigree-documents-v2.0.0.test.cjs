"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

global.HerdHarborPedigreeCustomization = {
  normalize: (value) => ({ ...value, generations: Number(value?.generations || 4) })
};
const Docs = require("../pedigree-documents-v2.0.0.js");

function baseStore() {
  return Docs.normalizeStore({});
}

test("saved templates support save rename duplicate and delete without mutating the input", () => {
  const original = baseStore();
  const saved = Docs.saveTemplate(original, "Sale Pedigree", { generations: 4, style: "classic" }, { id: "t1", now: "2026-10-03T10:00:00Z" });
  assert.equal(original.templates.length, 0);
  assert.equal(saved.templates.length, 1);
  assert.equal(saved.templates[0].id, "t1");

  const renamed = Docs.renameTemplate(saved, "t1", "Show Pedigree", "2026-10-03T10:01:00Z");
  assert.equal(renamed.templates[0].name, "Show Pedigree");

  const duplicated = Docs.duplicateTemplate(renamed, "t1", { id: "t2", name: "Show Pedigree Copy", now: "2026-10-03T10:02:00Z" });
  assert.deepEqual(duplicated.templates.map((item) => item.id), ["t1", "t2"]);
  assert.deepEqual(duplicated.templates[1].config, duplicated.templates[0].config);

  const deleted = Docs.deleteTemplate(duplicated, "t1");
  assert.deepEqual(deleted.templates.map((item) => item.id), ["t2"]);
});

test("defaults are independent by document type and clear when a template is deleted", () => {
  let store = Docs.saveTemplate(baseStore(), "A", { generations: 3 }, { id: "a", now: "x" });
  store = Docs.saveTemplate(store, "B", { generations: 5 }, { id: "b", now: "x" });
  store = Docs.setDefaultTemplate(store, "pedigree", "a");
  store = Docs.setDefaultTemplate(store, "birthCertificate", "b");
  assert.equal(Docs.defaultTemplate(store, "pedigree").id, "a");
  assert.equal(Docs.defaultTemplate(store, "birthCertificate").id, "b");
  store = Docs.deleteTemplate(store, "a");
  assert.equal(store.defaults.pedigree, "");
  assert.equal(store.defaults.birthCertificate, "b");
});

test("branding uses a custom document logo when set and otherwise falls back to operation profile", () => {
  const profile = { operationName: "Waggin Tails", logoData: "data:image/png;base64,OP" };
  const fallback = Docs.resolveBranding(baseStore(), profile);
  assert.equal(fallback.rabbitryName, "Waggin Tails");
  assert.equal(fallback.logoData, "data:image/png;base64,OP");

  const custom = Docs.resolveBranding(Docs.updateBranding(baseStore(), {
    rabbitryName: "Bluegrass Rabbitry",
    rabbitryText: "Raised with care",
    logoData: "data:image/png;base64,CUSTOM",
    logoFileName: "logo.jpg"
  }), profile);
  assert.equal(custom.rabbitryName, "Bluegrass Rabbitry");
  assert.equal(custom.rabbitryText, "Raised with care");
  assert.equal(custom.logoData, "data:image/png;base64,CUSTOM");
});

test("normalization removes dangling default template ids and duplicate template ids", () => {
  const store = Docs.normalizeStore({
    templates: [
      { id: "same", name: "One", config: { generations: 4 } },
      { id: "same", name: "Two", config: { generations: 5 } }
    ],
    defaults: { pedigree: "missing", birthCertificate: "same" }
  });
  assert.equal(store.templates.length, 1);
  assert.equal(store.defaults.pedigree, "");
  assert.equal(store.defaults.birthCertificate, "same");
});

test("settings manager includes template CRUD defaults branding and logo upload controls", () => {
  const store = Docs.saveTemplate(baseStore(), "Classic Saved", { generations: 4 }, { id: "classic", now: "x" });
  const html = Docs.managerHtml(store, { operationName: "Rabbitry" });
  for (const token of [
    "Save current", "Apply", "Rename", "Duplicate", "Delete",
    "Default birth certificate template",
    "Rabbitry / operation name", "Branding line", "Upload document logo", "Use operation logo"
  ]) assert.ok(html.includes(token), token);
  assert.ok(html.includes("Standard always remains the default print pedigree"));
  assert.ok(!html.includes("Default pedigree template"));
});


test("document context feeds a saved default template and branding to the shared renderer", () => {
  let store = Docs.saveTemplate(baseStore(), "Default", { generations: 5, style: "professional" }, { id: "default", now: "x" });
  store = Docs.setDefaultTemplate(store, "pedigree", "default");
  store = Docs.updateBranding(store, { rabbitryName: "Bluegrass Rabbitry", rabbitryText: "Quality stock", logoData: "data:image/png;base64,LOGO" });
  const context = Docs.resolveDocumentContext(store, "pedigree", { operationName: "Fallback" }, { generations: 3 });
  assert.equal(context.template.id, "default");
  assert.equal(context.config.generations, 5);
  assert.equal(context.branding.rabbitryName, "Bluegrass Rabbitry");
  assert.equal(context.branding.logoData, "data:image/png;base64,LOGO");
});

test("A4 shell loads and caches saved-template/branding assets", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const root = path.resolve(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
  const customizationIndex = html.indexOf("pedigree-customization-v2.0.0.js?v=1");
  const documentsIndex = html.indexOf("pedigree-documents-v2.0.0.js?v=1");
  const rendererIndex = html.indexOf("pedigree-renderer-v2.0.0.js?v=1");
  assert.ok(customizationIndex >= 0 && documentsIndex > customizationIndex && rendererIndex > documentsIndex);
  assert.match(html, /pedigree-documents-v2\.0\.0\.css\?v=1/);
  assert.match(worker, /\.\/pedigree-documents-v2\.0\.0\.css\?v=1/);
  assert.match(worker, /\.\/pedigree-documents-v2\.0\.0\.js\?v=1/);
  assert.match(worker, /"\/pedigree-documents-v2\.0\.0\.js"/);
});

test("canonical app settings own saved templates and expose compressed document image preparation", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(path.resolve(__dirname, "..", "herdharbor-app-runtime.js"), "utf8");
  assert.match(source, /pedigreeDocuments:\s*\{[\s\S]*templates:\s*\[\][\s\S]*birthCertificate/);
  assert.match(source, /prepareDocumentImage:\s*\(file\) => prepareProfileImage/);
});


test("contact information is excluded unless explicitly enabled and is never copied from account profile", () => {
  const profile = {
    operationName: "Profile Rabbitry",
    logoData: "data:image/png;base64,PROFILE",
    email: "private@example.com",
    phone: "555-0000",
    address: "Private Address"
  };
  let store = Docs.updateBranding(baseStore(), {
    website: "https://example.test",
    social: "@rabbitry",
    accent: "#123456",
    contact: {
      email: "print@example.com",
      phone: "555-1234",
      address: "Printed Address"
    }
  });
  let branding = Docs.resolveBranding(store, profile);
  assert.equal(branding.website, "https://example.test");
  assert.equal(branding.social, "@rabbitry");
  assert.equal(branding.accent, "#123456");
  assert.deepEqual(branding.contact, { email: "", phone: "", address: "" });
  assert.notEqual(branding.contact.email, profile.email);

  store = Docs.updateBranding(store, {
    contact: {
      includeEmail: true,
      includePhone: true,
      includeAddress: true
    }
  });
  branding = Docs.resolveBranding(store, profile);
  assert.deepEqual(branding.contact, {
    email: "print@example.com",
    phone: "555-1234",
    address: "Printed Address"
  });
});

test("branding manager includes accent website social and explicit contact opt-ins", () => {
  const html = Docs.managerHtml(baseStore(), { operationName: "Rabbitry", email: "account@example.com" });
  for (const token of [
    "Accent color", "Website", "Social information",
    "hh-pedigree-brand-email-on", "hh-pedigree-brand-phone-on", "hh-pedigree-brand-address-on",
    "Nothing from your account is inserted automatically"
  ]) assert.ok(html.includes(token), token);
  assert.ok(!html.includes('value="account@example.com"'));
});
