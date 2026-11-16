const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const pup=require('../cavy-offspring-v2.0.3.js');
const initial=()=>({animals:[{id:'sow',species:'Cavy',sex:'Female'}],litters:[{id:'l1',damId:'sow',birthDate:'2026-11-14',bornAlive:2,potentialSireIds:['b1','b2']}],customers:[{id:'customer-1'}]});
test('create canonical cavy pups without false paternity confirmation',()=>{
 const s=initial(),x=pup.generatePups(s,'l1',[{id:'p1',name:'Pup 1',sex:'Unknown'},{id:'p2',name:'Pup 2'}]);
 assert.equal(x.valid,true);assert.equal(x.created.length,2);
 assert.equal(x.created[0].sireId,'');assert.equal(x.created[0].paternityStatus,'unresolved');
 assert.equal(x.state.litters[0].offspringIds.length,2);
 assert.equal(pup.generatePups(x.state,'l1',[{id:'p3',name:'Extra'}]).valid,false);
 assert.equal(s.animals.length,1);
});
test('growth record corrections and housing/separation history stay attached to the right pup',()=>{
 let s=pup.generatePups(initial(),'l1',[{id:'p',name:'Pup'}]).state;
 for(const row of [
  {kind:'weight',date:'2026-11-14',grams:90},
  {kind:'weight',date:'2026-11-15',grams:100},
  {kind:'weight',date:'2026-11-14',grams:92},
  {kind:'separation',date:'2026-12-12',notes:'Separated by sex into recorded housing'}
 ]){const x=pup.observe(s,'p',row);assert.equal(x.valid,true);s=x.state;}
 assert.deepEqual(pup.weightSeries(s.animals[1]).map(x=>x.grams),[92,100]);
 assert.equal(pup.litterOverview(s.litters[0],s.animals).separationRecorded,1);
});
test('reservation and sales cannot bypass recorded customer',()=>{
 const s=pup.generatePups(initial(),'l1',[{id:'p',name:'Pup'}]).state;
 assert.equal(pup.changeStatus(s,'p','Sold').valid,false);
 assert.equal(pup.changeStatus(s,'p','Reserved','missing').valid,false);
 const x=pup.changeStatus(s,'p','Sold','customer-1');
 assert.equal(x.valid,true);assert.equal(x.state.animals[1].buyerId,'customer-1');
});
test('live UI links pup growth and existing litter creation with collection selector',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const runtime=fs.readFileSync(path.join(__dirname,'../breeding-litter-runtime-v1.8.3.js'),'utf8');
 assert.ok(html.indexOf('cavy-offspring-v2.0.3.js')<html.indexOf('breeding-litter-runtime-v1.8.3.js'));
 assert.match(runtime,/CavyOffspring203\.generatePups/);
 assert.match(runtime,/data-cavy-pup-care/);
 assert.match(runtime,/\$\$\('\[data-edit-litter\]'/);
});

test('explicitly attributed cavy boar must be male and match sow owner',()=>{
 const state=initial();state.animals[0].ownerId='farm-a';
 const boar={id:'b1',species:'Cavy',sex:'Female',ownerId:'farm-a'};
 state.animals.push(boar);
 const create=()=>pup.generatePups(state,'l1',[{id:'p',name:'Pup',confirmedSireId:'b1',parentageEvidenceRef:'breeding-log-1'}]);
 assert.equal(create().valid,false,'female boar must fail');
 boar.sex='Male';boar.ownerId='farm-b';
 assert.equal(create().valid,false,'cross-owner boar must fail');
 boar.ownerId='farm-a';
 const result=create();assert.equal(result.valid,true);
 assert.equal(result.created[0].sireId,'b1');
 assert.equal(result.created[0].paternityStatus,'breeder-attributed');
});

test('Cavy offspring reservation rejects cross-owner and ambiguous customer IDs',()=>{
 const s=initial();s.animals[0].ownerId='farm-a';
 s.customers[0].ownerId='farm-b';
 const result=pup.generatePups(s,'l1',[{id:'p',name:'Young animal'}]);
 assert.equal(result.valid,true);
 result.state.animals.find(a=>a.id==='p').ownerId='farm-a';
 const first=pup.changeStatus(result.state,'p','Reserved','customer-1');
 assert.equal(first.valid,false);
 assert.equal(result.state.animals.find(a=>a.id==='p').status,'Growing');
 const owned=result.state.animals.find(a=>a.id==='p');
 owned.ownerId='farm-a';
 result.state.customers[0].ownerId='farm-a';
 assert.equal(pup.changeStatus(result.state,'p','Reserved','customer-1').valid,true);
 result.state.customers.push({...result.state.customers[0]});
 assert.equal(pup.changeStatus(result.state,'p','Reserved','customer-1').valid,false);
});

test('generated offspring inherits recorded maternal owner for account-safe placement',()=>{
 const s=initial();s.animals[0].ownerId='farm-a';
 const x=pup.generatePups(s,'l1',[{id:'pup',name:'Young animal'}]);
 assert.equal(x.valid,true);
 assert.equal(x.created[0].ownerId,'farm-a');
});

test('litter UI exposes cavy and kitten reservations while Sales owns completed transfers',()=>{
 const runtime=fs.readFileSync(path.join(__dirname,'../breeding-litter-runtime-v1.8.3.js'),'utf8');
 assert.match(runtime,/function openCavyPupPlacement\(/);
 assert.match(runtime,/data-cavy-placement=/);
 assert.match(runtime,/cavy\.changeStatus\(stateNow\(\)/);
 assert.match(runtime,/function openKittenPlacement\(/);
 assert.match(runtime,/data-kitten-placement=/);
 assert.match(runtime,/navigate\("sales"\)/);
 assert.match(runtime,/persistMutation\("Cavy pup placement updated\."/);
 assert.match(runtime,/Sold status and ownership transfers must be completed through the existing Sales workflow/);
});

test('litter form offers optional Cat/Cavy sire attribution only with evidence references',()=>{
 const runtime=fs.readFileSync(path.join(__dirname,'../breeding-litter-runtime-v1.8.3.js'),'utf8');
 assert.match(runtime,/name="offspringSire_\$\{index\}"/);
 assert.match(runtime,/name="offspringSireEvidence_\$\{index\}"/);
 assert.match(runtime,/Unverified \/ unknown/);
 assert.match(runtime,/candidateSires|const candidates=/);
 assert.match(runtime,/exposureIds/);
 assert.match(runtime,/Provide evidence for every breeder-attributed cavy sire/);
 assert.match(runtime,/Provide an evidence reference for every breeder-attributed kitten sire/);
 assert.match(runtime,/confirmedSireId:/);
 assert.match(runtime,/formIndexById/);
});

test('Cavy sire attribution requires documented recorded candidate at engine boundary',()=>{
 const state=initial();
 state.animals.push({id:'b1',species:'Cavy',sex:'Male'});
 const item={id:'newborn',name:'Newborn',confirmedSireId:'b1'};
 assert.equal(pup.generatePups(state,'l1',[item]).valid,false,'No evidence reference is not enough');
 const valid=pup.generatePups(state,'l1',[{...item,parentageEvidenceRef:'breeder-log-1'}]);
 assert.equal(valid.valid,true);
 assert.equal(valid.created[0].paternityEvidence.reference,'breeder-log-1');
 state.litters[0].potentialSireIds=[];
 state.litters[0].sireId='';
 assert.equal(pup.generatePups(state,'l1',[{...item,parentageEvidenceRef:'breeder-log-1'}]).valid,false,'Unrecorded parentage cannot be attributed');
});
