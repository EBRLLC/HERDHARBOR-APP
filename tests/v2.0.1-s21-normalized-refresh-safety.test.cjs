"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "herdharbor-cloud.js"), "utf8");
const start = source.indexOf("  async function checkNormalizedAuthorityChanges() {");
const end = source.indexOf("  async function refreshDualWriteBaselineForRemoteState()", start);
assert.ok(start >= 0 && end > start, "normalized refresh must be extractable");
const segment = source.slice(start, end);

function harness(options = {}) {
  const counts = { backups: 0, writes: 0, cleared: 0, reloads: 0 };
  const states = [];
  let current = true;
  const local = JSON.stringify({ animals: [{ id: "rabbit-one", note: "local original" }] });
  const remote = { animals: [{ id: "rabbit-one", note: "new remote version" }] };
  const dependencies = {
    session: { user: { id: "account-a" } },
    captureAccountOperation: () => ({}),
    isAccountOperationCurrent: () => current,
    normalizedAuthorityActive: () => options.runtimeMissing !== true,
    refreshNormalizedAuthorityIfEligible: async () => options.runtimeMissing !== true,
    getNormalizedSyncCohortStatus: async () => {
      if (options.statusError) throw new Error("status offline");
      return options.serverStatus === undefined
        ? { stage: "legacy", schemaVerified: true }
        : options.serverStatus;
    },
    console: { warn: () => {} },
    normalizedRollout: {
      refreshAuthoritative: async () => options.result || { ok: true, source: "normalized", snapshot: remote }
    },
    JSON,
    activeStateRaw: () => options.noLocal ? null : local,
    sameState: () => false,
    applyDevicePreferences: value => value,
    allowAnimalStateTransition: () => true,
    recordRecoverySnapshot: async () => {
      counts.backups++;
      if (options.changeAccountDuringBackup) current = false;
      return options.backupOk !== false;
    },
    hasPendingCloudMutations: () => options.pending === true,
    setActiveUserData: () => {
      counts.writes++;
      return options.installOk !== false;
    },
    safeStorageRemove: () => { counts.cleared++; },
    dirtyKey: userId => "dirty-" + userId,
    setSyncState: (message, status) => states.push({ message, status }),
    window: { location: { reload: () => { counts.reloads++; } } }
  };
  const fn = new Function(...Object.keys(dependencies),
    "let normalizedRefreshInFlight = null;\n" + segment + "\nreturn checkNormalizedAuthorityChanges;");
  const operation = fn(...Object.values(dependencies));
  return { operation, counts, states };
}

test("S21 normalized refresh never replaces the device after a failed recovery backup", async () => {
  const h = harness({ backupOk: false });
  assert.equal(await h.operation(), false);
  assert.equal(h.counts.backups, 1);
  assert.equal(h.counts.writes, 0);
  assert.equal(h.counts.cleared, 0);
  assert.equal(h.counts.reloads, 0);
  assert.match(h.states.at(-1).message, /recovery copy could not be verified/i);
});

test("S21 losing normalized authority blocks legacy refresh fallback", async () => {
  const h = harness({ result: { ok: false, reason: "normalized-not-authoritative" } });
  assert.equal(await h.operation(), false);
  assert.equal(h.counts.backups, 0);
  assert.equal(h.counts.writes, 0);
  assert.match(h.states.at(-1).message, /authority changed/i);
});

test("S21 failed device installation cannot claim newer cloud records or reload", async () => {
  const h = harness({ installOk: false });
  assert.equal(await h.operation(), false);
  assert.equal(h.counts.backups, 1);
  assert.equal(h.counts.writes, 1);
  assert.equal(h.counts.cleared, 0);
  assert.equal(h.counts.reloads, 0);
  assert.match(h.states.at(-1).message, /could not store/i);
});

test("S21 identity change during recovery backup prevents applying another account's data", async () => {
  const h = harness({ changeAccountDuringBackup: true });
  assert.equal(await h.operation(), false);
  assert.equal(h.counts.writes, 0);
  assert.equal(h.counts.reloads, 0);
});

test("S21 unfinished local edits prohibit replacement even with a recovery backup", async () => {
  const h = harness({ pending: true });
  assert.equal(await h.operation(), false);
  assert.equal(h.counts.backups, 1);
  assert.equal(h.counts.writes, 0);
  assert.equal(h.counts.cleared, 0);
});

test("S21 normalized server authority never falls through to legacy if record reader is missing", async () => {
  for (const serverStatus of [
    { stage: "normalized", schemaVerified: true, authorityActive: true },
    { stage: "dual_write", schemaVerified: true, recoveryPending: true }
  ]) {
    const h = harness({ runtimeMissing: true, serverStatus });
    assert.equal(await h.operation(), false);
    assert.equal(h.counts.backups, 0);
    assert.equal(h.counts.writes, 0);
    assert.match(h.states.at(-1).message, /record reader is unavailable/i);
  }
});

test("S21 uncertain cloud refresh authority cannot route to legacy hydration", async () => {
  for (const options of [
    { runtimeMissing: true, statusError: true },
    { runtimeMissing: true, serverStatus: null },
    { runtimeMissing: true, serverStatus: { stage: "legacy", schemaVerified: false } }
  ]) {
    const h = harness(options);
    assert.equal(await h.operation(), false);
    assert.equal(h.counts.writes, 0);
    assert.match(h.states.at(-1).message, /authority can be verified/i);
  }
});

test("S21 legacy refresh fallback requires explicit verified non-normalized server stage", async () => {
  const h = harness({
    runtimeMissing: true,
    serverStatus: { stage: "dual_write", schemaVerified: true, authorityActive: false }
  });
  assert.equal(await h.operation(), null);
  assert.equal(h.counts.writes, 0);
});

test("S21 verified normalized refresh applies cloud data after recovery succeeds", async () => {
  const h = harness();
  assert.equal(await h.operation(), true);
  assert.equal(h.counts.backups, 1);
  assert.equal(h.counts.writes, 1);
  assert.equal(h.counts.cleared, 1);
  assert.equal(h.counts.reloads, 1);
  assert.match(h.states.at(-1).message, /Newer normalized cloud records found/);
});
