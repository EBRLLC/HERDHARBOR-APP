"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Engine = require("../pedigree-engine-v2.0.0.js");

const appRuntime = fs.readFileSync(path.join(__dirname, "..", "herdharbor-app-runtime.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const worker = fs.readFileSync(path.join(__dirname, "..", "service-worker.js"), "utf8");

const engineScriptIndex = html.indexOf('pedigree-engine-v2.0.0.js?v=1');
const animalRuntimeIndex = html.indexOf('animal-profile-runtime-v1.8.3.js?v=1');
const appRuntimeIndex = html.indexOf('herdharbor-app-runtime.js?v=4');
assert.ok(engineScriptIndex >= 0, "the canonical pedigree engine is loaded by the application shell");
assert.ok(animalRuntimeIndex > engineScriptIndex, "the engine loads before the animal profile runtime");
assert.ok(appRuntimeIndex > engineScriptIndex, "the engine loads before the main application runtime");
assert.match(worker, /\.\/pedigree-engine-v2\.0\.0\.js\?v=1/);
assert.match(worker, /path\.endsWith\("pedigree-engine-v2\.0\.0\.js"\)/);

assert.match(
  appRuntime,
  /HerdHarborPedigreeEngine/,
  "the pedigree builder routes ancestry traversal through the canonical engine"
);
assert.match(
  appRuntime,
  /engine\.legacyAncestorIds\(\{[\s\S]*animals: state\.animals[\s\S]*subjectId[\s\S]*generations: 4/,
  "the existing four-generation builder uses the canonical engine with current animal records"
);

const animals = [
  { id: "child", sireId: "sire", damId: "dam" },
  { id: "sire", sireId: "shared-grandsire", damId: "sire-dam" },
  { id: "dam", sireId: "dam-sire", damId: "shared-grandsire" },
  { id: "shared-grandsire", sireId: "great-sire", damId: "great-dam" },
  { id: "sire-dam", sireId: "", damId: "" },
  { id: "dam-sire", sireId: "", damId: "" },
  { id: "great-sire", sireId: "", damId: "" },
  { id: "great-dam", sireId: "", damId: "" }
];

const ancestry = Engine.legacyAncestorIds({ animals, subjectId: "child", generations: 4 });

assert.equal(ancestry.sire, "sire");
assert.equal(ancestry.dam, "dam");
assert.equal(ancestry.sireSire, "shared-grandsire");
assert.equal(ancestry.damDam, "shared-grandsire", "linebred ancestors remain in both branches");
assert.equal(ancestry.sireSireSire, "great-sire");
assert.equal(ancestry.damDamDam, "great-dam");

const cyclic = Engine.buildGraph({
  animals: [
    { id: "child", sireId: "sire", damId: "" },
    { id: "sire", sireId: "child", damId: "" }
  ],
  subjectId: "child",
  generations: 4
});
assert.equal(cyclic.byKey.sireSire.status, "cycle", "cycles stop at the repeated animal");
assert.equal(cyclic.ancestorIds.sireSire, undefined);

assert.match(
  appRuntime,
  /if \(!ownerId \|\| !parentId\) return;/,
  "saving a pedigree does not erase an existing parent link with a blank value"
);

console.log("canonical pedigree inheritance tests passed");
