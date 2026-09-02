"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const build = read("herdharbor-build.js");
const pwa = read("pwa.js");
const worker = read("service-worker.js");
const html = read("index.html");
const manifest = JSON.parse(read("manifest.json"));
const twa = JSON.parse(read("twa-manifest.json"));
const gradle = read("android/app/build.gradle");
const packageJson = JSON.parse(read("package.json"));

const buildId = build.match(/buildId:\s*"([^"]+)"/)?.[1];
const version = build.match(/version:\s*"([^"]+)"/)?.[1];

assert.equal(version, "1.6.6");
assert.equal(buildId, "mobile-analytics-hotfix-1");
assert.match(build, /build:\s*"1\.6\.6-alpha-mobile-analytics-hotfix-1"/);
assert.equal(manifest.version, version);
assert.match(worker, /herdharbor-shell-v1\.6\.6-alpha-mobile-analytics-hotfix-1/);

// v1.6.6 is an urgent web/PWA layout hotfix. The Android wrapper binary and
// monitoring package are unchanged because the TWA consumes the live web app.
assert.equal(twa.appVersion, "1.6.5");
assert.equal(twa.appVersionCode, 11);
assert.match(gradle, /versionCode 11/);
assert.match(gradle, /versionName "1\.6\.5"/);
assert.equal(packageJson.version, "1.6.5");

// Runtime identity comes from HerdHarborBuild. Existing stable asset query
// identities stay on 1.6.5; the new service-worker cache name forces a fresh
// shell install while network-first runtime assets fetch the corrected CSS.
assert.match(pwa, /window\.HerdHarborBuild\?\.version \|\| "1\.6\.5"/);
assert.match(pwa, /window\.HerdHarborBuild\?\.buildId \|\| "analytics-market-foundation-1"/);
for (const asset of [
  "herdharbor-build.js", "herdharbor-release-v1.6.1.js", "herdharbor-v1.6.1.css",
  "analytics-v1.6.1.css", "analytics-v1.6.1.js", "market-analytics-v1.6.5.js"
]) {
  assert.ok(html.includes(`${asset}?v=1.6.5`), `index must retain stable ${asset} query identity`);
  assert.ok(worker.includes(`./${asset}?v=1.6.5`), `service worker must precache ${asset} using the stable query identity`);
}

const retiredRuntimeAssets = [
  "herdharbor-release-v1.4.5.js", "pedigree-genetics-v1.4.5.js",
  "pedigree-genetics-v1.4.5.css", "rabbit-records-v1.4.5.js",
  "rabbit-genetics-engine-v1.4.5.js", "rabbit-genetics-runtime-v1.4.5.js",
  "rabbit-genetics-ui-v1.4.5.js", "breeding-pair-hotfix-v1.4.2.js",
  "shows-v1.5.0.js", "shows-v1.5.0.css", "shows-v1.5.0-hardening.js",
  "shows-v1.5.0-performance.js"
];
for (const retired of retiredRuntimeAssets) {
  assert.ok(!pwa.includes(retired), `pwa.js must not load retired runtime ${retired}`);
  assert.ok(!worker.includes(retired), `service-worker.js must not cache retired runtime ${retired}`);
  assert.ok(!html.includes(retired), `index.html must not embed retired runtime ${retired}`);
}

assert.match(worker, /market-analytics-v1\.6\.5\.js/);
assert.match(worker, /analytics-v1\.6\.1\.js\?v=1\.6\.5/);
assert.match(read("RELEASE_NOTES-v1.6.6.md"), /Mobile Analytics Hotfix/);

console.log(`Alpha v${version} web hotfix release-reference audit passed for ${buildId}`);
