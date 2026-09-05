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
const genetics = read("multispecies-genetics-v1.7.1.js");
const geneticsUi = read("multispecies-genetics-ui-v1.7.1.js");
const playNotes = read("google-play/listing/en-US/release-notes.txt");
const releaseNotes = read("RELEASE_NOTES-v1.7.1.md");

const version = build.match(/version:\s*"([^"]+)"/)?.[1];
const buildId = build.match(/buildId:\s*"([^"]+)"/)?.[1];

assert.equal(version, "1.7.1");
assert.equal(buildId, "multispecies-genetics-foundation-1");
assert.match(build, /build:\s*"1\.7\.1-alpha-multispecies-genetics-foundation-1"/);
assert.equal(manifest.version, "1.7.1");
assert.equal(pkg.version, "1.7.1");
assert.equal(packageLock.version, "1.7.1");
assert.equal(packageLock.packages[""].version, "1.7.1");
assert.equal(twa.appVersion, "1.7.1");
assert.equal(twa.appVersionCode, 14);
assert.match(gradle, /versionCode 14/);
assert.match(gradle, /versionName "1\.7\.1"/);

assert.match(pwa, /Current release contract: const APP_VERSION = "1\.7\.1"/);
assert.match(pwa, /window\.HerdHarborBuild\?\.version \|\| "1\.7\.1"/);
assert.match(pwa, /window\.HerdHarborBuild\?\.buildId \|\| "multispecies-genetics-foundation-1"/);
assert.match(worker, /herdharbor-shell-v1\.7\.1-alpha-multispecies-genetics-foundation-1/);
assert.match(html, /herdharbor-build\.js\?v=1\.7\.1/);
assert.match(html, /pwa\.js\?v=29/);
assert.match(cloud, /version:\s*"1\.7\.1"/);

for (const asset of [
  "herdharbor-release-v1.6.1.js",
  "herdharbor-membership-v1.6.1.js",
  "herdharbor-access-cache-v1.6.1.js",
  "herdharbor-admin-v1.6.1.js",
  "market-analytics-v1.6.5.js",
  "analytics-v1.6.1.js"
]) {
  assert.ok(html.includes(`${asset}?v=1.7.1`), `index shell current release identity missing for ${asset}`);
}

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
  "multispecies-genetics-v1.7.1.js",
  "multispecies-genetics-ui-v1.7.1.js",
  "multispecies-genetics-v1.7.1.css",
  "standards-v1.7.0.css",
  "standards-registry-v1.7.0.js",
  "standards-ui-v1.7.0.js",
  "standards-public-reference-v1.7.0.js",
  "shows-youth-guides-v1.7.0.js",
  "reference-guides-v1.7.0.css"
]) {
  assert.ok(worker.includes(`./${asset}?v=1.7.1`), `service worker current release identity missing for ${asset}`);
}

assert.match(pwa, /multispecies-genetics-v1\.7\.1\.js\?v=1\.7\.1/);
assert.match(pwa, /multispecies-genetics-ui-v1\.7\.1\.js\?v=1\.7\.1/);
assert.match(pwa, /multispecies-genetics-v1\.7\.1\.css\?v=1\.7\.1/);
assert.doesNotMatch(pwa, /multispecies-genetics-v1\.6\.1\.js/);
assert.doesNotMatch(worker, /multispecies-genetics-v1\.6\.1\.js/);

assert.match(genetics, /const VERSION='1\.7\.1'/);
assert.match(genetics, /const SCHEMA_VERSION=4/);
assert.match(genetics, /species:'Rabbit'.*status:ADAPTER_STATUS\.PRODUCTION/);
for (const species of ["Cattle", "Goat", "Sheep", "Poultry", "Swine"]) {
  assert.match(genetics, new RegExp(`species:'${species}'.*status:ADAPTER_STATUS\\.FOUNDATION`), `${species} must remain a foundation adapter in v1.7.1`);
}
assert.match(genetics, /Poultry'.*chromosomeSystem:'ZW'/);
assert.match(geneticsUi, /No species-specific gene library bundled yet\./);
assert.match(geneticsUi, /Unknown and partial genetics stay unknown\./);
assert.match(release, /HerdHarborMultiSpeciesGeneticsUI\?\.open/);
assert.match(release, /window\.HerdHarborBuild\?\.version \|\| "1\.7\.1"/);
assert.match(release, /multispecies-genetics-foundation-1/);

assert.match(monitoringConfig, /release: "HerdHarbor@1\.7\.1"/);
assert.match(monitoringConfig, /build: "multispecies-genetics-foundation-1"/);
assert.match(monitoringGenerator, /release: "HerdHarbor@1\.7\.1"/);
assert.match(monitoringGenerator, /multispecies-genetics-foundation-1/);
assert.match(playNotes, /Alpha v1\.7\.1/);
assert.match(playNotes, /Non-rabbit gene libraries are intentionally not bundled yet/i);
assert.match(releaseNotes, /Alpha v1\.7\.1/);
assert.match(releaseNotes, /Do not rewrite the rabbit genetics engine/i);
assert.doesNotMatch(releaseNotes, /review candidate/i);

assert.match(build, /standards-v1\.7\.0\.css\?v=1\.7\.1/);
assert.match(build, /standards-registry-v1\.7\.0\.js\?v=1\.7\.1/);
assert.match(build, /shows-youth-guides-v1\.7\.0\.js\?v=1\.7\.1/);

assert.equal(fs.existsSync(path.join(root, ".github/workflows/v1.7.1-bootstrap.yml")), false, "temporary v1.7.1 bootstrap workflow must be removed before review");
assert.equal(fs.existsSync(path.join(root, "scripts/prepare-v1.7.1-release.mjs")), false, "temporary v1.7.1 preparation script must be removed before review");

for (const retired of [
  "herdharbor-release-v1.4.5.js",
  "rabbit-genetics-engine-v1.4.5.js",
  "rabbit-genetics-runtime-v1.4.5.js",
  "shows-v1.5.0.js"
]) {
  assert.ok(!pwa.includes(retired), `pwa.js must not load retired runtime ${retired}`);
  assert.ok(!worker.includes(retired), `service-worker.js must not cache retired runtime ${retired}`);
}

console.log(`Alpha v${version} current release-reference audit passed for ${buildId}`);
