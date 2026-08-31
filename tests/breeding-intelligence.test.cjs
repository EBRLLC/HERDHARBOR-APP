const assert = require('node:assert/strict');
const Core = require('../breeding-intelligence-core-v1.5.1.js');

assert.equal(Core.VERSION, '1.5.1');
assert.equal(Core.speciesTerms('Rabbit').birth, 'Kindling');
assert.equal(Core.speciesTerms('Cattle').birth, 'Calving');
assert.ok(Core.getSpeciesModule('Rabbit'), 'rabbit module registered');
assert.deepEqual(Core.RABBIT_LOCI.E.dominance, ['Ed','Es','E','ej','e']);

function rabbit(id, name, color, sex, loci = {}) {
  const genetics = Core.normalizeGenetics({ loci: Object.fromEntries(Object.entries(loci).map(([k, alleles]) => [k, { alleles, status: 'confirmed' }])) });
  return { id, name, species: 'Rabbit', color, sex, genetics };
}

const black = rabbit('b1', 'Black Buck', 'Black', 'Male', { A:['a','a'], B:['B','B'], C:['C','C'], D:['D','d'], E:['E','E'] });
const blue = rabbit('d1', 'Blue Doe', 'Blue', 'Female', { A:['a','a'], B:['B','B'], C:['C','C'], D:['d','d'], E:['E','E'] });
const exact = Core.analyzePairing(black, blue, { animals: [black, blue], births: [] });
assert.equal(exact.exact, true);
const exactMap = Object.fromEntries(exact.exactOutcomes.map((o) => [o.name, o.probability]));
assert.equal(exactMap.Black, 0.5);
assert.equal(exactMap.Blue, 0.5);

const lilac1 = rabbit('x1','Lilac 1','Lilac','Male',{ A:['a','a'],B:['b','b'],C:['C','C'],D:['d','d'],E:['E','E'] });
const lilac2 = rabbit('x2','Lilac 2','Lilac','Female',{ A:['a','a'],B:['b','b'],C:['C','C'],D:['d','d'],E:['E','E'] });
const lilacCross = Core.analyzePairing(lilac1,lilac2,{animals:[],births:[]});
assert.equal(lilacCross.exactOutcomes.length,1);
assert.equal(lilacCross.exactOutcomes[0].name,'Lilac');
assert.equal(lilacCross.exactOutcomes[0].probability,1);

const unknownBlack = { id:'u1',name:'Unknown Black',species:'Rabbit',color:'Black',sex:'Male' };
const uncertain = Core.analyzePairing(unknownBlack,blue,{animals:[unknownBlack,blue],births:[]});
assert.equal(uncertain.exact,false);
assert.ok(uncertain.incompleteLoci.length>0);
assert.ok(uncertain.possibleOutcomes.some((o)=>o.name==='Black'));
assert.ok(uncertain.possibleOutcomes.some((o)=>o.name==='Blue'));

assert.equal(Core.phenotypeFromGenotype({A:['A','a'],B:['B','b'],C:['c','c'],D:['D','d'],E:['E','e']}).name,'REW');
assert.equal(Core.phenotypeFromGenotype({A:['A','A'],B:['B','B'],C:['C','C'],D:['D','D'],E:['Ed','e']}).name,'Black');
assert.equal(Core.phenotypeFromGenotype({A:['A','A'],B:['B','B'],C:['C','C'],D:['D','D'],E:['Ed','e']}).family,'Full-extension');

const target={id:'target',name:'Target',species:'Rabbit',color:'Black',sireId:'blue-sire',damId:'dam'};
const blueSire={id:'blue-sire',name:'Blue Sire',species:'Rabbit',color:'Blue',sireId:'blue-grand'};
const blueGrand={id:'blue-grand',name:'Blue Grand',species:'Rabbit',color:'Blue'};
const dam={id:'dam',name:'Dam',species:'Rabbit',color:'Black'};
const ped=Core.pedigreeEvidence(target,[target,blueSire,blueGrand,dam],3).filter((e)=>e.locus==='D');
assert.ok(ped.some((e)=>e.relatedAnimalId==='blue-sire'&&e.status==='confirmed'));
assert.ok(ped.some((e)=>e.relatedAnimalId==='blue-grand'&&e.status==='possible'));

const child={id:'child',name:'Blue Kit',species:'Rabbit',color:'Blue',sireId:'u1',damId:'d1'};
const evidence=Core.offspringEvidenceForParent(unknownBlack,blue,[child]);
const dEvidence=evidence.find((e)=>e.locus==='D');
assert.ok(dEvidence);
assert.equal(dEvidence.status,'inferred');
const learned=Core.applyEvidenceToGenetics(null,[dEvidence]);
assert.ok(learned.loci.D.alleles.includes('d'));
assert.equal(learned.loci.D.status,'inferred');

const confirmedDD=Core.normalizeGenetics({loci:{D:{alleles:['D','D'],status:'confirmed',note:'lab/tested'}}});
const conflict=Core.applyEvidenceToGenetics(confirmedDD,[{locus:'D',allele:'d',status:'inferred',source:'offspring',note:'conflict'}]);
assert.deepEqual(conflict.loci.D.alleles,['D','D']);
assert.equal(conflict.conflicts.length,1);

const shared={id:'ancestor',name:'Shared Ancestor',species:'Rabbit'};
const p1={id:'p1',name:'P1',species:'Rabbit',sireId:'ancestor'};
const p2={id:'p2',name:'P2',species:'Rabbit',damId:'ancestor'};
assert.equal(Core.sharedAncestors(p1,p2,[p1,p2,shared],3)[0].id,'ancestor');

const snapshot=Core.createPredictionSnapshot(exact,{buckId:'b1',doeId:'d1'});
const snapName=snapshot.analysis.exactOutcomes[0].name;
exact.exactOutcomes[0].name='Changed later';
assert.equal(snapshot.analysis.exactOutcomes[0].name,snapName);

const perf=Core.performanceForAnimal({id:'doe'},[{femaleId:'doe',status:'Delivered'},{femaleId:'doe',status:'Not pregnant'}],[{damId:'doe',bornAlive:6,stillborn:1,weaned:5}]);
assert.equal(perf.breedings,2);
assert.equal(perf.births,1);
assert.equal(perf.bornAlive,6);
assert.equal(perf.weaned,5);
assert.equal(perf.survivalRate,5/6);

console.log('HerdHarbor v1.5.1 breeding intelligence genetics tests passed');
