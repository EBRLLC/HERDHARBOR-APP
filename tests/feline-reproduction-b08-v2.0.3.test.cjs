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
