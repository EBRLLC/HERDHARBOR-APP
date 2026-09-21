"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const cloud = fs.readFileSync(path.join(root, "herdharbor-cloud.js"), "utf8");
const instrumentation = fs.readFileSync(path.join(root, "monitoring", "herdharbor-monitoring-instrumentation.mjs"), "utf8");
const core = fs.readFileSync(path.join(root, "monitoring", "herdharbor-monitoring-core.mjs"), "utf8");

test("legacy cloud failures expose operation and sanitized provider diagnostics", () => {
  assert.match(cloud, /error_name: failure\.error_name/);
  assert.match(cloud, /error_code: failure\.code/);
  assert.match(cloud, /status_code: failure\.status/);
  assert.match(cloud, /classification: failure\.classification/);
  assert.match(cloud, /provider_details: failure\.provider_details/);
  assert.match(cloud, /provider_hint: failure\.provider_hint/);
  assert.match(cloud, /sync_engine: CLOUD_SYNC_ENGINE/);
  assert.match(cloud, /cloud_provider: CLOUD_PROVIDER/);
  assert.match(cloud, /serialized_state_bytes: failure\.serialized_state_bytes/);
  assert.match(cloud, /reportCloudSyncFailure\("cloud-preflight", loadError, serializedStateBytes\(rawValue\)\)/);
  assert.match(cloud, /reportCloudSyncFailure\("cloud-save", error, serializedStateBytes\(rawValue\)\)/);
});

test("cloud failure classifier covers required deterministic categories", () => {
  assert.match(cloud, /status === 401\) return "auth"/);
  assert.match(cloud, /status === 403[\s\S]*return "permission"/);
  assert.match(cloud, /status === 409[\s\S]*return "conflict"/);
  assert.match(cloud, /status === 413\) return "payload"/);
  assert.match(cloud, /status === 429\) return "rate_limit"/);
  assert.match(cloud, /status >= 500[\s\S]*return "server"/);
  assert.match(cloud, /return "offline"/);
  assert.match(cloud, /return "timeout"/);
  assert.match(cloud, /return "network"/);
  assert.match(cloud, /return "validation"/);
  assert.match(cloud, /return "unknown"/);
});

test("retry policy is bounded and permanent failures are not blindly retried", () => {
  assert.match(cloud, /CLOUD_RETRY_DELAYS_MS = \[750, 2000\]/);
  assert.match(cloud, /\["network", "timeout", "rate_limit", "server"\]\.includes\(category\)/);
  assert.match(cloud, /attempt <= CLOUD_RETRY_DELAYS_MS\.length/);
  assert.match(cloud, /!isTransientCloudFailure\(error\) \|\| attempt >= CLOUD_RETRY_DELAYS_MS\.length/);
  assert.match(cloud, /typeof client\?\.auth\?\.refreshSession === "function"/);
  assert.match(cloud, /authRefreshed = true/);
});

test("cloud diagnostic sanitizer redacts credentials and personal contact data", () => {
  assert.match(cloud, /\[redacted-email\]/);
  assert.match(cloud, /Bearer \[redacted\]/);
  assert.match(cloud, /\[redacted-token\]/);
  const reporter = cloud.slice(cloud.indexOf("function reportCloudSyncFailure"), cloud.indexOf("async function loadAccessProfile"));
  assert.doesNotMatch(reporter, /app_state\s*:/);
  assert.doesNotMatch(reporter, /access_token\s*:/);
  assert.doesNotMatch(reporter, /refresh_token\s*:/);
});

test("monitoring event identifies provider operation instead of generic synthetic failure", () => {
  assert.match(instrumentation, /CloudSyncProviderError:/);
  assert.match(instrumentation, /operation/);
  assert.match(instrumentation, /classification: category/);
  assert.match(instrumentation, /serialized_state_bytes/);
  assert.doesNotMatch(instrumentation, /new Error\(String\(detail\.message \|\| "Cloud synchronization operation failed\."/);
});

test("monitoring privacy allowlist explicitly controls new cloud diagnostic fields", () => {
  for (const key of [
    "classification", "provider", "sync_engine", "sync_stage", "app_release",
    "component_build", "serialized_state_bytes", "provider_details", "provider_hint"
  ]) {
    assert.match(core, new RegExp('"' + key + '"'));
  }
  assert.match(core, /HERDHARBOR_MONITORING_BUILD = "phase1-monitoring-review-2"/);
});

test("existing dirty-state, merge, conflict and recovery protections remain present", () => {
  assert.match(cloud, /safeStorageSet\(dirtyKey\(userId\), "1"\)/);
  assert.match(cloud, /mergeRawStates/);
  assert.match(cloud, /markConflict/);
  assert.match(cloud, /recordRecoverySnapshot/);
  assert.match(cloud, /removeRedundantStateCache\(userId\)/);
  assert.match(cloud, /safeStorageRemove\(dirtyKey\(userId\)\)/);
});

test("monitoring adapter remains fail-open", () => {
  const start = instrumentation.indexOf("export function installCloudSyncFailureMonitoring");
  const end = instrumentation.indexOf("export function installMonitoringAdapters");
  const adapter = instrumentation.slice(start, end);
  assert.match(adapter, /try \{/);
  assert.match(adapter, /catch \{\}/);
});
