"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const cloud = fs.readFileSync(path.join(root, "herdharbor-cloud.js"), "utf8");

test("cross-device refresh rechecks dirty state after the remote fetch", () => {
  const start = cloud.indexOf("async function checkForCloudChanges()");
  const end = cloud.indexOf("\n  function ensureStyles()", start);
  assert.ok(start >= 0 && end > start, "checkForCloudChanges is present");
  const body = cloud.slice(start, end);

  const fetchIndex = body.indexOf("await fetchCloudRecord(userId)");
  const postFetchDirtyIndex = body.indexOf(
    'originalGetItem.call(localStorage, dirtyKey(userId)) === "1"',
    fetchIndex
  );
  const remoteReadIndex = body.indexOf(
    "const remoteRaw = JSON.stringify(data.app_state)",
    fetchIndex
  );
  const conflictIndex = body.indexOf(
    '"Sync paused because this device and another device both have changes."',
    fetchIndex
  );

  assert.ok(fetchIndex >= 0, "cloud refresh performs a remote fetch");
  assert.ok(postFetchDirtyIndex > fetchIndex, "dirty state is rechecked after the fetch resolves");
  assert.ok(remoteReadIndex > postFetchDirtyIndex, "post-fetch dirty work is routed before stale-state conflict evaluation");
  assert.ok(conflictIndex > remoteReadIndex, "real conflict handling remains after the rebase opportunity");
  assert.match(
    body.slice(postFetchDirtyIndex, remoteReadIndex),
    /return syncNow\(\)/,
    "a local edit made during refresh is sent through the normal merge/save pipeline"
  );
});


test("cloud refresh does not overwrite an edit made during recovery snapshot creation", () => {
  const start = cloud.indexOf("async function checkForCloudChanges()");
  const end = cloud.indexOf("\n  function ensureStyles()", start);
  const body = cloud.slice(start, end);

  const snapshotIndex = body.indexOf(
    'await recordRecoverySnapshot(userId, activeRaw, "Local copy before receiving another device\'s changes")'
  );
  const latestReadIndex = body.indexOf(
    "const latestActiveRaw = activeStateRaw()",
    snapshotIndex
  );
  const replaceIndex = body.indexOf(
    "setActiveUserData(userId, deviceCloudRaw)",
    snapshotIndex
  );

  assert.ok(snapshotIndex >= 0, "cloud refresh preserves a local recovery copy");
  assert.ok(latestReadIndex > snapshotIndex, "active state is re-read after the asynchronous snapshot");
  assert.ok(replaceIndex > latestReadIndex, "cloud replacement only happens after the second local-state guard");

  const guarded = body.slice(latestReadIndex, replaceIndex);
  assert.match(guarded, /dirtyKey\(userId\)/, "dirty state is checked again before replacement");
  assert.match(guarded, /!sameState\(latestActiveRaw, activeRaw\)/, "unexpected local changes are also detected");
  assert.match(guarded, /return syncNow\(\)/, "new local work is routed through merge/save instead of overwritten");
});


test("a clean device with confirmed cloud history captures its pre-edit state before becoming dirty", () => {
  const helperStart = cloud.indexOf("async function captureCleanBaselineBeforeLocalCommit");
  const helperEnd = cloud.indexOf("\n  async function handleCanonicalStateCommit", helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, "baseline capture helper is present");
  const helper = cloud.slice(helperStart, helperEnd);

  assert.match(helper, /originalGetItem\.call\(localStorage, dirtyKey\(userId\)\) === "1"/);
  assert.match(helper, /!originalGetItem\.call\(localStorage, versionKey\(userId\)\)/);
  assert.match(helper, /await writeCloudBaseline\(userId, previousValue\)/);

  const bridgeStart = cloud.indexOf("async function handleCanonicalStateCommit(detail)");
  const bridgeEnd = cloud.indexOf("\n  function installStateStoreBridge", bridgeStart);
  const bridge = cloud.slice(bridgeStart, bridgeEnd);
  assert.match(bridge, /detail\.source !== "local"/);
  assert.match(bridge, /!detail\.cloudRelevant/);
  const captureIndex = bridge.indexOf("captureCleanBaselineBeforeLocalCommit(userId, previousValue)");
  const dirtyIndex = bridge.indexOf('safeStorageSet(dirtyKey(userId), "1")');
  assert.ok(captureIndex >= 0 && dirtyIndex > captureIndex, "baseline capture runs before dirty state is set");
  assert.match(bridge, /scheduleCloudSync\(rawValue, writeSequence\)/);
});

test("a missing baseline is never invented once the device is dirty or lacks a confirmed cloud revision", () => {
  const start = cloud.indexOf("async function captureCleanBaselineBeforeLocalCommit");
  const end = cloud.indexOf("\n  async function handleCanonicalStateCommit", start);
  const body = cloud.slice(start, end);

  assert.match(body, /originalGetItem\.call\(localStorage, dirtyKey\(userId\)\) === "1"/);
  assert.match(body, /!originalGetItem\.call\(localStorage, versionKey\(userId\)\)/);
});

test("true same-field cross-device conflicts remain protected by the three-way merge", () => {
  const start = cloud.indexOf("async function syncValueToCloud");
  const end = cloud.indexOf("\n  async function drainSyncQueue", start);
  assert.ok(start >= 0 && end > start, "syncValueToCloud is present");
  const body = cloud.slice(start, end);

  assert.match(
    body,
    /mergeRawStates\(confirmedBase, rawValue, remoteRaw\)/,
    "remote changes still use the existing three-way merge"
  );
  assert.match(
    body,
    /Sync paused because the same record changed on two devices/,
    "overlapping edits still stop instead of silently overwriting"
  );
});

test("cross-device refresh fix does not disable automatic cloud-change checks", () => {
  assert.match(cloud, /window\.addEventListener\("focus", \(\) => \{\s*checkForCloudChanges\(\);/);
  assert.match(cloud, /document\.addEventListener\("visibilitychange"/);
  assert.doesNotMatch(cloud, /beforeunload/);
});
