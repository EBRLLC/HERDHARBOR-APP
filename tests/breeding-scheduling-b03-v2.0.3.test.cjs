const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const schedule = require('../breeding-scheduling-v2.0.3.js');

test('rabbit pregnancy check, nest-box preparation and due estimate stay consistent', () => {
  const result=schedule.schedule({species:'Rabbit'},'2026-11-14');
  assert.equal(result.pregnancyCheckDate,'2026-11-28');
  assert.equal(result.preparationDate,'2026-12-12');
  assert.equal(result.dueDate,'2026-12-15');
  assert.deepEqual(result.dueRange,{earliest:'2026-12-14',latest:'2026-12-17'});
  assert.equal(result.pregnancyConfirmed,false);
  assert.equal(result.evidence,'estimated-from-recorded-mating-date');
});
test('dog and cat breeding-date estimates provide ranges, not pregnancy diagnoses', () => {
  const dog=schedule.schedule({species:'Dog'},'2026-11-14');
  assert.equal(dog.dueRange.earliest,'2027-01-11');
  assert.equal(dog.dueRange.latest,'2027-01-25');
  assert.equal(dog.pregnancyConfirmed,false);
  const cat=schedule.schedule({species:'Cat'},'2026-11-14');
  assert.equal(cat.dueDate,'2027-01-18');
});
test('cavy and guinea pig aliases share a separate gestation model', () => {
  for(const species of ['Cavy','Guinea Pig','guinea pigs']) {
    const x=schedule.schedule({species},'2026-11-14');
    assert.equal(x.dueDate,'2027-01-21');
    assert.equal(x.dueRange.earliest,'2027-01-12');
    assert.equal(x.dueRange.latest,'2027-01-25');
  }
});
test('invalid or absent breeding dates create no schedule or accidental pregnancy', () => {
  for(const date of ['',null,'2026-02-30','2026-13-01']) {
    const x=schedule.schedule({species:'Rabbit'},date);
    assert.equal(x.estimated,false);
    assert.equal(x.dueDate,'');
    assert.equal(x.pregnancyCheckDate,'');
  }
});
test('user-adjusted reminders do not change base species dates', () => {
  const x=schedule.schedule({species:'Rabbit'},'2026-11-14',{pregnancyCheckDate:'2026-11-29',dueDate:'2026-12-16'});
  assert.equal(x.pregnancyCheckDate,'2026-11-29');
  assert.equal(x.dueDate,'2026-12-16');
  assert.equal(x.dueRange.earliest,'2026-12-14');
});
test('retired, growing, deceased and no-longer-owned animals are not eligible for new routine pairings', () => {
  for(const status of ['Retired','Growing','Deceased','Sold','Spayed']) {
    assert.equal(schedule.pairingEligibility({species:'Rabbit',status}).eligible,false);
  }
  assert.equal(schedule.pairingEligibility({species:'Rabbit',status:'Active'}).eligible,true);
});
test('production shell installs planner before breeding UI and validates pair eligibility', () => {
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const runtime=fs.readFileSync(path.join(__dirname,'../breeding-litter-runtime-v1.8.3.js'),'utf8');
  assert.ok(html.indexOf('breeding-scheduling-v2.0.3.js')<html.indexOf('breeding-litter-runtime-v1.8.3.js'));
  assert.match(runtime,/planner\.schedule\(female, breedingDate\)/);
  assert.match(runtime,/pairingEligibility/);
});

test('recorded cat and cavy reproductive follow-ups use the existing task automation contract',()=>{
 const automation=require('../task-automation-v1.8.3.js');
 const state={animals:[
  {id:'queen',name:'Queen',species:'Cat',status:'Active',felineReproduction:{events:[{id:'mating',kind:'mating',followUpDate:'2026-12-01'}]}},
  {id:'sow',name:'Sow',species:'Cavy',status:'Active',cavyReproduction:{records:[{id:'exposure',type:'exposure',followUpDate:'2026-12-02'}]}}
 ],breedings:[],litters:[],health:[],tasks:[]};
 const first=automation.deriveTaskDefinitions(state).filter(x=>x.sourceType.endsWith('-reproduction'));
 assert.equal(first.length,2);
 assert.equal(new Set(first.map(x=>x.id)).size,2);
 assert.deepEqual(first.map(x=>x.dueDate).sort(),['2026-12-01','2026-12-02']);
 assert.ok(first.every(x=>x.automationFingerprint&&x.automationManaged!==true));
 const delayed=structuredClone(state);
 delayed.animals[0].felineReproduction.events[0].followUpDate='2026-12-04';
 const next=automation.deriveTaskDefinitions(delayed).filter(x=>x.sourceType==='feline-reproduction')[0];
 assert.equal(next.id,first.find(x=>x.sourceType==='feline-reproduction').id);
 assert.notEqual(next.automationFingerprint,first.find(x=>x.sourceType==='feline-reproduction').automationFingerprint);
 const retired=structuredClone(state);
 retired.animals[0].status='Archived';
 assert.equal(automation.deriveTaskDefinitions(retired).filter(x=>x.sourceType==='feline-reproduction').length,0);
});