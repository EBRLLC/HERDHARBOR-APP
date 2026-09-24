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

test("all whole-app release owners identify Alpha v1.8.4", () => {
  assert.equal(pkg.version, "1.8.4");
  assert.equal(lock.version, "1.8.4");
  assert.equal(lock.packages[""].version, "1.8.4");
  assert.equal(manifest.version, "1.8.4");
  assert.equal(String(twa.appVersion), "1.8.4");
  assert.equal(Number(twa.appVersionCode), 18);
  assert.match(build, /version:\s*"1\.8\.4"/);
  assert.match(build, /buildId:\s*"alpha-v1\.8\.4-release-1"/);
  assert.match(gradle, /versionName\s+"1\.8\.4"/);
  assert.match(gradle, /versionCode\s+18/);
});

test("PWA, shell and monitoring use the v1.8.4 release identity", () => {
  assert.match(pwa, /version \|\| "1\.8\.4"/);
  assert.match(pwa, /buildId \|\| "alpha-v1\.8\.4-release-1"/);
  assert.match(worker, /RELEASE_ASSET_REVISION = "__HH_RELEASE_ASSET_REVISION__"/);
  assert.match(worker, /CACHE_NAME = CACHE_PREFIX \\+ RELEASE_ASSET_REVISION/);
  assert.match(index, /manifest\.json\?v=1\.8\.4/);
  assert.match(index, /herdharbor-build\.js\?v=1\.8\.4/);
  assert.match(monitoring, /release:\s*"HerdHarbor@1\.8\.4"/);
  assert.match(monitoring, /build:\s*"alpha-v1\.8\.4-release-1"/);
});

test("only v1.8.4 release workflows are current", () => {
  for (const p of [
    ".github/workflows/v1.8.4-ci.yml",
    ".github/workflows/v1.8.4-production-pages.yml",
    ".github/workflows/v1.8.4-production-acceptance.yml"
  ]) assert.equal(exists(p), true, p);

  for (const p of [
    ".github/workflows/v1.8.3-ci.yml",
    ".github/workflows/v1.8.3-production-pages.yml",
    ".github/workflows/v1.8.3-production-acceptance.yml"
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

test("formal v1.8.4 release gate composes the stability regression suite", () => {
  assert.match(pkg.scripts["test:v1.8.4"], /test:v1\.8\.3/);
  assert.match(pkg.scripts["test:v1.8.4"], /test:v1\.8\.4-regression/);
  assert.match(pkg.scripts["test:release"], /current-release-reference-audit-v1\.8\.4\.test\.cjs/);
});
