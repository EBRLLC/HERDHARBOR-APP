"use strict";

// Final review CI checkpoint after deterministic index recovery.
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
assert.equal(version, "1.6.5");
assert.equal(buildId, "analytics-market-foundation-1");
assert.match(build, /build:\s*"1\.6\.5-alpha-analytics-market-foundation-1"/);
assert.ok(pwa.includes(`const APP_VERSION = window.HerdHarborBuild?.version || "${version}";`));
assert.ok(pwa.includes(`const BUILD_ID = window.HerdHarborBuild?.buildId || "${buildId}";`));
assert.ok(worker.includes(`herdharbor-shell-v${version}-alpha-${buildId}`));
assert.match(html, /const APP_VERSION = window\.HerdHarborBuild\?\.version \|\| "1\.6\.5"/);
assert.equal(manifest.version, version);
assert.equal(twa.appVersion, version);
assert.equal(twa.appVersionCode, 11);
assert.match(gradle, /versionCode 11/);
assert.match(gradle, /versionName "1\.6\.5"/);
assert.equal(packageJson.version, version);

for (const asset of [
  "herdharbor-build.js", "herdharbor-release-v1.6.1.js", "herdharbor-v1.6.1.css",
  "analytics-v1.6.1.css", "analytics-v1.6.1.js", "market-analytics-v1.6.5.js"
]) {
  assert.ok(html.includes(`${asset}?v=1.6.5`), `index must request ${asset} with the v1.6.5 cache identity`);
  assert.ok(worker.includes(`./${asset}?v=1.6.5`), `service worker must precache ${asset} with the v1.6.5 cache identity`);
}

const staleBuildReferences = [];
for (const file of fs.readdirSync(__dirname).filter((name) => name.endsWith(".test.cjs"))) {
  if (file === path.basename(__filename)) continue;
  const source = fs.readFileSync(path.join(__dirname, file), "utf8");
  for (const reference of new Set(source.match(/current-state-\d+|analytics-market-foundation-\d+/g) || [])) {
    if (reference !== buildId) staleBuildReferences.push(`${file}: ${reference} (expected ${buildId})`);
  }
}
assert.deepEqual(staleBuildReferences, [], `stale build references found:\n${staleBuildReferences.join("\n")}`);

const activeFiles = [
  "herdharbor-build.js", "pwa.js", "service-worker.js", "manifest.json", "twa-manifest.json",
  "android/app/build.gradle", "package.json", "herdharbor-cloud.js"
];
for (const file of activeFiles) {
  const source = read(file);
  assert.doesNotMatch(source, /current-state-2|1\.6\.1-alpha-current-state-2/,
    `${file} retains a retired current build identity`);
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
assert.match(html, /HerdHarbor Alpha v1\.6\.5 consolidated application shell/);

console.log(`Alpha v${version} release-reference audit passed for ${buildId}`);
