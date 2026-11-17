const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const care=require('../canine-care-v2.0.3.js');
const state=()=>({animals:[{id:'dam',species:'Dog',sex:'Female',ownerId:'owner'},{id:'puppy',species:'Dog',sourceBirthId:'whelping',ownerId:'owner'}],canineWhelpings:[]});
test('puppy weight can be corrected by date without duplicate observations',()=>{
  let first=care.addPuppyObservation(state(),'puppy',{kind:'weight',date:'2026-11-14',grams:125},{ownerId:'owner'});
  assert.equal(first.valid,true);
  let next=care.addPuppyObservation(first.state,'puppy',{kind:'weight',date:'2026-11-14',grams:135},{ownerId:'owner'});
  assert.equal(next.valid,true);
  assert.equal(next.state.animals[1].puppyObservations.length,1);
  assert.equal(care.puppySummary(next.state.animals[1]).lastWeight.grams,135);
});
test('rejects cross-account mutations and non-canine records',()=>{
  const s=state();
  assert.equal(care.addPuppyObservation(s,'puppy',{kind:'weight',date:'2026-11-14',grams:100},{ownerId:'someone-else'}).valid,false);
  s.animals[1].species='Rabbit';
  assert.equal(care.addPuppyObservation(s,'puppy',{kind:'weight',date:'2026-11-14',grams:100},{ownerId:'owner'}).valid,false);
});
test('health notes and veterinary tests require evidence, not inferred diagnoses',()=>{
  const s=state();
  const bad=care.addPuppyObservation(s,'puppy',{kind:'veterinary-test',date:'2026-11-14',notes:'normal'},{ownerId:'owner'});
  assert.equal(bad.valid,false);
  const good=care.addPuppyObservation(s,'puppy',{kind:'veterinary-test',date:'2026-11-14',testName:'Screen',evidenceRef:'vet-file-1',notes:'Reported result'},{ownerId:'owner'});
  assert.equal(good.valid,true);
  assert.equal(good.state.animals[1].puppyObservations[0].source,'breeder-recorded');
});
test('original input remains immutable when mutation is rejected or accepted',()=>{
  const s=state();
  const after=care.addPuppyObservation(s,'puppy',{kind:'development',date:'2026-11-14',notes:'Eyes opened'},{ownerId:'owner'});
  assert.equal(after.valid,true);
  assert.equal(s.animals[1].puppyObservations,undefined);
});
test('installed whelping UI loads extension before the form and commits via canonical app save',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const ui=fs.readFileSync(path.join(__dirname,'../canine-whelping-workspace-v2.0.1.js'),'utf8');
  assert.ok(html.indexOf('canine-care-v2.0.3.js')<html.indexOf('canine-whelping-workspace-v2.0.1.js'));
  assert.match(ui,/data-form="puppy-care"/);
  assert.match(ui,/care\.addPuppyObservation/);
  assert.match(ui,/HerdHarborApp\?\.commitState/);
});
