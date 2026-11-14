const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const dash=require('../breeder-dashboard-v2.0.3.js');
const make=()=>({animals:[
 {id:'doe',species:'Rabbit'},
 {id:'queen',species:'Cat',felineReproduction:{events:[{id:'m1',kind:'mating',date:'2026-11-14'}]}},
 {id:'sow',species:'Cavy',cavyReproduction:{records:[{id:'e1',type:'exposure',date:'2026-11-14',endDate:'2026-11-20',followUpDate:'2026-12-14'}]}}
],breedings:[{id:'b1',femaleId:'doe',dueDate:'2026-12-15',pregnancyCheckDate:'2026-11-28',status:'Bred'}],
litters:[{id:'l1',damId:'doe',bornAlive:4,stillborn:1,weaned:3}],
tasks:[{id:'t1',title:'Review housing',dueDate:'2026-12-10',completed:false,animalId:'sow'}]});
test('unified calendar preserves separate Rabbit, Cat and Cavy estimates and explicit task',()=>{
 const r=dash.build(make());
 assert.ok(r.calendar.find(e=>e.species==='Rabbit'&&e.label==='Estimated kindling'));
 assert.ok(r.calendar.find(e=>e.species==='Cat'&&e.label==='Estimated queening'));
 assert.ok(r.calendar.find(e=>e.species==='Cavy'&&e.label==='Estimated cavy birth'));
 assert.ok(r.calendar.find(e=>e.source==='task'));
 assert.equal(r.birthsBySpecies.Rabbit.bornAlive,4);
 assert.ok(r.calendar.find(e=>e.species==='Cat').evidence.includes('not-confirmation'));
});
test('filters by species/date without editing canonical state',()=>{
 const state=make(),before=JSON.stringify(state);
 const rows=dash.build(state,{species:'Rabbit',from:'2026-12-01'});
 assert.ok(rows.calendar.every(r=>r.species==='Rabbit'&&r.date>='2026-12-01'));
 assert.equal(JSON.stringify(state),before);
});
test('unknown or duplicate dam references are review flags not invented animals',()=>{
 const s=make();s.animals.push({id:'doe',species:'Dog'});
 const r=dash.build(s);
 assert.ok(r.review.some(x=>x.reason.includes('ambiguous')));
 assert.ok(!r.calendar.some(x=>x.source==='breeding'));
});
test('dashboard HTML escapes breeder-entered source values and is loaded before app runtime',()=>{
 const s=make();s.tasks.push({id:'unsafe',title:'<img onerror=alert(1)>',dueDate:'2026-12-05'});
 const esc=x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
 const html=dash.panelHtml(s,esc,x=>x,'2026-11-14');
 assert.ok(!html.includes('<img onerror'));
 const index=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const runtime=fs.readFileSync(path.join(__dirname,'../herdharbor-app-runtime.js'),'utf8');
 assert.ok(index.indexOf('breeder-dashboard-v2.0.3.js')<index.indexOf('herdharbor-app-runtime.js'));
 assert.match(runtime,/HerdHarborBreederDashboard203\?\.panelHtml/);
});
