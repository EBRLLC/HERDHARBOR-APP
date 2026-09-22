"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const Photo = require("../photo-assisted-entry-v1.8.3.js");
const client = read("photo-assisted-entry-v1.8.3.js");
const edge = read("supabase/functions/photo-record-extract/index.ts");
const config = read("supabase/config.toml");
const app = read("herdharbor-app-runtime.js");
const animalRuntime = read("animal-profile-runtime-v1.8.3.js");
const healthRuntime = read("health-runtime-v1.8.3.js");
const html = read("index.html");
const worker = read("service-worker.js");
const pkg = JSON.parse(read("package.json"));

const animals = [
  { id: "a1", name: "Daisy", registrationNumber: "R-101", tattoo: "D1", tag: "101", sex: "Female", species: "Rabbit" },
  { id: "a2", name: "Buckley", registrationNumber: "R-202", tattoo: "B2", tag: "202", sex: "Male", species: "Rabbit" }
];

test("server-side extractor supports only the four reviewed photo classes plus unsupported", () => {
  for (const classification of ["registration_document","vet_document","weight_sheet","medication_label","unsupported"]) {
    assert.match(edge, new RegExp('"' + classification + '"'));
  }
  assert.match(edge, /review-only HerdHarbor record drafts/);
  assert.match(edge, /Never invent missing facts/);
  assert.match(edge, /Do not calculate a dose/);
  assert.match(edge, /This output is never permission to modify farm records/);
});

test("photo extraction provider credentials and authentication stay server-side", () => {
  assert.match(config, /\[functions\.photo-record-extract\][\s\S]*verify_jwt = true/);
  assert.match(edge, /Deno\.env\.get\("OPENAI_API_KEY"\)/);
  assert.match(edge, /admin\.auth\.getUser\(token\)/);
  assert.match(edge, /store:\s*false/);
  assert.doesNotMatch(client, /OPENAI_API_KEY|api\.openai\.com|SUPABASE_SERVICE_ROLE_KEY/);
});

test("registration image becomes an Animal-form draft only", () => {
  const draft = Photo.canonicalDraft({
    classification: "registration_document",
    classificationConfidence: 0.98,
    warnings: [],
    registration: {
      name: "Daisy",
      registrationNumber: "R-101",
      tattoo: "D1",
      tag: "101",
      breeder: "Example Rabbitry",
      species: "Rabbit",
      breed: "Holland Lop",
      sex: "Female",
      dob: "2026-01-03",
      color: "Harlequin"
    }
  }, animals);
  assert.equal(draft.classification, "registration_document");
  assert.equal(draft.defaults.name, "Daisy");
  assert.equal(draft.defaults.registrationNumber, "R-101");
  assert.equal(draft.defaults.status, "Active");
  assert.equal(Photo.validateReview(draft, animals).ok, true);
});

test("health photo drafts resolve exact existing animal identity without guessing", () => {
  const draft = Photo.canonicalDraft({
    classification: "weight_sheet",
    classificationConfidence: 0.91,
    warnings: [],
    animalHints: { registrationNumber: "R-101" },
    health: { date: "2026-09-22", type: "Weight", details: "", weight: "4.2", weightUnit: "lb", weightOunces: "", followUpDate: "" }
  }, animals);
  assert.equal(draft.defaults.animalId, "a1");
  assert.equal(draft.defaults.type, "Weight");
  assert.equal(Photo.validateReview(draft, animals).ok, true);

  const ambiguous = Photo.canonicalDraft({
    classification: "vet_document",
    classificationConfidence: 0.8,
    warnings: [],
    animalHints: { name: "Daisy" },
    health: { date: "2026-09-22", type: "Veterinary visit", details: "Exam completed.", weight: "", weightUnit: "", weightOunces: "", followUpDate: "" }
  }, [...animals, { id: "a3", name: "Daisy", sex: "Female", species: "Rabbit" }]);
  assert.equal(ambiguous.defaults.animalId, "");
  assert.ok(ambiguous.warnings.some((warning) => /More than one existing animal/.test(warning)));
  assert.equal(Photo.validateReview(ambiguous, animals).ok, false);
});

test("unsupported images and missing required facts fail closed", () => {
  const unsupported = Photo.canonicalDraft({ classification: "unsupported", warnings: ["Not a supported record."] }, animals);
  assert.equal(Photo.validateReview(unsupported, animals).ok, false);

  const missingWeight = Photo.canonicalDraft({
    classification: "weight_sheet",
    animalHints: { tag: "101" },
    health: { date: "2026-09-22", type: "Weight", details: "", weight: "", weightUnit: "lb", weightOunces: "", followUpDate: "" }
  }, animals);
  assert.equal(Photo.validateReview(missingWeight, animals).ok, false);
});

test("client review engine cannot persist or mutate canonical farm state", () => {
  assert.doesNotMatch(client, /localStorage|sessionStorage|indexedDB|commitState|saveState/);
  assert.doesNotMatch(client, /state\.(?:animals|health)\.(?:push|splice)|\.animals\.push|\.health\.push/);
  assert.match(client, /invokeFunctionWithDiagnostics\("photo-record-extract"/);
  assert.match(client, /Nothing has been saved/);
  assert.match(client, /openAnimalForm\("", next\.defaults\)/);
  assert.match(client, /openHealthForm\("", next\.defaults\)/);
  assert.doesNotMatch(edge, /commitState|saveState|state\.animals|state\.health/);
});

test("canonical Animal and Health runtimes remain final save owners", () => {
  assert.match(app, /HerdHarborPhotoAssistedEntry\?\.create/);
  assert.match(app, /function openAnimalForm\(id = "", defaults = \{\}\)/);
  assert.match(animalRuntime, /function openAnimalForm\(id = "", defaults = \{\}\)/);
  assert.match(animalRuntime, /state\.animals\.push\(saved\)/);
  assert.match(healthRuntime, /stateNow\(\)\.health\.push\(saved\)/);
});

test("photo asset loads before composition runtime and is available in the PWA artifact", () => {
  const photoIndex = html.indexOf("photo-assisted-entry-v1.8.3.js?v=1");
  const appIndex = html.indexOf("herdharbor-app-runtime.js?v=2");
  assert.ok(photoIndex >= 0 && appIndex > photoIndex);
  assert.match(worker, /\.\/photo-assisted-entry-v1\.8\.3\.js\?v=1/);
  assert.match(worker, /"\/photo-assisted-entry-v1\.8\.3\.js"/);
  assert.match(pkg.scripts["test:v1.8.3"], /photo-assisted-entry-v1\.8\.3\.test\.cjs/);
});

test("telemetry remains metadata-only and excludes extracted document contents", () => {
  const start = client.indexOf("function telemetry");
  const end = client.indexOf("function animalOptions", start);
  const telemetry = client.slice(start, end);
  assert.match(telemetry, /record_class/);
  assert.doesNotMatch(telemetry, /details|name|registrationNumber|tattoo|tag|weight|dataUrl|fileName/);
});
