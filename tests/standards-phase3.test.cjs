const test=require('node:test');
const assert=require('node:assert/strict');
const Standards=require('../standards-registry-v1.6.1.js');

test('ARBA is an optional rabbit registry with licensing-safe structured summaries',()=>{
  const org=Standards.organization('arba');
  assert.equal(org.optional,true);assert.equal(org.species,'rabbit');
  const rows=Standards.list({species:'Rabbit',registry:'ARBA'});
  assert.ok(rows.length>=6);
  rows.forEach(row=>{assert.equal(row.licensing.verbatimLicensed,false);assert.equal(row.licensing.contentMode,'structured-summary');});
});

test('breed resolution never leaks another breed standard',()=>{
  const holland=Standards.resolve({breedName:'Holland Lop'}),rex=Standards.resolve({breedName:'Rex'});
  assert.equal(holland.breedId,'holland-lop');assert.equal(rex.breedId,'rex');
  assert.ok(holland.sections.some(x=>x.keywords.includes('crown')));
  assert.ok(!rex.sections.some(x=>x.keywords.includes('crown')));
  assert.ok(!holland.sections.some(x=>x.summary.includes('Rex-specific')));
});

test('search prioritizes breed context and supports deliberate global search',()=>{
  const contextual=Standards.search('ear fault',{breedId:'holland-lop'});
  assert.equal(contextual[0].breedId,'holland-lop');
  const mane=Standards.search('mane',{breedId:'holland-lop',global:true});
  assert.equal(mane[0].breedId,'lionhead');
});

test('editions, historical dates, corrections, and working states coexist',()=>{
  Standards.registerStandard({registry:'arba',edition:'2031–2035',species:'Rabbit',breedId:'holland-lop',breedName:'Holland Lop',status:Standards.STATUS.WORKING,sections:[{id:'future',type:'update',title:'Future working reference',summary:'Not recognized.',keywords:['future']}],source:{effectiveDate:'2031-01-01',expiresDate:'2035-12-31'},corrections:[{id:'c1',effectiveDate:'2032-01-01',summary:'Official correction metadata.'}]});
  assert.equal(Standards.resolve({breedName:'Holland Lop',date:'2028-04-01'}).edition,'2026–2030');
  const future=Standards.resolve({breedName:'Holland Lop',date:'2032-04-01'});
  assert.equal(future.status,'working');
  assert.equal(Standards.applyCorrections(future,'2031-06-01').appliedCorrections.length,0);
  assert.equal(Standards.applyCorrections(future,'2032-06-01').appliedCorrections.length,1);
});

test('missing standards fail closed without touching core records',()=>{
  assert.equal(Standards.resolve({breedName:'Unknown Breed'}),null);
  const state=Standards.unavailableState(new Error('disabled'));
  assert.equal(state.available,false);assert.match(state.message,/records are unaffected/);
});
