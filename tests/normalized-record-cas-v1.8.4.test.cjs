"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sql = fs.readFileSync(
  path.join(root, "supabase", "v1.8.4-normalized-record-cas.sql"),
  "utf8"
);
const preflight = fs.readFileSync(
  path.join(root, "supabase", "v1.8.3-cloud-sync-rollout-preflight.sql"),
  "utf8"
);

test("record writer uses record_version CAS without an account-wide generation precondition", () => {
  assert.match(sql,/create or replace function public\.herdharbor_sync_apply_record/i);
  assert.match(sql,/and record_version = p_expected_version/i);
  assert.match(sql,/HH_SYNC_CONFLICT/i);
  assert.doesNotMatch(sql,/p_expected_generation/i);
  assert.doesNotMatch(sql,/sync_generation = p_expected_generation/i);
});

test("record writer never changes rollout stage or legacy app_state", () => {
  assert.match(sql,/v_stage not in \('shadow', 'dual_write', 'normalized'\)/i);
  assert.doesNotMatch(sql,/set\s+cutover_stage/i);
  assert.doesNotMatch(sql,/(?:insert\s+into|update|delete\s+from|truncate\s+table)\s+public\.herdharbor_user_data/i);
  assert.doesNotMatch(sql,/app_state\s*=/i);
});

test("record writer invalidates verification only after a confirmed record mutation", () => {
  const recordMutationIndex = sql.indexOf("select record_version, deleted_at");
  const verificationIndex = sql.indexOf("normalized_verified_at = null");
  assert.ok(recordMutationIndex >= 0);
  assert.ok(verificationIndex > recordMutationIndex);
  assert.match(sql,/sync_generation = sync_generation \+ 1/i);
});

test("record writer blocks blind tombstone and stale resurrection paths", () => {
  assert.match(sql,/HH_SYNC_RECORD_VERSION_REQUIRED/i);
  assert.match(sql,/p_expected_version is null[\s\S]*insert into public\.herdharbor_sync_records/i);
  assert.match(sql,/on conflict \(user_id, namespace, record_id\) do nothing/i);
  assert.match(sql,/record_version = p_expected_version/i);
});

test("record CAS RPC is least-privilege and part of rollout preflight", () => {
  assert.match(sql,/security definer\s+set search_path = ''/i);
  assert.match(sql,/revoke all on function public\.herdharbor_sync_apply_record[\s\S]*from public, anon, authenticated/i);
  assert.match(sql,/grant execute on function public\.herdharbor_sync_apply_record[\s\S]*to authenticated/i);
  assert.match(preflight,/herdharbor_sync_apply_record\(text,text,jsonb,text,bigint,boolean,text\)/i);
  assert.match(preflight,/record_authenticated_execute/i);
  assert.match(preflight,/record_rpc/i);
});
