"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));

const pkg = JSON.parse(read("package.json"));
const build = read("herdharbor-build.js");
const manifest = JSON.parse(read("manifest.json"));
const twa = JSON.parse(read("twa-manifest.json"));
const gradle = read("android/app/build.gradle");
const worker = read("service-worker.js");
const index = read("index.html");
const pages = read(".github/workflows/v2.0.0-production-pages.yml");
const productionAcceptance = read(".github/workflows/v2.0.0-production-acceptance.yml");

test("final release command composes security, complete 2.0.0 regression, and state integrity", () => {
  assert.match(pkg.scripts["test:v2.0.0-final"], /test:release/);
  assert.match(pkg.scripts["test:v2.0.0-final"], /test:v2\.0\.0/);
  assert.match(pkg.scripts["test:v2.0.0-final"], /test:state-integrity/);
  assert.equal(pkg.scripts["test:completion"], "npm run test:v2.0.0-final");
});

test("every dedicated 2.0.0 release phase gate remains wired into the aggregate release", () => {
  for (const script of [
    "test:v2.0.0-android",
    "test:v2.0.0-billing",
    "test:v2.0.0-account-sync",
    "test:v2.0.0-ai",
    "test:v2.0.0-positioning",
    "test:v2.0.0-workflows",
    "test:v2.0.0-monitoring",
    "test:v2.0.0-launch-material"
  ]) {
    assert.equal(typeof pkg.scripts[script], "string", script);
  }
  for (const token of [
    "test:v2.0.0-android",
    "test:v2.0.0-billing",
    "test:v2.0.0-account-sync",
    "test:v2.0.0-ai",
    "test:v2.0.0-positioning",
    "test:v2.0.0-workflows",
    "test:v2.0.0-monitoring",
    "test:v2.0.0-launch-material"
  ]) assert.ok(pkg.scripts["test:v2.0.0-regression"].includes(token), token);
});

test("authoritative production identities agree on stable 2.0.0", () => {
  assert.equal(pkg.version, "2.0.0");
  assert.equal(manifest.version, "2.0.0");
  assert.equal(String(twa.appVersion), "2.0.0");
  assert.equal(Number(twa.appVersionCode), 19);
  assert.match(build, /channel:\s*"Stable"/);
  assert.match(build, /version:\s*"2\.0\.0"/);
  assert.match(gradle, /versionName\s+"2\.0\.0"/);
  assert.match(gradle, /versionCode\s+19/);
  assert.match(worker, /herdharbor-shell-v2\.0\.0-v2\.0\.0-release-1/);
  assert.match(index, /herdharbor-cloud\.js\?v=35/);
});

test("normal member and store surfaces contain no pre-release or internal-component branding", () => {
  const surfaces = [
    read("index.html"),
    read("how-to/index.html"),
    read("manifest.json"),
    read("android/app/src/main/res/raw/web_app_manifest.json"),
    read("google-play/listing/en-US/full-description.txt"),
    read("google-play/listing/en-US/short-description.txt"),
    read("google-play/listing/en-US/release-notes.txt")
  ];
  for (const source of surfaces) {
    assert.doesNotMatch(source, /\bAlpha\b|\bBeta\b|Founder tester|Genetics Engine v\d|Cloud Sync v\d|Health Intelligence v\d|Runtime v\d|Module v\d/i);
  }
});

test("current release workflow files are 2.0.0 only", () => {
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

test("both protected production workflows require the final release gate", () => {
  assert.match(pages, /npm run test:v2\.0\.0-final/);
  assert.match(productionAcceptance, /npm run test:v2\.0\.0-final/);
  assert.doesNotMatch(productionAcceptance, /Alpha v1\.8\.4/);
});

test("final gate does not imply deployment before the monitored publisher succeeds", () => {
  const readme = read("README.md");
  assert.match(readme, /2\.0\.0 release is not considered live until the exact merged `main` commit completes the monitored production publisher/i);
  assert.match(readme, /Google Play:\*\* coming soon/i);
  assert.match(readme, /Apple App Store:\*\* coming soon/i);
});
