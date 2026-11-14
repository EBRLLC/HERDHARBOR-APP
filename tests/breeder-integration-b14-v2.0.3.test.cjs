const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.join(__dirname,'..');
const rabbitBreeder=require('../rabbit-breeder-v2.0.3.js');
const integrity=require('../breeding-integrity-v2.0.3.js');
const scheduling=require('../breeding-scheduling-v2.0.3.js');
const identity=require('../canine-identity-audit-v2.0.3.js');
const feline=require('../feline-identity-v2.0.3.js');
const felineRepro=require('../feline-reproduction-v2.0.3.js');
const kittens=require('../feline-kittens-v2.0.3.js');
const cavy=require('../cavy-identity-v2.0.3.js');
const cavyRepro=require('../cavy-reproduction-v2.0.3.js');
const pups=require('../cavy-offspring-v2.0.3.js');
const dashboard=require('../breeder-dashboard-v2.0.3.js');
const canineCare=require('../canine-care-v2.0.3.js');

test('stacked modules load without crashing under CommonJS',()=>{
 for(const mod of [rabbitBreeder,integrity,scheduling,identity,feline,felineRepro,kittens,cavy,cavyRepro,pups,dashboard,canineCare]){
  assert.equal(mod.VERSION,'2.0.3');
 }
});

test('rabbit, dog, cat and cavy have distinct guarded reproductive contracts',()=>{
 assert.equal(rabbitBreeder.isRabbit({species:'Cat'}),false);
 assert.equal(feline.isCat('Cavy'),false);
 assert.equal(cavy.isCavy('Rabbit'),false);
 assert.equal(scheduling.schedule({species:'Rabbit'},'2026-11-14').rule.birthLabel,'kindling');
 assert.equal(scheduling.schedule({species:'Dog'},'2026-11-14').rule.birthLabel,'whelping');
 assert.equal(scheduling.schedule({species:'Cat'},'2026-11-14').rule.birthLabel,'queening');
 assert.equal(scheduling.schedule({species:'Cavy'},'2026-11-14').rule.birthLabel,'farrowing');
});

test('canonical identity and parentage guard rejects cross-species breeding contamination',()=>{
 const state={animals:[
  {id:'rabbitSire',species:'Rabbit',sex:'Male'},
  {id:'catQueen',species:'Cat',sex:'Female'},
  {id:'cavySow',species:'Cavy',sex:'Female'}
 ],breedings:[],litters:[]};
 const next=structuredClone(state);
 next.breedings.push({id:'bad',maleId:'rabbitSire',femaleId:'catQueen'});
 const result=integrity.validateMutation(state,next);
 assert.equal(result.ok,false);
 assert.ok(result.errors.some(e=>e.code==='cross-species-breeding'));
 assert.deepEqual(state.breedings,[]);
});

test('cat reproductive history and kitten generation survive JSON cloud-shaped round trip',()=>{
 let state={animals:[
  {id:'queen',species:'Cat',sex:'Female'},
  {id:'tom',species:'Cat',sex:'Male'}
 ],litters:[],breedings:[],customers:[]};
 let event=felineRepro.appendEvent(state,'queen',{kind:'mating',date:'2026-11-14',sireId:'tom'},{accountId:''});
 assert.equal(event.valid,true);
 state=event.state;
 state.litters.push({id:'cat-litter',damId:'queen',sireId:'tom',birthDate:'2027-01-18',bornAlive:2});
 let born=kittens.createKittens(state,'cat-litter',[{id:'cat-kit-1',name:'First kitten'},{id:'cat-kit-2',name:'Second kitten'}]);
 assert.equal(born.valid,true);state=born.state;
 state=kittens.addObservation(state,'cat-kit-1',{kind:'weight',date:'2027-01-19',grams:105}).state;
 const recovered=JSON.parse(JSON.stringify(state));
 assert.equal(recovered.animals.find(x=>x.id==='queen').felineReproduction.events.length,1);
 assert.equal(recovered.animals.find(x=>x.id==='cat-kit-1').kittenCare[0].grams,105);
 assert.equal(recovered.litters.find(x=>x.id==='cat-litter').offspringIds.length,2);
 assert.equal(recovered.animals.find(x=>x.id==='cat-kit-2').damId,'queen');
 assert.equal(dashboard.build(recovered).birthsBySpecies.Cat.litters,1);
});

test('cavy exposure and litter birth-linked pups survive JSON local-cloud roundtrip',()=>{
 let state={animals:[
  {id:'sow',species:'Cavy',sex:'Female'},
  {id:'boar',species:'Cavy',sex:'Male'}
 ],litters:[],breedings:[],customers:[]};
 const exposure=cavyRepro.addRecord(state,'sow',{type:'exposure',date:'2026-11-14',endDate:'2026-11-20',boarId:'boar'},{ownerId:''});
 assert.equal(exposure.valid,true);state=exposure.state;
 state.litters.push({id:'cavy-litter',damId:'sow',sireId:'boar',birthDate:'2027-01-21',bornAlive:2});
 const generated=pups.generatePups(state,'cavy-litter',[{id:'pup1',name:'Pup One'},{id:'pup2',name:'Pup Two'}]);
 assert.equal(generated.valid,true);state=generated.state;
 const after=pups.observe(state,'pup1',{kind:'weight',date:'2027-01-21',grams:90});
 assert.equal(after.valid,true);state=JSON.parse(JSON.stringify(after.state));
 assert.equal(pups.weightSeries(state.animals.find(x=>x.id==='pup1'))[0].grams,90);
 assert.equal(state.animals.find(x=>x.id==='sow').cavyReproduction.records[0].type,'exposure');
 assert.equal(dashboard.build(state).birthsBySpecies.Cavy.litters,1);
});

test('an unavailable/unknown sire is never silently invented for a kitten or cavy pup',()=>{
 const catState={animals:[{id:'queen',species:'Cat',sex:'Female'}],litters:[
  {id:'cat-l',damId:'queen',birthDate:'2026-11-14',bornAlive:1,potentialSireIds:['tom1','tom2']}
 ]};
 const catResult=kittens.createKittens(catState,'cat-l',[{id:'kit',name:'Kitten'}]);
 assert.equal(catResult.valid,true);assert.equal(catResult.created[0].sireId,'');
 assert.equal(catResult.created[0].paternityStatus,'unresolved-multiple-sires');
 const cavyState={animals:[{id:'sow',species:'Cavy',sex:'Female'}],litters:[
  {id:'cavy-l',damId:'sow',birthDate:'2026-11-14',bornAlive:1,potentialSireIds:['boar1','boar2']}
 ]};
 const cavyResult=pups.generatePups(cavyState,'cavy-l',[{id:'pup',name:'Pup'}]);
 assert.equal(cavyResult.valid,true);assert.equal(cavyResult.created[0].sireId,'');
 assert.equal(cavyResult.created[0].paternityStatus,'unresolved');
});

test('canine puppy observation changes cannot modify rabbit genetics or another animal',()=>{
 const state={animals:[
  {id:'dog-pup',species:'Dog',ownerId:'account-1',sourceBirthId:'dog-l'},
  {id:'rabbit',species:'Rabbit',genetics:{evidence:[{locus:'B',source:'manual-confirmed'}]}}
 ]};
 const snapshot=JSON.stringify(state);
 const changed=canineCare.addPuppyObservation(state,'dog-pup',
  {kind:'weight',date:'2026-11-14',grams:230},{ownerId:'account-1'});
 assert.equal(changed.valid,true);
 assert.equal(JSON.stringify(state),snapshot);
 assert.deepEqual(changed.state.animals[1].genetics,state.animals[1].genetics);
 assert.equal(canineCare.addPuppyObservation(state,'dog-pup',
  {kind:'weight',date:'2026-11-14',grams:230},{ownerId:'wrong'}).valid,false);
});

test('all 14 stage regression tests exist and key browser runtime dependencies are ordered',()=>{
 const names=[
 'rabbit-inheritance-b01-v2.0.3.test.cjs',
 'breeding-integrity-b02-v2.0.3.test.cjs',
 'breeding-scheduling-b03-v2.0.3.test.cjs',
 'rabbit-breeder-b04-v2.0.3.test.cjs',
 'canine-care-b05-v2.0.3.test.cjs',
 'canine-identity-b06-v2.0.3.test.cjs',
 'feline-identity-b07-v2.0.3.test.cjs',
 'feline-reproduction-b08-v2.0.3.test.cjs',
 'feline-kittens-b09-v2.0.3.test.cjs',
 'cavy-identity-b10-v2.0.3.test.cjs',
 'cavy-reproduction-b11-v2.0.3.test.cjs',
 'cavy-offspring-b12-v2.0.3.test.cjs',
 'breeder-dashboard-b13-v2.0.3.test.cjs',
 'breeder-integration-b14-v2.0.3.test.cjs'
 ];
 for(const name of names) assert.equal(fs.existsSync(path.join(__dirname,name)),true,name);
 const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
 for(const [a,b] of [
  ['rabbit-genetics-runtime-v1.6.1.js','rabbit-genetics-inheritance-v2.0.3.js'],
  ['breeding-scheduling-v2.0.3.js','breeding-litter-runtime-v1.8.3.js'],
  ['breeding-integrity-v2.0.3.js','breeding-litter-runtime-v1.8.3.js'],
  ['feline-identity-v2.0.3.js','animal-profile-runtime-v1.8.3.js'],
  ['cavy-reproduction-v2.0.3.js','animal-profile-runtime-v1.8.3.js'],
  ['breeder-dashboard-v2.0.3.js','herdharbor-app-runtime.js']
 ]){
  assert.ok(html.indexOf(a)>=0&&html.indexOf(b)>html.indexOf(a),a+' should load before '+b);
 }
});

test('collection selector event bindings operate on lists rather than single DOM elements',()=>{
 const runtime=fs.readFileSync(path.join(base,'breeding-litter-runtime-v1.8.3.js'),'utf8');
 for(const selector of ['data-rabbit-kit-growth','data-kitten-care','data-cavy-pup-care','data-edit-litter']){
  assert.match(runtime,new RegExp('\\$\\$\\(\\x27\\['+selector+'\\]\\x27'));
  assert.doesNotMatch(runtime,new RegExp('(?<!\\$)\\$\\(\\x27\\['+selector+'\\]\\x27\\)\\.forEach'));
 }
});

test('no 2.0.3 module silently asserts pregnancy from a scheduling estimate',()=>{
 const s=scheduling.schedule({species:'Cat'},'2026-11-14');
 assert.equal(s.pregnancyConfirmed,false);
 assert.equal(felineRepro.calculateMatingWindow('2026-11-14').pregnancyConfirmed,false);
 assert.equal(cavyRepro.windowFromExposure('2026-11-14','2026-11-20').confirmedPregnancy,false);
});


test('actual normalized-cloud mapper preserves species evidence and relationship metadata across read-back',()=>{
 const normalizer=require('../cloud-state-normalizer-v1.8.3.js');
 const state={animals:[
  {id:'rabbit',species:'Rabbit',genetics:{evidence:[{source:'family-inferred',locus:'B',status:'strongly-inferred'}]}},
  {id:'dog',species:'Dog',canine:{healthEvidence:[{id:'dna',type:'dna-test',reference:'doc-01',status:'breeder-entered-unverified'}]},puppyObservations:[{id:'weight',kind:'weight',grams:200}]},
  {id:'queen',species:'Cat',feline:{registeredName:'Cat Registered'},felineReproduction:{events:[{id:'m1',kind:'mating',sireId:''}]}},
  {id:'kit',species:'Cat',sourceBirthId:'cat-l',damId:'queen',potentialSireIds:['t1','t2'],paternityStatus:'unresolved-multiple-sires',kittenCare:[{id:'w1',kind:'weight',grams:120}]},
  {id:'sow',species:'Cavy',cavy:{coatType:'Abyssinian'},cavyReproduction:{records:[{id:'e1',type:'exposure',date:'2026-11-14'}]}},
  {id:'pup',species:'Cavy',sourceBirthId:'cavy-l',damId:'sow',cavyCare:[{id:'s1',kind:'separation',notes:'documented'}]}
 ],breedings:[],litters:[
  {id:'cat-l',damId:'queen',offspringIds:['kit']},
  {id:'cavy-l',damId:'sow',offspringIds:['pup']}
 ],settings:{species:['Rabbit','Dog','Cat','Cavy']}};
 const mapped=normalizer.mapLegacySnapshot(state);
 const rows=mapped.records.map(record=>({
  namespace:record.namespace,record_id:record.record_id,payload:record.payload,
  payload_checksum:record.payload_checksum,record_version:1,deleted_at:null
 }));
 assert.deepEqual(normalizer.reassembleLegacySnapshot(rows),state);
 const after=structuredClone(state);
 after.animals.find(x=>x.id==='kit').kittenCare.push({id:'w2',kind:'weight',grams:130});
 const update=normalizer.mapLegacySnapshot(after);
 const updateRows=update.records.map(record=>({
  namespace:record.namespace,record_id:record.record_id,payload:record.payload,
  payload_checksum:record.payload_checksum,record_version:1,deleted_at:null
 }));
 assert.deepEqual(normalizer.reassembleLegacySnapshot(updateRows),after);
 assert.notEqual(mapped.checksum,update.checksum);
});


test('recorded queen matings within birthing window prevent false single-sire assignment',()=>{
 const state={animals:[{id:'queen',species:'Cat',sex:'Female',felineReproduction:{events:[
  {id:'e1',kind:'mating',date:'2026-11-14',sireId:'tomA'},
  {id:'e2',kind:'mating',date:'2026-11-15',sireId:'tomB'},
  {id:'old',kind:'mating',date:'2025-01-01',sireId:'historical'}
 ]}}],litters:[{id:'l',damId:'queen',sireId:'tomA',birthDate:'2027-01-18',bornAlive:1}]};
 const result=kittens.createKittens(state,'l',[{id:'k',name:'Kitten'}]);
 assert.equal(result.valid,true);
 assert.equal(result.created[0].sireId,'');
 assert.equal(result.created[0].paternityStatus,'unresolved-multiple-sires');
 assert.deepEqual(result.created[0].potentialSireIds.slice().sort(),['tomA','tomB']);
 assert.equal(state.animals.length,1);
});

test('sow exposure history in birth window retains multiple possible boars and excludes stale exposures',()=>{
 const state={animals:[{id:'sow',species:'Cavy',sex:'Female',cavyReproduction:{records:[
  {id:'ex1',type:'exposure',date:'2026-11-14',endDate:'2026-11-15',boarId:'boarA'},
  {id:'ex2',type:'exposure',date:'2026-11-16',endDate:'2026-11-18',boarId:'boarB'},
  {id:'old',type:'exposure',date:'2024-01-01',endDate:'2024-01-02',boarId:'historic'}
 ]}}],litters:[{id:'l',damId:'sow',sireId:'boarA',birthDate:'2027-01-21',bornAlive:1}]};
 const result=pups.generatePups(state,'l',[{id:'p',name:'Pup'}]);
 assert.equal(result.valid,true);
 assert.equal(result.created[0].sireId,'');
 assert.equal(result.created[0].paternityStatus,'unresolved');
 assert.deepEqual(result.created[0].potentialSireIds.slice().sort(),['boarA','boarB']);
 assert.equal(state.animals.length,1);
});
