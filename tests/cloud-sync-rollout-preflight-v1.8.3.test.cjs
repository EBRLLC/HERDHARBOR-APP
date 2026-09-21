"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sql = fs.readFileSync(
  path.join(root, "supabase", "v1.8.3-cloud-sync-rollout-preflight.sql"),
  "utf8"
);

test("rollout preflight is read-only and performs no schema or data mutation", () => {
  assert.doesNotMatch(sql, /\b(?:insert\s+into|update\s+public\.|delete\s+from|alter\s+table|drop\s+table|truncate\s+table|create\s+(?:or\s+replace\s+)?function|create\s+trigger|grant\s+|revoke\s+)\b/i);
  assert.match(sql, /READ ONLY/i);
});

test("rollout preflight verifies normalized tables, RLS, owner policies, RPCs, and legacy guard", () => {
  assert.match(sql, /herdharbor_sync_records/);
  assert.match(sql, /herdharbor_sync_manifest/);
  assert.match(sql, /relrowsecurity/);
  assert.match(sql, /users read own normalized sync records/);
  assert.match(sql, /users read own sync manifest/);
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /herdharbor_sync_apply_batch\(jsonb,jsonb,jsonb\)/);
  assert.match(sql, /herdharbor_sync_mark_verified\(bigint,text,integer\)/);
  assert.match(sql, /herdharbor_sync_set_stage\(text,bigint\)/);
  assert.match(sql, /herdharbor_sync_prepare_normalized_writer_guarded\(bigint,text,text,integer\)/);
  assert.match(sql, /herdharbor_legacy_write_cutover_guard/);
  assert.match(sql, /t\.tgenabled <> 'D'/i);
  assert.match(sql, /as owner_rls/i);
  assert.match(sql, /as verified/i);
});
