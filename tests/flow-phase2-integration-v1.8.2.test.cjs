const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const build = fs.readFileSync(path.join(root, "herdharbor-build.js"), "utf8");
const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const phase2 = fs.readFileSync(path.join(root, "flow-phase2-v1.8.2.js"), "utf8");

test("Phase Two loads before the Phase One completion click interceptor", () => {
  const phase2Index = build.indexOf('addScript("hh-flow-phase2-v182"');
  const completionIndex = build.indexOf('addScript("hh-flow-phase1-completion-v182"');
  assert.ok(phase2Index >= 0, "Phase Two script is loaded");
  assert.ok(completionIndex > phase2Index, "Phase Two registers animal routing before Phase One completion");
});

test("Phase Two profile assets are available offline and network-first", () => {
  assert.match(worker, /\.\/flow-phase2-v1\.8\.2\.js\?v=1/);
  assert.match(worker, /\.\/flow-phase2-v1\.8\.2\.css\?v=1/);
  assert.match(worker, /\/flow-phase2-v1\.8\.2\.js/);
  assert.match(worker, /\/flow-phase2-v1\.8\.2\.css/);
});

test("Phase Two reuses the established Phase One profile model", () => {
  assert.match(phase2, /HerdHarborPhase1Workflow/);
  assert.match(phase2, /profileModel\?\./);
  assert.match(phase2, /timelineRows\?\./);
  assert.doesNotMatch(phase2, /localStorage\.setItem\([^)]*animal/i);
});

test("Phase Two exposes deep-link and browser navigation hooks", () => {
  assert.match(phase2, /#\$\{PROFILE_ROUTE\}\/\$\{id\}/);
  assert.match(phase2, /pushState/);
  assert.match(phase2, /replaceState/);
  assert.match(phase2, /popstate/);
  assert.match(phase2, /hashchange/);
});
