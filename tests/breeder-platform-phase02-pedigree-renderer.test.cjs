"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const pedigree = require("../herdharbor-pedigree-platform.js");

const animals = [
  { id:"r", name:"Root", sex:"Female", sireId:"s", damId:"d", notes:"PRIVATE_NOTE", contact:"PRIVATE_CONTACT" },
  { id:"s", name:"Sire", sex:"Male", breeder:"Blue Barn", genotype:"Aa Bb", registrationNumber:"R1" },
  { id:"d", name:"Dam", sex:"Female", breeder:"Green Barn", accountData:"PRIVATE_ACCOUNT" }
];
const graph = pedigree.buildPedigreeGraph({ animals, rootId:"r", generations:2 });

test("unified renderer exposes explicit rendering modes", () => {
  assert.deepEqual(Object.keys(pedigree.RENDER_MODES), [
    "privateHerd","printablePreview","publicMarketplace","transferPreview","relationshipAnalysis"
  ]);
});

test("public Marketplace mode cannot render genotype or unrelated private fields", () => {
  const html = pedigree.renderPedigree(graph, {
    mode:"publicMarketplace",
    fields:["name","rabbitry","registrationNumber","genotype","notes","contact","accountData"]
  });
  assert.match(html, /data-mode="publicMarketplace"/);
  assert.match(html, /Registration/);
  assert.doesNotMatch(html, /Genotype/);
  assert.doesNotMatch(html, /PRIVATE_NOTE|PRIVATE_CONTACT|PRIVATE_ACCOUNT/);
});

test("private renderer supports compact native expansion and expanded previews", () => {
  const compact = pedigree.renderPedigree(graph, { mode:"privateHerd", expanded:false });
  const expanded = pedigree.renderPedigree(graph, { mode:"privateHerd", expanded:true });
  assert.match(compact, /<details class="hh-pedigree-details">/);
  assert.match(expanded, /<details class="hh-pedigree-details" open>/);
  assert.match(expanded, /Genotype/);
});

test("unknown ancestors remain visible as explicit unknown cards", () => {
  const deep = pedigree.buildPedigreeGraph({ animals:[animals[0]], rootId:"r", generations:2 });
  const html = pedigree.renderPedigree(deep, { mode:"privateHerd" });
  assert.match(html, /Unavailable ancestor/);
});
