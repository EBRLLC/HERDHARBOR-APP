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
  assert.equal(Lifecycle.lifecycleAction({status:'Delivered'},{bornAlive:6,lostBeforeWeaning:1,weaned:5}).kind,'edit-litter');
});

test('offspring lookup reuses litter offspringIds and sourceBirthId',()=>{
  const state={animals:[{id:'a1',sourceBirthId:'l1'},{id:'a2'},{id:'a3'}]};
  const litter={id:'l1',offspringIds:['a2']};
  assert.deepEqual(Lifecycle.offspringForLitter(state,litter).map(a=>a.id).sort(),['a1','a2']);
});

test('recording five born alive creates five active linked kit profiles',()=>{
  const litter={id:'litter-1',breedingId:'breeding-1',damId:'dam-1',sireId:'sire-1',birthDate:'2026-09-07',bornAlive:5,offspringPrefix:'WT'};
  const state={
    profile:{operationName:'Waggin Tails'},
    animals:[
      {id:'dam-1',name:'Judy',species:'Rabbit',breed:'Holland Lop',sex:'Female',location:'Rabbitry A'},
      {id:'sire-1',name:'Buck',species:'Rabbit',breed:'Holland Lop',sex:'Male'}
    ],
    litters:[litter]
  };
  const result=Lifecycle.autoCreateBornOffspring(state,litter,'2026-09-07T18:00:00.000Z');
  assert.equal(result.created.length,5);
  assert.equal(result.state.animals.length,7);
  assert.deepEqual(result.created.map(animal=>animal.name),['Judy Kit 1','Judy Kit 2','Judy Kit 3','Judy Kit 4','Judy Kit 5']);
  for(const kit of result.created){
    assert.equal(kit.status,'Active');
    assert.equal(kit.species,'Rabbit');
    assert.equal(kit.breed,'Holland Lop');
    assert.equal(kit.dob,'2026-09-07');
    assert.equal(kit.damId,'dam-1');
    assert.equal(kit.sireId,'sire-1');
    assert.equal(kit.sourceBirthId,'litter-1');
    assert.equal(kit.breeder,'Waggin Tails');
    assert.equal(kit.location,'Rabbitry A');
  }
  assert.deepEqual(result.created.map(animal=>animal.tag),['WT-1','WT-2','WT-3','WT-4','WT-5']);
  assert.equal(result.litter.offspringIds.length,5);
});

test('increasing born alive creates only missing profiles and never duplicates existing kits',()=>{
  const litter={id:'litter-2',damId:'dam-1',sireId:'sire-1',birthDate:'2026-09-07',bornAlive:5,offspringIds:['animal_offspring_litter-2_001','animal_offspring_litter-2_002','animal_offspring_litter-2_003']};
  const existing=Array.from({length:3},(_,index)=>({
    id:`animal_offspring_litter-2_00${index+1}`,
    name:`Judy Kit ${index+1}`,
    sourceBirthId:'litter-2',
    status:'Active'
  }));
  const state={
    animals:[{id:'dam-1',name:'Judy',species:'Rabbit',breed:'Holland Lop'},{id:'sire-1',name:'Buck',species:'Rabbit',breed:'Holland Lop'},...existing],
    litters:[litter]
  };
  const result=Lifecycle.autoCreateBornOffspring(state,litter,'2026-09-07T18:05:00.000Z');
  assert.equal(result.created.length,2);
  assert.equal(Lifecycle.offspringForLitter(result.state,result.litter).length,5);
  assert.equal(new Set(result.state.animals.map(animal=>animal.id)).size,result.state.animals.length);
});

test('reducing born alive never deletes an existing animal profile',()=>{
  const litter={id:'litter-3',damId:'dam-1',sireId:'sire-1',bornAlive:2,offspringIds:['kit-1','kit-2','kit-3']};
  const state={animals:[
    {id:'dam-1',name:'Doe',species:'Rabbit'},
    {id:'sire-1',name:'Buck',species:'Rabbit'},
    {id:'kit-1',sourceBirthId:'litter-3'},
    {id:'kit-2',sourceBirthId:'litter-3'},
    {id:'kit-3',sourceBirthId:'litter-3'}
  ],litters:[litter]};
  const result=Lifecycle.autoCreateBornOffspring(state,litter);
  assert.equal(result.created.length,0);
  assert.equal(result.state.animals.length,5);
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
