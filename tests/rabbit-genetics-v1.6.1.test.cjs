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

test('same-breed Holland Lop pair analysis hides unrelated specialty loci by default',()=>{
  const core={A:['a','a'],B:['B','B'],C:['C','C'],D:['D','D'],E:['E','E'],V:['V','v'],En:['en','en']};
  const rabbit=(id,sex)=>({id,name:id,sex,species:'Rabbit',breed:'Holland Lop',color:'Black',genetics:{loci:core}});
  const result=Engine.analyzePairing(rabbit('buck','Male'),rabbit('doe','Female'),{});
  assert.equal(result.breedRelevance.mode,'same-breed-defaults');
  assert.equal(result.breedRelevance.breedId,'holland-lop');
  for(const locus of ['V','En','W','Rf','Dw','Lop'])assert.ok(result.breedRelevance.visibleLoci.includes(locus),locus);
  for(const locus of ['Rex1','Rex2','Rex3','Sa','M','Hr'])assert.ok(result.breedRelevance.hiddenLoci.includes(locus),locus);
});

test('explicit evidence restores a normally hidden locus for a same-breed pair',()=>{
  const core={A:['a','a'],B:['B','B'],C:['C','C'],D:['D','D'],E:['E','E'],V:['V','V'],En:['en','en']};
  const buck={id:'buck',name:'buck',sex:'Male',species:'Rabbit',breed:'Holland Lop',color:'Black',genetics:{loci:{...core,Rex1:{alleles:['R1','r1'],status:'confirmed',source:'genetic-test'}}}};
  const doe={id:'doe',name:'doe',sex:'Female',species:'Rabbit',breed:'Holland Lop',color:'Black',genetics:{loci:core}};
  const result=Engine.analyzePairing(buck,doe,{});
  assert.ok(result.breedRelevance.evidenceRelevantLoci.includes('Rex1'));
  assert.ok(result.breedRelevance.visibleLoci.includes('Rex1'));
  assert.ok(!result.breedRelevance.hiddenLoci.includes('Rex1'));
});

test('different, mixed, unknown, or unmapped breeds keep the full tracked-locus analysis',()=>{
  const core={A:['a','a'],B:['B','B'],C:['C','C'],D:['D','D'],E:['E','E']};
  const animal=(id,breed)=>({id,name:id,species:'Rabbit',breed,color:'Black',genetics:{loci:core}});
  for(const pair of [['Holland Lop','Mini Rex'],['Mixed','Mixed'],['American Chinchilla','American Chinchilla']]){
    const result=Engine.analyzePairing(animal('a',pair[0]),animal('b',pair[1]),{});
    assert.equal(result.breedRelevance.mode,'all-tracked');
    assert.equal(result.breedRelevance.hiddenLoci.length,0);
  }
});


test('BEW phenotype is represented as inferred vv in read-only profiles without rewriting owner records',()=>{
  const animal={id:'snow',species:'Rabbit',color:'Blue Eyed White (BEW)',genetics:{loci:{V:{alleles:['_','_'],status:'unknown'}}}};
  const original=JSON.stringify(animal);
  const profile=Engine.profileForAnimal(animal);
  assert.deepEqual(profile.genetics.loci.V.alleles,['v','v']);
  assert.equal(profile.genetics.loci.V.source,'phenotype');
  assert.equal(profile.genetics.loci.V.status,'strongly-inferred');
  assert.equal(JSON.stringify(animal),original);
  const conflicting={...animal,genetics:{loci:{V:{alleles:['V','V'],status:'confirmed',source:'genetic-test'}}}};
  assert.deepEqual(Engine.profileForAnimal(conflicting).genetics.loci.V.alleles,['V','V'],'never silently replace contradictory genotype evidence');
});

test('harlequin and magpie parents cannot generate silver martens without an extension E allele',()=>{
  const parent=(id,color,loci)=>({id,name:id,species:'Rabbit',breed:'Holland Lop',color,genetics:{loci}});
  const base={A:['A','a'],B:['B','B'],D:['D','D'],E:['ej','ej'],V:['V','v'],En:['en','en']};
  const patches=parent('patches','Black and Orange Harlequin VC',{...base,C:['C','cchd']});
  const judy=parent('judy','Black Magpie',{...base,C:['cchd','cchd']});
  const result=Engine.analyzePairing(patches,judy,{animals:[patches,judy]});
  assert.equal(result.possibleOffspringColors.some(x=>/Silver Marten/.test(x.name)),false);
  assert.equal(result.viennaRange.bew.minProbability,.25);
  assert.equal(result.viennaRange.bew.maxProbability,.25);
  assert.ok(result.possibleOffspringColors.some(x=>/Magpie/.test(x.name)));
});

test('BEW white mask does not force a hidden extension genotype, and BEW by BEW is 100 percent BEW',()=>{
  const bew=(id)=>({id,name:id,species:'Rabbit',breed:'Holland Lop',color:'Blue Eyed White (BEW)',genetics:{loci:{V:{alleles:['v','v'],source:'phenotype',status:'inferred'}}}});
  const choices=Engine.phenotypePairs(bew('a'),'E').map(a=>a.join('/'));
  assert.ok(choices.includes('e/e'),'a BEW rabbit can conceal nonextension');
  assert.ok(choices.includes('ej/ej'),'a BEW rabbit can conceal harlequin');
  const result=Engine.analyzePairing(bew('a'),bew('b'));
  assert.deepEqual(result.possibleOffspringColors.map(c=>[c.name,c.minProbability,c.maxProbability]),[['Blue-Eyed White (BEW)',1,1]]);
});
