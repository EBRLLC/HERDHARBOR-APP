"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const build = read("herdharbor-build.js");
const syncFlow = read("cloud-sync-v2-flow-v1.8.2.js");
const localCache = read("local-cache-v2-v1.8.2.js");
const completion = read("flow-phase1-completion-v1.8.2.js");

function runtimeVersion(source) {
  return source.match(/(?:RELEASE|release|version)\s*[:=]\s*["']([^"']+)["']/)?.[1] || null;
}

test("all actively modified Cloud Sync V2 runtime layers identify as v1.8.2", () => {
  assert.match(build, /version:\s*"1\.8\.2"/);
  assert.match(build, /build:\s*"1\.8\.2-alpha-cloud-sync-v2-baseline-recovery-2"/);
  assert.match(syncFlow, /release:\s*"1\.8\.2"/);
  assert.match(localCache, /const RELEASE = "1\.8\.2"/);
  assert.match(completion, /const VERSION="1\.8\.2"/);
});

test("new V2 assets are loaded using v1.8.2 filenames", () => {
  assert.match(completion, /cloud-sync-v2-flow-v1\.8\.2\.js\?v=1/);
  assert.match(syncFlow, /local-cache-v2-v1\.8\.2\.js\?v=1/);
});

test("V2-only modules do not carry stale v1.8.1 release assertions", () => {
  assert.doesNotMatch(syncFlow, /release:\s*["']1\.8\.1["']/i);
  assert.doesNotMatch(localCache, /RELEASE\s*=\s*["']1\.8\.1["']/);
  assert.doesNotMatch(completion, /VERSION\s*=\s*["']1\.8\.1["']/);
});

test("legacy 1.8.1 references are allowed only as intentionally carried-forward packaged/runtime dependencies", () => {
  // herdharbor-build.js still loads established 1.8.1 subscription/registration
  // assets and the packaged shell remains 1.8.1 until the release packaging pass.
  // This audit prevents those frozen references from being mistaken for the
  // version of the Cloud Sync V2 code currently under development.
  assert.equal(runtimeVersion(syncFlow), "1.8.2");
  assert.equal(runtimeVersion(localCache), "1.8.2");
});
