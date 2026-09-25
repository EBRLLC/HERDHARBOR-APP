"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sql = fs.readFileSync(
  path.resolve(__dirname, "..", "supabase", "v1.8.3-cloud-sync-cutover-legacy-guard.sql"),
  "utf8"
);

test("cutover guard covers every legacy row mutation after normalized promotion", () => {
  assert.match(sql, /before insert or update or delete on public\.herdharbor_user_data/i);
  assert.match(sql, /v_stage = 'normalized'/i);
  assert.match(sql, /HH_SYNC_LEGACY_WRITE_BLOCKED_AFTER_CUTOVER/);
  assert.match(sql, /case when tg_op = 'DELETE' then old\.user_id else new\.user_id end/i);
});

test("legacy writes automatically become possible again after rollback", () => {
  const normalizedGuard = sql.match(/if v_stage = 'normalized'[\s\S]*?end if;/i)?.[0] || "";
  assert.match(normalizedGuard, /HH_SYNC_LEGACY_WRITE_BLOCKED_AFTER_CUTOVER/);
  assert.doesNotMatch(sql, /v_stage\s+in\s*\([^)]*dual_write/i);
  assert.doesNotMatch(sql, /v_stage\s*=\s*'dual_write'[\s\S]*HH_SYNC_LEGACY_WRITE_BLOCKED_AFTER_CUTOVER/i);
});

test("normalized-writer preparation fails closed unless the database guard trigger is installed and enabled", () => {
  assert.match(sql, /herdharbor_sync_prepare_normalized_writer_guarded/i);
  assert.match(sql, /pg_catalog\.pg_trigger/i);
  assert.match(sql, /herdharbor_legacy_write_cutover_guard/i);
  assert.match(sql, /t\.tgenabled <> 'D'/i);
  assert.match(sql, /HH_SYNC_LEGACY_GUARD_REQUIRED/);
  assert.match(sql, /return public\.herdharbor_sync_prepare_normalized_writer/i);
});

test("unguarded browser writer-preparation RPC is revoked after guard installation", () => {
  assert.match(
    sql,
    /revoke all on function public\.herdharbor_sync_prepare_normalized_writer\(bigint, text, text, integer\) from public, anon, authenticated/i
  );
  assert.match(
    sql,
    /grant execute on function public\.herdharbor_sync_prepare_normalized_writer_guarded\(bigint, text, text, integer\) to authenticated/i
  );
});

test("guard migration changes no existing legacy application-state row", () => {
  assert.doesNotMatch(sql, /\bupdate\s+public\.herdharbor_user_data\b/i);
  assert.doesNotMatch(sql, /\bdelete\s+from\s+public\.herdharbor_user_data\b/i);
  assert.doesNotMatch(sql, /\binsert\s+into\s+public\.herdharbor_user_data\b/i);
  assert.doesNotMatch(sql, /\btruncate\s+(?:table\s+)?public\.herdharbor_user_data\b/i);
});


test("cutover security-definer helpers are explicitly locked down before guarded exposure", () => {
  assert.match(sql, /security definer\s+set search_path = ''/i);
  assert.match(sql, /revoke all on function public\.herdharbor_block_legacy_write_after_normalized\(\) from public, anon, authenticated/i);
  assert.match(sql, /revoke all on function public\.herdharbor_sync_prepare_normalized_writer_guarded\(bigint, text, text, integer\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.herdharbor_sync_prepare_normalized_writer_guarded\(bigint, text, text, integer\) to authenticated/i);
});
