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

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fakeAtomicStore(initialRows = [], initialManifest = null) {
  let rows = new Map();
  for (const row of initialRows) {
    rows.set(row.record_id, {
      namespace: row.namespace,
      record_id: row.record_id,
      payload: deepClone(row.payload),
      record_version: row.record_version || 1,
      deleted_at: row.deleted_at || null
    });
  }
  let manifest = initialManifest
    ? deepClone(initialManifest)
    : { cutover_stage: "legacy", sync_generation: 0, metadata: {} };
  if (!Number.isSafeInteger(Number(manifest.sync_generation))) manifest.sync_generation = 0;
  const calls = [];

  function conflict(code = "HH_SYNC_CONFLICT") {
    const error = new Error(code);
    error.code = code;
    return error;
  }

  return {
    calls,
    _rows() {
      return [...rows.values()].map(deepClone);
    },
    _manifest() {
      return deepClone(manifest);
    },
    async list(namespace, options = {}) {
      calls.push(["list", namespace, options]);
      return [...rows.values()]
        .filter((row) => row.namespace === namespace)
        .filter((row) => options.includeDeleted || !row.deleted_at)
        .map(deepClone);
    },
    async getManifest() {
      calls.push(["getManifest"]);
      return deepClone(manifest);
    },
    async applyBatch({ puts = [], tombstones = [], manifestPatch = {} } = {}) {
      calls.push(["applyBatch", deepClone({ puts, tombstones, manifestPatch })]);
      if (manifest.cutover_stage === "normalized") throw conflict("HH_SYNC_ALREADY_NORMALIZED");
      if (Number(manifestPatch.expectedGeneration) !== Number(manifest.sync_generation)) {
        throw conflict();
      }

      const stagedRows = new Map([...rows.entries()].map(([key, value]) => [key, deepClone(value)]));
      const stagedManifest = deepClone(manifest);

      for (const record of puts) {
        const current = stagedRows.get(record.record_id);
        if (record.expectedVersion !== undefined) {
          if (!current || current.record_version !== record.expectedVersion) throw conflict();
        } else if (current) {
          throw conflict();
        }
        stagedRows.set(record.record_id, {
          namespace: record.namespace,
          record_id: record.record_id,
          payload: deepClone(record.payload),
          record_version: current ? current.record_version + 1 : 1,
          deleted_at: null
        });
      }

      for (const record of tombstones) {
        const current = stagedRows.get(record.record_id);
        if (!current || current.record_version !== record.expectedVersion) throw conflict();
        current.record_version += 1;
        current.deleted_at = "2026-09-16T00:00:00.000Z";
      }

      const mutationCount = puts.length + tombstones.length;
      if (manifestPatch.cutoverStage !== undefined) stagedManifest.cutover_stage = manifestPatch.cutoverStage;
      if (manifestPatch.schemaVersion !== undefined) stagedManifest.schema_version = manifestPatch.schemaVersion;
      if (manifestPatch.legacySnapshotUpdatedAt !== undefined) {
        stagedManifest.legacy_snapshot_updated_at = manifestPatch.legacySnapshotUpdatedAt;
      }
      if (manifestPatch.lastBackfillAt !== undefined) stagedManifest.last_backfill_at = manifestPatch.lastBackfillAt;
      if (manifestPatch.metadata !== undefined) stagedManifest.metadata = deepClone(manifestPatch.metadata);
      if (mutationCount > 0) {
        stagedManifest.normalized_verified_at = null;
        stagedManifest.metadata.verified_checksum = null;
        stagedManifest.metadata.last_shadow_verified_at = null;
        stagedManifest.metadata.verification_record_count = null;
        stagedManifest.sync_generation += 1;
      }

      rows = stagedRows;
      manifest = stagedManifest;
      return {
        ok: true,
        generation: manifest.sync_generation,
        puts: puts.length,
        tombstones: tombstones.length
      };
    },
    async markVerified({ expectedGeneration, checksum, recordCount } = {}) {
      calls.push(["markVerified", { expectedGeneration, checksum, recordCount }]);
      if (
        Number(expectedGeneration) !== Number(manifest.sync_generation) ||
        !["shadow", "dual_write"].includes(manifest.cutover_stage)
      ) {
        throw conflict("HH_SYNC_VERIFY_STALE");
      }
      const verifiedAt = "2026-09-16T04:00:00.000Z";
      manifest.normalized_verified_at = verifiedAt;
      manifest.metadata = {
        ...(manifest.metadata || {}),
        verified_checksum: checksum,
        last_shadow_verified_at: verifiedAt,
        verification_record_count: recordCount
      };
      return {
        ok: true,
        generation: manifest.sync_generation,
        verified_at: verifiedAt,
        checksum,
        record_count: recordCount
      };
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

test("shadow writes are disabled by default and perform zero provider or normalization work", async () => {
  const store = fakeAtomicStore();
  let mapCalls = 0;
  const countingNormalizer = {
    ...normalizer,
    mapLegacySnapshot(snapshot) {
      mapCalls += 1;
      return normalizer.mapLegacySnapshot(snapshot);
    }
  };
  const controller = shadow.createShadowSyncController({ recordStore: store, normalizer: countingNormalizer });

  const result = await controller.sync(fixture);
  const recordedVerification = await controller.verifyAndRecord(fixture);

  assert.equal(controller.isEnabled(), false);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "disabled");
  assert.equal(result.puts, 0);
  assert.equal(result.tombstones, 0);
  assert.equal(result.recordCount, 0);
  assert.equal(recordedVerification.skipped, true);
  assert.equal(recordedVerification.reason, "disabled");
  assert.equal(store.calls.length, 0);
  assert.equal(mapCalls, 0);
});

test("enabled shadow sync applies one atomic batch and advances legacy to shadow", async () => {
  const before = normalizer.mapLegacySnapshot(fixture);
  const previousRows = versionedRows(before, 7);
  const changed = deepClone(fixture);
  changed.animals[0].name = "Annie Shadow Updated";
  changed.healthRecords = [];
  const store = fakeAtomicStore(previousRows, {
    cutover_stage: "legacy",
    sync_generation: 4,
    metadata: { retained: "yes" }
  });
  const controller = shadow.createShadowSyncController({
    recordStore: store,
    normalizer,
    enabled: true,
    now: () => "2026-09-16T01:00:00.000Z"
  });

  const result = await controller.sync(changed, { previousRows });

  assert.equal(result.skipped, false);
  assert.equal(result.stage, "shadow");
  assert.equal(result.generation, 5);
  assert.ok(result.puts > 0);
  assert.ok(result.tombstones > 0);
  assert.equal(store.calls.some((call) => call[0] === "applyBatch"), true);
  assert.equal(store.calls.some((call) => ["put", "tombstone", "putManifest"].includes(call[0])), false);

  const batch = store.calls.find((call) => call[0] === "applyBatch")[1];
  assert.equal(batch.manifestPatch.expectedGeneration, 4);
  assert.equal(batch.manifestPatch.cutoverStage, "shadow");
  assert.equal(batch.manifestPatch.normalizedVerifiedAt, null);
  assert.equal(batch.manifestPatch.metadata.retained, "yes");
  assert.equal(batch.manifestPatch.metadata.source_checksum, normalizer.snapshotChecksum(changed));
  assert.ok(batch.puts.some((record) => record.expectedVersion === 7));
  assert.ok(batch.tombstones.every((record) => record.expectedVersion === 7));

  const verify = await controller.verify(changed);
  assert.equal(verify.ok, true);
});

test("verified shadow round trip is generation-guarded and recorded only after comparison", async () => {
  const store = fakeAtomicStore([], {
    cutover_stage: "legacy",
    sync_generation: 0,
    metadata: { cohort: "internal" }
  });
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
  assert.equal(recorded.generation, 1);
  assert.equal(recorded.verifiedAt, "2026-09-16T04:00:00.000Z");
  const markCall = store.calls.find((call) => call[0] === "markVerified")[1];
  assert.equal(markCall.expectedGeneration, 1);
  assert.equal(markCall.checksum, normalizer.snapshotChecksum(fixture));
  assert.ok(markCall.recordCount > 0);
  assert.equal(store._manifest().metadata.cohort, "internal");
  assert.equal(store._manifest().normalized_verified_at, "2026-09-16T04:00:00.000Z");

  const marksBeforeMismatch = store.calls.filter((call) => call[0] === "markVerified").length;
  const mismatched = deepClone(fixture);
  mismatched.profile.farmName = "Different Legacy State";
  await assert.rejects(
    () => controller.verifyAndRecord(mismatched),
    (error) => error?.code === "HH_SHADOW_VERIFY_MISMATCH"
  );
  assert.equal(store.calls.filter((call) => call[0] === "markVerified").length, marksBeforeMismatch);
});

test("a changed atomic batch clears any prior verification", async () => {
  const before = normalizer.mapLegacySnapshot(fixture);
  const previousRows = versionedRows(before, 3);
  const store = fakeAtomicStore(previousRows, {
    cutover_stage: "shadow",
    sync_generation: 8,
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
  const changed = deepClone(fixture);
  changed.selectedAnimalId = "rabbit-patches";

  await controller.sync(changed, { previousRows });

  const manifest = store._manifest();
  assert.equal(manifest.sync_generation, 9);
  assert.equal(manifest.normalized_verified_at, null);
  assert.equal(manifest.metadata.verified_checksum, null);
  assert.equal(manifest.metadata.last_shadow_verified_at, null);
  assert.equal(manifest.metadata.verification_record_count, null);
});

test("shadow sync never downgrades dual-write and normalized stage exits before full-state mapping", async () => {
  const dualStore = fakeAtomicStore([], { cutover_stage: "dual_write", sync_generation: 2, metadata: {} });
  const dualController = shadow.createShadowSyncController({
    recordStore: dualStore,
    normalizer,
    enabled: true,
    now: () => "2026-09-16T01:00:00.000Z"
  });
  const dualResult = await dualController.sync(fixture, { previousRows: [] });
  assert.equal(dualResult.stage, "dual_write");
  assert.equal(dualStore._manifest().cutover_stage, "dual_write");

  const normalizedStore = fakeAtomicStore([], { cutover_stage: "normalized", sync_generation: 11, metadata: {} });
  let mapCalls = 0;
  const countingNormalizer = {
    ...normalizer,
    mapLegacySnapshot(snapshot) {
      mapCalls += 1;
      return normalizer.mapLegacySnapshot(snapshot);
    }
  };
  const normalizedController = shadow.createShadowSyncController({
    recordStore: normalizedStore,
    normalizer: countingNormalizer,
    enabled: true
  });
  const normalizedResult = await normalizedController.sync(fixture, { previousRows: [] });
  assert.equal(normalizedResult.skipped, true);
  assert.equal(normalizedResult.reason, "normalized-authoritative");
  assert.equal(normalizedResult.puts, 0);
  assert.equal(normalizedResult.tombstones, 0);
  assert.equal(mapCalls, 0);
  assert.deepEqual(normalizedStore.calls.map((call) => call[0]), ["getManifest"]);
});

test("mutation safety limit aborts before any atomic batch mutation", async () => {
  const store = fakeAtomicStore([], { cutover_stage: "legacy", sync_generation: 0, metadata: {} });
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

test("two devices using stale row versions cannot leave a partial normalized snapshot", async () => {
  const initial = normalizer.mapLegacySnapshot(fixture);
  const staleRows = versionedRows(initial, 1);
  const store = fakeAtomicStore(staleRows, {
    cutover_stage: "shadow",
    sync_generation: 10,
    metadata: {}
  });
  const deviceA = shadow.createShadowSyncController({ recordStore: store, normalizer, enabled: true });
  const deviceB = shadow.createShadowSyncController({ recordStore: store, normalizer, enabled: true });

  const stateA = deepClone(fixture);
  stateA.animals[0].name = "Device A Annie";
  await deviceA.sync(stateA, { previousRows: staleRows });
  assert.equal(store._manifest().sync_generation, 11);
  const rowsAfterA = store._rows();
  assert.deepEqual(normalizer.reassembleLegacySnapshot(rowsAfterA), stateA);

  const stateB = deepClone(fixture);
  stateB.animals[1].name = "Device B Patches";
  await assert.rejects(
    () => deviceB.sync(stateB, { previousRows: staleRows }),
    (error) => error?.code === "HH_SYNC_CONFLICT" || /HH_SYNC_CONFLICT/.test(error?.message || "")
  );

  assert.equal(store._manifest().sync_generation, 11);
  assert.deepEqual(store._rows(), rowsAfterA);
  assert.deepEqual(normalizer.reassembleLegacySnapshot(store._rows()), stateA);
});

test("verification fails stale if another device advances generation after rows are read", async () => {
  const mapped = normalizer.mapLegacySnapshot(fixture);
  const store = fakeAtomicStore(versionedRows(mapped, 2), {
    cutover_stage: "shadow",
    sync_generation: 5,
    metadata: {}
  });
  const controller = shadow.createShadowSyncController({ recordStore: store, normalizer, enabled: true });
  const originalMark = store.markVerified;
  store.markVerified = async (input) => {
    const current = store._manifest();
    const allRows = store._rows();
    const concurrentState = deepClone(fixture);
    concurrentState.selectedAnimalId = "rabbit-patches";
    const concurrentPlan = controller.plan(concurrentState, allRows);
    await store.applyBatch({
      puts: concurrentPlan.puts.map((record) => ({
        ...record,
        expectedVersion: allRows.find((row) => row.record_id === record.record_id)?.record_version
      })),
      tombstones: concurrentPlan.tombstones.map((record) => ({
        ...record,
        expectedVersion: allRows.find((row) => row.record_id === record.record_id)?.record_version
      })),
      manifestPatch: {
        expectedGeneration: current.sync_generation,
        cutoverStage: "shadow",
        metadata: current.metadata || {}
      }
    });
    return originalMark(input);
  };

  await assert.rejects(
    () => controller.verifyAndRecord(fixture),
    (error) => error?.code === "HH_SYNC_VERIFY_STALE" || /HH_SYNC_VERIFY_STALE/.test(error?.message || "")
  );
  assert.equal(store._manifest().sync_generation, 6);
  assert.equal(store._manifest().normalized_verified_at ?? null, null);
});

test("shadow controller contains no legacy full-state mutation path", () => {
  assert.doesNotMatch(source, /herdharbor_user_data/);
  assert.doesNotMatch(source, /app_state/);
  assert.match(source, /applyBatch/);
  assert.match(source, /expectedGeneration/);
  assert.match(source, /markVerified/);
  assert.match(source, /normalized-authoritative/);
});
