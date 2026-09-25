"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sql = fs.readFileSync(
  path.join(root, "supabase", "v1.8.4-normalized-sync-internal-cohort.sql"),
  "utf8"
);
const preflight = fs.readFileSync(
  path.join(root, "supabase", "v1.8.3-cloud-sync-rollout-preflight.sql"),
  "utf8"
);

test("internal normalized cohort is empty-by-default and has no browser write path", () => {
  assert.match(sql,/create table if not exists public\.herdharbor_sync_cohort/i);
  assert.match(sql,/cohort = 'internal_test'/i);
  assert.doesNotMatch(sql,/insert into public\.herdharbor_sync_cohort/i);
  assert.doesNotMatch(sql,/percentage/i, "database allowlist must not implement percentage rollout");
  assert.match(sql,/revoke all on table public\.herdharbor_sync_cohort from anon, authenticated/i);
  assert.doesNotMatch(sql,/grant (?:insert|update|delete|all).*herdharbor_sync_cohort.*authenticated/i);
});

test("cohort status exposes only caller eligibility, allowlist mode, and schema readiness", () => {
  assert.match(sql,/herdharbor_sync_cohort_status\(\)/i);
  assert.match(sql,/'eligible', v_eligible/i);
  assert.match(sql,/'mode', 'allowlist'/i);
  assert.match(sql,/'percentage_enabled', false/i);
  assert.match(sql,/'schema_verified', v_schema_verified/i);
  assert.match(sql,/relrowsecurity/i);
  assert.match(sql,/role_table_grants/i);
  assert.match(sql,/has_function_privilege/i);
  assert.match(sql,/herdharbor_sync_prepare_normalized_writer_guarded/i);
  assert.doesNotMatch(sql,/jsonb_build_object\([\s\S]*'user_id'/i);
  assert.match(sql,/security definer\s+set search_path = ''/i);
  assert.match(sql,/revoke all on function public\.herdharbor_sync_cohort_status\(\)[\s\S]*from public, anon, authenticated/i);
  assert.match(sql,/grant execute on function public\.herdharbor_sync_cohort_status\(\)[\s\S]*to authenticated/i);
});

test("rollout preflight requires the server allowlist without changing legacy authority", () => {
  assert.match(preflight,/cohort_table/i);
  assert.match(preflight,/cohort_rpc/i);
  assert.match(preflight,/cohort_authenticated_execute/i);
  assert.match(preflight,/no_browser_cohort_table_access/i);
  assert.match(preflight,/legacy_authority_only/i);
});
