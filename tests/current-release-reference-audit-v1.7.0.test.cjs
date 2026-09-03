"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const build = read("herdharbor-build.js");
const manifest = JSON.parse(read("manifest.json"));
const twa = JSON.parse(read("twa-manifest.json"));
const gradle = read("android/app/build.gradle");
const pkg = JSON.parse(read("package.json"));
const packageLock = JSON.parse(read("package-lock.json"));
const pwa = read("pwa.js");
const worker = read("service-worker.js");
const html = read("index.html");
const cloud = read("herdharbor-cloud.js");
const monitoringConfig = read("herdharbor-monitoring-config.js");
const monitoringGenerator = read("scripts/build-monitoring-config.mjs");
const release = read("herdharbor-release-v1.6.1.js");
const playNotes = read("google-play/listing/en-US/release-notes.txt");
const releaseNotes = read("RELEASE_NOTES-v1.7.0.md");

const version = build.match(/version:\s*"([^"]+)"/)?.[1];
const buildId = build.match(/buildId:\s*"([^"]+)"/)?.[1];

assert.equal(version, "1.7.0");
assert.equal(buildId, "arba-standards-1");
assert.match(build, /build:\s*"1\.7\.0-alpha-arba-standards-1"/);
assert.equal(manifest.version, "1.7.0");
assert.equal(pkg.version, "1.7.0");
assert.equal(packageLock.version, "1.7.0");
assert.equal(packageLock.packages[""].version, "1.7.0");
assert.equal(twa.appVersion, "1.7.0");
assert.equal(twa.appVersionCode, 13);
assert.match(gradle, /versionCode 13/);
assert.match(gradle, /versionName "1\.7\.0"/);

assert.match(pwa, /Current release contract: const APP_VERSION = "1\.7\.0"/);
assert.match(pwa, /window\.HerdHarborBuild\?\.version \|\| "1\.7\.0"/);
assert.match(pwa, /window\.HerdHarborBuild\?\.buildId \|\| "arba-standards-1"/);
assert.match(worker, /herdharbor-shell-v1\.7\.0-alpha-arba-standards-1/);
assert.match(pwa, /const navigatorRef = \(\) =>/);
assert.match(html, /window\.HerdHarborApp = Object\.freeze/);
assert.match(html, /herdharbor:app-ready/);
assert.match(html, /herdharbor-build\.js\?v=1\.7\.0/);
assert.match(html, /herdharbor-cloud\.js\?v=20/);
assert.match(html, /pwa\.js\?v=28/);
for (const asset of [
  "herdharbor-release-v1.6.1.js",
  "herdharbor-membership-v1.6.1.js",
  "herdharbor-access-cache-v1.6.1.js",
  "herdharbor-admin-v1.6.1.js",
  "market-analytics-v1.6.5.js",
  "analytics-v1.6.1.js"
]) assert.ok(html.includes(`${asset}?v=1.7.0`), `index shell current release identity missing for ${asset}`);
assert.match(cloud, /let marketCleanup = \{ backendConfirmed: false, localQueueCleared: true \}/);

for (const asset of [
  "manifest.json",
  "herdharbor-release-v1.6.1.js",
  "herdharbor-membership-v1.6.1.js",
  "herdharbor-access-cache-v1.6.1.js",
  "herdharbor-admin-v1.6.1.js",
  "herdharbor-core-v1.6.1.css",
  "herdharbor-v1.6.1.css",
  "herdharbor-build.js",
  "analytics-v1.6.1.css",
  "market-analytics-v1.6.5.js",
  "analytics-v1.6.1.js",
  "herdharbor-monitoring-config.js",
  "pedigree-genetics-v1.6.1.js",
  "rabbit-genetics-v1.6.1.js",
  "shows-v1.6.1.js",
  "shows-v1.6.1-hardening.js",
  "standards-v1.7.0.css",
  "standards-registry-v1.7.0.js",
  "standards-ui-v1.7.0.js"
]) {
  assert.ok(worker.includes(`./${asset}?v=1.7.0`), `service worker current release identity missing for ${asset}`);
}

assert.match(monitoringConfig, /release: "HerdHarbor@1\.7\.0"/);
assert.match(monitoringConfig, /build: "arba-standards-1"/);
assert.match(monitoringGenerator, /release: "HerdHarbor@1\.7\.0"/);
assert.match(monitoringGenerator, /arba-standards-1/);
assert.match(release, /window\.HerdHarborBuild\?\.version \|\| "1\.7\.0"/);
assert.match(release, /window\.HerdHarborBuild\?\.buildId \|\| "arba-standards-1"/);
assert.match(release, /1\.7\.0-alpha-arba-standards-1/);
assert.match(playNotes, /Alpha v1\.7\.0/);
assert.match(releaseNotes, /Alpha v1\.7\.0/);
assert.doesNotMatch(releaseNotes, /Review candidate/i);

const currentIdentityFiles = [
  "herdharbor-build.js",
  "manifest.json",
  "twa-manifest.json",
  "android/app/build.gradle",
  "package.json",
  "pwa.js",
  "service-worker.js",
  "herdharbor-monitoring-config.js",
  "scripts/build-monitoring-config.mjs",
  "herdharbor-release-v1.6.1.js",
  "google-play/listing/en-US/release-notes.txt",
  "RELEASE_NOTES-v1.7.0.md"
];
const currentIdentityText = currentIdentityFiles.map((file) => `\n--- ${file} ---\n${read(file)}`).join("\n");
assert.doesNotMatch(currentIdentityText, /completion-debt-1/);
assert.doesNotMatch(currentIdentityText, /HerdHarbor@1\.6\.7/);
assert.doesNotMatch(currentIdentityText, /versionName "1\.6\.7"/);
assert.doesNotMatch(currentIdentityText, /"appVersion":\s*"1\.6\.7"/);
assert.doesNotMatch(currentIdentityText, /"version":\s*"1\.6\.7"/);

const retiredRuntimeAssets = [
  "herdharbor-release-v1.4.5.js",
  "pedigree-genetics-v1.4.5.js",
  "pedigree-genetics-v1.4.5.css",
  "rabbit-records-v1.4.5.js",
  "rabbit-genetics-engine-v1.4.5.js",
  "rabbit-genetics-runtime-v1.4.5.js",
  "rabbit-genetics-ui-v1.4.5.js",
  "breeding-pair-hotfix-v1.4.2.js",
  "shows-v1.5.0.js",
  "shows-v1.5.0.css",
  "shows-v1.5.0-hardening.js",
  "shows-v1.5.0-performance.js"
];
for (const retired of retiredRuntimeAssets) {
  assert.ok(!pwa.includes(retired), `pwa.js must not load retired runtime ${retired}`);
  assert.ok(!worker.includes(retired), `service-worker.js must not cache retired runtime ${retired}`);
}

console.log(`Alpha v${version} current release-reference audit passed for ${buildId}`);
