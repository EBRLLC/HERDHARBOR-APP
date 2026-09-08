"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const Phase1=require("../genetics-v2-phase1-core-v1.8.2.js");
const Phase2=require("../genetics-v2-phase2-core-v1.8.2.js");
const Core=require("../genetics-v2-phase3-core-v1.8.2.js");

function unknownLoci(){const loci={};for(const key of Phase1.DISPLAY_LOCI)loci[key]={alleles:["_","_"],source:"",status:"unknown"};return loci;}
function rabbit(id,name,sex,color="",extra={}){return{id,name,sex,color,species:"Rabbit",breed:"Holland Lop",status:"Active",genetics:{loci:unknownLoci()},...extra};}
function locus(animal,key,alleles,source="offspring"){animal.genetics.loci[key]={alleles,source,evidenceType:source,status:"confirmed"};return animal;}
function baseLitter(id,breedingId,damId,sireId,offspringIds,birthDate="2026-09-07"){return{id,breedingId,damId,sireId,birthDate,bornAlive:String(offspringIds.length),offspringIds};}

test("phase 3 turns a recorded blue kit into exact litter-linked learning without another genetics form",()=>{
  const dam=rabbit("dam","Judy","Female","Black");dam.genetics.breedingGoal={goalId:"dilute"};
  const sire=rabbit("sire","Patches","Male","Black");
  const kit=rabbit("kit","Judy Kit 1","Unknown","Blue",{damId:"dam",sireId:"sire",sourceBirthId:"l1"});
  const state={animals:[dam,sire,kit],litters:[baseLitter("l1","b1","dam","sire",["kit"])],breedings:[{id:"b1",damId:"dam",sireId:"sire",litterId:"l1"}]};
  const learned=Core.processState(state,"2026-09-08T01:00:00Z");
  const next=learned.state,summary=Core.litterLearningSummary(next,"l1");
  assert.ok(learned.changed>=2);
  assert.deepEqual(next.animals.find(a=>a.id==="dam").genetics.loci.D.alleles,["D","d"]);
  assert.deepEqual(next.animals.find(a=>a.id==="sire").genetics.loci.D.alleles,["D","d"]);
  assert.equal(summary.proofs.filter(row=>row.locus==="D").length,2);
  assert.ok(summary.proofs.every(row=>row.litterId==="l1"&&row.breedingId==="b1"));
  assert.equal(summary.progress.goal.id,"dilute");
  assert.equal(summary.progress.targetCount,1);
  assert.equal(summary.progress.status,"achieved");
});

test("a lilac offspring records goal progress at both required loci",()=>{
  const dam=rabbit("dam","Doe","Female","Black");dam.genetics.breedingGoal={goalId:"lilac"};
  const sire=rabbit("sire","Buck","Male","Black");
  const kit=rabbit("kit","Lilac Kit","Unknown","Lilac",{damId:"dam",sireId:"sire",sourceBirthId:"l1"});
  const state={animals:[dam,sire,kit],litters:[baseLitter("l1","b1","dam","sire",["kit"])],breedings:[{id:"b1",litterId:"l1"}]};
  const learned=Core.processState(state,"2026-09-08T01:05:00Z"),progress=Core.goalProgressForLitter(learned.state,"l1","lilac");
  assert.equal(progress.targetCount,1);
  assert.equal(progress.status,"achieved");
  const proofs=Core.proofRowsForLitter(learned.state,"l1");
  assert.ok(proofs.some(row=>row.locus==="B"&&row.allele==="b"));
  assert.ok(proofs.some(row=>row.locus==="D"&&row.allele==="d"));
});

test("a litter with no recessive target never creates negative non-carrier evidence",()=>{
  const dam=rabbit("dam","Doe","Female","Black");dam.genetics.breedingGoal={goalId:"dilute"};
  const sire=rabbit("sire","Buck","Male","Black");
  const kits=[1,2,3,4].map(n=>rabbit(`k${n}`,`Black Kit ${n}`,"Unknown","Black",{damId:"dam",sireId:"sire",sourceBirthId:"l1"}));
  const state={animals:[dam,sire,...kits],litters:[baseLitter("l1","b1","dam","sire",kits.map(k=>k.id))],breedings:[{id:"b1",litterId:"l1"}]};
  const learned=Core.processState(state,"2026-09-08T01:10:00Z"),summary=Core.litterLearningSummary(learned.state,"l1");
  const damAfter=learned.state.animals.find(a=>a.id==="dam");
  assert.equal((damAfter.genetics.evidence||[]).filter(e=>e.source==="offspring"&&e.locus==="D").length,0);
  assert.equal(summary.progress.targetCount,0);
  assert.match(summary.rule,/never marks.*non-carrier/i);
});

test("offspring evidence history counts corroborating offspring and distinct litters without inflating certainty",()=>{
  const dam=rabbit("dam","Judy","Female","Black");
  const sire1=rabbit("s1","Buck 1","Male","Black"),sire2=rabbit("s2","Buck 2","Male","Black");
  const k1=rabbit("k1","Blue One","Unknown","Blue",{damId:"dam",sireId:"s1",sourceBirthId:"l1"});
  const k2=rabbit("k2","Blue Two","Unknown","Blue",{damId:"dam",sireId:"s2",sourceBirthId:"l2"});
  const state={animals:[dam,sire1,sire2,k1,k2],litters:[baseLitter("l1","b1","dam","s1",["k1"]),baseLitter("l2","b2","dam","s2",["k2"],"2026-10-10")],breedings:[{id:"b1",litterId:"l1"},{id:"b2",litterId:"l2"}]};
  const learned=Core.processState(state,"2026-10-11T01:00:00Z"),history=Core.animalLearningHistory(learned.state,"dam");
  const d=history.conclusions.find(row=>row.locus==="D"&&row.allele==="d");
  assert.ok(d);
  assert.equal(d.supportingOffspring,2);
  assert.equal(d.supportingLitters,2);
  assert.equal(history.litterCount,2);
});

test("what the litter teaches feeds directly back into Phase 2 mate ranking",()=>{
  const doe=rabbit("doe","Black Doe","Female","Black");doe.genetics.breedingGoal={goalId:"dilute"};
  const proofSire=rabbit("proof","Proof Sire","Male","Black");
  const blueKit=rabbit("kit","Blue Kit","Unknown","Blue",{damId:"doe",sireId:"proof",sourceBirthId:"l1"});
  const blueMate=locus(rabbit("blue","Blue Buck","Male","Blue"),"D",["d","d"],"offspring");
  const denseMate=locus(rabbit("dense","Dense Buck","Male","Black"),"D",["D","D"],"offspring");
  const state={animals:[doe,proofSire,blueKit,denseMate,blueMate],litters:[baseLitter("l1","b1","doe","proof",["kit"])],breedings:[{id:"b1",litterId:"l1"}]};
  const before=Phase2.pairGoalProbability(doe,blueMate,"dilute");assert.equal(before.fullyKnown,false);
  const learned=Core.processState(state,"2026-09-08T01:20:00Z"),ranked=Phase2.rankCandidates(learned.state,"doe","dilute");
  const blue=ranked.candidates.find(row=>row.mateId==="blue");
  assert.equal(blue.probabilityKnown,true);
  assert.equal(blue.probability,0.5);
  assert.ok(ranked.candidates.indexOf(blue)<ranked.candidates.findIndex(row=>row.mateId==="dense"));
});

console.log("Genetics V2 Phase 3 offspring learning tests passed");