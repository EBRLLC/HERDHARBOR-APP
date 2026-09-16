"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const policy = require(path.join(root, "cloud-sync-stage-policy-v1.8.3.js"));
const sql = fs.readFileSync(
  path.join(root, "supabase", "v1.8.3-cloud-sync-stage-guards.sql"),
  "utf8"
);

function manifest(stage, verified = false) {
  return {
    cutover_stage: stage,
    sync_generation: 12,
    normalized_verified_at: verified ? "2026-09-16T07:00:00.000Z" : null,
    metadata: verified
      ? {
          source_checksum: "fnv1a32:12345678",
          verified_checksum: "fnv1a32:12345678",
          verification_record_count: 24
        }
      : {
          source_checksum: "fnv1a32:12345678",
          verified_checksum: null,
          verification_record_count: null
        }
  };
}

test("stage policy allows only adjacent promotion and rollback transitions", () => {
  const allowed = [
    ["legacy", "shadow", false],
    ["shadow", "legacy", false],
    ["shadow", "dual_write", true],
    ["dual_write", "shadow", false],
    ["dual_write", "normalized", true],
    ["normalized", "dual_write", false]
  ];

  for (const [from, to, verified] of allowed) {
    const decision = policy.evaluateTransition(manifest(from, verified), to);
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
    const decision = policy.evaluateTransition(manifest(from, true), to);
    assert.equal(decision.allowed, false, `${from} -> ${to}`);
    assert.equal(decision.reason, "invalid-stage-transition");
  }
});

test("promotions require current verification with matching source checksum", () => {
  for (const [from, to] of [["shadow", "dual_write"], ["dual_write", "normalized"]]) {
    const missing = policy.evaluateTransition(manifest(from, false), to);
    assert.equal(missing.allowed, false);
    assert.equal(missing.reason, "current-verification-required");

    const stale = manifest(from, true);
    stale.metadata.verified_checksum = "fnv1a32:87654321";
    const mismatch = policy.evaluateTransition(stale, to);
    assert.equal(mismatch.allowed, false);
    assert.equal(mismatch.reason, "current-verification-required");

    const current = policy.evaluateTransition(manifest(from, true), to);
    assert.equal(current.allowed, true);
    assert.equal(current.requiresVerification, true);
  }
});

test("rollback target moves exactly one stage toward legacy", () => {
  assert.equal(policy.rollbackTarget(manifest("normalized")), "dual_write");
  assert.equal(policy.rollbackTarget(manifest("dual_write")), "shadow");
  assert.equal(policy.rollbackTarget(manifest("shadow")), "legacy");
  assert.equal(policy.rollbackTarget(manifest("legacy")), null);
});

test("assertTransition returns legal decisions and stable errors for unsafe promotion", () => {
  assert.equal(policy.assertTransition(manifest("legacy"), "shadow").allowed, true);
  assert.throws(
    () => policy.assertTransition(manifest("shadow", false), "dual_write"),
    (error) => error?.code === "HH_SYNC_STAGE_VERIFICATION_REQUIRED"
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

test("stage guard SQL mirrors the adjacent transition graph", () => {
  assert.match(sql, /old\.cutover_stage = 'legacy' and new\.cutover_stage = 'shadow'/i);
  assert.match(sql, /old\.cutover_stage = 'shadow' and new\.cutover_stage = 'legacy'/i);
  assert.match(sql, /old\.cutover_stage = 'shadow' and new\.cutover_stage = 'dual_write'/i);
  assert.match(sql, /old\.cutover_stage = 'dual_write' and new\.cutover_stage = 'shadow'/i);
  assert.match(sql, /old\.cutover_stage = 'dual_write' and new\.cutover_stage = 'normalized'/i);
  assert.match(sql, /old\.cutover_stage = 'normalized' and new\.cutover_stage = 'dual_write'/i);
  assert.match(sql, /HH_SYNC_INVALID_STAGE_TRANSITION/);
});

test("stage guard SQL requires fresh verification for promotions", () => {
  assert.match(sql, /HH_SYNC_STAGE_VERIFICATION_REQUIRED/);
  assert.match(sql, /verified_checksum/);
  assert.match(sql, /source_checksum/);
  assert.match(sql, /v_verified_checksum <> v_source_checksum/);
  assert.match(sql, /verification_record_count/);
  assert.match(sql, /HH_SYNC_NORMALIZED_REQUIRES_VERIFICATION/);
});

test("stage transition RPC is generation guarded and verification recording is source-checksum guarded", () => {
  assert.match(sql, /herdharbor_sync_set_stage/i);
  assert.match(sql, /p_expected_generation/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /v_generation <> p_expected_generation/i);
  assert.match(sql, /HH_SYNC_CONFLICT/);
  assert.match(sql, /herdharbor_sync_mark_verified/i);
  assert.match(sql, /metadata ->> 'source_checksum'[^\n]*= p_checksum/i);
  assert.match(sql, /HH_SYNC_VERIFY_STALE/);
});

test("stage guard migration never touches the legacy full-state table", () => {
  assert.doesNotMatch(sql, /\b(?:insert\s+into|update|delete\s+from|alter\s+table|drop\s+table|truncate\s+table)\s+public\.herdharbor_user_data\b/i);
  assert.match(sql, /does not read, update, copy, or delete public\.herdharbor_user_data/i);
});
