"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sql = fs.readFileSync(path.join(__dirname, "..", "supabase",
  "v2.0.1-s20-normalized-only-signup.sql"), "utf8");
const initializer = sql.slice(
  sql.indexOf("create or replace function public.herdharbor_initialize_normalized_signup()"),
  sql.indexOf("revoke all on function public.herdharbor_initialize_normalized_signup()")
);
const guard = sql.slice(
  sql.indexOf("create or replace function public.herdharbor_guard_normalized_only_signup()"),
  sql.indexOf("revoke all on function public.herdharbor_guard_normalized_only_signup()")
);
const readiness = sql.slice(
  sql.indexOf("create or replace function public.herdharbor_normalized_signup_ready()"),
  sql.indexOf("revoke all on function public.herdharbor_normalized_signup_ready()")
);

test("S22 new-account initializer marks normalized-only accounts but keeps adjacent signup transitions", () => {
  assert.match(initializer, /'s20_signup_normalized_only',true/);
  assert.match(initializer, /cutover_stage='shadow'/);
  assert.match(initializer, /cutover_stage='dual_write'/);
  assert.match(initializer, /cutover_stage='normalized'/);
  assert.match(initializer, /delete from public\.herdharbor_sync_cohort where user_id=new\.id/);
  assert.doesNotMatch(initializer, /insert into public\.herdharbor_user_data/i);
});

test("S22 normalized-only guard blocks post-signup downgrade or marker loss", () => {
  assert.ok(guard.length > 100, "rollback guard function must exist");
  assert.match(guard, /old\.cutover_stage\s*=\s*'normalized'/);
  assert.match(guard, /old\.metadata\s*->>\s*'s20_signup_normalized_only'\s*=\s*'true'/);
  assert.match(guard, /new\.cutover_stage\s+is distinct from\s+'normalized'/);
  assert.match(guard, /new\.metadata\s*->>\s*'s20_signup_normalized_only'\s+is distinct from\s+'true'/);
  assert.match(guard, /HH_S20_NORMALIZED_ONLY_ROLLBACK_FORBIDDEN/);
  assert.match(sql, /create trigger hh_s20_guard_normalized_only_signup\s+before update on public\.herdharbor_sync_manifest/i);
  assert.match(sql, /revoke all on function public\.herdharbor_guard_normalized_only_signup\(\)\s+from public, anon, authenticated/i);
});

test("S22 anonymous signup readiness fails closed if the downgrade guard is absent or disabled", () => {
  assert.match(readiness, /t\.tgname = 'hh_s20_initialize_normalized_account'/);
  assert.match(readiness, /t\.tgname = 'hh_s20_guard_normalized_only_signup'/);
  assert.match(readiness, /t\.tgenabled in \('O', 'A'\)/);
  assert.match(sql, /grant execute on function public\.herdharbor_normalized_signup_ready\(\)\s+to anon, authenticated/i);
});

test("S22 trigger protection does not apply during the uncommitted initial staged signup", () => {
  assert.match(guard, /if old\.cutover_stage = 'normalized'/);
  assert.match(sql, /insert into public\.herdharbor_sync_manifest[\s\S]*?cutover_stage='shadow'[\s\S]*?cutover_stage='dual_write'[\s\S]*?cutover_stage='normalized'/);
});
