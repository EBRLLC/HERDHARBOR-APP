"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const Runtime = require("../cloud-sync-rollout-runtime-v1.8.4.js");
const StateStore = require("../herdharbor-state-store-v1.8.4.js");
const RecordStoreApi = require("../cloud-record-store-v1.8.3.js");
const Normalizer = require("../cloud-state-normalizer-v1.8.3.js");
const Baseline = require("../cloud-record-baseline-v1.8.4.js");
const Worker = require("../cloud-record-outbox-worker-v1.8.4.js");
const Cohort = require("../cloud-sync-cohort-gate-v1.8.3.js");
const Shadow = require("../cloud-shadow-sync-v1.8.3.js");
const Bootstrap = require("../cloud-shadow-bootstrap-v1.8.3.js");
const Reconciliation = require("../cloud-sync-reconciliation-v1.8.3.js");
const StagePolicy = require("../cloud-sync-stage-policy-v1.8.3.js");
const Rollout = require("../cloud-sync-rollout-control-v1.8.3.js");
const Dual = require("../cloud-dual-write-coordinator-v1.8.3.js");

const OWNER_KEY = "herdharbor_active_user_v1";
const STATE_KEY = "herdharbor_pre_alpha_v1";
const USER_ID = "approved-internal-test-user";

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function key(namespace, recordId) { return `${namespace}\u0000${recordId}`; }

class Storage {
  constructor(seed = {}) { this.values = new Map(Object.entries(seed)); }
  getItem(k) { return this.values.has(String(k)) ? this.values.get(String(k)) : null; }
  setItem(k, v) { this.values.set(String(k), String(v)); }
  removeItem(k) { this.values.delete(String(k)); }
}

function rootBus() {
  const handlers = new Map();
  return {
    CustomEvent: class {
      constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
    },
    document: {
      addEventListener(type, handler) {
        if (!handlers.has(type)) handlers.set(type, []);
        handlers.get(type).push(handler);
      },
      dispatchEvent(event) {
        for (const handler of handlers.get(event.type) || []) handler(event);
      }
    }
  };
}

class RolloutRecordStore {
  constructor() {
    this.rows = new Map();
    this.manifest = null;
    this.failNextRecord = null;
  }

  async getManifest() { return clone(this.manifest); }

  async list(namespace, options = {}) {
    return [...this.rows.values()]
      .filter((row) => row.namespace === namespace && (options.includeDeleted || !row.deleted_at))
      .map(clone)
      .sort((a, b) => a.record_id.localeCompare(b.record_id));
  }

  async listHeaders(namespace, options = {}) {
    return (await this.list(namespace, options)).map(({ payload, ...row }) => row);
  }

  async get(namespace, recordId, options = {}) {
    const row = this.rows.get(key(namespace, recordId));
    if (!row || (!options.includeDeleted && row.deleted_at)) return null;
    return clone(row);
  }

  async applyBatch({ puts = [], tombstones = [], manifestPatch = {} } = {}) {
    if (!this.manifest) {
      this.manifest = {
        schema_version: 1,
        cutover_stage: "legacy",
        sync_generation: 0,
        legacy_snapshot_updated_at: null,
        last_backfill_at: null,
        normalized_verified_at: null,
        metadata: {}
      };
    }
    assert.equal(manifestPatch.expectedGeneration, this.manifest.sync_generation);

    const stageBefore = this.manifest.cutover_stage;
    const stageAfter = manifestPatch.cutoverStage || stageBefore;
    if (stageAfter !== stageBefore) {
      assert.equal(stageBefore, "legacy");
      assert.equal(stageAfter, "shadow");
    }

    for (const put of puts) {
      const k = key(put.namespace, put.record_id);
      const current = this.rows.get(k);
      if (put.expectedVersion == null) {
        if (current) throw Object.assign(new Error("HH_SYNC_CONFLICT"), { code: "HH_SYNC_CONFLICT" });
        this.rows.set(k, { ...clone(put), record_version: 1, deleted_at: null });
      } else {
        if (!current || current.record_version !== put.expectedVersion) {
          throw Object.assign(new Error("HH_SYNC_CONFLICT"), { code: "HH_SYNC_CONFLICT" });
        }
        this.rows.set(k, {
          ...current,
          payload: clone(put.payload),
          payload_checksum: put.payload_checksum,
          record_version: current.record_version + 1,
          deleted_at: null
        });
      }
    }

    for (const tombstone of tombstones) {
      const k = key(tombstone.namespace, tombstone.record_id);
      const current = this.rows.get(k);
      if (!current || current.record_version !== tombstone.expectedVersion) {
        throw Object.assign(new Error("HH_SYNC_CONFLICT"), { code: "HH_SYNC_CONFLICT" });
      }
      this.rows.set(k, {
        ...current,
        record_version: current.record_version + 1,
        deleted_at: "2026-09-25T15:00:00.000Z"
      });
    }

    const mutations = puts.length + tombstones.length;
    const stageChanged = stageAfter !== stageBefore;
    this.manifest = {
      ...this.manifest,
      schema_version: manifestPatch.schemaVersion || this.manifest.schema_version,
      cutover_stage: stageAfter,
      legacy_snapshot_updated_at: manifestPatch.legacySnapshotUpdatedAt ?? this.manifest.legacy_snapshot_updated_at,
      last_backfill_at: manifestPatch.lastBackfillAt ?? this.manifest.last_backfill_at,
      normalized_verified_at: mutations > 0 ? null : (manifestPatch.normalizedVerifiedAt ?? this.manifest.normalized_verified_at),
      metadata: {
        ...this.manifest.metadata,
        ...(manifestPatch.metadata || {}),
        ...(mutations > 0 ? {
          verified_checksum: null,
          last_shadow_verified_at: null,
          verification_record_count: null
        } : {})
      },
      sync_generation: this.manifest.sync_generation + ((mutations > 0 || stageChanged) ? 1 : 0)
    };

    return {
      ok: true,
      generation: this.manifest.sync_generation,
      puts: puts.length,
      tombstones: tombstones.length,
      stage_changed: stageChanged
    };
  }

  async markVerified({ expectedGeneration, checksum, recordCount }) {
    assert.equal(expectedGeneration, this.manifest.sync_generation);
    const active = [...this.rows.values()].filter((row) =>
      row.namespace === Normalizer.namespace && !row.deleted_at
    );
    assert.equal(active.length, recordCount);
    assert.equal(this.manifest.metadata.source_checksum, checksum);
    this.manifest.normalized_verified_at = "2026-09-25T15:00:00.000Z";
    this.manifest.metadata = {
      ...this.manifest.metadata,
      verified_checksum: checksum,
      last_shadow_verified_at: this.manifest.normalized_verified_at,
      verification_record_count: recordCount
    };
    return {
      ok: true,
      generation: expectedGeneration,
      verified_at: this.manifest.normalized_verified_at,
      checksum,
      record_count: recordCount
    };
  }

  async applyRecordMutation(input) {
    if (this.failNextRecord === input.recordId) {
      this.failNextRecord = null;
      throw Object.assign(new Error("Failed to fetch"), { code: "network_error" });
    }

    const k = key(input.namespace, input.recordId);
    const current = this.rows.get(k);
    let next;
    if (input.deleted) {
      if (!current || current.record_version !== input.expectedVersion) {
        throw Object.assign(new Error("HH_SYNC_CONFLICT"), { code: "HH_SYNC_CONFLICT" });
      }
      next = { ...current, deleted_at: "2026-09-25T15:01:00.000Z", record_version: current.record_version + 1 };
    } else if (input.expectedVersion == null) {
      if (current) throw Object.assign(new Error("HH_SYNC_CONFLICT"), { code: "HH_SYNC_CONFLICT" });
      next = {
        namespace: input.namespace,
        record_id: input.recordId,
        payload: clone(input.payload),
        payload_checksum: input.payloadChecksum,
        record_version: 1,
        deleted_at: null
      };
    } else {
      if (!current || current.record_version !== input.expectedVersion) {
        throw Object.assign(new Error("HH_SYNC_CONFLICT"), { code: "HH_SYNC_CONFLICT" });
      }
      next = {
        ...current,
        payload: clone(input.payload),
        payload_checksum: input.payloadChecksum,
        record_version: current.record_version + 1,
        deleted_at: null
      };
    }
    this.rows.set(k, next);
    this.manifest.normalized_verified_at = null;
    this.manifest.metadata = {
      ...this.manifest.metadata,
      verified_checksum: null,
      last_shadow_verified_at: null,
      verification_record_count: null
    };
    this.manifest.sync_generation += 1;
    return {
      ok: true,
      record_id: input.recordId,
      record_version: next.record_version,
      deleted: Boolean(next.deleted_at),
      generation: this.manifest.sync_generation
    };
  }

  async applyRecordMutationsAtomic({ operations = [] } = {}) {
    const rowsBefore = new Map([...this.rows.entries()].map(([rowKey, row]) => [rowKey, clone(row)]));
    const manifestBefore = clone(this.manifest);
    const results = [];
    try {
      for (const operation of operations) {
        results.push(await this.applyRecordMutation(operation));
      }
      this.manifest.sync_generation = manifestBefore.sync_generation + 1;
      return {
        ok: true,
        generation: this.manifest.sync_generation,
        operations: results
      };
    } catch (error) {
      this.rows = rowsBefore;
      this.manifest = manifestBefore;
      throw error;
    }
  }

  async setStage({ targetStage, expectedGeneration }) {
    assert.equal(expectedGeneration, this.manifest.sync_generation);
    const from = this.manifest.cutover_stage;
    const legal = {
      legacy: ["shadow"],
      shadow: ["legacy", "dual_write"],
      dual_write: ["shadow", "normalized"],
      normalized: ["dual_write"]
    };
    assert.ok(legal[from].includes(targetStage), `${from}->${targetStage}`);
    if ((from === "shadow" && targetStage === "dual_write") || (from === "dual_write" && targetStage === "normalized")) {
      assert.ok(this.manifest.normalized_verified_at);
      assert.equal(this.manifest.metadata.verified_checksum, this.manifest.metadata.source_checksum);
    }
    this.manifest.cutover_stage = targetStage;
    this.manifest.sync_generation += 1;
    if (targetStage === "legacy" || targetStage === "shadow" && from === "dual_write") {
      this.manifest.normalized_verified_at = null;
      this.manifest.metadata = {
        ...this.manifest.metadata,
        normalized_writer_ready: false,
        normalized_writer_version: null,
        normalized_writer_prepared_at: null,
        verified_checksum: null,
        last_shadow_verified_at: null,
        verification_record_count: null
      };
    }
    return { ok: true, from_stage: from, stage: targetStage, generation: this.manifest.sync_generation };
  }

  async prepareNormalizedWriter({ expectedGeneration, writerVersion, namespace, formatVersion }) {
    if (this.failPrepareWriter) {
      const error = this.failPrepareWriter;
      this.failPrepareWriter = null;
      throw error;
    }
    assert.equal(expectedGeneration, this.manifest.sync_generation);
    assert.equal(this.manifest.cutover_stage, "dual_write");
    assert.equal(namespace, Normalizer.namespace);
    assert.equal(formatVersion, Normalizer.formatVersion);
    assert.equal(typeof writerVersion, "string");
    assert.ok(writerVersion.length > 0);
    this.manifest.metadata = {
      ...this.manifest.metadata,
      normalized_writer_ready: true,
      normalized_writer_version: writerVersion,
      normalized_writer_prepared_at: "2026-09-25T15:00:30.000Z",
      verified_checksum: null,
      last_shadow_verified_at: null,
      verification_record_count: null
    };
    this.manifest.normalized_verified_at = null;
    this.manifest.sync_generation += 1;
    return {
      ok: true,
      stage: "dual_write",
      generation: this.manifest.sync_generation,
      writer_version: writerVersion
    };
  }
}

function sourceState() {
  return {
    animals: [{ id: "a1", name: "Judy", weight: 3.1 }],
    litters: [{ id: "l1", name: "Litter 1" }],
    tasks: [{ id: "t1", title: "Check nest", done: false }],
    unknownFutureSection: { retained: true, nested: ["a", "b"] },
    settings: { theme: "system" }
  };
}

async function harness() {
  const initial = sourceState();
  const root = rootBus();
  const storage = new Storage({
    [OWNER_KEY]: USER_ID,
    [STATE_KEY]: JSON.stringify(initial)
  });
  const stateStore = StateStore.create({
    storage,
    indexedDB: null,
    now: () => "2026-09-25T15:00:00.000Z"
  });
  const recordStore = new RolloutRecordStore();
  const baselineRows = new Map();
  const baselineMetas = new Map();
  let legacySnapshot = clone(initial);
  let legacyUpdatedAt = "2026-09-25T15:00:00.000Z";
  let syncNowCalls = 0;

  const cloud = {
    getSession: async () => ({ user: { id: USER_ID } }),
    getNormalizedSyncCohortStatus: async () => ({
      eligible: true,
      mode: "allowlist",
      percentageEnabled: false,
      schemaVerified: true
    }),
    createNormalizedRecordStore: () => recordStore,
    readLegacySnapshotForNormalizedSync: async () => ({
      snapshot: clone(legacySnapshot),
      updatedAt: legacyUpdatedAt
    }),
    syncNow: async () => {
      syncNowCalls += 1;
      root.document.dispatchEvent(new root.CustomEvent("herdharbor:legacy-cloud-commit", {
        detail: { sequence: syncNowCalls, updatedAt: legacyUpdatedAt, userIdPresent: true }
      }));
      return true;
    }
  };

  const baselineApi = {
    createIndexedDbStore: () => Baseline.createMemoryStore({
      ownerId: USER_ID,
      rows: baselineRows,
      metas: baselineMetas
    })
  };
  const modules = {
    recordStoreApi: RecordStoreApi,
    normalizer: Normalizer,
    baselineApi,
    workerApi: Worker,
    cohortApi: Cohort,
    shadowApi: Shadow,
    bootstrapApi: Bootstrap,
    reconciliationApi: Reconciliation,
    stagePolicy: StagePolicy,
    rolloutApi: Rollout,
    dualWriteApi: Dual
  };

  const runtime = Runtime.create({
    root,
    cloud,
    stateStore,
    loadDependencies: async () => true,
    modules,
    telemetryAvailable: () => true,
    requiredValidationPasses: 3
  });

  return {
    root,
    cloud,
    stateStore,
    recordStore,
    runtime,
    get legacySnapshot() { return clone(legacySnapshot); },
    setLegacy(snapshot) {
      legacySnapshot = clone(snapshot);
      legacyUpdatedAt = "2026-09-25T15:01:00.000Z";
    },
    get syncNowCalls() { return syncNowCalls; }
  };
}

test("approved internal account bootstraps missing manifest to verified shadow without losing unknown sections", async () => {
  const h = await harness();
  const decision = await h.runtime.checkEligibility();
  assert.equal(decision.active, true);
  assert.equal(h.recordStore.manifest, null);

  const result = await h.runtime.afterLegacyCommit();

  assert.equal(result.ok, true);
  assert.equal(h.recordStore.manifest.cutover_stage, "shadow");
  assert.ok(h.recordStore.manifest.normalized_verified_at);
  const reconstructed = Normalizer.reassembleLegacySnapshot(
    await h.recordStore.list(Normalizer.namespace, { includeDeleted: true })
  );
  assert.deepEqual(reconstructed, sourceState());
  assert.deepEqual(reconstructed.unknownFutureSection, { retained: true, nested: ["a", "b"] });
});

test("three consecutive zero-divergence checkpoints are required before explicit dual-write promotion", async () => {
  const h = await harness();
  await h.runtime.checkEligibility();
  await h.runtime.afterLegacyCommit();

  await assert.rejects(
    () => h.runtime.promoteToDualWrite(),
    (error) => error?.code === "HH_SYNC_REPEATED_VALIDATION_REQUIRED"
  );

  for (let pass = 1; pass <= 3; pass += 1) {
    const validation = await h.runtime.validateNow();
    assert.equal(validation.ok, true);
    assert.equal(validation.passNumber, pass);
    assert.equal(validation.reconciliation.missingNormalizedRecords, 0);
    assert.equal(validation.reconciliation.unexpectedNormalizedRecords, 0);
    assert.equal(validation.reconciliation.recordsDiffering, 0);
    assert.equal(validation.reconciliation.unresolvedConflicts, 0);
  }

  const promoted = await h.runtime.promoteToDualWrite();
  assert.equal(promoted.stage, "dual_write");
  assert.equal(promoted.prepared.writer_version, "record-cas-v1");
  assert.equal(h.recordStore.manifest.metadata.normalized_writer_ready, true);
  assert.equal(h.runtime.status().stage, "dual_write");
  assert.equal(h.runtime.status().validationPasses, 0);
});

test("dual-write runs record outbox only after legacy snapshot has been committed", async () => {
  const h = await harness();
  await h.runtime.checkEligibility();
  await h.runtime.afterLegacyCommit();
  for (let i = 0; i < 3; i += 1) await h.runtime.validateNow();
  await h.runtime.promoteToDualWrite();

  const next = h.stateStore.getState();
  next.animals[0].weight = 3.7;
  h.stateStore.commit(next, { source: "local", reason: "dual-write-test" });

  // Simulate legacy authority completing first, then invoke the post-legacy hook.
  h.setLegacy(next);
  assert.equal(h.recordStore.rows.size > 0, true);
  const result = await h.runtime.afterLegacyCommit();

  assert.equal(result.ok, true);
  assert.equal(result.mode, "dual-write");
  const animal = [...h.recordStore.rows.values()].find((row) =>
    row.payload?.kind === "array_item" && row.payload.value?.id === "a1"
  );
  assert.equal(animal.payload.value.weight, 3.7);
  assert.equal(h.stateStore.getOutbox(USER_ID).length, 0);
});

test("normalized provider failure after legacy success degrades safely and keeps mutation retryable", async () => {
  const h = await harness();
  await h.runtime.checkEligibility();
  await h.runtime.afterLegacyCommit();
  for (let i = 0; i < 3; i += 1) await h.runtime.validateNow();
  await h.runtime.promoteToDualWrite();

  const next = h.stateStore.getState();
  next.tasks[0].done = true;
  h.stateStore.commit(next, { source: "local", reason: "provider-failure-test" });
  h.setLegacy(next);

  const task = [...h.recordStore.rows.values()].find((row) =>
    row.payload?.kind === "array_item" && row.payload.value?.id === "t1"
  );
  h.recordStore.failNextRecord = task.record_id;

  const result = await h.runtime.afterLegacyCommit();

  assert.equal(result.legacySaved, true);
  assert.equal(result.ok, false);
  assert.equal(result.mode, "dual-write-degraded");
  assert.equal(result.normalizedPending, true);
  assert.equal(h.stateStore.getOutbox(USER_ID).length, 1);
  assert.equal(h.legacySnapshot.tasks[0].done, true, "authoritative legacy save remains valid");
});

test("rollback from dual_write returns to shadow without deleting normalized rows or legacy state", async () => {
  const h = await harness();
  await h.runtime.checkEligibility();
  await h.runtime.afterLegacyCommit();
  for (let i = 0; i < 3; i += 1) await h.runtime.validateNow();
  await h.runtime.promoteToDualWrite();

  const beforeRows = h.recordStore.rows.size;
  const beforeLegacy = h.legacySnapshot;
  const rolledBack = await h.runtime.rollback();

  assert.equal(rolledBack.stage, "shadow");
  assert.equal(h.runtime.status().stage, "shadow");
  assert.equal(h.recordStore.rows.size, beforeRows);
  assert.deepEqual(h.legacySnapshot, beforeLegacy);
});

test("runtime never promotes to normalized authority in PR6", () => {
  const source = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", "cloud-sync-rollout-runtime-v1.8.4.js"),
    "utf8"
  );
  assert.doesNotMatch(source,/promote\("normalized"/);
  assert.match(source,/normalized-authority-owned-by-pr7/);
});


test("writer preparation failure automatically rolls dual_write promotion back to shadow", async () => {
  const h = await harness();
  await h.runtime.checkEligibility();
  await h.runtime.afterLegacyCommit();
  for (let i = 0; i < 3; i += 1) {
    const validation = await h.runtime.validateNow();
    assert.equal(validation.ok, true);
  }

  h.recordStore.failPrepareWriter = Object.assign(
    new Error("writer preparation failed"),
    { code: "HH_SYNC_WRITER_PREPARE_TEST" }
  );

  await assert.rejects(
    () => h.runtime.promoteToDualWrite(),
    (error) => error?.code === "HH_SYNC_WRITER_PREPARE_TEST"
  );

  assert.equal(h.runtime.status().stage, "shadow");
  assert.equal(h.recordStore.manifest.cutover_stage, "shadow");
  assert.notEqual(h.recordStore.manifest.metadata.normalized_writer_ready, true);
});
