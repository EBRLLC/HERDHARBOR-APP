const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("C2 privacy-safe preview RPC exposes only approved seller profile fields", () => {
  const sql = read("supabase/stack-c2-marketplace-owner-profile.sql");
  const preview = sql.match(/create or replace function public\.marketplace_owner_profile_preview\(\)[\s\S]*?\$c2_preview\$;/i)?.[0] || "";

  assert.match(preview, /display_name text/);
  assert.match(preview, /rabbitry_name text/);
  assert.match(preview, /city text/);
  assert.match(preview, /region text/);
  assert.match(preview, /about text/);
  assert.match(preview, /species_breeds jsonb/);
  assert.match(preview, /verification_status text/);
  assert.match(preview, /marketplace_status text/);
  assert.match(preview, /active_listing_count bigint/);
  assert.doesNotMatch(preview, /email|phone|street|exact_address|billing|subscription|medical|acquisition|avatar_path text/i);
});

test("C2 preview and editor APIs remain protected Owner-only RPCs", () => {
  const sql = read("supabase/stack-c2-marketplace-owner-profile.sql");

  for (const fn of [
    "marketplace_owner_profile_editor",
    "marketplace_owner_profile_preview",
    "marketplace_owner_save_profile"
  ]) {
    assert.match(sql, new RegExp(fn));
  }

  assert.match(sql, /herdharbor_account_role\(\)\) = 'owner'/);
  assert.match(sql, /public\.herdharbor_account_role\(\) <> 'owner'/);
  assert.match(sql, /revoke all on function public\.marketplace_owner_profile_preview\(\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.marketplace_owner_profile_preview\(\) to authenticated/i);
  assert.match(sql, /revoke all on function public\.marketplace_public_profile\(uuid\) from public, anon, authenticated/i);
  assert.doesNotMatch(sql, /grant execute[^;]+to anon/i);
});

test("C2 save API cannot spoof another seller or another seller's avatar path", () => {
  const sql = read("supabase/stack-c2-marketplace-owner-profile.sql");

  assert.match(sql, /actor uuid := auth\.uid\(\)/);
  assert.match(sql, /insert into public\.marketplace_public_profiles[\s\S]*?actor,/);
  assert.match(sql, /avatar_path_value not like actor::text \|\| '\/profiles\/%'/);
  assert.doesNotMatch(sql, /target_user|seller_id_value|user_id_value/i);
});

test("C2 web profile editor contains only broad public-facing fields", () => {
  const source = read("marketplace/marketplace-profile-v2.0.1.js");

  assert.match(source, /marketplace_owner_profile_editor/);
  assert.match(source, /marketplace_owner_profile_preview/);
  assert.match(source, /marketplace_owner_save_profile/);
  assert.match(source, /name="city"/);
  assert.match(source, /name="region"/);
  assert.match(source, /name="species_breeds"/);
  assert.match(source, /marketplace-public/);
  assert.match(source, /createSignedUrl/);
  assert.doesNotMatch(source, /name="(?:email|phone|street|address|billing|subscription)"/i);
  assert.doesNotMatch(source, /account_access|subscriptions|billing/i);
});

test("C2 profile runtime is loaded only inside the already Owner-gated Marketplace app", () => {
  const gate = read("marketplace/marketplace-gate-v2.0.1.js");
  const app = read("marketplace/marketplace-app-v2.0.1.js");
  const index = read("index.html");

  assert.match(gate, /role[\s\S]*owner/);
  assert.match(app, /marketplace-profile-v2\.0\.1\.js\?v=1/);
  assert.match(app, /context\.role !== "owner"/);
  assert.doesNotMatch(index, /marketplace-profile-v2\.0\.1\.js/);
});
