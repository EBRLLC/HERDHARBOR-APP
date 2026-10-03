"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const engine = read("pedigree-engine-v2.0.0.js");
const renderer = read("pedigree-renderer-v2.0.0.js");
const planner = read("breeding-intelligence-v1.6.1.js");
const genetics = read("breeding-intelligence-core-v1.6.1.js");
const workflow = read(".github/workflows/v2.0.0-ci.yml");

test("Stack B keeps one canonical ancestry engine", () => {
  assert.match(engine, /function sharedAncestorAnalysis\(/);
  assert.match(engine, /function pedigreeRelationshipAnalysis\(/);
  assert.match(engine, /buildGraph\(options\)/);
  assert.match(planner, /HerdHarborPedigreeEngine/);
});

test("Stack B relationship coefficient and projected offspring Pedigree COI remain distinct", () => {
  assert.match(engine, /relationshipCoefficient/);
  assert.match(engine, /projectedOffspringPedigreeCoi/);
  assert.match(engine, /coefficientType: "Pedigree COI calculated from recorded parentage\. This is not genomic COI\."/);
  assert.match(planner, /Relationship coefficient/);
  assert.match(planner, /Projected offspring Pedigree COI/);
  assert.match(planner, /not genomic COI/);
});

test("Stack B exposes depth and pedigree completeness", () => {
  assert.match(engine, /ancestorGenerationsAnalyzed/);
  assert.match(engine, /pedigreeCompleteness/);
  assert.match(planner, /Generations analyzed/);
  assert.match(planner, /Pedigree completeness/);
});

test("Stack B genetics and pedigree relationship engines stay separate", () => {
  assert.match(planner, /Core\.analyzePairing\(buck,doe,state\)/);
  assert.match(planner, /relationshipAnalysis\(buck,doe,state,4\)/);
  assert.match(genetics, /function analyzePairing\(/);
  assert.doesNotMatch(genetics, /numeratorRelationshipMatrix|projectedOffspringPedigreeCoi/);
});

test("Stack B contains no breeding verdict language in relationship/planner implementation", () => {
  const relationshipStart = engine.indexOf("function pedigreeRelationshipAnalysis(");
  const relationshipEnd = engine.indexOf("function legacyAncestorIds(", relationshipStart);
  const relationshipSource = engine.slice(relationshipStart, relationshipEnd);
  const plannerStart = planner.indexOf("function plannerPedigreeMetrics(");
  const plannerEnd = planner.indexOf("async function learnFromOffspring", plannerStart);
  const plannerSource = planner.slice(plannerStart, plannerEnd);
  assert.doesNotMatch(relationshipSource, /\bSafe\b|\bUnsafe\b|\bRecommended\b|\bNot Recommended\b/);
  assert.doesNotMatch(plannerSource, /\bSafe\b|\bUnsafe\b|\bRecommended\b|\bNot Recommended\b/);
});

test("Stack B interactive relationship view uses unified pedigree renderer", () => {
  assert.match(renderer, /"relationship-analysis": Object\.freeze/);
  assert.match(renderer, /data-hh-shared-identity/);
  assert.match(renderer, /is-shared-selected/);
  assert.match(planner, /PedigreeRenderer\.render\(/);
  assert.match(planner, /mode: "relationship-analysis"/);
  assert.match(planner, /data-hh-relationship-view/);
});

test("Stack B CI supports true breeding-intel stacked PR bases", () => {
  assert.match(workflow, /'breeding-intel\/phase-\*'/);
});
