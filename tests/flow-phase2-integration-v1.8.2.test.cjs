const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const build = fs.readFileSync(path.join(root, "herdharbor-build.js"), "utf8");
const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const phase2 = fs.readFileSync(path.join(root, "flow-phase2-v1.8.2.js"), "utf8");
const lifecycle = fs.readFileSync(path.join(root, "flow-phase2-lifecycle-v1.8.2.js"), "utf8");
const finish = fs.readFileSync(path.join(root, "flow-phase2-profile-finish-v1.8.2.js"), "utf8");

test("Phase Two layers load in order before the Phase One completion click interceptor", () => {
  const phase2Index = build.indexOf('addScript("hh-flow-phase2-v182"');
  const lifecycleIndex = build.indexOf('addScript("hh-flow-phase2-lifecycle-v182"');
  const finishIndex = build.indexOf('addScript("hh-flow-phase2-profile-finish-v182"');
  const completionIndex = build.indexOf('addScript("hh-flow-phase1-completion-v182"');
  assert.ok(phase2Index >= 0, "Phase Two profile script is loaded");
  assert.ok(lifecycleIndex > phase2Index, "Lifecycle enhancement loads after profile routing");
  assert.ok(finishIndex > lifecycleIndex, "Profile finish loads after lifecycle rendering");
  assert.ok(completionIndex > finishIndex, "Phase Two registers before Phase One completion");
});

test("all Phase Two profile assets are available offline and network-first", () => {
  for (const asset of [
    "flow-phase2-v1.8.2.js",
    "flow-phase2-v1.8.2.css",
    "flow-phase2-lifecycle-v1.8.2.js",
    "flow-phase2-lifecycle-v1.8.2.css",
    "flow-phase2-profile-finish-v1.8.2.js",
    "flow-phase2-profile-finish-v1.8.2.css"
  ]) {
    const escaped = asset.replace(/[.]/g, "\\.");
    assert.match(worker, new RegExp(`\\.\\/${escaped}\\?v=1`), `${asset} is in the app shell`);
    assert.match(worker, new RegExp(`\\/${escaped}`), `${asset} is network-first`);
  }
});

test("Phase Two reuses established canonical domain state instead of creating parallel animal records", () => {
  assert.match(phase2, /HerdHarborPhase1Workflow/);
  assert.match(phase2, /profileModel\?\./);
  assert.match(phase2, /timelineRows\?\./);
  assert.match(lifecycle, /stateNow/);
  assert.match(lifecycle, /breedings/);
  assert.match(lifecycle, /litters/);
  assert.match(finish, /salesForAnimal/);
  assert.match(finish, /ownershipHistory/);
  for (const source of [phase2, lifecycle, finish]) {
    assert.doesNotMatch(source, /localStorage\.setItem\([^)]*animal/i);
    assert.doesNotMatch(source, /commitState\([^)]*breedings/i);
  }
});

test("Phase Two exposes deep-link and browser navigation hooks", () => {
  assert.match(phase2, /#\$\{PROFILE_ROUTE\}\/\$\{id\}/);
  assert.match(phase2, /pushState/);
  assert.match(phase2, /replaceState/);
  assert.match(phase2, /popstate/);
  assert.match(phase2, /hashchange/);
});

test("Phase Two lifecycle hands edits back to existing core forms", () => {
  assert.match(lifecycle, /#breeding-form/);
  assert.match(lifecycle, /#litter-form/);
  assert.match(lifecycle, /#offspring-form/);
  assert.match(finish, /#sale-form/);
  assert.match(finish, /data-sale-animal/);
});
