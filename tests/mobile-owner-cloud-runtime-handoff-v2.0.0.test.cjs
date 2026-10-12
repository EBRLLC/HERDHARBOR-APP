"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const cloud = fs.readFileSync(path.join(root, "herdharbor-cloud.js"), "utf8");
const app = fs.readFileSync(path.join(root, "herdharbor-app-runtime.js"), "utf8");

test("the live runtime can adopt a verified persisted cloud operation after onboarding rendered", () => {
  const start = app.indexOf("  function applyVerifiedCloudState() {");
  const end = app.indexOf("  function showOnboarding()", start);
  assert.ok(start >= 0 && end > start);
  let persisted = { profile: null, animals: [] };
  const events = [];
  const factory = new Function("loadState", "showApp", "refreshSyncStatus", "stateHolder",
    `let state = null;
    ${app.slice(start, end)}
    return applyVerifiedCloudState;`);
  // The tested function has a closure-local state. For a simple proof of the
  // transition, use a second factory with an exposed state accessor.
  const maker = new Function("loadState", "showApp", "refreshSyncStatus",
    `let state = { profile: null };
     ${app.slice(start, end)}
     return { applyVerifiedCloudState, current: () => state };`);
  const harness = maker(() => persisted, () => events.push("dashboard"), () => events.push("sync-status"));
  assert.equal(harness.applyVerifiedCloudState(), false);
  assert.deepEqual(events, []);
  persisted = { profile: { operationName: "Existing operation", ownerName: "Owner" }, animals: [{ id: "a1" }] };
  assert.equal(harness.applyVerifiedCloudState(), true);
  assert.equal(harness.current().animals.length, 1);
  assert.deepEqual(events, ["dashboard", "sync-status"]);
  assert.match(app, /getState: \(\) => state,\s*applyVerifiedCloudState,/);
});

test("a pristine first-use owner device can load verified legacy cloud records before normalized baseline work", () => {
  const start = cloud.indexOf("  async function hydrateUserDataOnce(");
  const end = cloud.indexOf("  async function hydrateUserData(", start);
  assert.ok(start > 0 && end > start);
  const body = cloud.slice(start, end);
  const pristine = body.indexOf("const pristineDevice = hasConfiguredOperationProfile(data.app_state)");
  const baseline = body.indexOf("const baselineRefresh = pristineDevice");
  const activeWrite = body.indexOf("setActiveUserData(userId, deviceCloudRaw);", pristine);
  const recovery = body.indexOf("window.HerdHarborApp?.applyVerifiedCloudState?.() === true", activeWrite);
  const unlocked = body.indexOf("unlockApp();", recovery);
  const background = body.indexOf("refreshDualWriteBaselineForRemoteState().catch(", unlocked);
  assert.ok(pristine >= 0 && baseline > pristine && activeWrite > baseline);
  assert.ok(recovery > activeWrite && unlocked > recovery && background > unlocked);
  assert.match(body.slice(pristine,baseline), /!hasConfiguredOperationProfile\(activeRaw \|\| cachedRaw\)/);
  assert.match(body.slice(pristine,baseline), /!hasUnsyncedDomainRecords\(activeRaw \|\| cachedRaw\)/);
  assert.match(body.slice(baseline,activeWrite), /: await refreshDualWriteBaselineForRemoteState\(\)/);
});

test("cloud snapshot failure cannot surface a new-operation screen over an existing authenticated account", () => {
  const start = cloud.indexOf("const baselineRefresh = pristineDevice");
  const end = cloud.indexOf("setActiveUserData(userId, deviceCloudRaw);", start);
  const body = cloud.slice(start, end);
  assert.match(body, /if \(baselineRefresh\?\.ok === false\)/);
  assert.match(body, /if \(!hasConfiguredOperationProfile\(activeRaw \|\| cachedRaw\)\) \{\s*showAccountBoundaryRecovery\(/);
});

test("a configured local operation retains the original dual-write baseline-first protection", () => {
  const start = cloud.indexOf("const pristineDevice = hasConfiguredOperationProfile(data.app_state)");
  const end = cloud.indexOf("setActiveUserData(userId, deviceCloudRaw);", start);
  const body = cloud.slice(start,end);
  assert.match(body, /const baselineRefresh = pristineDevice[\s\S]*: await refreshDualWriteBaselineForRemoteState\(\)/);
  assert.ok(body.indexOf("const baselineRefresh") < body.indexOf("if (baselineRefresh?.ok === false)"));
  assert.match(body, /!hasUnsyncedDomainRecords/);
});

test("a missing local profile always requires full cloud hydration even with a cached revision", () => {
  const start = cloud.indexOf("const canUseVersionOnlyPrefetch =");
  const end = cloud.indexOf("const baselineRestorePromise =", start);
  assert.ok(start >= 0 && end > start);
  const guard = cloud.slice(start, end);
  assert.ok(guard.includes("hasConfiguredOperationProfile(activeRaw)"),
    "version-only fetch must never treat an empty local onboarding state as a loaded operation");
  assert.ok(guard.includes("Boolean(knownCloudVersion)"));
});
