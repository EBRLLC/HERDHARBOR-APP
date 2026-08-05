const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const start = html.indexOf("  function productionSpecies(record)");
const end = html.indexOf("  function renderBudget()", start);
assert.ok(start >= 0 && end > start, "production reporting helpers are present");

const state = {
  animals: [
    { id: "cow-1", name: "Bessie", species: "Cattle", status: "Active" },
    { id: "hen-1", name: "Layer flock animal", species: "Chicken", status: "Active" }
  ],
  productionRecords: []
};
const records = [
  ...["2026-08-01", "2026-08-02", "2026-08-03"].map((date, index) => ({
    id: `milk-prior-${index}`,
    date,
    product: "Milk",
    scope: "Animal",
    species: "Cattle",
    animalId: "cow-1",
    groupName: "Jersey herd",
    unit: "gallons",
    quantity: "10",
    soldQuantity: "4",
    householdQuantity: "1",
    feedQuantity: "2",
    setAsideQuantity: "1",
    donatedQuantity: "1",
    wasteQuantity: "1",
    saleAmount: "20.00",
    updatedAt: `${date}T18:00:00.000Z`
  })),
  {
    id: "milk-current",
    date: "2026-08-04",
    product: "Milk",
    scope: "Animal",
    species: "Cattle",
    animalId: "cow-1",
    groupName: "Jersey herd",
    unit: "gallons",
    quantity: "5",
    soldQuantity: "2",
    householdQuantity: "1",
    feedQuantity: "1",
    setAsideQuantity: "0",
    donatedQuantity: "0",
    wasteQuantity: "1",
    saleAmount: "12.00",
    transactionId: "income-current",
    updatedAt: "2026-08-04T18:00:00.000Z"
  },
  {
    id: "eggs-current",
    date: "2026-08-04",
    product: "Eggs",
    scope: "Species",
    species: "Chicken",
    animalId: "",
    groupName: "Layer flock A",
    unit: "dozen",
    quantity: "12",
    soldQuantity: "8",
    householdQuantity: "1",
    feedQuantity: "0",
    setAsideQuantity: "2",
    donatedQuantity: "1",
    wasteQuantity: "0",
    saleAmount: "24.00",
    updatedAt: "2026-08-04T17:00:00.000Z"
  }
];
state.productionRecords.push(...records);

const defaults = {
  Eggs: { species: "Chicken", unit: "eggs" },
  Broilers: { species: "Chicken", unit: "birds" },
  Milk: { species: "Cattle", unit: "gallons" },
  Hay: { species: "", unit: "bales" },
  Other: { species: "", unit: "other" }
};
const source = html.slice(start, end);
const buildHelpers = new Function(
  "state",
  "animalName",
  "formatDate",
  "monthLabel",
  "formatQuantity",
  "todayISO",
  "PRODUCTION_DEFAULTS",
  `${source}\nreturn {
    productionPeriodRange, filterProductionRecords, productionSummaryRows,
    productionTimelineRows, productionComparisonRows, productionWarnings,
    latestProductionRecord, productionDraft, productionFarmUse
  };`
);
const helpers = buildHelpers(
  state,
  (id) => state.animals.find((animal) => animal.id === id)?.name || "Unknown animal",
  (date) => date,
  (month) => month,
  (value, unit) => `${Number(value)} ${unit}`,
  () => "2026-08-05",
  defaults
);

assert.deepEqual(helpers.productionPeriodRange("Day", "2026-08-04"), { start: "2026-08-04", end: "2026-08-04" });
assert.deepEqual(helpers.productionPeriodRange("Week", "2026-08-04"), { start: "2026-08-03", end: "2026-08-09" });
assert.deepEqual(helpers.productionPeriodRange("Month", "2026-08-04"), { start: "2026-08-01", end: "2026-08-31" });
assert.deepEqual(helpers.productionPeriodRange("Year", "2026-08-04"), { start: "2026-01-01", end: "2026-12-31" });

const currentDay = helpers.filterProductionRecords(records, {
  start: "2026-08-04",
  end: "2026-08-04"
});
assert.equal(currentDay.length, 2);
assert.equal(helpers.filterProductionRecords(records, { product: "Milk", animalId: "cow-1" }).length, 4);
assert.equal(helpers.filterProductionRecords(records, { species: "Chicken" }).length, 1);

const eggSummary = helpers.productionSummaryRows([records[4]])[0];
assert.equal(eggSummary.farmUse, 3, "farm use includes household and stored quantities but not donations");
assert.equal(eggSummary.donated, 1);
assert.equal(eggSummary.averagePrice, 3);
assert.equal(eggSummary.wasteRate, 0);

const dailyRows = helpers.productionTimelineRows(currentDay, "Day");
assert.equal(dailyRows.length, 2);
assert.ok(dailyRows.every((row) => row.bucket === "2026-08-04"));
const monthlyRows = helpers.productionTimelineRows(records, "Month");
assert.equal(monthlyRows.length, 2);

const comparisons = helpers.productionComparisonRows(currentDay);
assert.equal(comparisons.find((row) => row.product === "Milk").label, "Bessie");
assert.ok(comparisons.some((row) => row.label === "Jersey herd" && row.kind === "Herd"), "animal records can also roll up to a named herd");
assert.equal(comparisons.find((row) => row.product === "Eggs").label, "Layer flock A");
assert.equal(comparisons.find((row) => row.product === "Eggs").kind, "Flock");
const hayComparison = helpers.productionComparisonRows([{
  id: "hay-current", date: "2026-08-04", product: "Hay", scope: "Operation",
  groupName: "North field first cutting", unit: "round bales", quantity: "24",
  soldQuantity: "8", setAsideQuantity: "16", wasteQuantity: "0", saleAmount: "320"
}])[0];
assert.equal(hayComparison.label, "North field first cutting");
assert.equal(hayComparison.kind, "Field / Cutting");

const warnings = helpers.productionWarnings(currentDay, records);
assert.ok(warnings.some((warning) => warning.type === "waste"), "high waste is flagged");
assert.ok(warnings.some((warning) => warning.type === "drop"), "a 50% daily production drop is flagged after three prior entries");

assert.equal(helpers.latestProductionRecord().id, "milk-current");
const repeated = helpers.productionDraft("Milk", records[3]);
assert.equal(repeated.date, "2026-08-05");
assert.equal(repeated.quantity, "5");
assert.equal(repeated.groupName, "Jersey herd");
assert.equal("id" in repeated, false);
assert.equal("transactionId" in repeated, false);
assert.equal("updatedAt" in repeated, false);

const quickEgg = helpers.productionDraft("Eggs");
assert.equal(quickEgg.scope, "Species");
assert.equal(quickEgg.species, "Chicken");
assert.equal(quickEgg.unit, "eggs");
const quickHay = helpers.productionDraft("Hay");
assert.equal(quickHay.scope, "Operation");
assert.equal(quickHay.species, "");
assert.equal(quickHay.unit, "bales");

assert.match(html, /data-quick-production="Eggs"/);
assert.match(html, /data-quick-production="Milk"/);
assert.match(html, /data-quick-production="Broilers"/);
assert.match(html, /data-quick-production="Hay"/);
assert.match(html, /downloadProductionReport/);
assert.match(html, /Group \/ flock \/ herd \/ batch \/ field name/);

console.log("production reports and faster-entry tests passed");
