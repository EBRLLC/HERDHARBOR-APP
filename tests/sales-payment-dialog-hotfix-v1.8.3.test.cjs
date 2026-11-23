"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const Sales=require("../sales-customer-runtime-v1.8.3.js");

function fixture(){
 return {
  profile:{},customers:[{id:"buyer",name:"Hop Along Ranch"}],
  animals:[{id:"judy",name:"Judy",species:"Rabbit",status:"For Sale",askingPrice:"120.00"},
           {id:"butter",name:"Butter-Ball",species:"Rabbit",status:"For Sale",askingPrice:"125.00"}],
  sales:[{id:"sale-1",saleNumber:"HH-2026-TMOUD1",transferNumber:"TR-2026-TMOUD1",
          customerId:"buyer",saleDate:"2026-10-19",dueDate:"2026-10-19",status:"Draft",
          items:[{animalId:"judy",unitPrice:"120.00",quantity:"1"},
                 {animalId:"butter",unitPrice:"125.00",quantity:"1"}],
          discount:"20.00",tax:"0.00",notes:""}],
  payments:[],transactions:[],transfers:[]
 };
}
function harness(options={}){
 const previousConfirm=globalThis.confirm,previousFormData=globalThis.FormData;
 const confirmations=[],toasts=[],nodes=new Map(),modals=[];
 let data=structuredClone(options.initial||fixture());
 let saveCalls=0;
 globalThis.confirm=(message)=>{confirmations.push(message);return options.confirm!==false;};
 globalThis.FormData=class{
  constructor(form){this.values=form.values;}
  *[Symbol.iterator](){yield* Object.entries(this.values);}
 };
 const getNode=selector=>{
  if(!nodes.has(selector)){
   const events=new Map();
   nodes.set(selector,{events,addEventListener(type,handler){events.set(type,handler);},classList:{add(){}}});
  }
  return nodes.get(selector);
 };
 const renderSelect=(label,name,choices,selected)=>'<select name="'+name+'">'+
    choices.map(value=>'<option'+(value===selected?' selected':'')+'>'+value+'</option>').join("")+'</select>';
 const sale=Sales.create({
  getState:()=>data,replaceState:next=>{data=next;},
  getCurrentRoute:()=>"sales",getAppVersion:()=>"2.0.2",
  $:getNode,$$:()=>[],esc:value=>String(value??""),
  formatMoney:value=>"$"+Number(value||0).toFixed(2),
  toast:(message,type)=>toasts.push({message,type}),
  headerHtml:()=>" ",statCard:()=>" ",emptyState:()=>" ",
  field:(label,name,value)=>'<input name="'+name+'" value="'+String(value??"")+'">',
  textareaField:(label,name,value)=>'<textarea name="'+name+'">'+String(value??"")+'</textarea>',
  selectField:renderSelect,detailField:()=>" ",
  formatDate:value=>String(value||""),todayISO:()=>"2026-10-19",
  uid:kind=>kind+"-generated",recordActivity:()=>{},
  saveState:()=>{saveCalls++;return options.save!==false;},
  scheduleUiWork:()=>{},openModal:(title,html)=>modals.push({title,html}),
  closeModal:()=>{},navigate:()=>{},allowsAnimalTransition:()=>true,
  rememberBreed:()=>{}
 });
 return {
  sale, get data(){return data;},get lastModal(){return modals[modals.length-1];},
  get confirmations(){return confirmations;},get toasts(){return toasts;},
  get saveCalls(){return saveCalls;},
  click(selector){const handler=getNode(selector).events.get("click");
   assert.equal(typeof handler,"function","missing click listener for "+selector);handler({});},
  submitPayment(values){const handler=getNode("#payment-form").events.get("submit");
   assert.equal(typeof handler,"function","missing form submission listener");
   handler({currentTarget:{values},preventDefault(){}});},
  restore(){globalThis.confirm=previousConfirm;globalThis.FormData=previousFormData;}
 };
}
function payment(amount,overrides={}){
 return {type:"Payment",date:"2026-10-19",amount,method:"Cash",reference:"",notes:"",...overrides};
}

test("real sale detail + Payment handler opens payment form and preserves original method choices",()=>{
 const h=harness();
 try{
  h.sale.openSaleDetail("sale-1");
  assert.match(h.lastModal.html,/id="sale-payment"/);
  assert.equal(h.data.payments.length,0);
  h.click("#sale-payment");
  assert.match(h.lastModal.html,/id="payment-form"/);
  assert.match(h.lastModal.html,/Deposit/);
  assert.match(h.lastModal.html,/Payment/);
  for(const name of ["Cash","Check","Card","Bank transfer","PayPal / Venmo","Other"])
   assert.ok(h.lastModal.html.includes(name),"missing historical payment method "+name);
  assert.equal(h.data.payments.length,0,"opening a payment form must not receive money");
  assert.equal(h.saveCalls,0);
 }finally{h.restore();}
});

test("saving $225 payment produces exactly one payment, linked Budget income and zero balance",()=>{
 const h=harness();
 try{
  h.sale.openSaleDetail("sale-1");
  h.click("#sale-payment");
  h.submitPayment(payment("225.00"));
  assert.equal(h.data.sales[0].status,"Draft","payment must not silently complete transfer");
  assert.equal(h.data.payments.length,1);
  assert.equal(h.data.transactions.length,1);
  assert.equal(h.data.payments[0].amount,"225.00");
  assert.equal(h.data.payments[0].transactionId,h.data.transactions[0].id);
  assert.equal(h.data.transactions[0].sourceType,"sale-payment");
  assert.equal(h.data.transactions[0].sourceId,h.data.payments[0].id);
  assert.equal(h.data.transactions[0].amount,"225.00");
  assert.equal(h.sale.salePaid("sale-1"),225);
  assert.equal(h.sale.saleBalance(h.data.sales[0]),0);
  assert.ok(h.data.animals.every(a=>a.status==="For Sale"));
  assert.equal(h.saveCalls,1);
  assert.match(h.lastModal.html,/id="sale-payment"/);
 }finally{h.restore();}
});

test("overpayment is rejected without new payment or Budget transaction",()=>{
 const h=harness();
 try{
  h.sale.openSaleDetail("sale-1");h.click("#sale-payment");
  h.submitPayment(payment("226.00"));
  assert.equal(h.data.payments.length,0);
  assert.equal(h.data.transactions.length,0);
  assert.equal(h.saveCalls,0);
  assert.ok(h.toasts.some(x=>/greater than the remaining/.test(x.message)));
 }finally{h.restore();}
});

test("failed save rolls back both payment and linked transaction",()=>{
 const h=harness({save:false}),before=JSON.stringify(h.data);
 try{
  h.sale.openSaleDetail("sale-1");h.click("#sale-payment");
  h.submitPayment(payment("125.00"));
  assert.equal(h.saveCalls,1);
  assert.equal(JSON.stringify(h.data),before);
  assert.equal(h.data.payments.length,0);
  assert.equal(h.data.transactions.length,0);
 }finally{h.restore();}
});

test("one-step completion requires confirmation, retains unpaid receivable and unlocks transfer",()=>{
 const h=harness();
 try{
  h.sale.openSaleDetail("sale-1");
  assert.match(h.lastModal.html,/id="sale-complete"/);
  h.click("#sale-complete");
  assert.equal(h.data.sales[0].status,"Completed");
  assert.equal(h.data.sales[0].saleNumber,"HH-2026-TMOUD1");
  assert.equal(h.data.animals.filter(a=>a.status==="Sold").length,2);
  assert.equal(h.data.payments.length,0);
  assert.equal(h.data.transactions.length,0);
  assert.equal(h.sale.saleBalance(h.data.sales[0]),225);
  assert.match(h.confirmations[0],/\$225\.00 still unpaid/);
  assert.match(h.lastModal.html,/id="sale-transfer" /);
  assert.doesNotMatch(h.lastModal.html,/id="sale-transfer" disabled/);
 }finally{h.restore();}
});

test("cancelled completion and failed save do not mark animals sold",()=>{
 for(const options of [{confirm:false},{save:false}]){
  const h=harness(options),before=JSON.stringify(h.data);
  try{
   const result=h.sale.completeSale("sale-1");
   assert.equal(result,false);
   assert.equal(JSON.stringify(h.data),before);
   assert.equal(h.sale.saleBalance(h.data.sales[0]),225);
  }finally{h.restore();}
 }
});

test("invoice, receipt and bill-of-sale print buttons target the popup window, not the parent module scope",()=>{
 const vm=require("node:vm");
 const originalOpen=globalThis.open;
 let popupHTML="",wasClosed=false;
 globalThis.open=()=>({document:{write(value){popupHTML=String(value);},close(){wasClosed=true;}},opener:null});
 const h=harness();
 try{
  for(const kind of ["Invoice","Receipt","Bill of Sale"]){
   popupHTML="";wasClosed=false;
   h.sale.openSaleDetail("sale-1");
   const selector=kind==="Invoice"?"#sale-invoice":kind==="Receipt"?"#sale-receipt":"#sale-bill";
   h.click(selector);
   assert.ok(wasClosed,kind+" popup document did not finish");
   assert.match(popupHTML,new RegExp("<h1>"+kind.replace(/ /g," " )+"</h1>"));
   assert.doesNotMatch(popupHTML,/root\.addEventListener|root\.print/);
   assert.match(popupHTML,/window\.addEventListener\('load'/);
   const match=popupHTML.match(/<script>([\s\S]*?)<\/script>/i);
   assert.ok(match,kind+" missing print script");
   let onload,printed=0;
   vm.runInNewContext(match[1],{
     window:{addEventListener:(name,cb)=>{assert.equal(name,"load");onload=cb;},print:()=>{printed++;}},
     setTimeout:(cb)=>cb()
   });
   assert.equal(typeof onload,"function");
   onload();
   assert.equal(printed,1,kind+" never invoked the popup print function");
  }
 }finally{h.restore();globalThis.open=originalOpen;}
});
