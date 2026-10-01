"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const howTo = read("how-to/index.html");
const navigation = read("how-to-navigation-v1.8.1.js");
const build = read("herdharbor-build.js");
const worker = read("service-worker.js");
const settings = read("settings-runtime-v1.8.3.js");
const pkg = JSON.parse(read("package.json"));

const requiredAnchors = [
  "guide-add-animal",
  "guide-edit-animal",
  "guide-create-pedigree",
  "guide-import-paper-pedigree",
  "guide-add-breeding",
  "guide-record-pregnancy",
  "guide-record-birth-litter",
  "guide-record-weights",
  "guide-rabbit-genetics-pair-analysis",
  "guide-health-basic",
  "guide-health-episode",
  "guide-sell-animal",
  "guide-transfer-animal",
  "guide-spreadsheet-import",
  "guide-spreadsheet-export",
  "guide-qr-workflow",
  "guide-cloud-sync-states",
  "guide-retry-sync",
  "guide-local-backup",
  "guide-local-cloud-comparison",
  "guide-recovery-last-known-good",
  "guide-trial-member-free-adult",
  "guide-account-basics"
];

test("Help Center uses current production language and membership guidance", () => {
  assert.match(howTo, /HerdHarbor How To Center/);
  assert.doesNotMatch(howTo, /Alpha v\d/i);
  assert.doesNotMatch(howTo, /Launch trial runs through September 30, 2026/);
  assert.doesNotMatch(howTo, /Paid subscriptions begin October 1, 2026/);
  assert.doesNotMatch(howTo, /fall back to Junior/i);
  assert.match(howTo, /one calendar month of Member trial access/i);
  assert.match(howTo, /Free Adult is the permanent adult fallback/i);
  assert.match(howTo, /five active animals/i);
  assert.match(howTo, /Junior remains a separate account path/i);
  assert.match(howTo, /herd records are not deleted/i);
});

test("every required Phase 7 workflow has a stable direct anchor", () => {
  for (const anchor of requiredAnchors) {
    assert.match(howTo, new RegExp('id="' + anchor + '"'), "missing anchor " + anchor);
  }
  assert.match(howTo, /id="workflow-index"/);
  assert.match(howTo, /href="#workflow-index"/);
});

test("workflow guides link back to canonical app areas", () => {
  for (const route of ["animals", "pedigrees", "breeding", "litters", "health", "sales", "settings"]) {
    assert.match(howTo, new RegExp('href="/#' + route + '"'), "missing route link #" + route);
  }
  assert.match(howTo, /review draft/i);
  assert.match(howTo, /does not silently change farm records/i);
  assert.match(howTo, /Weights belong to the canonical Health record/i);
  assert.match(howTo, /provenance and duplicate protection/i);
  assert.match(howTo, /do not clear local data as a sync repair step/i);
});

test("Help navigation remains part of the app and offline shell", () => {
  assert.match(build, /how-to-navigation-v1\.8\.1\.js\?v=1/);
  assert.match(navigation, /const HOW_TO_URL = "\/how-to\/"/);
  assert.match(navigation, /herdharbor-how-to-nav/);
  assert.match(navigation, /herdharbor-how-to-shortcut/);
  assert.match(worker, /\.\/how-to-navigation-v1\.8\.1\.js\?v=1/);
  assert.match(worker, /\.\/how-to\//);
  assert.match(settings, /href="\/how-to\/"[^>]*>How To Center/);
});

test("Help Center search and mobile navigation remain usable", () => {
  assert.match(howTo, /id="guide-search"/);
  assert.match(howTo, /id="guide-grid"/);
  assert.match(howTo, /@media\(max-width:620px\)/);
  assert.match(howTo, /grid-template-columns:1fr/);
  assert.match(howTo, /scroll-margin-top:90px/);
  assert.match(howTo, /Back to app/);
});

test("Rabbit genetics guide explains uncertainty ranges and evidence without overstating certainty", () => {
  assert.match(howTo, /How to Use Rabbit Genetics & Pair Analysis/);
  assert.match(howTo, /Do not add the displayed ranges together/);
  assert.match(howTo, /minimum and maximum across those valid scenarios/i);
  assert.match(howTo, /Uncertainty preserved/);
  assert.match(howTo, /25% V\/V, 50% V\/v, and 25% v\/v/);
  assert.match(howTo, /No Mendelian percentage/);\n  assert.match(howTo, /Breed context keeps unrelated specialty loci out of the main view/);\n  assert.match(howTo, /two Holland Lops will not have Rex, Satin, Lionhead-mane/);
  assert.match(howTo, /Evidence used/);
  assert.match(howTo, /incomplete pedigree does not prove the pair is unrelated/i);
  assert.match(howTo, /How to make the prediction more precise/);
  assert.match(howTo, /not a DNA test/i);
});

test("Help documentation does not create a second business-rule engine", () => {
  assert.doesNotMatch(howTo, /localStorage\.|sessionStorage\.|indexedDB\.|createClient\s*\(/);
  assert.doesNotMatch(howTo, /state\.(?:animals|health|breedings|litters|tasks|sales)\.(?:push|splice)/);
  assert.match(pkg.scripts["test:v1.8.3"], /help-center-v1\.8\.3\.test\.cjs/);
});
