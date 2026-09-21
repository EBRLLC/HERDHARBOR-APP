"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const normalizer = require(path.join(root, "cloud-state-normalizer-v1.8.3.js"));
const reconciliation = require(path.join(root, "cloud-sync-reconciliation-v1.8.3.js"));
const fixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, "fixtures", "cloud-state-normalization-v1.8.3.json"),
  "utf8"
));

function rows(snapshot = fixture) {
  return normalizer.mapLegacySnapshot(snapshot).records.map((record) => ({
    namespace: record.namespace,
    record_id: record.record_id,
    payload_checksum: record.payload_checksum,
    deleted_at: null
  }));
}

test("matching normalized rows produce zero-error aggregate reconciliation", () => {
  const result = reconciliation.reconcileSnapshot(normalizer, fixture, rows());
  assert.equal(result.recordsDiffering, 0);
  assert.equal(result.missingNormalizedRecords, 0);
  assert.equal(result.unexpectedNormalizedRecords, 0);
  assert.equal(result.recordsMatching, result.recordsCompared);
  assert.equal(result.reconciliationErrorRate, 0);
});

test("reconciliation counts differing, missing, and unexpected records without exposing record content", () => {
  const current = rows();
  current[0] = { ...current[0], payload_checksum: "hh64:badbadbadbadbadb" };
  current.splice(1, 1);
  current.push({
    namespace: normalizer.namespace,
    record_id: "unexpected-record",
    payload_checksum: "hh64:unexpected",
    deleted_at: null
  });

  const result = reconciliation.reconcileSnapshot(normalizer, fixture, current, {
    unresolvedConflicts: 2,
    bootstrapFailures: 1,
    dualWriteFailures: 3,
    normalizedReadFallbackCount: 4
  });

  assert.equal(result.recordsDiffering, 1);
  assert.equal(result.missingNormalizedRecords, 1);
  assert.equal(result.unexpectedNormalizedRecords, 1);
  assert.equal(result.unresolvedConflicts, 2);
  assert.equal(result.bootstrapFailures, 1);
  assert.equal(result.dualWriteFailures, 3);
  assert.equal(result.normalizedReadFallbackCount, 4);
  assert.doesNotMatch(JSON.stringify(result), /Annie|Patches|Waggin Tails/);
});

test("deleted normalized rows count as missing rather than matching", () => {
  const current = rows();
  current[0] = { ...current[0], deleted_at: "2026-09-21T00:00:00.000Z" };
  const result = reconciliation.reconcileSnapshot(normalizer, fixture, current);
  assert.equal(result.missingNormalizedRecords, 1);
});

test("operational counter accumulator accepts only the safe known metrics", () => {
  const metrics = reconciliation.createRolloutMetrics();
  assert.equal(metrics.record("bootstrapFailures"), true);
  assert.equal(metrics.record("dualWriteFailures", 2), true);
  assert.equal(metrics.record("rawFarmState", 9), false);
  assert.deepEqual(metrics.snapshot(), {
    unresolvedConflicts: 0,
    bootstrapFailures: 1,
    dualWriteFailures: 2,
    normalizedReadFallbackCount: 0
  });
  metrics.reset();
  assert.equal(metrics.snapshot().dualWriteFailures, 0);
});
