"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Engine = require("../pedigree-engine-v2.0.0.js");

function animal(id, name, extra = {}) {
  return { id, name, species: "Rabbit", ...extra };
}

test("B1 detects one shared ancestor by canonical animal identity", () => {
  const shared = animal("shared", "Shared");
  const a = animal("a", "A", { sireId: shared.id });
  const b = animal("b", "B", { damId: shared.id });
  const result = Engine.sharedAncestorAnalysis({
    animals: [a, b, shared],
    animalA: a,
    animalB: b,
    generations: 4
  });

  assert.equal(result.sharedAncestorCount, 1);
  assert.equal(result.sharedAncestors[0].animalId, "shared");
  assert.equal(result.sharedAncestors[0].pathPairCount, 1);
  assert.equal(result.sharedAncestors[0].closestPathPairs[0].animalA.depth, 1);
  assert.equal(result.sharedAncestors[0].closestPathPairs[0].animalB.depth, 1);
  assert.equal(result.maxAncestorDepth, 3);
});

test("B1 preserves every repeated shared-ancestor occurrence and path pair", () => {
  const shared = animal("shared", "Shared");
  const aSire = animal("a-sire", "A Sire", { sireId: shared.id });
  const aDam = animal("a-dam", "A Dam", { damId: shared.id });
  const a = animal("a", "A", { sireId: aSire.id, damId: aDam.id });

  const bSire = animal("b-sire", "B Sire", { sireId: shared.id });
  const b = animal("b", "B", { sireId: bSire.id });

  const result = Engine.sharedAncestorAnalysis({
    animals: [a, b, aSire, aDam, bSire, shared],
    animalA: a,
    animalB: b,
    generations: 4
  });

  const row = result.sharedAncestors.find((entry) => entry.animalId === shared.id);
  assert.ok(row);
  assert.equal(row.animalAOccurrences.length, 2);
  assert.equal(row.animalBOccurrences.length, 1);
  assert.equal(row.pathPairCount, 2);
  assert.equal(row.animalARepeated, true);
  assert.equal(row.animalBRepeated, false);
  assert.deepEqual(row.animalAOccurrences.map((item) => item.key).sort(), ["damDam", "sireSire"]);
});

test("B1 orders closest relationship paths deterministically", () => {
  const close = animal("close", "Close");
  const far = animal("far", "Far");
  const aParent = animal("a-parent", "A Parent", { sireId: close.id, damId: far.id });
  const a = animal("a", "A", { sireId: aParent.id });
  const bParent = animal("b-parent", "B Parent", { sireId: far.id });
  const b = animal("b", "B", { sireId: close.id, damId: bParent.id });

  const result = Engine.sharedAncestorAnalysis({
    animals: [a, b, aParent, bParent, close, far],
    animalA: a,
    animalB: b,
    generations: 4
  });

  assert.equal(result.sharedAncestors[0].animalId, "close");
  assert.equal(result.sharedAncestors[0].closestTotalDepth, 3);
  assert.equal(result.closestRelationshipPaths[0].ancestorId, "close");
  assert.equal(result.closestRelationshipPaths[0].totalDepth, 3);
});

test("B1 reports pedigree completeness independently for both animals", () => {
  const aSire = animal("a-sire", "A Sire");
  const a = animal("a", "A", { sireId: aSire.id });
  const b = animal("b", "B");

  const result = Engine.sharedAncestorAnalysis({
    animals: [a, b, aSire],
    animalA: a,
    animalB: b,
    generations: 3
  });

  assert.equal(result.completeness.animalA.expectedAncestorSlots, 6);
  assert.equal(result.completeness.animalA.knownAncestorSlots, 1);
  assert.equal(result.completeness.animalA.coverage, 1 / 6);
  assert.equal(result.completeness.animalB.expectedAncestorSlots, 6);
  assert.equal(result.completeness.animalB.knownAncestorSlots, 0);
  assert.equal(result.completeness.animalB.coverage, 0);
});

test("B1 lineage profile keeps repeated ancestors separate from cycles", () => {
  const shared = animal("shared", "Shared");
  const subject = animal("subject", "Subject", { sireId: shared.id, damId: shared.id });
  const profile = Engine.lineageProfile({
    animals: [subject, shared],
    subject,
    generations: 3
  });
  const row = profile.ancestors.find((entry) => entry.animalId === "shared");
  assert.ok(row);
  assert.equal(row.occurrenceCount, 2);
  assert.equal(row.repeated, true);
  assert.deepEqual(new Set(row.occurrences.map((item) => item.status)), new Set(["known", "repeat"]));
  assert.equal(profile.graph.issues.some((issue) => issue.type === "cycle"), false);
});

test("B1 UI exposes Compare With Another Animal and Analyze Pairing entry points", () => {
  const breeding = fs.readFileSync(path.resolve(__dirname, "..", "breeding-intelligence-v1.6.1.js"), "utf8");
  const profile = fs.readFileSync(path.resolve(__dirname, "..", "animal-profile-runtime-v1.8.3.js"), "utf8");

  assert.match(breeding, /Compare With Another Animal/);
  assert.match(breeding, /Analyze Pairing/);
  assert.match(breeding, /Pedigree\.sharedAncestorAnalysis/);
  assert.match(breeding, /openRelationshipComparison/);
  assert.match(profile, /detail-compare-pedigree/);
  assert.match(profile, /openRelationshipComparison\(id\)/);
});

test("B1 does not publish a relationship coefficient or pedigree COI", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "..", "pedigree-engine-v2.0.0.js"), "utf8");
  assert.doesNotMatch(source, /projectedOffspringCoi|relationshipCoefficient|kinshipCoefficient/);
});
