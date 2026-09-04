"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const Standards=require("../standards-registry-v1.7.0.js");
global.HerdHarborStandardsV170=Standards;
const Public=require("../standards-public-reference-v1.7.0.js");
const Youth=require("../shows-youth-guides-v1.7.0.js");

test("ARBA public-reference layer exposes useful verified coverage and official sources",()=>{
  const holland=Public.coverageFor("Holland Lop");
  assert.equal(holland.breedName,"Holland Lop");
  assert.equal(holland.classModel,"4-class");
  assert.equal(holland.publicMaxWeightLb,4);
  assert.ok(holland.recognizedVarietyCount>=2);
  assert.ok(holland.workingStandardCount>=2);
  assert.match(Public.SOURCES.showRules,/^https:\/\/arba\.net\//);
  assert.match(Public.SOURCES.corrections,/^https:\/\/arba\.net\//);
  assert.ok(Public.PUBLIC_SHOW_RULE_SUMMARIES.some(x=>/4-H, FFA/i.test(x)));
});

test("current ARBA corrections are surfaced as structured summaries",()=>{
  const english=Public.correctionsFor("English Angora");
  const brun=Public.correctionsFor("Argente Brun");
  assert.ok(english.some(x=>/Broken English Angora/i.test(x.summary)));
  assert.ok(brun.some(x=>/Commercial Normal Fur/i.test(x.summary)));
  [...english,...brun].forEach(x=>assert.equal(x.source,Public.SOURCES.corrections));
});

test("Kentucky 4-H guide is a summarized official-source reference",()=>{
  const guide=Youth.GUIDES.kentucky4h;
  assert.equal(guide.sourceYear,2025);
  assert.match(guide.officialSource,/4-h\.ca\.uky\.edu/);
  assert.ok(guide.showmanshipClasses.includes("401 A Junior Showmanship"));
  assert.ok(guide.showmanshipClasses.includes("401 B Senior Showmanship"));
  assert.ok(guide.entryChecks.some(x=>/left-ear tattoo/i.test(x)));
  assert.ok(guide.showDay.some(x=>/Best 4-Class/i.test(x)));
});

test("FFA guide is intentionally configurable instead of inventing a national rabbit rulebook",()=>{
  const guide=Youth.GUIDES.ffa;
  assert.match(guide.officialSource,/kyffa\.org/);
  assert.ok(guide.notes.some(x=>/does not use one universal national rabbit-show rulebook/i.test(x)));
  assert.ok(guide.notes.some(x=>/actual current fair rules/i.test(x)||/current fair rules/i.test(x)));
  assert.ok(Youth.SHOWMANSHIP_PRACTICE.length>=6);
});

test("v1.7.0 build and offline shell load the new reference-guide assets without changing release identity",()=>{
  const build=fs.readFileSync(path.join(__dirname,"..","herdharbor-build.js"),"utf8");
  const sw=fs.readFileSync(path.join(__dirname,"..","service-worker.js"),"utf8");
  for(const asset of ["standards-public-reference-v1.7.0.js","shows-youth-guides-v1.7.0.js","reference-guides-v1.7.0.css"]){
    assert.ok(build.includes(asset),`build missing ${asset}`);
    assert.ok(sw.includes(asset),`service worker missing ${asset}`);
  }
  assert.match(build,/buildId: "arba-standards-1"/);
  assert.match(sw,/herdharbor-shell-v1\.7\.0-alpha-arba-standards-1/);
});
