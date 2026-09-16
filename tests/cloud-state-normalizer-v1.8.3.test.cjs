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

function rowsFrom(mapped, version = 1) {
  return mapped.records.map((record) => ({
    namespace: record.namespace,
    record_id: record.record_id,
    payload: record.payload,
    payload_checksum: record.payload_checksum,
    record_version: version,
    deleted_at: null
  }));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("legacy snapshot mapper is deterministic and round-trips the representative fixture", () => {
  const first = api.mapLegacySnapshot(fixture);
  const second = api.mapLegacySnapshot(clone(fixture));

  assert.equal(first.namespace, "legacy-state");
  assert.equal(first.formatVersion, 2);
  assert.match(first.checksum, /^hh64:[0-9a-f]{16}$/);
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

test("array reorder changes only ordering manifests, not stable identified item rows", () => {
  const forward = api.mapLegacySnapshot({ animals: fixture.animals });
  const reversed = api.mapLegacySnapshot({ animals: [...fixture.animals].reverse() });

  const forwardItems = forward.records
    .filter((record) => record.payload.kind === "array_item")
    .map((record) => [record.record_id, record.payload_checksum])
    .sort();
  const reversedItems = reversed.records
    .filter((record) => record.payload.kind === "array_item")
    .map((record) => [record.record_id, record.payload_checksum])
    .sort();

  assert.deepEqual(forwardItems, reversedItems);
  assert.deepEqual(
    api.reassembleLegacySnapshot(rowsFrom(reversed)).animals,
    [...fixture.animals].reverse()
  );

  const diff = api.diffNormalizedRecords(rowsFrom(forward), reversed.records);
  assert.equal(diff.tombstones.length, 0);
  assert.equal(diff.puts.some((record) => record.payload.kind === "array_item"), false);
  assert.deepEqual(
    diff.puts.map((record) => record.payload.kind).sort(),
    ["array_manifest", "snapshot_manifest"]
  );
});

test("identity-less primitive and object items remain stable across insertions and reorder", () => {
  const before = api.mapLegacySnapshot({ values: ["a", "b", { name: "x" }, 4, null] });
  const after = api.mapLegacySnapshot({ values: [null, "a", { name: "x" }, "b", 4, "new"] });
  const beforeItems = new Map(before.records
    .filter((record) => record.payload.kind === "array_item")
    .map((record) => [JSON.stringify(record.payload.value), record.record_id]));
  const afterItems = new Map(after.records
    .filter((record) => record.payload.kind === "array_item")
    .map((record) => [JSON.stringify(record.payload.value), record.record_id]));

  for (const [value, id] of beforeItems) assert.equal(afterItems.get(value), id, value);
  const diff = api.diffNormalizedRecords(rowsFrom(before), after.records);
  assert.equal(diff.tombstones.length, 0);
  assert.equal(diff.puts.filter((record) => record.payload.kind === "array_item").length, 1);
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
    assert.match(record.payload_checksum, /^hh64:[0-9a-f]{16}$/);
  }
  assert.deepEqual(api.reassembleLegacySnapshot(rowsFrom(mapped)), source);
});

test("reassembler rejects missing, duplicate, malformed, or tampered normalized records", () => {
  const mapped = api.mapLegacySnapshot(fixture);
  const rows = rowsFrom(mapped);
  const missing = rows.filter((row) => row.record_id !== mapped.records.find((record) => record.payload.kind === "array_item").record_id);
  assert.throws(() => api.reassembleLegacySnapshot(missing), /missing/i);

  const duplicated = [...rows, clone(rows[0])];
  assert.throws(
    () => api.reassembleLegacySnapshot(duplicated),
    (error) => error?.code === "HH_NORMALIZED_DUPLICATE_RECORD"
  );

  const badManifest = clone(rows);
  badManifest.find((row) => row.record_id === api.snapshotManifestId).payload.entry_count += 1;
  assert.throws(() => api.reassembleLegacySnapshot(badManifest), /entry count/i);

  const tampered = clone(rows);
  const animal = tampered.find((row) => row.payload.kind === "array_item" && row.payload.key === "animals");
  animal.payload.value.name = "Tampered";
  assert.throws(
    () => api.reassembleLegacySnapshot(tampered),
    (error) => error?.code === "HH_NORMALIZED_CHECKSUM_MISMATCH"
  );
});

test("diff uses lightweight payload checksums and plans only changed records", () => {
  const before = api.mapLegacySnapshot(fixture);
  const changedFixture = clone(fixture);
  changedFixture.animals[0].name = "Annie Updated";
  changedFixture.healthRecords = [];
  const after = api.mapLegacySnapshot(changedFixture);

  const headers = rowsFrom(before).map(({ payload, ...header }) => header);
  const diff = api.diffNormalizedRecords(headers, after.records);
  assert.ok(diff.puts.some((row) => row.payload.kind === "array_item" && row.payload.key === "animals"));
  assert.ok(diff.puts.some((row) => row.record_id === api.snapshotManifestId));
  assert.ok(diff.tombstones.some((row) => row.record_id.startsWith("item:healthrecords-")));
  assert.ok(diff.puts.length < after.records.length);
});

test("deterministic generated JSON states round-trip without loss", () => {
  let seed = 0x12345678;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const primitive = () => {
    const choice = Math.floor(random() * 5);
    if (choice === 0) return null;
    if (choice === 1) return random() > 0.5;
    if (choice === 2) return Math.floor(random() * 100000) - 50000;
    if (choice === 3) return `s-${Math.floor(random() * 100000)}`;
    return Number((random() * 1000).toFixed(4));
  };
  const value = (depth) => {
    if (depth <= 0 || random() < 0.45) return primitive();
    if (random() < 0.5) return Array.from({ length: Math.floor(random() * 6) }, () => value(depth - 1));
    const result = {};
    for (let index = 0; index < Math.floor(random() * 6); index += 1) {
      result[`k${index}_${Math.floor(random() * 100)}`] = value(depth - 1);
    }
    return result;
  };

  for (let caseIndex = 0; caseIndex < 200; caseIndex += 1) {
    const state = {};
    for (let index = 0; index < 1 + Math.floor(random() * 10); index += 1) {
      state[`section_${index}_${Math.floor(random() * 1000)}`] = value(3);
    }
    const mapped = api.mapLegacySnapshot(state);
    assert.deepEqual(api.reassembleLegacySnapshot(rowsFrom(mapped)), clone(state), `case ${caseIndex}`);
  }
});
