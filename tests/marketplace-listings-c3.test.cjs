const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("C3 Select From My Herd is a narrow read-only Owner RPC", () => {
  const sql = read("supabase/stack-c3-marketplace-listings.sql");
  const block = sql.match(/create or replace function public\.marketplace_owner_herd_animals\(\)[\s\S]*?\$c3_herd\$;/i)?.[0] || "";

  assert.match(block, /herdharbor_user_data/);
  assert.match(block, /select d\.app_state[\s\S]*?into snapshot/);\n  assert.match(block, /snapshot -> 'animals'/);
  assert.match(block, /herdharbor_account_role\(\)\) = 'owner'/);
  assert.match(block, /source_animal_id text/);
  assert.match(block, /animal_name text/);
  assert.match(block, /breed text/);
  assert.doesNotMatch(block, /notes|photoData|photoFileName|medical|health|acquisition|email|phone/i);
  assert.doesNotMatch(block, /update public\.herdharbor_user_data|insert into public\.herdharbor_user_data|delete from public\.herdharbor_user_data/i);
});

test("C3 saves detached Marketplace snapshots and validates source ownership", () => {
  const sql = read("supabase/stack-c3-marketplace-listings.sql");
  const save = sql.match(/create or replace function public\.marketplace_owner_save_listing\([\s\S]*?\$c3_save\$;/i)?.[0] || "";

  assert.match(save, /insert into public\.marketplace_listings/);
  assert.match(save, /public_snapshot = jsonb_build_object|jsonb_build_object/);
  assert.match(save, /safe_source is not null and not exists/);
  assert.match(save, /d\.user_id = actor/);
  assert.doesNotMatch(save, /update public\.herdharbor_user_data|delete from public\.herdharbor_user_data/i);
  assert.doesNotMatch(save, /foreign key[^\n]+source_animal/i);
});

test("C3 photo paths are owner and listing scoped", () => {
  const sql = read("supabase/stack-c3-marketplace-listings.sql");
  const photos = sql.match(/create or replace function public\.marketplace_owner_set_listing_photos\([\s\S]*?\$c3_photos\$;/i)?.[0] || "";

  assert.match(photos, /jsonb_array_length[\s\S]*?> 6/);
  assert.match(photos, /actor::text \|\| '\/listings\/' \|\| listing_id_value::text \|\| '\/%'/);
  assert.match(photos, /l\.id = listing_id_value and l\.seller_id = actor/);
});

test("C3 delete touches Marketplace listings only", () => {
  const sql = read("supabase/stack-c3-marketplace-listings.sql");
  const block = sql.match(/create or replace function public\.marketplace_owner_delete_listing\([\s\S]*?\$c3_delete\$;/i)?.[0] || "";

  assert.match(block, /delete from public\.marketplace_listings/);
  assert.doesNotMatch(block, /herdharbor_user_data|herdharbor_sync_records|animals/);
});

test("C3 web provides both required listing creation paths", () => {
  const source = read("marketplace/marketplace-listings-v2.0.1.js");

  assert.match(source, /Create Manual Listing/);
  assert.match(source, /Select From My Herd/);
  assert.match(source, /marketplace_owner_herd_animals/);
  assert.match(source, /marketplace_owner_save_listing/);
  assert.match(source, /marketplace_owner_set_listing_photos/);
  assert.match(source, /marketplace_owner_delete_listing/);
  assert.match(source, /source_animal_id/);
  assert.match(source, /detached snapshot/i);\n  assert.match(source, /previousPaths/);\n  assert.match(source, /remove\\(previousPaths\\)/);
  assert.doesNotMatch(source, /HerdHarborStateStore|saveState|cloud-sync|herdharbor_sync_records/i);
});

test("C3 keeps listing runtime behind the Owner-gated Marketplace app", () => {
  const app = read("marketplace/marketplace-app-v2.0.1.js");
  const index = read("index.html");

  assert.match(app, /marketplace-listings-v2\.0\.1\.js\?v=1/);
  assert.match(app, /context\.role !== "owner"/);
  assert.doesNotMatch(index, /marketplace-listings-v2\.0\.1\.js/);
});
