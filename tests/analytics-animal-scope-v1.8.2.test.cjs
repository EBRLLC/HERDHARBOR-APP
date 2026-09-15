const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const analytics = require("../analytics-v1.6.1.js");

const source = {
  animals: [
    { id: "active", name: "Active", species: "Rabbit", status: "Active" },
    { id: "forsale", name: "For Sale", species: "Rabbit", status: "For Sale" },
    { id: "reserved", name: "Reserved", species: "Rabbit", status: "Reserved" },
    { id: "ancestor-birth", name: "Ancestor Birth", species: "Rabbit", status: "Ancestor Only", dob: "2024-01-01", birthWeight: 3, birthWeightUnit: "lb" },
    { id: "ancestor-health", name: "Ancestor Health", species: "Rabbit", status: "Ancestor Only" },
    { id: "ancestor-empty", name: "Ancestor Empty", species: "Rabbit", status: "Ancestor Only" },
    { id: "sold", name: "Sold", species: "Rabbit", status: "Sold" },
    { id: "deceased", name: "Deceased", species: "Rabbit", status: "Deceased" },
    { id: "archived", name: "Archived", species: "Rabbit", status: "Archived" },
    { id: "goat", name: "Goat", species: "Goat", status: "Active" }
  ],
  health: [
    { id: "h1", animalId: "ancestor-health", date: "2025-01-01", weight: 5, weightUnit: "lb" },
    { id: "h2", animalId: "ancestor-empty", date: "2025-01-01", weight: "", weightUnit: "lb" }
  ]
};

test("growth analytics defaults to current animals and excludes pedigree-only/history records", () => {
  const result = analytics.growthAnimalOptions(source, { species: "Rabbit", includeAncestors: false });
  assert.deepEqual(result.available.map((animal) => animal.id), ["active", "forsale", "reserved"]);
  assert.deepEqual(result.ancestors.map((animal) => animal.id), ["ancestor-birth", "ancestor-health"]);
});

test("ancestor growth option only exposes ancestors with real plottable weight data", () => {
  const result = analytics.growthAnimalOptions(source, { species: "Rabbit", includeAncestors: true });
  assert.deepEqual(result.available.map((animal) => animal.id), ["active", "forsale", "reserved", "ancestor-birth", "ancestor-health"]);
  assert.equal(analytics.hasRecordedGrowthData(source, "ancestor-birth"), true);
  assert.equal(analytics.hasRecordedGrowthData(source, "ancestor-health"), true);
  assert.equal(analytics.hasRecordedGrowthData(source, "ancestor-empty"), false);
});

test("growth animal eligibility respects species and current-record semantics", () => {
  assert.equal(analytics.isCurrentAnalyticsAnimal({ status: "Active" }), true);
  assert.equal(analytics.isCurrentAnalyticsAnimal({ status: "Reserved" }), true);
  assert.equal(analytics.isCurrentAnalyticsAnimal({ status: "Ancestor Only" }), false);
  assert.equal(analytics.isCurrentAnalyticsAnimal({ status: "Sold" }), false);
  assert.deepEqual(analytics.growthAnimalOptions(source, { species: "Goat", includeAncestors: true }).available.map((animal) => animal.id), ["goat"]);
});

test("growth UI exposes an ancestor scope only through the data-aware control", () => {
  const text = fs.readFileSync(path.join(__dirname, "..", "analytics-v1.6.1.js"), "utf8");
  assert.match(text, /data-growth-animal-scope/);
  assert.match(text, /Active \/ current animals/);
  assert.match(text, /Active \+ ancestors with growth data/);
  assert.doesNotMatch(text, /array\("animals"\)\.filter\(\(record\) => !ui\.species \|\| record\.species === ui\.species\)\.map\(\(record, index\)/);
});
