"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const modulePath = path.join(root, "cloud-sync-v2-diagnostics-v1.8.2.js");
const source = fs.readFileSync(modulePath, "utf8");
const diagnostics = require(modulePath);

function state(overrides = {}) {
  return {
    signedIn: true,
    online: true,
    unsynced: false,
    syncing: false,
    conflict: false,
    type: "success",
    message: "Saved to cloud",
    ...overrides
  };
}

test("Cloud Sync V2 exposes exactly the five user-facing sync states", () => {
  assert.deepEqual(
    [...diagnostics.states].sort(),
    ["needs-attention", "offline", "saved-locally", "synced", "syncing"].sort()
  );

  assert.equal(diagnostics.classifySyncState(state()).id, "synced");
  assert.equal(diagnostics.classifySyncState(state({ syncing: true, type: "working" })).id, "syncing");
  assert.equal(diagnostics.classifySyncState(state({ unsynced: true, type: "working" })).id, "saved-locally");
  assert.equal(diagnostics.classifySyncState(state({ online: false, unsynced: true, type: "error", message: "Offline; protected locally" })).id, "offline");
  assert.equal(diagnostics.classifySyncState(state({ conflict: true, unsynced: true, type: "error", message: "Conflict" })).id, "needs-attention");
});

test("ordinary recoverable cloud failures do not become permanent red needs-attention states", () => {
  const recoverable = [
    "Cloud unavailable; changes are safe on this device and will retry.",
    "Cloud save failed; changes are safe on this device and will retry.",
    "Offline copy loaded",
    "Cloud changed during save; local copy retained"
  ];
  recoverable.forEach((message) => assert.equal(diagnostics.isRecoverableMessage(message), true));

  assert.equal(
    diagnostics.classifySyncState(state({ unsynced: true, type: "error", message: recoverable[1] })).id,
    "saved-locally"
  );
  assert.equal(
    diagnostics.classifySyncState(state({ type: "error", message: "Schema rejected cloud write" })).id,
    "needs-attention"
  );
});

test("local/cloud comparison reports changed canonical top-level sections", () => {
  const local = JSON.stringify({
    animals: [{ id: "a1", name: "Judy", notes: "updated" }],
    tasks: [{ id: "t1" }],
    settings: { theme: "dark" }
  });
  const cloud = JSON.stringify({
    animals: [{ id: "a1", name: "Judy" }],
    tasks: [{ id: "t1" }],
    settings: { theme: "dark" }
  });
  const result = diagnostics.diffSummary(local, cloud);
  assert.equal(result.comparable, true);
  assert.deepEqual(result.changedSections, ["animals"]);
  assert.equal(result.changedSectionCount, 1);
  assert.equal(result.localRecordCount, 2);
  assert.equal(result.cloudRecordCount, 2);
});

test("comparison refuses malformed state instead of inventing differences", () => {
  const result = diagnostics.diffSummary("not-json", JSON.stringify({ animals: [] }));
  assert.equal(result.comparable, false);
  assert.deepEqual(result.changedSections, []);
});

test("diagnostics include the required safety and recovery controls", () => {
  assert.match(source, /Last successful sync/);
  assert.match(source, /Local revision/);
  assert.match(source, /Cloud revision/);
  assert.match(source, /Pending changes/);
  assert.match(source, /Failed operation/);
  assert.match(source, />Retry Sync</);
  assert.match(source, />Download Local Backup</);
  assert.match(source, />Compare Local \/ Cloud</);
  assert.match(source, />Restore Last-Known-Good</);
});

test("restore-last-known-good is backup-first and keeps reconciliation dirty", () => {
  const restoreIndex = source.indexOf("async function restoreLastKnownGood");
  assert.ok(restoreIndex >= 0);
  const restoreSource = source.slice(restoreIndex, source.indexOf("function ensureOpenButton", restoreIndex));
  assert.match(restoreSource, /downloadLocalBackup\(\)/);
  assert.match(restoreSource, /store\.setItem\(STATE_KEY, baseline\)/);
  assert.match(restoreSource, /store\.setItem\(dirtyKey\(userId\), "1"\)/);
  assert.match(restoreSource, /location\?\.reload/);
  assert.doesNotMatch(restoreSource, /removeItem\(dirtyKey/);
});

test("diagnostics remain record-private and do not send livestock data to a third party", () => {
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /XMLHttpRequest/);
  assert.doesNotMatch(source, /sendBeacon/);
  assert.doesNotMatch(source, /service_role/i);
});
