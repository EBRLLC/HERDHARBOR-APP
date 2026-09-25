"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sql = fs.readFileSync(
  path.join(root, "supabase", "v1.8.4-normalized-sync-validation-cohort.sql"),
  "utf8"
);

test("validation cohort is explicit allowlist only with no automatic enrollment", () => {
  assert.match(sql,/create table if not exists public\.herdharbor_sync_validation_cohort/i);
  assert.match(sql,/enabled boolean not null default false/i);
  assert.doesNotMatch(sql,/insert into public\.herdharbor_sync_validation_cohort/i);
  assert.doesNotMatch(sql,/percentage\s+(?:integer|numeric|real|double precision)/i);
  assert.match(sql,/'percentage_enabled', false/i);
  assert.match(sql,/'mode', 'allowlist'/i);
});

test("cohort membership cannot be browsed directly by app roles", () => {
  assert.match(sql,/enable row level security/i);
  assert.match(sql,/using \(false\)/i);
  assert.match(sql,/revoke all on table public\.herdharbor_sync_validation_cohort from anon, authenticated/i);
});

test("cohort status is owner-derived, payload-free, and authenticated-only", () => {
  assert.match(sql,/v_user uuid := auth\.uid\(\)/i);
  assert.match(sql,/where c\.user_id = v_user/i);
  assert.match(sql,/revoke all on function public\.herdharbor_sync_cohort_status\(\)[\s\S]*from public, anon, authenticated/i);
  assert.match(sql,/grant execute on function public\.herdharbor_sync_cohort_status\(\)[\s\S]*to authenticated/i);
  assert.doesNotMatch(sql,/jsonb_build_object\([\s\S]*user_id/i);
});

test("cohort status verifies the record-CAS rollout prerequisites", () => {
  assert.match(sql,/herdharbor_sync_apply_record\(text,text,jsonb,text,bigint,boolean,text\)/i);
  assert.match(sql,/relrowsecurity/i);
  assert.match(sql,/role_table_grants/i);
  assert.match(sql,/has_function_privilege/i);
  assert.match(sql,/herdharbor_legacy_write_cutover_guard/i);
  assert.match(sql,/'schema_verified', v_schema_verified/i);
});
