"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const root=path.join(__dirname,"..");
const Engine=require("../rabbit-genetics-v1.6.1.js");
const uiSource=fs.readFileSync(path.join(root,"rabbit-genetics-ui-advanced-v1.6.1.js"),"utf8");
const pedigreeSource=fs.readFileSync(path.join(root,"pedigree-genetics-v1.6.1.js"),"utf8");
const pwaSource=fs.readFileSync(path.join(root,"pwa.js"),"utf8");

function rabbit(id,name,sex,breed="Holland Lop",color="Black",loci={}){
  return{id,name,sex,species:"Rabbit",breed,color,status:"Active",genetics:{loci:Object.fromEntries(Object.entries(loci).map(([locus,alleles])=>[locus,{alleles,status:"confirmed",source:"breeder"}]))}};
}

test("v1.6.5 uses one schema-3 Rabbit normalizeGenetics contract and migrates legacy Vienna/modifiers",()=>{
  const migrated=Engine.normalizeGenetics({schemaVersion:2,vienna:{status:"Vienna Carrier (VC)",source:"breeder"},modifiers:{wideband:{status:"Wide",source:"breeder"},silvering:{status:"Heavy"},rufus:{status:"High"},otherGenes:["legacy note"]}});
  assert.equal(migrated.schemaVersion,3);
  assert.equal(migrated.geneticsContractVersion,"1.6.5");
  assert.deepEqual(migrated.loci.V.alleles,["V","v"]);
  assert.equal(migrated.loci.W.value,"Wide");
  assert.equal(migrated.loci.Si.value,"Heavy");
  assert.equal(migrated.loci.Rf.value,"High");
  assert.equal(migrated.additionalTraits[0].label,"legacy note");
  assert.equal(Object.hasOwn(migrated,"vienna"),false);
  assert.equal(Object.hasOwn(migrated,"modifiers"),false);
});

test("all supported Rabbit loci are structured and carry scientific/prediction metadata",()=>{
  const expected=["A","B","C","D","E","V","En","Du","W","Rf","Si","Lu","Rex1","Rex2","Rex3","FGF5","Sa","M","Hr","Dw","Lop"];
  assert.deepEqual(Array.from(Engine.EDITABLE_LOCI),expected);
  const record=Engine.normalizeGenetics({});
  for(const locus of expected){assert.ok(Engine.LOCI[locus],locus);assert.ok(Engine.LOCI[locus].scientificStatus,locus+" scientific status");assert.ok(Engine.LOCI[locus].predictionModel,locus+" prediction model");assert.ok(record.loci[locus],locus+" normalized record");}
});

test("Lutino has dedicated visual/carrier/non-carrier/unknown handling",()=>{
  assert.equal(Engine.traitExpression("Lu",["lu","lu"]).label,"Visual Lutino");
  assert.equal(Engine.traitExpression("Lu",["Lu","lu"]).label,"Lutino carrier");
  assert.match(Engine.traitExpression("Lu",["Lu","Lu"]).label,/non-carrier/);
  assert.equal(Engine.traitExpression("Lu",["Lu","_"]).state,"unknown");
});

test("non-Mendelian Rabbit traits never receive fabricated percentages",()=>{
  const base={A:["a","a"],B:["B","B"],C:["C","C"],D:["D","D"],E:["E","E"],V:["V","V"],En:["en","en"],Du:["Du","du"],W:["W","w"],Rf:["Rf","rf"],Si:["Si","si"],Lu:["Lu","lu"],Rex1:["R1","r1"],Rex2:["R2","r2"],Rex3:["R3","r3"],FGF5:["L","l"],Sa:["Sa","sa"],M:["M","m"],Hr:["Hr","hr"],Dw:["Dw","dw"],Lop:["Lop","lop"]};
  const a=rabbit("a","A","Male","Holland Lop","Black",base),b=rabbit("b","B","Female","Holland Lop","Black",base);
  const result=Engine.analyzePairing(a,b,{animals:[a,b]});
  for(const locus of ["W","Rf","Si","Hr","Lop"]){assert.equal(result.locusAnalyses[locus].probabilities,false,locus);assert.equal(result.modifierCrosses[locus].outcomes.length,0,locus);}
  assert.equal(result.locusAnalyses.Lu.probabilities,true);
  assert.ok(result.locusAnalyses.Lu.outcomes.length>0);
});

test("breed terminology is biology-first with Castor mapping and generic all-rabbit fallbacks",()=>{
  const chestnut=Engine.normalizeGenetics({loci:{A:["A","A"],B:["B","B"],C:["C","C"],D:["D","D"],E:["E","E"]}});
  assert.equal(Engine.canonicalPhenotype(chestnut,"Chestnut Agouti","Rex").breedTerm,"Castor");
  assert.equal(Engine.canonicalPhenotype(chestnut,"Chestnut Agouti","Mini Rex").breedTerm,"Castor");
  assert.equal(Engine.canonicalPhenotype(chestnut,"Chestnut Agouti","Holland Lop").breedTerm,"Chestnut Agouti");
  assert.equal(Engine.resolveBreedProfile("Crossbreed").kind,"crossbreed");
  assert.equal(Engine.resolveBreedProfile("Mixed").kind,"mixed");
  assert.equal(Engine.resolveBreedProfile("Unknown").kind,"unknown");
  assert.equal(Engine.resolveBreedProfile("Custom").kind,"custom");
  const generic=Engine.resolveBreedProfile("American Chinchilla");assert.equal(generic.label,"American Chinchilla");assert.equal(generic.generic,true);
});

test("canonical phenotype IDs are stable and missing named families are recognized without inventing registry status",()=>{
  assert.equal(Engine.canonicalPhenotypeId("Chestnut Agouti","Agouti"),Engine.canonicalPhenotypeId("Chestnut Agouti","Agouti"));
  assert.match(Engine.canonicalPhenotypeId("Chestnut Agouti","Agouti"),/^rabbit:agouti:chestnut-agouti$/);
  for(const [text,name] of [["Frosted Pearl","Frosted Pearl"],["Sable Pearl","Sable Pearl"],["Seal","Seal"],["Fox","Fox"]])assert.equal(Engine.canonicalizeRecordedPhenotype(text).name,name);
  const p=Engine.canonicalPhenotype(Engine.normalizeGenetics({}),"Sable Pearl","Custom");assert.equal(p.registryRecognition.status,"not-evaluated");
});

test("final v1.6.5 load order installs the authoritative engine before the structured profile UI",()=>{
  const runtime=pwaSource.indexOf('rabbit-genetics-runtime-v1.6.1.js'),engine=pwaSource.indexOf('rabbit-genetics-v1.6.1.js'),ui=pwaSource.indexOf('rabbit-genetics-ui-advanced-v1.6.1.js');
  assert.ok(runtime>=0&&engine>runtime&&ui>engine);
  assert.doesNotMatch(uiSource,/\bg\.vienna\b|\bg\.modifiers\b|\bnext\.vienna\b|\bnext\.modifiers\b/);
  assert.match(uiSource,/Core\.EDITABLE_LOCI/);
  assert.match(pedigreeSource,/engine\.normalizeGenetics/);
});

test("browser/runtime contract opens, edits, saves, reopens, pairs, and keeps pedigree/offspring evidence",async()=>{
  class FakeElement{constructor(tag="div"){this.tagName=tag.toUpperCase();this.dataset={};this.children=[];this.classList={contains(){return false;}};this.innerHTML="";this.textContent="";this.parentNode=null;}appendChild(child){child.parentNode=this;this.children.push(child);return child;}remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);}querySelector(){return null;}querySelectorAll(){return[];}setAttribute(){}addEventListener(){}}
  const body=new FakeElement("body"),head=new FakeElement("head"),documentElement=new FakeElement("html");
  const document={readyState:"complete",body,head,documentElement,createElement:t=>new FakeElement(t),querySelector(){return null;},querySelectorAll(){return[];},addEventListener(){}};
  const storage=new Map();
  const ancestor=rabbit("ancestor","Carrier ancestor","Male","Holland Lop","Black",{B:["B","b"]});
  const buck=rabbit("buck","Buck","Male","Holland Lop","Black",{A:["a","a"],B:["B","_"],C:["C","C"],D:["D","D"],E:["E","E"],V:["V","V"],En:["en","en"]});buck.sireId="ancestor";
  const doe=rabbit("doe","Doe","Female","Holland Lop","Chocolate",{A:["a","a"],B:["b","b"],C:["C","C"],D:["D","D"],E:["E","E"],V:["V","V"],En:["en","en"]});
  const kit=rabbit("kit","Chocolate kit","Female","Holland Lop","Chocolate",{A:["a","a"],B:["b","b"],C:["C","C"],D:["D","D"],E:["E","E"]});kit.sireId="buck";kit.damId="doe";
  storage.set("herdharbor_pre_alpha_v1",JSON.stringify({animals:[ancestor,buck,doe,kit],births:[],litters:[]}));
  const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))};
  const sandbox={window:{HerdHarborBreedingIntelligenceCore:Engine,HerdHarborBuild:{version:"1.6.5"}},document,localStorage,MutationObserver:class{observe(){}},console,setTimeout,clearTimeout};sandbox.window.window=sandbox.window;
  vm.runInNewContext(uiSource,sandbox,{filename:"rabbit-genetics-ui-advanced-v1.6.1.js"});
  const api=sandbox.window.HerdHarborRabbitGeneticsV2;assert.ok(api?.openProfile);
  let opened=api.openProfile("buck");assert.ok(opened);for(const locus of Engine.EDITABLE_LOCI)assert.match(opened.innerHTML,new RegExp(`data-locus="${locus}"`),locus+" editor is rendered");
  const edits={loci:{}};for(const locus of Engine.EDITABLE_LOCI){const alleles=Engine.LOCI[locus].dominance;edits.loci[locus]={alleles:[alleles[0],alleles[Math.min(1,alleles.length-1)]],status:"confirmed",source:"breeder",note:`${locus} contract edit`};}
  await api.saveProfileEdits("buck",edits);
  const saved=JSON.parse(localStorage.getItem("herdharbor_pre_alpha_v1")),savedBuck=saved.animals.find(a=>a.id==="buck");
  assert.equal(savedBuck.genetics.schemaVersion,3);assert.equal(Object.hasOwn(savedBuck.genetics,"vienna"),false);assert.equal(Object.hasOwn(savedBuck.genetics,"modifiers"),false);for(const locus of Engine.EDITABLE_LOCI)assert.equal(savedBuck.genetics.loci[locus].note,`${locus} contract edit`);
  opened=api.openProfile("buck");assert.match(opened.innerHTML,/Lutino carrier/);
  const savedDoe=saved.animals.find(a=>a.id==="doe"),pair=Engine.analyzePairing(savedBuck,savedDoe,{animals:saved.animals});
  assert.equal(pair.supported,true);assert.equal(pair.locusAnalyses.Rf.probabilities,false);assert.equal(pair.locusAnalyses.Si.probabilities,false);assert.equal(pair.locusAnalyses.Lop.probabilities,false);
  const pedigree=Engine.ancestorCarrierEstimate(savedBuck,saved.animals,"B","b");assert.ok(pedigree.estimate>0,"pedigree carrier evidence remains available");
  const offspring=Engine.offspringEvidenceMateAware(savedBuck,saved.animals);assert.ok(offspring.some(e=>e.locus==="B"&&e.allele==="b"),"offspring evidence remains available");
});
