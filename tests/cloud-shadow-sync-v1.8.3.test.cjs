"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const normalizer = require(path.join(root, "cloud-state-normalizer-v1.8.3.js"));
const shadow = require(path.join(root, "cloud-shadow-sync-v1.8.3.js"));
const source = fs.readFileSync(path.join(root, "cloud-shadow-sync-v1.8.3.js"), "utf8");
const fixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, "fixtures", "cloud-state-normalization-v1.8.3.json"),
  "utf8"
));

function fakeStore(initialRows = [], initialManifest = null) {
  const rows = new Map();
  for (const row of initialRows) {
    rows.set(row.record_id, {
      namespace: row.namespace,
      record_id: row.record_id,
      payload: JSON.parse(JSON.stringify(row.payload)),
      record_version: row.record_version || 1,
      deleted_at: row.deleted_at || null
    });
  }
  let manifest = initialManifest ? JSON.parse(JSON.stringify(initialManifest)) : null;
  const calls = [];

  return {
    calls,
    async list(namespace, options = {}) {
      calls.push(["list", namespace, options]);
      return [...rows.values()]
        .filter((row) => row.namespace === namespace)
        .filter((row) => options.includeDeleted || !row.deleted_at)
        .map((row) => JSON.parse(JSON.stringify(row)));
    },
    async put(namespace, recordId, payload, options = {}) {
      calls.push(["put", namespace, recordId, options]);
      const current = rows.get(recordId);
      if (options.expectedVersion && current?.record_version !== options.expectedVersion) {
        const error = new Error("conflict");
        error.code = "HH_SYNC_CONFLICT";
        throw error;
      }
      const next = {
        namespace,
        record_id: recordId,
        payload: JSON.parse(JSON.stringify(payload)),
        record_version: current ? current.record_version + 1 : 1,
        deleted_at: null
      };
      rows.set(recordId, next);
      return JSON.parse(JSON.stringify(next));
    },
    async tombstone(namespace, recordId, options = {}) {
      calls.push(["tombstone", namespace, recordId, options]);
      const current = rows.get(recordId);
      if (!current) return null;
      if (options.expectedVersion && current.record_version !== options.expectedVersion) {
        const error = new Error("conflict");
        error.code = "HH_SYNC_CONFLICT";
        throw error;
      }
      current.record_version += 1;
      current.deleted_at = "2026-09-16T00:00:00.000Z";
      return JSON.parse(JSON.stringify(current));
    },
    async getManifest() {
      calls.push(["getManifest"]);
      return manifest ? JSON.parse(JSON.stringify(manifest)) : null;
    },
    async putManifest(patch) {
      calls.push(["putManifest", JSON.parse(JSON.stringify(patch))]);
      manifest = {
        ...(manifest || {}),
        schema_version: patch.schemaVersion,
        cutover_stage: patch.cutoverStage,
        legacy_snapshot_updated_at: patch.legacySnapshotUpdatedAt,
        last_backfill_at: patch.lastBackfillAt,
        metadata: JSON.parse(JSON.stringify(patch.metadata || {}))
      };
      return JSON.parse(JSON.stringify(manifest));
    }
  };
}

function versionedRows(mapped, version = 1) {
  return mapped.records.map((record) => ({
    namespace: record.namespace,
    record_id: record.record_id,
    payload: record.payload,
    record_version: version,
    deleted_at: null
  }));
}

test("shadow writes are disabled by default and perform zero provider operations", async () => {
  const store = fakeStore();
  const controller = shadow.createShadowSyncController({ recordStore: store, normalizer });

  const result = await controller.sync(fixture);

  assert.equal(controller.isEnabled(), false);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "disabled");
  assert.equal(store.calls.length, 0);
  assert.ok(result.puts > 0);
});

test("enabled shadow sync writes only the normalized table adapter and advances legacy to shadow after success", async () => {
  const before = normalizer.mapLegacySnapshot(fixture);
  const previousRows = versionedRows(before, 7);
  const changed = JSON.parse(JSON.stringify(fixture));
  changed.animals[0].name = "Annie Shadow Updated";
  changed.healthRecords = [];
  const store = fakeStore(previousRows, {
    cutover_stage: "legacy",
    metadata: { retained: "yes" }
  });
  const controller = shadow.createShadowSyncController({
    recordStore: store,
    normalizer,
    enabled: true,
    now: () => "2026-09-16T01:00:00.000Z"
  });

  const result = await controller.sync(changed);

  assert.equal(result.skipped, false);
  assert.equal(result.stage, "shadow");
  assert.ok(result.puts > 0);
  assert.ok(result.tombstones > 0);
  assert.ok(store.calls.some((call) => call[0] === "put" && call[3].expectedVersion === 7));
  assert.ok(store.calls.some((call) => call[0] === "tombstone" && call[3].expectedVersion === 7));
  const manifestWrite = store.calls.find((call) => call[0] === "putManifest");
  assert.equal(manifestWrite[1].cutoverStage, "shadow");
  assert.equal(manifestWrite[1].metadata.retained, "yes");
  assert.equal(manifestWrite[1].metadata.source_checksum, normalizer.snapshotChecksum(changed));

  const verify = await controller.verify(changed);
  assert.equal(verify.ok, true);
});

test("shadow sync never downgrades dual-write and refuses legacy shadow writes after normalized cutover", async () => {
  const dualStore = fakeStore([], { cutover_stage: "dual_write", metadata: {} });
  const dualController = shadow.createShadowSyncController({
    recordStore: dualStore,
    normalizer,
    enabled: true,
    now: () => "2026-09-16T01:00:00.000Z"
  });
  const dualResult = await dualController.sync(fixture, { previousRows: [] });
  assert.equal(dualResult.stage, "dual_write");
  assert.equal(dualStore.calls.find((call) => call[0] === "putManifest")[1].cutoverStage, "dual_write");

  const normalizedStore = fakeStore([], { cutover_stage: "normalized", metadata: {} });
  const normalizedController = shadow.createShadowSyncController({
    recordStore: normalizedStore,
    normalizer,
    enabled: true
  });
  const normalizedResult = await normalizedController.sync(fixture, { previousRows: [] });
  assert.equal(normalizedResult.skipped, true);
  assert.equal(normalizedResult.reason, "normalized-authoritative");
  assert.deepEqual(normalizedStore.calls.map((call) => call[0]), ["getManifest"]);
});

test("manifest is not advanced when a normalized record write fails", async () => {
  const store = fakeStore([], { cutover_stage: "legacy", metadata: {} });
  let putCount = 0;
  const originalPut = store.put;
  store.put = async (...args) => {
    putCount += 1;
    if (putCount === 2) throw Object.assign(new Error("provider unavailable"), { code: "503" });
    return originalPut(...args);
  };
  const controller = shadow.createShadowSyncController({ recordStore: store, normalizer, enabled: true });

  await assert.rejects(() => controller.sync(fixture, { previousRows: [] }), /provider unavailable/);
  assert.equal(store.calls.some((call) => call[0] === "putManifest"), false);
});

test("mutation safety limit aborts before any row mutation", async () => {
  const store = fakeStore([], { cutover_stage: "legacy", metadata: {} });
  const controller = shadow.createShadowSyncController({
    recordStore: store,
    normalizer,
    enabled: true,
    maxMutations: 1
  });

  await assert.rejects(
    () => controller.sync(fixture, { previousRows: [] }),
    (error) => error?.code === "HH_SHADOW_MUTATION_LIMIT"
  );
  assert.deepEqual(store.calls.map((call) => call[0]), ["getManifest"]);
});

test("shadow controller contains no legacy full-state table mutation path", () => {
  assert.doesNotMatch(source, /herdharbor_user_data/);
  assert.doesNotMatch(source, /app_state/);
  assert.match(source, /normalized-authoritative/);
  assert.match(source, /HH_SHADOW_MUTATION_LIMIT/);
});
