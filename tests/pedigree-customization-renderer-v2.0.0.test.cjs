"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Engine = require("../pedigree-engine-v2.0.0.js");
const Renderer = require("../pedigree-renderer-v2.0.0.js");
const Customization = require("../pedigree-customization-v2.0.0.js");

function animals() {
  return [
    { id: "subject", name: "Subject Rabbit", species: "Rabbit", sex: "Female", dob: "2025-02-01", breed: "Holland Lop", color: "Broken Black", registrationNumber: "REG-S", photoData: "data:image/png;base64,AAAA", sireId: "sire", damId: "" },
    { id: "sire", name: "Sire Rabbit", species: "Rabbit", sex: "Male", breed: "Holland Lop", color: "Black", registrationNumber: "REG-D", sireId: "shared", damId: "" },
    { id: "shared", name: "Shared Ancestor", species: "Rabbit", sex: "Male", breed: "Holland Lop", sireId: "", damId: "" }
  ];
}

function render(config) {
  const normalized = Customization.normalize(config);
  const graph = Engine.buildGraph({
    animals: animals(),
    subjectId: "subject",
    generations: normalized.generations
  });
  return {
    graph,
    html: Renderer.render({
      graph,
      ...Customization.rendererOptions(normalized, (value) => value)
    })
  };
}

test("A3 renders 3, 4, and 5 generation selections through the canonical engine", () => {
  const three = render({ template: "Classic", generations: 3 });
  const four = render({ template: "Classic", generations: 4 });
  const five = render({ template: "Classic", generations: 5 });
  assert.equal(three.graph.nodes.length, 7);
  assert.equal(four.graph.nodes.length, 15);
  assert.equal(five.graph.nodes.length, 31);
  assert.match(five.html, /--hh-pedigree-generations:5/);
});

test("root and ancestor fields render independently", () => {
  const { html } = render({
    template: "Classic",
    rootFields: ["name", "dob"],
    ancestorFields: ["name", "registrationNumber"],
    photos: false
  });
  const subjectIndex = html.indexOf('data-pedigree-key="subject"');
  const sireIndex = html.indexOf('data-pedigree-key="sire"');
  const subjectStart = html.lastIndexOf("<article", subjectIndex);
  const subjectEnd = html.indexOf("</article>", subjectIndex);
  const sireStart = html.lastIndexOf("<article", sireIndex);
  const sireEnd = html.indexOf("</article>", sireIndex);
  const subject = html.slice(subjectStart, subjectEnd);
  const sire = html.slice(sireStart, sireEnd);
  assert.match(subject, /DOB/);
  assert.doesNotMatch(subject, /Registration/);
  assert.match(sire, /Registration/);
  assert.doesNotMatch(sire, /DOB/);
});

test("photos on/off is explicit and does not fabricate missing photos", () => {
  const off = render({ template: "Buyer", photos: false }).html;
  assert.doesNotMatch(off, /class="hh-pedigree-photo"/);

  const on = render({ template: "Buyer", photos: true }).html;
  assert.match(on, /class="hh-pedigree-photo"/);
  const damIndex = on.indexOf('data-pedigree-key="dam"');
  const damStart = on.lastIndexOf("<article", damIndex);
  const damEnd = on.indexOf("</article>", damIndex);
  const dam = on.slice(damStart, damEnd);
  assert.doesNotMatch(dam, /class="hh-pedigree-photo"/);
});

test("unknown display blank preserves pedigree positions without fabricating ancestry", () => {
  const labeled = render({ template: "Classic", generations: 3, unknownDisplay: "label" });
  const blank = render({ template: "Classic", generations: 3, unknownDisplay: "blank" });
  assert.equal(labeled.graph.nodes.length, blank.graph.nodes.length);
  assert.match(labeled.html, /Unknown ancestor/);
  assert.doesNotMatch(blank.html, /Unknown ancestor/);
  assert.match(blank.html, /data-pedigree-status="unknown"/);
  assert.match(blank.html, /data-unknown-display="blank"/);
});

test("density, layout, and style become explicit renderer classes", () => {
  const { html } = render({
    template: "Professional",
    density: "compact",
    layout: "columns",
    style: "professional"
  });
  assert.match(html, /density-compact/);
  assert.match(html, /layout-columns/);
  assert.match(html, /style-professional/);
  assert.match(html, /data-pedigree-layout="columns"/);
  assert.match(html, /data-pedigree-style="professional"/);
});

test("every starter template renders without changing ancestry identity", () => {
  const baseline = render({ template: "Classic" }).graph.ancestorIds;
  for (const template of Object.keys(Customization.TEMPLATES)) {
    const result = render({ template });
    assert.deepEqual(result.graph.ancestorIds, baseline, template);
  }
});
