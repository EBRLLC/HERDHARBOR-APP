const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const cavy=require('../cavy-reproduction-v2.0.3.js');
const base=()=>({animals:[{id:'sow',species:'Cavy',sex:'Female',ownerId:'user'},{id:'boar',species:'Cavy',sex:'Male',ownerId:'user'},{id:'rabbit',species:'Rabbit',sex:'Male'}]});
test('exposure window is broad, evidence-labeled and not pregnancy confirmation',()=>{
 const x=cavy.windowFromExposure('2026-11-14','2026-11-20');
 assert.equal(x.estimated,true);assert.equal(x.confirmedPregnancy,false);
 assert.equal(x.earliest,'2027-01-12');assert.equal(x.latest,'2027-01-31');
 assert.equal(cavy.windowFromExposure('2026-12-01','2026-11-14').estimated,false);
});
test('sow can record boar exposure without setting pregnancy confirmed',()=>{
 let state=base();
 const x=cavy.addRecord(state,'sow',{type:'exposure',date:'2026-11-14',endDate:'2026-11-20',boarId:'boar',followUpDate:'2026-12-15'},{ownerId:'user'});
 assert.equal(x.valid,true);assert.equal(x.estimate.confirmedPregnancy,false);
 assert.equal(cavy.summary(x.state.animals[0]).pregnancyStatus,'not-assessed');
 assert.equal(cavy.summary(x.state.animals[0]).reminders.length,1);
 assert.equal(state.animals[0].cavyReproduction,undefined);
});
test('rejects cross-species boar, male sow, wrong account and bad dates',()=>{
 const s=base(),event={type:'exposure',date:'2026-11-14',endDate:'2026-11-15',boarId:'rabbit'};
 assert.equal(cavy.addRecord(s,'sow',event,{ownerId:'user'}).valid,false);
 assert.equal(cavy.addRecord(s,'boar',{type:'pregnancy-observation',date:'2026-11-14'},{ownerId:'user'}).valid,false);
 assert.equal(cavy.addRecord(s,'sow',{type:'pregnancy-observation',date:'2026-02-30'},{ownerId:'user'}).valid,false);
 assert.equal(cavy.addRecord(s,'sow',{type:'pregnancy-observation',date:'2026-11-14'},{ownerId:'intruder'}).valid,false);
});
test('installed profile opens dedicated cavy workflow with immutable save',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const profile=fs.readFileSync(path.join(__dirname,'../animal-profile-runtime-v1.8.3.js'),'utf8');
 assert.ok(html.indexOf('cavy-reproduction-v2.0.3.js')<html.indexOf('animal-profile-runtime-v1.8.3.js'));
 assert.match(profile,/detail-cavy-repro/);assert.match(profile,/launchAnimalFeature\(root\.HerdHarborCavyReproduction203, "Cavy breeding"\)/);assert.match(profile,/typeof moduleApi\?\.openForAnimal !== "function"/);
});

test('Cavy exposure follow-ups update canonical tasks and cancel without duplicate reminders',()=>{
 const s={...base(),tasks:[]};
 const entry={type:'exposure',date:'2026-11-14',endDate:'2026-11-15',boarId:'boar',followUpDate:'2026-11-22'};
 const first=cavy.addRecord(s,'sow',entry,{ownerId:'user'});
 assert.equal(first.valid,true);
 assert.equal(first.state.tasks.length,1);
 assert.equal(first.state.tasks[0].sourceType,'cavy-reproduction');
 const retry=cavy.addRecord(first.state,'sow',entry,{ownerId:'user'});
 assert.equal(retry.state.tasks.length,1);
 const moved=cavy.addRecord(retry.state,'sow',{...entry,followUpDate:'2026-11-25'},{ownerId:'user'});
 assert.equal(moved.state.tasks[0].dueDate,'2026-11-25');
 const canceled=cavy.addRecord(moved.state,'sow',{...entry,followUpDate:''},{ownerId:'user'});
 assert.equal(canceled.state.tasks[0].completed,true);
 assert.equal(canceled.state.tasks[0].status,'Cancelled');
 assert.equal(cavy.addRecord(s,'sow',{...entry,followUpDate:'2026-02-30'},{ownerId:'user'}).valid,false);
});

test('Cavy canceled follow-up can be reinstated without duplicate tasks',()=>{
 const entry={type:'follow-up',date:'2026-11-14',followUpDate:'2026-11-20'};
 let s=cavy.addRecord({...base(),tasks:[]},'sow',entry,{ownerId:'user'}).state;
 s=cavy.addRecord(s,'sow',{...entry,followUpDate:''},{ownerId:'user'}).state;
 assert.equal(s.tasks[0].completed,true);
 s=cavy.addRecord(s,'sow',{...entry,followUpDate:'2026-11-24'},{ownerId:'user'}).state;
 assert.equal(s.tasks.length,1);
 assert.equal(s.tasks[0].completed,false);
 assert.equal(s.tasks[0].dueDate,'2026-11-24');
});
