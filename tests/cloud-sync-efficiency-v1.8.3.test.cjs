"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const root = path.resolve(__dirname, "..");
const normalizer = require(path.join(root, "cloud-state-normalizer-v1.8.3.js"));
const shadow = require(path.join(root, "cloud-shadow-sync-v1.8.3.js"));
const fixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, "fixtures", "cloud-state-normalization-v1.8.3.json"),
  "utf8"
));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function headers(mapped, version = 4) {
  return mapped.records.map((record) => ({
    namespace: record.namespace,
    record_id: record.record_id,
    payload_checksum: record.payload_checksum,
    record_version: version,
    deleted_at: null
  }));
}

function migrationMetadata(mapped) {
  return {
    source_checksum: mapped.checksum,
    normalized_record_count: mapped.records.length,
    normalized_namespace: normalizer.namespace,
    normalized_format_version: normalizer.formatVersion
  };
}

test("incremental shadow sync downloads headers only and uploads only changed records", async () => {
  const before = normalizer.mapLegacySnapshot(fixture);
  const changed = clone(fixture);
  changed.animals[0].name = "Header Only Change";
  const calls = [];
  let batchInput;
  const store = {
    async getManifest() {
      calls.push("manifest");
      return { cutover_stage: "shadow", sync_generation: 7, metadata: migrationMetadata(before) };
    },
    async listHeaders() {
      calls.push("headers");
      return headers(before);
    },
    async list() {
      calls.push("payloads");
      throw new Error("incremental sync must not download full payload rows");
    },
    async applyBatch(input) {
      calls.push("batch");
      batchInput = input;
      return { ok: true, generation: 8, puts: input.puts.length, tombstones: input.tombstones.length };
    },
    async markVerified() {
      throw new Error("verification is not part of incremental sync");
    }
  };
  const controller = shadow.createShadowSyncController({ recordStore: store, normalizer, enabled: true });
  const result = await controller.sync(changed);

  assert.equal(result.skipped, false);
  assert.deepEqual(calls, ["manifest", "headers", "batch"]);
  assert.ok(batchInput.puts.length < before.records.length);
  assert.ok(batchInput.puts.every((record) => /^hh64:[0-9a-f]{16}$/.test(record.payload_checksum)));
});

test("unchanged snapshot skips even the header query after a committed atomic batch", async () => {
  const mapped = normalizer.mapLegacySnapshot(fixture);
  const calls = [];
  const store = {
    async getManifest() {
      calls.push("manifest");
      return {
        cutover_stage: "dual_write",
        sync_generation: 12,
        normalized_verified_at: "2026-09-16T08:00:00.000Z",
        metadata: {
          ...migrationMetadata(mapped),
          verified_checksum: mapped.checksum,
          verification_record_count: mapped.records.length
        }
      };
    },
    async listHeaders() { throw new Error("headers should be skipped"); },
    async list() { throw new Error("payloads should be skipped"); },
    async applyBatch() { throw new Error("batch should be skipped"); },
    async markVerified() { throw new Error("verification should be skipped"); }
  };
  const controller = shadow.createShadowSyncController({ recordStore: store, normalizer, enabled: true });
  const result = await controller.sync(fixture);

  assert.equal(result.skipped, true);
  assert.equal(result.reason, "already-current");
  assert.equal(result.verified, true);
  assert.deepEqual(calls, ["manifest"]);
});

test("same checksum/count from an older mapper format cannot incorrectly skip migration work", async () => {
  const mapped = normalizer.mapLegacySnapshot(fixture);
  const calls = [];
  let batchInput;
  const staleMetadata = migrationMetadata(mapped);
  staleMetadata.normalized_format_version = normalizer.formatVersion - 1;
  const store = {
    async getManifest() {
      calls.push("manifest");
      return { cutover_stage: "shadow", sync_generation: 4, metadata: staleMetadata };
    },
    async listHeaders() {
      calls.push("headers");
      return headers(mapped, 4);
    },
    async list() { throw new Error("payload rows should not be needed"); },
    async applyBatch(input) {
      calls.push("batch");
      batchInput = input;
      return { ok: true, generation: 4, puts: input.puts.length, tombstones: input.tombstones.length };
    },
    async markVerified() { throw new Error("verification is separate"); }
  };
  const controller = shadow.createShadowSyncController({ recordStore: store, normalizer, enabled: true });
  const result = await controller.sync(fixture);

  assert.equal(result.skipped, false);
  assert.deepEqual(calls, ["manifest", "headers", "batch"]);
  assert.equal(batchInput.puts.length, 0);
  assert.equal(batchInput.tombstones.length, 0);
  assert.equal(batchInput.manifestPatch.metadata.normalized_format_version, normalizer.formatVersion);
});

test("reordering identified animals changes only array and snapshot manifests", async () => {
  const before = normalizer.mapLegacySnapshot({ animals: fixture.animals });
  const afterState = { animals: [...fixture.animals].reverse() };
  let batchInput;
  const store = {
    async getManifest() {
      return { cutover_stage: "shadow", sync_generation: 2, metadata: migrationMetadata(before) };
    },
    async listHeaders() { return headers(before, 2); },
    async list() { throw new Error("payload rows are unnecessary for diffing"); },
    async applyBatch(input) {
      batchInput = input;
      return { ok: true, generation: 3 };
    },
    async markVerified() { throw new Error("not expected"); }
  };
  const controller = shadow.createShadowSyncController({ recordStore: store, normalizer, enabled: true });
  await controller.sync(afterState);

  assert.equal(batchInput.tombstones.length, 0);
  assert.equal(batchInput.puts.length, 2);
  assert.equal(batchInput.puts.some((record) => record.payload.kind === "array_item"), false);
  assert.deepEqual(
    batchInput.puts.map((record) => record.payload.kind).sort(),
    ["array_manifest", "snapshot_manifest"]
  );
});
