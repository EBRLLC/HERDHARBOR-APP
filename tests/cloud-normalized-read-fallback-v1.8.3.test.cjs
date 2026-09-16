"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const normalizer = require(path.join(root, "cloud-state-normalizer-v1.8.3.js"));
const readFallback = require(path.join(root, "cloud-normalized-read-fallback-v1.8.3.js"));
const source = fs.readFileSync(path.join(root, "cloud-normalized-read-fallback-v1.8.3.js"), "utf8");
const fixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, "fixtures", "cloud-state-normalization-v1.8.3.json"),
  "utf8"
));

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizedRows(snapshot = fixture) {
  return normalizer.mapLegacySnapshot(snapshot).records.map((record) => ({
    namespace: record.namespace,
    record_id: record.record_id,
    payload: deepClone(record.payload),
    record_version: 3,
    deleted_at: null
  }));
}

function verifiedManifest(snapshot = fixture, rows = normalizedRows(snapshot)) {
  return {
    cutover_stage: "normalized",
    sync_generation: 9,
    normalized_verified_at: "2026-09-16T05:00:00.000Z",
    metadata: {
      verified_checksum: normalizer.snapshotChecksum(snapshot),
      verification_record_count: rows.length
    }
  };
}

function setup(overrides = {}) {
  const calls = [];
  const events = [];
  const rows = overrides.rows || normalizedRows();
  const manifest = overrides.manifest === undefined ? verifiedManifest(fixture, rows) : overrides.manifest;
  const resolver = readFallback.createReadResolver({
    normalizer,
    async getManifest() {
      calls.push("getManifest");
      if (overrides.manifestError) throw overrides.manifestError;
      return deepClone(manifest);
    },
    async listNormalizedRows() {
      calls.push("listNormalizedRows");
      if (overrides.rowError) throw overrides.rowError;
      return deepClone(rows);
    },
    async readLegacySnapshot() {
      calls.push("readLegacySnapshot");
      if (overrides.legacyError) throw overrides.legacyError;
      return deepClone(overrides.legacySnapshot || fixture);
    },
    onEvent(event) {
      events.push(event);
    }
  });
  return { resolver, calls, events, rows, manifest };
}

test("verified normalized stage reads normalized state without touching legacy recovery", async () => {
  const state = setup();
  const result = await state.resolver.read();

  assert.equal(result.source, "normalized");
  assert.equal(result.fallback, false);
  assert.equal(result.checksum, normalizer.snapshotChecksum(fixture));
  assert.equal(result.recordCount, state.rows.length);
  assert.deepEqual(result.snapshot, fixture);
  assert.deepEqual(state.calls, ["getManifest", "listNormalizedRows"]);
  assert.equal(state.events.at(-1).source, "normalized");
});

test("legacy, shadow, and dual-write stages never attempt normalized reads", async () => {
  for (const stage of ["legacy", "shadow", "dual_write"]) {
    const state = setup({
      manifest: {
        cutover_stage: stage,
        normalized_verified_at: "2026-09-16T05:00:00.000Z",
        metadata: { verified_checksum: normalizer.snapshotChecksum(fixture) }
      }
    });
    const result = await state.resolver.read();
    assert.equal(result.source, "legacy");
    assert.equal(result.reason, "normalized-not-authoritative");
    assert.deepEqual(state.calls, ["getManifest", "readLegacySnapshot"]);
  }
});

test("missing manifest or missing verification markers safely use legacy recovery", async () => {
  const missing = setup({ manifest: null });
  assert.equal((await missing.resolver.read()).reason, "manifest-missing");
  assert.deepEqual(missing.calls, ["getManifest", "readLegacySnapshot"]);

  const unverified = setup({
    manifest: { cutover_stage: "normalized", normalized_verified_at: null, metadata: {} }
  });
  assert.equal((await unverified.resolver.read()).reason, "normalized-not-verified");
  assert.deepEqual(unverified.calls, ["getManifest", "readLegacySnapshot"]);

  const noChecksum = setup({
    manifest: {
      cutover_stage: "normalized",
      normalized_verified_at: "2026-09-16T05:00:00.000Z",
      metadata: {}
    }
  });
  assert.equal((await noChecksum.resolver.read()).reason, "verification-checksum-missing");
  assert.deepEqual(noChecksum.calls, ["getManifest", "readLegacySnapshot"]);
});

test("provider failures on manifest or normalized row reads fall back to legacy", async () => {
  const manifestFailure = setup({
    manifestError: Object.assign(new Error("provider secret detail"), {
      name: "ProviderError",
      code: "PGRST500",
      operation: "manifest-read"
    })
  });
  const manifestResult = await manifestFailure.resolver.read();
  assert.equal(manifestResult.source, "legacy");
  assert.equal(manifestResult.reason, "manifest-read-failed");
  assert.deepEqual(manifestFailure.calls, ["getManifest", "readLegacySnapshot"]);

  const rowFailure = setup({
    rowError: Object.assign(new Error("row provider private content"), {
      code: "503",
      operation: "normalized-list"
    })
  });
  const rowResult = await rowFailure.resolver.read();
  assert.equal(rowResult.source, "legacy");
  assert.equal(rowResult.reason, "normalized-row-read-failed");
  assert.deepEqual(rowFailure.calls, ["getManifest", "listNormalizedRows", "readLegacySnapshot"]);

  assert.doesNotMatch(JSON.stringify([...manifestFailure.events, ...rowFailure.events]), /secret detail|private content/);
});

test("missing or tampered normalized rows never become authoritative", async () => {
  const baseRows = normalizedRows();
  const missingRows = baseRows.slice(1);
  const missing = setup({
    rows: missingRows,
    manifest: verifiedManifest(fixture, baseRows)
  });
  const missingResult = await missing.resolver.read();
  assert.equal(missingResult.source, "legacy");
  assert.equal(missingResult.reason, "normalized-reassembly-failed");

  const tamperedRows = normalizedRows();
  const animal = tamperedRows.find((row) => row.payload?.kind === "array_item" && row.payload?.key === "animals");
  animal.payload.value.name = "Tampered Cloud Name";
  const tampered = setup({
    rows: tamperedRows,
    manifest: verifiedManifest(fixture, normalizedRows())
  });
  const tamperedResult = await tampered.resolver.read();
  assert.equal(tamperedResult.source, "legacy");
  assert.equal(tamperedResult.reason, "normalized-reassembly-failed");
  assert.deepEqual(tamperedResult.snapshot, fixture);
});

test("verification checksum and record-count mismatch each trigger legacy rollback", async () => {
  const rows = normalizedRows();
  const badChecksum = setup({
    rows,
    manifest: {
      cutover_stage: "normalized",
      normalized_verified_at: "2026-09-16T05:00:00.000Z",
      metadata: {
        verified_checksum: "fnv1a32:00000000",
        verification_record_count: rows.length
      }
    }
  });
  const checksumResult = await badChecksum.resolver.read();
  assert.equal(checksumResult.source, "legacy");
  assert.equal(checksumResult.reason, "normalized-checksum-mismatch");

  const badCount = setup({
    rows,
    manifest: {
      ...verifiedManifest(fixture, rows),
      metadata: {
        ...verifiedManifest(fixture, rows).metadata,
        verification_record_count: rows.length + 1
      }
    }
  });
  const countResult = await badCount.resolver.read();
  assert.equal(countResult.source, "legacy");
  assert.equal(countResult.reason, "normalized-record-count-mismatch");
});

test("legacy recovery failure propagates instead of returning corrupt normalized state", async () => {
  const state = setup({
    manifest: null,
    legacyError: Object.assign(new Error("legacy recovery unavailable with Annie payload"), {
      code: "LEGACY_DOWN"
    })
  });

  await assert.rejects(() => state.resolver.read(), /legacy recovery unavailable/);
  assert.deepEqual(state.calls, ["getManifest", "readLegacySnapshot"]);
  const failure = state.events.find((event) => event.type === "normalized-read-failure");
  assert.equal(failure.errorCode, "LEGACY_DOWN");
  assert.doesNotMatch(JSON.stringify(failure), /Annie|payload|unavailable/);
});

test("read fallback module has no mutation or cutover path", () => {
  assert.doesNotMatch(source, /\.put\s*\(/);
  assert.doesNotMatch(source, /\.tombstone\s*\(/);
  assert.doesNotMatch(source, /applyBatch\s*\(/);
  assert.doesNotMatch(source, /markVerified\s*\(/);
  assert.doesNotMatch(source, /herdharbor_user_data/);
  assert.doesNotMatch(source, /app_state/);
  assert.match(source, /normalized-checksum-mismatch/);
  assert.match(source, /normalized-record-count-mismatch/);
});
