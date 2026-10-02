"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const pedigree = require("../herdharbor-pedigree-platform.js");

function animal(id, sireId = "", damId = "", extra = {}) {
  return { id, name: id, sireId, damId, ...extra };
}

test("canonical pedigree engine resolves a complete deterministic four-generation graph", () => {
  const animals = [
    animal("root", "s1", "d1"),
    animal("s1", "ss", "sd", { sex: "Male" }),
    animal("d1", "ds", "dd", { sex: "Female" }),
    animal("ss", "sss", "ssd"),
    animal("sd", "sds", "sdd"),
    animal("ds", "dss", "dsd"),
    animal("dd", "dds", "ddd"),
    animal("sss"), animal("ssd"), animal("sds"), animal("sdd"),
    animal("dss"), animal("dsd"), animal("dds"), animal("ddd")
  ];
  const first = pedigree.buildPedigreeGraph({ animals, rootId: "root", generations: 4 });
  const second = pedigree.buildPedigreeGraph({ animals: animals.slice().reverse(), rootId: "root", generations: 4 });
  assert.equal(first.nodes.length, 15);
  assert.equal(first.coverage.knownAncestorCount, 14);
  assert.equal(first.coverage.expectedAncestorCount, 14);
  assert.equal(first.coverage.percent, 100);
  assert.deepEqual(first.nodes.map((n) => [n.path, n.identityId]), second.nodes.map((n) => [n.path, n.identityId]));
});

test("incomplete pedigrees preserve unknown positions without fabricating animals", () => {
  const graph = pedigree.buildPedigreeGraph({
    animals: [animal("root", "sire", ""), animal("sire")],
    rootId: "root",
    generations: 3
  });
  assert.equal(graph.nodes.length, 7);
  assert.equal(graph.coverage.knownAncestorCount, 1);
  assert.equal(graph.coverage.expectedAncestorCount, 6);
  assert.equal(pedigree.nodeAt(graph, "root.dam").known, false);
  assert.equal(pedigree.nodeAt(graph, "root.dam").identityId, "");
});

test("repeated ancestors are detected by identity instead of name", () => {
  const animals = [
    animal("root", "sire", "dam"),
    animal("sire", "shared", "sireDam"),
    animal("dam", "shared", "damDam"),
    animal("shared", "", "", { name: "Same Name" }),
    animal("sireDam", "", "", { name: "Same Name" }),
    animal("damDam")
  ];
  const graph = pedigree.buildPedigreeGraph({ animals, rootId: "root", generations: 3 });
  assert.deepEqual(graph.repeatedAncestors, [{
    identityId: "shared",
    count: 2,
    paths: ["root.dam.sire", "root.sire.sire"]
  }]);
});

test("one ancestor appearing in several positions records every occurrence", () => {
  const animals = [
    animal("root", "a", "b"),
    animal("a", "x", "x"),
    animal("b", "x", "x"),
    animal("x")
  ];
  const graph = pedigree.buildPedigreeGraph({ animals, rootId: "root", generations: 3 });
  assert.equal(graph.repeatedAncestors[0].identityId, "x");
  assert.equal(graph.repeatedAncestors[0].count, 4);
  assert.equal(pedigree.occurrencesOf(graph, "x").length, 4);
});

test("missing sire or dam and malformed references are safe", () => {
  const graph = pedigree.buildPedigreeGraph({
    animals: [animal("root", "missing-parent", "")],
    rootId: "root",
    generations: 2
  });
  assert.equal(pedigree.nodeAt(graph, "root.sire").missingReference, true);
  assert.equal(pedigree.nodeAt(graph, "root.dam").missingReference, false);
  assert.deepEqual(graph.problems, [{ type: "missing-reference", path: "root.sire", identityId: "missing-parent" }]);
});

test("circular references terminate and are reported", () => {
  const graph = pedigree.buildPedigreeGraph({
    animals: [animal("a", "b", ""), animal("b", "a", "")],
    rootId: "a",
    generations: 8
  });
  assert.ok(graph.nodes.length < 40);
  assert.ok(graph.problems.some((problem) => problem.type === "cycle" && problem.identityId === "a"));
});

test("configurable depth has stable sire-before-dam ordering", () => {
  const animals = [animal("root", "s", "d"), animal("s"), animal("d")];
  const shallow = pedigree.buildPedigreeGraph({ animals, rootId: "root", generations: 2 });
  const deep = pedigree.buildPedigreeGraph({ animals, rootId: "root", generations: 5 });
  assert.deepEqual(shallow.nodes.map((node) => node.path), ["root", "root.sire", "root.dam"]);
  assert.equal(deep.nodes.length, 31);
});
