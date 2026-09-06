const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Phase1=require('../workflow-phase1-v1.7.1.js');

function fixture(){
  return {
    animals:[
      {id:'cow1',name:'Maple',species:'Cattle',sex:'Female',status:'Breeding',dob:'2024-01-01',sireId:'bull1'},
      {id:'bull1',name:'Oak',species:'Cattle',sex:'Male',status:'Active'},
      {id:'rabbit1',name:'Penny',species:'Rabbit',sex:'Female',status:'Sold'},
      {id:'goat1',name:'Daisy',species:'Goat',sex:'Female',status:'Active'}
    ],
    health:[{id:'h1',animalId:'cow1',type:'Weight',date:'2026-09-01',weight:950,weightUnit:'lb',followUpDate:'2026-09-05'}],
    healthIntelligence:{episodes:[{id:'e1',animalId:'cow1',startedDate:'2026-09-04',concern:'Cough',recheckDate:'2026-09-05',quarantined:true,resolved:false}],careRecords:[{id:'c1',animalId:'goat1',date:'2026-09-01',type:'Vaccination',product:'Example',boosterDueDate:'2026-09-08'}],groupRecords:[{id:'g1',species:'Rabbit',followUpDate:'2026-09-06',description:'historical rabbit group'}]},
    breedings:[{id:'b1',femaleId:'cow1',maleId:'bull1',breedingDate:'2026-08-01',dueDate:'2027-05-10',status:'Bred'}],
    litters:[],
    tasks:[
      {id:'t1',title:'Pregnancy check: Maple',category:'Breeding',dueDate:'2026-09-04',animalId:'cow1',completed:false},
      {id:'t2',title:'Old rabbit task',dueDate:'2026-09-05',animalId:'rabbit1',completed:false}
    ],
    shows:[{id:'s1',name:'County Fair',startDate:'2026-09-09'}],
    showEntries:[{id:'se1',showId:'s1',animalId:'cow1',className:'Heifer'}],
    showResults:[],showAwards:[],productionRecords:[{id:'p1',animalId:'cow1',date:'2026-09-02',product:'Milk',amount:2,unit:'gal'}],sales:[],transfers:[]
  };
}

test('Phase 1 is a hardlocked animal-first orchestration contract',()=>{
  assert.equal(Phase1.VERSION,'1.7.1');
  assert.equal(Phase1.CONTRACT.id,'HH-ANIMAL-FIRST-001');
  assert.equal(Phase1.CONTRACT.hardlocked,true);
  assert.match(Phase1.CONTRACT.dataRule,/Enter a fact once/);
});

test('animal profile hub is context-aware and does not operationalize sold animals',()=>{
  const state=fixture();
  const cow=Phase1.profileModel(state,'cow1');
  assert.equal(cow.current,true);
  assert.deepEqual(cow.tabs,['overview','health','breeding','genetics','pedigree','shows','production','history']);
  assert.equal(cow.quarantined,true);
  const sold=Phase1.profileModel(state,'rabbit1');
  assert.equal(sold.current,false);
  assert.equal(sold.tabs.includes('breeding'),false);
  assert.equal(sold.tabs.includes('genetics'),false);
});

test('unified animal history derives from canonical module records',()=>{
  const rows=Phase1.timelineRows(fixture(),'cow1');
  assert.ok(rows.some(r=>r.type==='Birth'));
  assert.ok(rows.some(r=>r.type==='Health'));
  assert.ok(rows.some(r=>r.type==='Breeding'));
  assert.ok(rows.some(r=>r.type==='Show'));
  assert.ok(rows.some(r=>r.type==='Production'));
});

test('Today queue uses current farm animals and suppresses historical species work',()=>{
  const events=Phase1.todayEvents(fixture(),{today:'2026-09-05',horizon:7});
  assert.ok(events.some(e=>e.key==='task:t1'));
  assert.ok(events.some(e=>e.key==='episode:e1:quarantine'));
  assert.ok(events.some(e=>e.key==='episode:e1:recheck'));
  assert.ok(events.some(e=>e.key==='care:c1:booster'));
  assert.ok(events.some(e=>e.key==='show:s1:start'));
  assert.equal(events.some(e=>e.key==='task:t2'),false);
  assert.equal(events.some(e=>e.key==='group:g1:followup'),false);
});

test('Today signature changes when canonical work changes so an open dashboard cannot stay stale',()=>{
  const state=fixture();
  const first=Phase1.eventSignature(Phase1.todayEvents(state,{today:'2026-09-05',horizon:7}));
  state.tasks[0].title='Pregnancy check updated';
  const second=Phase1.eventSignature(Phase1.todayEvents(state,{today:'2026-09-05',horizon:7}));
  assert.notEqual(first,second);
});

test('contextual Quick Add prioritizes the current workflow without replacing existing forms',()=>{
  assert.deepEqual(Phase1.contextualQuickTypes('health'),['health','task']);
  assert.deepEqual(Phase1.contextualQuickTypes('breeding'),['breeding','litter','task']);
  assert.deepEqual(Phase1.contextualQuickTypes('sales'),['sale','customer','income']);
});

test('Phase 1 does not install its DOM observer until the core app is ready',()=>{
  const repo=path.resolve(__dirname,'..');
  const source=fs.readFileSync(path.join(repo,'workflow-phase1-v1.7.1.js'),'utf8');
  assert.match(source,/function startObserver\(\)/);
  assert.match(source,/root\.addEventListener\?\.\('herdharbor:app-ready',markAppReady\)/);
  assert.match(source,/if\(root\.HerdHarborApp\?\.getState\)markAppReady\(\)/);
  assert.match(source,/function scheduleEnhance\(\)\{if\(!appReady\|\|queued\)return/);
  assert.match(source,/observer\.disconnect\(\);try\{enhance\(\);\}finally\{/);
});

test('Phase 1 expires consumed animal selection and refreshes the Today panel instead of cloning stale panels',()=>{
  const repo=path.resolve(__dirname,'..');
  const source=fs.readFileSync(path.join(repo,'workflow-phase1-v1.7.1.js'),'utf8');
  assert.match(source,/PENDING_ANIMAL_MAX_AGE_MS=5000/);
  assert.match(source,/function consumePendingAnimal/);
  assert.match(source,/pendingAnimalId='';pendingAnimalAt=0/);
  assert.match(source,/existing\?\.dataset\?\.hhP1Signature===signature/);
  assert.match(source,/if\(existing\)existing\.replaceWith\(panel\)/);
});

test('sign-in bootstrap keeps the Supabase callback deadlock guard ahead of cloud startup',()=>{
  const repo=path.resolve(__dirname,'..');
  const html=fs.readFileSync(path.join(repo,'index.html'),'utf8');
  const release=fs.readFileSync(path.join(repo,'herdharbor-release-v1.6.1.js'),'utf8');
  const cloud=fs.readFileSync(path.join(repo,'herdharbor-cloud.js'),'utf8');
  assert.ok(html.indexOf('herdharbor-release-v1.6.1.js?v=1.7.1')>=0);
  assert.ok(html.indexOf('herdharbor-cloud.js?v=20')>html.indexOf('herdharbor-release-v1.6.1.js?v=1.7.1'));
  assert.match(release,/installSupabaseAuthDeadlockGuard\(\);/);
  assert.match(release,/setTimeout\.bind\(window\)|window\.setTimeout/);
  assert.match(cloud,/client\.auth\.onAuthStateChange/);
});

test('Phase 1 assets are cache-busted after stability repair, dark mode is explicit, and no v1.7.5 workflow runtime is loaded',()=>{
  const repo=path.resolve(__dirname,'..');
  const build=fs.readFileSync(path.join(repo,'herdharbor-build.js'),'utf8');
  const sw=fs.readFileSync(path.join(repo,'service-worker.js'),'utf8');
  const css=fs.readFileSync(path.join(repo,'workflow-phase1-v1.7.1.css'),'utf8');
  assert.match(build,/workflow-phase1-v1\.7\.1\.css\?v=2/);
  assert.match(build,/herdharbor-v1\.7\.1-stability-hotfix\.js\?v=2[\s\S]*workflow-phase1-v1\.7\.1\.js\?v=2/);
  assert.match(sw,/herdharbor-shell-v1\.8\.0-alpha-subscription-engine-2-mobile-fit/);
  assert.match(sw,/workflow-phase1-v1\.7\.1\.js\?v=2/);
  assert.match(sw,/herdharbor-v1\.7\.1-stability-hotfix\.js\?v=2/);
  assert.match(sw,/workflow-phase1-v1\.7\.1\.css\?v=2/);
  assert.match(sw,/\/workflow-phase1-v1\.7\.1\.js/);
  assert.match(sw,/\/workflow-phase1-v1\.7\.1\.css/);
  assert.match(css,/\[data-theme="dark"\] \.hh-p1-today-stats span/);
  assert.match(css,/background:#10283a;color:#edf5f7;border-color:#294359/);
  assert.doesNotMatch(build,/workflow-engine-v1\.7\.5|health-intelligence-ui-hotfix-v1\.7\.5/);
  assert.doesNotMatch(sw,/workflow-engine-v1\.7\.5|health-intelligence-ui-hotfix-v1\.7\.5/);
});