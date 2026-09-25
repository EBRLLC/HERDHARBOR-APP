"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sql = fs.readFileSync(
  path.join(root, "supabase", "v1.8.4-normalized-authority-cutover.sql"),
  "utf8"
);

test("PR7 cutover migration is additive and never auto-enrolls or auto-promotes an account", () => {
  assert.doesNotMatch(sql, /insert\s+into\s+public\.herdharbor_sync_cohort/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.herdharbor_sync_records/i);
  assert.doesNotMatch(sql, /truncate\s+table/i);
  assert.doesNotMatch(sql, /drop\s+table/i);
  assert.doesNotMatch(sql, /update\s+public\.herdharbor_sync_manifest[\s\S]*where\s+cutover_stage\s*=\s*'dual_write'/i);
});

test("forward stage transitions require the server cohort and normalized uses dedicated activation", () => {
  assert.match(sql, /herdharbor_sync_cohort[\s\S]*c\.enabled[\s\S]*c\.cohort = 'internal_test'/i);
  assert.match(sql, /HH_SYNC_COHORT_REQUIRED/);
  assert.match(sql, /p_target_stage = 'normalized'[\s\S]*HH_SYNC_AUTHORITY_ACTIVATION_RPC_REQUIRED/i);
  assert.match(sql, /herdharbor_sync_activate_normalized_authority/i);
  assert.match(sql, /v_stage <> 'dual_write'[\s\S]*HH_SYNC_DUAL_WRITE_STAGE_REQUIRED/i);
  assert.match(sql, /normalized_authority_ready/i);
  assert.match(sql, /normalized_authority_version/i);
  assert.match(sql, /normalized_writer_ready/i);
  assert.match(sql, /normalized_verified_at/i);
});

test("manifest trigger requires checkpoint verification only when entering normalized authority", () => {
  assert.match(sql, /old\.cutover_stage = 'dual_write' and new\.cutover_stage = 'normalized'/i);
  assert.match(sql, /HH_SYNC_STAGE_VERIFICATION_REQUIRED/);
  assert.match(sql, /if new\.cutover_stage = 'normalized'[\s\S]*HH_SYNC_NORMALIZED_AUTHORITY_REQUIRED/i);

  const ongoingBlock = sql.match(/if new\.cutover_stage = 'normalized' then([\s\S]*?)end if;/i)?.[1] || "";
  assert.doesNotMatch(ongoingBlock, /HH_SYNC_STAGE_VERIFICATION_REQUIRED/);
  assert.doesNotMatch(ongoingBlock, /normalized_verified_at is null/i);
});

test("normalized record CAS requires authority and cannot resurrect tombstoned rows", () => {
  assert.match(sql, /v_stage = 'normalized'[\s\S]*normalized_authority_ready[\s\S]*HH_SYNC_NORMALIZED_AUTHORITY_REQUIRED/i);
  assert.match(sql, /record_version = p_expected_version[\s\S]*and deleted_at is null/i);
  assert.match(sql, /normalized_verified_at = null/i);
  assert.match(sql, /sync_generation = sync_generation \+ 1/i);
});

test("stale legacy writes stay blocked while the recovery RPC has a scoped bypass", () => {
  assert.match(sql, /HH_SYNC_LEGACY_WRITE_BLOCKED_AFTER_CUTOVER/);
  assert.match(sql, /current_setting\('herdharbor\.normalized_recovery_write'/i);
  assert.match(sql, /set_config\('herdharbor\.normalized_recovery_write', 'on', true\)/i);
  assert.match(sql, /herdharbor_sync_materialize_legacy_recovery/i);
  assert.match(sql, /v_stage <> 'normalized'[\s\S]*HH_SYNC_NORMALIZED_AUTHORITY_REQUIRED/i);
  assert.match(sql, /insert into public\.herdharbor_user_data \(user_id, app_state\)[\s\S]*on conflict \(user_id\) do update/i);
});

test("rollback clears authority/writer markers but retains normalized rows", () => {
  assert.match(sql, /normalized_authority_ready', false/i);
  assert.match(sql, /normalized_authority_version', null/i);
  assert.match(sql, /normalized_writer_ready', false/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.herdharbor_sync_records/i);
});

test("authority and recovery RPCs are authenticated-only and cohort status can recover active authority", () => {
  assert.match(sql, /revoke all on function public\.herdharbor_sync_activate_normalized_authority[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.herdharbor_sync_activate_normalized_authority[\s\S]*to authenticated/i);
  assert.match(sql, /revoke all on function public\.herdharbor_sync_materialize_legacy_recovery[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.herdharbor_sync_materialize_legacy_recovery[\s\S]*to authenticated/i);
  assert.match(sql, /'stage', v_stage/i);
  assert.match(sql, /'authority_active', v_authority_active/i);
  assert.match(sql, /v_authority_active := v_stage = 'normalized'/i);
});
