"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

const checks = {
  "shows-v1.5.1-hardening.js": [/const target = document\.body;/, /DOMContentLoaded/, /__hhShowsHardeningObserver/],
  "shows-v1.5.1-performance.js": [/const target = document\.body;/, /DOMContentLoaded/, /__hhShowsPerformanceObserver/],
  "pedigree-genetics-v1.5.1.js": [/if\(!rootWindow\?\.document\?\.body\)/, /__hhPedigreeGeneticsDomWait/, /if\(!observer\)/],
  "breeding-intelligence-v1.5.1.js": [/document\.head \|\| document\.body \|\| document\.documentElement/, /const target=document\.body;/, /__hhBreedingDomWait/],
  "breeding-pair-v1.5.1.js": [/const target=document\.body\|\|document\.documentElement\|\|document\.head/],
  "breeding-intelligence-tools-v1.5.1.js": [/const target = document\.body \|\| document\.documentElement \|\| document\.head;/, /__hhBreedingToolsDomWait/, /const target = document\.body;/],
  "rabbit-genetics-ui-v1.5.1.js": [/const target=document\.body\|\|document\.documentElement\|\|document\.head/, /v151-save-confirmation/],
  "rabbit-genetics-ui-v2.js": [/const target=document\.body\|\|document\.documentElement\|\|document\.head/, /__hhRabbitGeneticsV2DomWait/, /let observing=false/],
  "herdharbor-release-v1.5.1.js": [/const target = document\.head \|\| document\.body \|\| document\.documentElement;/]
};
for (const [file, patterns] of Object.entries(checks)) {
  const source = read(file);
  for (const pattern of patterns) assert.match(source, pattern, `${file} lacks DOM lifecycle guard`);
}
assert.doesNotMatch(read("shows-v1.5.1-hardening.js"), /observe\(document\.body\b/);
assert.doesNotMatch(read("shows-v1.5.1-performance.js"), /observe\(document\.body\b/);
const pedigreeSource = read("pedigree-genetics-v1.5.1.js");
assert.ok(pedigreeSource.includes("if(!rootWindow?.document?.body)") && pedigreeSource.includes("observe(rootWindow.document.body"), "pedigree observes only after the body guard");
assert.doesNotMatch(read("breeding-intelligence-v1.5.1.js"), /observe\(document\.body\b/);
assert.doesNotMatch(read("breeding-intelligence-tools-v1.5.1.js"), /observe\(document\.body\b/);
console.log("follow-up DOM lifecycle regression tests passed");
