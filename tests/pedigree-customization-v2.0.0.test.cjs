"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Customization = require("../pedigree-customization-v2.0.0.js");

function storage(initial = null) {
  const map = new Map();
  if (initial != null) map.set(Customization.PREF_KEY, JSON.stringify(initial));
  return {
    getItem: (key) => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    snapshot: () => JSON.parse(map.get(Customization.PREF_KEY) || "{}")
  };
}

test("A3 exposes the five required starter templates", () => {
  assert.deepEqual(Object.keys(Customization.TEMPLATES), [
    "Classic", "Minimal", "Professional", "Buyer", "Rabbitry Branded"
  ]);
});

test("generation customization is limited to 3, 4, or 5 generations", () => {
  assert.deepEqual(Customization.GENERATION_OPTIONS, [3, 4, 5]);
  assert.equal(Customization.normalize({ template: "Classic", generations: 5 }).generations, 5);
  assert.equal(Customization.normalize({ template: "Classic", generations: 2 }).generations, 4);
  assert.equal(Customization.normalize({ template: "Minimal", generations: 99 }).generations, 3);
});

test("root and ancestor fields normalize independently and reject unknown field names", () => {
  const value = Customization.normalize({
    template: "Classic",
    rootFields: ["name", "weight", "madeUp"],
    ancestorFields: ["name", "gcNumber", "notReal"]
  });
  assert.deepEqual(value.rootFields, ["name", "weight"]);
  assert.deepEqual(value.ancestorFields, ["name", "gcNumber"]);
});

test("legacy pedigree appearance preferences migrate through the existing storage key", () => {
  const store = storage({ sexColors: false, photoMode: "visual", printPhotos: false });
  const value = Customization.loadPreferences(store);
  assert.equal(Customization.PREF_KEY, "herdharbor_pedigree_visuals_v1");
  assert.equal(value.photos, true);
  assert.equal(value.template, "Classic");
});

test("saving customization preserves legacy preference data instead of creating a parallel store", () => {
  const store = storage({ sexColors: false, unrelated: "keep" });
  const saved = Customization.savePreferences(store, {
    template: "Buyer",
    generations: 3,
    photos: true,
    density: "comfortable"
  });
  const raw = store.snapshot();
  assert.equal(saved.template, "Buyer");
  assert.equal(raw.sexColors, false);
  assert.equal(raw.unrelated, "keep");
  assert.equal(raw.photoMode, "compact");
  assert.equal(raw.printPhotos, true);
  assert.equal(raw.customization.template, "Buyer");
});

test("renderer options keep photos explicit and do not invent ancestry", () => {
  const off = Customization.rendererOptions({ template: "Classic", photos: false });
  assert.ok(!off.rootFields.includes("photo"));
  assert.ok(!off.ancestorFields.includes("photo"));

  const on = Customization.rendererOptions({ template: "Rabbitry Branded", photos: true });
  assert.ok(on.rootFields.includes("photo"));
  assert.ok(on.ancestorFields.includes("photo"));
  assert.equal(on.unknownDisplay, "label");
});

test("controls include generation, root/ancestor fields, photos, unknown display, density, layout, style, and templates", () => {
  const html = Customization.controlsHtml(Customization.templateConfig("Professional"));
  for (const token of [
    'name="template"', 'name="generations"', 'name="rootFields"', 'name="ancestorFields"',
    'name="photos"', 'name="unknownDisplay"', 'name="density"', 'name="layout"', 'name="style"'
  ]) assert.ok(html.includes(token), token);
  for (const template of Object.keys(Customization.TEMPLATES)) assert.ok(html.includes(template), template);
});
