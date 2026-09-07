const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Core=require('../litter-sale-transfer-core-v1.8.2.js');

function fixture(){
  const litter={id:'l1',breedingId:'b1',damId:'dam',sireId:'sire',birthDate:'2026-09-01',offspringIds:['k1','k2','k3','k4','k5']};
  return{
    animals:[
      {id:'dam',name:'Judy',species:'Rabbit',status:'Active'},
      {id:'sire',name:'Jack',species:'Rabbit',status:'Active'},
      {id:'k1',name:'Kit One',status:'For Sale',askingPrice:'75.00',sourceBirthId:'l1'},
      {id:'k2',name:'Kit Two',status:'For Sale',askingPrice:'80.00',sourceBirthId:'l1'},
      {id:'k3',name:'Kit Three',status:'Active',askingPrice:'90.00',sourceBirthId:'l1'},
      {id:'k4',name:'Kit Four',status:'Deceased',sourceBirthId:'l1'},
      {id:'k5',name:'Kit Five',status:'Reserved',sourceBirthId:'l1',saleRecordId:'other-sale'}
    ],
    litters:[litter],customers:[],sales:[{id:'other-sale',saleNumber:'HH-2026-OTHER',status:'Reserved',items:[{animalId:'k5',quantity:'1',unitPrice:'85.00'}]}],transfers:[]
  };
}

test('only sale-ready unsold offspring are offered from a litter',()=>{
  assert.deepEqual(Core.saleCandidateOffspring(fixture(),'l1').map(a=>a.id).sort(),['k1','k2']);
});

test('creating a buyer sale writes canonical customer, sale items and reservation links',()=>{
  const result=Core.createSaleFromLitter(fixture(),'l1',{
    animalIds:['k1','k2'],prices:{k1:'70',k2:'82.50'},customerName:'Bluegrass Buyer',email:'buyer@example.com',phone:'555-0100',saleDate:'2026-09-07',status:'Reserved'
  },'2026-09-07T19:30:00.000Z');
  assert.equal(result.error,'');
  assert.equal(result.state.customers.length,1);
  assert.equal(result.customer.name,'Bluegrass Buyer');
  assert.equal(result.sale.sourceLitterId,'l1');
  assert.equal(result.sale.sourceBreedingId,'b1');
  assert.equal(result.sale.sourceWorkflow,'litter-sale-transfer');
  assert.match(result.sale.saleNumber,/^HH-2026-/);
  assert.equal(result.sale.items.length,2);
  assert.deepEqual(result.sale.items.map(i=>i.unitPrice),['70.00','82.50']);
  assert.equal(result.state.animals.find(a=>a.id==='k1').status,'Reserved');
  assert.equal(result.state.animals.find(a=>a.id==='k1').saleRecordId,result.sale.id);
  assert.equal(result.state.animals.find(a=>a.id==='k2').saleRecordId,result.sale.id);
  assert.equal(result.state.animals.find(a=>a.id==='k1').askingPrice,'75.00','actual sale price does not overwrite asking price');
  assert.equal(Core.saleTotal(result.sale),152.5);
});

test('existing buyer is reused instead of duplicated',()=>{
  const state=fixture();state.customers.push({id:'c1',name:'Existing Buyer',email:'buyer@example.com'});
  const byId=Core.createSaleFromLitter(state,'l1',{animalIds:['k1'],customerId:'c1',saleDate:'2026-09-07'});
  assert.equal(byId.error,'');assert.equal(byId.state.customers.length,1);assert.equal(byId.sale.customerId,'c1');
  const fresh=fixture();fresh.customers.push({id:'c1',name:'Existing Buyer',email:'buyer@example.com'});
  const byEmail=Core.createSaleFromLitter(fresh,'l1',{animalIds:['k1'],customerName:'Different typed name',email:'BUYER@example.com',saleDate:'2026-09-07'});
  assert.equal(byEmail.error,'');assert.equal(byEmail.state.customers.length,1);assert.equal(byEmail.sale.customerId,'c1');
});

test('an animal already attached to an active sale cannot be sold twice',()=>{
  const state=fixture();state.sales.push({id:'sale-k1',status:'Pending',items:[{animalId:'k1'}]});
  assert.deepEqual(Core.saleCandidateOffspring(state,'l1').map(a=>a.id),['k2']);
  const result=Core.createSaleFromLitter(state,'l1',{animalIds:['k1'],customerName:'Buyer'});
  assert.match(result.error,/no longer available/i);assert.equal(result.state,state);
});

test('completing and cancelling a litter sale use the same animal status semantics as Sales',()=>{
  const created=Core.createSaleFromLitter(fixture(),'l1',{animalIds:['k1'],customerName:'Buyer',saleDate:'2026-09-07'},'2026-09-07T19:30:00.000Z');
  const completed=Core.updateSaleStatus(created.state,created.sale.id,'Completed','2026-09-07T20:00:00.000Z');
  assert.equal(completed.error,'');assert.equal(completed.sale.status,'Completed');assert.equal(completed.sale.completedAt,'2026-09-07T20:00:00.000Z');assert.equal(completed.state.animals.find(a=>a.id==='k1').status,'Sold');
  const created2=Core.createSaleFromLitter(fixture(),'l1',{animalIds:['k2'],customerName:'Buyer',saleDate:'2026-09-07'},'2026-09-07T19:31:00.000Z');
  const cancelled=Core.updateSaleStatus(created2.state,created2.sale.id,'Cancelled','2026-09-07T20:01:00.000Z');
  assert.equal(cancelled.state.animals.find(a=>a.id==='k2').status,'For Sale');assert.equal(cancelled.state.animals.find(a=>a.id==='k2').saleRecordId,'');
});

test('completed litter sale surfaces direct-transfer stage when transfer history exists',()=>{
  const created=Core.createSaleFromLitter(fixture(),'l1',{animalIds:['k1'],customerName:'Buyer',status:'Completed',saleDate:'2026-09-07'},'2026-09-07T19:30:00.000Z');
  assert.equal(Core.saleStage(created.state,created.sale).stage,'completed');
  created.state.transfers.push({id:'t1',sourceSaleNumber:created.sale.saleNumber,status:'pending',animalIds:['k1'],createdAt:'2026-09-07T20:00:00Z'});
  const stage=Core.saleStage(created.state,created.sale);assert.equal(stage.stage,'transfer');assert.match(stage.label,/pending/i);
});

test('litter sales include canonical sales even when created from the full Sales screen',()=>{
  const state=fixture();state.sales.push({id:'s2',status:'Completed',saleDate:'2026-09-07',items:[{animalId:'k1'}]});
  const ids=Core.litterSales(state,'l1').map(s=>s.id);assert.ok(ids.includes('s2'));assert.ok(ids.includes('other-sale'));
});

test('UI connects Evaluation to canonical sales and the existing direct transfer service',()=>{
  const ui=fs.readFileSync(path.join(__dirname,'..','litter-sale-transfer-v1.8.2.js'),'utf8');
  assert.match(ui,/Evaluation/);
  assert.match(ui,/Sale & transfer/);
  assert.match(ui,/Core\.createSaleFromLitter/);
  assert.match(ui,/HerdHarborApp\?\.commitState/);
  assert.match(ui,/HerdHarborDirectTransfers/);
  assert.match(ui,/sendSale/);
  assert.match(ui,/data-route=\\?"sales\\?"/);
});

test('release loader and PWA cache include litter sale-transfer assets without changing v1.8.1 identity',()=>{
  const build=fs.readFileSync(path.join(__dirname,'..','herdharbor-build.js'),'utf8');
  const sw=fs.readFileSync(path.join(__dirname,'..','service-worker.js'),'utf8');
  for(const asset of ['litter-sale-transfer-core-v1.8.2.js','litter-sale-transfer-v1.8.2.js','litter-sale-transfer-v1.8.2.css']){
    assert.match(build,new RegExp(asset.replace(/\./g,'\\.')));
    assert.match(sw,new RegExp(asset.replace(/\./g,'\\.')));
  }
  assert.match(build,/version:\s*"1\.8\.1"/);
  assert.doesNotMatch(build,/version:\s*"1\.8\.2"/);
});
