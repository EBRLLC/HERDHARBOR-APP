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

test("adapter includes optimistic concurrency and tombstone support", () => {
  assert.match(adapterSource, /record_version/);
  assert.match(adapterSource, /expectedVersion/);
  assert.match(adapterSource, /HH_SYNC_CONFLICT/);
  assert.match(adapterSource, /deleted_at/);
  assert.match(adapterSource, /tombstone/);
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

test("schema documents a staged cutover instead of an immediate production switch", () => {
  assert.match(schema, /'legacy', 'shadow', 'dual_write', 'normalized'/);
  assert.match(schema, /legacy app_state remains authoritative until cutover/i);
});
