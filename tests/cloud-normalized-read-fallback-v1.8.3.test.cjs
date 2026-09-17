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
    payload_checksum: record.payload_checksum,
    record_version: 3,
    deleted_at: null
  }));
}

function verifiedManifest(snapshot = fixture, rows = normalizedRows(snapshot)) {
  const checksum = normalizer.snapshotChecksum(snapshot);
  return {
    cutover_stage: "normalized",
    sync_generation: 9,
    normalized_verified_at: "2026-09-16T05:00:00.000Z",
    metadata: {
      source_checksum: checksum,
      verified_checksum: checksum,
      normalized_record_count: rows.length,
      verification_record_count: rows.length,
      normalized_namespace: normalizer.namespace,
      normalized_format_version: normalizer.formatVersion
    }
  };
}

function setup(overrides = {}) {
  const calls = [];
  const events = [];
  const rows = overrides.rows || normalizedRows();
  const initialManifest = overrides.manifest === undefined ? verifiedManifest(fixture, rows) : overrides.manifest;
  let manifestReadCount = 0;
  const resolver = readFallback.createReadResolver({
    normalizer,
    async getManifest() {
      calls.push("getManifest");
      manifestReadCount += 1;
      if (overrides.manifestError) throw overrides.manifestError;
      if (overrides.finalManifest && manifestReadCount > 1) return deepClone(overrides.finalManifest);
      return deepClone(initialManifest);
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
  return { resolver, calls, events, rows, manifest: initialManifest };
}

test("verified normalized stage reads normalized state and rechecks manifest before return", async () => {
  const state = setup();
  const result = await state.resolver.read();

  assert.equal(result.source, "normalized");
  assert.equal(result.fallback, false);
  assert.equal(result.checksum, normalizer.snapshotChecksum(fixture));
  assert.equal(result.recordCount, state.rows.length);
  assert.equal(result.generation, 9);
  assert.deepEqual(result.snapshot, fixture);
  assert.deepEqual(state.calls, ["getManifest", "listNormalizedRows", "getManifest"]);
  assert.equal(state.events.at(-1).source, "normalized");
});

test("legacy, shadow, and dual-write stages never attempt normalized reads", async () => {
  for (const stage of ["legacy", "shadow", "dual_write"]) {
    const manifest = verifiedManifest();
    manifest.cutover_stage = stage;
    const state = setup({ manifest });
    const result = await state.resolver.read();
    assert.equal(result.source, "legacy");
    assert.equal(result.reason, "normalized-not-authoritative");
    assert.deepEqual(state.calls, ["getManifest", "readLegacySnapshot"]);
  }
});

test("missing required verification markers always uses legacy recovery", async () => {
  const missing = setup({ manifest: null });
  assert.equal((await missing.resolver.read()).reason, "manifest-missing");

  const noVerifiedAt = verifiedManifest();
  noVerifiedAt.normalized_verified_at = null;
  assert.equal((await setup({ manifest: noVerifiedAt }).resolver.read()).reason, "normalized-not-verified");

  const noChecksum = verifiedManifest();
  noChecksum.metadata.verified_checksum = null;
  assert.equal((await setup({ manifest: noChecksum }).resolver.read()).reason, "verification-checksum-missing");

  const sourceMismatch = verifiedManifest();
  sourceMismatch.metadata.source_checksum = "hh64:0000000000000000";
  assert.equal((await setup({ manifest: sourceMismatch }).resolver.read()).reason, "verification-source-mismatch");

  const noCount = verifiedManifest();
  noCount.metadata.verification_record_count = null;
  assert.equal((await setup({ manifest: noCount }).resolver.read()).reason, "verification-record-count-missing");

  const badNamespace = verifiedManifest();
  badNamespace.metadata.normalized_namespace = "other";
  assert.equal((await setup({ manifest: badNamespace }).resolver.read()).reason, "normalized-namespace-mismatch");

  const badFormat = verifiedManifest();
  badFormat.metadata.normalized_format_version = normalizer.formatVersion + 1;
  assert.equal((await setup({ manifest: badFormat }).resolver.read()).reason, "normalized-format-mismatch");
});

test("provider failures on manifest or normalized row reads fall back to legacy without leaking provider messages", async () => {
  const manifestFailure = setup({
    manifestError: Object.assign(new Error("provider secret detail"), {
      name: "ProviderError",
      code: "PGRST500",
      operation: "manifest-read"
    })
  });
  assert.equal((await manifestFailure.resolver.read()).reason, "manifest-read-failed");

  const rowFailure = setup({
    rowError: Object.assign(new Error("row provider private content"), {
      code: "503",
      operation: "normalized-list"
    })
  });
  assert.equal((await rowFailure.resolver.read()).reason, "normalized-row-read-failed");
  assert.doesNotMatch(JSON.stringify([...manifestFailure.events, ...rowFailure.events]), /secret detail|private content/);
});

test("missing or tampered normalized rows never become authoritative", async () => {
  const baseRows = normalizedRows();
  const missingRows = baseRows.slice(1);
  const missing = setup({ rows: missingRows, manifest: verifiedManifest(fixture, baseRows) });
  assert.equal((await missing.resolver.read()).reason, "normalized-reassembly-failed");

  const tamperedRows = normalizedRows();
  const animal = tamperedRows.find((row) => row.payload?.kind === "array_item" && row.payload?.key === "animals");
  animal.payload.value.name = "Tampered Cloud Name";
  const tampered = setup({ rows: tamperedRows, manifest: verifiedManifest(fixture, normalizedRows()) });
  const result = await tampered.resolver.read();
  assert.equal(result.reason, "normalized-reassembly-failed");
  assert.deepEqual(result.snapshot, fixture);
});

test("verification checksum and record-count mismatch each trigger legacy rollback", async () => {
  const rows = normalizedRows();
  const badChecksumManifest = verifiedManifest(fixture, rows);
  badChecksumManifest.metadata.verified_checksum = "hh64:0000000000000000";
  badChecksumManifest.metadata.source_checksum = "hh64:0000000000000000";
  const badChecksum = setup({ rows, manifest: badChecksumManifest });
  assert.equal((await badChecksum.resolver.read()).reason, "normalized-checksum-mismatch");

  const badCountManifest = verifiedManifest(fixture, rows);
  badCountManifest.metadata.verification_record_count = rows.length + 1;
  badCountManifest.metadata.normalized_record_count = rows.length + 1;
  const badCount = setup({ rows, manifest: badCountManifest });
  assert.equal((await badCount.resolver.read()).reason, "normalized-record-count-mismatch");
});

test("concurrent stage or generation change during payload read prevents stale normalized return", async () => {
  const initial = verifiedManifest();
  const rolledBack = deepClone(initial);
  rolledBack.cutover_stage = "dual_write";
  rolledBack.sync_generation += 1;
  const rollbackState = setup({ manifest: initial, finalManifest: rolledBack });
  const rollbackResult = await rollbackState.resolver.read();
  assert.equal(rollbackResult.source, "legacy");
  assert.equal(rollbackResult.reason, "normalized-manifest-changed");

  const generationChanged = deepClone(initial);
  generationChanged.sync_generation += 1;
  const generationState = setup({ manifest: initial, finalManifest: generationChanged });
  assert.equal((await generationState.resolver.read()).reason, "normalized-manifest-changed");
});

test("legacy recovery failure propagates instead of returning corrupt normalized state", async () => {
  const state = setup({
    manifest: null,
    legacyError: Object.assign(new Error("legacy recovery unavailable with Annie payload"), {
      code: "LEGACY_DOWN"
    })
  });

  await assert.rejects(() => state.resolver.read(), /legacy recovery unavailable/);
  const failure = state.events.find((event) => event.type === "normalized-read-failure");
  assert.equal(failure.errorCode, "LEGACY_DOWN");
  assert.doesNotMatch(JSON.stringify(failure), /Annie|payload|unavailable/);
});

test("read fallback module has no mutation or cutover path", () => {
  assert.doesNotMatch(source, /applyBatch\s*\(/);
  assert.doesNotMatch(source, /markVerified\s*\(/);
  assert.doesNotMatch(source, /herdharbor_user_data/);
  assert.doesNotMatch(source, /app_state/);
  assert.match(source, /normalized-manifest-changed/);
  assert.match(source, /normalized-record-count-mismatch/);
});
