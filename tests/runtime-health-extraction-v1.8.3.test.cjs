"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const runtimeSource = read("herdharbor-app-runtime.js");
const extractedSource = read("health-runtime-v1.8.3.js");
const intelligenceSource = read("health-intelligence-v1.7.1.js");
const routerSource = read("animal-action-router-v1.8.3.js");
const flowSource = read("flow-phase2-v1.8.2.js");
const packageJson = JSON.parse(read("package.json"));
const HealthRuntime = require(path.join(root, "health-runtime-v1.8.3.js"));

function fixture() {
  return {
    animals: [
      { id: "a1", name: "Daisy", species: "Rabbit", status: "Active" },
      { id: "a2", name: "Blue", species: "Rabbit", status: "Active" }
    ],
    health: [
      { id: "h1", animalId: "a1", date: "2026-09-10", type: "Weight", weight: "3.1", weightUnit: "lb", details: "weekly" },
      { id: "h2", animalId: "a2", date: "2026-09-20", type: "Observation", details: "normal" }
    ],
    healthIntelligence: {
      episodes: [{ id: "e1", animalId: "a1", concern: "Example", quarantined: true, resolved: false }],
      careRecords: [],
      groupRecords: []
    },
    activity: []
  };
}

function deps(state) {
  const noop = () => {};
  const html = () => "";
  return {
    getState: () => state,
    $: () => null,
    $$: () => [],
    esc: (value) => String(value ?? ""),
    headerHtml: html,
    emptyState: html,
    formatDate: (value) => String(value || ""),
    animalName: (id) => state.animals.find((animal) => animal.id === id)?.name || "Unknown animal",
    openModal: noop,
    closeModal: noop,
    selectAnimalField: html,
    field: html,
    selectField: html,
    textareaField: html,
    todayISO: () => "2026-09-21",
    toast: noop,
    navigate: noop,
    uid: () => "health-new",
    recordActivity: noop,
    saveState: () => true,
    renderCurrentView: noop,
    setSymptomSearch: noop
  };
}

test("Health records have one extracted runtime owner", () => {
  assert.equal(HealthRuntime.VERSION, "1.8.3");
  assert.equal(typeof HealthRuntime.create, "function");
  assert.match(extractedSource, /root\.HerdHarborHealthRuntime = api/);
  assert.match(extractedSource, /function renderHealth\(\)/);
  assert.match(extractedSource, /function openHealthForm\(id = "", defaults = \{\}\)/);
  assert.match(extractedSource, /function normalizeHealthFormData\(data\)/);
  assert.match(runtimeSource, /HerdHarborHealthRuntime\?\.create/);
  assert.match(runtimeSource, /function renderHealth\(\) \{\s*return healthRuntime\(\)\.renderHealth\(\);\s*\}/);
  assert.match(runtimeSource, /function openHealthForm\(id = "", defaults = \{\}\) \{\s*return healthRuntime\(\)\.openHealthForm\(id, defaults\);\s*\}/);
  assert.doesNotMatch(runtimeSource, /id="health-weight-ounces-field"/);
  assert.doesNotMatch(runtimeSource, /data-edit-health=/);
});

test("Health records use injected canonical state and create no parallel store", () => {
  const state = fixture();
  const api = HealthRuntime.create(deps(state));
  assert.deepEqual(api.healthRows().map((record) => record.id), ["h2", "h1"]);
  assert.match(extractedSource, /const stateNow = \(\) => deps\.getState\(\) \|\| \{\}/);
  assert.match(extractedSource, /liveState\.health\.push\(/);
  assert.match(extractedSource, /liveState\.health = .*\.filter/);
  assert.match(extractedSource, /deps\.saveState\(id \? "Health record updated\." : "Health record added\."\)/);
  assert.doesNotMatch(extractedSource, /localStorage|sessionStorage|indexedDB|STORAGE_KEY|herdharbor_pre_alpha_v1/);
  assert.doesNotMatch(extractedSource, /healthIntelligence\s*=/);
});

test("weight validation preserves existing supported units and ounces guard", () => {
  const api = HealthRuntime.create(deps(fixture()));
  assert.deepEqual([...HealthRuntime.WEIGHT_UNITS], ["lb", "lb+oz", "oz", "kg", "g"]);
  assert.equal(api.normalizeHealthFormData({ weight: "4", weightUnit: "lb", weightOunces: "" }).ok, true);
  assert.deepEqual(api.normalizeHealthFormData({ weight: "4", weightUnit: "lb+oz", weightOunces: "8" }), {
    ok: true,
    data: { weight: "4", weightUnit: "lb+oz", weightOunces: "8" }
  });
  assert.match(api.normalizeHealthFormData({ weight: "-1", weightUnit: "lb", weightOunces: "" }).message, /zero or more/);
  assert.match(api.normalizeHealthFormData({ weight: "4", weightUnit: "lb+oz", weightOunces: "16" }).message, /less than 16/);
});

test("Current Weight continues deriving only from canonical basic health records", () => {
  assert.match(flowSource, /function latestWeightRecord\(state=\{\},animalId=""\)\{/);
  assert.match(flowSource, /array\(state,"health"\)/);
  assert.match(flowSource, /normalizedWeightGrams\(record\)/);
  assert.match(flowSource, /currentWeight:"Current Weight"/);
  assert.match(flowSource, /const record=latestWeightRecord\(state,animal\.id\)/);
  assert.doesNotMatch(extractedSource, /currentWeight\s*=|currentWeight:/);
  assert.doesNotMatch(intelligenceSource, /currentWeight\s*=|currentWeight:/);
});

test("Health Intelligence remains the authoritative episode care and quarantine engine", () => {
  assert.match(intelligenceSource, /state\.healthIntelligence/);
  assert.match(intelligenceSource, /nextState\.healthIntelligence=value/);
  assert.match(intelligenceSource, /herdharbor:health-intelligence-changed/);
  assert.match(intelligenceSource, /quarantined/);
  assert.match(routerSource, /HerdHarborHealthIntelligence\?\.readHealthState/);
  assert.match(routerSource, /#hh-health-intelligence-modal/);
  assert.doesNotMatch(extractedSource, /function createEpisode\(|function resolveEpisode\(|careRecords|groupRecords/);
});

test("profile Health actions and return surfaces remain unchanged", () => {
  assert.match(flowSource, /data-hh-p2-action="weight"/);
  assert.match(flowSource, /data-hh-p2-action="episode"/);
  assert.match(flowSource, /data-hh-p2-action="care"/);
  assert.match(routerSource, /weight:\s*"#health-form"/);
  assert.match(routerSource, /health:\s*"#health-form"/);
  assert.match(routerSource, /episode:\s*"#hh-health-intelligence-modal"/);
  assert.match(routerSource, /care:\s*"#hh-health-intelligence-modal"/);
  assert.match(routerSource, /function openHealthRecord\(/);
});

test("symptom guide remains composition-owned and may still open the extracted health form", () => {
  assert.match(runtimeSource, /function renderSymptoms\(\)/);
  assert.match(runtimeSource, /function symptomEntryMatches\(/);
  assert.match(runtimeSource, /HERDHARBOR_SYMPTOM_GUIDE/);
  assert.match(runtimeSource, /openHealthForm\("", \{/);
  assert.match(runtimeSource, /setSymptomSearch: \(value\) => \{ symptomView\.search = String\(value \|\| ""\); \}/);
  assert.doesNotMatch(extractedSource, /function renderSymptoms\(|HERDHARBOR_SYMPTOM_GUIDE/);
});

test("shell loads and caches Health runtime before application composition", () => {
  const html = read("index.html");
  const worker = read("service-worker.js");
  const breeding = html.indexOf("breeding-litter-runtime-v1.8.3.js?v=1");
  const health = html.indexOf("health-runtime-v1.8.3.js?v=1");
  const composition = html.indexOf("herdharbor-app-runtime.js?v=2");
  assert.ok(breeding >= 0 && health > breeding && composition > health);
  assert.match(worker, /\.\/health-runtime-v1\.8\.3\.js\?v=1/);
  assert.match(worker, /"\/health-runtime-v1\.8\.3\.js"/);
});

test("Phase 6D extraction remains compatible with formal v1.8.4 and leaves normalized-sync authority unchanged", () => {
  assert.equal(packageJson.version, "1.8.4");
  assert.match(read("herdharbor-build.js"), /version:\s*"1\.8\.4"/);
  for (const asset of [
    "cloud-sync-cohort-gate-v1.8.3.js",
    "cloud-sync-reconciliation-v1.8.3.js",
    "cloud-sync-rollout-control-v1.8.3.js"
  ]) assert.doesNotMatch(read("index.html"), new RegExp(asset.replace(/[.]/g, "\\.")));
  assert.match(packageJson.scripts["test:v1.8.3"], /runtime-health-extraction-v1\.8\.3\.test\.cjs/);
});
