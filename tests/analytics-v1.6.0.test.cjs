const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const analytics = require("../analytics-v1.6.0.js");

test("normalizes supported weight units without changing source values", () => {
  assert.equal(analytics.normalizeWeight(1, "kg"), 1000);
  assert.equal(Math.round(analytics.normalizeWeight(1, "lb") * 1e5) / 1e5, 453.59237);
  assert.equal(Math.round(analytics.normalizeWeight(16, "oz") * 1e5) / 1e5, 453.59237);
  assert.equal(analytics.normalizeWeight(1000, "g"), 1000);
  assert.equal(analytics.normalizeWeight(4, "stone"), null);
});

test("calculates average daily and weekly gain using elapsed days", () => {
  const rows = [
    { date: "2026-01-01", grams: analytics.normalizeWeight(4, "lb") },
    { date: "2026-01-11", grams: analytics.normalizeWeight(5, "lb") }
  ];
  const result = analytics.growthSummary(rows);
  assert.equal(result.days, 10);
  assert.ok(Math.abs(result.dailyGainGrams - analytics.normalizeWeight(.1, "lb")) < 1e-8);
  assert.ok(Math.abs(result.weeklyGainGrams - analytics.normalizeWeight(.7, "lb")) < 1e-8);
  assert.ok(Math.abs(result.previousGainGrams - analytics.normalizeWeight(1, "lb")) < 1e-8);
});

test("same-day weight records never divide by zero", () => {
  const result = analytics.growthSummary([
    { date: "2026-01-01", grams: 1000 },
    { date: "2026-01-01", grams: 1100 }
  ]);
  assert.equal(result.days, 0);
  assert.equal(result.dailyGainGrams, null);
});

test("litter calculations use structured counts", () => {
  const result = analytics.litterAnalytics({ litters: [
    { birthDate: "2026-01-01", bornAlive: "6", weaned: "5", stillborn: "1" },
    { birthDate: "2026-02-01", bornAlive: "8", weaned: "7", stillborn: "0" },
    { birthDate: "2026-03-01", bornAlive: "10", weaned: "9", stillborn: "2" }
  ] });
  assert.equal(result.averageLitter, 8);
  assert.equal(result.largestLitter, 10);
  assert.equal(result.weaned, 21);
  assert.equal(result.stillborn, 3);
  assert.equal(result.survival, 87.5);
});

test("breeding without a result remains pending rather than failed", () => {
  const source = { breedings: [
    { id: "a", breedingDate: "2026-01-01", status: "Delivered" },
    { id: "b", breedingDate: "2026-01-02", status: "Not pregnant" },
    { id: "c", breedingDate: "2026-01-03", status: "Bred" },
    { id: "d", breedingDate: "2026-01-04", status: "Pregnancy check due" }
  ], litters: [] };
  const result = analytics.breedingAnalytics(source);
  assert.equal(result.success.length, 1);
  assert.equal(result.failed.length, 1);
  assert.equal(result.pending.length, 2);
  assert.equal(result.rate, 50);
});

test("sales keep sale-price analytics separate from received revenue", () => {
  const source = {
    animals: [{ id: "a", species: "Rabbit" }, { id: "b", species: "Rabbit" }, { id: "c", species: "Rabbit" }],
    sales: [
      { id: "s1", saleDate: "2026-01-01", status: "Completed", items: [{ animalId: "a", unitPrice: "50" }] },
      { id: "s2", saleDate: "2026-01-02", status: "Completed", items: [{ animalId: "b", unitPrice: "100" }] },
      { id: "s3", saleDate: "2026-01-03", status: "Completed", items: [{ animalId: "c", unitPrice: "150" }] }
    ],
    payments: [
      { saleId: "s1", date: "2026-01-01", amount: "50" },
      { saleId: "s2", date: "2026-01-02", amount: "75" }
    ]
  };
  const result = analytics.salesAnalytics(source);
  assert.equal(result.invoiced, 300);
  assert.equal(result.average, 100);
  assert.equal(result.median, 100);
  assert.equal(result.highest, 150);
  assert.equal(result.lowest, 50);
  assert.equal(result.revenue, 125);
});

test("date ranges include exact boundaries", () => {
  assert.deepEqual(analytics.rangeBounds("custom", "2026-01-01", "2026-01-31"), { start: "2026-01-01", end: "2026-01-31" });
  assert.deepEqual(analytics.rangeBounds("30d", "", "", "2026-01-30"), { start: "2026-01-01", end: "2026-01-30" });
});

test("analytics navigation, responsive assets, and offline shell are wired", () => {
  const root = path.join(__dirname, "..");
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "analytics-v1.6.0.css"), "utf8");
  const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
  assert.match(index, /data-route="analytics"/);
  assert.match(index, /id="view-analytics"/);
  assert.match(index, /analytics-v1\.6\.0\.js/);
  assert.match(index, /detail-analytics/);
  assert.match(css, /@media \(max-width: 430px\)/);
  assert.match(css, /overflow-x: auto/);
  assert.match(worker, /analytics-v1\.6\.0\.js/);
  assert.match(worker, /analytics-v1\.6\.0\.css/);
});
