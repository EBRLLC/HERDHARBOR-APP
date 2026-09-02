const test=require('node:test');
const assert=require('node:assert/strict');
const Engine=require('../rabbit-genetics-v1.6.1.js');

test('v1.6.1 exposes a species-extensible rabbit schema without discarding unknowns',()=>{
  assert.equal(Engine.VERSION,'1.6.1');
  assert.equal(Engine.GENETICS_CONTRACT_VERSION,'1.6.5');
  for(const locus of ['A','B','C','D','E','V','En','Du','W','Rf','Si','Lu','Rex1','Rex2','Rex3','FGF5','Sa','M','Hr','Dw','Lop'])assert.ok(Engine.LOCI[locus],locus);
  const record=Engine.normalizeGenetics({loci:{V:{alleles:['V','?'],status:'possible'}}});
  assert.deepEqual(record.loci.V.alleles,['V','_']);
  assert.equal(record.loci.En.status,'unknown');
  assert.equal(record.schemaVersion,3);
  assert.equal(Object.hasOwn(record,'vienna'),false);
  assert.equal(Object.hasOwn(record,'modifiers'),false);
});

test('Vienna, broken, Dutch and coat loci stay biologically separate',()=>{
  const genetics={loci:{V:['v','v'],En:['En','en'],Du:['du','du'],Rex1:['r1','r1'],FGF5:['l','l'],Sa:['sa','sa'],M:['M','m']}};
  const result=Engine.evaluateTraits(genetics);
  const byLocus=Object.fromEntries(result.traits.map(row=>[row.locus,row]));
  assert.match(byLocus.V.label,/Blue-Eyed White/);
  assert.equal(byLocus.En.label,'Broken pattern');
  assert.equal(byLocus.Du.label,'Dutch pattern');
  assert.match(byLocus.Rex1.label,/expressed/);
  assert.equal(byLocus.FGF5.label,'Longhair');
  assert.equal(byLocus.Sa.label,'Satin coat');
  assert.equal(byLocus.M.label,'Single mane');
});

test('pair analysis calculates Mendelian modifier probabilities, flags health combinations, and suppresses complex-trait percentages',()=>{
  const core={A:['a','a'],B:['B','B'],C:['C','C'],D:['D','D'],E:['E','E']};
  const animal=(name,loci)=>({id:name,name,species:'Rabbit',genetics:{loci:{...core,...loci}}});
  const result=Engine.analyzePairing(animal('Buck',{En:['En','en'],Dw:['Dw','dw'],Rf:['Rf','rf'],Si:['Si','si'],Lop:['Lop','lop']}),animal('Doe',{En:['En','en'],Dw:['Dw','dw'],Rf:['Rf','rf'],Si:['Si','si'],Lop:['Lop','lop']}));
  assert.equal(result.supported,true);
  assert.equal(result.engineVersion,'1.6.1');
  assert.equal(result.modifierCrosses.En.exact,true);
  assert.equal(result.modifierCrosses.Dw.outcomes.find(x=>x.alleles.join('/')==='Dw/Dw').probability,.25);
  assert.ok(result.healthNotices.some(x=>x.locus==='En'&&x.probability===.25));
  assert.ok(result.healthNotices.some(x=>x.locus==='Dw'&&x.severity==='critical'));
  assert.equal(result.modifierCrosses.Rf.probabilities,false);
  assert.equal(result.modifierCrosses.Si.probabilities,false);
  assert.equal(result.modifierCrosses.Lop.probabilities,false);
  assert.equal(result.registry.recognitionEvaluated,false);
});

test('stronger evidence is never overwritten and conflicts retain provenance',()=>{
  const confirmed={loci:{D:{alleles:['D','D'],status:'tested',source:'lab'}}};
  const result=Engine.applyEvidenceToGenetics(confirmed,[{locus:'D',allele:'d',status:'inferred',source:'offspring',relatedAnimalId:'kit-1'}]);
  assert.deepEqual(result.loci.D.alleles,['D','D']);
  assert.equal(result.conflicts.length,1);
  assert.equal(result.conflicts[0].resolution,'review-required');
  assert.equal(result.evidence[0].relatedAnimalId,'kit-1');
});

test('canonical phenotype is distinct from recorded, breed terminology, and registry recognition',()=>{
  const result=Engine.canonicalPhenotype({phenotype:{recorded:'local black'},loci:{A:['a','a'],B:['B','B'],C:['C','C'],D:['D','D'],E:['E','E'],En:['En','en']}},'local black','Holland Lop');
  assert.equal(result.recorded,'local black');
  assert.equal(result.canonical,'Black');
  assert.ok(result.modifiers.includes('Broken pattern'));
  assert.equal(result.registryRecognition.status,'not-evaluated');
  assert.match(Engine.REGISTRIES.arba.scope,/registry recognition never changes biological inheritance/);
});
