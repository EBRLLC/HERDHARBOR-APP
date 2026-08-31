"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const Core=require("../rabbit-genetics-engine-v1.5.1.js");

assert.equal(Core.RELEASE_VERSION,"1.5.1");
assert.equal(Core.VERSION,"2.1.0");

function genetics(loci={}){return{loci:Object.fromEntries(Object.entries(loci).map(([l,alleles])=>[l,{alleles,status:"confirmed",source:"user"}]))}}
function rabbit(id,name,color,sex,loci={},extra={}){return{id,name,color,sex,species:"Rabbit",breed:"Holland Lop",status:"Active",genetics:genetics(loci),...extra}}
const knownBase={A:["a","a"],B:["B","B"],C:["C","C"],D:["D","D"],E:["E","E"],En:["en","en"],V:["V","V"]};

// Shared sex helper: exact normalization, never substring matching.
const recordsSource=fs.readFileSync(path.join(__dirname,"..","rabbit-records-v1.5.1.js"),"utf8");
const fakeDocument={addEventListener(){},querySelector(){return null;}};
const sandbox={window:{HerdHarborBreedingIntelligenceCore:{canonicalSpecies:v=>String(v).toLowerCase()==="rabbit"?"Rabbit":v}},document:fakeDocument,localStorage:{getItem(){return "{}"}},console};
vm.runInNewContext(recordsSource,sandbox);
const Records=sandbox.window.HerdHarborRabbitRecords;
assert.equal(Records.normalizeSex("Male"),"Male");
assert.equal(Records.normalizeSex("Female"),"Female");
assert.equal(Records.isSex({sex:"Female"},"Male"),false);
assert.equal(Records.isSex({sex:"Male"},"Female"),false);
const eligible=[rabbit("m","Buck","Black","Male",knownBase),rabbit("f","Doe","Black","Female",knownBase),rabbit("dead","Dead buck","Black","Male",knownBase,{status:"Deceased"})];
assert.deepEqual(Array.from(Records.rabbitsForSex(eligible,"Male"),x=>x.id),["m"]);
assert.deepEqual(Array.from(Records.rabbitsForSex(eligible,"Female"),x=>x.id),["f"]);

// Fully known deterministic percentages.
const blackDd=rabbit("b","Black Dd","Black","Male",{...knownBase,D:["D","d"]});
const blue=rabbit("d","Blue","Blue","Female",{...knownBase,D:["d","d"]});
let result=Core.analyzePairing(blackDd,blue,{animals:[blackDd,blue]});
assert.equal(result.scenarioTruncated,false);
const exact=Object.fromEntries(result.possibleOffspringColors.map(o=>[o.name,[o.minProbability,o.maxProbability]]));
assert.deepEqual(exact.Black,[.5,.5]);
assert.deepEqual(exact.Blue,[.5,.5]);

// Unknown carrier widens named coat-color results instead of withholding them.
const blackDUnknown=rabbit("u","Black D unknown","Black","Male",{...knownBase,D:["D","_"]});
result=Core.analyzePairing(blackDUnknown,blue,{animals:[blackDUnknown,blue]});
assert.equal(result.scenarioTruncated,false);
const blueRange=result.possibleOffspringColors.find(o=>o.name==="Blue");
assert.ok(blueRange,"Blue remains a named possible offspring color");
assert.equal(blueRange.minProbability,0);
assert.equal(blueRange.maxProbability,.5);

// Phenotype-constrained Japanese genetics: dominant E cannot hide under visible Harlequin/Magpie.
const magpie=rabbit("mag","Magpie","Black Magpie","Female",{A:["A","_"],B:["B","B"],C:["cchd","_"],D:["D","D"],E:["ej","_"],En:["en","en"],V:["V","V"]});
const magE=Core.phenotypePairs(magpie,"E").map(p=>p.join("/"));
assert.ok(magE.length>0&&magE.every(x=>x==="ej/ej"||x==="ej/e"));
assert.ok(Core.phenotypePairs(magpie,"C").every(p=>!p.includes("C")));
const harl=rabbit("har","Harlequin","Black Harlequin","Male",{A:["A","_"],B:["B","B"],C:["C","_"],D:["D","D"],E:["ej","_"],En:["en","en"],V:["V","V"]});
assert.ok(Core.phenotypePairs(harl,"E").every(p=>["ej/ej","ej/e"].includes(p.join("/"))));
const patternResult=Core.analyzePairing(harl,magpie,{animals:[harl,magpie]});
assert.ok(patternResult.possibleOffspringColors.some(o=>/Harlequin|Magpie/.test(o.name)));

// Recessive families only appear when both parents can supply required alleles.
const cleanBlack1=rabbit("c1","Clean black 1","Black","Male",knownBase);
const cleanBlack2=rabbit("c2","Clean black 2","Black","Female",knownBase);
result=Core.analyzePairing(cleanBlack1,cleanBlack2,{animals:[cleanBlack1,cleanBlack2]});
assert.ok(!result.possibleOffspringColors.some(o=>/Chocolate|Lilac/.test(o.name)));
assert.ok(result.currentlyExcluded.some(o=>o.name==="Chocolate family"));
assert.ok(result.currentlyExcluded.some(o=>o.name==="Dilute family"));

const lilac1=rabbit("l1","Lilac 1","Lilac","Male",{...knownBase,B:["b","b"],D:["d","d"]});
const lilac2=rabbit("l2","Lilac 2","Lilac","Female",{...knownBase,B:["b","b"],D:["d","d"]});
result=Core.analyzePairing(lilac1,lilac2,{animals:[lilac1,lilac2]});
assert.ok(result.possibleOffspringColors.some(o=>o.name==="Lilac"&&o.minProbability===1&&o.maxProbability===1));

const rew1=rabbit("r1","REW 1","Red Eyed White (REW)","Male",{...knownBase,C:["c","c"]});
const rew2=rabbit("r2","REW 2","Red Eyed White (REW)","Female",{...knownBase,C:["c","c"]});
result=Core.analyzePairing(rew1,rew2,{animals:[rew1,rew2]});
assert.ok(result.possibleOffspringColors.some(o=>o.name==="REW"&&o.maxProbability===1));

// Vienna and Broken remain separate Mendelian loci.
function v(id,pair,sex){return rabbit(id,id,"Black",sex,{...knownBase,V:pair})}
for(const [a,b,expected] of [
  [["V","V"],["V","V"],[1,0,0]],
  [["V","V"],["V","v"],[.5,.5,0]],
  [["V","v"],["V","v"],[.25,.5,.25]],
  [["V","v"],["v","v"],[0,.5,.5]],
  [["v","v"],["v","v"],[0,0,1]]
]){const p1=v("va",a,"Male"),p2=v("vb",b,"Female"),r=Core.analyzePairing(p1,p2,{animals:[p1,p2]}),vRange=r.locusPredictions.V;const get=t=>vRange.outcomes.find(o=>o.alleles.join("/")===t)?.minProbability||0;assert.deepEqual([get("V/V"),get("V/v"),get("v/v")],expected)}
const broken=rabbit("br","Broken","Broken Black","Male",{...knownBase,En:["En","en"]});
const solid=rabbit("so","Solid","Black","Female",knownBase);
result=Core.analyzePairing(broken,solid,{animals:[broken,solid]});
assert.ok(result.possibleOffspringColors.some(o=>/^Broken Black$/.test(o.name)));
assert.ok(result.possibleOffspringColors.some(o=>/^Black$/.test(o.name)));

// Contradiction detection does not silently alter breeder-entered records.
const impossibleBlue=rabbit("bad","Bad blue","Blue","Male",{...knownBase,D:["D","D"]});
assert.ok(Core.directConflict(impossibleBlue).some(c=>c.locus==="D"));

// Pedigree evidence weakens by unproven transmission depth.
const carrierParent=rabbit("p","Carrier parent","Black","Male",{...knownBase,B:["B","b"]});
const child=rabbit("ch","Child","Black","Female",knownBase,{sireId:"p"});
const grand=rabbit("g","Grand child","Black","Female",knownBase,{sireId:"ch"});
const great=rabbit("gg","Great grand child","Black","Female",knownBase,{sireId:"g"});
const fam=[carrierParent,child,grand,great];
const ep=Core.ancestorCarrierEstimate(child,fam,"B","b").estimate;
const eg=Core.ancestorCarrierEstimate(grand,fam,"B","b").estimate;
const egg=Core.ancestorCarrierEstimate(great,fam,"B","b").estimate;
assert.ok(ep>eg&&eg>egg);

// Mate-aware offspring inference: bb offspring proves b from each recorded parent; Japanese is not falsely assigned when either could supply it.
const pa=rabbit("pa","Parent A","Black","Male",{...knownBase,B:["B","_"]});
const pb=rabbit("pb","Parent B","Black","Female",{...knownBase,B:["B","_"]});
const chocolateKit=rabbit("kit","Chocolate kit","Chocolate","Female",{...knownBase,B:["b","b"]},{sireId:"pa",damId:"pb"});
const off=Core.offspringEvidenceMateAware(pa,[pa,pb,chocolateKit]);
assert.ok(off.some(e=>e.locus==="B"&&e.allele==="b"&&e.status==="Proven by Offspring"));

// Help and release shell.
const releaseSource=fs.readFileSync(path.join(__dirname,"..","herdharbor-release-v1.5.1.js"),"utf8");
assert.match(releaseSource,/https:\/\/herdharbor\.com\/how-to\//);
assert.match(releaseSource,/Open HerdHarbor How-To Center/);

console.log("HerdHarbor Alpha v1.5.1 rabbit genetics + selector tests passed");
