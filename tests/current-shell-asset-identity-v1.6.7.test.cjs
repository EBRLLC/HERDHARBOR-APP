"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

// Mutable executable assets must keep one current release identity whether
// they load in the core shell or through a lazy route. A mixed query-string
// set can make installed PWA/TWA clients load incompatible combinations.
for (const asset of [
  "herdharbor-release-v1.6.1.js",
  "herdharbor-membership-v1.6.1.js",
  "herdharbor-access-cache-v1.6.1.js",
  "market-analytics-v1.6.5.js"
]) {
  assert.ok(worker.includes(`/${asset}`), `${asset} must remain network-first`);
}

assert.match(html, /herdharbor-release-v1\.6\.1\.js\?v=2/);
assert.match(html, /herdharbor-membership-v1\.6\.1\.js\?v=1\.7\.1/);
assert.match(html, /herdharbor-access-cache-v1\.6\.1\.js\?v=1\.7\.1/);
assert.doesNotMatch(html, /<script[^>]+market-analytics-v1\.6\.5\.js/);
assert.ok(worker.includes("market-analytics-v1.6.5.js?v=1.7.1"), "Market Analytics remains runtime-cacheable");
assert.ok(worker.includes("analytics-v1.6.1.js?v=2"), "analytics-v1.6.1.js remains a runtime-cache asset");
assert.doesNotMatch(html, /<script[^>]+analytics-v1\.6\.1\.js/);
const appRuntime = fs.readFileSync(path.join(root, "herdharbor-app-runtime.js"), "utf8");
assert.match(appRuntime, /"market-analytics-v1\.6\.5\.js\?v=1\.7\.1"/);
assert.match(appRuntime, /"analytics-v1\.6\.1\.js\?v=2"/);
assert.match(html, /herdharbor-build\.js\?v=2\.0\.0-r2/);
assert.match(html, /cloud-legacy-baseline-v1\.8\.4\.js\?v=1/);
assert.match(html, /herdharbor-cloud\.js\?v=35/);
assert.match(html, /pwa\.js\?v=35/);
assert.doesNotMatch(html, /(?:herdharbor-release-v1\.6\.1|herdharbor-membership-v1\.6\.1|herdharbor-access-cache-v1\.6\.1|herdharbor-build|pwa|market-analytics-v1\.6\.5|analytics-v1\.6\.1)\.js\?v=1\.6\.5/);
assert.match(worker, /"\/herdharbor-release-v1\.6\.1\.js"/);
assert.match(worker, /"\/herdharbor-cloud\.js"/);

assert.match(html, /data-route="marketplace"/, "Marketplace must remain visible in primary navigation");
assert.match(html, /id="view-marketplace"/, "Marketplace route target must remain in the application shell");
assert.match(worker, /herdharbor-shell-v2\.0\.0-v2\.0\.0-release-2/, "service worker cache identity must match release-2");

console.log("HerdHarbor 2.0.0 current shell asset identity guard passed");
