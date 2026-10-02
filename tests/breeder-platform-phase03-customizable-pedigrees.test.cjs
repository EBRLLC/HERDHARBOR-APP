"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const pedigree = require("../herdharbor-pedigree-platform.js");

test("custom pedigree configuration supports 3, 4, and 5 generation views", () => {
  assert.equal(pedigree.normalizePedigreeConfig({ generations:3 }).generations, 3);
  assert.equal(pedigree.normalizePedigreeConfig({ generations:4 }).generations, 4);
  assert.equal(pedigree.normalizePedigreeConfig({ generations:5 }).generations, 5);
  assert.equal(pedigree.normalizePedigreeConfig({ generations:99 }).generations, 5);
});

test("initial HerdHarbor templates are available", () => {
  assert.deepEqual(Object.values(pedigree.PEDIGREE_TEMPLATES).map((item) => item.label), [
    "Classic","Minimal","Professional","Buyer","Rabbitry Branded"
  ]);
});

test("photos off removes photo fields and density is normalized", () => {
  const config = pedigree.normalizePedigreeConfig({
    templateId:"professional",
    photos:false,
    density:"compact",
    rootFields:["name","photoData"],
    ancestorFields:["name","photoData"]
  });
  assert.deepEqual(config.rootFields, ["name"]);
  assert.deepEqual(config.ancestorFields, ["name"]);
  assert.equal(config.density, "compact");
});

test("deeper unavailable ancestry remains unknown rather than invented", () => {
  const graph = pedigree.buildPedigreeGraph({ animals:[{ id:"r", name:"Root" }], rootId:"r", generations:5 });
  const plan = pedigree.pedigreeRenderPlan(graph, { generations:5, showUnknown:true }, "privateHerd");
  assert.equal(plan.graph.nodes.length, 31);
  assert.equal(plan.graph.nodes.filter((node) => node.known).length, 1);
});
