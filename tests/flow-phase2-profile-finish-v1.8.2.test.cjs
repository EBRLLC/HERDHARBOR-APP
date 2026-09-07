const test=require('node:test');
const assert=require('node:assert/strict');
const Finish=require('../flow-phase2-profile-finish-v1.8.2.js');

test('remaining offspring slots never exceed the recorded live outcome',()=>{
  const state={animals:[{id:'a1',sourceBirthId:'l1'},{id:'a2',sourceBirthId:'l1'}]};
  const litter={id:'l1',bornAlive:5,fosteredIn:1,fosteredOut:1,lostBeforeWeaning:1};
  assert.equal(Finish.liveAvailable(litter),4);
  assert.equal(Finish.remainingOffspringSlots(state,litter),2);
  assert.equal(Finish.remainingOffspringSlots({animals:[...state.animals,{id:'a3',sourceBirthId:'l1'},{id:'a4',sourceBirthId:'l1'},{id:'a5',sourceBirthId:'l1'}]},litter),0);
});

test('pedigree relations expose known parents and grandparents',()=>{
  const state={animals:[
    {id:'subject',sireId:'sire',damId:'dam'},
    {id:'sire',name:'Sire',sireId:'ss',damId:'sd'},
    {id:'dam',name:'Dam',sireId:'ds',damId:'dd'},
    {id:'ss',name:'Paternal grandsire'},{id:'sd',name:'Paternal granddam'},
    {id:'ds',name:'Maternal grandsire'},{id:'dd',name:'Maternal granddam'}
  ]};
  const rows=Finish.pedigreeRelations(state,'subject');
  assert.equal(rows.length,6);
  assert.ok(rows.some(row=>row.label==='Sire'&&row.id==='sire'));
  assert.ok(rows.some(row=>row.label==="Dam's dam"&&row.id==='dd'));
});

test('current ownership state distinguishes owned, reserved and sold records',()=>{
  assert.equal(Finish.currentOwnershipState({animals:[{id:'a1',status:'Active'}],sales:[]},'a1').label,'Owned here');
  assert.equal(Finish.currentOwnershipState({animals:[{id:'a2',status:'Reserved'}],sales:[]},'a2').label,'Reserved');
  const sold=Finish.currentOwnershipState({animals:[{id:'a3',status:'Sold'}],sales:[{id:'s1',status:'Completed',saleNumber:'S-1',items:[{animalId:'a3'}]}]},'a3');
  assert.equal(sold.label,'Sold');
  assert.equal(sold.saleId,'s1');
  assert.equal(sold.canSell,false);
});

test('an incoming direct transfer remains owned here while preserving provenance',()=>{
  const result=Finish.currentOwnershipState({animals:[{id:'a4',status:'Active',ownershipHistory:[{type:'transfer',date:'2026-09-07',transferId:'T-99',from:'Seller Farm',to:'Buyer Farm'}]}],sales:[]},'a4');
  assert.equal(result.label,'Owned here');
  assert.equal(result.canSell,true);
  assert.match(result.detail,/Received from Seller Farm/);
  assert.equal(result.date,'2026-09-07');
});

test('sale action opens an existing sale, creates an eligible sale, and hides for historical records',()=>{
  assert.deepEqual(Finish.saleActionForOwnership({saleId:'s1',canSell:false}),{kind:'open-sale',label:'Sale / transfer',saleId:'s1'});
  assert.deepEqual(Finish.saleActionForOwnership({saleId:'',canSell:true}),{kind:'new-sale',label:'Sell / transfer',saleId:''});
  assert.deepEqual(Finish.saleActionForOwnership({saleId:'',canSell:false}),{kind:'none',label:'',saleId:''});
});

test('salesForAnimal only returns sales containing the selected animal and newest first',()=>{
  const state={sales:[
    {id:'older',saleDate:'2026-01-01',items:[{animalId:'a1'}]},
    {id:'other',saleDate:'2026-09-01',items:[{animalId:'a2'}]},
    {id:'newer',saleDate:'2026-07-01',items:[{animalId:'a1'}]}
  ]};
  assert.deepEqual(Finish.salesForAnimal(state,'a1').map(row=>row.id),['newer','older']);
});
