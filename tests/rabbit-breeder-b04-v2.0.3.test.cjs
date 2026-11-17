const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const breeder=require('../rabbit-breeder-v2.0.3.js');
const rabbit=(id,other={})=>({id,species:'Rabbit',...other});
test('pedigree warns about shared and direct ancestry without inventing coefficients',()=>{
  const grand=rabbit('grand'),sire=rabbit('sire',{sireId:'grand'}),
    dam=rabbit('dam',{damId:'grand'}),child=rabbit('kit',{sireId:'sire',damId:'dam'});
  const review=breeder.pairingReview(sire,dam,[grand,sire,dam,child]);
  assert.deepEqual(review.commonAncestors,['grand']);
  assert.ok(review.warnings.some(w=>w.code==='shared-ancestry'));
  assert.equal(review.hasRelationshipRisk,true);
  assert.equal('inbreedingCoefficient' in review,false);
});
test('cycle and duplicate pedigree records do not silently select a parent',()=>{
  const a=rabbit('a',{sireId:'b'}),b=rabbit('b',{sireId:'a'}),dupe=rabbit('b');
  const x=breeder.ancestryIds(a,[a,b,dupe]);
  assert.ok(x.warnings.some(w=>w.code==='ambiguous-ancestor'));
});
test('genetic history preserves evidence provenance and conflict review flags',()=>{
  const a=rabbit('kit',{genetics:{evidence:[{source:'family-inferred',status:'strongly-inferred',locus:'B',note:'inferred'}],conflicts:[{source:'family-inferred',locus:'C',note:'review',sireId:'sire'}]}});
  const items=breeder.geneticsHistory(a);
  assert.equal(items.length,2);
  assert.equal(items[0].status,'strongly-inferred');
  assert.equal(items[1].kind,'review-required');
  assert.equal(items[1].status,'unresolved');
});
test('individual kit growth is idempotent by date and does not erase other days',()=>{
  const kit=rabbit('kit');
  breeder.addKitWeight(kit,'2026-11-14',120,'Initial');
  breeder.addKitWeight(kit,'2026-11-15',130,'Follow-up');
  breeder.addKitWeight(kit,'2026-11-14',125,'Corrected');
  assert.equal(kit.growthRecords.length,2);
  assert.equal(kit.growthRecords[0].grams,125);
  assert.equal(kit.growthRecords[1].grams,130);
  assert.throws(()=>breeder.addKitWeight(kit,'2026-11-14',-1),/positive/);
  assert.throws(()=>breeder.addKitWeight({species:'Dog'},'2026-11-14',5),/rabbit/);
});
test('foster ledger records retries once and preserves count history',()=>{
  const litter={id:'l',fosteredIn:2};
  const event={id:'transfer-one',direction:'in',count:1,date:'2026-11-14'};
  assert.equal(breeder.recordFoster(litter,event).created,true);
  assert.equal(breeder.recordFoster(litter,event).created,false);
  assert.equal(litter.fosteredIn,3);
  assert.equal(litter.fosterEvents.length,1);
  assert.throws(()=>breeder.recordFoster(litter,{...event,count:2}),/conflict/);
});
test('litter assessment uses actual kits and does not invent outcomes',()=>{
  const litter={id:'l1',bornAlive:4,fosteredIn:1,fosteredOut:1,lostBeforeWeaning:1,weaned:3,offspringIds:['a']};
  const a=rabbit('a',{growthRecords:[{id:'g',date:'2026-11-14',grams:100}]}),
    b=rabbit('b',{sourceBirthId:'l1'}),dog={id:'dog',species:'Dog',sourceBirthId:'l1'};
  const result=breeder.litterSummary(litter,[a,b,dog]);
  assert.equal(result.individualKits,2);
  assert.equal(result.growthMeasurements,1);
  assert.equal(result.liveRemaining,3);
  assert.equal(result.countWarning,false);
});
test('real installed litter UI loads growth workflow and persists through existing atomic mutation',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const runtime=fs.readFileSync(path.join(__dirname,'../breeding-litter-runtime-v1.8.3.js'),'utf8');
  assert.ok(html.indexOf('rabbit-breeder-v2.0.3.js')<html.indexOf('breeding-litter-runtime-v1.8.3.js'));
  assert.match(runtime,/data-rabbit-kit-growth/);
  assert.match(runtime,/rabbitBreeder\.addKitWeight/);
  assert.match(runtime,/persistMutation\("Rabbit kit growth measurement saved\."/);
});
