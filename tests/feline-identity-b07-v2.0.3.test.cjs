const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const cat=require('../feline-identity-v2.0.3.js');
test('cat identity validates unverified registry and never uses another species',()=>{
 const x=cat.validate({registeredName:'Queen',registry:'TICA',registrationNumber:'123',coatColor:'Blue',pattern:'Solid'});
 assert.equal(x.valid,true);assert.equal(x.value.verification,'breeder-entered-unverified');
 assert.equal(cat.validate({registry:'TICA'}).valid,false);
 assert.equal(cat.isCat({species:'Dog'}),false);
});
test('feline pedigree preserves uncertain external ancestors and cycle or duplicate warnings',()=>{
 const a={id:'kit',species:'Cat',sireId:'s',damId:'external'},s={id:'s',species:'Cat',sireId:'kit'};
 const rows=cat.pedigree(a,[a,s]).rows;
 assert.ok(rows.some(x=>x.status==='external-unresolved'));
 assert.ok(rows.some(x=>x.status==='cycle-review'));
 const dup=cat.pedigree(a,[a,{id:'s',species:'Cat'},{id:'s',species:'Cat'}]).rows;
 assert.ok(dup.some(x=>x.status==='duplicate-id-review'));
});
test('cat editor is isolated and wired before animal-profile runtime',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const profile=fs.readFileSync(path.join(__dirname,'../animal-profile-runtime-v1.8.3.js'),'utf8');
 assert.ok(html.indexOf('feline-identity-v2.0.3.js')<html.indexOf('animal-profile-runtime-v1.8.3.js'));
 assert.match(profile,/FelineIdentity203\.readEditor/);
 assert.match(profile,/delete nextAnimal\.feline/);
});
