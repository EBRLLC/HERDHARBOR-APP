const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Inheritance = require('../rabbit-genetics-inheritance-v2.0.3.js');

const allPairs = [['B','B'],['B','b'],['b','b']];
const engine = {
  LOCI: { B: { predictionModel: 'mendelian' } },
  EDITABLE_LOCI: ['B'],
  normalizeGenetics(g) {
    return { loci: { B: { alleles: g?.loci?.B?.alleles || ['_','_'] } } };
  },
  possiblePairsForLocus(animal) {
    const p = animal?.genetics?.loci?.B?.alleles;
    if (!p || p.every(a => a === '_')) return allPairs;
    return allPairs.filter(candidate => p.every(a => a === '_' || candidate.includes(a)));
  },
  crossLocus(locus, sire, dam) {
    const results = new Map();
    for (const a of sire) for (const b of dam) {
      const alleles = [a,b].sort((x,y) => ['B','b'].indexOf(x) - ['B','b'].indexOf(y));
      const key = alleles.join('/');
      results.set(key,(results.get(key)||0)+0.25);
    }
    return { exact:true, outcomes:[...results].map(([key,probability]) => ({ alleles:key.split('/'),probability })) };
  }
};
const rabbit=(id, pair, other={}) => ({
  id,species:'Rabbit',...other,
  genetics:pair ? { loci:{ B:{alleles:pair,status:'confirmed',source:'dna'} } } : {loci:{}}
});
const locus=a => a.genetics?.loci?.B;

test('parent genotypes yield reversible, non-DNA-confirmed kit inference', () => {
  const state={animals:[
    rabbit('sire',['B','B']),
    rabbit('dam',['b','b']),
    rabbit('kit',null,{sireId:'sire',damId:'dam'})
  ]};
  assert.ok(Inheritance.reconcile(state,engine).changed>0);
  assert.deepEqual(locus(state.animals[2]).alleles,['B','b']);
  assert.equal(locus(state.animals[2]).status,'strongly-inferred');
  assert.equal(locus(state.animals[2]).source,'family-inferred');
  assert.equal(Inheritance.reconcile(state,engine).changed,0);
  state.animals[2].damId=null;
  state.animals[2].sireId=null;
  assert.ok(Inheritance.reconcile(state,engine).changed>0);
  assert.equal(locus(state.animals[2]),undefined);
});

test('duplicate rabbit identities never supply arbitrary genetic parentage', () => {
  const state={animals:[
    rabbit('duplicate',['B','B']),
    rabbit('duplicate',['b','b']),
    rabbit('dam',['b','b']),
    rabbit('kit',null,{sireId:'duplicate'})
  ]};
  Inheritance.reconcile(state,engine);
  assert.equal(locus(state.animals[3]),undefined);
  assert.equal(locus(state.animals[0]).source,'dna');
  assert.equal(locus(state.animals[1]).source,'dna');
});

test('unrelated species and manually confirmed evidence are not altered', () => {
  const dog={id:'dog',species:'Dog',genetics:{loci:{B:{alleles:['B','B'],source:'dna'}}}};
  const kit=rabbit('kit',['b','b'],{sireId:'sire',damId:'dam'});
  const state={animals:[rabbit('sire',['B','B']),rabbit('dam',['B','B']),kit,dog]};
  const before=JSON.stringify(dog);
  const result=Inheritance.reconcile(state,engine);
  assert.ok(result.conflicts>0);
  assert.equal(locus(kit).source,'dna');
  assert.equal(JSON.stringify(dog),before);
});

test('installed shell loads inheritance before application runtime and runtime invokes reconciliation', () => {
  const index=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const runtime=fs.readFileSync(path.join(__dirname,'../herdharbor-app-runtime.js'),'utf8');
  const geneticsScript=index.indexOf('rabbit-genetics-inheritance-v2.0.3.js');
  const appScript=index.indexOf('herdharbor-app-runtime.js');
  assert.ok(geneticsScript>=0 && appScript>geneticsScript);
  assert.match(runtime,/HerdHarborRabbitInheritance/);
  assert.match(runtime,/inheritance\.reconcile\(candidate, genetics\)/);
  assert.match(runtime,/canonicalStateStore\.commit\(nextState/);
});
