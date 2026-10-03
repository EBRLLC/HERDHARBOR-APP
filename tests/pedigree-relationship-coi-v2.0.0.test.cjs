"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Engine = require("../pedigree-engine-v2.0.0.js");

const rabbit = (id, extra = {}) => ({ id, name: id, species: "Rabbit", ...extra });
const calc = (animals, animalAId, animalBId, generations = 8) =>
  Engine.pedigreeRelationshipAnalysis({ animals, animalAId, animalBId, generations });

function expectPair(result, relationship, coi) {
  assert.equal(result.relationshipCoefficient, relationship);
  assert.equal(result.kinshipCoefficient, coi);
  assert.equal(result.projectedOffspringPedigreeCoi, coi);
  assert.equal(result.label, "Pedigree COI");
  assert.equal(result.method, "tabular-numerator-relationship-matrix");
  assert.match(result.assumptions.coefficientType, /not genomic COI/i);
}

test("B2 unrelated animals have zero relationship and projected offspring Pedigree COI", () => {
  const result = calc([rabbit("a"), rabbit("b")], "a", "b");
  expectPair(result, 0, 0);
});

test("B2 parent × offspring fixture", () => {
  const animals = [
    rabbit("parent"),
    rabbit("mate"),
    rabbit("offspring", { sireId: "parent", damId: "mate" })
  ];
  const result = calc(animals, "parent", "offspring");
  expectPair(result, 0.5, 0.25);
  assert.equal(result.directAncestryUsed.length, 1);
  assert.equal(result.directAncestryUsed[0].animalId, "parent");
  assert.equal(result.directAncestryUsed[0].closestDepth, 1);
});

test("B2 full siblings fixture", () => {
  const animals = [
    rabbit("sire"), rabbit("dam"),
    rabbit("a", { sireId: "sire", damId: "dam" }),
    rabbit("b", { sireId: "sire", damId: "dam" })
  ];
  const result = calc(animals, "a", "b");
  expectPair(result, 0.5, 0.25);
  assert.equal(result.sharedAncestorCount, 2);
});

test("B2 half siblings fixture", () => {
  const animals = [
    rabbit("sire"), rabbit("dam-a"), rabbit("dam-b"),
    rabbit("a", { sireId: "sire", damId: "dam-a" }),
    rabbit("b", { sireId: "sire", damId: "dam-b" })
  ];
  const result = calc(animals, "a", "b");
  expectPair(result, 0.25, 0.125);
  assert.equal(result.sharedAncestorCount, 1);
});

test("B2 first cousins fixture", () => {
  const animals = [
    rabbit("g1"), rabbit("g2"),
    rabbit("p1", { sireId: "g1", damId: "g2" }),
    rabbit("p2", { sireId: "g1", damId: "g2" }),
    rabbit("u1"), rabbit("u2"),
    rabbit("a", { sireId: "p1", damId: "u1" }),
    rabbit("b", { sireId: "p2", damId: "u2" })
  ];
  const result = calc(animals, "a", "b");
  expectPair(result, 0.125, 0.0625);
  assert.equal(result.sharedAncestorCount, 2);
});

test("B2 repeated shared ancestor counts all valid paths", () => {
  const animals = [
    rabbit("shared"), rabbit("u1"), rabbit("u2"), rabbit("u3"),
    rabbit("p1", { sireId: "shared", damId: "u1" }),
    rabbit("p2", { sireId: "shared", damId: "u2" }),
    rabbit("a", { sireId: "p1", damId: "p2" }),
    rabbit("b", { sireId: "shared", damId: "u3" })
  ];
  const result = calc(animals, "a", "b");
  expectPair(result, 0.25, 0.125);
  const shared = result.sharedAncestryUsed.find((row) => row.animalId === "shared");
  assert.ok(shared);
  assert.equal(shared.pathPairCount, 2);
  assert.equal(result.repeatedSharedAncestorCount, 1);
  assert.equal(result.animalA.individualPedigreeCoi, 0.125);
});

test("B2 already-inbred shared ancestor increases relationship correctly", () => {
  const animals = [
    rabbit("g1"), rabbit("g2"),
    rabbit("p1", { sireId: "g1", damId: "g2" }),
    rabbit("p2", { sireId: "g1", damId: "g2" }),
    rabbit("shared", { sireId: "p1", damId: "p2" }),
    rabbit("u1"), rabbit("u2"),
    rabbit("a", { sireId: "shared", damId: "u1" }),
    rabbit("b", { sireId: "shared", damId: "u2" })
  ];
  const result = calc(animals, "a", "b");
  expectPair(result, 0.3125, 0.15625);
  const shared = result.sharedAncestryUsed.find((row) => row.animalId === "shared");
  assert.ok(shared);
  assert.equal(shared.ancestorPedigreeCoi, 0.25);
});

test("B2 incomplete pedigree remains deterministic and reports completeness", () => {
  const animals = [
    rabbit("sire"),
    rabbit("a", { sireId: "sire" }),
    rabbit("b", { sireId: "sire" })
  ];
  const first = calc(animals, "a", "b", 4);
  const second = calc(animals, "a", "b", 4);
  expectPair(first, 0.25, 0.125);
  assert.deepEqual(first, second);
  assert.ok(first.pedigreeCompleteness.animalA.coverage < 1);
  assert.ok(first.pedigreeCompleteness.animalB.coverage < 1);
  assert.match(first.assumptions.missingAncestry, /Unrecorded or unavailable ancestors/);
});

test("B2 matrix is symmetric and individual diagonal stores 1 + F", () => {
  const animals = [
    rabbit("sire"), rabbit("dam"),
    rabbit("a", { sireId: "sire", damId: "dam" }),
    rabbit("b", { sireId: "sire", damId: "dam" }),
    rabbit("child", { sireId: "a", damId: "b" })
  ];
  const matrix = Engine.numeratorRelationshipMatrix({
    animals,
    animalAId: "a",
    animalBId: "child",
    generations: 8
  });
  for (let i = 0; i < matrix.matrix.length; i += 1) {
    for (let j = 0; j < matrix.matrix.length; j += 1) {
      assert.equal(matrix.matrix[i][j], matrix.matrix[j][i]);
    }
  }
  const childIndex = matrix.position.get("child");
  assert.equal(matrix.matrix[childIndex][childIndex], 1.25);
});

test("B2 code does not implement fixed grandparent point rules", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "..", "pedigree-engine-v2.0.0.js"), "utf8");
  assert.doesNotMatch(source, /same grandparent|same great-grandparent|fixed points/i);
  assert.match(source, /tabular-numerator-relationship-matrix/);
});
