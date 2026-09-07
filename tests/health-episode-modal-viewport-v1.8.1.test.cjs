"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const css = fs.readFileSync("mobile-viewport-hotfix-v1.8.0.css", "utf8");
const workflow = fs.readFileSync("workflow-phase1-v1.7.1.js", "utf8");
const worker = fs.readFileSync("service-worker.js", "utf8");

test("Health Intelligence overlay owns the full viewport", () => {
  assert.match(css, /#hh-health-intelligence-modal\.hh-hi-overlay\s*\{[\s\S]*position:\s*fixed;[\s\S]*inset:\s*0;[\s\S]*display:\s*flex;[\s\S]*align-items:\s*center;[\s\S]*justify-content:\s*center;/);
  assert.match(css, /#hh-health-intelligence-modal\.hh-hi-overlay\s*\{[\s\S]*height:\s*100dvh;[\s\S]*overflow:\s*hidden;/);
});

test("Health Intelligence modal cannot inherit off-screen generic modal positioning", () => {
  assert.match(css, /#hh-health-intelligence-modal \.hh-hi-modal\s*\{[\s\S]*position:\s*relative;[\s\S]*inset:\s*auto;[\s\S]*transform:\s*none;/);
  assert.match(css, /#hh-health-intelligence-modal \.hh-hi-modal\s*\{[\s\S]*width:\s*min\(880px, 100%\);[\s\S]*max-height:\s*calc\(100dvh - 40px\);[\s\S]*overflow-y:\s*auto;/);
});

test("Health Intelligence form remains usable on narrow and safe-area devices", () => {
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*#hh-health-intelligence-modal\.hh-hi-overlay[\s\S]*safe-area-inset-top[\s\S]*safe-area-inset-right[\s\S]*safe-area-inset-bottom[\s\S]*safe-area-inset-left/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*#hh-health-intelligence-modal \.hh-hi-modal[\s\S]*width:\s*100%;[\s\S]*max-height:\s*100%;/);
  assert.match(css, /#hh-health-intelligence-modal input,[\s\S]*#hh-health-intelligence-modal select,[\s\S]*#hh-health-intelligence-modal textarea[\s\S]*max-width:\s*100%;/);
});

test("animal profile closes before Health Intelligence opens and hotfix asset remains network-first", () => {
  assert.match(workflow, /function openHealthIntelligence\(animalId,action='episode'\)\{closeCoreModal\(\);/);
  assert.match(worker, /"\/mobile-viewport-hotfix-v1\.8\.0\.css"/);
  assert.match(worker, /fetch\(request, \{ cache: "no-store" \}\)/);
});
