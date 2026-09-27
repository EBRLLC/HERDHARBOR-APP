"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const cloud = fs.readFileSync(path.join(root, "herdharbor-cloud.js"), "utf8");
const flow = fs.readFileSync(path.join(root, "cloud-sync-v2-flow-v1.8.2.js"), "utf8");
const instrumentation = fs.readFileSync(path.join(root, "monitoring", "herdharbor-monitoring-instrumentation.mjs"), "utf8");

test("cloud hotfix debounces large full-state saves and suppresses stale queued writes", () => {
  assert.match(cloud, /const SYNC_DELAY_MS = 2500/);
  assert.match(cloud, /const LARGE_STATE_SYNC_DELAY_MS = 5000/);
  assert.match(cloud, /LARGE_STATE_THRESHOLD_CHARS = 750000/);
  assert.match(cloud, /sequence < writeSequence && pendingSync && !options\.force/);
  assert.match(cloud, /Newer changes queued; saving the latest copy/);
});

test("cloud hotfix preserves provider failure code and message without sending app state", () => {
  assert.match(cloud, /herdharbor:cloud-sync-failure/);
  assert.match(cloud, /error_code: failure\.code/);
  assert.match(cloud, /status_code: failure\.status/);
  assert.match(cloud, /message: failure\.message/);
  const reporter = cloud.slice(cloud.indexOf("function reportCloudSyncFailure"), cloud.indexOf("async function loadAccessProfile"));
  assert.doesNotMatch(reporter, /app_state|rawValue|payload/);
});

test("cloud hotfix backs retries off to two minutes", () => {
  assert.match(flow, /RETRY_DELAYS_MS = \[3000, 10000, 30000, 120000\]/);
  assert.match(flow, /MAX_VISIBLE_RETRY_MS = 120000/);
});

test("monitoring captures the original cloud provider error through the privacy adapter", () => {
  assert.match(instrumentation, /installCloudSyncFailureMonitoring/);
  assert.match(instrumentation, /herdharbor:cloud-sync-failure/);
  assert.match(instrumentation, /captureOperationalFailure\?\.\("cloud_sync_failure"/);
  assert.match(instrumentation, /reason: code/);
});


test("legacy cloud save fast path uses version CAS without reading the full farm when unchanged", () => {
  const writeStart = cloud.indexOf("async function writeCloudRecord");
  const writeEnd = cloud.indexOf("\n  async function syncValueToCloud", writeStart);
  assert.ok(writeStart >= 0 && writeEnd > writeStart);
  const writeBlock = cloud.slice(writeStart, writeEnd);
  assert.match(writeBlock, /\.select\("updated_at"\)/);
  assert.doesNotMatch(writeBlock, /\.select\("app_state, updated_at"\)/);

  const syncStart = cloud.indexOf("async function syncValueToCloud");
  const syncEnd = cloud.indexOf("\n  async function drainSyncQueue", syncStart);
  assert.ok(syncStart >= 0 && syncEnd > syncStart);
  const syncBlock = cloud.slice(syncStart, syncEnd);

  const versionProbe = syncBlock.indexOf("await fetchCloudVersion(userId)");
  const fullFetch = syncBlock.indexOf("await fetchCloudRecord(userId)");
  assert.ok(versionProbe >= 0, "save path probes cloud version first");
  assert.ok(fullFetch > versionProbe, "full farm fetch remains a fallback after the version probe");
  assert.match(syncBlock, /!options\.force[\s\S]*knownVersion === remoteVersion/);
  assert.match(syncBlock, /if \(versionStillCurrent\) \{[\s\S]*remoteRecord = \{ updated_at: remoteVersion \}/);
  assert.match(syncBlock, /else if \(versionRecord\) \{[\s\S]*await fetchCloudRecord\(userId\)/);
});
