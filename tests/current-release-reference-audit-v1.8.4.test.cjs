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
const build = read("herdharbor-build.js");
const gradle = read("android/app/build.gradle");
const pwa = read("pwa.js");
const worker = read("service-worker.js");
const index = read("index.html");
const monitoring = read("herdharbor-monitoring-config.js");

test("all whole-app release owners identify stable v2.0.0", () => {
  assert.equal(pkg.version, "2.0.0");
  assert.equal(lock.version, "2.0.0");
  assert.equal(lock.packages[""].version, "2.0.0");
  assert.equal(manifest.version, "2.0.0");
  assert.equal(String(twa.appVersion), "2.0.0");
  assert.equal(Number(twa.appVersionCode), 19);
  assert.match(build, /version:\s*"2\.0\.0"/);
  assert.match(build, /channel:\s*"Stable"/);
  assert.match(build, /buildId:\s*"v2\.0\.0-release-1"/);
  assert.match(gradle, /versionName\s+"2\.0\.0"/);
  assert.match(gradle, /versionCode\s+19/);
});

test("runtime and monitoring fallbacks use the v2.0.0 release identity", () => {
  assert.match(pwa, /version \|\| "2\.0\.0"/);
  assert.match(pwa, /buildId \|\| "v2\.0\.0-release-1"/);
  assert.match(pwa, /PWA_BUILD = `\$\{APP_VERSION\}-\$\{BUILD_ID\}`/);
  assert.match(monitoring, /release:\s*"HerdHarbor@2\.0\.0"/);
  assert.match(monitoring, /build:\s*"v2\.0\.0-release-1"/);
});

test("historical v1.8.4 coverage coexists with the current 2.0.0 workflows", () => {
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
});

test("stable carried-forward component identities are not renamed for the app release", () => {
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

test("v1.8.4 keeps normalized authority gated and AI expansion deferred", () => {
  const release = read("RELEASE_NOTES-v1.8.4.md");
  const contract = read("V1.8.4-STABILITY-RELEASE-CONTRACT.md");
  assert.match(release, /not mass-enabled/i);
  assert.match(release, /legacy full-state sync remains the authoritative recovery path/i);
  assert.match(release, /v2\.0\.1/);
  assert.match(contract, /does not expand AI functionality/i);
});

test("historical v1.8.4 wrapper still composes its stability regression suite", () => {
  assert.match(pkg.scripts["test:v1.8.4"], /test:v1\.8\.3/);
  assert.match(pkg.scripts["test:v1.8.4"], /test:v1\.8\.4-regression/);
  assert.match(pkg.scripts["test:v1.8.4"], /current-release-reference-audit-v1\.8\.4\.test\.cjs/);
});
