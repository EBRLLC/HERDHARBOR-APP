"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const pwa = read("pwa.js");
const worker = read("service-worker.js");
const geneticsV2 = read("rabbit-genetics-engine-advanced-v1.6.1.js");
const pedigreeGenetics = read("pedigree-genetics-v1.6.1.js");
const pedigreeGeneticsCss = read("pedigree-genetics-v1.6.1.css");
const html = read("index.html");

const activeV161 = [
  "herdharbor-release-v1.6.1.js",
  "herdharbor-membership-v1.6.1.js",
  "herdharbor-billing-v1.6.1.js",
  "herdharbor-access-cache-v1.6.1.js",
  "herdharbor-admin-v1.6.1.js",
  "herdharbor-monitoring-config.js",
  "pedigree-genetics-v1.6.1.js",
  "breeding-intelligence-core-v1.6.1.js",
  "rabbit-records-v1.6.1.js",
  "rabbit-genetics-engine-compat-v1.6.1.js",
  "rabbit-genetics-runtime-v1.6.1.js",
  "breeding-intelligence-v1.6.1.js",
  "breeding-pair-v1.6.1.js",
  "rabbit-genetics-ui-compat-v1.6.1.js",
  "breeding-intelligence-tools-v1.6.1.js",
  "shows-v1.6.1.js",
  "shows-v1.6.1-hardening.js",
  "shows-v1.6.1-performance.js"
];

for (const file of activeV161) {
  assert.ok(fs.existsSync(path.join(root, file)), "missing consolidated runtime asset: " + file);
  assert.ok((pwa + "\n" + html).includes(file + "?v=1.6.6") || html.includes(file + "?v=1.6.5"), "startup loader does not load current runtime asset " + file);
  assert.ok(worker.includes("./" + file + "?v=1.6.6"), "service-worker.js does not precache current runtime asset " + file);
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
  assert.doesNotMatch(pwa + "\n" + html, new RegExp(legacy.replaceAll(".", "\\.")), "startup loader still requests legacy runtime asset " + legacy);
  assert.doesNotMatch(worker, new RegExp(legacy.replaceAll(".", "\\.")), "service-worker.js still routes legacy runtime asset " + legacy);
  assert.doesNotMatch(html, new RegExp(legacy.replaceAll(".", "\\.")), "index.html still embeds legacy runtime asset " + legacy);
}

assert.match(pwa, /HerdHarborPedigreeGenetics\?\.start\?\.\(window\)/, "the consolidated pedigree renderer is started after loading");
assert.match(pwa, /schemaVersion: 3/, "the final genetics-ready event advertises schema 3");
assert.ok(html.includes("HerdHarborPedigreeGenetics?.enhanceDocument?.(popup.document, true, window)"), "sale pedigree popup renders genetics before viewing/printing");
assert.match(pedigreeGenetics, /const target=rootWindow\.document\?\.body;/, "pedigree observer uses a resolved body target");
assert.match(pedigreeGenetics, /target\.nodeType!==1/, "pedigree observer rejects non-Node targets");
assert.doesNotMatch(pedigreeGenetics, /observe\(rootWindow\.document\.body/, "pedigree observer never observes a raw body lookup");
assert.match(pedigreeGenetics, /printContext&&doc\.documentElement\?\.classList\)doc\.documentElement\.classList\.add\(\x27hh-pedigree-print-document\x27\)/, "sale pedigree enhancement activates compact print styling");
assert.match(pedigreeGeneticsCss, /html\.hh-pedigree-print-document \.hh-pedigree-genetics\{font-size:7\.3px;/, "compact print genetics sizing is defined");
assert.doesNotMatch(geneticsV2, /breeding-intelligence-core\.js['"]/, "advanced genetics engine does not require the legacy unversioned core");

assert.ok(pwa.includes('const APP_VERSION = window.HerdHarborBuild?.version || "1.6.6"'));
assert.ok(worker.includes("v1.6.6-alpha-completion-debt-1"));
assert.ok(worker.includes("pwa.js?v=27"));
assert.ok(!pwa.includes(";" + String.fromCharCode(92) + "n    if"), "pwa.js contains no literal newline escape in executable source");
assert.ok(!read("herdharbor-membership-v1.6.1.js").includes(";" + String.fromCharCode(92) + "n    if"), "membership source contains no literal newline escape in executable source");
assert.ok(!read("pedigree-visual.js").includes(";" + String.fromCharCode(92) + "n    if"), "pedigree source contains no literal newline escape in executable source");
assert.ok(!read("spreadsheet-import.js").includes(";" + String.fromCharCode(92) + "n    if"), "spreadsheet source contains no literal newline escape in executable source");

console.log("v1.6.6 runtime consolidation tests passed");
