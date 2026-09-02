"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

// The consolidated HTML shell still carries historical query strings, so every
// authentication-critical asset it requests must remain network-first until the
// shell itself is version-aligned. This prevents a cached pre-hotfix release
// router from loading ahead of herdharbor-cloud.js on installed PWA/TWA clients.
for (const asset of [
  "herdharbor-release-v1.6.1.js",
  "herdharbor-membership-v1.6.1.js",
  "herdharbor-access-cache-v1.6.1.js",
  "herdharbor-cloud.js",
  "herdharbor-build.js",
  "pwa.js"
]) {
  assert.ok(worker.includes(`/${asset}`), `${asset} must remain network-first while index.html carries historical query strings`);
}

assert.match(html, /herdharbor-release-v1\.6\.1\.js\?v=1\.6\.5/);
assert.match(html, /herdharbor-cloud\.js\?v=19/);
assert.match(worker, /"\/herdharbor-release-v1\.6\.1\.js"/);
assert.match(worker, /"\/herdharbor-cloud\.js"/);

console.log("Alpha v1.6.7 current shell authentication asset guard passed");
