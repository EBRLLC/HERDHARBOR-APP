"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const howTo = read("how-to/index.html");
const appShell = read("index.html");
const navigation = read("how-to-navigation-v1.8.1.js");
const build = read("herdharbor-build.js");
const worker = read("service-worker.js");
const settings = read("settings-runtime-v1.8.3.js");
const pkg = JSON.parse(read("package.json"));

const requiredAnchors = [
  "guide-add-animal",
  "guide-edit-animal",
  "guide-create-pedigree",
  "guide-customize-print-pedigree",
  "guide-birth-certificate",
  "guide-new-owner-package",
  "guide-add-breeding",
  "guide-record-pregnancy",
  "guide-record-birth-litter",
  "guide-record-weights",
  "guide-rabbit-genetics-pair-analysis",
  "guide-health-basic",
  "guide-health-episode",
  "guide-show-entry",
  "guide-production-record",
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
  assert.match(howTo, /Free Adult is an automatic fallback state, not a selectable account or signup plan/i);
  assert.match(howTo, /five active animals/i);
  assert.match(howTo, /Junior remains a separate selectable signup path/i);
  assert.match(howTo, /does not delete the animals or records/i);
});

test("canonical Help Center order stays stable and complete", () => {
  assert.match(howTo, /HERDHARBOR HOW-TO CANONICAL/);
  assert.match(howTo, /20 guides available/);
  assert.doesNotMatch(howTo, /Visual walkthrough coming soon/);
  assert.doesNotMatch(howTo, /href="\/#/);

  const expected = [
    "getting-started","animals","pedigrees","breeding","litters","health","growth","genetics",
    "tasks","analytics","sales","marketplace","subscription","sync","youth","symptoms","budget","settings",
    "workflow-index","faq"
  ];
  const actual = [...howTo.matchAll(/<section class="section" id="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(actual, expected);
  assert.equal([...howTo.matchAll(/<a class="guide-card"[^>]*href="#/g)].length, 20);
  assert.match(howTo, /Weight, Treatment, Medication, Vaccination, Observation, or Veterinary visit/);
  assert.match(howTo, /Free Adult is an automatic fallback state, not a selectable account or signup plan/);
  assert.doesNotMatch(howTo, /value="free_adult"/i);
});

test("every required Phase 7 workflow has a stable direct anchor", () => {
  for (const anchor of requiredAnchors) {
    assert.match(howTo, new RegExp('id="' + anchor + '"'), "missing anchor " + anchor);
  }
  assert.match(howTo, /id="workflow-index"/);
  assert.match(howTo, /href="#workflow-index"/);
});

test("workflow guides link back to canonical app areas", () => {
  for (const route of ["animals", "pedigrees", "breeding", "litters", "health", "symptoms", "analytics", "budget", "sales", "settings"]) {
    assert.match(howTo, new RegExp('href="https://app\\.herdharbor\\.com/#' + route + '"'), "missing route link #" + route);
  }
  assert.match(howTo, /Print \/ Save PDF/);
  assert.match(howTo, /Add a show entry and result/);
  assert.match(howTo, /Add a production record/);
  assert.match(howTo, /Weights belong to the canonical Health record/i);
  assert.match(howTo, /provenance and duplicate protection/i);
  assert.match(howTo, /do not clear local data as a sync repair step/i);
});

test("How To Center covers every user-facing main navigation route", () => {
  const navRoutes = [...appShell.matchAll(/<button class="nav-item[^"]*"[^>]*data-route="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((route) => route !== "admin");
  const documentedRoutes = new Set(
    [...howTo.matchAll(/class="guide-card"[^>]*data-app-route="([^"]+)"/g)]
      .flatMap((match) => match[1].split(/\s+/).filter(Boolean))
  );
  for (const route of navRoutes) {
    assert.ok(documentedRoutes.has(route), "How To Center is missing main app route: " + route);
  }
  for (const id of ["symptoms", "budget", "settings"]) {
    assert.match(howTo, new RegExp('id="' + id + '"'), "missing detailed guide section #" + id);
  }
  assert.match(howTo, /href="#faq"/);
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

test("How To topic cards use the finished website icon system instead of numbered placeholders", () => {
  assert.match(howTo, /<img class="brand-mark" src="https:\/\/herdharbor\.com\/assets\/herdharbor-icon\.png"/);
  for (const icon of ["i-start","i-animal","i-pedigree","i-breeding","i-litter","i-health","i-growth","i-genetics","i-tasks","i-analytics","i-sales","i-marketplace","i-member","i-cloud","i-youth","i-symptoms","i-budget","i-settings","i-guides","i-help"]) {
    assert.match(howTo, new RegExp('<symbol id="' + icon + '"'));
    assert.match(howTo, new RegExp('<use href="#' + icon + '"><\\/use>'));
  }
  assert.match(howTo, /\.guide-icon svg\{[^}]*stroke:#fff/);
  assert.match(howTo, /linear-gradient\(145deg,#2E7D7B,#246866\)/);
  assert.doesNotMatch(howTo, /<span class="guide-icon">\d{2}<\/span>/);
});

test("Marketplace guide matches the separate website workflow", () => {
  assert.match(howTo, /id="marketplace"/);
  assert.match(howTo, /href="https:\/\/herdharbor\.com\/marketplace\/"/);
  assert.match(howTo, /Anyone can view active listings/);
  assert.match(howTo, /Complete Seller Profile before publishing/);
  assert.match(howTo, /Select From My Herd/);
  assert.match(howTo, /Do I need a Seller Profile to use Marketplace\?/);
});

test("customer help does not expose tester-only AI entry workflows", () => {
  assert.doesNotMatch(howTo, /guide-import-paper-pedigree|Paper Pedigree AI|voice-assisted entry|photo-assisted entry|AI-assisted entry/i);
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
  assert.match(howTo, /How to Use Genetics & Rabbit Pair Analysis/);
  assert.match(howTo, /Do not add the displayed ranges together/);
  assert.match(howTo, /minimum and maximum across those valid scenarios/i);
  assert.match(howTo, /Uncertainty preserved/);
  assert.match(howTo, /25% V\/V, 50% V\/v, and 25% v\/v/);
  assert.match(howTo, /No Mendelian percentage/);
  assert.match(howTo, /Black Harlequin or Black Magpie describe coat phenotype\/pattern/);
  assert.match(howTo, /More genetically possible colors/);
  assert.doesNotMatch(howTo, /\\n\s*<div class="step"><strong>Breed context/); 
  assert.match(howTo, /Breed context keeps unrelated specialty loci out of the main view/);
  assert.match(howTo, /two Holland Lops will not have Rex, Satin, Lionhead-mane/);
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
