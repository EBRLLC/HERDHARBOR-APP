"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

const Photo = require("../photo-assisted-entry-v1.8.3.js");
const client = read("photo-assisted-entry-v1.8.3.js");
const edge = read("supabase/functions/record-photo-extract/index.ts");
const config = read("supabase/config.toml");
const app = read("herdharbor-app-runtime.js");
const animalRuntime = read("animal-profile-runtime-v1.8.3.js");
const healthRuntime = read("health-runtime-v1.8.3.js");
const html = read("index.html");
const worker = read("service-worker.js");
const pkg = JSON.parse(read("package.json"));

const animals = [
  { id: "a1", name: "Daisy", registrationNumber: "R-101", tattoo: "D1", tag: "101", earTagNumber: "", sex: "Female", species: "Rabbit" },
  { id: "a2", name: "Buckley", registrationNumber: "R-202", tattoo: "B2", tag: "202", earTagNumber: "", sex: "Male", species: "Rabbit" }
];

test("one authenticated server-side extractor owns all Phase 9B photo classes", () => {
  assert.equal(exists("supabase/functions/photo-record-extract/index.ts"), false);
  assert.equal(exists("supabase/functions/record-photo-extract/index.ts"), true);
  assert.match(config, /\[functions\.record-photo-extract\][\s\S]*verify_jwt = true/);
  assert.doesNotMatch(config, /\[functions\.photo-record-extract\]/);
  for (const type of ["registration", "veterinary_document", "weight_sheet", "medication_label", "unknown"]) {
    assert.match(edge, new RegExp('"' + type + '"'));
  }
});

test("provider credentials and user authentication stay server-side", () => {
  assert.match(edge, /Deno\.env\.get\("OPENAI_API_KEY"\)/);
  assert.match(edge, /SUPABASE_SECRET_KEYS/);
  assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(edge, /admin\.auth\.getUser\(token\)/);
  assert.match(edge, /store:\s*false/);
  assert.doesNotMatch(client, /OPENAI_API_KEY|api\.openai\.com|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEYS/);
});

test("extractor explicitly forbids guessing, diagnosis and dose invention", () => {
  assert.match(edge, /Never invent missing names/);
  assert.match(edge, /Do not provide veterinary advice, diagnosis, dose recommendations/);
  assert.match(edge, /Do not convert units/);
  assert.match(edge, /leave uncertain row fields blank rather than guessing/);
  assert.match(edge, /draft for explicit human review and never authorizes mutation of farm records/);
});

test("registration document becomes an Animal-form draft only", () => {
  const draft = Photo.canonicalDraft({
    documentType: "registration",
    classificationConfidence: 0.98,
    warnings: [],
    registration: {
      name: "Daisy", registrationNumber: "R-101", tattoo: "D1", tag: "101", earTagNumber: "",
      breeder: "Example Rabbitry", species: "Rabbit", breed: "Holland Lop", sex: "Female",
      dob: "2026-01-03", color: "Harlequin", variety: ""
    }
  }, animals);
  assert.equal(draft.classification, "registration_document");
  assert.equal(draft.defaults.name, "Daisy");
  assert.equal(draft.defaults.registrationNumber, "R-101");
  assert.equal(draft.defaults.status, "Active");
  assert.equal(Photo.validateReview(draft, animals).ok, true);
});

test("veterinary and medication photos create Health-form drafts without medical inference", () => {
  const vet = Photo.canonicalDraft({
    documentType: "veterinary_document",
    classificationConfidence: 0.94,
    warnings: [],
    veterinaryRecord: { animalName: "Daisy", date: "2026-09-22", provider: "Example Vet", summary: "Exam completed.", followUpDate: "2026-10-01" }
  }, animals);
  assert.equal(vet.classification, "vet_document");
  assert.equal(vet.defaults.animalId, "a1");
  assert.equal(vet.defaults.type, "Veterinary visit");
  assert.match(vet.defaults.details, /Example Vet/);
  assert.match(vet.defaults.details, /Exam completed/);
  assert.equal(Photo.validateReview(vet, animals).ok, true);

  const med = Photo.canonicalDraft({
    documentType: "medication_label",
    classificationConfidence: 0.9,
    warnings: [],
    medicationLabel: {
      animalName: "Daisy", medicationName: "ExampleMed", strength: "10 mg/mL",
      doseInstructions: "Give 1 mL", route: "oral", frequency: "once daily", expirationDate: "2027-01-01"
    }
  }, animals);
  assert.equal(med.classification, "medication_label");
  assert.equal(med.defaults.animalId, "a1");
  assert.equal(med.defaults.type, "Medication");
  assert.match(med.defaults.details, /ExampleMed/);
  assert.match(med.defaults.details, /Give 1 mL/);
  assert.equal(med.defaults.date, "", "medication label must not invent administration date");
  assert.equal(Photo.validateReview(med, animals).ok, false, "user must supply record date before handoff");
});

test("multi-row weight sheets require explicit row selection", () => {
  const draft = Photo.canonicalDraft({
    documentType: "weight_sheet",
    classificationConfidence: 0.97,
    warnings: [],
    weightRows: [
      { animalName: "Daisy", identifier: "R-101", date: "2026-09-21", weight: "4.2", weightUnit: "lb", weightOunces: "", confidence: 0.98 },
      { animalName: "Buckley", identifier: "R-202", date: "2026-09-21", weight: "5.1", weightUnit: "lb", weightOunces: "", confidence: 0.97 }
    ]
  }, animals);
  assert.equal(draft.classification, "weight_sheet");
  assert.equal(draft.selectedWeightIndex, null);
  assert.equal(draft.defaults.animalId, "");
  assert.equal(draft.defaults.weight, "");
  assert.ok(draft.warnings.some((warning) => /multiple readable rows/i.test(warning)));
  assert.equal(Photo.validateReview(draft, animals).ok, false);

  const selected = Photo.applyWeightRow(draft, 1, animals);
  assert.equal(selected.selectedWeightIndex, 1);
  assert.equal(selected.defaults.animalId, "a2");
  assert.equal(selected.defaults.date, "2026-09-21");
  assert.equal(selected.defaults.weight, "5.1");
  assert.equal(selected.defaults.type, "Weight");
  assert.equal(Photo.validateReview(selected, animals).ok, true);
});

test("animal matching uses exact strong identifiers before names and surfaces ambiguity", () => {
  const byIdentifier = Photo.exactAnimalMatches({ identifier: "R-101", name: "Wrong Name" }, animals);
  assert.deepEqual(byIdentifier.map((row) => row.id), ["a1"]);

  const duplicateNames = [...animals, { id: "a3", name: "Daisy", sex: "Female", species: "Rabbit" }];
  const byName = Photo.exactAnimalMatches({ name: "Daisy" }, duplicateNames);
  assert.equal(byName.length, 2);
});

test("unsupported documents and missing required fields fail closed", () => {
  const unsupported = Photo.canonicalDraft({ documentType: "unknown", classificationConfidence: 0.4, warnings: ["Unsupported"] }, animals);
  assert.equal(unsupported.classification, "unsupported");
  assert.equal(Photo.validateReview(unsupported, animals).ok, false);

  const missing = Photo.canonicalDraft({
    documentType: "veterinary_document",
    veterinaryRecord: { animalName: "Daisy", date: "", provider: "", summary: "", followUpDate: "" },
    warnings: []
  }, animals);
  assert.equal(Photo.validateReview(missing, animals).ok, false);
});

test("browser review engine has no canonical persistence path", () => {
  assert.doesNotMatch(client, /localStorage|sessionStorage|indexedDB|commitState|saveState/);
  assert.doesNotMatch(client, /state\.(?:animals|health)\.(?:push|splice)|\.animals\.push|\.health\.push/);
  assert.match(client, /invokeFunctionWithDiagnostics\("record-photo-extract"/);
  assert.doesNotMatch(client, /invokeFunctionWithDiagnostics\("photo-record-extract"/);
  assert.match(client, /Nothing has been saved/);
  assert.match(client, /openAnimalForm\("", next\.defaults\)/);
  assert.match(client, /openHealthForm\("", next\.defaults\)/);
  assert.doesNotMatch(edge, /commitState|saveState|state\.animals|state\.health/);
});

test("canonical Animal and Health runtimes remain final save owners", () => {
  assert.match(app, /HerdHarborPhotoAssistedEntry\?\.create/);
  assert.match(app, /function openAnimalForm\(id = "", defaults = \{\}\)/);
  assert.match(animalRuntime, /function openAnimalForm\(id = "", defaults = \{\}\)/);
  assert.match(animalRuntime, /liveState\.animals\.push\(newAnimal\)/);
  assert.match(healthRuntime, /liveState\.health\.push\(\{ id: deps\.uid\("health"\)/);
});

test("photo AI stays production-deployed but lazy-loads only for approved live testers", () => {
  const optional = read("herdharbor-optional-tools.js");
  const appIndex = html.indexOf("herdharbor-app-runtime.js?v=2");
  assert.ok(appIndex >= 0);
  assert.doesNotMatch(html, /<script[^>]+photo-assisted-entry-v1\.8\.3\.js/);
  assert.match(optional, /photoAi:\s*"photo-assisted-entry-v1\.8\.3\.js\?v=2"/);
  assert.match(optional, /isAiLiveTester/);
  assert.match(optional, /ensureAiLiveTools/);
  assert.match(worker, /\.\/photo-assisted-entry-v1\.8\.3\.js\?v=2/);
  assert.match(pkg.scripts["test:v1.8.3"], /photo-assisted-entry-v1\.8\.3\.test\.cjs/);
});

test("telemetry is coarse metadata only", () => {
  const start = client.indexOf("function telemetry");
  const end = client.indexOf("function animalOptions", start);
  const telemetry = client.slice(start, end);
  assert.match(telemetry, /record_class/);
  assert.doesNotMatch(telemetry, /details|name|registrationNumber|tattoo|tag|weight|dataUrl|fileName/);
});
