"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const pedigree=require("../herdharbor-pedigree-platform.js");
const A=(id,sireId="",damId="")=>({id,name:id,sireId,damId});
const animals=[A("a","p1","u1"),A("b","p2","u2"),A("p1","g1","g2"),A("p2","g1","g2"),A("g1"),A("g2"),A("u1"),A("u2")];

test("relationship-analysis mode marks every shared identity occurrence with text and structural markers",()=>{
 const rendered=pedigree.renderLinebreedingAnalysis({animals,leftId:"a",rightId:"b",generations:4});
 assert.match(rendered.html,/data-mode="relationshipAnalysis"/);
 assert.match(rendered.html,/data-shared-ancestor="true"/);
 assert.match(rendered.html,/Shared ancestor/);
 assert.match(rendered.html,/data-focus-shared="g1"/);
 assert.match(rendered.html,/data-focus-shared="g2"/);
});

test("linebreeding output contains both pedigrees, closest-path metadata, and distinct metrics",()=>{
 const rendered=pedigree.renderLinebreedingAnalysis({animals,leftId:"a",rightId:"b",generations:4});
 assert.match(rendered.html,/>a<|>A</);
 assert.match(rendered.html,/>b<|>B</);
 assert.match(rendered.html,/Closest paths:/);
 assert.match(rendered.html,/Pedigree relationship/);
 assert.match(rendered.html,/Projected offspring Pedigree COI/);
});

test("shared ancestry is not communicated by color alone",()=>{
 const css=fs.readFileSync(path.resolve(__dirname,"..","herdharbor-breeder-platform.css"),"utf8");
 assert.match(css,/\.hh-pedigree-shared\{border-width:2px/);
 assert.match(css,/\.hh-pedigree-shared-marker/);
 assert.match(css,/\.hh-pedigree-occurrence-active\{outline:/);
 assert.match(pedigree.renderLinebreedingAnalysis({animals,leftId:"a",rightId:"b",generations:4}).html,/&#9670; Shared ancestor/);
});
