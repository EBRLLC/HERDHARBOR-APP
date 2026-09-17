"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const policy = require(path.join(root, "cloud-sync-stage-policy-v1.8.3.js"));
const sql = fs.readFileSync(
  path.join(root, "supabase", "v1.8.3-cloud-sync-normalized-records.sql"),
  "utf8"
);

function manifest(stage, verified = false, writerReady = false) {
  return {
    cutover_stage: stage,
    sync_generation: 12,
    normalized_verified_at: verified ? "2026-09-16T07:00:00.000Z" : null,
    metadata: {
      source_checksum: "hh64:1234567890abcdef",
      verified_checksum: verified ? "hh64:1234567890abcdef" : null,
      normalized_record_count: 24,
      verification_record_count: verified ? 24 : null,
      normalized_namespace: "legacy-state",
      normalized_format_version: 2,
      normalized_writer_ready: writerReady,
      normalized_writer_version: writerReady ? "writer-v1" : null
    }
  };
}

test("stage policy allows only adjacent promotion and rollback transitions", () => {
  const allowed = [
    ["legacy", "shadow", false, false],
    ["shadow", "legacy", false, false],
    ["shadow", "dual_write", true, false],
    ["dual_write", "shadow", false, false],
    ["dual_write", "normalized", true, true],
    ["normalized", "dual_write", false, false]
  ];

  for (const [from, to, verified, writerReady] of allowed) {
    const decision = policy.evaluateTransition(manifest(from, verified, writerReady), to);
    assert.equal(decision.allowed, true, `${from} -> ${to}`);
  }

  for (const [from, to] of [
    ["legacy", "dual_write"],
    ["legacy", "normalized"],
    ["shadow", "normalized"],
    ["dual_write", "legacy"],
    ["normalized", "shadow"],
    ["normalized", "legacy"]
  ]) {
    const decision = policy.evaluateTransition(manifest(from, true, true), to);
    assert.equal(decision.allowed, false, `${from} -> ${to}`);
    assert.equal(decision.reason, "invalid-stage-transition");
  }
});

test("promotions require checksum, count, namespace, format, generation, and verification markers", () => {
  for (const [from, to] of [["shadow", "dual_write"], ["dual_write", "normalized"]]) {
    const writerReady = to === "normalized";
    assert.equal(policy.evaluateTransition(manifest(from, false, writerReady), to).allowed, false);

    const staleChecksum = manifest(from, true, writerReady);
    staleChecksum.metadata.verified_checksum = "hh64:ffffffffffffffff";
    assert.equal(policy.evaluateTransition(staleChecksum, to).allowed, false);

    const staleCount = manifest(from, true, writerReady);
    staleCount.metadata.verification_record_count += 1;
    assert.equal(policy.evaluateTransition(staleCount, to).allowed, false);

    const missingGeneration = manifest(from, true, writerReady);
    delete missingGeneration.sync_generation;
    assert.equal(policy.evaluateTransition(missingGeneration, to).allowed, false);

    const missingNamespace = manifest(from, true, writerReady);
    missingNamespace.metadata.normalized_namespace = "";
    assert.equal(policy.evaluateTransition(missingNamespace, to).allowed, false);

    const current = policy.evaluateTransition(manifest(from, true, writerReady), to);
    assert.equal(current.allowed, true);
    assert.equal(current.requiresVerification, true);
  }
});

test("normalized promotion additionally requires a prepared writer", () => {
  const missing = policy.evaluateTransition(manifest("dual_write", true, false), "normalized");
  assert.equal(missing.allowed, false);
  assert.equal(missing.reason, "normalized-writer-required");
  assert.equal(missing.requiresWriter, true);

  const current = policy.evaluateTransition(manifest("dual_write", true, true), "normalized");
  assert.equal(current.allowed, true);
  assert.equal(current.requiresWriter, true);
});

test("rollback target moves exactly one stage toward legacy", () => {
  assert.equal(policy.rollbackTarget(manifest("normalized")), "dual_write");
  assert.equal(policy.rollbackTarget(manifest("dual_write")), "shadow");
  assert.equal(policy.rollbackTarget(manifest("shadow")), "legacy");
  assert.equal(policy.rollbackTarget(manifest("legacy")), null);
});

test("assertTransition returns legal decisions and stable errors", () => {
  assert.equal(policy.assertTransition(manifest("legacy"), "shadow").allowed, true);
  assert.throws(
    () => policy.assertTransition(manifest("shadow", false), "dual_write"),
    (error) => error?.code === "HH_SYNC_STAGE_VERIFICATION_REQUIRED"
  );
  assert.throws(
    () => policy.assertTransition(manifest("dual_write", true, false), "normalized"),
    (error) => error?.code === "HH_SYNC_NORMALIZED_WRITER_REQUIRED"
  );
  assert.throws(
    () => policy.assertTransition(manifest("legacy", true), "normalized"),
    (error) => error?.code === "HH_SYNC_INVALID_STAGE_TRANSITION"
  );
  assert.throws(
    () => policy.assertTransition(manifest("legacy"), "other"),
    (error) => error?.code === "HH_SYNC_INVALID_STAGE"
  );
});

test("base migration itself mirrors the adjacent transition graph", () => {
  assert.match(sql, /old\.cutover_stage = 'legacy' and new\.cutover_stage = 'shadow'/i);
  assert.match(sql, /old\.cutover_stage = 'shadow' and new\.cutover_stage = 'legacy'/i);
  assert.match(sql, /old\.cutover_stage = 'shadow' and new\.cutover_stage = 'dual_write'/i);
  assert.match(sql, /old\.cutover_stage = 'dual_write' and new\.cutover_stage = 'shadow'/i);
  assert.match(sql, /old\.cutover_stage = 'dual_write' and new\.cutover_stage = 'normalized'/i);
  assert.match(sql, /old\.cutover_stage = 'normalized' and new\.cutover_stage = 'dual_write'/i);
  assert.match(sql, /HH_SYNC_INVALID_STAGE_TRANSITION/);
});

test("stage transition RPC increments generation so stale devices cannot silently roll back a promotion", () => {
  assert.match(sql, /herdharbor_sync_set_stage/i);
  assert.match(sql, /p_expected_generation/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /v_generation <> p_expected_generation/i);
  assert.match(sql, /sync_generation = sync_generation \+ 1/i);
  assert.match(sql, /HH_SYNC_CONFLICT/);
});

test("data batches cannot perform arbitrary promotion or rollback stage changes", () => {
  assert.match(sql, /v_current_stage = 'legacy' and v_requested_stage = 'shadow'/i);
  assert.match(sql, /HH_SYNC_STAGE_CHANGE_REQUIRES_RPC/);
});

test("verification recording requires source checksum and actual record count", () => {
  assert.match(sql, /herdharbor_sync_mark_verified/i);
  assert.match(sql, /metadata ->> 'source_checksum'[^\n]*= p_checksum/i);
  assert.match(sql, /metadata ->> 'normalized_record_count'/i);
  assert.match(sql, /select count\(\*\)::integer/i);
  assert.match(sql, /HH_SYNC_RECORD_COUNT_MISMATCH/);
  assert.match(sql, /HH_SYNC_VERIFY_STALE/);
});

test("migration never mutates the legacy full-state table", () => {
  assert.doesNotMatch(sql, /\b(?:insert\s+into|update|delete\s+from|alter\s+table|drop\s+table|truncate\s+table)\s+public\.herdharbor_user_data\b/i);
  assert.match(sql.replace(/^--\s?/gm, ""), /never\s+reads, alters, copies, or deletes public\.herdharbor_user_data/i);
});
