"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const api = require(path.join(root, "cloud-record-store-v1.8.3.js"));
const adapterSource = fs.readFileSync(path.join(root, "cloud-record-store-v1.8.3.js"), "utf8");
const schema = fs.readFileSync(
  path.join(root, "supabase", "v1.8.3-cloud-sync-normalized-records.sql"),
  "utf8"
);

test("normalized cloud record store exposes the additive v1.8.3 foundation", () => {
  assert.equal(api.release, "1.8.3");
  assert.equal(api.recordTable, "herdharbor_sync_records");
  assert.equal(api.manifestTable, "herdharbor_sync_manifest");
  assert.equal(api.batchRpc, "herdharbor_sync_apply_batch");
  assert.equal(api.verifyRpc, "herdharbor_sync_mark_verified");
});

test("record namespaces and IDs are bounded and deterministic", () => {
  assert.equal(api.normalizeNamespace("Animals"), "animals");
  assert.equal(api.normalizeNamespace("health-records"), "health-records");
  assert.equal(api.normalizeRecordId("animal-123"), "animal-123");
  assert.throws(() => api.normalizeNamespace("Health Records"), /namespace/);
  assert.throws(() => api.normalizeNamespace("../records"), /namespace/);
  assert.throws(() => api.normalizeRecordId(""), /record_id/);
  assert.throws(() => api.normalizeRecordId("x".repeat(161)), /too long/);
});

test("payload validation requires JSON objects and returns a detached copy", () => {
  const source = { id: "a-1", nested: { value: 3 } };
  const copy = api.normalizePayload(source);
  assert.deepEqual(copy, source);
  assert.notEqual(copy, source);
  assert.notEqual(copy.nested, source.nested);
  assert.throws(() => api.normalizePayload(null), /JSON object/);
  assert.throws(() => api.normalizePayload([]), /JSON object/);
});

test("adapter includes optimistic concurrency, tombstones, and atomic batch RPCs", () => {
  assert.match(adapterSource, /record_version/);
  assert.match(adapterSource, /expectedVersion/);
  assert.match(adapterSource, /HH_SYNC_CONFLICT/);
  assert.match(adapterSource, /deleted_at/);
  assert.match(adapterSource, /tombstone/);
  assert.match(adapterSource, /applyBatch/);
  assert.match(adapterSource, /expectedGeneration/);
  assert.match(adapterSource, /markVerified/);
  assert.match(adapterSource, /HH_SYNC_VERIFY_STALE/);
});

test("atomic batch adapter serializes versions and manifest generation for the RPC", async () => {
  const calls = [];
  const client = {
    from() {
      throw new Error("table path should not be used by this test");
    },
    async rpc(name, args) {
      calls.push([name, args]);
      if (name === api.batchRpc) return { data: { ok: true, generation: 8, puts: 1, tombstones: 1 }, error: null };
      if (name === api.verifyRpc) {
        return {
          data: {
            ok: true,
            generation: 8,
            verified_at: "2026-09-16T04:00:00.000Z",
            checksum: args.p_checksum,
            record_count: args.p_record_count
          },
          error: null
        };
      }
      throw new Error(`unexpected rpc ${name}`);
    }
  };
  const store = api.createRecordStore({ client, userId: "11111111-1111-1111-1111-111111111111" });

  const batch = await store.applyBatch({
    puts: [{
      namespace: "legacy-state",
      record_id: "root:settings",
      payload: { kind: "root_value", value: { theme: "dark" } },
      expectedVersion: 4
    }],
    tombstones: [{
      namespace: "legacy-state",
      record_id: "item:health:old",
      expectedVersion: 9
    }],
    manifestPatch: {
      expectedGeneration: 7,
      schemaVersion: 1,
      cutoverStage: "shadow",
      legacySnapshotUpdatedAt: "2026-09-16T03:59:00.000Z",
      normalizedVerifiedAt: null,
      metadata: { source_checksum: "fnv1a32:12345678" }
    }
  });

  assert.equal(batch.generation, 8);
  const batchCall = calls[0];
  assert.equal(batchCall[0], api.batchRpc);
  assert.equal(batchCall[1].p_manifest_patch.expected_generation, 7);
  assert.equal(batchCall[1].p_manifest_patch.cutover_stage, "shadow");
  assert.equal(batchCall[1].p_puts[0].expected_version, 4);
  assert.equal(batchCall[1].p_tombstones[0].expected_version, 9);

  const verified = await store.markVerified({
    expectedGeneration: 8,
    checksum: "fnv1a32:12345678",
    recordCount: 12
  });
  assert.equal(verified.generation, 8);
  const verifyCall = calls[1];
  assert.equal(verifyCall[0], api.verifyRpc);
  assert.deepEqual(verifyCall[1], {
    p_expected_generation: 8,
    p_checksum: "fnv1a32:12345678",
    p_record_count: 12
  });
});

test("atomic batch adapter requires a generation and maps server conflicts to stable codes", async () => {
  const client = {
    from() {
      return {};
    },
    async rpc() {
      return { data: null, error: { code: "40001", message: "HH_SYNC_CONFLICT" } };
    }
  };
  const store = api.createRecordStore({ client, userId: "11111111-1111-1111-1111-111111111111" });

  await assert.rejects(
    () => store.applyBatch({ puts: [], tombstones: [], manifestPatch: {} }),
    /expectedGeneration/
  );
  await assert.rejects(
    () => store.applyBatch({
      puts: [],
      tombstones: [],
      manifestPatch: { expectedGeneration: 0, cutoverStage: "shadow", metadata: {} }
    }),
    (error) => error?.code === "HH_SYNC_CONFLICT"
  );
});

test("normalized schema is additive and leaves the legacy full-state table untouched", () => {
  assert.match(schema, /create table if not exists public\.herdharbor_sync_records/i);
  assert.match(schema, /create table if not exists public\.herdharbor_sync_manifest/i);
  assert.match(schema, /primary key \(user_id, namespace, record_id\)/i);
  assert.match(schema, /enable row level security/i);
  assert.match(schema, /user_id = auth\.uid\(\)/i);
  assert.match(schema, /record_version := old\.record_version \+ 1/i);
  assert.doesNotMatch(
    schema,
    /(?:drop\s+table|delete\s+from|truncate\s+table|alter\s+table|update)\s+public\.herdharbor_user_data/i
  );
});

test("schema makes a multi-record sync atomic and generation-guards verification", () => {
  assert.match(schema, /herdharbor_sync_apply_batch/i);
  assert.match(schema, /for update/i);
  assert.match(schema, /expected_generation/i);
  assert.match(schema, /sync_generation/i);
  assert.match(schema, /HH_SYNC_CONFLICT/);
  assert.match(schema, /herdharbor_sync_mark_verified/i);
  assert.match(schema, /HH_SYNC_VERIFY_STALE/);
  assert.match(schema, /HH_SYNC_ALREADY_NORMALIZED/);
  assert.match(schema, /normalized_verified_at = case[\s\S]*v_put_count \+ v_tombstone_count > 0 then null/i);
});

test("schema documents a staged cutover instead of an immediate production switch", () => {
  assert.match(schema, /'legacy', 'shadow', 'dual_write', 'normalized'/);
  assert.match(schema, /legacy app_state remains authoritative until cutover/i);
  assert.match(schema, /HH_SYNC_NORMALIZED_REQUIRES_VERIFICATION/);
});
