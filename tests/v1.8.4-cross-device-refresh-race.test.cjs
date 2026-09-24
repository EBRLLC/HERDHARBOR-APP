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
