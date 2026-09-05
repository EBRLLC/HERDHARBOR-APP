"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pwa = fs.readFileSync(path.join(root, "pwa.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

assert.match(pwa, /const UPDATE_ACTIVATION_TIMEOUT_MS = 8_000/);
assert.match(pwa, /let updateActivationInFlight = false/);
assert.match(pwa, /let updateActivationTimer = null/);
assert.match(pwa, /function reloadAfterUpdate\(\{ cacheBust = false \} = \{\}\)/);
assert.match(pwa, /hh_update/);
assert.match(pwa, /window\.location\.replace\(url\.toString\(\)\)/);
assert.match(pwa, /window\.location\.reload\(\)/);
assert.match(pwa, /UPDATE_ACTIVATION_TIMEOUT_MS/);
assert.match(pwa, /activation_timeout/);
assert.match(pwa, /workerToActivate\.postMessage\(\{ type: "SKIP_WAITING" \}\)/);
assert.match(pwa, /controllerchange/);
assert.match(pwa, /updateActivationInFlight/);
assert.match(pwa, /Retry Update/);
assert.match(pwa, /Finish any unsaved entry before updating/);
assert.match(html, /<script src="pwa\.js\?v=30"><\/script>/);
assert.doesNotMatch(worker.match(/self\.addEventListener\("install",[\s\S]*?\n\}\);/)?.[0] || "", /skipWaiting/);
assert.match(worker, /event\.data\?\.type === "SKIP_WAITING"/);

console.log("HerdHarbor v1.7.5 Update Now hotfix regression test passed");
