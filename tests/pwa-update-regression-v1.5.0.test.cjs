"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const pwa = read("pwa.js");
const worker = read("service-worker.js");
const cloud = read("herdharbor-cloud.js");
const manifest = JSON.parse(read("manifest.json"));
const html = read("index.html");
const build = read("herdharbor-build.js");

// v1.7.1 keeps the independently verified update path and uses HerdHarborBuild as authoritative identity.
assert.equal(manifest.version, "1.7.1");
assert.match(build, /version:\s*"1\.7\.0"/);
assert.match(build, /buildId:\s*"multispecies-genetics-foundation-1"/);
assert.match(pwa, /window\.HerdHarborBuild\?\.version \|\| "1\.7\.0"/);
assert.match(pwa, /window\.HerdHarborBuild\?\.buildId \|\| "multispecies-genetics-foundation-1"/);
assert.match(pwa, /Version \$\{APP_VERSION\} · Build \$\{BUILD_ID\}/);
assert.match(html, /herdharbor-build\.js\?v=1\.7\.0/, "the shell bootstrap must use the current release identity");

// Service-worker discovery is explicit and independent from Cloud Sync.
assert.match(pwa, /navigatorRef\(\)\.serviceWorker\.register\("service-worker\.js"/);
assert.match(pwa, /updateViaCache: "none"/);
assert.match(pwa, /registration\.update\(\)/);
assert.match(pwa, /checkForAppUpdate\(\{ force: true \}\)/);
assert.match(pwa, /visibilitychange/);
assert.match(pwa, /window\.addEventListener\("focus"/);
assert.match(pwa, /window\.addEventListener\("online"/);
assert.match(pwa, /window\.addEventListener\("pageshow"/);
assert.doesNotMatch(pwa, /HerdHarborCloud/);
assert.doesNotMatch(pwa, /syncNow\(/);
assert.match(pwa, /Cloud Sync is not required/);
assert.match(pwa, /HerdHarbor Update Available/);
assert.match(pwa, />Update Now</);
assert.match(pwa, />Later</);
assert.match(pwa, /4 \* 60 \* 60 \* 1000/);

// New workers wait for the existing-style Update Now action instead of auto-activating.
const installHandler = worker.match(/self\.addEventListener\("install",[\s\S]*?\n\}\);/);
assert.ok(installHandler, "service worker install handler exists");
assert.doesNotMatch(installHandler[0], /skipWaiting/);
assert.match(worker, /event\.data\?\.type === "SKIP_WAITING"/);
assert.match(pwa, /workerToActivate\.postMessage\(\{ type: "SKIP_WAITING" \}\)/);
assert.match(pwa, /controllerchange/);
assert.match(pwa, /window\.location\.reload\(\)/);

// Updating app code never clears, overwrites, or requires synchronization of farm state.
assert.doesNotMatch(pwa, /localStorage\.(?:clear|removeItem)\(/);
assert.doesNotMatch(pwa, /herdharbor_pre_alpha_v1/);
assert.doesNotMatch(pwa, /dirtyKey|ACTIVE_OWNER_KEY|baseKey/);
assert.match(cloud, /const STORAGE_KEY = "herdharbor_pre_alpha_v1"/);
assert.match(cloud, /hasUnsyncedChanges/);
assert.doesNotMatch(cloud, /SKIP_WAITING|registration\.update|HerdHarborPWA/);

// Browser/app shell requests favor production over stale frontend caches while retaining offline fallback.
assert.match(worker, /v1\.7\.0-alpha-multispecies-genetics-foundation-1/);
assert.match(worker, /fetch\(request, \{ cache: "no-store" \}\)/);
assert.match(worker, /NETWORK_FIRST_PATHS/);
assert.match(worker, /\/manifest\.json/);
assert.match(worker, /\/pwa\.js/);
assert.match(worker, /\/herdharbor-build\.js/);
assert.match(worker, /\/herdharbor-cloud\.js/);
assert.match(worker, /cache\.match\("\.\/index\.html"\)/);
assert.match(worker, /CACHE_PREFIX/);
assert.match(worker, /caches\.delete\(key\)/);
assert.match(worker, /self\.clients\.claim\(\)/);
assert.match(pwa, /manifest\.json\?build=\$\{encodeURIComponent\(PWA_BUILD\)\}/);

console.log("Alpha v1.7.1 PWA update-regression tests passed");
