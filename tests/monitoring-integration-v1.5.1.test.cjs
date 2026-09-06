"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const pkg = JSON.parse(read("package.json"));
const pwa = read("pwa.js");
const worker = read("service-worker.js");
const config = read("herdharbor-monitoring-config.js");
const generator = read("scripts/build-monitoring-config.mjs");
const core = read("monitoring/herdharbor-monitoring-core.mjs");
const privacy = read("monitoring/herdharbor-monitoring-privacy.mjs");
const browser = read("monitoring/herdharbor-monitoring-browser.mjs");
const instrumentation = read("monitoring/herdharbor-monitoring-instrumentation.mjs");
const cloud = read("herdharbor-cloud.js");
const shows = read("shows-v1.6.1.js");

assert.equal(pkg.version, "1.7.1");
assert.equal(pkg.dependencies["@sentry/browser"], "10.71.0");
assert.ok(pkg.devDependencies.esbuild);
assert.match(browser, /import \* as Sentry from "@sentry\/browser"/);
assert.match(browser, /createPrivacySentryAdapter/);
assert.doesNotMatch(browser, /loader\.js|browser\.sentry-cdn\.com|sentry\.io\/api\/0/i, "no Sentry loader-script/admin API integration");

assert.match(config, /dsn: ""/);
assert.doesNotMatch(config, /https:\/\/[^"']+@[^"']*sentry/i, "DSN is not hard-coded in source");
assert.match(config, /HerdHarbor@1\.7\.1/);
assert.match(config, /build: "multispecies-genetics-foundation-1"/);
assert.match(config, /enableTestCrash: false/);
assert.match(generator, /release: "HerdHarbor@1\.7\.1"/);
assert.match(generator, /multispecies-genetics-foundation-1/);

assert.match(core, /beforeSend:/);
assert.match(core, /beforeBreadcrumb:/);
assert.match(core, /sendDefaultPii: false/);
assert.match(core, /enableLogs: false/);
assert.match(core, /tracesSampleRate: 0/);
assert.match(core, /integrations:\s*\(integrations\)/, "default integrations are filtered through the supported Sentry SDK option");
assert.doesNotMatch(core, /defaultIntegrations:\s*\(integrations\)/, "the SDK's array-only defaultIntegrations option is not given a callback");
assert.match(privacy, /hardenSentryEvent/);
assert.match(privacy, /createPrivacySentryAdapter/);
assert.match(privacy, /sendDefaultPii: false/);
assert.match(privacy, /enableLogs: false/);
assert.match(privacy, /tracesSampleRate: 0/);
assert.doesNotMatch(core + privacy, /replayIntegration\s*\(/i);
assert.doesNotMatch(core + privacy, /browserTracingIntegration\s*\(/i);
assert.doesNotMatch(core + privacy, /enableLogs:\s*true/);
assert.doesNotMatch(core + privacy, /tracesSampleRate:\s*(?:[1-9]|0\.[1-9])/);
assert.doesNotMatch(core + privacy, /metrics\./i, "Application Metrics remain off");
for (const moduleName of ["dashboard", "animals", "pedigrees", "breeding", "rabbit-genetics", "births-litters", "health", "shows", "production", "sales", "finance", "tasks", "sync", "account", "admin", "membership", "subscription", "backup", "import-export"]) {
  assert.ok(core.includes(`"${moduleName}"`), `monitoring module taxonomy is missing ${moduleName}`);
}
for (const category of ["network_unavailable", "authentication_failure", "upload_failure", "download_failure", "conflict_failure", "serialization_failure", "storage_failure", "login_request_failed", "unhandledrejection"]) {
  assert.ok(core.includes(category), `monitoring error taxonomy is missing ${category}`);
}
assert.match(core, /HH-/);
assert.match(core, /15 \* 60_000/);

assert.match(instrumentation, /local_storage_write/);
assert.match(instrumentation, /local_storage_remove/);
assert.doesNotMatch(instrumentation, /localStorage\.getItem/);
assert.doesNotMatch(instrumentation, /JSON\.parse\(value\)|String\(value\)|JSON\.stringify\(value\)/, "storage instrumentation never inspects stored values");

assert.match(pwa, /herdharbor-monitoring-config\.js\?v=1\.7\.1/);
assert.match(pwa, /vendor\/herdharbor-monitoring-v1\.6\.1\.min\.js\?v=1\.7\.1/);
assert.match(pwa, /addOptionalScript/);
assert.match(pwa, /loadMonitoring\(bootApplication\)/);
assert.match(pwa, /Monitoring is optional and fail-open/);
assert.match(pwa, /registration\.update\(\)/, "application update regression fix remains intact");
assert.doesNotMatch(pwa, /HerdHarborCloud.*syncNow[\s\S]*SKIP_WAITING/, "app updates remain independent of Cloud Sync");

// Monitoring is a preserved v1.7.1 subsystem, while the application shell may
// advance independently. Guard the shell identity shape plus the exact monitoring
// assets instead of pinning this integration test to the retired v1.7.1 shell.
assert.match(worker, /const CACHE_NAME = "herdharbor-shell-v1\.(?:7\.1|8\.0|8\.1)-/);
assert.match(worker, /herdharbor-monitoring-config\.js\?v=1\.7\.1/);
assert.match(worker, /herdharbor-monitoring-v1\.6\.1\.min\.js\?v=1\.7\.1/);
assert.match(worker, /cache: "no-store"/);
assert.doesNotMatch(worker, /install[\s\S]{0,500}skipWaiting\(\)/, "waiting-worker update UX remains intact");
assert.match(worker, /event\.data\?\.type === "SKIP_WAITING"/);

assert.doesNotMatch(cloud, /Sentry|HerdHarborMonitoring/, "Cloud Sync behavior is not rewritten around Sentry");
assert.match(cloud, /const STORAGE_KEY = "herdharbor_pre_alpha_v1"/, "farm state storage key is unchanged");
assert.ok(shows.includes("const VERSION='1.6.1'"), "Shows runs from the consolidated v1.6.1 runtime");

for (const billingTerm of ["RevenueCat", "StoreKit", "Google Play Billing", "Founder membership", "30-day trial", "paywall"]) {
  assert.ok(!core.includes(billingTerm), `monitoring core must not implement ${billingTerm}`);
}

console.log("HerdHarbor monitoring integration and scope guardrails passed under current web shell");
