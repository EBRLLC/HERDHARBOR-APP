"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const api = require(path.join(root, "cloud-state-normalizer-v1.8.3.js"));
const fixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, "fixtures", "cloud-state-normalization-v1.8.3.json"),
  "utf8"
));

function rowsFrom(mapped) {
  return mapped.records.map((record) => ({
    namespace: record.namespace,
    record_id: record.record_id,
    payload: record.payload,
    deleted_at: null
  }));
}

test("legacy snapshot mapper is deterministic and round-trips the representative fixture", () => {
  const first = api.mapLegacySnapshot(fixture);
  const second = api.mapLegacySnapshot(JSON.parse(JSON.stringify(fixture)));

  assert.equal(first.namespace, "legacy-state");
  assert.equal(first.formatVersion, 1);
  assert.equal(first.checksum, second.checksum);
  assert.deepEqual(first.records, second.records);
  assert.deepEqual(api.reassembleLegacySnapshot(rowsFrom(first)), fixture);
});

test("top-level object key insertion order does not change normalized output", () => {
  const reversed = {};
  for (const key of Object.keys(fixture).reverse()) reversed[key] = fixture[key];

  const normal = api.mapLegacySnapshot(fixture);
  const reordered = api.mapLegacySnapshot(reversed);

  assert.equal(normal.checksum, reordered.checksum);
  assert.deepEqual(normal.records, reordered.records);
});

test("array items with stable IDs keep stable record IDs while manifest order preserves legacy order", () => {
  const forward = api.mapLegacySnapshot({ animals: fixture.animals });
  const reversed = api.mapLegacySnapshot({ animals: [...fixture.animals].reverse() });

  const forwardItems = forward.records
    .filter((record) => record.payload.kind === "array_item")
    .map((record) => record.record_id)
    .sort();
  const reversedItems = reversed.records
    .filter((record) => record.payload.kind === "array_item")
    .map((record) => record.record_id)
    .sort();

  assert.deepEqual(forwardItems, reversedItems);
  assert.deepEqual(
    api.reassembleLegacySnapshot(rowsFrom(reversed)).animals,
    [...fixture.animals].reverse()
  );
});

test("empty arrays, primitive arrays, and nested objects survive the round trip", () => {
  const source = {
    empty: [],
    cards: ["animals", "health", null, 4, true],
    nested: { b: 2, a: { values: [3, 2, 1] } }
  };
  const mapped = api.mapLegacySnapshot(source);
  assert.deepEqual(api.reassembleLegacySnapshot(rowsFrom(mapped)), source);
});

test("normalized record IDs remain bounded for unusually long legacy keys and identities", () => {
  const longKey = `legacy-${"x".repeat(500)}`;
  const source = { [longKey]: [{ id: `animal-${"y".repeat(600)}`, name: "Long ID" }] };
  const mapped = api.mapLegacySnapshot(source);

  for (const record of mapped.records) {
    assert.ok(record.record_id.length <= 160, record.record_id);
  }
  assert.deepEqual(api.reassembleLegacySnapshot(rowsFrom(mapped)), source);
});

test("reassembler rejects missing or tampered normalized records", () => {
  const mapped = api.mapLegacySnapshot(fixture);
  const rows = rowsFrom(mapped);
  const missing = rows.filter((row) => row.record_id !== mapped.records.find((record) => record.payload.kind === "array_item").record_id);
  assert.throws(() => api.reassembleLegacySnapshot(missing), /missing/i);

  const tampered = rows.map((row) => ({ ...row, payload: JSON.parse(JSON.stringify(row.payload)) }));
  const animal = tampered.find((row) => row.payload.kind === "array_item" && row.payload.key === "animals");
  animal.payload.value.name = "Tampered";
  assert.throws(
    () => api.reassembleLegacySnapshot(tampered),
    (error) => error?.code === "HH_NORMALIZED_CHECKSUM_MISMATCH"
  );
});

test("diff plans only changed puts and tombstones removed normalized rows", () => {
  const before = api.mapLegacySnapshot(fixture);
  const changedFixture = JSON.parse(JSON.stringify(fixture));
  changedFixture.animals[0].name = "Annie Updated";
  changedFixture.healthRecords = [];
  const after = api.mapLegacySnapshot(changedFixture);

  const diff = api.diffNormalizedRecords(rowsFrom(before), after.records);
  assert.ok(diff.puts.some((row) => row.payload.kind === "array_item" && row.payload.key === "animals"));
  assert.ok(diff.puts.some((row) => row.record_id === api.snapshotManifestId));
  assert.ok(diff.tombstones.some((row) => row.record_id.startsWith("item:healthrecords-")));
  assert.ok(diff.puts.length < after.records.length);
});
