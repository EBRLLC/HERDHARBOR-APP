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

  const check = body("  async function checkForCloudChanges() {", "\n  function ensureStyles()");
  const normalizedIndex = check.indexOf("checkNormalizedAuthorityChanges()");
  const legacyFetchIndex = check.indexOf("fetchCloudRecord(userId)");
  assert.ok(normalizedIndex >= 0);
  assert.ok(legacyFetchIndex > normalizedIndex);
});

test("normalized local commits never mark the legacy full-state row dirty", () => {
  const bridge = body("  async function handleCanonicalStateCommit(detail) {", "\n  function installStateStoreBridge()");
  const authorityIndex = bridge.indexOf("if (normalizedAuthorityActive())");
  const removeDirtyIndex = bridge.indexOf("safeStorageRemove(dirtyKey(userId))");
  const legacyDirtyIndex = bridge.indexOf('safeStorageSet(dirtyKey(userId), "1")');
  assert.ok(authorityIndex >= 0);
  assert.ok(removeDirtyIndex > authorityIndex);
  assert.ok(legacyDirtyIndex > removeDirtyIndex);
});


test("online, foreground, and focus resumes all enter authority-aware sync paths", () => {
  const online = body('  window.addEventListener("online", () => {', '\n  window.addEventListener("offline"');
  const visibility = body('  document.addEventListener("visibilitychange", () => {', '\n  window.addEventListener("focus"');
  const focus = body('  window.addEventListener("focus", () => {', '\n  async function getNormalizedSyncCohortStatus');

  assert.match(online, /syncNow\(\)/);
  assert.match(online, /checkForCloudChanges\(\)/);
  assert.match(visibility, /document\.visibilityState === "hidden"/);
  assert.match(visibility, /syncNow\(\)/);
  assert.match(visibility, /document\.visibilityState === "visible"/);
  assert.match(visibility, /checkForCloudChanges\(\)/);
  assert.match(focus, /checkForCloudChanges\(\)/);

  const sync = body("  async function syncNow() {", "\n  async function invokeFunction");
  assert.ok(sync.indexOf("refreshNormalizedAuthorityIfEligible()") < sync.indexOf("const raw = activeStateRaw()"));

  const refresh = body("  async function checkForCloudChanges() {", "\n  function ensureStyles()");
  assert.ok(refresh.indexOf("checkNormalizedAuthorityChanges()") < refresh.indexOf("fetchCloudRecord(userId)"));
});


test("normal legacy-save completion defers normalized dual-write work without blocking success", () => {
  const complete = body(
    "  async function completeNormalizedAfterLegacyCommit(sequence, updatedAt) {",
    "\n  function safeParse(value)"
  );

  assert.match(complete, /void normalizedRollout\.afterLegacyCommit\(\)/);
  assert.match(complete, /deferred:\s*true/);
  assert.match(complete, /ok:\s*true/);
  assert.doesNotMatch(complete, /await normalizedRollout\.afterLegacyCommit/);
  assert.doesNotMatch(complete, /afterLegacyCommit\(\{\s*ensureCurrent:\s*true\s*\}\)/);
});


test("dual-write diagnostics ignore normalized background outbox when legacy authority is clean", () => {
  const pending = body(
    "  function hasPendingCloudMutations(userId = session?.user?.id) {",
    "\n  function getSyncDetails()"
  );
  const syncDetails = body(
    "  function getSyncDetails() {",
    "\n  function dispatchSyncStatus()"
  );

  assert.match(
    pending,
    /function hasPendingAuthoritativeCloudMutations\(userId = session\?\.user\?\.id\)/
  );
  assert.match(
    pending,
    /const legacyPending =[\s\S]*dirtyKey\(userId\)[\s\S]*Boolean\(pendingSync\)/
  );
  assert.match(
    pending,
    /if \(normalizedAuthorityActive\(\)\) \{[\s\S]*return normalizedOutboxPending\(userId\);/
  );
  assert.match(pending, /return legacyPending;/);

  assert.match(
    syncDetails,
    /const unsynced = hasPendingAuthoritativeCloudMutations\(userId\);/
  );
  assert.doesNotMatch(
    syncDetails,
    /const unsynced = hasPendingCloudMutations\(userId\);/
  );
  assert.match(
    source,
    /hasUnsyncedChanges: \(\) => hasPendingAuthoritativeCloudMutations\(session\?\.user\?\.id\)/
  );
});

test("internal retry logic still sees normalized dual-write outbox maintenance", () => {
  const pending = body(
    "  function hasPendingCloudMutations(userId = session?.user?.id) {",
    "\n  function getSyncDetails()"
  );
  assert.match(
    pending,
    /function hasPendingCloudMutations[\s\S]*normalizedOutboxPending\(userId\)/
  );
});
