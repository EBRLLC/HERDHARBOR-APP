"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=f=>fs.readFileSync(path.join(root,f),"utf8");
const sales=read("sales-customer-runtime-v1.8.3.js");
const app=read("herdharbor-app-runtime.js");
const direct=read("direct-transfer-core-v1.8.2.js");
const litter=read("litter-sale-transfer-core-v1.8.2.js");
const pkg=JSON.parse(read("package.json"));
const Sales=require("../sales-customer-runtime-v1.8.3.js");

function api(state){
 const noop=()=>{},html=()=>"";
 return Sales.create({
  getState:()=>state,replaceState:next=>{Object.keys(state).forEach(k=>delete state[k]);Object.assign(state,next);},
  getCurrentRoute:()=>"sales",getAppVersion:()=>"1.8.2",$:()=>null,$$:()=>[],esc:v=>String(v??""),
  formatMoney:v=>Number(v||0).toFixed(2),toast:noop,headerHtml:html,statCard:html,emptyState:html,
  field:html,textareaField:html,selectField:html,detailField:html,formatDate:v=>String(v||""),
  todayISO:()=>"2026-09-21",uid:p=>p+"-test",recordActivity:noop,saveState:()=>true,
  scheduleUiWork:(_k,w)=>w?.(),openModal:noop,closeModal:noop,navigate:noop,
  allowsAnimalTransition:()=>true,rememberBreed:noop
 });
}

test("Sales/Customers/Transfers has one extracted runtime owner",()=>{
 assert.equal(Sales.VERSION,"1.8.3");
 assert.match(sales,/root\.HerdHarborSalesCustomerRuntime = api/);
 for(const name of ["renderSales","openCustomerForm","openSaleForm","openPaymentForm","printSaleDocument","exportAnimalTransfer","handleTransferImport"]){
  assert.match(sales,new RegExp("function "+name+"\\("));
 }
 assert.match(app,/HerdHarborSalesCustomerRuntime\?\.create/);
 assert.doesNotMatch(app,/let salesView =/);
 assert.doesNotMatch(app,/id="sales-status-filter"[\s\S]{0,500}Sales and reservations/);
});

test("canonical sales/payment/transaction arrays remain sole state owners",()=>{
 assert.match(sales,/const stateNow = \(\) => deps\.getState\(\) \|\| \{\}/);
 assert.match(sales,/stateNow\(\)\.sales/);
 assert.match(sales,/stateNow\(\)\.payments/);
 assert.match(sales,/stateNow\(\)\.transactions/);
 assert.match(sales,/replaceState\(previousState\)/);
 assert.doesNotMatch(sales,/localStorage|sessionStorage|indexedDB|STORAGE_KEY/);
 assert.doesNotMatch(sales,/HerdHarborCloud|cloud-sync-|Supabase|supabase/);
});

test("sale totals, payment income, and status transitions remain behavior compatible",()=>{
 const state={profile:{},customers:[{id:"c1",name:"Buyer"}],animals:[{id:"a1",name:"Daisy",species:"Rabbit",status:"For Sale",askingPrice:"90"}],sales:[],payments:[],transactions:[],transfers:[]};
 const h=api(state);
 const sale={id:"s1",saleNumber:"HH-2026-1",customerId:"c1",status:"Reserved",items:[{animalId:"a1",quantity:"1",unitPrice:"80"}],discount:"5",tax:"3"};
 state.sales.push(sale);
 assert.equal(h.saleTotal(sale),78);
 h.applySaleAnimalStatuses(sale);
 assert.equal(state.animals[0].status,"Reserved");
 const p={id:"p1",saleId:"s1",date:"2026-09-21",type:"Deposit",amount:"20",method:"Cash",transactionId:""};
 state.payments.push(p);h.syncSalePaymentIncome(p);
 assert.equal(state.transactions.length,1);
 assert.equal(state.transactions[0].sourceType,"sale-payment");
 assert.equal(h.saleBalance(sale),58);
 sale.status="Completed";h.applySaleAnimalStatuses(sale);
 assert.equal(state.animals[0].status,"Sold");
 assert.equal(state.animals[0].askingPrice,"90");
});

test("protected direct-transfer provenance/deduplication engine remains authoritative and separate",()=>{
 assert.match(direct,/function buildTransferPayload/);
 assert.match(direct,/function applyIncomingTransfer/);
 assert.match(direct,/alreadyImported: true/);
 assert.match(direct,/ownershipHistory/);
 assert.match(direct,/status: isSubject \? "Active" : "Ancestor Only"/);
 assert.match(direct,/MAX_ANIMAL_RECORDS/);
 assert.match(direct,/MAX_SUBJECTS/);
 assert.doesNotMatch(sales,/function applyIncomingTransfer\(/);
});

test("litter sale core remains canonical for litter-origin sales and duplicate-sale protection",()=>{
 assert.match(litter,/function saleCandidateOffspring/);
 assert.match(litter,/function createSaleFromLitter/);
 assert.match(litter,/activeSaleForAnimal/);
 assert.match(litter,/sourceLitterId/);
 assert.doesNotMatch(sales,/function createSaleFromLitter\(/);
});

test("legacy transfer compatibility still enforces animal allowance and rollback",()=>{
 assert.match(sales,/allowsAnimalTransition\(stateNow\(\)\.animals, \[\.\.\.stateNow\(\)\.animals, \.\.\.added\]\)/);
 assert.match(sales,/replaceState\(previousState\)/);
 assert.match(sales,/sourceTransferId/);
 assert.match(sales,/Ancestor Only/);
 const transferable=sales.slice(sales.indexOf("function transferableAnimal("),sales.indexOf("function transferRecordKey("));
 assert.doesNotMatch(transferable,/notes|healthNotes/);
});

test("sales/customer extraction remains compatible with formal v1.8.3",()=>{
 const html=read("index.html"),sw=read("service-worker.js");
 assert.equal(pkg.version,"1.8.3");
 assert.ok(html.indexOf("task-runtime-v1.8.3.js?v=1")<html.indexOf("sales-customer-runtime-v1.8.3.js?v=1"));
 assert.ok(html.indexOf("sales-customer-runtime-v1.8.3.js?v=1")<html.indexOf("herdharbor-app-runtime.js?v=2"));
 assert.match(sw,/sales-customer-runtime-v1\.8\.3\.js\?v=1/);
 assert.match(pkg.scripts["test:v1.8.3"],/runtime-sales-customer-extraction-v1\.8\.3\.test\.cjs/);
});
