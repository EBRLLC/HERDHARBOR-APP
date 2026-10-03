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
    "Default pedigree template", "Default birth certificate template",
    "Rabbitry / operation name", "Branding line", "Upload document logo", "Use operation logo"
  ]) assert.ok(html.includes(token), token);
});
