"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const pwa = read("pwa.js");
const worker = read("service-worker.js");
const geneticsV2 = read("rabbit-genetics-engine-v2.js");
const html = read("index.html");

const activeV151 = [
  "herdharbor-release-v1.5.1.js",
  "herdharbor-membership-v1.5.1.js",
  "herdharbor-billing-v1.5.1.js",
  "herdharbor-access-cache-v1.5.1.js",
  "herdharbor-admin-v1.5.1.js",
  "herdharbor-monitoring-config.js",
  "pedigree-genetics-v1.5.1.js",
  "breeding-intelligence-core-v1.5.1.js",
  "rabbit-records-v1.5.1.js",
  "rabbit-genetics-engine-v1.5.1.js",
  "rabbit-genetics-runtime-v1.5.1.js",
  "breeding-intelligence-v1.5.1.js",
  "breeding-pair-v1.5.1.js",
  "rabbit-genetics-ui-v1.5.1.js",
  "breeding-intelligence-tools-v1.5.1.js",
  "shows-v1.5.1.js",
  "shows-v1.5.1-hardening.js",
  "shows-v1.5.1-performance.js"
];

for (const file of activeV151) {
  assert.ok(fs.existsSync(path.join(root, file)), "missing consolidated runtime asset: " + file);
  assert.ok((pwa + "\n" + html).includes(file + "?v=1.5.1"), "startup loader does not load " + file + " as v1.5.1");
  assert.ok(worker.includes("./" + file + "?v=1.5.1"), "service-worker.js does not precache " + file + " as v1.5.1");
}

const legacyRuntimeNames = [
  "herdharbor-release-v1.4.5.js",
  "pedigree-genetics-v1.4.5.js",
  "pedigree-genetics-v1.4.5.css",
  "rabbit-records-v1.4.5.js",
  "rabbit-genetics-engine-v1.4.5.js",
  "rabbit-genetics-runtime-v1.4.5.js",
  "rabbit-genetics-ui-v1.4.5.js",
  "breeding-pair-hotfix-v1.4.2.js",
  "shows-v1.5.0.js",
  "shows-v1.5.0.css",
  "shows-v1.5.0-hardening.js",
  "shows-v1.5.0-performance.js",
  "breeding-intelligence-core.js",
  "breeding-intelligence.css",
  "breeding-intelligence.js",
  "breeding-intelligence-tools.js"
];

for (const legacy of legacyRuntimeNames) {
assert.doesNotMatch(geneticsV2, /breeding-intelligence-core\.js['"]/,"v2 genetics engine does not require the legacy unversioned core");
  assert.doesNotMatch(pwa + "\n" + html, new RegExp(legacy.replaceAll(".", "\\.")), "startup loader still requests legacy runtime asset " + legacy);
  assert.doesNotMatch(worker, new RegExp(legacy.replaceAll(".", "\\.")), "service-worker.js still routes legacy runtime asset " + legacy);
  assert.doesNotMatch(html, new RegExp(legacy.replaceAll(".", "\\.")), "index.html still embeds legacy runtime asset " + legacy);
}

assert.ok(pwa.includes('const APP_VERSION = "1.5.1"'));
assert.ok(worker.includes("v1.5.1-alpha-stability-membership-review-3"));
assert.ok(worker.includes("pwa.js?v=25"));
assert.ok(!pwa.includes(";" + String.fromCharCode(92) + "n    if"), "pwa.js contains no literal newline escape in executable source");
assert.ok(!read("herdharbor-membership-v1.5.1.js").includes(";" + String.fromCharCode(92) + "n    if"), "membership source contains no literal newline escape in executable source");
assert.ok(!read("pedigree-visual.js").includes(";" + String.fromCharCode(92) + "n    if"), "pedigree source contains no literal newline escape in executable source");
assert.ok(!read("spreadsheet-import.js").includes(";" + String.fromCharCode(92) + "n    if"), "spreadsheet source contains no literal newline escape in executable source");

console.log("v1.5.1 runtime consolidation tests passed");
