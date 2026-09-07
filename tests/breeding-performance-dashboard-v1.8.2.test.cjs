const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Core=require('../breeding-performance-core-v1.8.2.js');

function fixture(){return{
  animals:[
    {id:'d1',name:'Judy',species:'Rabbit',breed:'Holland Lop',sex:'Female'},
    {id:'d2',name:'Rose',species:'Rabbit',breed:'Holland Lop',sex:'Female'},
    {id:'s1',name:'Jack',species:'Rabbit',breed:'Holland Lop',sex:'Male'},
    {id:'g1',name:'Daisy',species:'Goat',breed:'Nigerian Dwarf',sex:'Female'},
    {id:'g2',name:'Atlas',species:'Goat',breed:'Nigerian Dwarf',sex:'Male'}
  ],
  breedings:[
    {id:'b1',femaleId:'d1',maleId:'s1',breedingDate:'2026-01-01',status:'Delivered',pregnancyCheckStatus:'Positive'},
    {id:'b2',femaleId:'d1',maleId:'s1',breedingDate:'2026-03-01',status:'Not Pregnant',pregnancyCheckStatus:'Negative'},
    {id:'b3',femaleId:'d2',maleId:'s1',breedingDate:'2026-04-01',status:'Bred',pregnancyCheckStatus:'Not checked'},
    {id:'b4',femaleId:'d2',maleId:'s1',breedingDate:'2026-05-01',status:'Cancelled',pregnancyCheckStatus:'Not checked'},
    {id:'g-b1',femaleId:'g1',maleId:'g2',breedingDate:'2026-02-01',status:'Delivered',pregnancyCheckStatus:'Positive'}
  ],
  litters:[
    {id:'l1',breedingId:'b1',damId:'d1',sireId:'s1',birthDate:'2026-02-01',bornAlive:'5',stillborn:'1',lostBeforeWeaning:'1',weaned:'4'},
    {id:'l2',damId:'d2',sireId:'s1',birthDate:'2026-06-01',bornAlive:'4',stillborn:'0',lostBeforeWeaning:'0',weaned:'1'},
    {id:'g-l1',breedingId:'g-b1',damId:'g1',sireId:'g2',birthDate:'2026-07-01',bornAlive:'2',stillborn:'0',lostBeforeWeaning:'0',weaned:'2'}
  ]
};}

test('conception rate excludes pending and cancelled breedings from the resolved denominator',()=>{
  const state=fixture();
  const records=Core.filteredRecords(state,{species:'Rabbit',range:'all'});
  const stats=Core.conceptionStats(state,records.breedings);
  assert.equal(stats.conceived,1);
  assert.equal(stats['not-conceived'],1);
  assert.equal(stats.pending,1);
  assert.equal(stats.cancelled,1);
  assert.equal(stats.rate,50);
  assert.equal(Math.round(stats.coverage),67);
});

test('a linked litter is stronger evidence of conception than a stale negative check',()=>{
  const state=fixture();
  state.breedings[0]={...state.breedings[0],status:'Not Pregnant',pregnancyCheckStatus:'Negative'};
  assert.equal(Core.breedingOutcome(state,state.breedings[0]),'conceived');
});

test('litter survival and average weaned only use resolved weaning outcomes',()=>{
  const state=fixture();
  const rabbit=Core.filteredRecords(state,{species:'Rabbit',range:'all'});
  const stats=Core.litterStats(rabbit.litters);
  assert.equal(stats.litters,2);
  assert.equal(stats.bornAlive,9);
  assert.equal(stats.liveBirthRate,90);
  assert.equal(stats.resolvedWeaningLitters,1);
  assert.equal(stats.survivalToWeaning,80);
  assert.equal(stats.averageWeaned,4);
  assert.equal(stats.recordedPreWeaningLosses,1);
});

test('dam and sire tables aggregate actual historical records without predictive scoring',()=>{
  const state=fixture();
  const data=Core.dashboard(state,{species:'Rabbit',range:'all'});
  const judy=data.dams.find(row=>row.id==='d1');
  const jack=data.sires.find(row=>row.id==='s1');
  assert.equal(judy.breedings,2);
  assert.equal(judy.litters,1);
  assert.equal(judy.conceptionRate,50);
  assert.equal(judy.averageBornAlive,5);
  assert.equal(judy.survivalToWeaning,80);
  assert.equal(jack.litters,2);
  assert.equal(jack.bornAlive,9);
});

test('pairing history keeps exact dam x sire combinations separate',()=>{
  const data=Core.dashboard(fixture(),{species:'Rabbit',range:'all'});
  const judyJack=data.pairings.find(row=>row.damId==='d1'&&row.sireId==='s1');
  const roseJack=data.pairings.find(row=>row.damId==='d2'&&row.sireId==='s1');
  assert.ok(judyJack);
  assert.ok(roseJack);
  assert.equal(judyJack.breedings,2);
  assert.equal(judyJack.litters,1);
  assert.equal(roseJack.litters,1);
});

test('species and date filters keep unrelated breeding data out of the dashboard',()=>{
  const state=fixture();
  const rabbits=Core.dashboard(state,{species:'Rabbit',range:'custom',start:'2026-03-01',end:'2026-06-30'});
  assert.equal(rabbits.recordCounts.breedings,3);
  assert.equal(rabbits.recordCounts.litters,1);
  assert.equal(rabbits.litter.bornAlive,4);
  const goats=Core.dashboard(state,{species:'Goat',range:'all'});
  assert.equal(goats.recordCounts.breedings,1);
  assert.equal(goats.litter.bornAlive,2);
});

test('UI injects into Analytics Breeding and links dam/sire rows back to animal profiles',()=>{
  const ui=fs.readFileSync(path.join(__dirname,'..','breeding-performance-dashboard-v1.8.2.js'),'utf8');
  for(const token of ['data-analytics-tab="breeding"','hh-bpd-metrics','Dam performance','Sire performance','Pairing history','Recent litter outcomes'])assert.ok(ui.includes(token),`missing ${token}`);
  assert.match(ui,/HerdHarborFlowPhase2\?\.openAnimalProfile/);
  assert.match(ui,/data-hh-bpd-animal/);
});

test('release loader and service worker include performance assets while release identity stays v1.8.1',()=>{
  const build=fs.readFileSync(path.join(__dirname,'..','herdharbor-build.js'),'utf8');
  const sw=fs.readFileSync(path.join(__dirname,'..','service-worker.js'),'utf8');
  for(const asset of ['breeding-performance-core-v1.8.2.js','breeding-performance-dashboard-v1.8.2.js','breeding-performance-dashboard-v1.8.2.css']){
    assert.match(build,new RegExp(asset.replace(/\./g,'\\.')));
    assert.match(sw,new RegExp(asset.replace(/\./g,'\\.')));
  }
  assert.match(build,/version:\s*"1\.8\.1"/);
  assert.doesNotMatch(build,/version:\s*"1\.8\.2"/);
});
