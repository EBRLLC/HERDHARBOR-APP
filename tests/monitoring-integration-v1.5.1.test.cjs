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
const core = read("monitoring/herdharbor-monitoring-core.mjs");
const privacy = read("monitoring/herdharbor-monitoring-privacy.mjs");
const browser = read("monitoring/herdharbor-monitoring-browser.mjs");
const instrumentation = read("monitoring/herdharbor-monitoring-instrumentation.mjs");
const cloud = read("herdharbor-cloud.js");
const shows = read("shows-v1.5.0.js");

assert.equal(pkg.version, "1.5.1");
assert.equal(pkg.dependencies["@sentry/browser"], "10.71.0");
assert.ok(pkg.devDependencies.esbuild);
assert.match(browser, /import \* as Sentry from "@sentry\/browser"/);
assert.match(browser, /createPrivacySentryAdapter/);
assert.doesNotMatch(browser, /loader\.js|browser\.sentry-cdn\.com|sentry\.io\/api\/0/i, "no Sentry loader-script/admin API integration");

assert.match(config, /dsn: ""/);
assert.doesNotMatch(config, /https:\/\/[^"']+@[^"']*sentry/i, "DSN is not hard-coded in source");
assert.match(config, /HerdHarbor@1\.5\.1/);
assert.match(config, /enableTestCrash: false/);

assert.match(core, /beforeSend:/);
assert.match(core, /beforeBreadcrumb:/);
assert.match(core, /sendDefaultPii: false/);
assert.match(core, /enableLogs: false/);
assert.match(core, /tracesSampleRate: 0/);
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
assert.match(core, /"dashboard"/);
assert.match(core, /"animals"/);
assert.match(core, /"pedigrees"/);
assert.match(core, /"breeding"/);
assert.match(core, /"rabbit-genetics"/);
assert.match(core, /"births-litters"/);
assert.match(core, /"health"/);
assert.match(core, /"shows"/);
assert.match(core, /"production"/);
assert.match(core, /"sales"/);
assert.match(core, /"finance"/);
assert.match(core, /"tasks"/);
assert.match(core, /"sync"/);
assert.match(core, /"account"/);
assert.match(core, /"backup"/);
assert.match(core, /"import-export"/);
assert.match(core, /network_unavailable/);
assert.match(core, /authentication_failure/);
assert.match(core, /upload_failure/);
assert.match(core, /download_failure/);
assert.match(core, /conflict_failure/);
assert.match(core, /serialization_failure/);
assert.match(core, /storage_failure/);
assert.match(core, /login_request_failed/);
assert.match(core, /unhandledrejection/);
assert.match(core, /HH-/);
assert.match(core, /15 \* 60_000/);

assert.match(instrumentation, /local_storage_write/);
assert.match(instrumentation, /local_storage_remove/);
assert.doesNotMatch(instrumentation, /localStorage\.getItem/);
assert.doesNotMatch(instrumentation, /JSON\.parse\(value\)|String\(value\)|JSON\.stringify\(value\)/, "storage instrumentation never inspects stored values");

assert.match(pwa, /herdharbor-monitoring-config\.js\?v=1\.5\.1/);
assert.match(pwa, /vendor\/herdharbor-monitoring-v1\.5\.1\.min\.js\?v=1\.5\.1/);
assert.match(pwa, /addOptionalScript/);
assert.match(pwa, /loadMonitoring\(bootApplication\)/);
assert.match(pwa, /Monitoring is optional and fail-open/);
assert.match(pwa, /registration\.update\(\)/, "v1.5.0 application update regression fix remains intact");
assert.doesNotMatch(pwa, /HerdHarborCloud.*syncNow[\s\S]*SKIP_WAITING/, "app updates remain independent of Cloud Sync");

assert.match(worker, /v1\.5\.0-alpha-shows-updatefix-1-monitoring-v1\.5\.1-review-1/);
assert.match(worker, /herdharbor-monitoring-config\.js\?v=1\.5\.1/);
assert.match(worker, /herdharbor-monitoring-v1\.5\.1\.min\.js\?v=1\.5\.1/);
assert.match(worker, /cache: "no-store"/);
assert.doesNotMatch(worker, /install[\s\S]{0,500}skipWaiting\(\)/, "waiting-worker update UX remains intact");
assert.match(worker, /event\.data\?\.type === "SKIP_WAITING"/);

assert.doesNotMatch(cloud, /Sentry|HerdHarborMonitoring/, "Cloud Sync behavior is not rewritten around Sentry");
assert.match(cloud, /const STORAGE_KEY = "herdharbor_pre_alpha_v1"/, "farm state storage key is unchanged");
assert.match(shows, /const VERSION='1\.5\.0'/, "Shows v1.5.0 remains unchanged");

for (const billingTerm of ["RevenueCat", "StoreKit", "Google Play Billing", "Founder membership", "30-day trial", "paywall"]) {
  assert.ok(!core.includes(billingTerm), `Phase 1 monitoring core must not implement ${billingTerm}`);
}

console.log("Alpha v1.5.1 monitoring integration and Phase 1 scope guardrails passed");
