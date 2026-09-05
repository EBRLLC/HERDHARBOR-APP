"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const Health = require("../health-intelligence-v1.7.1.js");
const source = fs.readFileSync(path.resolve(__dirname, "../health-intelligence-v1.7.1.js"), "utf8");
const css = fs.readFileSync(path.resolve(__dirname, "../health-intelligence-v1.7.1.css"), "utf8");
const build = fs.readFileSync(path.resolve(__dirname, "../herdharbor-build.js"), "utf8");
const worker = fs.readFileSync(path.resolve(__dirname, "../service-worker.js"), "utf8");

const farm = {
  animals: [
    { id: "cow1", name: "Daisy", species: "Cattle", status: "Active" },
    { id: "goat1", name: "Hazel", species: "Goat", status: "Breeding" },
    { id: "rabbit-old", name: "Old Rabbit", species: "Rabbit", status: "Sold" },
    { id: "dead-sheep", name: "Old Sheep", species: "Sheep", status: "Deceased" }
  ],
  health: []
};

test("Health Intelligence is v1.7.1 and hardlocks operational context to active farm animals", () => {
  assert.equal(Health.VERSION, "1.7.1");
  assert.equal(Health.activeAnimals(farm).map((animal) => animal.id).join(","), "cow1,goat1");
  assert.equal(Health.activeSpecies(farm).join(","), "cattle,goat");
});

test("three legacy symptom-guide urgency labels map into the new four-level health model", () => {
  assert.equal(Health.mapGuideUrgency("Emergency now"), "Emergency");
  assert.equal(Health.mapGuideUrgency("Contact a vet soon"), "Urgent");
  assert.equal(Health.mapGuideUrgency("Monitor and call"), "Monitor closely");
  assert.equal(Health.TRIAGE.ROUTINE, "Routine / preventive");
  assert.equal(Health.mapGuideUrgency("Emergency"), "Emergency");
});

test("triage keeps genuine red flags urgent without turning every observation into go-to-the-vet output", () => {
  const emergency = Health.assessEpisode({ species: "Rabbit", concern: "not eating", appetite: "None", manure: "None", breathing: "Normal" });
  assert.equal(emergency.level, "Emergency");

  const monitor = Health.assessEpisode({ species: "Cattle", concern: "single mild skin patch", appetite: "Normal", manure: "Normal", activity: "Normal", breathing: "Normal", affectedCount: 1 });
  assert.equal(monitor.level, "Monitor closely");
  assert.match(monitor.reason, /structured observation/i);
  assert.ok(monitor.actions.some((action) => /feed and water|environment/i.test(action)));
});

test("illness episodes preserve structured observations and species context", () => {
  const episode = Health.normalizeEpisode({
    animalId: "cow1",
    concern: "coughing",
    appetite: "Reduced",
    water: "Normal",
    manure: "Normal",
    activity: "Reduced",
    breathing: "Normal",
    affectedCount: 1,
    temperature: "102.1 F",
    recheckDate: "2026-09-06"
  }, farm);
  assert.equal(episode.species, "cattle");
  assert.equal(episode.temperature, "102.1 F");
  assert.ok(Array.isArray(episode.checklist));
  assert.ok(episode.checklist.some((item) => /breathing/i.test(item)));
});

test("structured care records track user-entered withdrawal dates without calculating intervals", () => {
  const record = Health.normalizeCareRecord({
    animalId: "cow1",
    type: "Medication",
    product: "Example product",
    amountRecorded: "label-directed amount",
    meatWithdrawalEnd: "2026-09-10",
    milkWithdrawalEnd: "2026-09-07"
  }, farm);
  const active = Health.withdrawalStatus(record, "2026-09-05");
  assert.equal(active.active, true);
  assert.equal(active.activeItems.length, 2);
  const clear = Health.withdrawalStatus(record, "2026-09-11");
  assert.equal(clear.active, false);
});

test("group records target only current active animals of the selected species", () => {
  const state = {
    animals: [
      { id: "c1", species: "Cattle", status: "Active" },
      { id: "c2", species: "Cow", status: "Breeding" },
      { id: "c3", species: "Cattle", status: "Sold" },
      { id: "g1", species: "Goat", status: "Active" }
    ]
  };
  assert.equal(Health.groupTargets({ species: "Cattle" }, state).map((animal) => animal.id).join(","), "c1,c2");
});

test("health intelligence detects repeated concerns and factual weight trends without assigning a diagnosis", () => {
  const state = {
    animals: [{ id: "c1", name: "Daisy", species: "Cattle", status: "Active" }, { id: "c2", name: "Mabel", species: "Cattle", status: "Active" }],
    health: [
      { animalId: "c1", type: "Weight", date: "2026-08-01", weight: "100", weightUnit: "lb" },
      { animalId: "c1", type: "Weight", date: "2026-09-01", weight: "93", weightUnit: "lb" }
    ]
  };
  const health = {
    episodes: [
      { animalId: "c1", species: "Cattle", concern: "cough", resolved: false },
      { animalId: "c2", species: "Cattle", concern: "cough", resolved: false }
    ],
    careRecords: [], groupRecords: []
  };
  const insights = Health.buildInsights(state, health, new Date("2026-09-05T12:00:00Z"));
  assert.ok(insights.some((item) => /group-level pattern/i.test(item.text)));
  assert.ok(insights.some((item) => /-7\.0%/.test(item.text)));
  assert.ok(insights.some((item) => /not assigning a cause/i.test(item.text)));
});

test("Health Intelligence persists inside the canonical farm state so cloud sync and backups carry it", () => {
  let appState = {
    animals: [{ id: "cow1", name: "Daisy", species: "Cattle", status: "Active" }],
    health: [{ id: "legacy-weight", animalId: "cow1", type: "Weight", date: "2026-09-01", weight: "100", weightUnit: "lb" }],
    settings: { theme: "system" }
  };
  let legacyWrites = 0;
  const context = {
    console,
    JSON,
    Date,
    Math,
    Set,
    Map,
    structuredClone,
    HerdHarborApp: {
      getState: () => appState,
      commitState: (next) => { appState = next; return true; }
    },
    localStorage: {
      getItem: () => null,
      setItem: () => { legacyWrites += 1; },
      removeItem: () => {}
    }
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "health-intelligence-v1.7.1.js" });
  const Runtime = context.HerdHarborHealthIntelligence;
  Runtime.saveEpisode({ animalId: "cow1", concern: "cough", appetite: "Normal", manure: "Normal", activity: "Normal", breathing: "Normal" });

  assert.equal(appState.health.length, 1, "legacy core Health history remains intact");
  assert.equal(appState.healthIntelligence.schemaVersion, 1);
  assert.equal(appState.healthIntelligence.episodes.length, 1);
  assert.equal(appState.healthIntelligence.episodes[0].animalId, "cow1");
  assert.equal(legacyWrites, 0, "canonical app persistence is used instead of a sidecar local-only store");
  assert.match(source, /HerdHarborApp\?\.getState/);
  assert.match(source, /commitState/);
  assert.match(source, /healthIntelligence/);
});

test("health UI includes episodes, preventive care, quarantine, group care, measurements, and food-animal safeguards", () => {
  for (const phrase of [
    "Start health episode", "Routine / preventive", "Quarantined", "Group record",
    "Temperature (recorded)", "Body-condition score", "Meat withdrawal ends",
    "Milk withdrawal ends", "Egg withdrawal ends", "does not calculate medication doses"
  ]) assert.match(source, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  assert.match(css, /html\[data-theme="dark"\]/);
});

test("Health Intelligence remains an educational recordkeeping tool and contains no dosing calculator", () => {
  assert.doesNotMatch(source, /\b(?:mg|mcg|ml)\s*\/\s*kg\b/i);
  assert.doesNotMatch(source, /dose\s*=|calculateDose|dosageCalculator/i);
  assert.match(source, /does not diagnose disease/i);
  assert.match(source, /does not calculate medication doses/i);
  assert.match(source, /does not[^.]*calculate withdrawal intervals/i);
});

test("Health Intelligence is loaded and cached as part of the v1.7.1 shell", () => {
  assert.match(build, /health-intelligence-v1\.7\.1\.js\?v=1\.7\.1/);
  assert.match(build, /health-intelligence-v1\.7\.1\.css\?v=1\.7\.1/);
  assert.match(worker, /health-intelligence-v1\.7\.1\.js\?v=1\.7\.1/);
  assert.match(worker, /health-intelligence-v1\.7\.1\.css\?v=1\.7\.1/);
});
