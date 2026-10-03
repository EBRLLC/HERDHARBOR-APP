const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Workspace=require('../breeding-litter-workspace-v1.8.2.js');

function fixture(){
  const litter={id:'l1',breedingId:'b1',damId:'dam',sireId:'sire',birthDate:'2026-09-07',bornAlive:'5',fosteredIn:'0',fosteredOut:'0',lostBeforeWeaning:'0',weaned:'0',offspringIds:['k1','k2','k3','k4','k5']};
  return{
    animals:[
      {id:'dam',name:'Judy',species:'Rabbit',breed:'Holland Lop',status:'Active'},
      {id:'sire',name:'Jack',species:'Rabbit',breed:'Holland Lop',status:'Active'},
      ...Array.from({length:5},(_,i)=>({id:`k${i+1}`,name:`Judy Kit ${i+1}`,species:'Rabbit',breed:'Holland Lop',sex:'Unknown',status:'Active',damId:'dam',sireId:'sire',sourceBirthId:'l1'}))
    ],
    litters:[litter],
    health:[]
  };
}

test('bulk identity editing updates linked offspring without touching pedigree links',()=>{
  const state=fixture();
  const result=Workspace.applyIdentityUpdates(state,'l1',[
    {animalId:'k1',name:'Poppy',sex:'Female',color:'Broken Black',tattoo:'WT101',tag:'A-1'},
    {animalId:'not-in-litter',name:'Wrong'}
  ],'2026-09-07T19:00:00.000Z');
  assert.equal(result.updated,1);
  const kit=result.state.animals.find(a=>a.id==='k1');
  assert.equal(kit.name,'Poppy');
  assert.equal(kit.sex,'Female');
  assert.equal(kit.color,'Broken Black');
  assert.equal(kit.tattoo,'WT101');
  assert.equal(kit.damId,'dam');
  assert.equal(kit.sireId,'sire');
  assert.equal(kit.sourceBirthId,'l1');
});

test('one litter weight save creates individual canonical weight records',()=>{
  const state=fixture();
  const entries=Array.from({length:5},(_,i)=>({animalId:`k${i+1}`,weight:String(3+i/10)}));
  const result=Workspace.addBulkWeights(state,'l1',entries,{date:'2026-09-14',weightUnit:'oz'},'2026-09-14T12:00:00.000Z');
  assert.equal(result.created.length,5);
  assert.equal(result.state.health.length,5);
  for(const row of result.created){
    assert.equal(row.type,'Weight');
    assert.equal(row.date,'2026-09-14');
    assert.equal(row.weightUnit,'oz');
    assert.equal(row.details,'Litter weight');
  }
  assert.equal(new Set(result.created.map(row=>row.animalId)).size,5);
});

test('one health action writes an individual history record to every selected offspring',()=>{
  const state=fixture();
  const result=Workspace.addBulkHealth(state,'l1',['k1','k2','k3','k4','k5'],{
    date:'2026-09-15',type:'Treatment',details:'Routine litter treatment',followUpDate:'2026-09-22'
  },'2026-09-15T12:00:00.000Z');
  assert.equal(result.created.length,5);
  assert.ok(result.created.every(row=>row.type==='Treatment'&&row.details==='Routine litter treatment'));
  assert.ok(result.created.every(row=>row.followUpDate==='2026-09-22'));
});

test('recording a pre-weaning loss preserves the animal, marks it deceased and updates litter totals once',()=>{
  const state=fixture();
  const first=Workspace.recordLoss(state,'l1','k3',{date:'2026-09-16',reason:'Fading kit'},'2026-09-16T12:00:00.000Z');
  assert.equal(first.changed,true);
  assert.equal(first.state.animals.find(a=>a.id==='k3').status,'Deceased');
  assert.equal(first.state.animals.length,state.animals.length);
  assert.equal(first.state.litters[0].lostBeforeWeaning,'1');
  assert.equal(first.state.health.length,1);
  const second=Workspace.recordLoss(first.state,'l1','k3',{date:'2026-09-17',reason:'Duplicate'});
  assert.equal(second.changed,false);
  assert.equal(second.state.litters[0].lostBeforeWeaning,'1');
  assert.equal(second.state.health.length,1);
});

test('bulk weaning marks individual profiles and advances the linked litter count',()=>{
  const state=fixture();
  const first=Workspace.weanSelected(state,'l1',['k1','k2'],{date:'2026-10-01',location:'Grow-out A'},'2026-10-01T12:00:00.000Z');
  assert.deepEqual(first.updated.sort(),['k1','k2']);
  assert.equal(first.state.litters[0].weaned,'2');
  assert.equal(first.state.animals.find(a=>a.id==='k1').weanedDate,'2026-10-01');
  assert.equal(first.state.animals.find(a=>a.id==='k1').location,'Grow-out A');
  const second=Workspace.weanSelected(first.state,'l1',['k1','k2','k3','k4','k5'],{date:'2026-10-02'});
  assert.equal(second.updated.length,3);
  assert.equal(second.state.litters[0].weaned,'5');
});

test('disposition is bulk editable but sold and deceased records are protected',()=>{
  const state=fixture();
  state.animals.find(a=>a.id==='k4').status='Sold';
  state.animals.find(a=>a.id==='k5').status='Deceased';
  const forSale=Workspace.setDisposition(state,'l1',['k1','k2','k4','k5'],'for-sale','2026-10-03T12:00:00.000Z');
  assert.deepEqual(forSale.updated.sort(),['k1','k2']);
  assert.equal(forSale.state.animals.find(a=>a.id==='k1').status,'For Sale');
  assert.equal(forSale.state.animals.find(a=>a.id==='k4').status,'Sold');
  assert.equal(forSale.state.animals.find(a=>a.id==='k5').status,'Deceased');
  const retain=Workspace.setDisposition(forSale.state,'l1',['k1'],'retain');
  assert.equal(retain.state.animals.find(a=>a.id==='k1').status,'Active');
});

test('workspace summary stays tied to the canonical birth and animal records',()=>{
  const state=fixture();
  const info=Workspace.summary(state,'l1');
  assert.equal(info.bornAlive,5);
  assert.equal(info.offspring.length,5);
  assert.equal(info.living,5);
  assert.equal(info.available,5);
});

test('current build loads the litter workspace after the Phase Two lifecycle engine',()=>{
  const build=fs.readFileSync(path.join(__dirname,'..','herdharbor-build.js'),'utf8');
  const lifecycle=build.indexOf('flow-phase2-lifecycle-v1.8.2.js');
  const workspace=build.indexOf('breeding-litter-workspace-v1.8.2.js');
  const integration=build.indexOf('breeding-litter-workspace-integration-v1.8.2.js');
  assert.ok(lifecycle>=0&&workspace>lifecycle&&integration>workspace);
  assert.ok(build.includes('breeding-litter-workspace-v1.8.2.css'));
});

test('integration replaces manual litter creation entry points with Manage litter',()=>{
  const integration=fs.readFileSync(path.join(__dirname,'..','breeding-litter-workspace-integration-v1.8.2.js'),'utf8');
  assert.ok(integration.includes('data-create-offspring'));
  assert.ok(integration.includes('Manage litter'));
  assert.ok(integration.includes('hhBwManageLitter'));
});
