const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const appRuntime = fs.readFileSync(path.join(__dirname, "..", "herdharbor-app-runtime.js"), "utf8");
const productionRuntimeSource = fs.readFileSync(path.join(__dirname, "..", "production-reporting-runtime-v1.8.3.js"), "utf8");
const ProductionReporting = require("../production-reporting-runtime-v1.8.3.js");

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
const noop = () => {};
const htmlStub = () => "";
const helpers = ProductionReporting.create({
  getState: () => state,
  replaceState: () => {},
  $: () => null,
  "$": () => [],
  esc: (value) => String(value ?? ""),
  headerHtml: htmlStub,
  statCard: htmlStub,
  emptyState: htmlStub,
  field: htmlStub,
  textareaField: htmlStub,
  selectField: htmlStub,
  formatDate: (date) => date,
  formatMoney: (value) => String(value ?? ""),
  toast: noop,
  currentMonthKey: () => "2026-08",
  budgetPeriodLabel: (value) => value,
  budgetSummary: () => ({ income: 0, operating: 0, capital: 0, net: 0 }),
  activeAnimals: () => state.animals,
  effectiveHeadCount: () => state.animals.length,
  monthLabel: (month) => month,
  monthTransactions: () => [],
  operatingExpenseTransactions: () => [],
  transactionSpecies: (transaction) => transaction.species || "",
  transactionScopeLabel: (transaction) => transaction.scope || "Operation",
  animalName: (id) => state.animals.find((animal) => animal.id === id)?.name || "Unknown animal",
  todayISO: () => "2026-08-05",
  uid: (prefix) => prefix + "-test",
  recordActivity: noop,
  saveState: () => true,
  openModal: noop,
  closeModal: noop,
  renderCurrentView: noop,
  ensureSpreadsheetToolsReady: async () => ({ downloadProductionReport: async () => true }),
  openPaymentForm: noop
});

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

assert.match(productionRuntimeSource, /data-quick-production="Eggs"/);
assert.match(productionRuntimeSource, /data-quick-production="Milk"/);
assert.match(productionRuntimeSource, /data-quick-production="Broilers"/);
assert.match(productionRuntimeSource, /data-quick-production="Hay"/);
assert.match(productionRuntimeSource, /downloadProductionReport/);
assert.match(productionRuntimeSource, /Group \/ flock \/ herd \/ batch \/ field name/);
assert.match(appRuntime, /HerdHarborProductionReportingRuntime\?\.create/);

console.log("production reports and faster-entry tests passed");
