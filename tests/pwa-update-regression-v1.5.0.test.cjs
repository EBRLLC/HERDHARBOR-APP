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

// v1.6.1 keeps the independently verified update path.
assert.equal(manifest.version, "1.6.1");
assert.match(pwa, /const APP_VERSION = "1\.6\.1"/);
assert.match(pwa, /const BUILD_ID = "current-state-2"/);
assert.match(pwa, /Version \$\{APP_VERSION\} · Build \$\{BUILD_ID\}/);
assert.match(html, /manifest\.json\?v=17/);

// Service-worker discovery is explicit and independent from Cloud Sync.
assert.match(pwa, /navigator\.serviceWorker\.register\("service-worker\.js"/);
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

// New workers wait for the existing-style Update now action instead of
// automatically activating while a user is still in the old app instance.
const installHandler = worker.match(/self\.addEventListener\("install",[\s\S]*?\n\}\);/);
assert.ok(installHandler, "service worker install handler exists");
assert.doesNotMatch(installHandler[0], /skipWaiting/);
assert.match(worker, /event\.data\?\.type === "SKIP_WAITING"/);
assert.match(pwa, /workerToActivate\.postMessage\(\{ type: "SKIP_WAITING" \}\)/);
assert.match(pwa, /controllerchange/);
assert.match(pwa, /window\.location\.reload\(\)/);

// Updating app code never clears, overwrites, or requires synchronization of
// herdharbor_pre_alpha_v1. A reload preserves localStorage and dirty markers.
assert.doesNotMatch(pwa, /localStorage\.(?:clear|removeItem)\(/);
assert.doesNotMatch(pwa, /herdharbor_pre_alpha_v1/);
assert.doesNotMatch(pwa, /dirtyKey|ACTIVE_OWNER_KEY|baseKey/);
assert.match(cloud, /const STORAGE_KEY = "herdharbor_pre_alpha_v1"/);
assert.match(cloud, /hasUnsyncedChanges/);
assert.doesNotMatch(cloud, /SKIP_WAITING|registration\.update|HerdHarborPWA/);

// Browser/app shell requests favor production over stale frontend caches while
// still falling back to the current shell when offline.
assert.match(worker, /v1\.6\.1-alpha-current-state-2/);
assert.match(worker, /fetch\(request, \{ cache: "no-store" \}\)/);
assert.match(worker, /NETWORK_FIRST_PATHS/);
assert.match(worker, /\/manifest\.json/);
assert.match(worker, /\/pwa\.js/);
assert.match(worker, /\/herdharbor-cloud\.js/);
assert.match(worker, /cache\.match\("\.\/index\.html"\)/);
assert.match(worker, /CACHE_PREFIX/);
assert.match(worker, /caches\.delete\(key\)/);
assert.match(worker, /self\.clients\.claim\(\)/);
assert.match(pwa, /manifest\.json\?build=\$\{encodeURIComponent\(PWA_BUILD\)\}/);

console.log("Alpha v1.6.1 PWA update-regression tests passed");
