"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "herdharbor-cloud.js"), "utf8");

function body(startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0 && end > start, startToken + " body must be present");
  return source.slice(start, end);
}

test("manual save refreshes eligible authority before choosing legacy versus normalized writer", () => {
  const sync = body("  async function syncNow() {", "\n  async function invokeFunction");
  const refreshIndex = sync.indexOf("refreshNormalizedAuthorityIfEligible()");
  const authorityIndex = sync.indexOf("if (normalizedAuthorityActive())");
  const legacyIndex = sync.indexOf("const raw = activeStateRaw()");
  assert.ok(refreshIndex >= 0);
  assert.ok(authorityIndex > refreshIndex);
  assert.ok(legacyIndex > authorityIndex);
  assert.match(sync, /normalizedRollout\.syncNormalizedNow\(\)/);
});

test("cloud refresh discovers authority before any legacy-row fetch", () => {
  const refresh = body("  async function checkNormalizedAuthorityChanges() {", "\n  async function checkForCloudChanges()");
  assert.match(refresh, /refreshNormalizedAuthorityIfEligible\(\)/);

  const check = body("  async function checkForCloudChanges() {", "\n  async function invokeFunction");
  const normalizedIndex = check.indexOf("checkNormalizedAuthorityChanges()");
  const legacyFetchIndex = check.indexOf("fetchCloudRecord(userId)");
  assert.ok(normalizedIndex >= 0);
  assert.ok(legacyFetchIndex > normalizedIndex);
});

test("normalized local commits never mark the legacy full-state row dirty", () => {
  const bridge = body("  function handleCanonicalStateCommit(detail) {", "\n  function installStateStoreBridge()");
  const authorityIndex = bridge.indexOf("if (normalizedAuthorityActive())");
  const removeDirtyIndex = bridge.indexOf("safeStorageRemove(dirtyKey(userId))");
  const legacyDirtyIndex = bridge.indexOf('safeStorageSet(dirtyKey(userId), "1")');
  assert.ok(authorityIndex >= 0);
  assert.ok(removeDirtyIndex > authorityIndex);
  assert.ok(legacyDirtyIndex > removeDirtyIndex);
});
