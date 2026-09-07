const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Core=require('../breeding-next-action-core-v1.8.2.js');

function rabbitFixture(){return{
  animals:[
    {id:'doe',name:'Judy',species:'Rabbit',breed:'Holland Lop',sex:'Female',status:'Breeding'},
    {id:'buck',name:'Jack',species:'Rabbit',breed:'Holland Lop',sex:'Male',status:'Active'}
  ],
  breedings:[{id:'b1',femaleId:'doe',maleId:'buck',breedingDate:'2026-09-01',status:'Bred',pregnancyCheckStatus:'Not checked'}],
  litters:[],sales:[],transfers:[]
};}

test('rabbit defaults derive day-12 pregnancy check, day-31 due date, and a conservative day-42 weaning target',()=>{
  const state=rabbitFixture(),breeding=state.breedings[0];
  assert.equal(Core.derivedPregnancyCheckDate(state,breeding),'2026-09-13');
  assert.equal(Core.derivedDueDate(state,breeding),'2026-10-02');
  assert.equal(Core.RABBIT_DEFAULTS.weaningDay,42);
});

test('rabbit breeding tells the breeder the pregnancy check is due on day 12',()=>{
  const state=rabbitFixture();
  const next=Core.breedingNextAction(state,state.breedings[0],'2026-09-13');
  assert.equal(next.kind,'pregnancy-check');
  assert.equal(next.shortLabel,'Record pregnancy check');
  assert.equal(next.dueDate,'2026-09-13');
  assert.equal(next.urgency,'today');
});

test('confirmed pregnancy advances to birth instead of asking for another pregnancy check',()=>{
  const state=rabbitFixture();state.breedings[0]={...state.breedings[0],pregnancyCheckStatus:'Positive',status:'Confirmed Pregnant'};
  const approaching=Core.breedingNextAction(state,state.breedings[0],'2026-09-30');
  assert.equal(approaching.kind,'prepare-birth');
  const due=Core.breedingNextAction(state,state.breedings[0],'2026-10-02');
  assert.equal(due.kind,'record-birth');
});

test('linked litter advances through offspring details and weaning',()=>{
  const state=rabbitFixture();
  state.litters.push({id:'l1',breedingId:'b1',damId:'doe',sireId:'buck',birthDate:'2026-10-02',bornAlive:'2',weaned:'0',expectedWeanDate:'2026-11-20',offspringIds:['k1','k2']});
  state.animals.push(
    {id:'k1',name:'Judy Kit 1',species:'Rabbit',sex:'Unknown',status:'Active',sourceBirthId:'l1'},
    {id:'k2',name:'Judy Kit 2',species:'Rabbit',sex:'Female',tag:'WT2',status:'Active',sourceBirthId:'l1'}
  );
  let next=Core.breedingNextAction(state,state.breedings[0],'2026-10-10');
  assert.equal(next.kind,'update-offspring');
  state.animals[2]={...state.animals[2],sex:'Male',tag:'WT1'};
  next=Core.breedingNextAction(state,state.breedings[0],'2026-11-20');
  assert.equal(next.kind,'wean-litter');
});

test('four-day-old rabbit litter cannot be evaluated for weaning from a legacy weaned count',()=>{
  const state=rabbitFixture();
  state.breedings[0]={...state.breedings[0],breedingDate:'2026-08-03',status:'Delivered'};
  state.litters.push({id:'l1',breedingId:'b1',damId:'doe',sireId:'buck',birthDate:'2026-09-03',bornAlive:'2',weaned:'2',offspringIds:['k1','k2']});
  state.animals.push(
    {id:'k1',name:'Judy Kit 1',species:'Rabbit',sex:'Male',tag:'WT1',status:'Active',sourceBirthId:'l1'},
    {id:'k2',name:'Judy Kit 2',species:'Rabbit',sex:'Female',tag:'WT2',status:'Active',sourceBirthId:'l1'}
  );
  assert.equal(Core.derivedWeanDate(state,state.litters[0]),'2026-10-15');
  assert.equal(Core.effectiveWeanedCount(state,state.litters[0],'2026-09-07'),0);
  assert.equal(Core.weaningComplete(state,state.litters[0],'2026-09-07'),false);
  const next=Core.litterNextAction(state,state.litters[0],'2026-09-07');
  assert.equal(next.kind,'manage-litter');
  assert.equal(next.dueDate,'2026-10-15');
  assert.match(next.label,/Weaning in 38 days/);
  assert.equal(Core.dashboardActions(state,'2026-09-07',14).length,0);
});

test('an explicit expected wean date overrides the rabbit default',()=>{
  const state=rabbitFixture();
  const litter={id:'l1',damId:'doe',sireId:'buck',birthDate:'2026-09-03',expectedWeanDate:'2026-10-01'};
  assert.equal(Core.derivedWeanDate(state,litter),'2026-10-01');
});

test('explicit offspring weaning records can advance the workflow even when earlier than the default target',()=>{
  const state=rabbitFixture();
  state.litters.push({id:'l1',breedingId:'b1',damId:'doe',sireId:'buck',birthDate:'2026-09-03',bornAlive:'2',weaned:'0',offspringIds:['k1','k2']});
  state.animals.push(
    {id:'k1',name:'Kit 1',species:'Rabbit',sex:'Male',tag:'WT1',status:'Active',sourceBirthId:'l1',weanedDate:'2026-10-01'},
    {id:'k2',name:'Kit 2',species:'Rabbit',sex:'Female',tag:'WT2',status:'Active',sourceBirthId:'l1',weanedDate:'2026-10-01'}
  );
  assert.equal(Core.weaningComplete(state,state.litters[0],'2026-10-01'),true);
  assert.equal(Core.litterNextAction(state,state.litters[0],'2026-10-01').kind,'evaluate-litter');
});

test('weaned litter asks for evaluation once, then moves to buyer sale',()=>{
  const state=rabbitFixture();
  state.litters.push({id:'l1',breedingId:'b1',damId:'doe',sireId:'buck',birthDate:'2026-10-02',bornAlive:'2',weaned:'2',offspringIds:['k1','k2']});
  state.animals.push(
    {id:'k1',name:'Kit 1',species:'Rabbit',sex:'Male',tag:'WT1',status:'Active',sourceBirthId:'l1'},
    {id:'k2',name:'Kit 2',species:'Rabbit',sex:'Female',tag:'WT2',status:'For Sale',sourceBirthId:'l1'}
  );
  let next=Core.litterNextAction(state,state.litters[0],'2026-11-20');
  assert.equal(next.kind,'evaluate-litter');
  const marked=Core.markEvaluated(state,'l1',['k1','k2']);
  next=Core.litterNextAction(marked,marked.litters[0],'2026-11-20');
  assert.equal(next.kind,'create-sale');
});

test('completed litter sale advances to member transfer when no transfer exists',()=>{
  let state=rabbitFixture();
  state.litters=[{id:'l1',breedingId:'b1',damId:'doe',sireId:'buck',bornAlive:'1',weaned:'1',offspringIds:['k1'],nextActionEvaluatedIds:['k1']}];
  state.animals.push({id:'k1',name:'Kit 1',status:'Sold',sourceBirthId:'l1'});
  state.sales=[{id:'s1',saleNumber:'HH-2026-1',status:'Completed',sourceLitterId:'l1',items:[{animalId:'k1'}]}];
  const next=Core.litterNextAction(state,state.litters[0],'2026-11-20');
  assert.equal(next.kind,'transfer-buyer');assert.equal(next.saleId,'s1');
  state.transfers=[{id:'t1',sourceSaleNumber:'HH-2026-1',animalIds:['k1'],status:'accepted'}];
  assert.equal(Core.litterNextAction(state,state.litters[0],'2026-11-20').kind,'lifecycle-complete');
});

test('dashboard only surfaces breeding actions inside the selected horizon plus immediate workflow actions',()=>{
  const state=rabbitFixture();
  assert.equal(Core.dashboardActions(state,'2026-09-01',5).length,0);
  const due=Core.dashboardActions(state,'2026-09-10',5);
  assert.equal(due.length,1);assert.equal(due[0].kind,'open-breeding');
});

test('UI surfaces next action on profile, breeding cards, litter workspace, and Today',()=>{
  const ui=fs.readFileSync(path.join(__dirname,'..','breeding-next-action-v1.8.2.js'),'utf8');
  for(const token of ['hh-next-profile','hh-next-card-row','hh-next-workspace','hh-next-dashboard'])assert.match(ui,new RegExp(token));
  assert.match(ui,/HerdHarborFlowPhase2\?\.openAnimalProfile/);
  assert.match(ui,/HerdHarborBreedingWorkspace\?\.open/);
  assert.match(ui,/data-hh-bw-disposition/);
});

test('release loader includes the next-action engine without changing public v1.8.1 identity',()=>{
  const build=fs.readFileSync(path.join(__dirname,'..','herdharbor-build.js'),'utf8');
  for(const asset of ['breeding-next-action-core-v1.8.2.js','breeding-next-action-v1.8.2.js','breeding-next-action-v1.8.2.css'])assert.match(build,new RegExp(asset.replace(/\./g,'\\.')));
  assert.match(build,/breeding-next-action-core-v1\.8\.2\.js\?v=2/);
  assert.match(build,/version:\s*"1\.8\.1"/);assert.doesNotMatch(build,/version:\s*"1\.8\.2"/);
});
