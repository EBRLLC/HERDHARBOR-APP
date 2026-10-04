const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const sql = read("supabase/stack-c2a-marketplace-seller-profile.sql");

test("C2A exposes only privacy-safe public-shaped seller fields", () => {
  const preview = sql.match(/create or replace function public\.marketplace_owner_profile_preview\(\)[\s\S]*?\$c2_preview\$;/i)?.[0] || "";
  for (const field of [
    "public_id uuid", "display_name text", "rabbitry_name text", "city text",
    "region text", "about text", "species_breeds jsonb", "member_since timestamptz",
    "verification_status text", "marketplace_status text", "active_listing_count bigint"
  ]) assert.ok(preview.toLowerCase().includes(field.toLowerCase()), field);
  assert.doesNotMatch(preview, /email|phone|street|exact_address|billing|subscription|medical|acquisition|avatar_path text/i);
});

test("C2A profile RPCs remain authenticated plus protected Owner-role only", () => {
  for (const fn of ["marketplace_owner_profile_editor","marketplace_owner_profile_preview","marketplace_owner_save_profile"]) {
    assert.match(sql, new RegExp(fn));
  }
  assert.match(sql, /herdharbor_account_role\(\)\) = 'owner'/);
  assert.match(sql, /public\.herdharbor_account_role\(\) <> 'owner'/);
  assert.match(sql, /revoke all on function public\.marketplace_owner_profile_preview\(\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.marketplace_owner_profile_preview\(\) to authenticated/i);
  assert.doesNotMatch(sql, /grant execute[^;]+to anon/i);
});

test("C2A cannot target another profile and validates Owner avatar prefix", () => {
  assert.match(sql, /actor uuid := auth\.uid\(\)/);
  assert.match(sql, /insert into public\.marketplace_public_profiles[\s\S]*?actor,/);
  assert.match(sql, /avatar_path_value not like actor::text \|\| '\/profiles\/%'/);
  assert.doesNotMatch(sql, /target_user|seller_id_value|user_id_value/i);
});

test("C2A keeps old public profile RPC closed during private preview", () => {
  assert.match(sql, /revoke all on function public\.marketplace_public_profile\(uuid\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.marketplace_public_profile\(uuid\) to service_role/i);
});

test("C2A contains no Marketplace website UI or herd sync runtime", () => {
  assert.equal(fs.existsSync(path.join(root, "marketplace")), false);
  assert.doesNotMatch(sql, /HerdHarborStateStore|offline save queue|cloud conflict|herdharbor_user_data/i);
});
