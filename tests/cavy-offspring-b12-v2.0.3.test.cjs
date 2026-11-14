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
