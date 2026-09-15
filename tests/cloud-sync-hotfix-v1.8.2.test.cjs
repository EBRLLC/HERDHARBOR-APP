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
