const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const appRuntime = fs.readFileSync(path.join(root, "herdharbor-app-runtime.js"), "utf8");
const animalProfileRuntime = fs.readFileSync(path.join(root, "animal-profile-runtime-v1.8.3.js"), "utf8");
const salesRuntimeSource = fs.readFileSync(path.join(root, "sales-customer-runtime-v1.8.3.js"), "utf8");
const SalesRuntime = require("../sales-customer-runtime-v1.8.3.js");

let nextId = 1;
const state = {
  profile: {},
  customers: [{ id: "customer-1", name: "Bluegrass Buyer" }],
  animals: [{ id: "animal-1", name: "Willow", species: "Rabbit", status: "For Sale", askingPrice: "125.00" }],
  sales: [],
  payments: [],
  transactions: [],
  transfers: []
};
const noop=()=>{};
const htmlStub=()=>"";
const helpers=SalesRuntime.create({
  getState:()=>state,
  replaceState:()=>{},
  getCurrentRoute:()=>"sales",
  getAppVersion:()=>"1.8.2",
  $:()=>null,
  $$:()=>[],
  esc:(value)=>String(value??""),
  formatMoney:(value)=>Number(value||0).toFixed(2),
  toast:noop,
  headerHtml:htmlStub,
  statCard:htmlStub,
  emptyState:htmlStub,
  field:htmlStub,
  textareaField:htmlStub,
  selectField:htmlStub,
  detailField:htmlStub,
  formatDate:(value)=>String(value||""),
  todayISO:()=>"2026-08-05",
  uid:(prefix)=>`${prefix}-${nextId++}`,
  recordActivity:noop,
  saveState:()=>true,
  scheduleUiWork:(_key,work)=>work?.(),
  openModal:noop,
  closeModal:noop,
  navigate:noop,
  allowsAnimalTransition:()=>true,
  rememberBreed:noop
});

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
assert.equal(state.animals[0].askingPrice, "125.00");

const payment = {
  id: "payment-1", saleId: sale.id, type: "Deposit", date: "2026-08-05",
  amount: "25.00", method: "Cash", reference: "DEP-1", notes: "", transactionId: ""
};
state.payments.push(payment);
helpers.syncSalePaymentIncome(payment);
assert.equal(state.transactions.length, 1);
assert.equal(state.transactions[0].sourceType, "sale-payment");
assert.equal(state.transactions[0].sourceId, payment.id);
assert.equal(state.transactions[0].amount, "25.00");
assert.equal(state.transactions[0].animalId, "animal-1");
assert.equal(payment.transactionId, state.transactions[0].id);
assert.equal(helpers.salePaid(sale.id), 25);
assert.equal(helpers.saleBalance(sale), 76);

payment.amount = "40.00";
helpers.syncSalePaymentIncome(payment);
assert.equal(state.transactions.length, 1);
assert.equal(state.transactions[0].amount, "40.00");

payment.amount = "0";
helpers.syncSalePaymentIncome(payment);
assert.equal(state.transactions.length, 0);

sale.status = "Cancelled";
helpers.applySaleAnimalStatuses(sale);
assert.equal(state.animals[0].status, "For Sale");
assert.equal(state.animals[0].saleRecordId, "");

const qrcode = require("../vendor/qrcode-generator-1.4.4.js");
const code = qrcode(0, "M");
code.addData("https://app.herdharbor.com/?animal=animal-1");
code.make();
assert.match(code.createSvgTag({ scalable: true }), /<svg/);

assert.match(appRuntime,/HerdHarborSalesCustomerRuntime\?\.create/);
assert.match(salesRuntimeSource, /function renderSales\(\)/);
assert.match(salesRuntimeSource, /function openCustomerForm\(/);
assert.match(salesRuntimeSource, /function openSaleForm\(/);
assert.match(salesRuntimeSource, /function printSaleDocument\(/);
assert.match(salesRuntimeSource, /function exportAnimalTransfer\(/);
assert.match(salesRuntimeSource, /function handleTransferImport\(/);
assert.match(animalProfileRuntime, /function openAnimalQrCardForm\(/);
assert.match(salesRuntimeSource, /function transferRecordKey\(/);
assert.match(salesRuntimeSource, /Complete the sale before creating its animal transfer file/);
assert.match(salesRuntimeSource, /Its total cannot be reduced below that amount/);
assert.match(salesRuntimeSource, /popup\.opener = null/);
const transferableSource = salesRuntimeSource.slice(salesRuntimeSource.indexOf("function transferableAnimal("), salesRuntimeSource.indexOf("function transferRecordKey("));
assert.doesNotMatch(transferableSource, /notes/);
assert.match(html, /data-route="sales"/);
assert.match(appRuntime, /status: "Active"/);

console.log("sales, customers, payments, documents, transfers, and QR tests passed");
