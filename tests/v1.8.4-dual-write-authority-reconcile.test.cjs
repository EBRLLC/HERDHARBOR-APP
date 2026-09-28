"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const rolloutApi = require("../cloud-sync-rollout-runtime-v1.8.4.js");

function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}

function createHarness({ localState, legacyState, pending = ["m-1"], coordinatorMode = "conflict" }) {
  let outbox = pending.map((mutationId, index) => ({
    mutationId,
    ownerId: "owner-1",
    domain: "animals",
    recordId: `animal-${index + 1}`,
    localRevision: index + 1,
    retryState: "conflict"
  }));
  const calls = [];
  const manifest = {
    cutover_stage: "dual_write",
    sync_generation: 60,
    metadata: { normalized_writer_ready: true }
  };

  const recordStore = {
    async getManifest() {
      return structuredClone(manifest);
    },
    async list() {
      calls.push(["list"]);
      return [];
    }
  };

  const worker = {
    async drain() {
      calls.push(["drain"]);
      return {
        ok: false,
        failed: 0,
        conflicts: 0,
        pending: outbox.length,
        succeeded: 0,
        results: []
      };
    },
    async primeBaseline(options) {
      calls.push(["primeBaseline", options]);
      return { ok: true, rows: 241, manifest: structuredClone(manifest) };
    }
  };

  const shadowController = {
    async sync(snapshot, options) {
      calls.push(["shadowSync", structuredClone(snapshot), options]);
      return {
        checksum: `hh64:${stable(snapshot)}`,
        recordCount: 241,
        puts: 1,
        tombstones: 0
      };
    },
    async verifyAndRecord(snapshot, options) {
      calls.push(["verify", structuredClone(snapshot), options]);
      const checksum = `hh64:${stable(snapshot)}`;
      return {
        ok: true,
        expectedChecksum: options?.expectedChecksum || checksum,
        actualChecksum: checksum,
        recordCount: 241
      };
    }
  };

  const metrics = {
    record() {},
    recordEvent() {},
    snapshot() { return {}; }
  };

  const normalizer = {
    namespace: "legacy-state",
    formatVersion: 2,
    mapLegacySnapshot(snapshot) {
      return {
        checksum: `hh64:${stable(snapshot)}`,
        records: []
      };
    },
    reassembleAuthoritativeSnapshotWithMetadata() {
      return { snapshot: {}, checkpointStale: false };
    }
  };

  const modules = {
    recordStoreApi: {},
    normalizer,
    baselineApi: {
      createIndexedDbStore() { return {}; }
    },
    workerApi: {
      create() { return worker; }
    },
    cohortApi: {
      createCohortGate() {
        return { evaluate() { return { eligible: true }; } };
      }
    },
    shadowApi: {
      createShadowSyncController() { return shadowController; }
    },
    bootstrapApi: {
      createShadowBootstrap() {
        return { async run() { return { verified: true }; } };
      }
    },
    reconciliationApi: {
      reconcileSnapshot() {
        calls.push(["reconcile"]);
        return {
          recordsDiffering: 0,
          missingNormalizedRecords: 0,
          unexpectedNormalizedRecords: 0,
          unresolvedConflicts: 0,
          reconciliationErrorRate: 0
        };
      },
      createRolloutMetrics() { return metrics; }
    },
    stagePolicy: {},
    rolloutApi: {
      requiredSchemaChecks: [],
      createRolloutControl() { return {}; }
    },
    dualWriteApi: {
      createDualWriteCoordinator() {
        return {
          async afterLegacySave() {
            calls.push(["afterLegacySave"]);
            if (coordinatorMode === "no-work") {
              return {
                ok: true,
                mode: "dual-write",
                legacySaved: true,
                normalizedSaved: false,
                normalizedCurrent: true,
                normalizedVerified: false,
                normalizedPending: false,
                verificationPending: true,
                normalizedPendingCount: 0,
                normalizedErrorCode: null,
                normalizedResult: {
                  ok: true,
                  processed: 0,
                  succeeded: 0,
                  failed: 0,
                  conflicts: 0,
                  pending: 0,
                  results: []
                },
                legacyResult: { ok: true }
              };
            }
            return {
              ok: false,
              mode: "dual-write-degraded",
              legacySaved: true,
              normalizedSaved: false,
              normalizedCurrent: false,
              normalizedVerified: false,
              normalizedPending: true,
              verificationPending: false,
              normalizedPendingCount: outbox.length,
              normalizedErrorCode: "HH_SYNC_RECORD_CONFLICT",
              normalizedResult: {
                ok: false,
                pending: outbox.length,
                conflicts: 1
              },
              legacyResult: { ok: true }
            };
          }
        };
      }
    },
    readApi: {
      createReadResolver() { return {}; }
    }
  };

  const cloud = {
    async getSession() {
      return { user: { id: "owner-1" } };
    },
    async syncNow() { return true; },
    async getNormalizedSyncCohortStatus() {
      return {
        eligible: true,
        mode: "allowlist",
        percentageEnabled: false,
        schemaVerified: true,
        stage: "dual_write",
        authorityActive: false,
        recoveryPending: false
      };
    },
    createNormalizedRecordStore() { return recordStore; },
    async readLegacySnapshotForNormalizedSync() {
      calls.push(["readLegacy"]);
      return {
        snapshot: structuredClone(legacyState),
        updatedAt: "2026-09-28T06:37:32.822Z"
      };
    }
  };

  const stateStore = {
    getState() {
      return structuredClone(localState);
    },
    getOutbox() {
      return structuredClone(outbox);
    },
    acknowledgeMutations(ids) {
      calls.push(["acknowledge", [...ids]]);
      const covered = new Set(ids.map(String));
      outbox = outbox.filter((entry) => !covered.has(String(entry.mutationId)));
      return true;
    }
  };

  const runtime = rolloutApi.create({
    cloud,
    stateStore,
    loadDependencies: async () => true,
    modules,
    telemetryAvailable: () => true
  });

  return { runtime, calls, getOutbox: () => structuredClone(outbox) };
}

test("dual-write conflict repairs normalized from confirmed legacy authority when local state still matches legacy", async () => {
  const state = {
    animals: [{ id: "animal-1", name: "Sierra", photoFileName: "IMG_1408-profile.jpg" }]
  };
  const h = createHarness({
    localState: state,
    legacyState: state,
    pending: ["m-covered"]
  });

  const result = await h.runtime.afterLegacyCommit();

  assert.equal(result.ok, true);
  assert.equal(result.mode, "dual-write");
  assert.equal(result.normalizedCurrent, true);
  assert.equal(result.normalizedVerified, true);
  assert.equal(result.normalizedPending, false);
  assert.equal(result.authoritativeLegacyReconcile?.ok, true);
  assert.equal(result.authoritativeLegacyReconcile?.coveredMutations, 1);
  assert.equal(h.getOutbox().length, 0);
  assert.equal(h.calls.some((entry) => entry[0] === "shadowSync"), true);
  assert.equal(h.calls.some((entry) => entry[0] === "verify"), true);
  assert.deepEqual(
    h.calls.find((entry) => entry[0] === "primeBaseline"),
    ["primeBaseline", { force: true }]
  );
});

test("dual-write authority repair refuses to acknowledge anything when local state is ahead of confirmed legacy", async () => {
  const h = createHarness({
    legacyState: {
      animals: [{ id: "animal-1", name: "Sierra", photoFileName: "IMG_1413-profile.jpg" }]
    },
    localState: {
      animals: [{ id: "animal-1", name: "Sierra", photoFileName: "IMG_1408-profile.jpg" }]
    },
    pending: ["m-newer"]
  });

  const result = await h.runtime.afterLegacyCommit();

  assert.equal(result.ok, false);
  assert.equal(result.mode, "dual-write-degraded");
  assert.equal(result.authoritativeLegacyReconcile?.ok, false);
  assert.equal(result.authoritativeLegacyReconcile?.reason, "local-state-ahead-of-legacy");
  assert.equal(h.getOutbox().length, 1);
  assert.equal(h.calls.some((entry) => entry[0] === "shadowSync"), false);
  assert.equal(h.calls.some((entry) => entry[0] === "acknowledge"), false);
});


test("ensureCurrent reconciles authoritative legacy when the normalized outbox is empty", async () => {
  const state = {
    animals: [{ id: "animal-1", name: "Sierra", photoFileName: "IMG_1408-profile.jpg" }]
  };
  const h = createHarness({
    localState: state,
    legacyState: state,
    pending: [],
    coordinatorMode: "no-work"
  });

  const result = await h.runtime.afterLegacyCommit({ ensureCurrent: true });

  assert.equal(result.ok, true);
  assert.equal(result.mode, "dual-write");
  assert.equal(result.normalizedCurrent, true);
  assert.equal(result.normalizedVerified, true);
  assert.equal(result.normalizedPending, false);
  assert.equal(result.authoritativeLegacyReconcile?.ok, true);
  assert.equal(result.authoritativeLegacyReconcile?.coveredMutations, 0);
  assert.equal(h.calls.some((entry) => entry[0] === "shadowSync"), true);
  assert.equal(h.calls.some((entry) => entry[0] === "verify"), true);
  assert.deepEqual(
    h.calls.find((entry) => entry[0] === "primeBaseline"),
    ["primeBaseline", { force: true }]
  );
});

test("empty normalized outbox stays lightweight unless ensureCurrent is requested", async () => {
  const state = {
    animals: [{ id: "animal-1", name: "Sierra" }]
  };
  const h = createHarness({
    localState: state,
    legacyState: state,
    pending: [],
    coordinatorMode: "no-work"
  });

  const result = await h.runtime.afterLegacyCommit();

  assert.equal(result.ok, true);
  assert.equal(result.mode, "dual-write");
  assert.equal(result.normalizedPending, false);
  assert.equal(h.calls.some((entry) => entry[0] === "shadowSync"), false);
  assert.equal(h.calls.some((entry) => entry[0] === "verify"), false);
});
