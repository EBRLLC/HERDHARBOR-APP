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
  const sireMarker = html.indexOf("<strong>sire</strong>");
  assert.ok(sireMarker >= 0);
  const sireCardStart = html.lastIndexOf("<article", sireMarker);
  const sireCardEnd = html.indexOf("</article>", sireMarker);
  const sireCard = html.slice(sireCardStart, sireCardEnd);
  assert.match(sireCard, /data-field="breed"/);
  assert.doesNotMatch(sireCard, /data-field="registrationNumber"/);
});


test("mobile standard pedigree uses more vertical page space without changing the original columns", () => {
  const g = graph(4);
  const html = StandardPrint.buildHtml({
    graph: g,
    config,
    subject: g.root.animal,
    operationName: "Waggin Tails Rabbitry",
    mobilePrint: true,
    formatDate: (value) => value,
    speciesIcon: () => "R"
  });
  assert.match(html, /class="sheet mobile-print four-generation"/);
  assert.match(html, /height: 9\.25in/);
  assert.match(html, /grid-template-columns: minmax\(168px,1\.18fr\) 34px minmax\(164px,1\.1fr\) 34px minmax\(158px,1fr\) 34px minmax\(152px,\.96fr\)/);
  assert.match(html, /\.mobile-print \.pedigree-tree \{ padding-top: 12px; padding-bottom: 10px; \}/);
});

test("fourth-generation cards get a modest readability increase", () => {
  const g = graph(4);
  const html = StandardPrint.buildHtml({
    graph: g,
    config,
    subject: g.root.animal,
    operationName: "Waggin Tails Rabbitry",
    formatDate: (value) => value,
    speciesIcon: () => "R"
  });
  assert.match(html, /\.great-node \.node-title strong \{ font-size: 8\.8px; \}/);
  assert.match(html, /\.great-node \.node-details div \{ font-size: 6\.6px; \}/);
  assert.match(html, /\.great-node \.node-details b \{ font-size: 5\.9px; \}/);
});
