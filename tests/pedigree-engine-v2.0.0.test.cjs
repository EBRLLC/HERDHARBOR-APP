"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Engine = require("../pedigree-engine-v2.0.0.js");

function completeFourGenerationAnimals() {
  const animals = [{ id: "subject", species: "Rabbit", name: "Subject", sireId: "s", damId: "d" }];
  const levels = [
    ["s", "ss", "sd"], ["d", "ds", "dd"],
    ["ss", "sss", "ssd"], ["sd", "sds", "sdd"],
    ["ds", "dss", "dsd"], ["dd", "dds", "ddd"]
  ];
  for (const [id, sireId, damId] of levels) animals.push({ id, species: "Rabbit", name: id, sireId, damId });
  for (const id of ["sss","ssd","sds","sdd","dss","dsd","dds","ddd"]) {
    animals.push({ id, species: "Rabbit", name: id, sireId: "", damId: "" });
  }
  return animals;
}

test("complete pedigree is deterministic and reports full coverage", () => {
  const animals = completeFourGenerationAnimals();
  const first = Engine.buildGraph({ animals, subjectId: "subject", generations: 4 });
  const second = Engine.buildGraph({ animals, subjectId: "subject", generations: 4 });

  assert.deepEqual(first, second);
  assert.equal(first.nodes.length, 15);
  assert.equal(first.completeness.expectedAncestorSlots, 14);
  assert.equal(first.completeness.knownAncestorSlots, 14);
  assert.equal(first.completeness.coverage, 1);
  assert.equal(first.completeness.percent, 100);
  assert.equal(first.byKey.sireSireSire.animalId, "sss");
  assert.equal(first.byKey.damDamDam.animalId, "ddd");
});

test("incomplete pedigree keeps every requested slot as unknown", () => {
  const graph = Engine.buildGraph({
    animals: [
      { id: "subject", species: "Goat", sireId: "sire", damId: "" },
      { id: "sire", species: "Goat", sireId: "", damId: "" }
    ],
    subjectId: "subject",
    generations: 3
  });

  assert.equal(graph.nodes.length, 7);
  assert.equal(graph.byKey.sire.status, "known");
  assert.equal(graph.byKey.dam.status, "unknown");
  assert.equal(graph.byKey.sireSire.status, "unknown");
  assert.equal(graph.byKey.damDam.status, "unknown");
  assert.equal(graph.completeness.knownAncestorSlots, 1);
  assert.equal(graph.completeness.expectedAncestorSlots, 6);
});

test("missing sire and dam remain explicit unknown positions", () => {
  const graph = Engine.buildGraph({
    animals: [{ id: "subject", sireId: "", damId: "" }],
    subjectId: "subject",
    generations: 2
  });
  assert.equal(graph.byKey.sire.status, "unknown");
  assert.equal(graph.byKey.dam.status, "unknown");
  assert.deepEqual(graph.ancestorIds, {});
});

test("repeated ancestor is preserved in every position and marked after first occurrence", () => {
  const graph = Engine.buildGraph({
    animals: [
      { id: "subject", sireId: "sire", damId: "dam" },
      { id: "sire", sireId: "shared", damId: "" },
      { id: "dam", sireId: "shared", damId: "" },
      { id: "shared", sireId: "", damId: "" }
    ],
    subjectId: "subject",
    generations: 3
  });

  assert.equal(graph.ancestorIds.sireSire, "shared");
  assert.equal(graph.ancestorIds.damSire, "shared");
  assert.equal(graph.byKey.sireSire.status, "known");
  assert.equal(graph.byKey.damSire.status, "repeat");
  assert.equal(graph.byKey.damSire.repeatOf, "sireSire");
  assert.equal(graph.completeness.uniqueKnownAncestors, 3);
});

test("same ancestor may appear multiple times without being treated as a cycle", () => {
  const graph = Engine.buildGraph({
    animals: [
      { id: "subject", sireId: "shared", damId: "shared" },
      { id: "shared", sireId: "", damId: "" }
    ],
    subjectId: "subject",
    generations: 2
  });
  assert.equal(graph.byKey.sire.status, "known");
  assert.equal(graph.byKey.dam.status, "repeat");
  assert.equal(graph.issues.some((issue) => issue.type === "cycle"), false);
});

test("circular reference stops traversal on that branch", () => {
  const graph = Engine.buildGraph({
    animals: [
      { id: "subject", sireId: "sire", damId: "" },
      { id: "sire", sireId: "subject", damId: "" }
    ],
    subjectId: "subject",
    generations: 4
  });

  assert.equal(graph.byKey.sire.status, "known");
  assert.equal(graph.byKey.sireSire.status, "cycle");
  assert.equal(graph.byKey.sireSireSire.status, "unknown");
  assert.ok(graph.issues.some((issue) => issue.type === "cycle" && issue.key === "sireSire"));
});

test("configurable generation depth produces exact deterministic slot counts", () => {
  const animals = completeFourGenerationAnimals();
  const two = Engine.buildGraph({ animals, subjectId: "subject", generations: 2 });
  const three = Engine.buildGraph({ animals, subjectId: "subject", generations: 3 });
  const four = Engine.buildGraph({ animals, subjectId: "subject", generations: 4 });

  assert.equal(two.nodes.length, 3);
  assert.equal(three.nodes.length, 7);
  assert.equal(four.nodes.length, 15);
  assert.equal(two.byKey.sireSire, undefined);
  assert.equal(three.byKey.sireSire.animalId, "ss");
});

test("dangling and malformed references are reported instead of throwing", () => {
  const graph = Engine.buildGraph({
    animals: [{
      id: "subject",
      sireId: "missing-animal",
      damId: { invalid: true }
    }],
    subjectId: "subject",
    generations: 2
  });

  assert.equal(graph.byKey.sire.status, "missing-reference");
  assert.equal(graph.byKey.sire.referenceId, "missing-animal");
  assert.equal(graph.byKey.dam.status, "malformed-reference");
  assert.ok(graph.issues.some((issue) => issue.type === "missing-reference"));
  assert.ok(graph.issues.some((issue) => issue.type === "malformed-reference"));
});

test("saved ancestor ids can override live links without fabricating ancestry", () => {
  const graph = Engine.buildGraph({
    animals: [
      { id: "subject", sireId: "live-sire", damId: "" },
      { id: "live-sire", sireId: "", damId: "" },
      { id: "saved-sire", sireId: "", damId: "" }
    ],
    subjectId: "subject",
    generations: 2,
    ancestorIds: { sire: "saved-sire" }
  });
  assert.equal(graph.byKey.sire.animalId, "saved-sire");
  assert.equal(graph.ancestorIds.sire, "saved-sire");
});

test("stable identity prefers record id and falls back to durable animal identifiers", () => {
  assert.equal(Engine.identityForAnimal({ id: "abc", registrationNumber: "R-1" }), "id:abc");
  assert.equal(
    Engine.identityForAnimal({ species: "Rabbit", registrationNumber: " R-1 " }),
    "registration:rabbit:r 1"
  );
  assert.equal(Engine.identityForAnimal({ species: "Cattle", earTagNumber: "42" }), "ear-tag:cattle:42");
});
