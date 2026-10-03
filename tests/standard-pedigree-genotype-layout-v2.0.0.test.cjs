"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const Engine = require("../pedigree-engine-v2.0.0.js");
const StandardPrint = require("../standard-pedigree-print-v2.0.0.js");

function graph() {
  const animals = [
    { id: "subject", name: "Ghost", species: "Rabbit", sireId: "sire", damId: "dam" },
    { id: "sire", name: "Patches", species: "Rabbit" },
    { id: "dam", name: "Judy", species: "Rabbit" }
  ];
  return Engine.buildGraph({ animals, subjectId: "subject", generations: 3 });
}

const config = {
  template: "Standard",
  generations: 3,
  rootFields: ["name","sex","breed","color","genotype"],
  ancestorFields: ["name","sex","breed","color"],
  photos: false,
  unknownDisplay: "label"
};

test("Standard print no longer emits the generic GENOTYPE field row", () => {
  const g = graph();
  const html = StandardPrint.buildHtml({
    graph: g,
    subject: g.root.animal,
    config,
    operationName: "Waggin Tails Rabbitry",
    formatDate: (value) => value,
    speciesIcon: () => "R"
  });
  assert.doesNotMatch(html, /<b>GENOTYPE:<\/b>/);
  assert.match(html, /class="hh-standard-pedigree-print"/);
});

test("Standard print marks only cards that explicitly selected Genotype", () => {
  const g = graph();
  const html = StandardPrint.buildHtml({
    graph: g,
    subject: g.root.animal,
    config,
    operationName: "Waggin Tails Rabbitry",
    formatDate: (value) => value,
    speciesIcon: () => "R"
  });

  const subject = html.slice(
    html.indexOf('data-animal-id="subject"') - 120,
    html.indexOf("</article>", html.indexOf('data-animal-id="subject"'))
  );
  const sire = html.slice(
    html.indexOf('data-animal-id="sire"') - 120,
    html.indexOf("</article>", html.indexOf('data-animal-id="sire"'))
  );

  assert.match(subject, /data-hh-print-genetics="1"/);
  assert.match(sire, /data-hh-print-genetics="0"/);
  assert.match(subject, /class="pedigree-node-card hh-pedigree-card/);
  assert.match(subject, /data-hh-generation="0"/);
});

test("legacy genetics enhancer supports explicit Standard print genotype selection", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "..", "pedigree-genetics-v1.6.1.js"), "utf8");
  assert.match(source, /hh-standard-pedigree-print/);
  assert.match(source, /data\?\.hhPrintGenetics==='1'|dataset\?\.hhPrintGenetics==='1'/);
  assert.match(source, /standardPrint&&!explicitStandardGenetics/);
  assert.match(source, /!prefs\.printGenetics&&!explicitStandardGenetics/);
  assert.match(source, /line\.className='hh-genotype-line'/);
  assert.match(source, /Known Genetics:/);
});
