"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = name => fs.readFileSync(path.join(__dirname, "..", name), "utf8");

test("new animal species and starter breed catalogs persist across saved-settings upgrades", () => {
  const runtime = read("herdharbor-app-runtime.js");
  assert.match(runtime, /"Dog", "Cat", "Guinea Pig", "Horse"/);
  assert.match(runtime, /Cat: \["Abyssinian"/);
  assert.match(runtime, /"Guinea Pig": \["Abyssinian"/);
  assert.match(runtime, /\["Dog", "Cat", "Guinea Pig", "Horse"\]\.forEach/);
});

test("core loads before breeding runtime in browser and is available offline", () => {
  const html = read("index.html");
  const worker = read("service-worker.js");
  const coreScript = 'feline-cavy-breeding-core-v2.0.3.js?v=1';
  assert.ok(html.includes(coreScript));
  assert.ok(html.indexOf(coreScript) < html.indexOf("breeding-litter-runtime-v1.8.3.js"));
  assert.ok(worker.includes("./" + coreScript));
  assert.match(worker, /herdharbor-shell-v2\\.0\\.2-normalized-cloud-1/);
});

test("actual breeding and litter saves invoke the species safety checks", () => {
  const runtime = read("breeding-litter-runtime-v1.8.3.js");
  assert.match(runtime, /familyCore\.validateBreeding\(stateNow\(\), data/);
  assert.match(runtime, /familyCore\.validateBirth\(stateNow\(\), data/);
  assert.match(runtime, /schedule\.dueStartDate && schedule\.dueEndDate/);
  assert.match(runtime, /Cat: \{ gestationDays: 65/);
  assert.match(runtime, /"Guinea Pig": \{ gestationDays: 68/);
});

test("animal profile displays species-specific cat/cavy breeding entry", () => {
  const profile = read("flow-phase2-v1.8.2.js");
  assert.match(profile, /HerdHarborFelineCavyCore\?\.profileFor/);
  assert.match(profile, /const label = family \? "Record mating"/);
});

test("release identity remains at 2.0.2 while 2.0.3 is a draft feature", () => {
  const build = read("herdharbor-build.js");
  assert.match(build, /2\.0\.2/);
});
