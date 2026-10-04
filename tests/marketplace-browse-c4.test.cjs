const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("C4 search response is privacy-safe and contains no private identifiers", () => {
  const sql = read("supabase/stack-c4-marketplace-browse.sql");
  const block = sql.match(/create or replace function public\.marketplace_owner_search_preview\([\s\S]*?\$c4_search\$;/i)?.[0] || "";

  assert.match(block, /listing_id uuid/);
  assert.match(block, /seller_public_id uuid/);
  assert.match(block, /rabbitry_name text/);
  assert.match(block, /location_city text/);
  assert.match(block, /location_region text/);
  assert.doesNotMatch(block, /seller_id uuid|user_id uuid|source_animal_id|avatar_path|storage_path|email|phone|exact_address|billing|subscription/i);
  assert.match(block, /herdharbor_account_role\(\) <> 'owner'/);
});

test("C4 detail response stays on explicit public-safe fields", () => {
  const sql = read("supabase/stack-c4-marketplace-browse.sql");
  const block = sql.match(/create or replace function public\.marketplace_owner_listing_preview\([\s\S]*?\$c4_detail\$;/i)?.[0] || "";

  assert.match(block, /description text/);
  assert.match(block, /pedigree_status text/);
  assert.match(block, /registration_status text/);
  assert.match(block, /seller_public_id uuid/);
  assert.doesNotMatch(block, /source_animal_id|seller_id uuid|user_id uuid|storage_path|avatar_path|notes|medical|acquisition/i);
});

test("C4 seller preview does not expose account contact or billing fields", () => {
  const sql = read("supabase/stack-c4-marketplace-browse.sql");
  const block = sql.match(/create or replace function public\.marketplace_owner_seller_preview\([\s\S]*?\$c4_seller\$;/i)?.[0] || "";

  assert.match(block, /public_id uuid/);
  assert.match(block, /rabbitry_name text/);
  assert.match(block, /species_breeds jsonb/);
  assert.doesNotMatch(block, /user_id uuid|email|phone|street|avatar_path|billing|subscription/i);
});

test("C4 private media paths are isolated from public-shaped RPCs", () => {
  const sql = read("supabase/stack-c4-marketplace-browse.sql");
  const search = sql.match(/create or replace function public\.marketplace_owner_search_preview\([\s\S]*?\$c4_search\$;/i)?.[0] || "";
  const detail = sql.match(/create or replace function public\.marketplace_owner_listing_preview\([\s\S]*?\$c4_detail\$;/i)?.[0] || "";
  const media = sql.match(/create or replace function public\.marketplace_owner_preview_media\([\s\S]*?\$c4_media\$;/i)?.[0] || "";

  assert.doesNotMatch(search, /storage_path/);
  assert.doesNotMatch(detail, /storage_path/);
  assert.match(media, /storage_path/);
  assert.match(media, /l\.seller_id = actor/);
  assert.match(media, /Owner-only/);
});

test("C4 search provides the required browse filters and sorting", () => {
  const sql = read("supabase/stack-c4-marketplace-browse.sql");

  for (const token of [
    "species_value", "breed_value", "sex_value", "region_value",
    "pedigree_status_value", "listing_kind_value",
    "min_price_cents_value", "max_price_cents_value", "sort_value"
  ]) assert.match(sql, new RegExp(token));

  assert.match(sql, /marketplace_listings_search_fts_idx/);
  assert.match(sql, /websearch_to_tsquery/);
});

test("C4 favorites remain private viewer state and are not embedded in public payloads", () => {
  const sql = read("supabase/stack-c4-marketplace-browse.sql");
  const search = sql.match(/create or replace function public\.marketplace_owner_search_preview\([\s\S]*?\$c4_search\$;/i)?.[0] || "";

  assert.match(sql, /marketplace_owner_favorite_ids/);
  assert.match(sql, /marketplace_owner_toggle_favorite/);
  assert.doesNotMatch(search, /is_favorite|marketplace_favorites/);
  assert.doesNotMatch(sql, /grant execute[^;]+to anon/i);
});

test("C4 web surface implements browse, detail, seller profile, filters, and favorites", () => {
  const source = read("marketplace/marketplace-browse-v2.0.1.js");

  assert.match(source, /marketplace_owner_search_preview/);
  assert.match(source, /marketplace_owner_listing_preview/);
  assert.match(source, /marketplace_owner_seller_preview/);
  assert.match(source, /marketplace_owner_browse_facets/);
  assert.match(source, /marketplace_owner_toggle_favorite/);
  assert.match(source, /marketplace_owner_preview_media/);
  assert.match(source, /Breed/);
  assert.match(source, /Sex/);
  assert.match(source, /State \/ region/);
  assert.match(source, /Pedigree/);
  assert.match(source, /Price/);
  assert.match(source, /history\.pushState/);
  assert.doesNotMatch(source, /HerdHarborStateStore|herdharbor_sync_records|herdharbor_user_data|account_access/i);
});

test("C4 Browse is the default Marketplace section but remains behind Owner gate", () => {
  const app = read("marketplace/marketplace-app-v2.0.1.js");
  const index = read("index.html");

  assert.match(app, /marketplace-browse-v2\.0\.1\.js\?v=1/);
  assert.match(app, /showFeature\("browse"\)/);
  assert.match(app, /context\.role !== "owner"/);
  assert.doesNotMatch(index, /marketplace-browse-v2\.0\.1\.js/);
});
