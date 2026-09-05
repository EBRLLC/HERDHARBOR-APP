"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const Standards=require("../standards-registry-v1.7.0.js");

test("ARBA v1.7.0 registry indexes all 53 recognized rabbit breeds without licensed SOP prose",()=>{
  const org=Standards.organization("arba");
  assert.equal(org.optional,true);
  assert.equal(org.recognizedBreedCount,53);
  const rows=Standards.list({species:"Rabbit"});
  assert.equal(rows.length,53);
  assert.ok(rows.some(x=>x.breedName==="Mini Californian"));
  rows.forEach(row=>{
    assert.equal(row.licensing.verbatimLicensed,false);
    assert.ok(Array.isArray(row.recognizedVarieties));
    assert.ok(Array.isArray(row.sections));
    assert.ok("classModel" in row);
    assert.ok("publicMaxWeightLb" in row);
    assert.ok(Array.isArray(row.faults));
    assert.ok(Array.isArray(row.disqualifications));
    assert.ok(Array.isArray(row.exactWeightRules));
  });
});

test("working standards remain distinct from recognized varieties and are not BOB/BIS eligible",()=>{
  const rows=Standards.working();
  assert.ok(rows.length>=20);
  assert.ok(rows.some(x=>x.breedName==="Holland Lop"&&x.variety==="Fox"));
  rows.forEach(x=>{assert.equal(x.status,"working");assert.equal(x.exhibitionEligible,true);assert.equal(x.eligibleForBOB,false);assert.equal(x.eligibleForBIS,false);});
});

test("evaluation fails closed when breed or measurements are missing",()=>{
  const missing=Standards.evaluate({breedName:"Unknown Rabbit"});
  assert.equal(missing.available,false);
  const holland=Standards.evaluate({breedName:"Holland Lop",sex:"Doe",dob:"2026-01-01",onDate:"2026-09-01",variety:"Solid Pattern"});
  assert.equal(holland.available,true);
  assert.equal(holland.weight.status,"missing");
  assert.ok(holland.missingMeasurements.includes("Current weight"));
  assert.match(holland.disclaimer,/does not replace/i);
});

test("Mini Rex verified class-sex rules evaluate weight and ear length deterministically",()=>{
  const ok=Standards.evaluate({breedName:"Mini Rex",sex:"Buck",dob:"2025-12-01",onDate:"2026-09-01",weightLb:4,variety:"Castor",earLengthIn:3.25});
  assert.equal(ok.ageClass.className,"Senior");assert.equal(ok.weight.status,"within-standard-weight");assert.equal(ok.variety.status,"recognized");assert.equal(ok.possibleDisqualifications.length,0);
  const flagged=Standards.evaluate({breedName:"Mini Rex",sex:"Buck",dob:"2025-12-01",onDate:"2026-09-01",weightLb:4.5,variety:"Castor",earLengthIn:3.75});
  assert.equal(flagged.weight.status,"overweight");assert.ok(flagged.possibleDisqualifications.length>=2);
});

test("working variety is labeled exhibition-only rather than recognized",()=>{
  const result=Standards.evaluate({breedName:"Holland Lop",sex:"Doe",dob:"2025-01-01",onDate:"2026-09-01",weightLb:3.5,variety:"Fox"});
  assert.equal(result.variety.status,"working");assert.ok(result.possibleFaults.some(x=>/working-standard/i.test(x)));
});

test("pairing intelligence reports repeated standards issues without converting them to genetics claims",()=>{
  const s={animals:[{id:"buck",name:"Buck",species:"Rabbit",breed:"Mini Rex",sex:"Buck"},{id:"doe",name:"Doe",species:"Rabbit",breed:"Mini Rex",sex:"Doe"}],standardsEvaluations:[{animalId:"buck",evaluatedAt:"2026-08-01",result:{weight:{status:"overweight"},possibleDisqualifications:["weight"]}},{animalId:"buck",evaluatedAt:"2026-08-15",result:{weight:{status:"overweight"},possibleDisqualifications:["weight"]}}],showEntries:[],showResults:[],showAwards:[]};
  const out=Standards.pairingInsights(s,"buck","doe");
  assert.ok(out.messages.some(x=>/repeated standards-evaluation weight flags/i.test(x)));assert.match(out.disclaimer,/informational breeder reference/i);
});

test("1.7.0 UI integrates Standards browser, optional settings, animal evaluation, Shows, and pair intelligence",()=>{
  const ui=fs.readFileSync(path.join(__dirname,"..","standards-ui-v1.7.0.js"),"utf8");
  const build=fs.readFileSync(path.join(__dirname,"..","herdharbor-build.js"),"utf8");
  const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
  assert.match(ui,/data-route=['\"]standards/);assert.match(ui,/Evaluate Against Standard/);assert.match(ui,/arbaStandardsEnabled/);
  for(const field of ["standardEdition","arbaLeg","arbaPoints","arbaBOV","arbaBOSV","arbaBOB","arbaBOSB","arbaBIS","arbaRIS","standardsObservations"])assert.ok(ui.includes(field),`missing ${field}`);
  assert.match(ui,/HerdHarborBreedingPairHotfix/);assert.match(ui,/Standards\.pairingInsights/);assert.match(ui,/does not replace an ARBA judge/i);
  assert.match(ui,/const live=app\(\)\?\.getState\?\.\(\)/);
  assert.match(ui,/api\.commitState\(s\)/);
  assert.match(build,/standards-ui-v1\.7\.0\.js\?v=1\.7\.1/);
  assert.match(html,/window\.HerdHarborApp = Object\.freeze/);
  assert.match(html,/herdharbor:app-ready/);
});
