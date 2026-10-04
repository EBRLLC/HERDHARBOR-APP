const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const sql = read("supabase/stack-c3a-marketplace-listings.sql");

test("C3A herd import is narrow, read-only, and fails closed at normalized authority", () => {
  const block = sql.match(/create or replace function public\.marketplace_owner_herd_animals\(\)[\s\S]*?\$c3_herd\$;/i)?.[0] || "";
  assert.match(block, /herdharbor_user_data/);
  assert.match(block, /select d\.app_state[\s\S]*?into snapshot/);
  assert.match(block, /authority_stage = 'normalized'/);
  assert.match(block, /Do not fall back to a stale legacy snapshot/);
  for (const field of ["source_animal_id text","animal_name text","species text","breed text","sex text","dob date","variety_color text","asking_price text","herd_status text"]) {
    assert.ok(block.toLowerCase().includes(field.toLowerCase()), field);
  }
  assert.doesNotMatch(block, /notes|photoData|photoFileName|medical|health|acquisition|email|phone/i);
  assert.doesNotMatch(block, /update public\.herdharbor_user_data|insert into public\.herdharbor_user_data|delete from public\.herdharbor_user_data/i);
});

test("C3A matches current sync authority model: dual_write is legacy authority", () => {
  const rollout = read("cloud-sync-rollout-control-v1.8.3.js");
  assert.match(rollout, /dual_write:[\s\S]*?authority:\s*"legacy"/);
  assert.match(rollout, /normalized:[\s\S]*?authority:\s*"normalized-with-legacy-recovery"/);
  assert.match(sql, /if authority_stage = 'normalized' then/);
});

test("C3A saves detached Marketplace snapshots and never writes herd state", () => {
  const save = sql.match(/create or replace function public\.marketplace_owner_save_listing\([\s\S]*?\$c3_save\$;/i)?.[0] || "";
  assert.match(save, /insert into public\.marketplace_listings/);
  assert.match(save, /jsonb_build_object/);
  assert.match(save, /safe_source is not null and not exists/);
  assert.match(save, /m\.cutover_stage = 'normalized'/);
  assert.match(save, /d\.user_id = actor/);
  assert.doesNotMatch(save, /update public\.herdharbor_user_data|delete from public\.herdharbor_user_data/i);
});

test("C3A photo paths are Owner/listing scoped and limited to six", () => {
  const photos = sql.match(/create or replace function public\.marketplace_owner_set_listing_photos\([\s\S]*?\$c3_photos\$;/i)?.[0] || "";
  assert.match(photos, /jsonb_array_length[\s\S]*?> 6/);
  assert.match(photos, /actor::text \|\| '\/listings\/' \|\| listing_id_value::text \|\| '\/%'/);
  assert.match(photos, /l\.id = listing_id_value and l\.seller_id = actor/);
});

test("C3A listing delete can touch Marketplace records only", () => {
  const block = sql.match(/create or replace function public\.marketplace_owner_delete_listing\([\s\S]*?\$c3_delete\$;/i)?.[0] || "";
  assert.match(block, /delete from public\.marketplace_listings/);
  assert.doesNotMatch(block, /herdharbor_user_data|herdharbor_sync_records|delete from.*animals/i);
});

test("C3A keeps legacy listing RPCs closed and has no app-hosted Marketplace UI", () => {
  assert.match(sql, /revoke all privileges on function %s from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function %s to service_role/i);
  assert.doesNotMatch(sql, /grant execute[^;]+to anon/i);
  assert.equal(fs.existsSync(path.join(root, "marketplace")), false);
});
