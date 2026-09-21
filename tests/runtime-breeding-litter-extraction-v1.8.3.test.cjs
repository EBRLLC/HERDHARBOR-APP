"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const runtimeSource = read("herdharbor-app-runtime.js");
const extractedSource = read("breeding-litter-runtime-v1.8.3.js");
const lifecycleSource = read("flow-phase2-lifecycle-v1.8.2.js");
const workspaceSource = read("breeding-litter-workspace-v1.8.2.js");
const workspaceIntegrationSource = read("breeding-litter-workspace-integration-v1.8.2.js");
const routerSource = read("animal-action-router-v1.8.3.js");
const packageJson = JSON.parse(read("package.json"));
const extracted = require(path.join(root, "breeding-litter-runtime-v1.8.3.js"));

function stubDeps(state) {
  const noop = () => {};
  const html = () => "";
  return {
    getState: () => state,
    $: () => null,
    $$: () => [],
    esc: (value) => String(value ?? ""),
    headerHtml: html,
    statCard: html,
    emptyState: html,
    animalName: (id) => state.animals.find((animal) => animal.id === id)?.name || "Unknown animal",
    formatDate: (value) => String(value || ""),
    daysFromNow: () => null,
    ensureSpreadsheetToolsReady: async () => ({ downloadBreedingReport: async () => true }),
    openModal: noop,
    closeModal: noop,
    selectAnimalField: html,
    field: html,
    selectField: html,
    textareaField: html,
    todayISO: () => "2026-09-21",
    toast: noop,
    navigate: noop,
    uid: (prefix) => prefix + "-test",
    recordActivity: noop,
    saveState: () => true,
    renderCurrentView: noop,
    addDays: (iso, days) => {
      const date = new Date(iso + "T00:00:00Z");
      date.setUTCDate(date.getUTCDate() + days);
      return date.toISOString().slice(0, 10);
    },
    allowsAnimalTransition: () => true,
    rememberBreed: noop,
    completeWorkflowTasks: noop
  };
}

function stateFixture() {
  return {
    profile: { operationName: "Test Farm" },
    animals: [
      { id: "doe", name: "Daisy", species: "Rabbit", breed: "Holland Lop", sex: "Female", status: "Active" },
      { id: "buck", name: "Blue", species: "Rabbit", breed: "Holland Lop", sex: "Male", status: "Active" }
    ],
    breedings: [],
    litters: [],
    tasks: [],
    activity: []
  };
}

test("Breeding/Litter domain has one extracted runtime owner", () => {
  assert.equal(extracted.VERSION, "1.8.3");
  assert.equal(typeof extracted.create, "function");
  assert.match(extractedSource, /root\.HerdHarborBreedingLitterRuntime = api/);
  assert.match(extractedSource, /function renderBreedings\(\)/);
  assert.match(extractedSource, /function openBreedingForm\(id = ""\)/);
  assert.match(extractedSource, /function renderLitters\(\)/);
  assert.match(extractedSource, /function openLitterForm\(id = "", breedingId = ""\)/);
  assert.match(extractedSource, /function openOffspringCreator\(litterId\)/);
  assert.match(extractedSource, /function syncBreedingReminders\(/);
  assert.match(extractedSource, /function syncBirthReminder\(/);
});

test("composition runtime delegates breeding and litter behavior instead of retaining a second implementation", () => {
  assert.match(runtimeSource, /function breedingLitterRuntime\(\)/);
  assert.match(runtimeSource, /HerdHarborBreedingLitterRuntime\?\.create/);
  assert.match(runtimeSource, /function renderBreedings\(\) \{\s*return breedingLitterRuntime\(\)\.renderBreedings\(\);\s*\}/);
  assert.match(runtimeSource, /function renderLitters\(\) \{\s*return breedingLitterRuntime\(\)\.renderLitters\(\);\s*\}/);
  assert.match(runtimeSource, /function openBreedingForm\(id = ""\) \{\s*return breedingLitterRuntime\(\)\.openBreedingForm\(id\);\s*\}/);
  assert.match(runtimeSource, /function openLitterForm\(id = "", breedingId = ""\) \{\s*return breedingLitterRuntime\(\)\.openLitterForm\(id, breedingId\);\s*\}/);
  assert.doesNotMatch(runtimeSource, /let breedingViewYear =/);
  assert.doesNotMatch(runtimeSource, /const GESTATION_RULES =/);
  assert.doesNotMatch(runtimeSource, /function openOffspringCreator\(/);
  assert.doesNotMatch(runtimeSource, /function birthLiveRemaining\(/);
  assert.match(runtimeSource, /function completeWorkflowTasks\(/, "shared task completion remains composition-owned");
});

test("extracted runtime uses the canonical injected state and no parallel persistence/cloud owner", () => {
  assert.match(extractedSource, /const stateNow = \(\) => deps\.getState\(\) \|\| \{\}/);
  assert.match(extractedSource, /stateNow\(\)\.breedings\.push\(saved\)/);
  assert.match(extractedSource, /stateNow\(\)\.litters\.push\(saved\)/);
  assert.match(extractedSource, /stateNow\(\)\.animals\.push\(\.\.\.created\)/);
  assert.match(extractedSource, /completeWorkflowTasks/);
  assert.doesNotMatch(extractedSource, /localStorage|sessionStorage|indexedDB|STORAGE_KEY|herdharbor_pre_alpha_v1/);
  assert.doesNotMatch(extractedSource, /HerdHarborCloud|Supabase|supabase|cloud-sync-/);
});

test("species schedule and report math remain behavior-compatible", () => {
  const state = stateFixture();
  const api = extracted.create(stubDeps(state));
  assert.equal(api.normalizeBreedingStatus("Confirmed"), "Confirmed pregnant");
  assert.equal(api.normalizeBreedingStatus("Completed"), "Delivered");
  assert.deepEqual(api.breedingSchedule("doe", "2026-09-01"), {
    species: "Rabbit",
    rule: extracted.GESTATION_RULES.Rabbit,
    pregnancyCheckDate: "2026-09-15",
    preparationDate: "2026-09-29",
    dueDate: "2026-10-02"
  });

  state.breedings.push({
    id: "b1",
    femaleId: "doe",
    maleId: "buck",
    breedingDate: "2026-09-01",
    pregnancyCheckStatus: "Positive",
    status: "Confirmed pregnant"
  });
  state.litters.push({
    id: "l1",
    breedingId: "b1",
    damId: "doe",
    sireId: "buck",
    bornAlive: "4",
    stillborn: "1",
    fosteredIn: "1",
    fosteredOut: "1",
    lostBeforeWeaning: "1",
    weaned: "3"
  });
  const report = api.breedingReportSnapshot();
  assert.equal(report.attempts, 1);
  assert.equal(report.positive, 1);
  assert.equal(report.bornAlive, 4);
  assert.equal(report.stillborn, 1);
  assert.equal(report.lost, 1);
  assert.equal(report.weaned, 3);
  assert.equal(api.birthLiveRemaining(state.litters[0]), 3);
});

test("breeding/litter reminders stay canonical task mutations and deletion cleanup remains shared", () => {
  const state = stateFixture();
  const api = extracted.create(stubDeps(state));
  const breeding = {
    id: "b1",
    femaleId: "doe",
    maleId: "buck",
    pregnancyCheckDate: "2026-09-15",
    nestBoxDate: "2026-09-29",
    dueDate: "2026-10-02",
    pregnancyCheckStatus: "Not checked",
    status: "Bred"
  };
  assert.equal(api.syncBreedingReminders(breeding, { now: "2026-09-01T12:00:00.000Z" }), true);
  assert.equal(state.tasks.length, 3);
  assert.deepEqual(new Set(state.tasks.map((task) => task.sourceType)), new Set(["breeding"]));

  const litter = {
    id: "l1",
    damId: "doe",
    expectedWeanDate: "2026-11-13",
    bornAlive: "4",
    fosteredIn: "0",
    fosteredOut: "0",
    lostBeforeWeaning: "0",
    weaned: "0"
  };
  assert.equal(api.syncBirthReminder(litter, { now: "2026-10-02T12:00:00.000Z" }), true);
  assert.equal(state.tasks.some((task) => task.sourceType === "birth" && task.reminderType === "weaning"), true);
  assert.match(extractedSource, /completeWorkflowTasks\("breeding", id, now\)/);
  assert.match(extractedSource, /completeWorkflowTasks\("birth", id, now\)/);
});

test("offspring creation keeps canonical parent links and animal-limit gate", () => {
  assert.match(extractedSource, /allowsAnimalTransition\(stateNow\(\)\.animals, \[\.\.\.stateNow\(\)\.animals, \.\.\.created\]\)/);
  assert.match(extractedSource, /sireId: litter\.sireId \|\| ""/);
  assert.match(extractedSource, /damId: litter\.damId \|\| ""/);
  assert.match(extractedSource, /sourceBirthId: litter\.id/);
  assert.match(extractedSource, /litter\.offspringIds = \[\.\.\.new Set/);
  assert.match(extractedSource, /rememberBreed\(dam\?\.species \|\| sire\?\.species \|\| "", breed\)/);
});

test("existing lifecycle/workspace engines and animal-first action routing remain authoritative", () => {
  assert.match(lifecycleSource, /function autoCreateBornOffspring\(/);
  assert.match(lifecycleSource, /function reconcileSubmittedBirth\(/);
  assert.match(lifecycleSource, /herdharbor:offspring-auto-created/);
  assert.match(lifecycleSource, /function breedingStage\(/);
  assert.match(workspaceSource, /function weanSelected\(/);
  assert.match(workspaceSource, /function setDisposition\(/);
  assert.match(workspaceIntegrationSource, /create\.removeAttribute\("data-create-offspring"\)/);
  assert.match(workspaceIntegrationSource, /create\.dataset\.hhBwManageLitter=litterId/);
  assert.match(workspaceIntegrationSource, /root\.HerdHarborBreedingWorkspace\?\.open\?\.\(litterId\)/);
  assert.match(routerSource, /#add-breeding/);
  assert.match(routerSource, /#breeding-form/);
  assert.doesNotMatch(extractedSource, /function breedingStage\(|function weanSelected\(|function setDisposition\(/);
});

test("manual offspring creator remains compatibility fallback behind canonical lifecycle/workspace integration", () => {
  assert.match(extractedSource, /function openOffspringCreator\(litterId\)/);
  assert.match(extractedSource, /allowsAnimalTransition\(stateNow\(\)\.animals, \[\.\.\.stateNow\(\)\.animals, \.\.\.created\]\)/);
  assert.match(extractedSource, /sireId: litter\.sireId \|\| ""/);
  assert.match(extractedSource, /damId: litter\.damId \|\| ""/);
  assert.match(extractedSource, /sourceBirthId: litter\.id/);
  assert.match(workspaceIntegrationSource, /create\.removeAttribute\("data-create-offspring"\)/);
  assert.match(lifecycleSource, /autoCreateBornOffspring\(state,litter\)/);
});

test("shell loads and caches Breeding/Litter runtime before application composition", () => {
  const html = read("index.html");
  const worker = read("service-worker.js");
  const animal = html.indexOf("animal-profile-runtime-v1.8.3.js?v=1");
  const breeding = html.indexOf("breeding-litter-runtime-v1.8.3.js?v=1");
  const composition = html.indexOf("herdharbor-app-runtime.js?v=2");
  assert.ok(animal >= 0 && breeding > animal && composition > breeding);
  assert.match(worker, /\.\/breeding-litter-runtime-v1\.8\.3\.js\?v=1/);
  assert.match(worker, /"\/breeding-litter-runtime-v1\.8\.3\.js"/);
});

test("Phase 6C does not advance whole-app release or normalized-sync authority", () => {
  assert.equal(packageJson.version, "1.8.2");
  assert.match(read("herdharbor-build.js"), /version:\s*"1\.8\.2"/);
  for (const asset of [
    "cloud-sync-cohort-gate-v1.8.3.js",
    "cloud-sync-reconciliation-v1.8.3.js",
    "cloud-sync-rollout-control-v1.8.3.js"
  ]) assert.doesNotMatch(read("index.html"), new RegExp(asset.replace(/[.]/g, "\\.")));
  assert.match(packageJson.scripts["test:v1.8.3"], /runtime-breeding-litter-extraction-v1\.8\.3\.test\.cjs/);
});
