"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

// Every executable shell asset must use the same current release identity. A
// mixed query-string set can make installed PWA/TWA clients load incompatible
// combinations of the shell, auth, and optional modules.
for (const asset of [
  "herdharbor-release-v1.6.1.js",
  "herdharbor-membership-v1.6.1.js",
  "herdharbor-access-cache-v1.6.1.js",
  "market-analytics-v1.6.5.js",
  "analytics-v1.6.1.js"
]) {
  assert.ok(worker.includes(`/${asset}`), `${asset} must remain network-first`);
}

for (const asset of [
  "herdharbor-release-v1.6.1.js",
  "herdharbor-membership-v1.6.1.js",
  "herdharbor-access-cache-v1.6.1.js",
  "market-analytics-v1.6.5.js",
  "analytics-v1.6.1.js"
]) assert.match(html, new RegExp(`${asset.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\?v=1\\.7\\.1`));
assert.match(html, /herdharbor-build\.js\?v=1\.8\.1/);
assert.match(html, /herdharbor-cloud\.js\?v=20/);
assert.match(html, /pwa\.js\?v=30/);
assert.doesNotMatch(html, /(?:herdharbor-release-v1\.6\.1|herdharbor-membership-v1\.6\.1|herdharbor-access-cache-v1\.6\.1|herdharbor-build|pwa|market-analytics-v1\.6\.5|analytics-v1\.6\.1)\.js\?v=1\.6\.5/);
assert.match(worker, /"\/herdharbor-release-v1\.6\.1\.js"/);
assert.match(worker, /"\/herdharbor-cloud\.js"/);

console.log("Alpha v1.7.1 current shell asset identity guard passed");
