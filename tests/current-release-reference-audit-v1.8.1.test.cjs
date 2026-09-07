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
const monitoringConfig = read("herdharbor-monitoring-config.js");
const monitoringGenerator = read("scripts/build-monitoring-config.mjs");
const sentryAcceptance = read("scripts/sentry-production-acceptance.mjs");
const securityAudit = read("scripts/repository-security-audit.mjs");
const readme = read("README.md");
const releaseNotes = read("RELEASE_NOTES-v1.8.1.md");
const checklist = read("TEST_CHECKLIST.md");
const supabaseConfig = read("supabase/config.toml");

const version = build.match(/version:\s*"([^"]+)"/)?.[1];
const buildId = build.match(/buildId:\s*"([^"]+)"/)?.[1];

test("authoritative release identity is Alpha v1.8.1 everywhere that owns the current release", () => {
  assert.equal(version, "1.8.1");
  assert.equal(buildId, "october-subscription-launch-referrals-credits-4");
  assert.match(build, /build:\s*"1\.8\.1-alpha-october-subscription-launch-referrals-credits-4"/);
  assert.equal(pkg.version, "1.8.1");
  assert.equal(lock.version, "1.8.1");
  assert.equal(lock.packages[""].version, "1.8.1");
  assert.equal(manifest.version, "1.8.1");
  assert.equal(String(twa.appVersion), "1.8.1");
  assert.equal(Number(twa.appVersionCode), 15);
  assert.match(gradle, /versionName\s+"1\.8\.1"/);
  assert.match(gradle, /versionCode\s+15/);
});

test("PWA and offline shell use the current release while preserving safe update behavior", () => {
  assert.match(pwa, /APP_VERSION = window\.HerdHarborBuild\?\.version \|\| "1\.8\.1"/);
  assert.match(pwa, /BUILD_ID = window\.HerdHarborBuild\?\.buildId \|\| "october-subscription-launch-referrals-credits-4"/);
  assert.match(pwa, /manifest\.href = `manifest\.json\?build=\$\{encodeURIComponent\(PWA_BUILD\)\}`/);
  assert.match(worker, /herdharbor-shell-v1\.8\.1-alpha-october-subscription-launch-referrals-credits-4/);
  assert.match(worker, /\.\/manifest\.json\?v=1\.8\.1/);
  assert.match(worker, /\.\/herdharbor-build\.js\?v=1\.8\.1/);
  assert.match(worker, /\.\/herdharbor-monitoring-config\.js\?v=1\.8\.1/);
  assert.match(worker, /\.\/pwa\.js\?v=30/);
  assert.match(worker, /NETWORK_FIRST_PATHS/);
  assert.match(worker, /fetch\(request, \{ cache: "no-store" \}\)/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">/);
  assert.match(html, /manifest\.json\?v=1\.8\.1/);
  assert.match(html, /herdharbor-build\.js\?v=1\.8\.1/);
  assert.match(html, /pwa\.js\?v=30/);
  assert.match(html, /const APP_VERSION = window\.HerdHarborBuild\?\.version \|\| "1\.8\.1"/);
});

test("v1.8.1 account, subscription, referral and registration layers remain in the release shell", () => {
  for (const asset of [
    "registration-safety-v1.8.1.js",
    "subscription-launch-v1.8.1.js",
    "subscription-referral-policy-v1.8.1.js",
    "subscription-admin-credits-v1.8.1.js",
    "subscription-stripe-launch-bridge-v1.8.1.js"
  ]) {
    assert.ok(build.includes(asset), `build loader is missing ${asset}`);
    assert.ok(worker.includes(asset), `service worker is missing ${asset}`);
  }
  assert.match(build, /subscription-engine-v1\.8\.0\.js\?v=1/);
  assert.match(worker, /subscription-engine-v1\.8\.0\.js/);
});

test("monitoring source is secret-safe and current production acceptance identifies v1.8.1", () => {
  assert.match(monitoringConfig, /dsn:\s*""/);
  assert.match(monitoringConfig, /release:\s*"HerdHarbor@1\.8\.1"/);
  assert.match(monitoringGenerator, /HERDHARBOR_SENTRY_DSN/);
  assert.match(monitoringGenerator, /release:\s*"HerdHarbor@1\.8\.1"/);
  assert.match(sentryAcceptance, /release:\s*"HerdHarbor@1\.8\.1"/);
  assert.match(sentryAcceptance, /privacy:\s*"synthetic_only"/);
  assert.doesNotMatch(monitoringConfig, /https:\/\/.+@.+\/\d+/);
});

test("repository security audit is a permanent release gate", () => {
  assert.equal(pkg.scripts["audit:security"], "node scripts/repository-security-audit.mjs");
  assert.match(pkg.scripts["test:release"], /npm run audit:security/);
  assert.match(securityAudit, /Stripe secret\/restricted key/);
  assert.match(securityAudit, /Stripe webhook signing secret/);
  assert.match(securityAudit, /private key material/);
  assert.match(securityAudit, /duplicate browser Supabase client creation/);
  assert.match(securityAudit, /herdharbor-cloud\.js must create exactly one client/);
});

test("repository uses one current CI/deploy set and no legacy release workflow files", () => {
  const currentWorkflows = [
    ".github/workflows/v1.8.1-ci.yml",
    ".github/workflows/v1.8.1-production-pages.yml",
    ".github/workflows/v1.8.1-production-acceptance.yml"
  ];
  for (const workflow of currentWorkflows) assert.ok(exists(workflow), `missing current workflow ${workflow}`);

  for (const obsolete of [
    ".github/workflows/android-alpha.yml",
    ".github/workflows/v1.6.1-monitoring-bundle.yml",
    ".github/workflows/v1.6.1-pages-deploy.yml",
    ".github/workflows/v1.6.5-release-review.yml",
    ".github/workflows/v1.6.7-final-production-pages-closeout.yml",
    ".github/workflows/v1.6.7-production-acceptance.yml",
    ".github/workflows/v1.6.7-release-review.yml",
    ".github/workflows/v1.7.0-arba-review.yml",
    ".github/workflows/v1.7.0-release-repair.yml",
    ".github/workflows/v1.7.1-review.yml"
  ]) assert.equal(exists(obsolete), false, `obsolete workflow still present: ${obsolete}`);

  const ci = read(currentWorkflows[0]);
  const deploy = read(currentWorkflows[1]);
  const acceptance = read(currentWorkflows[2]);
  assert.match(ci, /pull_request:[\s\S]*branches: \[main\]/);
  assert.match(ci, /npm run test:release/);
  assert.match(ci, /TZ: UTC/);
  assert.match(ci, /TZ: America\/New_York/);
  assert.match(ci, /herdharbor-v1\.8\.1-unsigned-aab/);
  assert.match(deploy, /Checkout exact main release payload/);
  assert.match(deploy, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(deploy, /"release": "HerdHarbor@1\.8\.1"/);
  assert.match(acceptance, /workflow_dispatch:/);
  assert.doesNotMatch(acceptance, /^\s*push:/m);
  assert.doesNotMatch(acceptance, /^\s*pull_request:/m);
  assert.doesNotMatch(acceptance, /psql|supabase functions deploy/);
});

test("stable older-named domain engines and migration lineage remain intentionally preserved", () => {
  for (const runtime of [
    "analytics-v1.6.1.js",
    "rabbit-genetics-v1.6.1.js",
    "standards-registry-v1.7.0.js",
    "multispecies-genetics-v1.7.1.js",
    "health-intelligence-v1.7.1.js"
  ]) assert.ok(exists(runtime), `stable carried-forward runtime was removed: ${runtime}`);

  for (const migration of [
    "supabase/v1.6.5-market-analytics-foundation.sql",
    "supabase/v1.6.7-market-privacy-hardening.sql",
    "supabase/v1.8.0-stripe-billing-hardening.sql",
    "supabase/v1.8.1-registration-safety.sql",
    "supabase/v1.8.1-referrals-credits.sql"
  ]) assert.ok(exists(migration), `migration lineage was removed: ${migration}`);

  for (const fn of [
    "market-contribution",
    "registration-profile",
    "registration-referral",
    "subscription-billing",
    "subscription-webhook",
    "email-engine"
  ]) {
    assert.ok(exists(`supabase/functions/${fn}`), `current Supabase function source is missing: ${fn}`);
    assert.ok(supabaseConfig.includes(`[functions.${fn}]`), `Supabase config is missing function policy: ${fn}`);
  }
});

test("current documentation is v1.8.1 and stale release/debt snapshots stay out of the live tree", () => {
  assert.match(readme, /^# HerdHarbor Alpha v1\.8\.1/m);
  assert.match(releaseNotes, /^# HerdHarbor Alpha v1\.8\.1/m);
  assert.match(releaseNotes, /Referral IDs and Member-month credits/);
  assert.match(checklist, /^# HerdHarbor Alpha v1\.8\.1 Acceptance Checklist/m);

  for (const obsolete of [
    "README-AUTH-SETUP.md",
    "DATA_NOTICE.md",
    "HOTFIX-v1.6.7-mobile-settings-layout.md",
    "HOTFIX-v1.7.1-stabilization.md",
    "V1.6.7-COMPLETION-AUDIT.md",
    "V1.6.7-PRODUCTION-ACCEPTANCE.md",
    "V1.6.7-SIGNIN-HOTFIX.md",
    "RELEASE_NOTES-v0.2.4.md",
    "RELEASE_NOTES-v1.4.0.md",
    "RELEASE_NOTES-v1.4.1.md",
    "RELEASE_NOTES-v1.4.5.md",
    "RELEASE_NOTES-v1.5.0.md",
    "RELEASE_NOTES-v1.5.1.md",
    "RELEASE_NOTES-v1.6.1.md",
    "RELEASE_NOTES-v1.6.6.md",
    "RELEASE_NOTES-v1.6.7.md",
    "RELEASE_NOTES-v1.7.0.md",
    "RELEASE_NOTES-v1.7.1.md",
    "RELEASE_NOTES_v1.8.0.md"
  ]) assert.equal(exists(obsolete), false, `obsolete live-tree artifact returned: ${obsolete}`);
});
