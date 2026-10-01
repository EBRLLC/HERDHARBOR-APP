"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));

const pkg = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json"));
const manifest = JSON.parse(read("manifest.json"));
const twa = JSON.parse(read("twa-manifest.json"));
const embeddedManifest = JSON.parse(read("android/app/src/main/res/raw/web_app_manifest.json"));
const build = read("herdharbor-build.js");
const gradle = read("android/app/build.gradle");
const pwa = read("pwa.js");
const worker = read("service-worker.js");
const monitoring = read("herdharbor-monitoring-config.js");
const index = read("index.html");

test("all authoritative whole-app release owners identify stable 2.0.0", () => {
  assert.equal(pkg.version, "2.0.0");
  assert.equal(lock.version, "2.0.0");
  assert.equal(lock.packages[""].version, "2.0.0");
  assert.equal(manifest.version, "2.0.0");
  assert.equal(embeddedManifest.version, "2.0.0");
  assert.equal(String(twa.appVersion), "2.0.0");
  assert.equal(Number(twa.appVersionCode), 19);
  assert.match(build, /channel:\s*"Stable"/);
  assert.match(build, /version:\s*"2\.0\.0"/);
  assert.match(build, /buildId:\s*"v2\.0\.0-release-1"/);
  assert.match(gradle, /versionName\s+"2\.0\.0"/);
  assert.match(gradle, /versionCode\s+19/);
});

test("runtime and monitoring identify the 2.0.0 release", () => {
  assert.match(pwa, /version \|\| "2\.0\.0"/);
  assert.match(pwa, /buildId \|\| "v2\.0\.0-release-1"/);
  assert.match(pwa, /PWA_BUILD = `\$\{APP_VERSION\}-\$\{BUILD_ID\}`/);
  assert.match(monitoring, /release:\s*"HerdHarbor@2\.0\.0"/);
  assert.match(monitoring, /build:\s*"v2\.0\.0-release-1"/);
});

test("formal 2.0.0 release artifacts and member-language gates exist", () => {
  for (const p of [
    "RELEASE_NOTES-v2.0.0.md",
    "V2.0.0-PRODUCTION-RELEASE-CONTRACT.md",
    "tests/v2.0.0-production-language.test.cjs",
    "tests/v2.0.0-component-language.test.cjs",
    "tests/v2.0.0-release-contract.test.cjs",
    "tests/v2.0.0-pwa-cutover.test.cjs",
    "tests/v2.0.0-android-release.test.cjs",
    "tests/v2.0.0-billing-acceptance.test.cjs",
    "tests/v2.0.0-account-sync-acceptance.test.cjs",
    "tests/v2.0.0-ai-production-audit.test.cjs",
    "tests/v2.0.0-product-positioning.test.cjs",
    "tests/v2.0.0-workflow-cutover.test.cjs",
    "tests/v2.0.0-monitoring-acceptance.test.cjs",
    "tests/v2.0.0-launch-material.test.cjs",
    "tests/v2.0.0-main-integrity-audit.test.cjs",
    "tests/v2.0.0-final-release-acceptance.test.cjs"
  ]) assert.equal(exists(p), true, p);
});

test("2.0.0 inherits the complete 1.8.x stability regression chain", () => {
  assert.match(pkg.scripts["test:v2.0.0-regression"], /test:v1\.8\.3/);
  assert.match(pkg.scripts["test:v2.0.0-regression"], /test:v1\.8\.4-regression/);
  assert.match(pkg.scripts["test:v2.0.0-regression"], /v2\.0\.0-production-language/);
  assert.match(pkg.scripts["test:v2.0.0-regression"], /v2\.0\.0-component-language/);
  assert.match(pkg.scripts["test:v2.0.0-regression"], /v2\.0\.0-release-contract/);
  assert.match(pkg.scripts["test:v2.0.0-regression"], /test:v2\.0\.0-android/);
  assert.match(pkg.scripts["test:v2.0.0-regression"], /test:v2\.0\.0-billing/);
  assert.match(pkg.scripts["test:v2.0.0-regression"], /test:v2\.0\.0-account-sync/);
  assert.match(pkg.scripts["test:v2.0.0-regression"], /test:v2\.0\.0-ai/);
  assert.match(pkg.scripts["test:v2.0.0-regression"], /test:v2\.0\.0-positioning/);
  assert.match(pkg.scripts["test:v2.0.0-regression"], /test:v2\.0\.0-monitoring/);
  assert.match(pkg.scripts["test:v2.0.0-regression"], /test:v2\.0\.0-main-integrity/);
  assert.match(pkg.scripts["test:v2.0.0-regression"], /test:v2\.0\.0-launch-material/);
  assert.match(pkg.scripts["test:v2.0.0"], /test:v2\.0\.0-regression/);
  assert.match(pkg.scripts["test:v2.0.0"], /current-release-reference-audit-v2\.0\.0/);
  assert.match(pkg.scripts["test:v2.0.0-final"], /test:v2\.0\.0/);
  assert.match(pkg.scripts["test:v2.0.0-final"], /test:state-integrity/);
  assert.match(pkg.scripts["test:release"], /current-release-reference-audit-v2\.0\.0/);
});

test("stable carried-forward component identities remain present", () => {
  for (const p of [
    "animal-profile-runtime-v1.8.3.js",
    "breeding-litter-runtime-v1.8.3.js",
    "health-runtime-v1.8.3.js",
    "task-runtime-v1.8.3.js",
    "sales-customer-runtime-v1.8.3.js",
    "cloud-sync-v2-flow-v1.8.2.js",
    "subscription-launch-v1.8.1.js",
    "health-intelligence-v1.7.1.js",
    "rabbit-genetics-v1.6.1.js"
  ]) assert.equal(exists(p), true, p);
});

test("PWA shell and bootstrap use the 2.0.0 cutover identity", () => {
  assert.match(worker, /herdharbor-shell-v2\.0\.0-v2\.0\.0-release-1/);
  assert.doesNotMatch(worker, /const CACHE_NAME = "herdharbor-shell-v1\.8\.4/);
  assert.match(index, /manifest\.json\?v=2\.0\.0/);
  assert.match(index, /herdharbor-build\.js\?v=2\.0\.0/);
  assert.match(index, /pwa\.js\?v=32/);
  assert.match(pkg.scripts["test:v2.0.0-regression"], /v2\.0\.0-pwa-cutover/);
});

test("current release workflows are stable 2.0.0 workflows", () => {
  for (const p of [
    ".github/workflows/v2.0.0-ci.yml",
    ".github/workflows/v2.0.0-production-pages.yml",
    ".github/workflows/v2.0.0-production-acceptance.yml"
  ]) assert.equal(exists(p), true, p);
  for (const p of [
    ".github/workflows/v1.8.4-ci.yml",
    ".github/workflows/v1.8.4-production-pages.yml",
    ".github/workflows/v1.8.4-production-acceptance.yml"
  ]) assert.equal(exists(p), false, p);
  const ci = read(".github/workflows/v2.0.0-ci.yml");
  assert.match(ci, /HerdHarbor@2\.0\.0/);
  assert.match(ci, /versionName "2\.0\.0"/);
  assert.match(ci, /versionCode 19/);
  assert.match(ci, /release-2\.0\.0-phase-\*/);
});
