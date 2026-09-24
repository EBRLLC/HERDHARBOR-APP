"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const Voice = require("../voice-assisted-entry-v1.8.3.js");
const source = read("voice-assisted-entry-v1.8.3.js");
const app = read("herdharbor-app-runtime.js");
const breeding = read("breeding-litter-runtime-v1.8.3.js");
const html = read("index.html");
const worker = read("service-worker.js");
const pkg = JSON.parse(read("package.json"));

const animals = [
  { id: "a1", name: "Daisy", sex: "Female", species: "Rabbit" },
  { id: "a2", name: "Buckley", sex: "Male", species: "Rabbit" }
];

test("weight instruction becomes a complete review draft", () => {
  const draft = Voice.interpretTranscript("Add a weight of 4 pounds 3 ounces to Daisy today.", { animals, todayISO: "2026-09-22" });
  assert.equal(draft.recordType, "weight");
  assert.equal(draft.confidence, "high");
  assert.equal(draft.date, "2026-09-22");
  assert.deepEqual(draft.defaults, {
    animalId: "a1",
    date: "2026-09-22",
    type: "Weight",
    weight: "4",
    weightUnit: "lb+oz",
    weightOunces: "3",
    details: "Weight measurement."
  });
  assert.equal(Voice.validateDraft(draft, animals).ok, true);
});

test("medication instruction preserves medication and dose in a Health review draft", () => {
  const draft = Voice.interpretTranscript("Record that Daisy received 1 milliliter of medication X today.", { animals, todayISO: "2026-09-22" });
  assert.equal(draft.recordType, "medication");
  assert.equal(draft.defaults.animalId, "a1");
  assert.equal(draft.defaults.type, "Medication");
  assert.match(draft.defaults.details, /X/);
  assert.match(draft.defaults.details, /1 mL/);
  assert.equal(Voice.validateDraft(draft, animals).ok, true);
});

test("breeding instruction resolves dam and sire but still returns only a draft", () => {
  const state = { animals: structuredClone(animals), breedings: [], health: [] };
  const before = structuredClone(state);
  const draft = Voice.interpretTranscript("Breed Daisy to Buckley today.", { animals: state.animals, todayISO: "2026-09-22" });
  assert.equal(draft.recordType, "breeding");
  assert.equal(draft.defaults.femaleId, "a1");
  assert.equal(draft.defaults.maleId, "a2");
  assert.equal(draft.defaults.breedingDate, "2026-09-22");
  assert.equal(draft.defaults.status, "Bred");
  assert.equal(Voice.validateDraft(draft, state.animals).ok, true);
  assert.deepEqual(state, before, "interpretation must not mutate canonical state");
});

test("ambiguity and missing required facts remain unresolved for user review", () => {
  const duplicateNames = [...animals, { id: "a3", name: "Daisy", sex: "Female", species: "Rabbit" }];
  const ambiguous = Voice.interpretTranscript("Daisy weighs 4 pounds today.", { animals: duplicateNames, todayISO: "2026-09-22" });
  assert.equal(ambiguous.defaults.animalId, "");
  assert.ok(ambiguous.issues.some((issue) => /More than one animal/.test(issue)));
  assert.equal(Voice.validateDraft(ambiguous, duplicateNames).ok, false);

  const missingDate = Voice.interpretTranscript("Daisy weighs 4 pounds.", { animals, todayISO: "2026-09-22" });
  assert.equal(missingDate.date, "");
  assert.ok(missingDate.issues.some((issue) => /date is required/i.test(issue)));
});

test("voice engine has no direct canonical persistence path", () => {
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|commitState|saveState/);
  assert.doesNotMatch(source, /\.health\.push|\.breedings\.push|state\.(?:health|breedings)\s*=/);
  assert.match(source, /Nothing has been saved/);
  assert.match(source, /openHealthForm/);
  assert.match(source, /openBreedingForm/);
});

test("telemetry records operation metadata without transcript or farm-record payloads", () => {
  assert.match(source, /addBreadcrumb/);
  assert.match(source, /record_type/);
  const telemetryBlock = source.slice(source.indexOf("function telemetry"), source.indexOf("function renderReview"));
  assert.doesNotMatch(telemetryBlock, /transcript|animalId|details|medication|weight/);
});

test("canonical Health and Breeding forms remain final save owners", () => {
  assert.match(app, /HerdHarborVoiceAssistedEntry\?\.create/);
  assert.match(app, /openHealthForm/);
  assert.match(app, /openBreedingForm/);
  assert.match(breeding, /function openBreedingForm\(id = "", defaults = \{\}\)/);
  assert.match(breeding, /stateNow\(\)\.breedings\.push\(saved\)/);
  assert.doesNotMatch(source, /stateNow\(\)\.breedings\.push|stateNow\(\)\.health\.push/);
});

test("voice AI stays production-deployed but lazy-loads only for approved live testers", () => {
  const optional = read("herdharbor-optional-tools.js");
  const appIndex = html.indexOf("herdharbor-app-runtime.js?v=2");
  assert.ok(appIndex >= 0);
  assert.doesNotMatch(html, /<script[^>]+voice-assisted-entry-v1\.8\.3\.js/);
  assert.match(optional, /voiceAi:\s*"voice-assisted-entry-v1\.8\.3\.js\?v=1"/);
  assert.match(optional, /isAiLiveTester/);
  assert.match(optional, /ensureAiLiveTools/);
  assert.match(worker, /\.\/voice-assisted-entry-v1\.8\.3\.js\?v=1/);
  assert.match(pkg.scripts["test:v1.8.3"], /voice-assisted-entry-v1\.8\.3\.test\.cjs/);
});
