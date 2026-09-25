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

function authorityManifest(overrides = {}) {
  return {
    cutover_stage: "normalized",
    sync_generation: 9,
    normalized_verified_at: null,
    metadata: {
      normalized_namespace: normalizer.namespace,
      normalized_format_version: normalizer.formatVersion,
      normalized_writer_ready: true,
      normalized_writer_version: "record-cas-v1",
      normalized_authority_ready: true,
      normalized_authority_version: "record-authority-v1",
      ...deepClone(overrides.metadata || {})
    },
    ...deepClone(Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== "metadata")))
  };
}

function setup(overrides = {}) {
  const calls = [];
  const events = [];
  const rows = overrides.rows || normalizedRows();
  const initialManifest = overrides.manifest === undefined ? authorityManifest() : overrides.manifest;
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

test("normalized authority reads row-integrity state and rechecks manifest before return", async () => {
  const state = setup();
  const result = await state.resolver.read();

  assert.equal(result.source, "normalized");
  assert.equal(result.fallback, false);
  assert.equal(result.checksum, normalizer.snapshotChecksum(fixture));
  assert.equal(result.recordCount, state.rows.length);
  assert.equal(result.generation, 9);
  assert.equal(result.authorityVersion, "record-authority-v1");
  assert.equal(result.checkpointStale, false);
  assert.deepEqual(result.snapshot, fixture);
  assert.deepEqual(state.calls, ["getManifest", "listNormalizedRows", "getManifest"]);
  assert.equal(state.events.at(-1).source, "normalized");
});

test("ordinary record CAS remains readable when the global checkpoint checksum is stale", async () => {
  const rows = normalizedRows();
  const animal = rows.find((row) => row.payload?.kind === "array_item" && row.payload?.key === "animals");
  animal.payload.value.name = "Post-cutover Edit";
  animal.payload_checksum = normalizer.checksumValue(animal.payload);
  animal.record_version += 1;

  const state = setup({ rows });
  const result = await state.resolver.read();

  assert.equal(result.source, "normalized");
  assert.equal(result.checkpointStale, true);
  assert.equal(result.snapshot.animals.some((entry) => entry.name === "Post-cutover Edit"), true);
  assert.deepEqual(state.calls, ["getManifest", "listNormalizedRows", "getManifest"]);
});

test("legacy, shadow, and dual-write stages never attempt normalized authority reads", async () => {
  for (const stage of ["legacy", "shadow", "dual_write"]) {
    const manifest = authorityManifest({ cutover_stage: stage });
    const state = setup({ manifest });
    const result = await state.resolver.read();
    assert.equal(result.source, "legacy");
    assert.equal(result.reason, "normalized-not-authoritative");
    assert.deepEqual(state.calls, ["getManifest", "readLegacySnapshot"]);
  }
});

test("normalized stage requires explicit authority, writer, namespace and format markers", async () => {
  const cases = [
    ["normalized-authority-marker-missing", { normalized_authority_ready: false }],
    ["normalized-authority-version-missing", { normalized_authority_version: null }],
    ["normalized-writer-not-ready", { normalized_writer_ready: false }],
    ["normalized-writer-not-ready", { normalized_writer_version: null }],
    ["normalized-namespace-mismatch", { normalized_namespace: "other" }],
    ["normalized-format-mismatch", { normalized_format_version: normalizer.formatVersion + 1 }]
  ];

  for (const [reason, metadata] of cases) {
    const state = setup({ manifest: authorityManifest({ metadata }) });
    const result = await state.resolver.read();
    assert.equal(result.source, "legacy");
    assert.equal(result.reason, reason);
  }
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

test("tampered, orphaned, or incomplete normalized rows never become authoritative", async () => {
  const missingRows = normalizedRows();
  const missingItem = missingRows.find((row) => row.payload?.kind === "array_item" && row.payload?.key === "animals");
  const missing = setup({ rows: missingRows.filter((row) => row.record_id !== missingItem.record_id) });
  assert.equal((await missing.resolver.read()).reason, "normalized-reassembly-failed");

  const tamperedRows = normalizedRows();
  const animal = tamperedRows.find((row) => row.payload?.kind === "array_item" && row.payload?.key === "animals");
  animal.payload.value.name = "Tampered Cloud Name";
  const tampered = setup({ rows: tamperedRows });
  const result = await tampered.resolver.read();
  assert.equal(result.reason, "normalized-reassembly-failed");
  assert.deepEqual(result.snapshot, fixture);

  const orphanRows = normalizedRows();
  const orphan = orphanRows.find((row) => row.payload?.kind === "array_item" && row.payload?.key === "animals");
  const manifest = orphanRows.find((row) => row.payload?.kind === "array_manifest" && row.payload?.key === "animals");
  manifest.payload.item_record_ids = manifest.payload.item_record_ids.filter((id) => id !== orphan.record_id);
  manifest.payload.length = manifest.payload.item_record_ids.length;
  manifest.payload_checksum = normalizer.checksumValue(manifest.payload);
  assert.equal((await setup({ rows: orphanRows }).resolver.read()).reason, "normalized-reassembly-failed");
});

test("concurrent stage, generation, or authority-marker change prevents stale normalized return", async () => {
  const initial = authorityManifest();

  const rolledBack = deepClone(initial);
  rolledBack.cutover_stage = "dual_write";
  rolledBack.sync_generation += 1;
  assert.equal((await setup({ manifest: initial, finalManifest: rolledBack }).resolver.read()).reason, "normalized-manifest-changed");

  const generationChanged = deepClone(initial);
  generationChanged.sync_generation += 1;
  assert.equal((await setup({ manifest: initial, finalManifest: generationChanged }).resolver.read()).reason, "normalized-manifest-changed");

  const authorityChanged = deepClone(initial);
  authorityChanged.metadata.normalized_authority_ready = false;
  assert.equal((await setup({ manifest: initial, finalManifest: authorityChanged }).resolver.read()).reason, "normalized-manifest-changed");
});

test("legacy recovery failure propagates instead of returning corrupt normalized state", async () => {
  const state = setup({
    manifest: authorityManifest({ metadata: { normalized_authority_ready: false } }),
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
  assert.match(source, /normalized-authority-marker-missing/);
  assert.match(source, /reassembleAuthoritativeSnapshotWithMetadata/);
});
