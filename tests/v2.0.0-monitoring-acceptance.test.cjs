"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const config = read("herdharbor-monitoring-config.js");
const generator = read("scripts/build-monitoring-config.mjs");
const acceptance = read("scripts/sentry-production-acceptance.mjs");
const productionWorkflow = read(".github/workflows/v2.0.0-production-acceptance.yml");
const cloud = read("herdharbor-cloud.js");
const instrumentation = read("monitoring/herdharbor-monitoring-instrumentation.mjs");
const privacy = read("monitoring/herdharbor-monitoring-privacy.mjs");
const pwa = read("pwa.js");
const index = read("index.html");
const worker = read("service-worker.js");

test("monitoring configuration and controlled acceptance identify stable 2.0.0", () => {
  assert.match(config, /release:\s*"HerdHarbor@2\.0\.0"/);
  assert.match(config, /build:\s*"v2\.0\.0-release-2"/);
  assert.match(generator, /release:\s*"HerdHarbor@2\.0\.0"/);
  assert.match(generator, /v2\.0\.0-release-2/);
  assert.match(acceptance, /release:\s*"HerdHarbor@2\.0\.0"/);
  assert.match(acceptance, /build:\s*"v2\.0\.0-production-acceptance"/);
  assert.match(acceptance, /herdharbor-release-acceptance\/2\.0\.0/);
  assert.doesNotMatch(acceptance, /HerdHarbor@1\.8\.4|v1\.8\.4-production-acceptance|acceptance\/1\.8\.4/);
});

test("controlled Sentry acceptance is synthetic-only and wired only through protected production workflow", () => {
  assert.match(acceptance, /privacy:\s*"synthetic_only"/);
  assert.match(acceptance, /no user, farm, animal, customer, request, notes, credentials, or cloud-state data included/i);
  assert.match(productionWorkflow, /Run synthetic-only Sentry production acceptance/);
  assert.match(productionWorkflow, /HERDHARBOR_SENTRY_DSN:\s*\$\{\{ secrets\.HERDHARBOR_SENTRY_DSN \}\}/);
  assert.match(productionWorkflow, /node scripts\/sentry-production-acceptance\.mjs/);
});

test("Cloud Sync telemetry reports app 2.0.0 while retaining independent component build identity", () => {
  assert.match(cloud, /CLOUD_SYNC_APP_RELEASE = "2\.0\.0"/);
  assert.match(cloud, /CLOUD_SYNC_COMPONENT_BUILD = "legacy-full-state-observability-3"/);
  assert.match(cloud, /app_release:\s*CLOUD_SYNC_APP_RELEASE/);
  assert.match(cloud, /component_build:\s*CLOUD_SYNC_COMPONENT_BUILD/);
});

test("cloud monitoring preserves original Error provenance instead of synthesizing a replacement stack", () => {
  const start = instrumentation.indexOf("export function installCloudSyncFailureMonitoring");
  const end = instrumentation.indexOf("export function installMonitoringAdapters", start);
  const adapter = instrumentation.slice(start, end);
  assert.match(adapter, /const sourceError = detail\.source_error instanceof Error \? detail\.source_error : null/);
  assert.match(adapter, /captureOperationalFailure[\s\S]*sourceError/);
  assert.doesNotMatch(adapter, /new Error\(/);
  assert.match(cloud, /source_error:\s*error instanceof Error \? error : null/);
});

test("monitoring remains privacy-hardened and non-blocking", () => {
  assert.match(privacy, /sendDefaultPii:\s*false/);
  assert.match(privacy, /enableLogs:\s*false/);
  assert.match(privacy, /tracesSampleRate:\s*0/);
  assert.doesNotMatch(privacy, /replayIntegration\s*\(/i);
  assert.match(pwa, /Application startup is authoritative and never waits for monitoring/);
  assert.match(pwa, /function startMonitoringLoad\(\)/);
  assert.match(pwa, /function bootApplication\(\)/);
  assert.doesNotMatch(pwa, /loadMonitoring\(bootApplication\)/);
});

test("changed Cloud Sync telemetry runtime uses a revised served identity", () => {
  assert.match(index, /herdharbor-cloud\.js\?v=35/);
  assert.match(worker, /\.\/herdharbor-cloud\.js\?v=35/);
  assert.doesNotMatch(index, /herdharbor-cloud\.js\?v=32/);
  assert.doesNotMatch(worker, /\.\/herdharbor-cloud\.js\?v=32/);
});
