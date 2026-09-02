"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const analytics = require("../analytics-v1.6.1.js");

const root = path.resolve(__dirname, "..");
const fixture = {
  settings: { preferredWeightDisplay: "lb+oz", analyticsColors: { "species:Rabbit": "#123456" } },
  animals: [
    { id: "r1", name: "Rabbit One", species: "Rabbit", breed: "Holland Lop", sex: "Female", dob: "2026-01-01", birthWeight: "2", birthWeightUnit: "lb+oz", birthWeightOunces: "4" },
    { id: "c1", name: "Cattle One", species: "Cattle", breed: "Angus", sex: "Male", dob: "2025-01-01", birthWeight: "30", birthWeightUnit: "kg" },
    { id: "ch1", name: "Chicken One", species: "Chicken", breed: "Leghorn", sex: "Female", dob: "2026-02-01", birthWeight: "35", birthWeightUnit: "g" }
  ],
  health: [
    { id: "hr1", animalId: "r1", type: "Weight", date: "2026-01-15", weight: "3", weightUnit: "lb" },
    { id: "hr2", animalId: "r1", type: "Weight", date: "2026-02-15", weight: "4", weightUnit: "lb+oz", weightOunces: "6" },
    { id: "hc1", animalId: "c1", type: "Weight", date: "2026-01-15", weight: "50000", weightUnit: "g" },
    { id: "hh1", animalId: "ch1", type: "Observation", date: "2026-02-15", details: "weight might be 4 pounds; do not parse this note" }
  ],
  breedings: [
    { id: "br", damId: "r1", breedingDate: "2026-03-01", status: "Delivered" },
    { id: "bc", damId: "c1", breedingDate: "2026-03-02", status: "Not pregnant" },
    { id: "bch", damId: "ch1", breedingDate: "2026-03-03", status: "Bred" }
  ],
  litters: [
    { id: "lr", breedingId: "br", damId: "r1", birthDate: "2026-04-01", bornAlive: "8", stillborn: "1", weaned: "6" },
    { id: "lc", breedingId: "bc", damId: "c1", birthDate: "2026-04-02", bornAlive: "1", stillborn: "0", weaned: "1" },
    { id: "lch", breedingId: "unlinked-chicken-history", damId: "ch1", birthDate: "2026-04-03", bornAlive: "10", stillborn: "0", weaned: "" }
  ],
  productionRecords: [
    { id: "pe1", date: "2026-05-01", product: "Eggs", unit: "eggs", quantity: "12", species: "Chicken" },
    { id: "pe2", date: "2026-05-02", product: "Eggs", unit: "dozen", quantity: "1", animalId: "ch1" },
    { id: "pe3", date: "2026-05-03", product: "Eggs", unit: "cartons", quantity: "2", species: "Chicken" },
    { id: "pm1", date: "2026-05-01", product: "Milk", unit: "gallons", quantity: "1", species: "Cattle" },
    { id: "pm2", date: "2026-05-02", product: "Milk", unit: "quarts", quantity: "4", animalId: "c1" },
    { id: "pr1", date: "2026-05-03", product: "Other", unit: "units", quantity: "3", species: "Rabbit" }
  ],
  shows: [
    { id: "sr", startDate: "2026-06-01" }, { id: "sc", startDate: "2026-06-02" }, { id: "sch", startDate: "2026-06-03" }
  ],
  showEntries: [
    { id: "er", showId: "sr", animalId: "r1" }, { id: "ec", showId: "sc", animalId: "c1" }, { id: "ech", showId: "sch", animalId: "ch1" }
  ],
  showResults: [
    { id: "rr", entryId: "er", placementNumber: 1 }, { id: "rc", entryId: "ec", placementNumber: 2 }, { id: "rch", entryId: "ech", placementNumber: 3 }
  ],
  showAwards: [
    { id: "ar", entryId: "er", awardType: "Best of Breed" }, { id: "ac", entryId: "ec", awardType: "Champion" }, { id: "ach", entryId: "ech", awardType: "Champion" }
  ],
  sales: [
    { id: "sm", status: "Completed", completedAt: "2026-07-01T12:00:00Z", saleDate: "2026-07-01", items: [
      { id: "ir", animalId: "r1", unitPrice: "100", salePrice: "100" },
      { id: "ich", animalId: "ch1", unitPrice: "25", salePrice: "25" }
    ] },
    { id: "sc", status: "Completed", completedAt: "2026-07-02T12:00:00Z", saleDate: "2026-07-02", items: [
      { id: "ic", animalId: "c1", unitPrice: "500", salePrice: "500" }
    ] },
    { id: "draft", status: "Draft", saleDate: "2026-07-03", items: [{ id: "draft-r", animalId: "r1", unitPrice: "999" }] }
  ],
  payments: [
    { id: "pay-mixed", saleId: "sm", date: "2026-07-01", amount: "125" },
    { id: "pay-cattle", saleId: "sc", date: "2026-07-02", amount: "500" }
  ],
  transactions: [
    { id: "fr", type: "Expense", category: "Feed", date: "2026-08-01", scope: "Species", species: "Rabbit", amount: "10" },
    { id: "fc", type: "Expense", category: "Feed", date: "2026-08-01", scope: "Species", species: "Cattle", amount: "20" },
    { id: "fch", type: "Expense", category: "Feed", date: "2026-08-01", scope: "Species", species: "Chicken", amount: "5" },
    { id: "fo", type: "Expense", category: "Feed", date: "2026-08-01", scope: "Operation", species: "", amount: "30" }
  ]
};

test("Alpha v1.6.5 exposes the complete shared Analytics contract", () => {
  assert.equal(analytics.VERSION, "1.6.5");
  assert.deepEqual(analytics.TABS.map(([id]) => id), ["overview", "growth", "breeding", "litters", "production", "eggs", "milk", "shows", "sales", "revenue", "feed", "health", "market"]);
  assert.equal(typeof analytics.lineChart, "function");
  assert.equal(typeof analytics.barChart, "function");
  for (const metric of analytics.METRICS) assert.ok(metric.visualizations.every((kind) => ["line", "bar", "summary", "table"].includes(kind)));
});

test("all approved weight units normalize and lb+oz preserves a factual combined value", () => {
  assert.equal(analytics.normalizeWeight(1, "lb"), 453.59237);
  assert.equal(analytics.normalizeWeight(4, "lb+oz", 6), 4 * 453.59237 + 6 * 28.349523125);
  assert.equal(analytics.normalizeWeight(16, "oz"), 453.59237);
  assert.equal(analytics.normalizeWeight(1, "kg"), 1000);
  assert.equal(analytics.normalizeWeight(1000, "g"), 1000);
  assert.match(analytics.displayWeight(analytics.normalizeWeight(4, "lb+oz", 6), "lb+oz"), /^4 lb 6 oz$/);
  assert.match(analytics.displayWeight(-analytics.normalizeWeight(0, "lb+oz", 2), "lb+oz"), /^−0 lb 2 oz$/);
});

test("Growth uses birth weight when factual and otherwise first record, with complete metrics and history", () => {
  const rows = analytics.weightRows(fixture, { species: "Rabbit", range: "all" });
  const summary = analytics.growthSummary(rows);
  assert.equal(summary.birth.isBirth, true);
  assert.equal(summary.first, summary.birth);
  assert.equal(summary.firstRecorded.id, "hr1");
  assert.equal(summary.latest.id, "hr2");
  assert.equal(summary.highest.id, "hr2");
  assert.equal(summary.lowest.id, "birth:r1");
  assert.equal(summary.measurementCount, 2);
  assert.equal(summary.days, 45);
  assert.ok(summary.dailyGainGrams > 0);
  assert.ok(summary.weeklyGainGrams > summary.dailyGainGrams);
  assert.ok(summary.previousGainGrams > 0);
  const history = analytics.weightHistory(rows, "lb+oz");
  assert.equal(history.length, 3);
  assert.equal(history[0].age, "Birth");
  assert.equal(history[1].changeGrams > 0, true);

  const noBirth = analytics.growthSummary(rows.filter((row) => !row.isBirth));
  assert.equal(noBirth.birth, null);
  assert.equal(noBirth.first.id, "hr1");
});

test("age presets and custom filters use DOB to actual measurement date", () => {
  const rows = analytics.weightRows(fixture, { species: "Rabbit", range: "all" });
  assert.deepEqual(analytics.ageRangeBounds("8w"), { start: 0, end: 56 });
  assert.deepEqual(analytics.ageRangeBounds("12w"), { start: 0, end: 84 });
  assert.deepEqual(analytics.ageRangeBounds("6m"), { start: 0, end: 183 });
  assert.deepEqual(analytics.ageRangeBounds("custom", 10, 30), { start: 10, end: 30 });
  assert.equal(analytics.filterGrowthByAge(rows, "8w").rows.length, 3);
  assert.deepEqual(analytics.filterGrowthByAge(rows, "custom", 10, 30).rows.map((row) => row.id), ["hr1"]);
  assert.match(analytics.filterGrowthByAge([{ date: "2026-01-01", dob: "", ageDays: null }], "8w").error, /Date of birth is required/);
});

test("Rabbit, Cattle, and Chicken remain isolated in every species-aware module", () => {
  const expected = { Rabbit: { breeding: "br", litter: "lr", show: "er", sale: "ir", feed: 10, health: 2 }, Cattle: { breeding: "bc", litter: "lc", show: "ec", sale: "ic", feed: 20, health: 1 }, Chicken: { breeding: "bch", litter: "lch", show: "ech", sale: "ich", feed: 5, health: 0 } };
  for (const [species, ids] of Object.entries(expected)) {
    const options = { species, range: "all" };
    assert.deepEqual(analytics.breedingAnalytics(fixture, options).rows.map((row) => row.id), [ids.breeding]);
    assert.deepEqual(analytics.litterAnalytics(fixture, options).litters.map((row) => row.id), [ids.litter]);
    assert.deepEqual(analytics.showAnalytics(fixture, options).entriesData.map((row) => row.id), [ids.show]);
    assert.deepEqual(analytics.salesAnalytics(fixture, options).itemRows.map((row) => row.item.id), [ids.sale]);
    assert.equal(analytics.feedAnalytics(fixture, options).total, ids.feed);
    assert.equal(analytics.healthAnalytics(fixture, options).count, ids.health);
    assert.ok(analytics.productionRows(fixture, options).every((row) => analytics.productionSpecies(fixture, row) === species));
  }
});

test("pending breeding remains pending and incomplete weaning is not a fabricated loss", () => {
  const chicken = analytics.breedingAnalytics(fixture, { species: "Chicken", range: "all" });
  assert.equal(chicken.pending.length, 1);
  assert.equal(chicken.failed.length, 0);
  assert.equal(chicken.rate, null);
  const all = analytics.litterAnalytics(fixture, { range: "all" });
  assert.equal(all.totalBorn, 19);
  assert.equal(all.survival, 7 / 9 * 100);
});

test("production keeps products and incompatible units separate while Eggs and Milk use valid conversions", () => {
  const production = analytics.productionAnalytics(fixture, { range: "all" });
  assert.ok(production.groups.some((group) => group.product === "Eggs" && group.unit === "eggs" && group.total === 24));
  assert.ok(production.groups.some((group) => group.product === "Eggs" && group.unit === "cartons" && group.total === 2));
  assert.ok(!production.groups.some((group) => group.total === 24 + 2 + 3));
  const eggs = analytics.eggAnalytics(fixture, { species: "Chicken", range: "all" });
  assert.equal(eggs.totalEggs, 24);
  assert.equal(eggs.separate.get("cartons").length, 1);
  const milk = analytics.milkAnalytics(fixture, { species: "Cattle", range: "all" });
  assert.ok(Math.abs(milk.totalLiters - 7.570823568) < 1e-9);
});

test("shows and completed sale items are species-safe and draft sales never contribute", () => {
  const rabbitShow = analytics.showAnalytics(fixture, { species: "Rabbit", range: "all" });
  assert.equal(rabbitShow.shows, 1);
  assert.equal(rabbitShow.firsts, 1);
  assert.equal(rabbitShow.awards, 1);
  assert.equal(rabbitShow.bestOfBreed, 1);
  const rabbitSales = analytics.salesAnalytics(fixture, { species: "Rabbit", range: "all" });
  assert.equal(rabbitSales.count, 1);
  assert.equal(rabbitSales.average, 100);
  assert.equal(rabbitSales.median, 100);
  assert.equal(rabbitSales.lowest, 100);
  assert.equal(rabbitSales.highest, 100);
  assert.equal(rabbitSales.invoiced, 100, "a mixed invoice is filtered at sale-item level");
});

test("Revenue uses payments only and refuses fabricated allocation of a mixed invoice", () => {
  const all = analytics.revenueAnalytics(fixture, { range: "all" });
  assert.equal(all.revenue, 625);
  assert.equal(all.mixedUnallocatedRevenue, 125);
  assert.equal(analytics.revenueAnalytics(fixture, { species: "Rabbit", range: "all" }).revenue, 0);
  assert.equal(analytics.revenueAnalytics(fixture, { species: "Chicken", range: "all" }).revenue, 0);
  assert.equal(analytics.revenueAnalytics(fixture, { species: "Cattle", range: "all" }).revenue, 500);
});

test("Health uses structured numeric weight only and never parses free text", () => {
  const chicken = analytics.healthAnalytics(fixture, { species: "Chicken", range: "all" });
  assert.equal(chicken.count, 0);
  assert.deepEqual(chicken.supportedMetrics, ["Weight"]);
});

test("v1.6.5 UI assets cover charts, colors, mobile, dark mode, and offline startup", () => {
  const js = fs.readFileSync(path.join(root, "analytics-v1.6.1.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "analytics-v1.6.1.css"), "utf8");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
  assert.match(js, /function lineChart/);
  assert.match(js, /function barChart/);
  assert.match(js, /data-series-color/);
  assert.match(js, /animal:/);
  assert.match(js, /species:/);
  assert.match(js, /product:/);
  assert.match(js, /metric:/);
  assert.match(css, /@media \(max-width: 430px\)/);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /html\[data-theme="dark"\]/);
  assert.match(css, /overflow-x: auto/);
  assert.match(html, /preferredWeightDisplay/);
  assert.match(worker, /market-analytics-v1\.6\.5\.js/);
  assert.match(worker, /analytics-v1\.6\.1\.js\?v=1\.6\.5/);
});
