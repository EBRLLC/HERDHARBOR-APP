const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const start = html.indexOf("  function productionSpecies(record)");
const end = html.indexOf("  function renderBudget()", start);
assert.ok(start >= 0 && end > start, "production and sales helpers are present");

const state = {
  animals: [
    { id: "cow-1", name: "Bessie", species: "Cattle" },
    { id: "hen-1", name: "Layer flock", species: "Chicken" }
  ],
  transactions: [],
  productionRecords: []
};
let nextId = 1;
const source = html.slice(start, end);
const buildHelpers = new Function(
  "state",
  "animalName",
  "uid",
  `${source}\nreturn { productionSpecies, productionFarmUse, productionSummaryRows, productionIncomeCategory, syncProductionIncome };`
);
const helpers = buildHelpers(
  state,
  (id) => state.animals.find((animal) => animal.id === id)?.name || "Unknown animal",
  (prefix) => `${prefix}-${nextId++}`
);

const eggRecord = {
  id: "production-eggs",
  date: "2026-08-04",
  product: "Eggs",
  scope: "Species",
  species: "Chicken",
  animalId: "",
  unit: "dozen",
  quantity: "12",
  soldQuantity: "8",
  householdQuantity: "1",
  feedQuantity: "0",
  setAsideQuantity: "2",
  donatedQuantity: "0",
  wasteQuantity: "1",
  saleAmount: "24.00",
  customer: "Farm stand",
  notes: ""
};
state.productionRecords.push(eggRecord);
helpers.syncProductionIncome(eggRecord);

assert.equal(state.transactions.length, 1, "one linked income transaction is created");
assert.equal(state.transactions[0].category, "Egg Sales");
assert.equal(state.transactions[0].amount, "24.00");
assert.equal(state.transactions[0].sourceId, eggRecord.id);
assert.equal(eggRecord.transactionId, state.transactions[0].id);

eggRecord.saleAmount = "30.00";
eggRecord.soldQuantity = "10";
helpers.syncProductionIncome(eggRecord);
assert.equal(state.transactions.length, 1, "editing production does not duplicate income");
assert.equal(state.transactions[0].amount, "30.00");
assert.match(state.transactions[0].description, /10 dozen sold/);

const milkRecord = {
  id: "production-milk",
  date: "2026-08-04",
  product: "Milk",
  scope: "Animal",
  species: "Cattle",
  animalId: "cow-1",
  unit: "gallons",
  quantity: "6",
  soldQuantity: "2",
  householdQuantity: "1",
  feedQuantity: "1.5",
  setAsideQuantity: "0.5",
  donatedQuantity: "0",
  wasteQuantity: "1",
  saleAmount: "12.00",
  customer: "Neighbor",
  notes: ""
};
state.productionRecords.push(milkRecord);
helpers.syncProductionIncome(milkRecord);

assert.equal(helpers.productionSpecies(milkRecord), "Cattle");
assert.equal(helpers.productionFarmUse(milkRecord), 3);
assert.equal(state.transactions[1].category, "Milk / Fiber");
assert.equal(state.transactions[1].animalId, "cow-1");

const hayRecord = {
  id: "production-hay",
  date: "2026-08-04",
  product: "Hay",
  scope: "Operation",
  species: "",
  animalId: "",
  groupName: "North field first cutting",
  unit: "round bales",
  quantity: "30",
  soldQuantity: "12",
  householdQuantity: "0",
  feedQuantity: "8",
  setAsideQuantity: "9",
  donatedQuantity: "0",
  wasteQuantity: "1",
  saleAmount: "480.00",
  customer: "Neighboring farm",
  notes: ""
};
state.productionRecords.push(hayRecord);
helpers.syncProductionIncome(hayRecord);
assert.equal(state.transactions[2].category, "Other Income");
assert.equal(state.transactions[2].amount, "480.00");
assert.match(state.transactions[2].description, /12 round bales sold/);

const summary = helpers.productionSummaryRows(state.productionRecords);
assert.equal(summary.length, 3);
assert.equal(summary.find((row) => row.product === "Eggs").sold, 10);
assert.equal(summary.find((row) => row.product === "Milk").waste, 1);
assert.equal(summary.find((row) => row.product === "Hay").farmUse, 17);

milkRecord.saleAmount = "0";
helpers.syncProductionIncome(milkRecord);
assert.equal(state.transactions.length, 2, "removing a sale amount removes only its linked income");
assert.equal(milkRecord.transactionId, "");

assert.match(html, /"Fed to livestock \/ calves", "feedQuantity"/, "dairy milk can be assigned to calves or livestock");
assert.match(html, /"Waste \/ discard reason", "wasteReason"/, "milk waste and discard reasons are retained");
assert.match(html, /Allocated quantities total/, "over-allocation is blocked");

console.log("production and sales tests passed");
