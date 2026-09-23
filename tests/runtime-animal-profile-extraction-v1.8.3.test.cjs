"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const extractedSource = read("animal-profile-runtime-v1.8.3.js");
const runtimeSource = read("herdharbor-app-runtime.js");
const flowSource = read("flow-phase2-v1.8.2.js");
const routerSource = read("animal-action-router-v1.8.3.js");
const packageJson = JSON.parse(read("package.json"));
const extracted = require(path.join(root, "animal-profile-runtime-v1.8.3.js"));

function stubDeps(state) {
  const noop = () => {};
  const html = () => "";
  return {
    getState: () => state,
    getCurrentRoute: () => "animals",
    scheduleUiWork: (_key, work) => work?.(),
    $: () => null,
    $$: () => [],
    esc: (value) => String(value ?? ""),
    headerHtml: html,
    emptyState: html,
    animalVisualHtml: html,
    ageText: () => "",
    openPedigreeImport: noop,
    openModal: noop,
    closeModal: noop,
    field: html,
    selectField: html,
    breedComboboxField: html,
    selectAnimalField: html,
    textareaField: html,
    speciesIcon: () => "",
    breedOptionsFor: () => [],
    prepareProfileImage: async () => ({}),
    toast: noop,
    allowsAnimalTransition: () => true,
    uid: () => "animal-test",
    rememberBreed: noop,
    recordActivity: noop,
    saveState: () => true,
    renderCurrentView: noop,
    completeWorkflowTasks: noop,
    formatDate: (value) => String(value || ""),
    formatMoney: (value) => String(value || ""),
    detailField: html,
    navigate: noop,
    openPrintPedigreeForm: noop,
    ensureQrToolsReady: async () => true
  };
}

test("Animals/Profile domain has one extracted runtime owner", () => {
  assert.equal(extracted.VERSION, "1.8.3");
  assert.equal(typeof extracted.create, "function");
  assert.match(extractedSource, /root\.HerdHarborAnimalProfileRuntime = api/);
  assert.match(extractedSource, /function renderAnimals\(\)/);
  assert.match(extractedSource, /function renderAnimalResults\(\)/);
  assert.match(extractedSource, /function openAnimalForm\(id = ""\)/);
  assert.match(extractedSource, /function openAnimalDetail\(id\)/);
  assert.match(extractedSource, /function openAnimalQrCardForm\(/);
  assert.match(extractedSource, /function printAnimalQrCards\(/);
  assert.match(extractedSource, /function pedigreeRecordPreviewHtml\(/);
});

test("composition runtime delegates animal behavior instead of retaining a second implementation", () => {
  assert.match(runtimeSource, /function animalProfileRuntime\(\)/);
  assert.match(runtimeSource, /HerdHarborAnimalProfileRuntime\?\.create/);
  assert.match(runtimeSource, /function renderAnimals\(\) \{\s*return animalProfileRuntime\(\)\.renderAnimals\(\);\s*\}/);
  assert.match(runtimeSource, /function openAnimalForm\(id = ""\) \{\s*return animalProfileRuntime\(\)\.openAnimalForm\(id\);\s*\}/);
  assert.match(runtimeSource, /function openAnimalDetail\(id\) \{\s*return animalProfileRuntime\(\)\.openAnimalDetail\(id\);\s*\}/);
  assert.match(runtimeSource, /function pedigreeRecordPreviewHtml\(subject, record = null\) \{\s*return animalProfileRuntime\(\)\.pedigreeRecordPreviewHtml\(subject, record\);\s*\}/);
  assert.doesNotMatch(runtimeSource, /let animalView =/);
  assert.doesNotMatch(runtimeSource, /let qrToolActionPending =/);
  assert.doesNotMatch(runtimeSource, /function renderAnimalResults\(/);
  assert.doesNotMatch(runtimeSource, /function animalCardHtml\(/);
  assert.doesNotMatch(runtimeSource, /function animalDeepLink\(/);
  assert.doesNotMatch(runtimeSource, /function animalQrSvg\(/);
  assert.doesNotMatch(runtimeSource, /function qrCardCandidates\(/);
  assert.doesNotMatch(runtimeSource, /function printAnimalQrCards\(/);
});

test("extracted runtime uses injected canonical state and creates no parallel persistence store", () => {
  assert.match(extractedSource, /const stateNow = \(\) => deps\.getState\(\) \|\| \{\}/);
  assert.match(extractedSource, /liveState\.animals\.push\(newAnimal\)/);
  assert.match(extractedSource, /liveState\.animals = \(liveState\.animals \|\| \[\]\)\.filter/);
  assert.match(extractedSource, /deps\.saveState\("Animal added\."\)/);
  assert.match(extractedSource, /deps\.saveState\("Animal updated\."\)/);
  assert.match(extractedSource, /deps\.saveState\("Animal deleted\."\)/);
  assert.doesNotMatch(extractedSource, /localStorage|sessionStorage|indexedDB|STORAGE_KEY|herdharbor_pre_alpha_v1/);
  assert.doesNotMatch(extractedSource, /commitState\(/);
});

test("animal filter behavior remains search/species/sex/status compatible", () => {
  const state = {
    animals: [
      { id: "a1", name: "Daisy", species: "Rabbit", sex: "Female", status: "Active", breed: "Holland Lop", location: "A1" },
      { id: "a2", name: "Buckley", species: "Rabbit", sex: "Male", status: "Active", breed: "Holland Lop", location: "A2" },
      { id: "a3", name: "Maple", species: "Goat", sex: "Female", status: "Sold", breed: "Nigerian Dwarf", location: "Pasture" }
    ]
  };
  const api = extracted.create(stubDeps(state));
  assert.deepEqual(api.filterAnimals(state.animals, { search: "", species: "", sex: "", status: "Active" }).map((a) => a.id), ["a1", "a2"]);
  assert.deepEqual(api.filterAnimals(state.animals, { search: "daisy", species: "", sex: "", status: "" }).map((a) => a.id), ["a1"]);
  assert.deepEqual(api.filterAnimals(state.animals, { search: "holland", species: "Rabbit", sex: "Male", status: "Active" }).map((a) => a.id), ["a2"]);
  assert.deepEqual(api.filterAnimals(state.animals, { search: "pasture", species: "Goat", sex: "Female", status: "Sold" }).map((a) => a.id), ["a3"]);
});

test("animal create/edit/delete still pass through membership and integrity contracts", () => {
  assert.match(extractedSource, /deps\.allowsAnimalTransition\(liveState\.animals, nextAnimals\)/);
  assert.match(extractedSource, /deps\.allowsAnimalTransition\(liveState\.animals \|\| \[\], \[\.\.\.\(liveState\.animals \|\| \[\]\), newAnimal\]\)/);
  assert.match(extractedSource, /sale record\. Keep the animal for invoices, transfers, and buyer history/);
  assert.match(extractedSource, /deps\.completeWorkflowTasks\("breeding", breedingId\)/);
  assert.match(extractedSource, /liveState\.breedings = .*femaleId !== id && record\.maleId !== id/);
  assert.match(extractedSource, /liveState\.health = .*record\.animalId !== id/);
  assert.match(extractedSource, /liveState\.pedigrees = .*record\.subjectAnimalId !== id/);
  assert.match(extractedSource, /liveState\.tasks = .*task\.animalId === id \? \{ \.\.\.task, animalId: "" \}/);
});

test("Phase 3 modern profile and shared animal-action router remain authoritative", () => {
  assert.match(flowSource, /function openAnimalProfile\(animalId,tab="overview",options=\{\}\)/);
  assert.match(flowSource, /HerdHarborAnimalActionRouter\?\.open\?\./);
  assert.match(flowSource, /#view-animal-profile/);
  assert.match(routerSource, /HerdHarborApp\?\.openAnimalEditor/);
  assert.match(routerSource, /HerdHarborApp\?\.openAnimalPedigreePrint/);
  assert.match(runtimeSource, /openAnimalEditor:\s*\(animalId\) => animalProfileRuntime\(\)\.openEditor\(animalId\)/);
  assert.match(runtimeSource, /openAnimalPedigreePrint:\s*\(animalId\) => animalProfileRuntime\(\)\.openPedigreePrint\(animalId\)/);
  assert.doesNotMatch(extractedSource, /function renderProfile\(|function profileHash\(|data-hh-p2-tab/);
});

test("shell loads and caches extracted runtime before application composition", () => {
  const html = read("index.html");
  const worker = read("service-worker.js");
  const domainIndex = html.indexOf("animal-profile-runtime-v1.8.3.js?v=1");
  const compositionIndex = html.indexOf("herdharbor-app-runtime.js?v=2");
  assert.ok(domainIndex >= 0 && compositionIndex > domainIndex);
  assert.match(worker, /\.\/animal-profile-runtime-v1\.8\.3\.js\?v=1/);
  assert.match(worker, /"\/animal-profile-runtime-v1\.8\.3\.js"/);
});

test("Phase 6B does not advance whole-app release or normalized-sync authority", () => {
  assert.equal(packageJson.version, "1.8.2");
  const build = read("herdharbor-build.js");
  assert.match(build, /version:\s*"1\.8\.2"/);
  for (const asset of [
    "cloud-sync-cohort-gate-v1.8.3.js",
    "cloud-sync-reconciliation-v1.8.3.js",
    "cloud-sync-rollout-control-v1.8.3.js"
  ]) {
    assert.doesNotMatch(read("index.html"), new RegExp(asset.replace(/[.]/g, "\\.")));
  }
  assert.match(packageJson.scripts["test:v1.8.3"], /runtime-animal-profile-extraction-v1\.8\.3\.test\.cjs/);
});
