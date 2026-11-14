const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const kittens=require('../feline-kittens-v2.0.3.js');
const base=()=>({animals:[{id:'queen',species:'Cat',sex:'Female'}],litters:[{id:'l1',damId:'queen',sireId:'',birthDate:'2026-11-14',bornAlive:2,potentialSireIds:['tom1','tom2']}],customers:[{id:'buyer'}]});
test('create two stable birth-linked kittens preserving multiple potential sires',()=>{
 const state=base(),x=kittens.createKittens(state,'l1',[{id:'kit-1',name:'Kit 1',sex:'Unknown'},{id:'kit-2',name:'Kit 2',sex:'Female'}]);
 assert.equal(x.valid,true);assert.equal(x.created.length,2);
 assert.equal(x.state.animals[1].sireId,'');
 assert.equal(x.state.animals[1].paternityStatus,'unresolved-multiple-sires');
 assert.equal(state.animals.length,1);
 assert.equal(x.state.litters[0].offspringIds.length,2);
 assert.equal(kittens.createKittens(x.state,'l1',[{id:'kit-3',name:'Kit 3'}]).valid,false);
});
test('kitten weight and health observations remain individual and idempotent',()=>{
 let s=kittens.createKittens(base(),'l1',[{id:'k1',name:'Kitten'}]).state;
 let x=kittens.addObservation(s,'k1',{kind:'weight',date:'2026-11-14',grams:95});
 assert.equal(x.valid,true);s=x.state;
 x=kittens.addObservation(s,'k1',{kind:'weight',date:'2026-11-14',grams:98});
 assert.equal(x.valid,true);assert.equal(x.state.animals[1].kittenCare.length,1);
 assert.equal(x.state.animals[1].kittenCare[0].grams,98);
 assert.equal(kittens.addObservation(x.state,'k1',{kind:'weight',date:'2026-11-14',grams:-5}).valid,false);
});
test('reserved or sold kittens require recorded customer, otherwise no mutation',()=>{
 const s=kittens.createKittens(base(),'l1',[{id:'kit',name:'Cat'}]).state;
 assert.equal(kittens.catteryStatus(s,'kit','Sold').valid,false);
 const x=kittens.catteryStatus(s,'kit','Reserved','buyer');
 assert.equal(x.valid,true);assert.equal(x.state.animals[1].buyerId,'buyer');
 assert.equal(s.animals[1].status,'Growing');
});
test('installed generic litter UI uses feline generation and captures care transactions',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const runtime=fs.readFileSync(path.join(__dirname,'../breeding-litter-runtime-v1.8.3.js'),'utf8');
 assert.ok(html.indexOf('feline-kittens-v2.0.3.js')<html.indexOf('breeding-litter-runtime-v1.8.3.js'));
 assert.match(runtime,/FelineKittens203\.createKittens/);
 assert.match(runtime,/data-kitten-care/);
 assert.match(runtime,/feline\.addObservation/);
 assert.match(runtime,/\$\$\('\[data-rabbit-kit-growth\]'/);
});
