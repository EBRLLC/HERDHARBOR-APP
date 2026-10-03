"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "breeding-intelligence-v1.6.1.js"), "utf8");
const css = fs.readFileSync(path.join(root, "breeding-intelligence-v1.6.1.css"), "utf8");

test("B3 Breeding Planner keeps GENETICS and PEDIGREE as separate factual sections", () => {
  assert.match(source, /data-bi-planner-section="genetics"/);
  assert.match(source, />GENETICS</);
  assert.match(source, /What could this pairing produce\?/);
  assert.match(source, /data-bi-planner-section="pedigree"/);
  assert.match(source, />PEDIGREE</);
  assert.match(source, /How closely related are these animals\?/);
});

test("B3 uses separate genetics and pedigree engines for the same selected pairing", () => {
  assert.match(source, /const geneticsAnalysis=Core\.analyzePairing\(buck,doe,state\)/);
  assert.match(source, /const pedigreeAnalysis=relationshipAnalysis\(buck,doe,state,4\)/);
  assert.match(source, /Pedigree\.pedigreeRelationshipAnalysis/);
});

test("B3 planner displays all required pedigree outputs", () => {
  for (const token of [
    "Relationship coefficient",
    "Projected offspring Pedigree COI",
    "Shared ancestors",
    "Pedigree completeness",
    "Generations analyzed",
    "View Linebreeding Analysis"
  ]) assert.ok(source.includes(token), token);
  assert.match(source, /not genomic COI/);
});

test("B3 does not produce breeder verdicts", () => {
  const plannerStart = source.indexOf("function plannerPedigreeMetrics(");
  const plannerEnd = source.indexOf("async function learnFromOffspring", plannerStart);
  const planner = source.slice(plannerStart, plannerEnd);
  assert.doesNotMatch(planner, /\bSafe\b|\bUnsafe\b|\bRecommended\b|\bNot Recommended\b/);
});

test("B3 mobile layout keeps planner metrics readable", () => {
  assert.match(css, /\.hh-bi-planner-metrics\{display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*\.hh-bi-planner-metrics\{grid-template-columns:1fr 1fr\}/);
  assert.match(css, /@media\(max-width:470px\)[\s\S]*\.hh-bi-planner-metrics\{grid-template-columns:1fr\}/);
});


test("B3 breeder-facing linebreeding workflow requires a buck and doe", () => {
  const comparisonStart = source.indexOf("function renderRelationshipComparison(");
  const comparisonEnd = source.indexOf("function modifierRows(", comparisonStart);
  const comparison = source.slice(comparisonStart, comparisonEnd);

  assert.match(source, /Linebreeding Coefficient/);
  assert.doesNotMatch(source, /Compare With Another Animal/);
  assert.match(comparison, /const bucks = rabbits\.filter\(\(animal\) => sexIs\(animal, "male"\)\)/);
  assert.match(comparison, /const does = rabbits\.filter\(\(animal\) => sexIs\(animal, "female"\)\)/);
  assert.match(comparison, /selectOptions\(bucks, buck\?\.id\)/);
  assert.match(comparison, /selectOptions\(does, doe\?\.id\)/);
  assert.match(comparison, /explicitPair && buck && doe/);
  assert.match(comparison, /Add at least one buck and one doe/);
  assert.match(comparison, /Calculate Linebreeding Coefficient/);
  assert.doesNotMatch(comparison, /selectOptions\(animals/);
});
