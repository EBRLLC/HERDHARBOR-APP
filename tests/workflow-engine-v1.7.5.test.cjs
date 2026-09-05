'use strict';
const assert=require('node:assert/strict');
const Engine=require('../workflow-engine-v1.7.5.js');

assert.equal(Engine.VERSION,'1.7.5');
assert.equal(Engine.CONTRACT.id,'HH-WORKFLOW-ENGINE-001');
assert.equal(Engine.CONTRACT.hardlocked,true);

const state={
  animals:[
    {id:'doe',name:'Penny',species:'Rabbit',breed:'Holland Lop',sex:'Female',status:'Active',birthDate:'2025-01-01'},
    {id:'buck',name:'Tater',species:'Rabbit',breed:'Holland Lop',sex:'Male',status:'Active'},
    {id:'cow',name:'Bessie',species:'Cattle',sex:'Female',status:'Active'},
    {id:'goat',name:'Maple',species:'Goat',sex:'Female',status:'Active'},
    {id:'sold',name:'Old Doe',species:'Rabbit',sex:'Female',status:'Sold'}
  ],
  health:[
    {id:'w1',animalId:'doe',type:'Weight',date:'2026-08-01',weight:'3.8',weightUnit:'lb'},
    {id:'w2',animalId:'doe',type:'Weight',date:'2026-09-01',weight:'4.0',weightUnit:'lb'}
  ],
  healthIntelligence:{episodes:[
    {id:'ep1',animalId:'doe',species:'rabbit',concern:'Observation',startedDate:'2026-09-04',recheckDate:'2026-09-05',quarantined:true,resolved:false}
  ],careRecords:[
    {id:'care1',animalId:'doe',type:'Vaccination',date:'2026-08-01',boosterDueDate:'2026-09-06',meatWithdrawalEnd:'2026-09-07'}
  ],groupRecords:[]},
  breedings:[
    {id:'breed1',femaleId:'doe',maleId:'buck',species:'Rabbit',breedingDate:'2026-08-05',status:'Bred',predictionSnapshot:{expected:['black','blue']}},
    {id:'goatbreed',femaleId:'goat',species:'Goat',breedingDate:'2026-08-05',status:'Bred'}
  ],
  litters:[{id:'lit1',damId:'doe',sireId:'buck',birthDate:'2026-08-01',expectedWeanDate:'2026-09-12',bornAlive:'4',weaned:'0',lostBeforeWeaning:'0',fosteredIn:'0',fosteredOut:'0',offspringIds:[]}],
  tasks:[{id:'existing-breed-check',title:'Penny pregnancy / breeding check',category:'Breeding',dueDate:'2026-08-19',completed:false,sourceType:'breeding',sourceRecordId:'breed1',reminderType:'pregnancy-check'}],
  shows:[{id:'show1',name:'County Fair',status:'Active',entryDeadline:'2026-09-05',startDate:'2026-09-10'}],
  showEntries:[{id:'entry1',showId:'show1',animalId:'doe',className:'Senior Doe'}],
  showResults:[{id:'result1',entryId:'entry1',placement:'1st'}],
  transactions:[{id:'tx1',date:'2026-09-01',category:'Rabbit Sale',invoiceNumber:'INV-101',customerName:'Jane Farmer',amount:'50'}],
  customers:[{id:'customer1',name:'Jane Farmer',email:'jane@example.com'}],
  locations:[{id:'barn',name:'Rabbit Barn',type:'Barn'},{id:'row-a',name:'Row A',type:'Cage Row',parentId:'barn'}]
};

assert.deepEqual(Engine.currentAnimals(state).map(a=>a.id),['doe','buck','cow','goat']);
assert.deepEqual(Engine.activeSpecies(state),['cattle','goat','rabbit']);

const actions=Engine.animalActions('doe',state);
assert.equal(actions.find(a=>a.id==='breed').enabled,false,'quarantine blocks new breeding');
assert.match(actions.find(a=>a.id==='breed').reason,/quarantined/i);
assert.equal(actions.find(a=>a.id==='add-health').enabled,true);
assert.ok(Engine.profileTabs('doe',state).some(t=>t.id==='history'));

const rabbitSchedule=Engine.breedingSchedule(state.breedings[0],state);
assert.equal(rabbitSchedule.pregnancyCheckDate,'2026-08-19');
assert.equal(rabbitSchedule.preparationDate,'2026-09-02');
assert.equal(rabbitSchedule.dueDate,'2026-09-05');
assert.equal(rabbitSchedule.sources.dueDate,'reviewed-existing-rule');
const goatSchedule=Engine.breedingSchedule(state.breedings[1],state);
assert.equal(goatSchedule.rule,null,'unreviewed species do not get fabricated timing rules');
assert.equal(goatSchedule.dueDate,'');

const birth=Engine.birthDefaultsFromBreeding(state.breedings[0],state,{birthDate:'2026-09-05'});
assert.equal(birth.id,'litter_breeding_breed1');
assert.equal(birth.damId,'doe');
assert.equal(birth.sireId,'buck');
assert.equal(birth.species,'rabbit');
assert.equal(birth.breedingDate,'2026-08-05');
assert.equal(birth.expectedWeanDate,'2026-10-17');
assert.deepEqual(birth.predictionSnapshot,{expected:['black','blue']});
const offspring=Engine.offspringDefaultsFromBirth(birth,state,2);
assert.equal(offspring.id,'animal_offspring_litter_breeding_breed1_002');
assert.equal(offspring.damId,'doe');
assert.equal(offspring.sireId,'buck');
assert.equal(offspring.sourceBreedingId,'breed1');

const transitioned=Engine.transitionBreeding(state,'breed1','pregnancy-check');
assert.equal(transitioned.record.lifecycleStage,'pregnancy-check');
assert.equal(transitioned.record.status,'Pregnancy check due');
assert.throws(()=>Engine.transitionBreeding(state,'breed1','complete'),/cannot move/);

const events=Engine.deriveEvents(state,{onDate:'2026-09-05'});
assert.ok(events.some(e=>e.kind==='health-recheck'&&e.date==='2026-09-05'));
assert.ok(events.some(e=>e.kind==='quarantine-active'));
assert.ok(events.some(e=>e.kind==='booster'&&e.date==='2026-09-06'));
assert.ok(events.some(e=>e.kind==='meat-withdrawal-active'));
assert.ok(events.some(e=>e.kind==='expected-birth'&&e.sourceId==='breed1'));
assert.ok(events.some(e=>e.kind==='weaning'&&e.sourceId==='lit1'));
assert.ok(events.some(e=>e.kind==='show-deadline'));
assert.equal(events.filter(e=>e.sourceType==='breeding'&&e.sourceId==='breed1'&&e.kind==='pregnancy-check').length,0,'derived event is suppressed when canonical task already tracks it');
const queue=Engine.todayQueue(state,{onDate:'2026-09-05',upcomingDays:7});
assert.ok(queue.today.length>=4);
assert.ok(queue.upcoming.some(e=>e.kind==='booster'));

const suggestions=Engine.reminderSuggestions('breeding',state.breedings[0],state);
assert.equal(suggestions.length,3);
assert.ok(suggestions.every(s=>s.requiresConfirmation===true&&s.silent===false));
let accepted=Engine.acceptReminder({...state,tasks:[]},suggestions[0]);
assert.equal(accepted.created,true);
assert.equal(accepted.task.sourceType,'breeding');
assert.equal(accepted.task.reminderType,'pregnancy-check');
accepted=Engine.acceptReminder(accepted.state,suggestions[0]);
assert.equal(accepted.created,false,'accepting same suggestion is idempotent');

assert.deepEqual(Engine.smartDefaults({animalId:'doe',kind:'add-weight'},state),{animalId:'doe',species:'Rabbit',weightUnit:'lb'});
assert.equal(Engine.quickAdd({surface:'animal',animalId:'doe'},state).find(a=>a.id==='breed').enabled,false);
assert.deepEqual(Engine.quickAdd({surface:'health'},state).map(a=>a.id),['start-health-episode','treatment','vaccination','group-treatment']);
assert.equal(Engine.quickAdd({surface:'litter',litterId:'lit1'},state)[0].defaults.damId,'doe');

assert.equal(Engine.universalSearch(state,'Penny')[0].type,'animal');
assert.ok(Engine.universalSearch(state,'INV-101').some(r=>r.type==='transaction'));
assert.ok(Engine.universalSearch(state,'Jane Farmer').some(r=>r.type==='customer'));
const timeline=Engine.animalTimeline('doe',state);
for(const type of ['Birth','Weight','Health','Breeding','Show'])assert.ok(timeline.some(e=>e.type===type),`${type} appears in animal timeline`);

const moved=Engine.moveAnimals(state,['doe','sold'],'row-a',{date:'2026-09-05',note:'Routine move'});
assert.deepEqual(moved.moved,['doe'],'historical animals are not moved operationally');
assert.equal(moved.state.animals.find(a=>a.id==='doe').locationId,'row-a');
assert.ok(moved.state.workflowEngine.activityLog.some(x=>x.animalId==='doe'&&x.type==='Location'));
assert.equal(Engine.animalsAtLocation(moved.state,'barn',{includeDescendants:true}).some(a=>a.id==='doe'),true);
assert.equal(Engine.locationTree(moved.state)[0].children[0].id,'row-a');

console.log('HerdHarbor Alpha v1.7.5 workflow engine tests passed');
