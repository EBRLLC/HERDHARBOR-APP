const test=require('node:test');
const assert=require('node:assert/strict');
const Lifecycle=require('../flow-phase2-lifecycle-v1.8.2.js');

test('breeding lifecycle advances through pregnancy, birth and weaning',()=>{
  assert.equal(Lifecycle.breedingStage({status:'Planned'}).id,'planned');
  assert.equal(Lifecycle.breedingStage({status:'Bred'}).id,'bred');
  assert.equal(Lifecycle.breedingStage({status:'Pregnancy check due',pregnancyCheckStatus:'Not checked'}).id,'check');
  assert.equal(Lifecycle.breedingStage({status:'Confirmed pregnant',pregnancyCheckStatus:'Positive'}).id,'confirmed');
  assert.equal(Lifecycle.breedingStage({status:'Due soon',pregnancyCheckStatus:'Positive'}).id,'due');
  const birth={id:'l1',bornAlive:'5',fosteredIn:'0',fosteredOut:'0',lostBeforeWeaning:'1',weaned:'2'};
  assert.equal(Lifecycle.breedingStage({status:'Delivered'},birth).id,'birth');
  assert.equal(Lifecycle.breedingStage({status:'Delivered'},{...birth,weaned:'4'}).id,'weaning');
});

test('negative pregnancy result terminates the active breeding path',()=>{
  const stage=Lifecycle.breedingStage({status:'Bred',pregnancyCheckStatus:'Negative'});
  assert.equal(stage.terminal,true);
  assert.equal(stage.outcome,'Not pregnant');
  assert.equal(Lifecycle.lifecycleAction({status:'Not pregnant'},null).kind,'edit-breeding');
});

test('birth lifecycle chooses the next canonical action',()=>{
  assert.equal(Lifecycle.lifecycleAction({status:'Due soon'},null).kind,'record-birth');
  assert.equal(Lifecycle.lifecycleAction({status:'Delivered'},{bornAlive:6,lostBeforeWeaning:1,weaned:3}).kind,'edit-litter');
  assert.equal(Lifecycle.lifecycleAction({status:'Delivered'},{bornAlive:6,lostBeforeWeaning:1,weaned:5}).kind,'create-offspring');
});

test('offspring lookup reuses litter offspringIds and sourceBirthId',()=>{
  const state={animals:[{id:'a1',sourceBirthId:'l1'},{id:'a2'},{id:'a3'}]};
  const litter={id:'l1',offspringIds:['a2']};
  assert.deepEqual(Lifecycle.offspringForLitter(state,litter).map(a=>a.id).sort(),['a1','a2']);
});

test('ownership rows include breeder, account transfer history and sales',()=>{
  const state={
    animals:[{id:'a1',name:'Doe',dob:'2026-01-01',breeder:'Original Rabbitry',ownershipHistory:[{type:'transfer',date:'2026-05-01',transferId:'T-1',from:'Original Rabbitry',to:'Buyer Farm'}]}],
    sales:[{status:'Completed',saleDate:'2026-07-01',saleNumber:'S-1',items:[{animalId:'a1'}]}],
    transfers:[]
  };
  const rows=Lifecycle.ownershipRows(state,'a1');
  assert.ok(rows.some(r=>r.title.includes('Bred by Original Rabbitry')));
  assert.ok(rows.some(r=>r.title.includes('Original Rabbitry → Buyer Farm')));
  assert.ok(rows.some(r=>r.detail==='S-1'));
});

test('offspring disposition reflects retained, sale and transfer state',()=>{
  assert.equal(Lifecycle.offspringDisposition({sales:[],transfers:[]},{id:'a1',status:'Active'}),'Retained');
  assert.equal(Lifecycle.offspringDisposition({sales:[],transfers:[]},{id:'a2',status:'For Sale'}),'For sale');
  assert.equal(Lifecycle.offspringDisposition({sales:[{status:'Completed',items:[{animalId:'a3'}]}],transfers:[]},{id:'a3',status:'Sold'}),'Sold');
  assert.equal(Lifecycle.offspringDisposition({sales:[],transfers:[]},{id:'a4',status:'Active',ownershipHistory:[{type:'transfer',date:'2026-01-01'}]}),'Transferred');
});
