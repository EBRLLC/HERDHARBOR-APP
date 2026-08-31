"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

const checks = {
  "shows-v1.5.0-hardening.js": [/const target = document\.body;/, /DOMContentLoaded/, /__hhShowsHardeningObserver/],
  "shows-v1.5.0-performance.js": [/const target = document\.body;/, /DOMContentLoaded/, /__hhShowsPerformanceObserver/],
  "pedigree-genetics-v1.4.5.js": [/if\(!rootWindow\?\.document\?\.body\)/, /__hhPedigreeGeneticsDomWait/, /if\(!observer\)/],
  "breeding-intelligence.js": [/document\.head \|\| document\.body \|\| document\.documentElement/, /const target=document\.body;/, /__hhBreedingDomWait/],
  "breeding-pair-hotfix-v1.4.2.js": [/const target=document\.body\|\|document\.documentElement\|\|document\.head/],
  "breeding-intelligence-tools.js": [/const target = document\.body \|\| document\.documentElement \|\| document\.head;/, /__hhBreedingToolsDomWait/, /const target = document\.body;/],
  "herdharbor-release-v1.4.5.js": [/const target = document\.head \|\| document\.body \|\| document\.documentElement;/]
};
for (const [file, patterns] of Object.entries(checks)) {
  const source = read(file);
  for (const pattern of patterns) assert.match(source, pattern, `${file} lacks DOM lifecycle guard`);
}
assert.doesNotMatch(read("shows-v1.5.0-hardening.js"), /observe\(document\.body\b/);
assert.doesNotMatch(read("shows-v1.5.0-performance.js"), /observe\(document\.body\b/);
const pedigreeSource = read("pedigree-genetics-v1.4.5.js");
assert.ok(pedigreeSource.includes("if(!rootWindow?.document?.body)") && pedigreeSource.includes("observe(rootWindow.document.body"), "pedigree observes only after the body guard");
assert.doesNotMatch(read("breeding-intelligence.js"), /observe\(document\.body\b/);
assert.doesNotMatch(read("breeding-intelligence-tools.js"), /observe\(document\.body\b/);
console.log("follow-up DOM lifecycle regression tests passed");
