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
    async sync(snapshot) {
      calls.push(["shadow.sync", snapshot]);
      if (overrides.syncError) throw overrides.syncError;
      return overrides.syncResult || { skipped: false, stage: "dual_write", generation: 12 };
    },
    async verifyAndRecord(snapshot) {
      calls.push(["shadow.verifyAndRecord", snapshot]);
      if (overrides.verifyError) throw overrides.verifyError;
      return overrides.verifyResult || {
        ok: true,
        stage: "dual_write",
        generation: 12,
        verifiedAt: "2026-09-25T16:00:00.000Z"
      };
    }
  };
  const recordWorker = {
    async drain() {
      calls.push(["worker.drain"]);
      if (overrides.workerError) throw overrides.workerError;
      return overrides.workerResult || {
        ok: true,
        processed: 1,
        succeeded: 1,
        failed: 0,
        conflicts: 0
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
        updated_at: "2026-09-25T15:59:00.000Z"
      };
    },
    shadowController,
    recordWorker: overrides.noWorker ? null : recordWorker,
    onEvent(event) {
      events.push(event);
    }
  });
  return { coordinator, calls, events };
}

test("dual-write mode is disabled by default and preserves legacy-only behavior", async () => {
  const state = setup();
  const result = await state.coordinator.save(fixture);
  assert.equal(result.mode, "legacy-only");
  assert.equal(result.legacySaved, true);
  assert.equal(result.normalizedSaved, false);
  assert.deepEqual(state.calls.map((call) => call[0]), ["legacy.write"]);
});

test("enabled dual-write confirms legacy first then drains the record outbox", async () => {
  const state = setup({ enabled: true });
  const result = await state.coordinator.save(fixture);
  assert.equal(result.ok, true);
  assert.equal(result.mode, "dual-write");
  assert.equal(result.legacySaved, true);
  assert.equal(result.normalizedSaved, true);
  assert.equal(result.normalizedCurrent, true);
  assert.equal(result.verificationPending, true);
  assert.deepEqual(state.calls.map((call) => call[0]), ["legacy.write", "worker.drain"]);
  assert.equal(state.calls.some((call) => call[0] === "shadow.sync"), false, "normal dual-write must not rewrite the full snapshot");
});

test("afterLegacySave reuses an already-confirmed legacy commit without a second legacy write", async () => {
  const state = setup({ enabled: true });
  const result = await state.coordinator.afterLegacySave(fixture, { ok: true, updated_at: "2026-09-25T16:01:00.000Z" });
  assert.equal(result.mode, "dual-write");
  assert.deepEqual(state.calls.map((call) => call[0]), ["worker.drain"]);
});

test("explicit verification checkpoint performs full sync then reconstruction verification", async () => {
  const state = setup({ enabled: true });
  const verification = await state.coordinator.verifyCurrent(fixture);
  assert.equal(verification.ok, true);
  assert.deepEqual(state.calls.map((call) => call[0]), ["shadow.sync", "shadow.verifyAndRecord"]);
  assert.equal(verification.checkpointSync.stage, "dual_write");
});

test("optional immediate verification remains explicit and follows record drain", async () => {
  const state = setup({ enabled: true, verifyAfterWrite: true });
  const result = await state.coordinator.save(fixture);
  assert.equal(result.normalizedVerified, true);
  assert.equal(result.verificationPending, false);
  assert.deepEqual(state.calls.map((call) => call[0]), [
    "legacy.write",
    "worker.drain",
    "shadow.sync",
    "shadow.verifyAndRecord"
  ]);
});

test("legacy write failure remains authoritative and prevents normalized work", async () => {
  const state = setup({
    enabled: true,
    legacyError: Object.assign(new Error("legacy private payload rejected"), { code: "LEGACY_CONFLICT" })
  });
  await assert.rejects(() => state.coordinator.save(fixture), /legacy private payload rejected/);
  assert.deepEqual(state.calls.map((call) => call[0]), ["legacy.write"]);
  const failure = state.events.find((event) => event.type === "dual-write-failure");
  assert.equal(failure.operation, "legacy-write");
  assert.equal(failure.errorCode, "LEGACY_CONFLICT");
  assert.doesNotMatch(JSON.stringify(failure), /private payload/);
});

test("normalized worker failure after legacy success degrades safely and remains pending", async () => {
  const state = setup({
    enabled: true,
    workerResult: {
      ok: false,
      processed: 2,
      succeeded: 1,
      failed: 1,
      conflicts: 1,
      results: [{ ok: false, errorClass: "cas_conflict" }]
    }
  });
  const result = await state.coordinator.save(fixture);
  assert.equal(result.ok, false);
  assert.equal(result.mode, "dual-write-degraded");
  assert.equal(result.legacySaved, true);
  assert.equal(result.normalizedSaved, true);
  assert.equal(result.normalizedCurrent, false);
  assert.equal(result.normalizedPending, true);
  assert.equal(result.normalizedErrorCode, "HH_SYNC_RECORD_CONFLICT");
  assert.deepEqual(state.calls.map((call) => call[0]), ["legacy.write", "worker.drain"]);
});

test("quarantined pending work can never report normalized current", async () => {
  const state = setup({
    enabled: true,
    workerResult: {
      ok: true,
      processed: 0,
      succeeded: 0,
      failed: 0,
      conflicts: 0,
      pending: 1,
      results: []
    }
  });

  const result = await state.coordinator.save(fixture);
  assert.equal(result.ok, false);
  assert.equal(result.mode, "dual-write-degraded");
  assert.equal(result.normalizedCurrent, false);
  assert.equal(result.normalizedPending, true);
  assert.equal(result.normalizedPendingCount, 1);
});

test("provider exception after legacy success does not invalidate legacy save", async () => {
  const state = setup({
    enabled: true,
    workerError: Object.assign(new Error("provider details with record payload"), { code: "NETWORK" })
  });
  const result = await state.coordinator.save(fixture);
  assert.equal(result.ok, false);
  assert.equal(result.mode, "dual-write-degraded");
  assert.equal(result.legacySaved, true);
  assert.equal(result.normalizedPending, true);
  assert.equal(result.normalizedErrorCode, "NETWORK");
  assert.doesNotMatch(JSON.stringify(state.events), /record payload/);
});

test("missing record worker can never silently fall back to full-snapshot dual-write", async () => {
  const state = setup({ enabled: true, noWorker: true });
  const result = await state.coordinator.save(fixture);
  assert.equal(result.mode, "dual-write-degraded");
  assert.equal(result.normalizedErrorCode, "HH_SYNC_RECORD_WORKER_REQUIRED");
  assert.deepEqual(state.calls.map((call) => call[0]), ["legacy.write"]);
});

test("verification failure leaves successful record and legacy writes intact but marks verification pending", async () => {
  const state = setup({
    enabled: true,
    verifyAfterWrite: true,
    verifyError: Object.assign(new Error("verification details"), { code: "HH_SYNC_VERIFY_STALE" })
  });
  const result = await state.coordinator.save(fixture);
  assert.equal(result.legacySaved, true);
  assert.equal(result.normalizedSaved, true);
  assert.equal(result.normalizedCurrent, true);
  assert.equal(result.normalizedPending, false);
  assert.equal(result.verificationPending, true);
  assert.equal(result.normalizedErrorCode, "HH_SYNC_VERIFY_STALE");
});

test("runtime toggle cannot bypass legacy-first ordering", async () => {
  const state = setup();
  assert.equal(state.coordinator.setEnabled(true), true);
  await state.coordinator.save(fixture);
  assert.deepEqual(state.calls.map((call) => call[0]), ["legacy.write", "worker.drain"]);
});

test("coordinator contains no direct provider mutation and no normal-save shadow writer", () => {
  assert.doesNotMatch(source, /herdharbor_user_data/);
  assert.doesNotMatch(source, /herdharbor_sync_records/);
  assert.doesNotMatch(source, /\.from\s*\(/);
  assert.doesNotMatch(source, /\.rpc\s*\(/);
  assert.match(source, /writeLegacySnapshot/);
  assert.match(source, /recordWorker\.drain/);
  assert.match(source, /shadowController\.sync/);
  const afterLegacy = source.slice(source.indexOf("async function afterLegacySave"), source.indexOf("async function save"));
  assert.doesNotMatch(afterLegacy, /shadowController\.sync/);
});
