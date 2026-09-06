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
const releaseNotes = read("RELEASE_NOTES-v1.7.1.md");

const version = build.match(/version:\s*"([^"]+)"/)?.[1];
const buildId = build.match(/buildId:\s*"([^"]+)"/)?.[1];

// This file originated as the v1.7.1 current-release audit. v1.8.x is now the
// web release line, while v1.7.1 remains the authoritative domain/genetics
// foundation. Keep guarding inherited contracts without falsely requiring the
// entire application shell to still identify itself as v1.7.1.
assert.ok(["1.7.1", "1.8.0", "1.8.1"].includes(version), `unexpected current web release ${version}`);
if (version === "1.7.1") {
  assert.equal(buildId, "multispecies-genetics-foundation-1");
  assert.match(build, /build:\s*"1\.7\.1-alpha-multispecies-genetics-foundation-1"/);
} else if (version === "1.8.0") {
  assert.match(buildId, /^subscription-engine-/);
  assert.match(build, /build:\s*"1\.8\.0-alpha-subscription-engine-/);
  assert.match(build, /subscription-engine-v1\.8\.0\.js\?v=1/);
  assert.match(worker, /herdharbor-shell-v1\.8\.0/);
} else {
  assert.equal(buildId, "october-launch-trial-1");
  assert.match(build, /build:\s*"1\.8\.1-alpha-october-launch-trial-1"/);
  assert.match(build, /subscription-engine-v1\.8\.0\.js\?v=1/);
  assert.match(build, /subscription-launch-v1\.8\.1\.js\?v=1/);
  assert.match(worker, /herdharbor-shell-v1\.8\.1-alpha-october-launch-trial-1/);
}

// Native/package identities have their own release cadence. They must remain
// internally self-consistent until a dedicated native/package bump is shipped.
assert.equal(pkg.version, packageLock.version);
assert.equal(pkg.version, packageLock.packages[""].version);
assert.equal(String(twa.appVersion), gradle.match(/versionName\s+"([^"]+)"/)?.[1]);
assert.equal(Number(twa.appVersionCode), Number(gradle.match(/versionCode\s+(\d+)/)?.[1]));
assert.ok(manifest.version, "manifest must retain a version identity");

// Core shell/PWA protections remain present under newer releases.
assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">/);
assert.match(html, /herdharbor-build\.js\?v=1\.7\.1/);
assert.match(html, /pwa\.js\?v=29/);
assert.match(cloud, /version:\s*"1\.7\.1"/);
assert.match(pwa, /multispecies-genetics-v1\.7\.1\.js\?v=1\.7\.1/);
assert.match(pwa, /multispecies-genetics-ui-v1\.7\.1\.js\?v=1\.7\.1/);
assert.match(pwa, /multispecies-genetics-v1\.7\.1\.css\?v=1\.7\.1/);
assert.doesNotMatch(pwa, /multispecies-genetics-v1\.6\.1\.js/);
assert.doesNotMatch(worker, /multispecies-genetics-v1\.6\.1\.js/);

for (const asset of [
  "herdharbor-release-v1.6.1.js",
  "herdharbor-membership-v1.6.1.js",
  "herdharbor-access-cache-v1.6.1.js",
  "herdharbor-admin-v1.6.1.js",
  "market-analytics-v1.6.5.js",
  "analytics-v1.6.1.js"
]) {
  assert.ok(html.includes(`${asset}?v=1.7.1`), `preserved shell asset missing for ${asset}`);
}

for (const asset of [
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
  assert.ok(worker.includes(`./${asset}?v=1.7.1`), `service worker preserved asset missing for ${asset}`);
}

// v1.7.1 shared genetics remains authoritative even when a newer shell is active.
assert.match(genetics, /const VERSION='1\.7\.1'/);
assert.match(genetics, /const SCHEMA_VERSION=4/);
assert.match(genetics, /species:'Rabbit'.*status:ADAPTER_STATUS\.PRODUCTION/);
for (const species of ["Cattle", "Goat", "Sheep", "Poultry", "Swine"]) {
  assert.match(genetics, new RegExp(`species:'${species}'.*status:ADAPTER_STATUS\\.FOUNDATION`), `${species} must remain foundation-only until its reviewed genetics release`);
}
assert.match(genetics, /Poultry'.*chromosomeSystem:'ZW'/);
assert.match(geneticsUi, /No species-specific gene library bundled yet\./);
assert.match(geneticsUi, /Unknown and partial genetics stay unknown\./);
assert.match(release, /HerdHarborMultiSpeciesGeneticsUI\?\.open/);
assert.match(releaseNotes, /Alpha v1\.7\.1/);
assert.match(releaseNotes, /Do not rewrite the rabbit genetics engine/i);
assert.doesNotMatch(releaseNotes, /review candidate/i);

// Monitoring remains source-safe. The protected production build injects the
// actual DSN; never require or expose it in the repository source.
assert.match(monitoringConfig, /dsn:\s*""/);
assert.match(monitoringGenerator, /HERDHARBOR_SENTRY_DSN/);

assert.equal(fs.existsSync(path.join(root, ".github/workflows/v1.7.1-bootstrap.yml")), false, "temporary v1.7.1 bootstrap workflow must stay removed");
assert.equal(fs.existsSync(path.join(root, "scripts/prepare-v1.7.1-release.mjs")), false, "temporary v1.7.1 preparation script must stay removed");

for (const retired of [
  "herdharbor-release-v1.4.5.js",
  "rabbit-genetics-engine-v1.4.5.js",
  "rabbit-genetics-runtime-v1.4.5.js",
  "shows-v1.5.0.js"
]) {
  assert.ok(!pwa.includes(retired), `pwa.js must not load retired runtime ${retired}`);
  assert.ok(!worker.includes(retired), `service-worker.js must not cache retired runtime ${retired}`);
}

console.log(`HerdHarbor v${version} preserved v1.7.1 foundation audit passed for ${buildId}`);