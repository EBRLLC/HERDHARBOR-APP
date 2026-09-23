"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));

const build = read("herdharbor-build.js");
const manifest = JSON.parse(read("manifest.json"));
const twa = JSON.parse(read("twa-manifest.json"));
const gradle = read("android/app/build.gradle");
const pkg = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json"));
const pwa = read("pwa.js");
const worker = read("service-worker.js");
const html = read("index.html");
const appRuntime = read("herdharbor-app-runtime.js");
const settingsRuntime = read("settings-runtime-v1.8.3.js");
const monitoringConfig = read("herdharbor-monitoring-config.js");
const monitoringGenerator = read("scripts/build-monitoring-config.mjs");
const sentryAcceptance = read("scripts/sentry-production-acceptance.mjs");
const securityAudit = read("scripts/repository-security-audit.mjs");
const readme = read("README.md");
const releaseNotes = read("RELEASE_NOTES-v1.8.2.md");
const checklist = read("TEST_CHECKLIST.md");

const version = build.match(/version:\s*"([^"]+)"/)?.[1];
const buildId = build.match(/buildId:\s*"([^"]+)"/)?.[1];

const currentWorkflows = [
  ".github/workflows/v1.8.2-ci.yml",
  ".github/workflows/v1.8.2-production-pages.yml",
  ".github/workflows/v1.8.2-production-acceptance.yml"
];

test("all packaged release identities are formally Alpha v1.8.2", () => {
  assert.equal(version, "1.8.2");
  assert.equal(buildId, "cloud-sync-v2-state-integrity-1");
  assert.match(build, /build:\s*"1\.8\.2-alpha-cloud-sync-v2-state-integrity-1"/);
  assert.equal(pkg.version, "1.8.2");
  assert.equal(lock.version, "1.8.2");
  assert.equal(lock.packages[""].version, "1.8.2");
  assert.equal(manifest.version, "1.8.2");
  assert.match(manifest.description, /Alpha v1\.8\.2/);
  assert.equal(String(twa.appVersion), "1.8.2");
  assert.equal(Number(twa.appVersionCode), 16);
  assert.match(gradle, /versionName\s+"1\.8\.2"/);
  assert.match(gradle, /versionCode\s+16/);
});

test("PWA shell and HTML use the v1.8.2 release/cache identity", () => {
  assert.match(pwa, /APP_VERSION = window\.HerdHarborBuild\?\.version \|\| "1\.8\.2"/);
  assert.match(pwa, /BUILD_ID = window\.HerdHarborBuild\?\.buildId \|\| "cloud-sync-v2-state-integrity-1"/);
  assert.match(pwa, /herdharbor-monitoring-config\.js\?v=1\.8\.2/, "PWA monitoring loader uses the v1.8.2 cache identity");
  assert.match(pwa, /herdharbor-monitoring-v1\.6\.1\.min\.js\?v=1\.8\.2/);
  assert.match(worker, /herdharbor-shell-v1\.8\.2-alpha-cloud-sync-v2-state-integrity-1/);
  assert.match(worker, /\.\/manifest\.json\?v=1\.8\.2/);
  assert.match(worker, /\.\/herdharbor-build\.js\?v=1\.8\.2/);
  assert.match(worker, /\.\/herdharbor-monitoring-config\.js\?v=1\.8\.2/);
  assert.match(html, /manifest\.json\?v=1\.8\.2/);
  assert.match(html, /herdharbor-build\.js\?v=1\.8\.2/);
  assert.match(html, /animal-profile-runtime-v1\.8\.3\.js\?v=1/);
  assert.match(html, /breeding-litter-runtime-v1\.8\.3\.js\?v=1/);
  assert.match(html, /health-runtime-v1\.8\.3\.js\?v=1/);
  assert.match(html, /task-runtime-v1\.8\.3\.js\?v=1/);
  assert.match(html, /sales-customer-runtime-v1\.8\.3\.js\?v=1/);
  assert.match(html, /production-reporting-runtime-v1\.8\.3\.js\?v=1/);
  assert.match(html, /settings-runtime-v1\.8\.3\.js\?v=1/);
  assert.ok(html.indexOf("animal-profile-runtime-v1.8.3.js?v=1") < html.indexOf("breeding-litter-runtime-v1.8.3.js?v=1"), "Animals/Profile runtime remains ahead of Breeding/Litter runtime");
  assert.ok(html.indexOf("breeding-litter-runtime-v1.8.3.js?v=1") < html.indexOf("health-runtime-v1.8.3.js?v=1"), "Breeding/Litter runtime remains ahead of Health runtime");
  assert.ok(html.indexOf("health-runtime-v1.8.3.js?v=1") < html.indexOf("task-runtime-v1.8.3.js?v=1"), "Health runtime remains ahead of Task runtime");
  assert.ok(html.indexOf("task-runtime-v1.8.3.js?v=1") < html.indexOf("sales-customer-runtime-v1.8.3.js?v=1"), "Task runtime remains ahead of Sales/Customer runtime");
  assert.ok(html.indexOf("sales-customer-runtime-v1.8.3.js?v=1") < html.indexOf("production-reporting-runtime-v1.8.3.js?v=1"), "Sales/Customer runtime remains ahead of Production/Reporting runtime");
  assert.ok(html.indexOf("production-reporting-runtime-v1.8.3.js?v=1") < html.indexOf("settings-runtime-v1.8.3.js?v=1"), "Production/Reporting runtime remains ahead of Settings runtime");
  assert.ok(html.indexOf("settings-runtime-v1.8.3.js?v=1") < html.indexOf("herdharbor-app-runtime.js?v=2"), "Settings domain module loads before the composition runtime");
  assert.match(html, /herdharbor-app-runtime\.js\?v=2/);
  assert.match(worker, /\.\/animal-profile-runtime-v1\.8\.3\.js\?v=1/);
  assert.match(worker, /\.\/breeding-litter-runtime-v1\.8\.3\.js\?v=1/);
  assert.match(worker, /\.\/health-runtime-v1\.8\.3\.js\?v=1/);
  assert.match(worker, /\.\/task-runtime-v1\.8\.3\.js\?v=1/);
  assert.match(worker, /\.\/sales-customer-runtime-v1\.8\.3\.js\?v=1/);
  assert.match(worker, /\.\/production-reporting-runtime-v1\.8\.3\.js\?v=1/);
  assert.match(worker, /\.\/settings-runtime-v1\.8\.3\.js\?v=1/);
  assert.match(worker, /"\/animal-profile-runtime-v1\.8\.3\.js"/);
  assert.match(worker, /"\/breeding-litter-runtime-v1\.8\.3\.js"/);
  assert.match(worker, /"\/health-runtime-v1\.8\.3\.js"/);
  assert.match(worker, /"\/task-runtime-v1\.8\.3\.js"/);
  assert.match(worker, /"\/sales-customer-runtime-v1\.8\.3\.js"/);
  assert.match(worker, /"\/production-reporting-runtime-v1\.8\.3\.js"/);
  assert.match(worker, /"\/settings-runtime-v1\.8\.3\.js"/);
  assert.match(worker, /\.\/herdharbor-app-runtime\.js\?v=2/);
  assert.match(appRuntime, /const APP_VERSION = window\.HerdHarborBuild\?\.version \|\| "1\.8\.2"/);
  assert.match(settingsRuntime, /Version 1\.8\.2 adds Cloud Sync V2/);
  assert.doesNotMatch(appRuntime, /Version 1\.8\.1 adds/);
});

test("Cloud Sync V2 release assets are present and covered by the offline/update shell", () => {
  for (const asset of [
    "local-cache-v2-v1.8.2.js",
    "cloud-sync-v2-flow-v1.8.2.js",
    "cloud-sync-v2-diagnostics-v1.8.2.js"
  ]) {
    assert.ok(exists(asset), `missing Cloud Sync V2 asset ${asset}`);
    assert.ok(worker.includes(asset), `service worker does not include ${asset}`);
  }
  assert.ok(exists("tests/cloud-sync-v2-diagnostics-v1.8.2.test.cjs"));
  assert.ok(exists("tests/state-integrity-e2e-v1.8.2.test.cjs"));
  assert.equal(pkg.scripts["test:state-integrity"], "node --test tests/state-integrity-e2e-v1.8.2.test.cjs");
  assert.match(pkg.scripts["test:v1.8.2"], /cloud-sync-v2-diagnostics-v1\.8\.2\.test\.cjs/);
  assert.match(pkg.scripts["test:v1.8.2"], /state-integrity-e2e-v1\.8\.2\.test\.cjs/);
});

test("monitoring and production acceptance identify v1.8.2 without committing a DSN", () => {
  assert.match(monitoringConfig, /dsn:\s*""/);
  assert.match(monitoringConfig, /release:\s*"HerdHarbor@1\.8\.2"/);
  assert.match(monitoringConfig, /build:\s*"cloud-sync-v2-state-integrity-1"/);
  assert.match(monitoringGenerator, /release:\s*"HerdHarbor@1\.8\.2"/);
  assert.match(sentryAcceptance, /release:\s*"HerdHarbor@1\.8\.2"/);
  assert.match(sentryAcceptance, /privacy:\s*"synthetic_only"/);
  assert.doesNotMatch(monitoringConfig, /https:\/\/.+@.+\/\d+/);
});

test("v1.8.2 CI and deployment workflows are the current release workflow set", () => {
  for (const workflow of currentWorkflows) assert.ok(exists(workflow), `missing ${workflow}`);
  for (const old of [
    ".github/workflows/v1.8.1-ci.yml",
    ".github/workflows/v1.8.1-production-pages.yml",
    ".github/workflows/v1.8.1-production-acceptance.yml"
  ]) assert.equal(exists(old), false, `old release workflow remains active: ${old}`);

  const ci = read(currentWorkflows[0]);
  const deploy = read(currentWorkflows[1]);
  const acceptance = read(currentWorkflows[2]);
  assert.match(ci, /Alpha v1\.8\.2 CI/);
  assert.match(ci, /branches: \[main\]/);
  assert.match(ci, /npm run test:release/);
  assert.match(ci, /npm run test:state-integrity/);
  assert.match(ci, /versionName "1\.8\.2"/);
  assert.match(ci, /versionCode 16/);
  assert.match(ci, /herdharbor-v1\.8\.2-unsigned-aab/);
  assert.match(ci, /actions\/setup-java@v5/, "Android review uses the supported Java setup action");
  assert.match(ci, /android-actions\/setup-android@v4/, "Android review uses the Node 24 Android setup action");
  assert.match(ci, /packages:\s*platform-tools/, "Android setup overrides the action default that still requests retired SDK tools");
  assert.doesNotMatch(ci, /packages:\s*tools(?:\s|$)/m, "Android CI must not request the retired SDK package named tools");
  assert.match(ci, /sdkmanager "platforms;android-36" "build-tools;36\.0\.0"/, "Android 16 platform/build tools remain explicitly pinned");
  for (const asset of ["registration-safety-v1.8.1.js", "subscription-launch-v1.8.1.js", "subscription-referral-policy-v1.8.1.js", "subscription-admin-credits-v1.8.1.js", "subscription-stripe-launch-bridge-v1.8.1.js"]) {
    assert.ok(deploy.includes(asset), `deployment keeps carried-forward runtime filenames: ${asset}`);
    assert.ok(!deploy.includes(asset.replace("v1.8.1", "v1.8.2")), `deployment must not reference nonexistent promoted filename for ${asset}`);
  }
  assert.match(deploy, /HerdHarbor@1\.8\.2/);
  assert.match(deploy, /test:release/);
  assert.match(acceptance, /workflow_dispatch:/);
  assert.doesNotMatch(acceptance, /^\s*push:/m);
  assert.doesNotMatch(acceptance, /^\s*pull_request:/m);
});

test("security and auth hardening remain release gates", () => {
  assert.equal(pkg.scripts["audit:security"], "node scripts/repository-security-audit.mjs");
  assert.match(pkg.scripts["test:release"], /npm run audit:security/);
  assert.match(securityAudit, /Stripe secret\/restricted key/);
  assert.match(securityAudit, /private key material/);
  assert.match(securityAudit, /duplicate browser Supabase client creation/);
  assert.ok(exists("tests/auth-freeze-resilience-v1.8.2.test.cjs"));
  assert.ok(exists("tests/auth-freeze-resilience-manifest-v1.8.2.test.cjs"));
});

test("npm test scripts do not reference missing test files", () => {
  for (const [scriptName, command] of Object.entries(pkg.scripts)) {
    if (!scriptName.startsWith("test")) continue;
    const explicitTests = command.match(/tests\/[A-Za-z0-9._-]+\.test\.cjs/g) || [];
    for (const testFile of explicitTests) {
      assert.ok(exists(testFile), `${scriptName} references missing test file ${testFile}`);
    }
  }
});

test("stable older-named domain engines remain intentionally carried forward", () => {
  for (const runtime of [
    "analytics-v1.6.1.js",
    "rabbit-genetics-v1.6.1.js",
    "standards-registry-v1.7.0.js",
    "multispecies-genetics-v1.7.1.js",
    "health-intelligence-v1.7.1.js",
    "registration-safety-v1.8.1.js",
    "subscription-launch-v1.8.1.js"
  ]) assert.ok(exists(runtime), `stable carried-forward runtime was removed: ${runtime}`);
});

test("current documentation declares v1.8.2 as the authoritative release", () => {
  assert.match(readme, /^# HerdHarbor Alpha v1\.8\.2/m);
  assert.match(readme, /current release is \*\*Alpha v1\.8\.2\*\*/i);
  assert.match(readme, /Cloud Sync V2/i);
  assert.match(releaseNotes, /^# HerdHarbor Alpha v1\.8\.2/m);
  assert.match(releaseNotes, /State-integrity regression/i);
  assert.match(checklist, /^# HerdHarbor Alpha v1\.8\.2 Acceptance Checklist/m);
});
