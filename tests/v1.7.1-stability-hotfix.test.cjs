"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const hotfix = require(path.resolve(__dirname, "../herdharbor-v1.7.1-stability-hotfix.js"));
const source = fs.readFileSync(path.resolve(__dirname, "../herdharbor-v1.7.1-stability-hotfix.js"), "utf8");

function state() {
  return {
    animals: [
      { id: "rabbit-doe", name: "Doe", species: "Rabbit", sex: "Female", status: "Active" },
      { id: "rabbit-buck", name: "Buck", species: "Rabbit", sex: "Male", status: "Active" },
      { id: "goat-buck", name: "Goat", species: "Goat", sex: "Male", status: "Active" },
      { id: "sold-buck", name: "Sold", species: "Rabbit", sex: "Male", status: "Sold" },
      { id: "child", name: "Child", species: "Rabbit", sex: "Female", status: "Growing", sireId: "rabbit-buck", damId: "rabbit-doe" }
    ],
    litters: [{ id: "birth-1", damId: "rabbit-doe", sireId: "rabbit-buck" }],
    health: [
      { id: "w1", animalId: "rabbit-doe", type: "Weight", date: "2026-09-01", weight: "3", weightOunces: "15", weightUnit: "lb+oz" },
      { id: "w2", animalId: "rabbit-doe", type: "Weight", date: "2026-09-05", weight: "3", weightOunces: "8", weightUnit: "lb+oz" }
    ],
    pedigrees: [], breedings: [],
    healthIntelligence: {
      episodes: [{ id: "ep", animalId: "rabbit-doe", species: "rabbit", quarantined: true, resolved: false }],
      careRecords: [{ id: "care", animalId: "rabbit-doe", species: "rabbit" }],
      groupRecords: [{ id: "group", species: "rabbit", animalIds: ["rabbit-doe", "rabbit-buck"], targetCount: 2 }]
    }
  };
}

test("parent validation blocks self-parent and cross-species pedigree links", () => {
  const s = state();
  assert.match(hotfix.validateParents({ animalId: "rabbit-doe", species: "Rabbit", sireId: "rabbit-doe" }, s)[0], /own sire/i);
  assert.match(hotfix.validateParents({ animalId: "rabbit-doe", species: "Rabbit", sireId: "goat-buck" }, s)[0], /same species/i);
  assert.equal(hotfix.validateParents({ animalId: "rabbit-doe", species: "Rabbit", sireId: "rabbit-buck" }, s).length, 0);
});

test("breeding validation blocks inactive and quarantined new selections while preserving unchanged historical edits", () => {
  const s = state();
  assert.match(hotfix.validateBreeding({ femaleId: "rabbit-doe", maleId: "rabbit-buck" }, s).join(" "), /quarantined/i);
  assert.match(hotfix.validateBreeding({ femaleId: "child", maleId: "sold-buck" }, s).join(" "), /not currently on the farm/i);
  assert.equal(hotfix.validateBreeding({ femaleId: "rabbit-doe", maleId: "rabbit-buck", initialFemaleId: "rabbit-doe", initialMaleId: "rabbit-buck" }, s).length, 0);
});

test("group health snapshot freezes the active animals of the selected species", () => {
  const s = state();
  assert.deepEqual(hotfix.snapshotGroupAnimalIds("Rabbit", s), ["rabbit-doe", "rabbit-buck", "child"]);
  assert.deepEqual(hotfix.snapshotGroupAnimalIds("Goat", s), ["goat-buck"]);
});

test("animal deletion dependency scan protects lineage, birth, and Health Intelligence references", () => {
  const deps = hotfix.deleteDependencies("rabbit-doe", state()).join(" ");
  assert.match(deps, /descendant/i);
  assert.match(deps, /birth\/litter/i);
  assert.match(deps, /Health Intelligence/i);
});

test("lb+oz weights include the ounces component", () => {
  const grams = hotfix.combinedWeightGrams({ weight: "3", weightOunces: "8", weightUnit: "lb+oz" });
  assert.ok(Math.abs(grams - ((3 * 16 + 8) * 28.349523125)) < 0.0001);
});

test("animal health count includes legacy, episode, care, and snapshotted group records", () => {
  assert.equal(hotfix.healthRecordCount("rabbit-doe", state()), 5);
});

test("urgency display labels preserve legacy filter values", () => {
  assert.equal(hotfix.legacyUrgency("Emergency"), "Emergency now");
  assert.equal(hotfix.legacyUrgency("Urgent"), "Contact a vet soon");
  assert.equal(hotfix.legacyUrgency("Monitor closely"), "Monitor and call");
  assert.equal(hotfix.displayUrgency("Emergency now"), "Emergency");
});

test("browser patch includes species API aliases, current-farm symptom filtering, Health Intelligence export, and legacy clear-data cleanup", () => {
  assert.match(source, /isActiveAnimal:base\.isCurrentAnimal/);
  assert.match(source, /activeSpecies:/);
  assert.match(source, /options\.includeHistorical===true/);
  assert.match(source, /#symptom-animal/);
  assert.match(source, /LEGACY_HEALTH_KEY/);
  assert.match(source, /Health Episodes/);
  assert.match(source, /Structured Care/);
  assert.match(source, /Group Health/);
  assert.match(source, /data-hh-health-history/);
  assert.match(source, /data-hh-history-edit/);
  assert.match(source, /data-hh-history-delete/);
  assert.match(source, /pendingSaleNumbersFromFile/);
  assert.match(source, /sale.status==='Draft'/);
  assert.match(source, /sale.status='Pending'/);
});

test("production publisher is authoritative, current-SHA based, and no longer requires a manual rerun", () => {
  const workflow = fs.readFileSync(path.resolve(__dirname, "../.github/workflows/v1.6.7-final-production-pages-closeout.yml"), "utf8");
  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /ref: \${{ github\.sha }}/);
  assert.match(workflow, /pages-build-deployment/);
  assert.match(workflow, /herdharbor-v1\.7\.1-stability-hotfix\.js/);
  assert.doesNotMatch(workflow, /github\.run_attempt == 1/);
  assert.doesNotMatch(workflow, /aad206c5b5c69395d8d5405c1e9ee1b0840c1d34/);
});
