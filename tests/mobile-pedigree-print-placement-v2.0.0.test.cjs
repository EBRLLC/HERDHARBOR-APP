"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Engine = require("../pedigree-engine-v2.0.0.js");
const StandardPrint = require("../standard-pedigree-print-v2.0.0.js");

function graph(generations = 4) {
  const animals = [{ id: "subject", name: "Ghost", species: "Rabbit", sireId: "sire", damId: "dam" }];
  const make = (id, sireId = "", damId = "") => animals.push({ id, name: id, species: "Rabbit", sireId, damId });
  make("sire", "ss", "sd");
  make("dam", "ds", "dd");
  make("ss", "sss", "ssd");
  make("sd", "sds", "sdd");
  make("ds", "dss", "dsd");
  make("dd", "dds", "ddd");
  for (const id of ["sss","ssd","sds","sdd","dss","dsd","dds","ddd"]) make(id);
  return Engine.buildGraph({ animals, subjectId: "subject", generations });
}

const config = {
  template: "Standard",
  generations: 4,
  rootFields: ["name","sex","dob","breed","color","registrationNumber","prefix"],
  ancestorFields: ["name","sex","dob","breed","color","registrationNumber","prefix"],
  photos: true,
  unknownDisplay: "label"
};

test("standard four-generation pedigree keeps the original print geometry", () => {
  const html = StandardPrint.buildHtml({
    graph: graph(4),
    config,
    subject: graph(4).root.animal,
    operationName: "Waggin Tails Rabbitry",
    generatedDate: "10/3/2026",
    formatDate: (value) => value,
    speciesIcon: () => "R"
  });

  assert.match(html, /@page \{ size: letter landscape; margin: \.2in; \}/);
  assert.match(html, /height: 8\.06in/);
  assert.match(html, /grid-template-columns: minmax\(168px,1\.18fr\) 34px minmax\(164px,1\.1fr\) 34px minmax\(158px,1fr\) 34px minmax\(152px,\.96fr\)/);
  assert.match(html, /grid-template-rows: repeat\(8, minmax\(0,1fr\)\)/);
  assert.match(html, /body \{ min-width: 980px; \}/);
});

test("standard tree uses the original subject parent grandparent and great-grandparent spans", () => {
  const html = StandardPrint.treeHtml(graph(4), config, {
    subject: graph(4).root.animal,
    formatDate: (value) => value,
    speciesIcon: () => "R"
  });
  assert.match(html, /grid-column:1;grid-row:1 \/ 9/);
  assert.match(html, /grid-column:3;grid-row:1 \/ 5/);
  assert.match(html, /grid-column:3;grid-row:5 \/ 9/);
  assert.match(html, /grid-column:5;grid-row:1 \/ 3/);
  assert.match(html, /grid-column:5;grid-row:7 \/ 9/);
  assert.match(html, /grid-column:7;grid-row:1 \/ 2/);
  assert.match(html, /grid-column:7;grid-row:8 \/ 9/);
  assert.match(html, /pedigree-branch/);
});

test("customization changes card content without replacing standard geometry", () => {
  const custom = {
    ...config,
    ancestorFields: ["name","breed"],
    photos: false
  };
  const g = graph(4);
  const html = StandardPrint.buildHtml({
    graph: g,
    config: custom,
    subject: g.root.animal,
    operationName: "Waggin Tails Rabbitry",
    formatDate: (value) => value,
    speciesIcon: () => "R"
  });
  assert.match(html, /grid-template-columns: minmax\(168px,1\.18fr\)/);
  assert.match(html, /data-field="breed"/);
  assert.doesNotMatch(html, /data-field="registrationNumber"/);
});
