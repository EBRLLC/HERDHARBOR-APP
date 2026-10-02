"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const pedigree=require("../herdharbor-pedigree-platform.js");

const animals=[
 {id:"a",name:"A",sireId:"as",damId:"ad"},
 {id:"b",name:"B",sireId:"bs",damId:"bd"},
 {id:"as",name:"AS",sireId:"shared",damId:"x"},
 {id:"ad",name:"AD"},
 {id:"bs",name:"BS"},
 {id:"bd",name:"BD",sireId:"shared",damId:"y"},
 {id:"shared",name:"Common"},
 {id:"x",name:"Duplicate Name"},
 {id:"y",name:"Duplicate Name"}
];

test("shared ancestor analysis records every valid identity-based occurrence path",()=>{
 const result=pedigree.analyzeSharedAncestors({animals,leftId:"a",rightId:"b",generations:4});
 assert.equal(result.sharedAncestorCount,1);
 assert.equal(result.sharedAncestors[0].identityId,"shared");
 assert.equal(result.sharedAncestors[0].closestPath.leftPath,"root.sire.sire");
 assert.equal(result.sharedAncestors[0].closestPath.rightPath,"root.dam.sire");
 assert.equal(result.sharedAncestors[0].occurrencePairs.length,1);
});

test("duplicate names do not become shared ancestors without shared identity",()=>{
 const result=pedigree.analyzeSharedAncestors({animals,leftId:"a",rightId:"b",generations:4});
 assert.ok(!result.sharedAncestors.some((entry)=>entry.identityId==="x" || entry.identityId==="y"));
});

test("analysis returns pedigree completeness for both animals",()=>{
 const result=pedigree.analyzePairing(animals,"a","b",4);
 assert.equal(result.coverage.left.expectedAncestorCount,14);
 assert.equal(result.coverage.right.expectedAncestorCount,14);
 assert.ok(result.coverage.left.percent>=0 && result.coverage.left.percent<=100);
});

test("animal and breeding UIs expose the planned comparison entry points without COI in Phase 8",()=>{
 const root=path.resolve(__dirname,"..");
 const animalRuntime=fs.readFileSync(path.join(root,"animal-profile-runtime-v1.8.3.js"),"utf8");
 const breedingRuntime=fs.readFileSync(path.join(root,"breeding-litter-runtime-v1.8.3.js"),"utf8");
 assert.match(animalRuntime,/Compare With Another Animal/);
 assert.match(breedingRuntime,/Analyze Pairing/);
 assert.doesNotMatch(breedingRuntime,/Projected offspring Pedigree COI/);
});
