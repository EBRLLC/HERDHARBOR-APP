"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const Engine = require("../rabbit-genetics-v1.6.1.js");
const Analytics = require("../analytics-v1.6.1.js");
const root = path.join(__dirname, "..");

const rabbit = (id, name, sex, extra = {}) => ({ id, name, sex, species: "Rabbit", status: "Active", ...extra });

test("canonical pedigree paths deduplicate ancestors while preserving repeated linebreeding paths", () => {
  const ancestor = rabbit("ancestor", "Shared Ancestor", "Male");
  const sireParentA = rabbit("sire-parent-a", "Sire Parent A", "Male", { sireId: ancestor.id });
  const sireParentB = rabbit("sire-parent-b", "Sire Parent B", "Female", { damId: ancestor.id });
  const damParent = rabbit("dam-parent", "Dam Parent", "Male", { sireId: ancestor.id });
  const sire = rabbit("sire", "Sire", "Male", { sireId: sireParentA.id, damId: sireParentB.id });
  const dam = rabbit("dam", "Dam", "Female", { sireId: damParent.id });
  const animals = [ancestor, sireParentA, sireParentB, damParent, sire, dam];

  const sireProfile = Engine.pedigreeProfile(sire, animals, 4);
  const canonicalAncestor = sireProfile.ancestors.filter((row) => row.id === ancestor.id);
  assert.equal(canonicalAncestor.length, 1);
  assert.equal(canonicalAncestor[0].pathCount, 2);
  assert.equal(canonicalAncestor[0].repeated, true);

  const pair = Engine.pairPedigreeContext(sire, dam, animals, 4);
  assert.equal(pair.sharedAncestorCount, 1);
  assert.equal(pair.sharedAncestors[0].id, ancestor.id);
  assert.equal(pair.sharedAncestors[0].pathPairCount, 2);
  assert.equal(pair.inbreedingCoefficient, null);
  assert.equal(pair.unknownAncestorsTreatedAsUnrelated, false);
});

test("unknown parents, incomplete generations, and cycles remain explicit instead of implying unrelatedness", () => {
  const sire = rabbit("sire", "Sire", "Male", { sireId: "missing-record" });
  const dam = rabbit("dam", "Dam", "Female");
  const pair = Engine.pairPedigreeContext(sire, dam, [sire, dam], 3);
  assert.equal(pair.relationshipStatus, "insufficient-pedigree-data");
  assert.equal(pair.incompletePedigree, true);
  assert.ok(pair.sire.missingLinks.some((row) => row.status === "unresolved-record"));
  assert.match(pair.coefficientReason, /Unknown ancestors are not treated as unrelated/);

  const cyclicParent = rabbit("parent", "Cyclic Parent", "Male", { sireId: sire.id });
  sire.sireId = cyclicParent.id;
  const cyclic = Engine.pedigreeProfile(sire, [sire, cyclicParent], 8);
  assert.equal(cyclic.hasCycle, true);
  assert.ok(cyclic.missingLinks.some((row) => row.status === "cycle"));
});

test("genotype evidence distinguishes known, inferred, conflicting, partial, and unknown records", () => {
  const conflicting = rabbit("conflict", "Conflict", "Male", {
    genetics: {
      loci: { B: { alleles: ["B", "B"], status: "confirmed", source: "breeder" } },
      conflicts: [{ locus: "B", resolution: "review-required" }]
    }
  });
  const partial = rabbit("partial", "Partial", "Female", {
    genetics: { loci: { D: { alleles: ["D", "_"], status: "strongly-inferred", source: "pedigree" } } }
  });
  assert.equal(Engine.genotypeEvidenceSummary(conflicting).status, "conflicting");
  assert.equal(Engine.genotypeEvidenceSummary(conflicting).confirmedLoci.includes("B"), true);
  assert.equal(Engine.genotypeEvidenceSummary(partial).status, "partial");
  assert.equal(Engine.genotypeEvidenceSummary(partial).partialLoci.includes("D"), true);
  assert.equal(Engine.genotypeEvidenceSummary(rabbit("unknown", "Unknown", "Male")).status, "unknown");
});

test("deterministic Mendelian rules calculate only known genotypes and preserve unknowns", () => {
  const exact = Engine.crossLocus("B", ["B", "b"], ["b", "b"]);
  assert.equal(exact.exact, true);
  assert.deepEqual(exact.outcomes.map((row) => [row.alleles.join("/"), row.probability]), [["B/b", 0.5], ["b/b", 0.5]]);
  const unknown = Engine.crossLocus("B", ["B", "_"], ["b", "b"]);
  assert.equal(unknown.exact, false);
  assert.deepEqual(unknown.outcomes, []);
});

test("same-pair decision support reuses Phase 9C performance data and never mutates canonical state", () => {
  const sire = rabbit("sire", "Sire", "Male");
  const dam = rabbit("dam", "Dam", "Female");
  const kitA = rabbit("kit-a", "Kit A", "Female", { sireId: sire.id, damId: dam.id, sourceBirthId: "litter-1", dob: "2026-01-01", weanedDate: "2026-01-29" });
  const kitB = rabbit("kit-b", "Kit B", "Male", { sireId: sire.id, damId: dam.id, sourceBirthId: "litter-1", dob: "2026-01-01", weanedDate: "2026-01-30" });
  const state = {
    animals: [sire, dam, kitA, kitB],
    litters: [{ id: "litter-1", name: "January litter", sireId: sire.id, damId: dam.id, birthDate: "2026-01-01", bornAlive: 2, stillborn: 0, weaned: 2, lostBeforeWeaning: 0 }],
    health: [
      { id: "parent-health", animalId: sire.id, date: "2026-01-10", type: "Routine exam" },
      { id: "kit-a-weight", animalId: kitA.id, date: kitA.weanedDate, weight: 2, weightUnit: "lb" },
      { id: "kit-b-weight", animalId: kitB.id, date: kitB.weanedDate, weight: 34, weightUnit: "oz" }
    ],
    productionRecords: [{ id: "production-1", animalId: kitA.id, date: "2026-03-01", product: "Fiber", quantity: 1, unit: "lb" }],
    showEntries: [{ id: "entry-1", animalId: kitB.id, showId: "show-1" }],
    showResults: [{ id: "result-1", entryId: "entry-1", placement: "1st" }],
    showAwards: [{ id: "award-1", resultId: "result-1", awardType: "Best of Breed" }],
    settings: { preferredWeightDisplay: "lb" }
  };
  const before = JSON.stringify(state);
  const direct = Analytics.pairingOffspringPerformance(state, { range: "all", sireId: sire.id, damId: dam.id, minimumSample: 2 })[0];
  const support = Engine.pairDecisionSupport(sire, dam, state, Analytics, 4);

  assert.equal(support.history.analyticsAvailable, true);
  assert.deepEqual(support.history.pairPerformance, direct);
  assert.equal(support.history.pairPerformance.litterCount, 1);
  assert.equal(support.history.pairPerformance.offspringCount, 2);
  assert.equal(support.history.pairPerformance.weightSampleSize, 2);
  assert.equal(support.history.weaning.sampleSize, 2);
  assert.equal(support.recordedContext.counts.parentHealth, 1);
  assert.equal(support.recordedContext.counts.offspringHealth, 2);
  assert.equal(support.recordedContext.counts.production, 1);
  assert.equal(support.recordedContext.counts.showEntries, 1);
  assert.equal(support.recordedContext.counts.showResults, 1);
  assert.equal(support.recordedContext.counts.showAwards, 1);
  assert.equal(support.readOnly, true);
  assert.equal(JSON.stringify(state), before);
});

test("missing Phase 9C data remains an explicit insufficient-data state", () => {
  const sire = rabbit("sire", "Sire", "Male");
  const dam = rabbit("dam", "Dam", "Female");
  const support = Engine.pairDecisionSupport(sire, dam, { animals: [sire, dam] }, Analytics, 4);
  assert.equal(support.history.dataStatus, "insufficient data");
  assert.equal(support.history.pairPerformance, null);
  assert.deepEqual(support.history.offspringIds, []);
  assert.equal(support.recordedContext.counts.production, 0);
});

test("Phase 9D stays inside the canonical genetics owner and exposes mobile-safe disclosures", () => {
  const engine = fs.readFileSync(path.join(root, "rabbit-genetics-v1.6.1.js"), "utf8");
  const ui = fs.readFileSync(path.join(root, "rabbit-genetics-ui-advanced-v1.6.1.js"), "utf8");
  const pwa = fs.readFileSync(path.join(root, "pwa.js"), "utf8");
  const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
  const contract = fs.readFileSync(path.join(root, "docs/BREEDING-GENETICS-DECISION-SUPPORT-v1.8.3.md"), "utf8");

  assert.match(engine, /PEDIGREE_DECISION_SUPPORT_CONTRACT/);
  assert.match(engine, /pairDecisionSupport/);
  assert.doesNotMatch(engine, /localStorage|sessionStorage|indexedDB|commitState|saveState/);
  assert.match(ui, /Unknown ancestors are not treated as unrelated/);
  assert.match(ui, /HerdHarbor does not calculate an inbreeding coefficient/);
  assert.match(ui, /Missing records stay missing/);
  assert.match(ui, /hh-bi-two-col/);
  assert.match(contract, /canonical Animal `sireId` and `damId`/);
  assert.match(contract, /does \*\*not\*\* publish an inbreeding or relatedness coefficient/);
  assert.match(contract, /All decision-support calculations are read-only/);
  assert.match(pwa, /rabbit-genetics-v1\.6\.1\.js\?v=2/);
  assert.match(pwa, /rabbit-genetics-ui-advanced-v1\.6\.1\.js\?v=2/);
  assert.equal((worker.match(/\.\/rabbit-genetics-v1\.6\.1\.js\?v=2/g) || []).length, 1);
  assert.equal((worker.match(/\.\/rabbit-genetics-ui-advanced-v1\.6\.1\.js\?v=2/g) || []).length, 1);
});
