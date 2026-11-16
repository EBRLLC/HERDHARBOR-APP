const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const repro=require('../feline-reproduction-v2.0.3.js');
const state=()=>({animals:[{id:'queen',species:'Cat',sex:'Female',ownerId:'owner'},{id:'tom',species:'Cat',sex:'Male',ownerId:'owner'}],litters:[]});
test('mating is an estimate and does not imply confirmed pregnancy',()=>{
 const before=state(),x=repro.appendEvent(before,'queen',{kind:'mating',date:'2026-11-14',sireId:'tom'},{accountId:'owner'});
 assert.equal(x.valid,true);assert.equal(x.estimatedWindow.pregnancyConfirmed,false);
 assert.equal(x.estimatedWindow.centralDueDate,'2027-01-18');
 assert.equal(x.estimatedWindow.earliestDueDate,'2027-01-16');
 assert.equal(before.animals[0].felineReproduction,undefined);
});
test('multiple potential sires remain unresolved until documented',()=>{
 let s=state();
 s=repro.appendEvent(s,'queen',{kind:'mating',date:'2026-11-14',sireId:'tom'},{accountId:'owner'}).state;
 s=repro.appendEvent(s,'queen',{kind:'mating',date:'2026-11-15',externalSireName:'External stud'},{accountId:'owner'}).state;
 const review=repro.review(s.animals[0]);
 assert.equal(review.potentialSires.length,2);
 assert.equal(review.requiresSireReview,true);
 assert.equal(review.pregnancyStatus,'not-assessed');
});
test('pregnancy assessment is recorded evidence not inferred from dates',()=>{
 let s=state();
 let x=repro.appendEvent(s,'queen',{kind:'pregnancy-assessment',date:'2026-12-10',result:'inconclusive',evidenceRef:'vet-1'},{accountId:'owner'});
 assert.equal(x.valid,true);assert.equal(repro.review(x.state.animals[0]).pregnancyStatus,'inconclusive');
});
test('species, sex, account and impossible date cannot be bypassed',()=>{
 const s=state();
 assert.equal(repro.appendEvent(s,'tom',{kind:'heat',date:'2026-11-14'},{accountId:'owner'}).valid,false);
 assert.equal(repro.appendEvent(s,'queen',{kind:'heat',date:'2026-11-14'},{accountId:'other'}).valid,false);
 assert.equal(repro.appendEvent(s,'queen',{kind:'heat',date:'2026-02-30'},{accountId:'owner'}).valid,false);
});
test('installed shell links queen profile to account-safe feline workspace',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const profile=fs.readFileSync(path.join(__dirname,'../animal-profile-runtime-v1.8.3.js'),'utf8');
 assert.ok(html.indexOf('feline-reproduction-v2.0.3.js')<html.indexOf('animal-profile-runtime-v1.8.3.js'));
 assert.match(profile,/detail-feline-repro/);
 assert.match(profile,/FelineReproduction203\?\.openForAnimal/);
});

test('a breeder-entered feline follow-up date persists as evidence and can be rescheduled',()=>{
 const state={animals:[{id:'queen',species:'Cat',sex:'Female'}],litters:[],breedings:[],tasks:[]};
 const entered=repro.appendEvent(state,'queen',{kind:'heat',date:'2026-11-14',followUpDate:'2026-11-21'},{accountId:''});
 assert.equal(entered.valid,true);
 assert.equal(entered.event.followUpDate,'2026-11-21');
 const tasks=require('../task-automation-v1.8.3.js').deriveTaskDefinitions(entered.state);
 assert.equal(tasks.filter(x=>x.sourceType==='feline-reproduction').length,1);
 assert.equal(tasks.find(x=>x.sourceType==='feline-reproduction').dueDate,'2026-11-21');
 const revised=repro.appendEvent(entered.state,'queen',{...entered.event,followUpDate:'2026-11-22'},{accountId:''});
 assert.equal(revised.valid,true);
 assert.equal(revised.state.animals[0].felineReproduction.events.length,1);
 assert.equal(repro.appendEvent(state,'queen',{kind:'heat',date:'2026-11-14',followUpDate:'2026-11-31'},{accountId:''}).valid,false);
});
test('Cat breeder follow-ups create, reschedule and cancel canonical tasks without duplication',()=>{
 const first=repro.appendEvent({...state(),tasks:[]},'queen',
  {kind:'heat',date:'2026-11-14',followUpDate:'2026-11-20'}, {accountId:'owner'});
 assert.equal(first.valid,true);
 assert.equal(first.state.tasks.length,1);
 assert.equal(first.state.tasks[0].sourceType,'feline-reproduction');
 assert.equal(first.state.tasks[0].dueDate,'2026-11-20');
 const repeat=repro.appendEvent(first.state,'queen',
  {kind:'heat',date:'2026-11-14',followUpDate:'2026-11-20'}, {accountId:'owner'});
 assert.equal(repeat.state.tasks.length,1);
 const changed=repro.appendEvent(repeat.state,'queen',
  {kind:'heat',date:'2026-11-14',followUpDate:'2026-11-23'}, {accountId:'owner'});
 assert.equal(changed.state.tasks[0].dueDate,'2026-11-23');
 const removed=repro.appendEvent(changed.state,'queen',
  {kind:'heat',date:'2026-11-14',followUpDate:''}, {accountId:'owner'});
 assert.equal(removed.state.tasks[0].completed,true);
 assert.equal(removed.state.tasks[0].status,'Cancelled');
 assert.equal(state().animals[0].felineReproduction,undefined);
});

test('Cat canceled follow-up can be reinstated without creating a new task',()=>{
 const entry={kind:'heat',date:'2026-11-14',followUpDate:'2026-11-20'};
 let s=repro.appendEvent({...state(),tasks:[]},'queen',entry,{accountId:'owner'}).state;
 s=repro.appendEvent(s,'queen',{...entry,followUpDate:''},{accountId:'owner'}).state;
 assert.equal(s.tasks[0].completed,true);
 s=repro.appendEvent(s,'queen',{...entry,followUpDate:'2026-11-24'},{accountId:'owner'}).state;
 assert.equal(s.tasks.length,1);
 assert.equal(s.tasks[0].completed,false);
 assert.equal(s.tasks[0].dueDate,'2026-11-24');
});
