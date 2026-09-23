"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Analytics = require("../analytics-v1.6.1.js");

const root = path.resolve(__dirname, "..");

function fixture() {
  return {
    settings: { preferredWeightDisplay: "lb+oz" },
    animals: [
      { id: "ancestor", name: "Shared Ancestor", species: "Rabbit", status: "Ancestor Only" },
      { id: "s1", name: "Sire One", species: "Rabbit", sex: "Male", status: "Active", sireId: "ancestor" },
      { id: "d1", name: "Dam One", species: "Rabbit", sex: "Female", status: "Active", sireId: "ancestor" },
      { id: "k1", name: "Retained One", species: "Rabbit", status: "Active", dob: "2026-01-01", sourceBirthId: "l1", sireId: "s1", damId: "d1", weanedDate: "2026-01-29" },
      { id: "k2", name: "Sold One", species: "Rabbit", status: "Sold", dob: "2026-01-01", sourceBirthId: "l1", sireId: "s1", damId: "d1", weanedDate: "2026-01-29" },
      { id: "k3", name: "Deceased One", species: "Rabbit", status: "Deceased", dob: "2026-01-01", sourceBirthId: "l1", sireId: "s1", damId: "d1" },
      { id: "k4", name: "Too Early", species: "Rabbit", status: "Active", dob: "2026-03-01", sourceBirthId: "l2", sireId: "s1", damId: "d1", weanedDate: "2026-03-20" },
      { id: "gs", name: "Goat Sire", species: "Goat", sex: "Male", status: "Active" },
      { id: "gd", name: "Goat Dam", species: "Goat", sex: "Female", status: "Active" },
      { id: "g1", name: "Kid", species: "Goat", status: "Active", dob: "2026-02-01", sourceBirthId: "gl1", sireId: "gs", damId: "gd", weanedDate: "2026-04-01" }
    ],
    breedings: [
      { id: "b1", femaleId: "d1", maleId: "s1", breedingDate: "2025-12-01", status: "Delivered" },
      { id: "b2", femaleId: "d1", maleId: "s1", breedingDate: "2026-02-01", status: "Delivered" },
      { id: "gb1", femaleId: "gd", maleId: "gs", breedingDate: "2025-09-01", status: "Delivered" }
    ],
    litters: [
      { id: "l1", breedingId: "b1", damId: "d1", sireId: "s1", birthDate: "2026-01-01", bornAlive: "3", stillborn: "1", fosteredIn: "0", fosteredOut: "0", lostBeforeWeaning: "1", weaned: "2", offspringIds: ["k1", "k1", "k2", "k3"] },
      { id: "l2", breedingId: "b2", damId: "d1", sireId: "s1", birthDate: "2026-03-01", bornAlive: "2", stillborn: "0", fosteredIn: "0", fosteredOut: "0", lostBeforeWeaning: "", weaned: "0", offspringIds: ["k4"] },
      { id: "gl1", breedingId: "gb1", damId: "gd", sireId: "gs", birthDate: "2026-02-01", bornAlive: "1", stillborn: "0", lostBeforeWeaning: "0", weaned: "1", offspringIds: ["g1"] }
    ],
    health: [
      { id: "k1-old", animalId: "k1", type: "Weight", date: "2026-01-11", weight: "1", weightUnit: "lb", createdAt: "2026-01-11T12:00:00Z" },
      { id: "k1-latest", animalId: "k1", type: "Weight", date: "2026-01-11", weight: "1.25", weightUnit: "lb", createdAt: "2026-01-11T13:00:00Z" },
      { id: "k2-age-10", animalId: "k2", type: "Weight", date: "2026-01-11", weight: "20", weightUnit: "oz", createdAt: "2026-01-11T12:30:00Z" },
      { id: "k3-only", animalId: "k3", type: "Weight", date: "2026-01-15", weight: "1.5", weightUnit: "lb", createdAt: "2026-01-15T12:00:00Z" },
      { id: "k1-wean", animalId: "k1", type: "Weight", date: "2026-01-29", weight: "2", weightUnit: "lb", createdAt: "2026-01-29T12:00:00Z" },
      { id: "k2-wean", animalId: "k2", type: "Weight", date: "2026-01-29", weight: "2.25", weightUnit: "lb", createdAt: "2026-01-29T12:00:00Z" },
      { id: "note", animalId: "k4", type: "Observation", date: "2026-03-20", details: "weight looked near two pounds" }
    ],
    sales: [
      { id: "sale-complete", status: "Completed", saleDate: "2026-02-01", items: [{ animalId: "k2", salePrice: "75" }] },
      { id: "sale-cancelled", status: "Cancelled", saleDate: "2026-02-02", items: [{ animalId: "k3", salePrice: "50" }] }
    ]
  };
}

test("Phase 9C keeps canonical Health records as the only dated weight source", () => {
  const state = fixture();
  const before = structuredClone(state);
  const rows = Analytics.weightRows(state, { species: "Rabbit", range: "all", includeBirth: false });
  assert.equal(rows.some((row) => row.id === "note"), false, "free-text observations are not parsed into weights");
  assert.equal(rows.find((row) => row.id === "k2-age-10").recordedUnit, "oz");
  assert.deepEqual(state, before, "display conversion must not rewrite stored units or canonical state");
});

test("same-day aggregation preserves the existing latest-created-record rule", () => {
  const rows = Analytics.weightRows(fixture(), { range: "all", includeBirth: false });
  const sameDay = Analytics.latestSameDayWeightRows(rows);
  assert.equal(sameDay.some((row) => row.id === "k1-old"), false);
  assert.equal(sameDay.find((row) => row.animalId === "k1" && row.date === "2026-01-11").id, "k1-latest");
  assert.equal(Analytics.latestWeightRowsByAnimal(rows).find((row) => row.animalId === "k1").id, "k1-wean");
});

test("litter outcomes preserve partial data and reject zero or unresolved denominators", () => {
  const result = Analytics.litterOutcomeAnalytics(fixture(), { species: "Rabbit", range: "all" });
  const complete = result.rows.find((row) => row.id === "l1");
  const partial = result.rows.find((row) => row.id === "l2");
  assert.equal(complete.born, 4);
  assert.equal(complete.survivalToWeaning, 2 / 3 * 100);
  assert.deepEqual(complete.outcomes, { retained: 1, sold: 1, deceased: 1, other: 0 });
  assert.equal(partial.survivalToWeaning, null);
  assert.equal(partial.dataStatus, "partial");
  const zero = Analytics.litterOutcomeAnalytics({ animals: [], breedings: [], litters: [{ id: "z", birthDate: "2026-01-01", bornAlive: "0", stillborn: "0", lostBeforeWeaning: "0", weaned: "0" }] }, { range: "all" });
  assert.equal(zero.rows[0].survivalToWeaning, null);
});

test("comparable litter averages require real same-age samples and never synthesize missing weights", () => {
  const result = Analytics.litterWeightPerformance(fixture(), { litterId: "l1", range: "all", basis: "age" });
  const day10 = result.rows[0].comparable.find((row) => row.ageDays === 10);
  const day14 = result.rows[0].comparable.find((row) => row.ageDays === 14);
  assert.equal(day10.sampleSize, 2);
  assert.equal(day10.averageGrams, Analytics.normalizeWeight(1.25, "lb"));
  assert.equal(day14.sampleSize, 1);
  assert.equal(day14.averageGrams, null);
  assert.equal(day14.dataStatus, "insufficient data");
});

test("sire, dam and pair aggregation count each canonical offspring once despite linebreeding and duplicate links", () => {
  const state = fixture();
  const sire = Analytics.parentOffspringPerformance(state, "sire", { species: "Rabbit", range: "all", sireId: "s1" });
  const dam = Analytics.parentOffspringPerformance(state, "dam", { species: "Rabbit", range: "all", damId: "d1" });
  const pair = Analytics.pairingOffspringPerformance(state, { species: "Rabbit", range: "all", sireId: "s1", damId: "d1" });
  assert.deepEqual(sire[0].offspringIds.sort(), ["k1", "k2", "k3", "k4"]);
  assert.deepEqual(dam[0].offspringIds.sort(), ["k1", "k2", "k3", "k4"]);
  assert.deepEqual(pair[0].offspringIds.sort(), ["k1", "k2", "k3", "k4"]);
  assert.equal(pair[0].litterCount, 2);
});

test("retained versus sold comparison is descriptive and exposes sample sizes", () => {
  const comparison = Analytics.retainedSoldComparison(fixture(), { species: "Rabbit", range: "all" });
  const retained = comparison.groups.find((row) => row.outcome === "retained");
  const sold = comparison.groups.find((row) => row.outcome === "sold");
  assert.equal(retained.animalCount, 2);
  assert.equal(sold.animalCount, 1);
  assert.equal(sold.averageLatestWeightGrams, null);
  assert.equal(sold.dataStatus, "insufficient data");
  assert.match(comparison.note, /do not establish causation/i);
});

test("weaning analytics require actual dates and exact same-day weights while preserving the rabbit 28-day safeguard", () => {
  const result = Analytics.weaningPerformance(fixture(), { species: "Rabbit", range: "all" });
  assert.equal(result.rows.length, 3);
  assert.equal(result.validRows.length, 2);
  assert.equal(result.weightSampleSize, 2);
  assert.equal(result.invalidRabbitRecords, 1);
  assert.equal(result.rows.find((row) => row.animalId === "k4").safeguardValid, false);
  assert.equal(result.rows.find((row) => row.animalId === "k4").weight, null, "free-text or age alone cannot invent a weaning weight");
});

test("species, litter, date and current/historical filters are explicit and mutation-free", () => {
  const state = fixture();
  const before = JSON.stringify(state);
  assert.deepEqual(Analytics.litterOutcomeAnalytics(state, { species: "Goat", range: "all" }).rows.map((row) => row.id), ["gl1"]);
  assert.deepEqual(Analytics.litterOutcomeAnalytics(state, { species: "Rabbit", litterId: "l2", range: "all" }).rows.map((row) => row.id), ["l2"]);
  assert.deepEqual(Analytics.litterOutcomeAnalytics(state, { species: "Rabbit", range: "custom", start: "2026-02-01", end: "2026-03-31" }).rows.map((row) => row.id), ["l2"]);
  assert.deepEqual(Analytics.litterOutcomeAnalytics(state, { species: "Rabbit", range: "all", offspringScope: "current", litterId: "l1" }).rows[0].offspring.map((row) => row.id), ["k1"]);
  assert.deepEqual(Analytics.litterOutcomeAnalytics(state, { species: "Rabbit", range: "all", offspringScope: "historical", litterId: "l1" }).rows[0].offspring.map((row) => row.id), ["k2", "k3"]);
  assert.equal(JSON.stringify(state), before);
});

test("Phase 9C UI keeps quality labels, accessible charts, mobile tables and no analytics persistence path", () => {
  const js = fs.readFileSync(path.join(root, "analytics-v1.6.1.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "analytics-v1.6.1.css"), "utf8");
  assert.equal(Analytics.BUILD_ID, "analytics-growth-litter-performance-1");
  assert.match(js, /Insufficient data/);
  assert.match(js, /Descriptive recorded outcomes only; differences do not establish causation/);
  assert.match(js, /role="img" aria-label/);
  assert.doesNotMatch(js, /localStorage|sessionStorage|indexedDB/);
  assert.match(css, /\.analytics-performance-filters/);
  assert.match(css, /@media \(max-width: 430px\)/);
  assert.match(css, /overflow-x: auto/);
});
