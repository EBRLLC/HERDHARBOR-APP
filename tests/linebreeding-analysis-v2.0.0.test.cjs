"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Engine = require("../pedigree-engine-v2.0.0.js");
const Renderer = require("../pedigree-renderer-v2.0.0.js");

const rabbit = (id, extra = {}) => ({ id, name: id, species: "Rabbit", ...extra });

test("B4 relationship renderer marks shared ancestors, repeats, and closest paths with text", () => {
  const animals = [
    rabbit("shared"),
    rabbit("p1", { sireId: "shared" }),
    rabbit("p2", { damId: "shared" }),
    rabbit("subject", { sireId: "p1", damId: "p2" })
  ];
  const graph = Engine.buildGraph({ animals, subjectId: "subject", generations: 4 });
  const sharedNodes = graph.nodes.filter((node) => node.animalId === "shared");
  assert.equal(sharedNodes.length, 2);

  const html = Renderer.render({
    graph,
    mode: "relationship-analysis",
    relationship: {
      sharedIdentities: [sharedNodes[0].identity],
      closestKeys: [sharedNodes[0].key],
      occurrenceCounts: { [sharedNodes[0].identity]: 2 }
    }
  });

  assert.match(html, /mode-relationship-analysis/);
  assert.match(html, /is-shared-ancestor/);
  assert.match(html, /Shared ancestor · 2 appearances/);
  assert.match(html, /Closest path/);
  assert.match(html, /Repeated occurrence/);
  assert.match(html, /data-pedigree-identity=/);
  assert.match(html, /data-hh-shared-identity=/);
});

test("B4 shared identity selection targets every appearance without relying on color", () => {
  function card(identity) {
    const classes = new Set();
    return {
      dataset: { pedigreeIdentity: identity },
      classList: { toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); } },
      classes
    };
  }
  function button(identity) {
    return {
      dataset: { hhSharedIdentity: identity },
      attrs: {},
      setAttribute(name, value) { this.attrs[name] = value; }
    };
  }
  const cards = [card("id:shared"), card("id:other"), card("id:shared")];
  const buttons = [button("id:shared"), button("id:other")];
  const scope = {
    querySelectorAll(selector) {
      if (selector === "[data-pedigree-identity]") return cards;
      if (selector === "[data-hh-shared-identity]") return buttons;
      return [];
    }
  };

  assert.equal(Renderer.selectSharedIdentity(scope, "id:shared"), 2);
  assert.equal(cards[0].classes.has("is-shared-selected"), true);
  assert.equal(cards[1].classes.has("is-shared-selected"), false);
  assert.equal(cards[2].classes.has("is-shared-selected"), true);
  assert.equal(buttons[0].attrs["aria-pressed"], "true");
  assert.equal(buttons[1].attrs["aria-pressed"], "false");
});

test("B4 linebreeding UI uses two unified relationship-analysis renderers", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "..", "breeding-intelligence-v1.6.1.js"), "utf8");
  assert.match(source, /PedigreeRenderer\.render\(/);
  assert.match(source, /mode: "relationship-analysis"/);
  assert.match(source, /data-hh-relationship-view/);
  assert.match(source, /ANIMAL A/);
  assert.match(source, /ANIMAL B/);
  assert.match(source, /Closest recorded relationship paths/);
  assert.match(source, /herdharbor:relationship-ancestor-selected/);
});

test("B4 relationship view is responsive and uses non-color markers", () => {
  const relationshipCss = fs.readFileSync(path.resolve(__dirname, "..", "pedigree-renderer-v2.0.0.css"), "utf8");
  const breedingCss = fs.readFileSync(path.resolve(__dirname, "..", "breeding-intelligence-v1.6.1.css"), "utf8");
  assert.match(relationshipCss, /\.hh-pedigree-shared-marker/);
  assert.match(relationshipCss, /\.hh-pedigree-closest-marker/);
  assert.match(breedingCss, /@media\(max-width:900px\)\{\.hh-bi-linebreeding-pedigrees\{grid-template-columns:1fr\}\}/);
});

test("B4 deeper 8-generation pedigree analysis stays deterministic", () => {
  const animals = [];
  function build(prefix, depth, maxDepth) {
    const id = prefix || "root";
    const row = rabbit(id);
    animals.push(row);
    if (depth >= maxDepth) return row;
    const sire = build(id + "s", depth + 1, maxDepth);
    const dam = build(id + "d", depth + 1, maxDepth);
    row.sireId = sire.id;
    row.damId = dam.id;
    return row;
  }
  const a = build("a", 0, 7);
  const b = build("b", 0, 7);
  const first = Engine.pedigreeRelationshipAnalysis({ animals, animalA: a, animalB: b, generations: 8 });
  const second = Engine.pedigreeRelationshipAnalysis({ animals, animalA: a, animalB: b, generations: 8 });
  assert.equal(first.relationshipCoefficient, 0);
  assert.equal(first.projectedOffspringPedigreeCoi, 0);
  assert.deepEqual(first, second);
  assert.equal(first.ancestorGenerationsAnalyzed, 7);
  assert.equal(first.pedigreeCompleteness.animalA.coverage, 1);
  assert.equal(first.pedigreeCompleteness.animalB.coverage, 1);
});

test("B4 canonical cycle protection and incomplete pedigree reporting survive relationship analysis", () => {
  const a = rabbit("a", { sireId: "parent" });
  const parent = rabbit("parent", { sireId: "a" });
  const b = rabbit("b");
  const result = Engine.pedigreeRelationshipAnalysis({
    animals: [a, parent, b],
    animalA: a,
    animalB: b,
    generations: 8
  });
  assert.ok(result.issues.some((issue) => issue.type === "cycle"));
  assert.ok(result.pedigreeCompleteness.animalA.coverage < 1);
  assert.equal(result.pedigreeCompleteness.animalB.coverage, 0);
});
