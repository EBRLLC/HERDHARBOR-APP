const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const cavy=require('../cavy-identity-v2.0.3.js');
test('cavy and guinea pig are same dedicated species distinct from Rabbit',()=>{
 for(const name of ['Cavy','Guinea Pig','guinea pigs'])assert.equal(cavy.isCavy(name),true);
 assert.equal(cavy.isCavy('Rabbit'),false);
 const verified=cavy.validate({registeredName:'Sow',variety:'American',coatPattern:'Broken',registry:'Breeder',registrationNumber:'ABC'});
 assert.equal(verified.valid,true);assert.equal(verified.value.verification,'breeder-entered-unverified');
});
test('registry identity must be complete and cannot claim independent verification',()=>{
 assert.equal(cavy.validate({registry:'ACBA'}).valid,false);
 assert.equal(cavy.normalize({verification:'verified'}).verification,'breeder-entered-unverified');
});
test('cavy pedigree retains external ancestor, cycle and cross-species review',()=>{
 const sow={id:'sow',species:'Cavy',sireId:'boar',damId:'external'},boar={id:'boar',species:'Cavy',sireId:'sow'};
 const rows=cavy.pedigree(sow,[sow,boar]).ancestors;
 assert.ok(rows.some(x=>x.status==='external-ancestor'));
 assert.ok(rows.some(x=>x.status==='ancestry-cycle'));
 const wrong=cavy.pedigree(sow,[sow,{id:'boar',species:'Rabbit'}]).ancestors;
 assert.ok(wrong.some(x=>x.status==='cross-species-reference'));
});
test('animal form supports cats and cavies even on older account custom species lists',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const profile=fs.readFileSync(path.join(__dirname,'../animal-profile-runtime-v1.8.3.js'),'utf8');
 assert.ok(html.indexOf('cavy-identity-v2.0.3.js')<html.indexOf('animal-profile-runtime-v1.8.3.js'));
 assert.match(profile,/CavyIdentity203\.readEditor/);
 assert.match(profile,/\[\.\.\.new Set\(\[\.\.\.\(state\.settings\?\.species \|\| \[\]\), "Cat", "Cavy"\]\)\]/);
});

test('Cavy animal editor exposes show and veterinary evidence with record validation',()=>{
 const item={showResults:[{event:'County show',date:'2026-11-15',placement:'First',reference:'photo-1'}],
 veterinaryEvidence:[{name:'Health exam',date:'2026-11-15',reference:'vet-1',result:'normal'}]};
 const outcome=cavy.validate(item);
 assert.equal(outcome.valid,true);
 assert.equal(outcome.value.showResults[0].status,'breeder-entered-unverified');
 assert.equal(outcome.value.veterinaryEvidence[0].result,'normal');
 assert.equal(cavy.validate({showResults:[{...item.showResults[0],date:'2026-02-30'}]}).valid,false);
 assert.equal(cavy.validate({veterinaryEvidence:[{...item.veterinaryEvidence[0],reference:''}]}).valid,false);
 const html=cavy.editorHtml({species:'Cavy',cavy:item});
 assert.match(html,/data-cavy-add="show"/);
 assert.match(html,/data-cavy-add="vet"/);
 assert.match(html,/photo-1/);
 const source=fs.readFileSync(path.join(__dirname,'../cavy-identity-v2.0.3.js'),'utf8');
 assert.match(source,/x\.showResults=collect\("show"\)/);
 assert.match(source,/x\.veterinaryEvidence=collect\("vet"\)/);
});
