"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const Profit = require("../profitability-analytics-v1.8.3.js");

function fixture() {
  return {
    animals: [
      { id: "s1", name: "Sire", species: "Rabbit", sex: "Male" },
      { id: "d1", name: "Dam", species: "Rabbit", sex: "Female" },
      { id: "k1", name: "Retained", species: "Rabbit", sourceBirthId: "l1", sireId: "s1", damId: "d1" },
      { id: "k2", name: "Sold", species: "Rabbit", sourceBirthId: "l1", sireId: "s1", damId: "d1" },
      { id: "hen-1", name: "Layers", species: "Chicken" }
    ],
    breedings: [
      { id: "b1", femaleId: "d1", maleId: "s1", breedingDate: "2026-01-01" }
    ],
    litters: [
      { id: "l1", breedingId: "b1", damId: "d1", sireId: "s1", birthDate: "2026-02-01", offspringIds: ["k1", "k2"] }
    ],
    transactions: [
      { id: "t-animal", type: "Expense", classification: "Operating", scope: "Animal", animalId: "k2", species: "Rabbit", category: "Feed", amount: "20", date: "2026-03-01" },
      { id: "t-species", type: "Expense", classification: "Operating", scope: "Species", species: "Rabbit", category: "Care", amount: "10", date: "2026-03-02" },
      { id: "t-operation", type: "Expense", classification: "Operating", scope: "Operation", category: "Utilities", amount: "30", date: "2026-03-03" },
      { id: "t-product", type: "Expense", classification: "Operating", scope: "Species", species: "Chicken", product: "Eggs", category: "Feed", amount: "15", date: "2026-03-04" },
      { id: "t-capital", type: "Expense", classification: "Capital", scope: "Operation", category: "Equipment", amount: "500", date: "2026-03-05" },
      { id: "t-old", type: "Expense", classification: "Operating", scope: "Animal", animalId: "k2", species: "Rabbit", category: "Feed", amount: "999", date: "2025-03-01" }
    ],
    sales: [
      { id: "sale-one", status: "Completed", saleDate: "2026-03-10", items: [{ id: "item-k2", animalId: "k2", salePrice: "75", quantity: "1" }] },
      { id: "sale-mixed", status: "Completed", saleDate: "2026-03-11", items: [
        { id: "item-k1", animalId: "k1", salePrice: "50", quantity: "1" },
        { id: "item-k2b", animalId: "k2", salePrice: "50", quantity: "1" }
      ] },
      { id: "sale-cancelled", status: "Cancelled", saleDate: "2026-03-12", items: [{ id: "item-x", animalId: "k1", salePrice: "200" }] }
    ],
    payments: [
      { id: "p1", saleId: "sale-one", saleItemId: "item-k2", amount: "75", date: "2026-03-10" },
      { id: "p2", saleId: "sale-mixed", amount: "100", date: "2026-03-12" },
      { id: "p3", saleId: "sale-cancelled", amount: "200", date: "2026-03-12" }
    ],
    productionRecords: [
      { id: "prod-eggs", date: "2026-03-15", product: "Eggs", species: "Chicken", saleAmount: "50" },
      { id: "prod-milk", date: "2026-03-15", product: "Milk", species: "Cattle", saleAmount: "25" }
    ]
  };
}

const march = { start: "2026-03-01", end: "2026-03-31" };

test("operation profitability distinguishes received revenue from invoiced value and ignores capital/out-of-period costs", () => {
  const state = fixture();
  const before = structuredClone(state);
  const result = Profit.operationSummary(state, march);
  assert.equal(result.receivedRevenue, 175);
  assert.equal(result.invoicedRevenue, 175);
  assert.equal(result.recordedCosts, 75);
  assert.equal(result.recordedNet, 100);
  assert.equal(result.unallocatedRevenue, 100);
  assert.equal(result.sharedCosts, 55);
  assert.equal(result.allocationComplete, false);
  assert.match(result.note, /does not assume missing costs or unpaid invoices are zero/i);
  assert.deepEqual(state, before);
});

test("animal-level margin remains unavailable when shared costs or mixed payments cannot be assigned safely", () => {
  const rows = Profit.animalRows(fixture(), march);
  const sold = rows.find((row) => row.animalId === "k2");
  assert.equal(sold.directCost, 20);
  assert.equal(sold.receivedRevenue, 75);
  assert.equal(sold.recordedMargin, null);
  assert.equal(sold.dataStatus, "partial allocation");
  assert.equal(sold.excludedSharedCosts, 55);
  assert.equal(sold.excludedUnallocatedRevenue, 100);
});

test("litter and pair context aggregate only explicit offspring-linked cost and received revenue", () => {
  const state = fixture();
  const litter = Profit.litterRows(state, march).find((row) => row.litterId === "l1");
  assert.equal(litter.offspringCount, 2);
  assert.equal(litter.directCost, 20);
  assert.equal(litter.receivedRevenue, 75);
  assert.equal(litter.recordedMargin, null);
  assert.equal(litter.damId, "d1");
  assert.equal(litter.sireId, "s1");

  const pair = Profit.pairRows(state, march)[0];
  assert.equal(pair.damId, "d1");
  assert.equal(pair.sireId, "s1");
  assert.equal(pair.litterCount, 1);
  assert.equal(pair.directCost, 20);
  assert.equal(pair.receivedRevenue, 75);
  assert.equal(pair.recordedMargin, null);
});

test("single-item sale payments can be allocated without saleItemId, but multi-item payments remain unallocated", () => {
  const state = fixture();
  state.payments[0] = { id: "p1", saleId: "sale-one", amount: "75", date: "2026-03-10" };
  const rows = Profit.paymentAllocations(state, march);
  assert.equal(rows.find((row) => row.payment.id === "p1").animalId, "k2");
  assert.equal(rows.find((row) => row.payment.id === "p1").allocation, "single-item-sale");
  assert.equal(rows.find((row) => row.payment.id === "p2").animalId, "");
  assert.equal(rows.find((row) => row.payment.id === "p2").allocation, "unallocated");
});

test("product margin is calculated only when recorded costs are explicitly linked to product/source", () => {
  const rows = Profit.productMargins(fixture(), march);
  const eggs = rows.find((row) => row.product === "Eggs");
  const milk = rows.find((row) => row.product === "Milk");
  assert.equal(eggs.revenue, 50);
  assert.equal(eggs.linkedCost, 15);
  assert.equal(eggs.margin, 35);
  assert.equal(eggs.dataStatus, "linked recorded costs only");
  assert.equal(milk.revenue, 25);
  assert.equal(milk.margin, null);
  assert.equal(milk.dataStatus, "cost data unavailable");
  assert.match(milk.note, /intentionally not calculated/i);
});

test("species filters exclude operation-wide costs instead of assigning them without evidence", () => {
  const rabbit = Profit.operationSummary(fixture(), { ...march, species: "Rabbit" });
  assert.equal(rabbit.recordedCosts, 30);
  assert.equal(rabbit.excludedOperationCosts, 30);
  assert.equal(rabbit.allocationComplete, false);
});

test("period filters are explicit and do not pull historical costs into current profitability", () => {
  assert.equal(Profit.rawOperatingExpenses(fixture(), march).some((row) => row.id === "t-old"), false);
  assert.equal(Profit.rawOperatingExpenses(fixture(), { start: "2025-01-01", end: "2025-12-31" }).some((row) => row.id === "t-old"), true);
});

test("profitability analytics are read-only and contain no persistence path", () => {
  const source = read("profitability-analytics-v1.8.3.js");
  assert.equal(Profit.VERSION, "1.8.3");
  assert.equal(Profit.BUILD_ID, "profitability-production-analytics-1");
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|saveState|commitState/);
  assert.doesNotMatch(source, /state\.(?:animals|transactions|sales|payments|litters|productionRecords)\s*=|state\.(?:animals|transactions|sales|payments|litters|productionRecords)\.(?:push|splice)\(/);
});

test("Production/Reporting remains the visible owner and shell loads profitability before it", () => {
  const runtime = read("production-reporting-runtime-v1.8.3.js");
  const html = read("index.html");
  const worker = read("service-worker.js");
  const pkg = JSON.parse(read("package.json"));
  assert.match(runtime, /Recorded profitability/);
  assert.match(runtime, /HerdHarborProfitabilityAnalytics/);
  assert.match(runtime, /Recorded profitability/);
  assert.match(runtime, /recorded data only/);
  assert.ok(html.indexOf("profitability-analytics-v1.8.3.js?v=1") < html.indexOf("production-reporting-runtime-v1.8.3.js?v=1"));
  assert.match(worker, /\.\/profitability-analytics-v1\.8\.3\.js\?v=1/);
  assert.match(worker, /"\/profitability-analytics-v1\.8\.3\.js"/);
  assert.match(pkg.scripts["test:v1.8.3"], /profitability-production-analytics-v1\.8\.3\.test\.cjs/);
});
