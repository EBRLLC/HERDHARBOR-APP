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
 assert.match(profile,/detail-cavy-repro/);assert.match(profile,/CavyReproduction203\?\.openForAnimal/);
});
