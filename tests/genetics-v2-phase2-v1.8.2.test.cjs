"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const Core=require(path.join(root,"genetics-v2-phase2-core-v1.8.2.js"));
const locus=(alleles,source="offspring",status="confirmed")=>({alleles,source,evidenceType:source,status});
const rabbit=(id,name,sex,loci={},extra={})=>({id,name,sex,species:"Rabbit",breed:"Holland Lop",status:"Active",genetics:{loci},...extra});

assert.equal(Core.VERSION,"2.0.0-phase2");
assert.ok(Core.GOALS.some(g=>g.id==="dilute"));
assert.ok(Core.GOALS.some(g=>g.id==="lilac"));
assert.ok(Core.GOALS.some(g=>g.id==="broken"));

// Known D/d x d/d: 50% d/d. Strong herd evidence means no test is required.
{
  const doe=rabbit("doe","Black Doe","Female",{D:locus(["D","d"],"offspring")});
  const buck=rabbit("buck","Blue Buck","Male",{D:locus(["d","d"],"phenotype","inferred")});
  // Use pedigree for the blue buck here so both sides clear the strong-evidence threshold.
  buck.genetics.loci.D={...buck.genetics.loci.D,source:"pedigree",evidenceType:"pedigree",status:"confirmed"};
  const result=Core.pairGoalProbability(doe,buck,"dilute");
  assert.equal(result.fullyKnown,true);
  assert.equal(result.probability,0.5);
  assert.equal(Core.evidenceRoute(doe,buck,result).key,"no-test");
}

// An unresolved dense rabbit bred to a d/d tester can reveal carrier status through offspring.
{
  const doe=rabbit("u","Unknown-D Doe","Female",{});
  const buck=rabbit("tester","Blue Tester","Male",{D:locus(["d","d"],"offspring")});
  const result=Core.pairGoalProbability(doe,buck,"dilute");
  assert.equal(result.fullyKnown,false);
  assert.equal(result.probability,null);
  assert.equal(result.proofOpportunities.length,1);
  const route=Core.evidenceRoute(doe,buck,result);
  assert.equal(route.key,"proof-breed");
  assert.match(route.label,/Proof breeding/i);
  assert.match(route.text,/does not prove/i);
}

// Multi-locus lilac target: 50% b/b x 50% d/d = 25% tracked target probability.
{
  const doe=rabbit("l1","Doe","Female",{B:locus(["B","b"],"pedigree"),D:locus(["D","d"],"offspring")});
  const buck=rabbit("l2","Buck","Male",{B:locus(["b","b"],"offspring"),D:locus(["d","d"],"offspring")});
  const result=Core.pairGoalProbability(doe,buck,"lilac");
  assert.equal(result.fullyKnown,true);
  assert.equal(result.loci.length,2);
  assert.equal(result.probability,0.25);
}

// Broken x broken: 50% En/en target, with 25% En/En tracked caution.
{
  const doe=rabbit("br1","Broken Doe","Female",{En:locus(["En","en"],"offspring")});
  const buck=rabbit("br2","Broken Buck","Male",{En:locus(["En","en"],"offspring")});
  const result=Core.pairGoalProbability(doe,buck,"broken");
  assert.equal(result.probability,0.5);
  assert.equal(result.avoid.known,true);
  assert.equal(result.avoid.probability,0.25);
}

// Incomplete records never get a fabricated percentage; testing remains an optional shortcut.
{
  const doe=rabbit("x1","Doe","Female",{});
  const buck=rabbit("x2","Buck","Male",{});
  const result=Core.pairGoalProbability(doe,buck,"chocolate");
  assert.equal(result.probability,null);
  const route=Core.evidenceRoute(doe,buck,result);
  assert.equal(route.key,"more-evidence");
  assert.match(route.text,/optional shortcut/i);
}

// Ranking favors a known productive path over a known zero-result path.
{
  const doe=rabbit("r0","Doe","Female",{D:locus(["D","d"],"offspring")});
  const blue=rabbit("r1","Blue Buck","Male",{D:locus(["d","d"],"offspring")});
  const dense=rabbit("r2","Dense Buck","Male",{D:locus(["D","D"],"offspring")});
  const ranked=Core.rankCandidates({animals:[doe,dense,blue]},doe.id,"dilute");
  assert.deepEqual(ranked.candidates.map(x=>x.mateId),["r1","r2"]);
  assert.equal(ranked.candidates[0].probability,0.5);
  assert.equal(ranked.candidates[1].probability,0);
}

// Same-sex and non-rabbit records are not recommended as mates.
{
  const doe=rabbit("a","Doe","Female",{D:locus(["D","d"],"offspring")});
  const doe2=rabbit("b","Doe 2","Female",{D:locus(["d","d"],"offspring")});
  const goat={id:"g",name:"Goat",sex:"Male",species:"Goat",status:"Active"};
  assert.equal(Core.rankCandidates({animals:[doe,doe2,goat]},doe.id,"dilute").candidates.length,0);
  assert.equal(Core.rankCandidates({animals:[goat,doe]},goat.id,"dilute").subject,null);
}

// Breeder-facing integration must explicitly keep testing optional and reuse canonical breeding.
{
  const ui=fs.readFileSync(path.join(root,"genetics-v2-phase2-v1.8.2.js"),"utf8");
  const css=fs.readFileSync(path.join(root,"genetics-v2-phase2-v1.8.2.css"),"utf8");
  assert.match(ui,/DNA testing is optional/);
  assert.match(ui,/Breeding can be evidence/);
  assert.match(ui,/data-hh-p2-action=\\?"breeding\\?"/);
  assert.match(ui,/breedingGoal/);
  assert.match(ui,/probabilityKnown/);
  assert.match(css,/hh-gv2p2-candidate/);
}

console.log("Genetics V2 Phase 2 breeder goal planner tests passed");