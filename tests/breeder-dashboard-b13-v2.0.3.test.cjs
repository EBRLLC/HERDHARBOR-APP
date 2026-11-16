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

test('inactive animals and cancelled tasks do not generate future work but preserve historic litter totals',()=>{
 const s=make();
 s.animals.find(a=>a.id==='queen').status='Sold';
 s.animals.find(a=>a.id==='sow').ancestorOnly=true;
 s.animals.find(a=>a.id==='doe').status='Archived';
 s.tasks.push({id:'cancelled',animalId:'doe',title:'Obsolete',dueDate:'2026-12-11',status:'Cancelled'});
 const r=dash.build(s);
 assert.equal(r.calendar.length,0);
 assert.equal(r.birthsBySpecies.Rabbit.litters,1);
 assert.equal(r.birthsBySpecies.Rabbit.bornAlive,4);
});
test('completed and cancelled tasks are excluded, active animals remain actionable',()=>{
 const s=make();
 s.tasks.push({id:'cancelled',title:'Obsolete task',dueDate:'2026-12-03',status:'canceled'});
 s.tasks.push({id:'done',title:'Completed task',dueDate:'2026-12-04',status:'completed'});
 const r=dash.build(s);
 assert.ok(r.calendar.some(x=>x.source==='task'&&x.id==='task:t1'));
 assert.ok(!r.calendar.some(x=>x.id==='task:cancelled'||x.id==='task:done'));
});

test('multi-species offspring growth report uses recorded evidence without inventing weights',()=>{
 const s=make();s.animals.push(
  {id:'kit',species:'Rabbit',sourceBirthId:'l1',growthRecords:[{id:'g1',date:'2026-11-14',grams:100},{id:'g2',date:'2026-11-15',grams:112}]},
  {id:'kitten',species:'Feline',sourceBirthId:'cat-l',kittenCare:[{id:'w1',kind:'weight',date:'2026-11-16',grams:95},{kind:'health',date:'2026-11-17',notes:'OK'}]},
  {id:'cavy-pup',species:'Cavy',sourceBirthId:'cavy-l',cavyCare:[{kind:'weight',date:'2026-11-14',grams:0}]},
  {id:'dog-pup',species:'Dog',sourceBirthId:'dog-l',puppyObservations:[{kind:'weight',date:'2026-11-14',grams:250}]}
 );
 const before=JSON.stringify(s),r=dash.growthReport(s);
 assert.equal(r.animalsWithWeights,3);
 assert.equal(r.measurements,4);
 assert.deepEqual(r.bySpecies.Rabbit,{animals:1,measurements:2});
 assert.equal(r.bySpecies.Cat.measurements,1);
 assert.equal(r.latestByAnimal[0].animalId,'kitten');
 assert.equal(dash.growthReport(s,{species:'Cat'}).measurements,1);
 assert.equal(JSON.stringify(s),before);
});
test('offspring reporting excludes ambiguous IDs and escapes animal references in dashboard',()=>{
 const s=make();s.animals.push(
  {id:'duplicate',species:'Rabbit',sourceBirthId:'l1',growthRecords:[{date:'2026-11-14',grams:80}]},
  {id:'duplicate',species:'Rabbit',sourceBirthId:'l1',growthRecords:[{date:'2026-11-15',grams:81}]},
  {id:'<unsafe>',species:'Rabbit',sourceBirthId:'l1',growthRecords:[{date:'2026-11-15',grams:90}]}
 );
 const r=dash.growthReport(s);
 assert.equal(r.animalsWithWeights,1);
 const esc=x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
 const html=dash.panelHtml(s,esc,x=>x,'2026-11-01');
 assert.ok(html.includes('Recorded litter outcomes'));
 assert.ok(html.includes('Latest offspring weights'));
 assert.ok(html.includes('&lt;unsafe&gt;'));
 assert.ok(!html.includes('<unsafe>'));
});

test('imported species aliases and real overdue statuses appear in dashboard',()=>{
 const state=make();
 state.animals.find(a=>a.id==='queen').species='Feline';
 state.animals.find(a=>a.id==='sow').species='Guinea-pig';
 state.animals.find(a=>a.id==='doe').species='Rabbits';
 const result=dash.build(state,{today:'2027-02-12'});
 assert.ok(result.calendar.some(x=>x.species==='Cat'&&x.status==='overdue'));
 assert.ok(result.calendar.some(x=>x.species==='Cavy'));
 assert.ok(result.calendar.some(x=>x.species==='Rabbit'));
 const html=dash.panelHtml(state,x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;'),x=>x,'2027-02-12');
 assert.ok(html.includes('<th>Status</th>'));
 assert.ok(html.includes('overdue'));
});
