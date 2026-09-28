"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const workerApi = require("../cloud-record-outbox-worker-v1.8.4.js");

function buildHarness({ remoteChecksum = "base-checksum", mergeResult = null } = {}) {
  const ownerId = "owner-1";
  const mutation = {
    mutationId: "m-1",
    ownerId,
    domain: "tasks",
    recordId: "task-1",
    operation: "update",
    localRevision: 1,
    retryState: "pending",
    retryCount: 0,
    nextRetryAt: null
  };
  let outbox = [mutation];
  let baseline = {
    namespace: "legacy-state",
    record_id: "task-1",
    payload: { kind: "array_item", key: "tasks", value: { id: "task-1", title: "before" } },
    payload_checksum: "base-checksum",
    record_version: 3,
    deleted_at: null
  };
  const remote = {
    namespace: "legacy-state",
    record_id: "task-1",
    payload: { kind: "array_item", key: "tasks", value: { id: "task-1", title: remoteChecksum === "base-checksum" ? "before" : "remote-change" } },
    payload_checksum: remoteChecksum,
    record_version: 4,
    deleted_at: null
  };
  const localOperation = {
    type: "put",
    role: "primary",
    row: {
      namespace: "legacy-state",
      record_id: "task-1",
      payload: { kind: "array_item", key: "tasks", value: { id: "task-1", title: "local-change" } },
      payload_checksum: "local-checksum",
      record_version: 3,
      deleted_at: null
    }
  };

  const applyCalls = [];
  const baselinePuts = [];
  const versionWrites = [];
  const retryMarks = [];
  let mergeCalls = 0;

  const stateStore = {
    getOutbox() { return outbox; },
    getState() { return { tasks: [{ id: "task-1", title: "local-change" }] }; },
    acknowledgeMutations(ids) {
      const set = new Set(ids.map(String));
      outbox = outbox.filter((entry) => !set.has(String(entry.mutationId)));
      return true;
    },
    markMutationRetry(id, retry) {
      retryMarks.push({ id, retry });
      outbox = outbox.map((entry) => String(entry.mutationId) === String(id)
        ? { ...entry, ...retry }
        : entry);
      return true;
    },
    setRecordVersion(domain, recordId, version) {
      versionWrites.push({ domain, recordId, version });
      return true;
    },
    replaceRaw() { return { ok: true }; }
  };

  const recordStore = {
    async getManifest() {
      return { cutover_stage: "dual_write", sync_generation: 56 };
    },
    async list() {
      return [remote];
    },
    async get() {
      return structuredClone(remote);
    },
    async applyRecordMutation(input) {
      applyCalls.push(input);
      if (applyCalls.length === 1) {
        const error = new Error("conflict");
        error.code = "HH_SYNC_CONFLICT";
        throw error;
      }
      return {
        ok: true,
        record_id: "task-1",
        record_version: 5,
        deleted: false
      };
    },
    async applyRecordMutationsAtomic() {
      throw new Error("Atomic mutation should not run in this test.");
    }
  };

  const baselineStore = {
    async getMeta() {
      return { primed: true, generation: 56, stage: "dual_write" };
    },
    async list() {
      return [structuredClone(baseline)];
    },
    async get() {
      return structuredClone(baseline);
    },
    async put(row) {
      baseline = structuredClone(row);
      baselinePuts.push(structuredClone(row));
      return true;
    },
    async replace() {
      throw new Error("Forced baseline replacement should not run in this test.");
    }
  };

  const normalizer = {
    namespace: "legacy-state",
    planLogicalMutation() {
      return {
        operations: [structuredClone(localOperation)],
        conflictFields: [],
        snapshotManifestChanged: false
      };
    },
    mergeNormalizedPayload(base, local, server) {
      mergeCalls += 1;
      if (mergeResult) return mergeResult;
      return { ok: true, value: local, conflicts: [] };
    },
    checksumValue() { return "merged-checksum"; },
    mapLegacySnapshot() { return { checksum: "hh64:test" }; },
    logicalIdentityValue(value) { return String(value?.id || ""); },
    applyNormalizedPayloadToSnapshot(snapshot) { return snapshot; }
  };

  const worker = workerApi.create({
    stateStore,
    recordStore,
    normalizer,
    baselineStore,
    writerVersion: "record-cas-v1",
    now: () => "2026-09-28T03:45:00.000Z"
  });

  return {
    worker,
    getOutbox: () => outbox,
    applyCalls,
    baselinePuts,
    versionWrites,
    retryMarks,
    getMergeCalls: () => mergeCalls
  };
}

test("version-only CAS drift refreshes the record baseline and retries against the current remote version", async () => {
  const h = buildHarness();
  const result = await h.worker.drain({ ownerId: "owner-1" });

  assert.equal(result.ok, true);
  assert.equal(result.succeeded, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.conflicts, 0);
  assert.deepEqual(h.applyCalls.map((call) => call.expectedVersion), [3, 4]);
  assert.equal(h.getMergeCalls(), 0, "content merge must not run when only the version changed");
  assert.equal(h.getOutbox().length, 0, "committed mutation must be acknowledged");
  assert.ok(h.baselinePuts.some((row) => row.record_version === 4 && row.payload_checksum === "base-checksum"));
  assert.ok(h.baselinePuts.some((row) => row.record_version === 5 && row.payload_checksum === "local-checksum"));
  assert.ok(h.versionWrites.some((entry) => entry.recordId === "task-1" && entry.version === 4));
  assert.ok(h.versionWrites.some((entry) => entry.recordId === "task-1" && entry.version === 5));
});

test("real remote content divergence still uses conflict merge rules and is not treated as version-only drift", async () => {
  const h = buildHarness({
    remoteChecksum: "remote-checksum",
    mergeResult: { ok: false, conflicts: ["$.title"] }
  });
  const result = await h.worker.drain({ ownerId: "owner-1" });

  assert.equal(result.ok, false);
  assert.equal(result.failed, 1);
  assert.equal(result.conflicts, 1);
  assert.deepEqual(h.applyCalls.map((call) => call.expectedVersion), [3]);
  assert.equal(h.getMergeCalls(), 1);
  assert.equal(h.getOutbox().length, 1);
  assert.equal(h.getOutbox()[0].retryState, "conflict");
  assert.deepEqual(h.getOutbox()[0].lastConflictFields, undefined);
  assert.equal(h.retryMarks.length, 1);
  assert.deepEqual(h.retryMarks[0].retry.conflictFields, ["$.title"]);
});
