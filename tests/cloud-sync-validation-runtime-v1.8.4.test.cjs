"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const StateStore = require("../herdharbor-state-store-v1.8.4.js");
const Normalizer = require("../cloud-state-normalizer-v1.8.3.js");
const Baseline = require("../cloud-record-baseline-v1.8.4.js");
const Reconciliation = require("../cloud-sync-reconciliation-v1.8.3.js");
const Validation = require("../cloud-sync-validation-runtime-v1.8.4.js");

const USER_ID = "11111111-1111-1111-1111-111111111111";
const OWNER_KEY = "herdharbor_active_user_v1";
const STATE_KEY = "herdharbor_pre_alpha_v1";

class MemoryStorage {
  constructor(seed = {}) {
    this.values = new Map(Object.entries(seed).map(([key, value]) => [String(key), String(value)]));
  }
  getItem(key) { return this.values.has(String(key)) ? this.values.get(String(key)) : null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stateFixture() {
  return {
    animals: [
      { id: "a1", name: "Judy", weight: 3.1 },
      { id: "a2", name: "Jack", weight: 3.5 }
    ],
    litters: [{ id: "l1", name: "Litter 1" }],
    tasks: [{ id: "t1", title: "Check nest", done: false }],
    settings: { theme: "system" }
  };
}

function rowsFor(snapshot, version = 1) {
  return Normalizer.mapLegacySnapshot(snapshot).records.map((row) => ({
    ...clone(row),
    record_version: version,
    deleted_at: null
  }));
}

function createHarness(options = {}) {
  const initial = clone(options.initial || stateFixture());
  const storage = new MemoryStorage({
    [OWNER_KEY]: USER_ID,
    [STATE_KEY]: JSON.stringify(initial)
  });
  const stateStore = StateStore.create({
    storage,
    indexedDB: null,
    now: (() => {
      let tick = 0;
      return () => `2026-09-25T16:00:0${tick++}.000Z`;
    })()
  });

  let gate = {
    eligible: options.eligible !== false,
    mode: options.mode || "allowlist",
    percentageEnabled: options.percentageEnabled === true,
    schemaVerified: options.schemaVerified !== false
  };
  let manifest = options.manifest === undefined ? null : clone(options.manifest);
  let rows = Array.isArray(options.rows) ? clone(options.rows) : [];
  const calls = [];
  const baselineRows = new Map();
  const baselineMetas = new Map();

  const recordStore = {
    async getManifest() {
      calls.push(["record.getManifest"]);
      return clone(manifest);
    },
    async list(namespace) {
      calls.push(["record.list", namespace]);
      return clone(rows.filter((row) => row.namespace === namespace));
    }
  };

  const cloud = {
    getSession() {
      return options.signedOut ? null : { user: { id: USER_ID } };
    },
    async getNormalizedSyncCohortStatus() {
      calls.push(["cloud.cohort"]);
      return clone(gate);
    },
    createNormalizedRecordStore() {
      calls.push(["cloud.createRecordStore"]);
      return recordStore;
    },
    async readLegacySnapshotForNormalizedSync() {
      return { snapshot: stateStore.getState(), updatedAt: "2026-09-25T16:00:00.000Z" };
    }
  };

  let onShadowSync = options.onShadowSync || null;
  const shadowApi = {
    createShadowSyncController() {
      return {
        async sync(snapshot) {
          calls.push(["shadow.sync", clone(snapshot)]);
          if (onShadowSync) await onShadowSync(snapshot);
          rows = rowsFor(snapshot);
          const nextStage = manifest ? (manifest.cutover_stage || "legacy") : "shadow";
          manifest = {
            cutover_stage: nextStage === "legacy" ? "shadow" : nextStage,
            sync_generation: Number(manifest?.sync_generation || 0) + 1,
            normalized_verified_at: null,
            metadata: {
              source_checksum: Normalizer.snapshotChecksum(snapshot),
              normalized_record_count: rows.length,
              normalized_namespace: Normalizer.namespace,
              normalized_format_version: Normalizer.formatVersion
            }
          };
          return { skipped: false, stage: manifest.cutover_stage, generation: manifest.sync_generation };
        },
        async verifyAndRecord(snapshot) {
          calls.push(["shadow.verify", clone(snapshot)]);
          const reconstructed = Normalizer.reassembleLegacySnapshotWithMetadata(rows);
          assert.equal(reconstructed.checksum, Normalizer.snapshotChecksum(snapshot));
          manifest.normalized_verified_at = "2026-09-25T16:00:10.000Z";
          manifest.metadata.verified_checksum = reconstructed.checksum;
          manifest.metadata.verification_record_count = rows.length;
          return {
            ok: true,
            stage: manifest.cutover_stage,
            generation: manifest.sync_generation,
            verifiedAt: manifest.normalized_verified_at
          };
        }
      };
    }
  };

  const workerResult = options.workerResult || { ok: true, processed: 1, succeeded: 1, failed: 0, conflicts: 0 };
  const workerApi = {
    create() {
      return {
        writerVersion: "record-cas-v1",
        async drain() {
          calls.push(["worker.drain"]);
          return clone(workerResult);
        }
      };
    }
  };

  const dualWriteApi = {
    createDualWriteCoordinator() {
      return {
        async afterLegacySave(snapshot, legacyResult) {
          calls.push(["dual.afterLegacySave", clone(snapshot), clone(legacyResult)]);
          return { ok: true, mode: "dual-write", legacySaved: true, normalizedSaved: true };
        }
      };
    }
  };

  const rolloutApi = {
    requiredSchemaChecks: ["recordsTable","manifestTable","ownerRls","batchRpc","recordRpc","cohortRpc","verifyRpc","stageRpc","guardedWriterRpc","legacyGuard"],
    createRolloutControl() {
      return {
        async promote(targetStage) {
          calls.push(["rollout.promote", targetStage]);
          manifest.cutover_stage = targetStage;
          manifest.sync_generation += 1;
          return { ok: true, stage: targetStage, generation: manifest.sync_generation };
        },
        async prepareWriter(input) {
          calls.push(["rollout.prepareWriter", clone(input)]);
          manifest.metadata.normalized_writer_ready = true;
          manifest.metadata.normalized_writer_version = input.writerVersion;
          manifest.normalized_verified_at = null;
          manifest.sync_generation += 1;
          return { ok: true, generation: manifest.sync_generation };
        },
        async rollback() {
          calls.push(["rollout.rollback"]);
          manifest.cutover_stage = manifest.cutover_stage === "dual_write" ? "shadow" : "legacy";
          manifest.sync_generation += 1;
          return { ok: true, stage: manifest.cutover_stage };
        }
      };
    }
  };

  const runtime = Validation.create({
    autoStart: false,
    cloud,
    stateStore,
    normalizer: Normalizer,
    baselineApi: Baseline,
    workerApi,
    shadowApi,
    dualWriteApi,
    reconciliationApi: Reconciliation,
    rolloutApi,
    monitoring: {
      getStatus: () => ({ initialized: true }),
      addBreadcrumb() {},
      captureOperationalFailure() {}
    },
    createBaselineStore: () => Baseline.createMemoryStore({
      ownerId: USER_ID,
      rows: baselineRows,
      metas: baselineMetas
    })
  });

  return {
    runtime,
    stateStore,
    calls,
    getManifest: () => clone(manifest),
    setManifest(value) { manifest = clone(value); },
    setGate(value) { gate = { ...gate, ...value }; },
    setShadowHook(fn) { onShadowSync = fn; },
    outbox: () => stateStore.getOutbox(USER_ID),
    save(next) {
      const result = stateStore.commit(clone(next), { source: "local", reason: "test-edit" });
      assert.equal(result.ok, true);
      return result;
    }
  };
}

test("server cohort gate blocks non-allowlisted and percentage-enabled clients before provider setup", async () => {
  const notAllowed = createHarness({ eligible: false });
  const result = await notAllowed.runtime.afterLegacyCommit({ updatedAt: "2026-09-25T16:00:00.000Z" });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "not-allowlisted");
  assert.equal(notAllowed.calls.some((call) => call[0] === "cloud.createRecordStore"), false);

  const percentage = createHarness({ eligible: true, percentageEnabled: true });
  const blocked = await percentage.runtime.afterLegacyCommit({});
  assert.equal(blocked.skipped, true);
  assert.equal(blocked.reason, "percentage-rollout-blocked");
  assert.equal(percentage.calls.some((call) => call[0] === "cloud.createRecordStore"), false);
});

test("shadow bootstrap verifies reconstructed state and acknowledges mutations already represented in the checkpoint", async () => {
  const h = createHarness();
  const next = h.stateStore.getState();
  next.animals[0].weight = 3.4;
  h.save(next);
  assert.equal(h.outbox().length, 1);

  const result = await h.runtime.bootstrapShadow();

  assert.equal(result.ok, true);
  assert.equal(result.stage, "shadow");
  assert.equal(result.metrics.recordsDiffering, 0);
  assert.equal(result.metrics.missingNormalizedRecords, 0);
  assert.equal(result.metrics.unexpectedNormalizedRecords, 0);
  assert.equal(h.outbox().length, 0);
  assert.deepEqual(
    h.calls.filter((call) => call[0].startsWith("shadow.")).map((call) => call[0]),
    ["shadow.sync", "shadow.verify"]
  );
});

test("edit arriving during shadow checkpoint remains pending instead of being acknowledged accidentally", async () => {
  const h = createHarness();
  const first = h.stateStore.getState();
  first.animals[0].weight = 3.3;
  h.save(first);

  h.setShadowHook(async () => {
    const later = h.stateStore.getState();
    later.animals[0].weight = 3.9;
    h.save(later);
  });

  const result = await h.runtime.bootstrapShadow();

  assert.equal(result.ok, true);
  assert.equal(result.acknowledged, 1);
  const pending = h.outbox();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].recordId, "a1");
  assert.equal(h.stateStore.getState().animals[0].weight, 3.9);
});

test("legacy-stage commit never auto-enrolls or bootstraps shadow", async () => {
  const h = createHarness();
  const result = await h.runtime.afterLegacyCommit({ updatedAt: "2026-09-25T16:02:00.000Z" });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "manual-shadow-bootstrap-required");
  assert.equal(h.calls.some((call) => call[0] === "shadow.sync"), false);
});

test("shadow-stage confirmed legacy commit performs full shadow sync, reconstruction, and reconciliation", async () => {
  const initial = stateFixture();
  const h = createHarness({
    manifest: {
      cutover_stage: "shadow",
      sync_generation: 4,
      normalized_verified_at: "2026-09-25T15:50:00.000Z",
      metadata: {}
    },
    rows: rowsFor(initial)
  });

  const result = await h.runtime.afterLegacyCommit({ updatedAt: "2026-09-25T16:03:00.000Z" });

  assert.equal(result.ok, true);
  assert.equal(result.stage, "shadow");
  assert.equal(result.metrics.reconciliationErrorRate, 0);
  assert.equal(h.calls.some((call) => call[0] === "shadow.sync"), true);
  assert.equal(h.calls.some((call) => call[0] === "shadow.verify"), true);
});

test("dual-write confirmed legacy commit delegates to record-level coordinator and never full shadow sync", async () => {
  const initial = stateFixture();
  const h = createHarness({
    manifest: {
      cutover_stage: "dual_write",
      sync_generation: 8,
      metadata: { normalized_writer_ready: true, normalized_writer_version: "record-cas-v1" }
    },
    rows: rowsFor(initial)
  });

  const result = await h.runtime.afterLegacyCommit({ updatedAt: "2026-09-25T16:04:00.000Z" });

  assert.equal(result.mode, "dual-write");
  assert.equal(h.calls.some((call) => call[0] === "dual.afterLegacySave"), true);
  assert.equal(h.calls.some((call) => call[0] === "shadow.sync"), false);
});

test("shadow promotion checkpoints cleanly, moves to dual_write, then prepares record writer", async () => {
  const initial = stateFixture();
  const h = createHarness({
    manifest: {
      cutover_stage: "shadow",
      sync_generation: 5,
      normalized_verified_at: "2026-09-25T15:50:00.000Z",
      metadata: {}
    },
    rows: rowsFor(initial)
  });

  const result = await h.runtime.promoteDualWrite();

  assert.equal(result.ok, true);
  assert.equal(result.stage, "dual_write");
  assert.deepEqual(
    h.calls.filter((call) => call[0].startsWith("rollout.")).map((call) => call[0]),
    ["rollout.promote", "rollout.prepareWriter"]
  );
  assert.equal(h.getManifest().metadata.normalized_writer_ready, true);
});

test("normalized authority is intentionally not processed by PR 6 runtime", async () => {
  const h = createHarness({
    manifest: {
      cutover_stage: "normalized",
      sync_generation: 12,
      metadata: { normalized_writer_ready: true }
    }
  });
  const result = await h.runtime.afterLegacyCommit({});
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "normalized-authority-not-enabled-in-pr6");
});
