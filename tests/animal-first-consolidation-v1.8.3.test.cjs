"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const packageJson = JSON.parse(read("package.json"));

test("Phase 3 consolidation removes the legacy animal-action modal bridge", () => {
  const flow = read("flow-phase2-v1.8.2.js");
  assert.doesNotMatch(flow, /function openCoreAction/);
  assert.doesNotMatch(flow, /pendingReturn/);
  assert.doesNotMatch(flow, /coreModalBypass/);
  assert.doesNotMatch(flow, /#modal-content \.hh-p1-profile-hub/);
  assert.match(flow, /HerdHarborAnimalActionRouter\?\.open\?\./);
});

test("Today animal work prefers the canonical Phase Two profile before legacy fallback", () => {
  const flow = read("flow-phase1-v1.8.2.js");
  const start = flow.indexOf("function openAnimalTarget");
  const end = flow.indexOf("function openRecordTarget", start);
  const block = flow.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(block, /HerdHarborFlowPhase2\?\.openAnimalProfile/);
  assert.ok(block.indexOf("HerdHarborFlowPhase2") < block.indexOf('clickRoute("animals")'));
});

test("profile Quick Add uses the shared animal action router and does not create replacement domain records", () => {
  const workflow = read("workflow-phase1-v1.7.1.js");
  assert.match(workflow, /function profileQuickActions/);
  assert.match(workflow, /HerdHarborFlowPhase2\?\.parseProfileHash/);
  assert.match(workflow, /data-hh-p1-animal-quick/);
  assert.match(workflow, /HerdHarborAnimalActionRouter\?\.open\?\./);
  const quickStart = workflow.indexOf("function enhanceQuickAdd");
  const quickEnd = workflow.indexOf("function enhance()", quickStart);
  const quickBlock = workflow.slice(quickStart, quickEnd);
  assert.doesNotMatch(quickBlock, /state\.(?:animals|health|breedings|litters|pedigrees)\.(?:push|splice)/);
});

test("canonical runtime wrappers stay narrow after Animals/Profile extraction", () => {
  const runtime = read("herdharbor-app-runtime.js");
  const extracted = read("animal-profile-runtime-v1.8.3.js");
  assert.match(runtime, /openAnimalEditor:\s*\(animalId\)\s*=>\s*animalProfileRuntime\(\)\.openEditor\(animalId\)/);
  assert.match(runtime, /openAnimalPedigreePrint:\s*\(animalId\)\s*=>\s*animalProfileRuntime\(\)\.openPedigreePrint\(animalId\)/);
  assert.match(extracted, /function openEditor\(animalId\)/);
  assert.match(extracted, /animalsNow\(\)\.some\(\(animal\) => String\(animal\.id\) === id\)/);
  assert.match(extracted, /function openPedigreePrint\(animalId\)/);
  assert.match(extracted, /deps\.openPrintPedigreeForm\(id\)/);
});

test("Phase 3 does not bump the whole app or activate normalized-sync rollout infrastructure", () => {
  assert.equal(packageJson.version, "1.8.2");
  const build = read("herdharbor-build.js");
  const index = read("index.html");
  for (const asset of [
    "cloud-sync-cohort-gate-v1.8.3.js",
    "cloud-sync-reconciliation-v1.8.3.js",
    "cloud-sync-rollout-control-v1.8.3.js"
  ]) {
    assert.doesNotMatch(build, new RegExp(asset.replace(/[.]/g, "\\.")));
    assert.doesNotMatch(index, new RegExp(asset.replace(/[.]/g, "\\.")));
  }
});

test("v1.8.3 regression gate explicitly includes the animal-first consolidation contract", () => {
  assert.match(packageJson.scripts["test:v1.8.3"], /animal-first-consolidation-v1\.8\.3\.test\.cjs/);
});


test("animal profile mobile contract keeps touch targets, horizontal tabs, safe areas, and long labels usable", () => {
  const css = read("flow-phase2-v1.8.2.css");
  assert.match(css, /\.hh-p2-back,[\s\S]*min-height:\s*44px/);
  assert.match(css, /\.hh-p2-tabs\s*\{[\s\S]*overscroll-behavior-x:\s*contain/);
  assert.match(css, /-webkit-overflow-scrolling:\s*touch/);
  assert.match(css, /scroll-snap-type:\s*x proximity/);
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /env\(safe-area-inset-right\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /env\(safe-area-inset-left\)/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /@media \(max-width: 420px\)/);
});
