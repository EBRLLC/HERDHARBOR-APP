"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const runtime=fs.readFileSync(path.resolve(__dirname,"..","breeding-litter-runtime-v1.8.3.js"),"utf8");

test("breeding planner presents genetics and pedigree engines as distinct controls",()=>{
 assert.match(runtime,/Genetics and pedigree relationship are separate calculations/);
 assert.match(runtime,/id="open-genetics-prediction">Genetics Prediction/);
 assert.match(runtime,/HerdHarborBreedingIntelligence\?\.openPairAnalysis/);
 assert.match(runtime,/calculatePedigreeRelationship/);
});

test("breeding planner shows all factual pedigree metrics after selecting a pair",()=>{
 ["Pedigree relationship","Projected offspring Pedigree COI","Shared ancestors","Pedigree completeness","Generations analyzed","View Linebreeding Analysis"].forEach((label)=>assert.ok(runtime.includes(label),label));
 assert.match(runtime,/It is not genomic COI/);
});

test("relationship panel has no breeding verdict language",()=>{
 const start=runtime.indexOf("const renderRelationshipAnalysis");
 const end=runtime.indexOf('$("#cancel-modal")',start);
 const block=runtime.slice(start,end).toLowerCase();
 ["safe","unsafe"," good "," bad "].forEach((word)=>assert.equal(block.includes(word),false,word));
});
