"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dualWrite = require(path.join(root, "cloud-dual-write-coordinator-v1.8.3.js"));
const source = fs.readFileSync(path.join(root, "cloud-dual-write-coordinator-v1.8.3.js"), "utf8");
const fixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, "fixtures", "cloud-state-normalization-v1.8.3.json"),
  "utf8"
));

function setup(overrides = {}) {
  const calls = [];
  const events = [];
  const shadowController = {
    async sync(snapshot, options) {
      calls.push(["shadow.sync", snapshot, options]);
      if (overrides.syncError) throw overrides.syncError;
      if (overrides.syncResult) return overrides.syncResult;
      return { skipped: false, stage: "dual_write", generation: 7 };
    },
    async verifyAndRecord(snapshot) {
      calls.push(["shadow.verifyAndRecord", snapshot]);
      if (overrides.verifyError) throw overrides.verifyError;
      return overrides.verifyResult || {
        ok: true,
        stage: "dual_write",
        generation: 7,
        verifiedAt: "2026-09-16T06:00:00.000Z"
      };
    }
  };
  const coordinator = dualWrite.createDualWriteCoordinator({
    enabled: overrides.enabled === true,
    verifyAfterWrite: overrides.verifyAfterWrite === true,
    async writeLegacySnapshot(snapshot, options) {
      calls.push(["legacy.write", snapshot, options]);
      if (overrides.legacyError) throw overrides.legacyError;
      return overrides.legacyResult || {
        ok: true,
        updated_at: "2026-09-16T05:59:00.000Z"
      };
    },
    shadowController,
    onEvent(event) {
      events.push(event);
    }
  });
  return { coordinator, calls, events };
}

test("dual-write mode is disabled by default and preserves the legacy write path", async () => {
  const state = setup();
  const result = await state.coordinator.save(fixture);

  assert.equal(state.coordinator.isEnabled(), false);
  assert.equal(result.ok, true);
  assert.equal(result.mode, "legacy-only");
  assert.equal(result.legacySaved, true);
  assert.equal(result.normalizedSaved, false);
  assert.deepEqual(state.calls.map((call) => call[0]), ["legacy.write"]);
});

test("enabled migration writes legacy first then normalized and defers full verification by default", async () => {
  const state = setup({ enabled: true });
  const result = await state.coordinator.save(fixture);

  assert.equal(result.ok, true);
  assert.equal(result.mode, "dual-write");
  assert.equal(result.legacySaved, true);
  assert.equal(result.normalizedSaved, true);
  assert.equal(result.normalizedCurrent, true);
  assert.equal(result.normalizedVerified, false);
  assert.equal(result.normalizedPending, false);
  assert.equal(result.verificationPending, true);
  assert.equal(result.normalizedGeneration, 7);
  assert.deepEqual(state.calls.map((call) => call[0]), ["legacy.write", "shadow.sync"]);
  const syncOptions = state.calls.find((call) => call[0] === "shadow.sync")[2];
  assert.equal(syncOptions.legacySnapshotUpdatedAt, "2026-09-16T05:59:00.000Z");
});

test("explicit verification mode still verifies immediately when requested", async () => {
  const state = setup({ enabled: true, verifyAfterWrite: true });
  const result = await state.coordinator.save(fixture);

  assert.equal(result.normalizedVerified, true);
  assert.equal(result.verificationPending, false);
  assert.deepEqual(state.calls.map((call) => call[0]), [
    "legacy.write",
    "shadow.sync",
    "shadow.verifyAndRecord"
  ]);
});

test("verifyCurrent provides a deliberate quiescent-point verification", async () => {
  const state = setup({ enabled: true });
  const verification = await state.coordinator.verifyCurrent(fixture);
  assert.equal(verification.ok, true);
  assert.deepEqual(state.calls.map((call) => call[0]), ["shadow.verifyAndRecord"]);
});

test("legacy write failure is authoritative and prevents any normalized write", async () => {
  const legacyError = Object.assign(new Error("legacy cloud rejected private payload"), {
    code: "LEGACY_CONFLICT"
  });
  const state = setup({ enabled: true, legacyError });

  await assert.rejects(() => state.coordinator.save(fixture), /legacy cloud rejected/);
  assert.deepEqual(state.calls.map((call) => call[0]), ["legacy.write"]);
  const failure = state.events.find((event) => event.type === "dual-write-failure");
  assert.equal(failure.operation, "legacy-write");
  assert.equal(failure.errorCode, "LEGACY_CONFLICT");
  assert.doesNotMatch(JSON.stringify(failure), /private payload|cloud rejected/);
});

test("normalized conflict after successful legacy save degrades safely without losing authoritative save", async () => {
  const state = setup({
    enabled: true,
    syncError: Object.assign(new Error("normalized conflict with Annie payload"), {
      name: "HerdHarborCloudRecordError",
      code: "HH_SYNC_CONFLICT"
    })
  });

  const result = await state.coordinator.save(fixture);
  assert.equal(result.ok, true);
  assert.equal(result.mode, "dual-write-degraded");
  assert.equal(result.legacySaved, true);
  assert.equal(result.normalizedSaved, false);
  assert.equal(result.normalizedPending, true);
  assert.equal(result.normalizedErrorCode, "HH_SYNC_CONFLICT");
  assert.deepEqual(state.calls.map((call) => call[0]), ["legacy.write", "shadow.sync"]);
  assert.doesNotMatch(JSON.stringify(state.events), /Annie payload/);
});

test("optional immediate verification failure does not turn a successful legacy save into a failure", async () => {
  const state = setup({
    enabled: true,
    verifyAfterWrite: true,
    verifyError: Object.assign(new Error("verification provider details"), {
      code: "HH_SYNC_VERIFY_STALE"
    })
  });

  const result = await state.coordinator.save(fixture);
  assert.equal(result.ok, true);
  assert.equal(result.mode, "dual-write-degraded");
  assert.equal(result.legacySaved, true);
  assert.equal(result.normalizedSaved, true);
  assert.equal(result.normalizedCurrent, true);
  assert.equal(result.normalizedPending, false);
  assert.equal(result.verificationPending, true);
  assert.equal(result.normalizedErrorCode, "HH_SYNC_VERIFY_STALE");
  assert.doesNotMatch(JSON.stringify(state.events), /provider details/);
});

test("already-current fast path avoids both rewrite and verification when current verification exists", async () => {
  const state = setup({
    enabled: true,
    syncResult: {
      skipped: true,
      reason: "already-current",
      verified: true,
      generation: 11
    }
  });
  const result = await state.coordinator.save(fixture);
  assert.equal(result.mode, "dual-write");
  assert.equal(result.normalizedCurrent, true);
  assert.equal(result.normalizedVerified, true);
  assert.equal(result.normalizedPending, false);
  assert.equal(result.verificationPending, false);
  assert.deepEqual(state.calls.map((call) => call[0]), ["legacy.write", "shadow.sync"]);
});

test("normalized-authoritative skip never reports pending shadow work", async () => {
  const state = setup({
    enabled: true,
    syncResult: { skipped: true, reason: "normalized-authoritative" }
  });
  const result = await state.coordinator.save(fixture);
  assert.equal(result.mode, "dual-write-degraded");
  assert.equal(result.normalizedPending, false);
  assert.equal(result.normalizedReason, "normalized-authoritative");
  assert.equal(state.calls.some((call) => call[0] === "shadow.verifyAndRecord"), false);
});

test("runtime toggle cannot bypass legacy-first ordering", async () => {
  const state = setup();
  assert.equal(state.coordinator.setEnabled(true), true);
  await state.coordinator.save(fixture);
  assert.deepEqual(state.calls.map((call) => call[0]), ["legacy.write", "shadow.sync"]);
});

test("dual-write coordinator contains no direct table or Supabase mutation logic", () => {
  assert.doesNotMatch(source, /herdharbor_user_data/);
  assert.doesNotMatch(source, /herdharbor_sync_records/);
  assert.doesNotMatch(source, /\.from\s*\(/);
  assert.doesNotMatch(source, /\.rpc\s*\(/);
  assert.match(source, /writeLegacySnapshot/);
  assert.match(source, /shadowController\.sync/);
  assert.match(source, /verifyAfterWrite/);
});
