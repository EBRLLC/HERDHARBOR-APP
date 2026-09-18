const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const appRuntime = fs.readFileSync(path.join(__dirname, "..", "herdharbor-app-runtime.js"), "utf8");
const start = appRuntime.indexOf("  function customerName(customerId)");
const end = appRuntime.indexOf("  function renderSales()", start);
assert.ok(start >= 0 && end > start, "sales and payment helpers are present");

let nextId = 1;
const state = {
  customers: [{ id: "customer-1", name: "Bluegrass Buyer" }],
  animals: [{ id: "animal-1", name: "Willow", species: "Rabbit", status: "For Sale", askingPrice: "125.00" }],
  sales: [],
  payments: [],
  transactions: []
};
const source = appRuntime.slice(start, end);
const helpers = new Function(
  "state", "uid", "todayISO",
  `${source}\nreturn { customerName, saleItems, saleAnimals, saleSubtotal, saleTotal, salePayments, salePaid, saleBalance, saleNumberForId, syncSalePaymentIncome, applySaleAnimalStatuses };`
)(state, (prefix) => `${prefix}-${nextId++}`, () => "2026-08-05");

const sale = {
  id: "sale-1",
  saleNumber: "HH-2026-ABC123",
  customerId: "customer-1",
  saleDate: "2026-08-05",
  status: "Reserved",
  items: [{ id: "saleitem-1", animalId: "animal-1", quantity: "1", unitPrice: "100.00" }],
  discount: "5.00",
  tax: "6.00"
};
state.sales.push(sale);

assert.equal(helpers.saleSubtotal(sale), 100);
assert.equal(helpers.saleTotal(sale), 101);
assert.equal(helpers.salePaid(sale.id), 0);
assert.equal(helpers.saleBalance(sale), 101);
assert.match(helpers.saleNumberForId("sale_123456", "2026-08-05"), /^HH-2026-/);

helpers.applySaleAnimalStatuses(sale);
assert.equal(state.animals[0].status, "Reserved");
assert.equal(state.animals[0].saleRecordId, sale.id);

sale.status = "Completed";
helpers.applySaleAnimalStatuses(sale);
assert.equal(state.animals[0].status, "Sold");
assert.equal(state.animals[0].askingPrice, "125.00", "actual sale price never overwrites the asking price");

const payment = {
  id: "payment-1", saleId: sale.id, type: "Deposit", date: "2026-08-05",
  amount: "25.00", method: "Cash", reference: "DEP-1", notes: "", transactionId: ""
};
state.payments.push(payment);
helpers.syncSalePaymentIncome(payment);
assert.equal(state.transactions.length, 1, "a received payment creates one Budget income record");
assert.equal(state.transactions[0].sourceType, "sale-payment");
assert.equal(state.transactions[0].sourceId, payment.id);
assert.equal(state.transactions[0].amount, "25.00");
assert.equal(state.transactions[0].animalId, "animal-1");
assert.equal(payment.transactionId, state.transactions[0].id);
assert.equal(helpers.salePaid(sale.id), 25);
assert.equal(helpers.saleBalance(sale), 76);

payment.amount = "40.00";
helpers.syncSalePaymentIncome(payment);
assert.equal(state.transactions.length, 1, "editing a payment does not duplicate Budget income");
assert.equal(state.transactions[0].amount, "40.00");

payment.amount = "0";
helpers.syncSalePaymentIncome(payment);
assert.equal(state.transactions.length, 0, "removing a payment amount removes its linked income");

sale.status = "Cancelled";
helpers.applySaleAnimalStatuses(sale);
assert.equal(state.animals[0].status, "For Sale");
assert.equal(state.animals[0].saleRecordId, "");

const qrcode = require("../vendor/qrcode-generator-1.4.4.js");
const code = qrcode(0, "M");
code.addData("https://app.herdharbor.com/?animal=animal-1");
code.make();
assert.match(code.createSvgTag({ scalable: true }), /<svg/);

assert.match(appRuntime, /function renderSales\(\)/);
assert.match(appRuntime, /function openCustomerForm\(/);
assert.match(appRuntime, /function openSaleForm\(/);
assert.match(appRuntime, /function printSaleDocument\(/);
assert.match(appRuntime, /function exportAnimalTransfer\(/);
assert.match(appRuntime, /function handleTransferImport\(/);
assert.match(appRuntime, /function openAnimalQrCardForm\(/);
assert.match(appRuntime, /function transferRecordKey\(/);
assert.match(appRuntime, /Complete the sale before creating its animal transfer file/);
assert.match(appRuntime, /Its total cannot be reduced below that amount/);
assert.match(appRuntime, /popup\.opener = null/);
const transferableSource = appRuntime.slice(appRuntime.indexOf("  function transferableAnimal("), appRuntime.indexOf("  function transferRecordKey("));
assert.doesNotMatch(transferableSource, /notes/, "private animal notes are excluded from transfer files");
assert.match(html, /data-route="sales"/);
assert.match(appRuntime, /status: "Active"/, "Animals still default to Active after the sales release");

console.log("sales, customers, payments, documents, transfers, and QR tests passed");
