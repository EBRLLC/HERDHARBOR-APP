"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const app = read("herdharbor-app-runtime.js");
const production = read("production-reporting-runtime-v1.8.3.js");
const optional = read("herdharbor-optional-tools.js");
const html = read("index.html");
const worker = read("service-worker.js");
const pkg = JSON.parse(read("package.json"));
const Runtime = require("../production-reporting-runtime-v1.8.3.js");

function depsFor(state, overrides = {}) {
  const noop = () => {};
  const htmlStub = () => "";
  return {
    getState: () => state,
    replaceState: (next) => {
      Object.keys(state).forEach((key) => delete state[key]);
      Object.assign(state, next);
    },
    $: () => null,
    $$: () => [],
    esc: (value) => String(value ?? ""),
    headerHtml: htmlStub,
    statCard: htmlStub,
    emptyState: htmlStub,
    field: htmlStub,
    textareaField: htmlStub,
    selectField: htmlStub,
    formatDate: (value) => String(value || ""),
    formatMoney: (value) => Number(value || 0).toFixed(2),
    toast: noop,
    currentMonthKey: () => "2026-09",
    budgetPeriodLabel: (value) => value,
    budgetSummary: () => ({ income: 0, operating: 0, capital: 0, net: 0 }),
    activeAnimals: () => (state.animals || []).filter((animal) => !["Sold", "Deceased", "Archived", "Ancestor Only"].includes(animal.status)),
    effectiveHeadCount: () => (state.animals || []).length,
    monthLabel: (value) => value,
    monthTransactions: () => state.transactions || [],
    operatingExpenseTransactions: () => (state.transactions || []).filter((t) => t.type === "Expense" && t.classification !== "Capital"),
    transactionSpecies: (transaction) => transaction.species || "",
    transactionScopeLabel: (transaction) => transaction.scope || "Operation",
    animalName: (id) => (state.animals || []).find((animal) => animal.id === id)?.name || "Unknown animal",
    todayISO: () => "2026-09-21",
    uid: (prefix) => prefix + "-test",
    recordActivity: noop,
    saveState: () => true,
    openModal: noop,
    closeModal: noop,
    renderCurrentView: noop,
    ensureSpreadsheetToolsReady: async () => ({ downloadProductionReport: async () => true }),
    openPaymentForm: noop,
    ...overrides
  };
}

function stateFixture() {
  return {
    profile: { operationName: "Test Farm" },
    settings: { species: ["Rabbit", "Chicken", "Cattle"] },
    animals: [
      { id: "cow1", name: "Bessie", species: "Cattle", status: "Active" },
      { id: "hen1", name: "Layers", species: "Chicken", status: "Active" }
    ],
    transactions: [],
    productionRecords: [],
    budgetPlans: [],
    annualBudgetPlans: [],
    budgetMonthSettings: {},
    payments: []
  };
}

test("Production/Reporting domain has one extracted runtime owner", () => {
  assert.equal(Runtime.VERSION, "1.8.3");
  assert.equal(typeof Runtime.create, "function");
  assert.match(production, /root\.HerdHarborProductionReportingRuntime = api/);
  for (const name of [
    "renderBudget", "openProductionForm", "openTransactionForm", "syncProductionIncome",
    "productionSummaryRows", "productionTimelineRows", "productionComparisonRows",
    "productionWarnings", "printProductionReport", "exportBudgetCsv"
  ]) assert.match(production, new RegExp("function " + name + "\\("));
});

test("composition runtime delegates instead of retaining a second production/report implementation", () => {
  assert.match(app, /HerdHarborProductionReportingRuntime\?\.create/);
  assert.match(app, /function renderBudget\(\) \{\s*return productionReportingRuntime\(\)\.renderBudget\(\);\s*\}/);
  assert.match(app, /function openProductionForm\(id = "", options = \{\}\) \{\s*return productionReportingRuntime\(\)\.openProductionForm\(id, options\);\s*\}/);
  assert.match(app, /function openTransactionForm\(id = "", defaultType = "Expense"\) \{\s*return productionReportingRuntime\(\)\.openTransactionForm\(id, defaultType\);\s*\}/);
  assert.match(app, /function syncProductionIncome\(record\) \{\s*return productionReportingRuntime\(\)\.syncProductionIncome\(record\);\s*\}/);
  assert.doesNotMatch(app, /let budgetView =/);
  assert.doesNotMatch(app, /let productionReportView =/);
  assert.doesNotMatch(app, /id="production-report-group"/);
  assert.doesNotMatch(app, /function printProductionReport\(/);
  assert.doesNotMatch(app, /function exportBudgetCsv\(/);
});

test("extracted runtime uses canonical state and creates no parallel persistence/cloud owner", () => {
  assert.match(production, /const stateNow = \(\) => deps\.getState\(\) \|\| \{\}/);
  assert.match(production, /replaceState\(previousState\)/);
  assert.doesNotMatch(production, /localStorage|sessionStorage|indexedDB|STORAGE_KEY/);
  assert.doesNotMatch(production, /HerdHarborCloud|cloud-sync-|Supabase|supabase/);
});

test("production income remains a canonical linked transaction and updates without duplicates", () => {
  const state = stateFixture();
  const api = Runtime.create(depsFor(state));
  const record = {
    id: "prod1", date: "2026-09-21", product: "Eggs", scope: "Species", species: "Chicken",
    unit: "dozen", quantity: "12", soldQuantity: "8", householdQuantity: "1",
    feedQuantity: "1", setAsideQuantity: "1", donatedQuantity: "0", wasteQuantity: "1",
    saleAmount: "24.00", customer: "Farm stand", notes: ""
  };
  state.productionRecords.push(record);
  api.syncProductionIncome(record);
  assert.equal(state.transactions.length, 1);
  assert.equal(state.transactions[0].sourceType, "production");
  assert.equal(state.transactions[0].sourceId, "prod1");
  assert.equal(state.transactions[0].category, "Egg Sales");
  assert.equal(record.transactionId, state.transactions[0].id);

  record.saleAmount = "30.00";
  record.soldQuantity = "10";
  api.syncProductionIncome(record);
  assert.equal(state.transactions.length, 1);
  assert.equal(state.transactions[0].amount, "30.00");

  record.saleAmount = "0";
  api.syncProductionIncome(record);
  assert.equal(state.transactions.length, 0);
  assert.equal(record.transactionId, "");
});

test("production report calculations remain deterministic", () => {
  const state = stateFixture();
  const api = Runtime.create(depsFor(state));
  const records = [
    { id:"m1",date:"2026-09-20",product:"Milk",scope:"Animal",species:"Cattle",animalId:"cow1",unit:"gallons",quantity:"10",soldQuantity:"4",householdQuantity:"1",feedQuantity:"2",setAsideQuantity:"1",donatedQuantity:"1",wasteQuantity:"1",saleAmount:"20" },
    { id:"e1",date:"2026-09-21",product:"Eggs",scope:"Species",species:"Chicken",groupName:"Layer flock",unit:"dozen",quantity:"12",soldQuantity:"8",householdQuantity:"1",feedQuantity:"0",setAsideQuantity:"2",donatedQuantity:"1",wasteQuantity:"0",saleAmount:"24" }
  ];
  state.productionRecords.push(...records);
  assert.deepEqual(api.productionPeriodRange("Month", "2026-09-21"), { start:"2026-09-01", end:"2026-09-30" });
  assert.equal(api.filterProductionRecords(records, { product:"Eggs" }).length, 1);
  const rows = api.productionSummaryRows(records);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.product === "Milk").waste, 1);
  assert.equal(rows.find((row) => row.product === "Eggs").averagePrice, 3);
  const comparisons = api.productionComparisonRows(records);
  assert.equal(comparisons.find((row) => row.product === "Milk").label, "Bessie");
  assert.equal(comparisons.find((row) => row.product === "Eggs").label, "Layer flock");
});

test("spreadsheet report tooling stays lazy and out of unconditional startup", () => {
  assert.match(production, /await ensureSpreadsheetToolsReady\(\)/);
  assert.match(production, /downloadProductionReport/);
  assert.match(optional, /ensureSpreadsheetTools/);
  for (const heavy of ["vendor/exceljs-4.4.0.min.js", "vendor/jszip-3.10.1.min.js", "spreadsheet-import.js?v=17"]) {
    assert.ok(!html.includes('<script src="' + heavy + '"></script>'), heavy + " must remain lazy");
  }
});

test("shell loads/caches Production/Reporting before composition runtime", () => {
  const salesIndex = html.indexOf("sales-customer-runtime-v1.8.3.js?v=1");
  const productionIndex = html.indexOf("production-reporting-runtime-v1.8.3.js?v=1");
  const appIndex = html.indexOf("herdharbor-app-runtime.js?v=2");
  assert.ok(salesIndex >= 0 && productionIndex > salesIndex && appIndex > productionIndex);
  assert.match(worker, /\.\/production-reporting-runtime-v1\.8\.3\.js\?v=1/);
  assert.match(worker, /"\/production-reporting-runtime-v1\.8\.3\.js"/);
});

test("Phase 6G extraction remains compatible with formal v1.8.4 and does not activate normalized sync", () => {
  assert.equal(pkg.version, "1.8.4");
  assert.match(read("herdharbor-build.js"), /version:\s*"1\.8\.4"/);
  assert.doesNotMatch(html, /cloud-sync-rollout-control-v1\.8\.3\.js/);
  assert.match(pkg.scripts["test:v1.8.3"], /runtime-production-reporting-extraction-v1\.8\.3\.test\.cjs/);
});
