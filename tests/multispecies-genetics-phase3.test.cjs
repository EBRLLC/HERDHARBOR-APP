const test=require('node:test');
const assert=require('node:assert/strict');
const G=require('../multispecies-genetics-phase3.js');

const animal=(id,species,breed,traits)=>({id,name:id,species,breed,genetics:{species,breedId:breed,traits}});
const record=(alleles,status='dna-confirmed',extra={})=>({alleles,status,...extra});

test('species and breed registries remain isolated',()=>{
  for(const s of ['rabbit','cattle','goat','sheep','poultry','pig'])assert.ok(s==='rabbit'||G.getSpeciesModule(s));
  assert.ok(G.applicableTraits('cattle','Angus').some(t=>t.id==='extension-red-black'));
  assert.ok(!G.applicableTraits('cattle','Holstein').some(t=>t.id==='extension-red-black'));
  assert.ok(!G.applicableTraits('goat','Boer').some(t=>t.id==='extension-red-black'));
  assert.ok(!G.applicableTraits('sheep','Dorper').some(t=>t.id==='prolificacy'));
});

test('cattle Mendelian analysis handles homozygous, carrier, affected, and unknown',()=>{
  const buck=animal('Bull','Cattle','Angus',{'recessive-condition':record(['N','a'])});
  const cow=animal('Cow','Cattle','Angus',{'recessive-condition':record(['N','a'])});
  const result=G.analyzePairing(buck,cow),condition=result.analyses.find(x=>x.traitId==='recessive-condition');
  assert.equal(condition.result.mode,'exact');
  assert.equal(condition.result.outcomes.find(x=>x.phenotype==='Affected').probability,.25);
  assert.equal(result.notices[0].title,'Carrier × Carrier');
  const unknown=G.analyzePairing(animal('B2','Cattle','Angus',{}),cow);
  assert.ok(unknown.unknowns.includes('recessive-condition'));
});

test('poultry Z-linked inheritance uses sire ZZ and dam ZW roles',()=>{
  const sire=animal('Rooster','Poultry','Crossbreed',{barring:record(['B','b'])});
  const dam=animal('Hen','Poultry','Crossbreed',{barring:record(['b','W'])});
  const analysis=G.analyzePairing(sire,dam).analyses.find(x=>x.traitId==='barring').result;
  assert.equal(analysis.mode,'exact-sex-linked');
  assert.equal(analysis.outcomes.filter(x=>x.sex==='male').reduce((n,x)=>n+x.probability,0),.5);
  assert.equal(analysis.outcomes.filter(x=>x.sex==='female').reduce((n,x)=>n+x.probability,0),.5);
  assert.ok(analysis.outcomes.some(x=>x.sex==='female'&&x.chromosomes.includes('W')));
});

test('quantitative, complex, and genomic traits never manufacture Mendelian percentages',()=>{
  const a=animal('A','Cattle','Angus',{'epd-growth':{value:12,unit:'lb',status:'dna-confirmed',source:'breed association'}});
  const b=animal('B','Cattle','Angus',{'epd-growth':{value:8,unit:'lb',status:'dna-confirmed',source:'breed association'}});
  const q=G.analyzePairing(a,b).analyses.find(x=>x.traitId==='epd-growth').result;
  assert.equal(q.mode,'quantitative');assert.equal(q.probability,undefined);assert.match(q.notice,/not Mendelian/);
  const goat=G.analyzePairing(animal('G1','Goat','Boer',{}),animal('G2','Goat','Boer',{}));
  assert.equal(goat.analyses.find(x=>x.traitId==='coat-system').result.probabilities,false);
});

test('DNA evidence outranks inference and retains conflicts and history',()=>{
  const profile=G.normalizeProfile({species:'Cattle',traits:{polled:{alleles:['P','P'],status:'dna-confirmed',source:'lab'}}},'Cattle');
  const weaker=G.applyEvidence(profile,{traitId:'polled',alleles:['p','p'],value:['p','p'],status:'phenotype-inferred',source:'appearance'});
  assert.deepEqual(weaker.traits.polled.alleles,['P','P']);assert.equal(weaker.conflicts.length,1);
  const stronger=G.applyEvidence(profile,{traitId:'polled',alleles:['P','p'],status:'dna-confirmed',source:'corrected lab report'});
  assert.deepEqual(stronger.traits.polled.alleles,['P','p']);assert.equal(stronger.history.length,1);
});

test('trait-aware pedigree and offspring evidence scale without polygenic inference',()=>{
  const animals=[];for(let i=0;i<500;i++)animals.push(animal(`a${i}`,'Cattle','Angus',{'recessive-condition':record(i%2?['N','a']:['N','N'])}));
  animals[499].sireId='a498';animals[498].sireId='a497';
  assert.equal(G.pedigreeEvidence(animals[499],animals,'recessive-condition',5).length,2);
  const parents=[animal('p1','Cattle','Angus',{}),animal('p2','Cattle','Angus',{})],kit=animal('calf','Cattle','Angus',{'recessive-condition':record(['a','a'])});
  assert.equal(G.offspringEvidenceForParents(...parents,[kit],'recessive-condition').length,2);
  assert.equal(G.offspringEvidenceForParents(...parents,[kit],'epd-growth').length,0);
});

test('rabbit pair analysis delegates to the completed v1.6.1 engine',()=>{
  const core={A:['a','a'],B:['B','B'],C:['C','C'],D:['D','D'],E:['E','E']};
  const result=G.analyzePairing({id:'r1',species:'Rabbit',genetics:{loci:core}},{id:'r2',species:'Rabbit',genetics:{loci:core}});
  assert.equal(result.supported,true);assert.equal(result.engineVersion,'1.6.1');
});
