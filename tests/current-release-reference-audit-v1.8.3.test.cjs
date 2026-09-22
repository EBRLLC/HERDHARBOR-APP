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
const releaseNotes = read("RELEASE_NOTES-v1.8.3.md");
const releasePointer = read("RELEASE_NOTES.md");
const checklist = read("TEST_CHECKLIST.md");
const help = read("how-to/index.html");

const version = build.match(/version:\s*"([^"]+)"/)?.[1];
const buildId = build.match(/buildId:\s*"([^"]+)"/)?.[1];

const currentWorkflows = [
  ".github/workflows/v1.8.3-ci.yml",
  ".github/workflows/v1.8.3-production-pages.yml",
  ".github/workflows/v1.8.3-production-acceptance.yml"
];

test("all packaged release identities are formally Alpha v1.8.3", () => {
  assert.equal(version, "1.8.3");
  assert.equal(buildId, "alpha-v1.8.3-release-1");
  assert.match(build, /build:\s*"1\.8\.3-alpha-v1\.8\.3-release-1"/);
  assert.equal(pkg.version, "1.8.3");
  assert.equal(lock.version, "1.8.3");
  assert.equal(lock.packages[""].version, "1.8.3");
  assert.equal(manifest.version, "1.8.3");
  assert.match(manifest.description, /Alpha v1\.8\.3/);
  assert.equal(String(twa.appVersion), "1.8.3");
  assert.equal(Number(twa.appVersionCode), 17);
  assert.match(gradle, /versionName\s+"1\.8\.3"/);
  assert.match(gradle, /versionCode\s+17/);
});

test("PWA shell and HTML use the v1.8.3 release/cache identity", () => {
  assert.match(pwa, /APP_VERSION = window\.HerdHarborBuild\?\.version \|\| "1\.8\.3"/);
  assert.match(pwa, /BUILD_ID = window\.HerdHarborBuild\?\.buildId \|\| "alpha-v1\.8\.3-release-1"/);
  assert.match(pwa, /herdharbor-monitoring-config\.js\?v=1\.8\.3/);
  assert.match(pwa, /herdharbor-monitoring-v1\.6\.1\.min\.js\?v=1\.8\.3/);
  assert.match(worker, /herdharbor-shell-v1\.8\.3-alpha-v1\.8\.3-release-1/);
  assert.match(worker, /\.\/manifest\.json\?v=1\.8\.3/);
  assert.match(worker, /\.\/herdharbor-build\.js\?v=1\.8\.3/);
  assert.match(worker, /\.\/herdharbor-monitoring-config\.js\?v=1\.8\.3/);
  assert.match(html, /manifest\.json\?v=1\.8\.3/);
  assert.match(html, /herdharbor-build\.js\?v=1\.8\.3/);
  assert.match(html, /HerdHarbor Alpha v1\.8\.3 current application shell/);
  assert.match(appRuntime, /const APP_VERSION = window\.HerdHarborBuild\?\.version \|\| "1\.8\.3"/);
  assert.match(settingsRuntime, /Version 1\.8\.3 formalizes/);
  assert.match(help, /Current for Alpha v1\.8\.3/);
});

test("stable component identities remain carried forward instead of being renamed for the release", () => {
  for (const asset of [
    "local-cache-v2-v1.8.2.js",
    "cloud-sync-v2-flow-v1.8.2.js",
    "cloud-sync-v2-diagnostics-v1.8.2.js",
    "direct-transfer-core-v1.8.2.js",
    "paper-pedigree-import-v1.8.2.js",
    "registration-safety-v1.8.1.js",
    "subscription-launch-v1.8.1.js",
    "analytics-v1.6.1.js",
    "rabbit-genetics-v1.6.1.js",
    "health-intelligence-v1.7.1.js"
  ]) {
    assert.ok(exists(asset), "stable carried-forward asset missing: " + asset);
  }
  assert.match(worker, /local-cache-v2-v1\.8\.2\.js\?v=1/);
  assert.match(worker, /cloud-sync-v2-flow-v1\.8\.2\.js\?v=1/);
  assert.match(worker, /subscription-launch-v1\.8\.1\.js\?v=2/);
});

test("all extracted v1.8.3 runtime owners remain loaded and cached in order", () => {
  const runtimes = [
    "animal-profile-runtime-v1.8.3.js",
    "breeding-litter-runtime-v1.8.3.js",
    "health-runtime-v1.8.3.js",
    "task-runtime-v1.8.3.js",
    "sales-customer-runtime-v1.8.3.js",
    "production-reporting-runtime-v1.8.3.js",
    "settings-runtime-v1.8.3.js"
  ];
  let previous = -1;
  for (const runtime of runtimes) {
    const token = runtime + "?v=1";
    const index = html.indexOf(token);
    assert.ok(index > previous, runtime + " load order regressed");
    previous = index;
    assert.ok(worker.includes("./" + token), runtime + " missing from PWA shell");
    assert.ok(worker.includes('"/' + runtime + '"'), runtime + " missing from network-first path coverage");
  }
  assert.ok(html.indexOf("herdharbor-app-runtime.js?v=2") > previous);
});

test("monitoring identifies v1.8.3 without committing a DSN", () => {
  assert.match(monitoringConfig, /dsn:\s*""/);
  assert.match(monitoringConfig, /release:\s*"HerdHarbor@1\.8\.3"/);
  assert.match(monitoringConfig, /build:\s*"alpha-v1\.8\.3-release-1"/);
  assert.match(monitoringGenerator, /release:\s*"HerdHarbor@1\.8\.3"/);
  assert.match(sentryAcceptance, /release:\s*"HerdHarbor@1\.8\.3"/);
  assert.match(sentryAcceptance, /privacy:\s*"synthetic_only"/);
  assert.doesNotMatch(monitoringConfig, /https:\/\/.+@.+\/\d+/);
});

test("v1.8.3 CI and deployment workflows are the only current release workflow set", () => {
  for (const workflow of currentWorkflows) assert.ok(exists(workflow), "missing " + workflow);
  for (const old of [
    ".github/workflows/v1.8.2-ci.yml",
    ".github/workflows/v1.8.2-production-pages.yml",
    ".github/workflows/v1.8.2-production-acceptance.yml"
  ]) assert.equal(exists(old), false, "old release workflow remains active: " + old);

  const ci = read(currentWorkflows[0]);
  const deploy = read(currentWorkflows[1]);
  const acceptance = read(currentWorkflows[2]);
  assert.match(ci, /Alpha v1\.8\.3 CI/);
  assert.match(ci, /branches: \[main\]/);
  assert.match(ci, /npm run test:release/);
  assert.match(ci, /npm run test:state-integrity/);
  assert.match(ci, /versionName "1\.8\.3"/);
  assert.match(ci, /versionCode 17/);
  assert.match(ci, /herdharbor-v1\.8\.3-unsigned-aab/);
  assert.match(ci, /actions\/setup-java@v5/);
  assert.match(ci, /android-actions\/setup-android@v4/);
  assert.match(ci, /sdkmanager "platforms;android-36" "build-tools;36\.0\.0"/);
  assert.match(deploy, /npm run test:v1\.8\.3/);
  assert.match(deploy, /HerdHarbor@1\.8\.3/);
  assert.match(deploy, /version: "1\.8\.3"/);
  assert.match(acceptance, /npm run test:v1\.8\.3/);
  assert.match(acceptance, /workflow_dispatch:/);
  assert.doesNotMatch(acceptance, /^\s*push:/m);
  assert.doesNotMatch(acceptance, /^\s*pull_request:/m);
});

test("v1.8.2 compatibility and state-integrity gates remain available under v1.8.3", () => {
  assert.ok(exists("tests/cloud-sync-v2-diagnostics-v1.8.2.test.cjs"));
  assert.ok(exists("tests/state-integrity-e2e-v1.8.2.test.cjs"));
  assert.equal(pkg.scripts["test:state-integrity"], "node --test tests/state-integrity-e2e-v1.8.2.test.cjs");
  assert.match(pkg.scripts["test:v1.8.2"], /cloud-sync-v2-diagnostics-v1\.8\.2\.test\.cjs/);
  assert.doesNotMatch(pkg.scripts["test:v1.8.2"], /current-release-reference-audit-v1\.8\.2/);
  assert.match(pkg.scripts["test:v1.8.3"], /npm run test:v1\.8\.2/);
});

test("security and auth hardening remain release gates", () => {
  assert.equal(pkg.scripts["audit:security"], "node scripts/repository-security-audit.mjs");
  assert.match(pkg.scripts["test:release"], /npm run audit:security/);
  assert.match(pkg.scripts["test:release"], /current-release-reference-audit-v1\.8\.3\.test\.cjs/);
  assert.match(securityAudit, /Stripe secret\/restricted key/);
  assert.match(securityAudit, /private key material/);
  assert.match(securityAudit, /duplicate browser Supabase client creation/);
  assert.ok(exists("tests/auth-freeze-resilience-v1.8.2.test.cjs"));
  assert.ok(exists("tests/auth-freeze-resilience-manifest-v1.8.2.test.cjs"));
});

test("current documentation declares v1.8.3 and records intentional normalized-authority deferral", () => {
  assert.match(readme, /^# HerdHarbor Alpha v1\.8\.3/m);
  assert.match(readme, /current release is \*\*Alpha v1\.8\.3\*\*/i);
  assert.match(releasePointer, /^# HerdHarbor Alpha v1\.8\.3/m);
  assert.match(releaseNotes, /^# HerdHarbor Alpha v1\.8\.3/m);
  assert.match(releaseNotes, /Normalized sync is \*\*not\*\* mass-enabled/i);
  assert.match(releaseNotes, /Free Adult/i);
  assert.match(releaseNotes, /Paper Pedigree AI hardening/i);
  assert.match(releaseNotes, /Runtime decomposition/i);
  assert.match(releaseNotes, /Help Center/i);
  assert.match(releaseNotes, /unrestricted normalized production authority remains intentionally deferred/i);
  assert.match(checklist, /^# HerdHarbor Alpha v1\.8\.3 Acceptance Checklist/m);
});

test("npm test scripts do not reference missing test files", () => {
  for (const [scriptName, command] of Object.entries(pkg.scripts)) {
    if (!scriptName.startsWith("test")) continue;
    const explicitTests = command.match(/tests\/[A-Za-z0-9._-]+\.test\.cjs/g) || [];
    for (const testFile of explicitTests) {
      assert.ok(exists(testFile), scriptName + " references missing test file " + testFile);
    }
  }
});
