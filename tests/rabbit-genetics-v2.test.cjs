"use strict";
const assert=require("node:assert/strict");
const Core=require("../rabbit-genetics-engine-v2.js");
assert.equal(Core.VERSION,"2.0.0");
assert.deepEqual(Core.RABBIT_LOCI.En.dominance,["En","en"]);
assert.deepEqual(Core.RABBIT_LOCI.V.dominance,["V","v"]);
function rabbit(id,color,loci={},extra={}){const full={A:['a','a'],B:['B','B'],C:['C','C'],D:['D','D'],E:['E','E'],En:['en','en'],V:['V','V'],...loci};return{id,name:id,species:'Rabbit',breed:'Holland Lop',color,genetics:{loci:Object.fromEntries(Object.entries(full).map(([k,alleles])=>[k,{alleles,source:'user',status:'confirmed'}]))},...extra}}
const black=rabbit('black','Black',{D:['D','d']}),blue=rabbit('blue','Blue',{D:['d','d']});
let x=Core.analyzePairing(black,blue,{animals:[black,blue]});
assert.equal(x.exact,true);let m=Object.fromEntries(x.exactOutcomes.map(o=>[o.name,o.probability]));assert.equal(m.Black,.5);assert.equal(m.Blue,.5);
const unknown={id:'u',name:'u',species:'Rabbit',color:'Black'},uncertain=Core.analyzePairing(unknown,blue,{animals:[unknown,blue]});const d=uncertain.conditionalOutcomes.find(o=>o.locus==='D');assert.equal(d.minProbability,0);assert.equal(d.maxProbability,.5);
const sire={id:'s',name:'Blue sire',species:'Rabbit',color:'Blue'},kid={id:'k',name:'Black kid',species:'Rabbit',color:'Black',sireId:'s'};let kg=Core.refineAnimalGenetics(kid,[kid,sire],[]).genetics;assert.deepEqual(kg.loci.D.alleles,['D','d']);assert.equal(kg.loci.D.source,'pedigree');
const parent={id:'p',name:'Black parent',species:'Rabbit',color:'Black'},mate={id:'m',name:'Chocolate mate',species:'Rabbit',color:'Chocolate'},ck={id:'ck',name:'Chocolate kit',species:'Rabbit',color:'Chocolate',sireId:'p',damId:'m'};let pg=Core.refineAnimalGenetics(parent,[parent,mate,ck],[]).genetics;assert.deepEqual(pg.loci.B.alleles,['B','b']);assert.equal(pg.loci.B.source,'offspring');
function vr(id,V,color='Black'){return rabbit(id,color,{V})}function vp(a,b){const v=Core.analyzePairing(a,b,{animals:[a,b]}).viennaInheritance;return[v.clean.minProbability,v.carrier.minProbability,v.bew.minProbability]}
assert.deepEqual(vp(vr('a',['V','V']),vr('b',['V','V'])),[1,0,0]);
assert.deepEqual(vp(vr('c',['V','V']),vr('d',['V','v'])),[.5,.5,0]);
assert.deepEqual(vp(vr('e',['V','v']),vr('f',['V','v'])),[.25,.5,.25]);
assert.deepEqual(vp(vr('g',['V','v']),vr('h',['v','v'],'Blue-Eyed White (BEW)')),[0,.5,.5]);
assert.deepEqual(vp(vr('i',['V','V']),vr('j',['v','v'],'Blue-Eyed White (BEW)')),[0,1,0]);
assert.deepEqual(vp(vr('k',['v','v'],'Blue-Eyed White (BEW)'),vr('l',['v','v'],'Blue-Eyed White (BEW)')),[0,0,1]);
assert.deepEqual(Core.viennaPairForStatus('Vienna Marked (VM)'),['V','v']);assert.deepEqual(Core.viennaPairForStatus('Vienna Carrier (VC)'),['V','v']);
const bew=Core.phenotypeFromGenotype({A:['a','a'],B:['b','b'],C:['C','C'],D:['d','d'],E:['E','E'],En:['en','en'],V:['v','v']});assert.equal(bew.name,'Blue-Eyed White (BEW)');assert.equal(bew.underlyingName,'Lilac');
const nonbew={id:'nb',name:'NonBEW',species:'Rabbit',color:'Black'},other={id:'o',name:'Other',species:'Rabbit',color:'Black'},bewkit={id:'bk',name:'BEW kit',species:'Rabbit',color:'Blue-Eyed White (BEW)',sireId:'nb',damId:'o'};let vg=Core.refineAnimalGenetics(nonbew,[nonbew,other,bewkit],[]).genetics;assert.deepEqual(vg.loci.V.alleles,['V','v']);assert.equal(vg.loci.V.source,'offspring');
const c1=rabbit('c1','Chocolate',{B:['b','b']}),l1=rabbit('l1','Lilac',{B:['b','b'],D:['d','d']});const y=Core.analyzePairing(c1,l1,{animals:[c1,l1]});assert.notDeepEqual(x.exactOutcomes.map(o=>[o.name,o.probability]),y.exactOutcomes.map(o=>[o.name,o.probability]));
assert.ok(Core.RABBIT_MODIFIERS.wideband&&Core.RABBIT_MODIFIERS.silvering&&Core.RABBIT_MODIFIERS.rufus&&Core.RABBIT_MODIFIERS.breedSpecific);
console.log("Rabbit Genetics v2 deterministic inheritance tests passed");
