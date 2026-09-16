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
      const safePatch = JSON.parse(JSON.stringify(patch));
      calls.push(["putManifest", safePatch]);
      const next = { ...(manifest || {}) };
      if (Object.prototype.hasOwnProperty.call(patch, "schemaVersion")) next.schema_version = patch.schemaVersion;
      if (Object.prototype.hasOwnProperty.call(patch, "cutoverStage")) next.cutover_stage = patch.cutoverStage;
      if (Object.prototype.hasOwnProperty.call(patch, "legacySnapshotUpdatedAt")) next.legacy_snapshot_updated_at = patch.legacySnapshotUpdatedAt;
      if (Object.prototype.hasOwnProperty.call(patch, "lastBackfillAt")) next.last_backfill_at = patch.lastBackfillAt;
      if (Object.prototype.hasOwnProperty.call(patch, "normalizedVerifiedAt")) next.normalized_verified_at = patch.normalizedVerifiedAt;
      if (Object.prototype.hasOwnProperty.call(patch, "metadata")) next.metadata = JSON.parse(JSON.stringify(patch.metadata || {}));
      manifest = next;
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
  const recordedVerification = await controller.verifyAndRecord(fixture);

  assert.equal(controller.isEnabled(), false);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "disabled");
  assert.equal(recordedVerification.skipped, true);
  assert.equal(recordedVerification.reason, "disabled");
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
  assert.equal(manifestWrite[1].normalizedVerifiedAt, null);
  assert.equal(manifestWrite[1].metadata.retained, "yes");
  assert.equal(manifestWrite[1].metadata.source_checksum, normalizer.snapshotChecksum(changed));

  const verify = await controller.verify(changed);
  assert.equal(verify.ok, true);
});

test("verified shadow round trip is recorded only after a successful canonical comparison", async () => {
  const store = fakeStore([], { cutover_stage: "legacy", metadata: { cohort: "internal" } });
  const controller = shadow.createShadowSyncController({
    recordStore: store,
    normalizer,
    enabled: true,
    now: () => "2026-09-16T02:00:00.000Z"
  });

  await controller.sync(fixture, { previousRows: [] });
  const recorded = await controller.verifyAndRecord(fixture);

  assert.equal(recorded.ok, true);
  assert.equal(recorded.skipped, false);
  assert.equal(recorded.stage, "shadow");
  assert.equal(recorded.verifiedAt, "2026-09-16T02:00:00.000Z");
  const manifestWrites = store.calls.filter((call) => call[0] === "putManifest");
  const verificationPatch = manifestWrites.at(-1)[1];
  assert.equal(verificationPatch.normalizedVerifiedAt, "2026-09-16T02:00:00.000Z");
  assert.equal(verificationPatch.metadata.cohort, "internal");
  assert.equal(verificationPatch.metadata.verified_checksum, normalizer.snapshotChecksum(fixture));
  assert.ok(verificationPatch.metadata.verification_record_count > 0);

  const writesBeforeMismatch = store.calls.filter((call) => call[0] === "putManifest").length;
  const mismatched = JSON.parse(JSON.stringify(fixture));
  mismatched.profile.farmName = "Different Legacy State";
  await assert.rejects(
    () => controller.verifyAndRecord(mismatched),
    (error) => error?.code === "HH_SHADOW_VERIFY_MISMATCH"
  );
  assert.equal(store.calls.filter((call) => call[0] === "putManifest").length, writesBeforeMismatch);
});

test("a changed shadow write clears any prior verification before the new state can be trusted", async () => {
  const before = normalizer.mapLegacySnapshot(fixture);
  const store = fakeStore(versionedRows(before, 3), {
    cutover_stage: "shadow",
    normalized_verified_at: "2026-09-15T20:00:00.000Z",
    metadata: {
      verified_checksum: normalizer.snapshotChecksum(fixture),
      last_shadow_verified_at: "2026-09-15T20:00:00.000Z",
      verification_record_count: before.records.length
    }
  });
  const controller = shadow.createShadowSyncController({
    recordStore: store,
    normalizer,
    enabled: true,
    now: () => "2026-09-16T03:00:00.000Z"
  });
  const changed = JSON.parse(JSON.stringify(fixture));
  changed.selectedAnimalId = "rabbit-patches";

  await controller.sync(changed);

  const patch = store.calls.filter((call) => call[0] === "putManifest").at(-1)[1];
  assert.equal(patch.normalizedVerifiedAt, null);
  assert.equal(patch.metadata.verified_checksum, null);
  assert.equal(patch.metadata.last_shadow_verified_at, null);
  assert.equal(patch.metadata.verification_record_count, null);
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
  assert.match(source, /verifyAndRecord/);
});
