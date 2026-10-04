const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const sql = read("supabase/stack-c4a-marketplace-browse.sql");

test("C4A search response is future-public safe but remains Owner-only", () => {
  const block = sql.match(/create or replace function public\.marketplace_owner_search_preview\([\s\S]*?\$c4_search\$;/i)?.[0] || "";
  for (const token of ["listing_id uuid","seller_public_id uuid","rabbitry_name text","location_city text","location_region text","total_count bigint"]) {
    assert.ok(block.toLowerCase().includes(token.toLowerCase()), token);
  }
  assert.doesNotMatch(block, /seller_id uuid|user_id uuid|source_animal_id|avatar_path|storage_path|email|phone|exact_address|billing|subscription/i);
  assert.match(block, /herdharbor_account_role\(\) <> 'owner'/);
  assert.doesNotMatch(sql, /grant execute[^;]+to anon/i);
});

test("C4A detail and seller payloads expose only approved public-shaped fields", () => {
  const detail = sql.match(/create or replace function public\.marketplace_owner_listing_preview\([\s\S]*?\$c4_detail\$;/i)?.[0] || "";
  const seller = sql.match(/create or replace function public\.marketplace_owner_seller_preview\([\s\S]*?\$c4_seller\$;/i)?.[0] || "";
  assert.match(detail, /seller_public_id uuid/);
  assert.match(detail, /description text/);
  assert.doesNotMatch(detail, /source_animal_id|seller_id uuid|user_id uuid|storage_path|avatar_path|notes|medical|acquisition|email|phone/i);
  assert.match(seller, /public_id uuid/);
  assert.match(seller, /species_breeds jsonb/);
  assert.doesNotMatch(seller, /user_id uuid|email|phone|street|avatar_path|billing|subscription/i);
});

test("C4A supports required filters, sorts, bounded pagination, and FTS", () => {
  for (const token of ["species_value","breed_value","sex_value","region_value","pedigree_status_value","listing_kind_value","min_price_cents_value","max_price_cents_value","seller_public_id_value","sort_value"]) {
    assert.match(sql, new RegExp(token));
  }
  assert.match(sql, /safe_limit integer := least\(greatest\(coalesce\(limit_value, 24\), 1\), 48\)/);
  assert.match(sql, /safe_offset integer := greatest\(coalesce\(offset_value, 0\), 0\)/);
  assert.match(sql, /marketplace_listings_search_fts_idx/);
  assert.match(sql, /websearch_to_tsquery/);
});

test("C4A raw media paths are isolated in a private Owner-only RPC", () => {
  const search = sql.match(/create or replace function public\.marketplace_owner_search_preview\([\s\S]*?\$c4_search\$;/i)?.[0] || "";
  const detail = sql.match(/create or replace function public\.marketplace_owner_listing_preview\([\s\S]*?\$c4_detail\$;/i)?.[0] || "";
  const media = sql.match(/create or replace function public\.marketplace_owner_preview_media\([\s\S]*?\$c4_media\$;/i)?.[0] || "";
  assert.doesNotMatch(search, /storage_path/);
  assert.doesNotMatch(detail, /storage_path/);
  assert.match(media, /storage_path/);
  assert.match(media, /l\.seller_id = actor/);
  assert.match(media, /Owner-only/);
});

test("C4A favorites stay private viewer state", () => {
  const search = sql.match(/create or replace function public\.marketplace_owner_search_preview\([\s\S]*?\$c4_search\$;/i)?.[0] || "";
  assert.match(sql, /marketplace_owner_favorite_ids/);
  assert.match(sql, /marketplace_owner_toggle_favorite/);
  assert.doesNotMatch(search, /is_favorite|marketplace_favorites/);
});

test("C4A adds no app-hosted Marketplace web runtime", () => {
  assert.equal(fs.existsSync(path.join(root, "marketplace")), false);
});
