const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const sql = read("supabase/stack-c6a-marketplace-owner-moderation.sql");

test("C6A moderation APIs use the protected Owner role instead of a second admin identity system", () => {
  assert.match(sql, /herdharbor_account_role\(\) <> 'owner'/);
  assert.doesNotMatch(sql, /marketplace_is_admin|admin_email|owner_email|hard.?coded/i);
});

test("C6A exposes no moderation RPC to anon", () => {
  assert.doesNotMatch(sql, /grant execute[^;]+to anon/i);
  for (const fn of [
    "marketplace_owner_admin_summary",
    "marketplace_owner_admin_reports",
    "marketplace_owner_admin_sellers",
    "marketplace_owner_admin_listings",
    "marketplace_owner_admin_moderate_listing",
    "marketplace_owner_admin_moderate_seller",
    "marketplace_owner_admin_resolve_report",
    "marketplace_owner_admin_history"
  ]) {
    assert.match(sql, new RegExp("revoke all on function public\\." + fn));
    assert.match(sql, new RegExp("grant execute on function public\\." + fn + "[^;]*to authenticated", "i"));
  }
});

test("C6A can remove listings but restore only to draft", () => {
  const block = sql.match(/create or replace function public\.marketplace_owner_admin_moderate_listing[\s\S]*?\$c6_mod_listing\$;/i)?.[0] || "";
  assert.match(block, /action_name not in \('remove','restore_to_draft'\)/);
  assert.match(block, /when 'remove' then 'removed' else 'draft'/);
  assert.doesNotMatch(block, /restore[^\n]+available/i);
  assert.match(block, /Moderation reason is required/);
});

test("C6A seller moderation affects Marketplace status only, not HerdHarbor account access", () => {
  const block = sql.match(/create or replace function public\.marketplace_owner_admin_moderate_seller[\s\S]*?\$c6_mod_seller\$;/i)?.[0] || "";
  assert.match(block, /marketplace_status=next_status/);
  assert.match(block, /'suspend','reactivate','close'/);
  assert.doesNotMatch(block, /auth\.users|account_access|delete from|ban_duration|sign_out/i);
});

test("C6A report moderation supports safe closure and target actions", () => {
  const block = sql.match(/create or replace function public\.marketplace_owner_admin_resolve_report[\s\S]*?\$c6_resolve_report\$;/i)?.[0] || "";
  assert.match(block, /'dismiss','resolve','remove_listing','suspend_seller'/);
  assert.match(block, /target_type <> 'listing'/);
  assert.match(block, /target_type <> 'user'/);
  assert.match(block, /already closed/);
  assert.match(block, /marketplace_moderation_actions/);
});

test("C6A every destructive moderation action writes an audit record", () => {
  for (const marker of ["$c6_mod_listing$","$c6_mod_seller$","$c6_resolve_report$"]) {
    const first = sql.indexOf(marker);
    const second = sql.indexOf(marker, first + marker.length);
    const block = sql.slice(first, second + marker.length);
    assert.match(block, /insert into public\.marketplace_moderation_actions/i);
  }
});

test("C6A legacy abandoned-stack moderation RPCs stay closed to browser roles", () => {
  assert.match(sql, /revoke all on function public\.marketplace_moderation_queue\(text\) from public, anon, authenticated/i);
  assert.match(sql, /revoke all on function public\.marketplace_moderate_report\(uuid,text,text\) from public, anon, authenticated/i);
  assert.match(sql, /revoke all on function public\.marketplace_submit_report\(text,text,text,text\) from public, anon, authenticated/i);
});

test("C6A admin query payloads avoid auth email and private herd data", () => {
  const queryBlocks = [
    sql.match(/\$c6_reports\$[\s\S]*?\$c6_reports\$/i)?.[0] || "",
    sql.match(/\$c6_sellers\$[\s\S]*?\$c6_sellers\$/i)?.[0] || "",
    sql.match(/\$c6_listings\$[\s\S]*?\$c6_listings\$/i)?.[0] || ""
  ].join("\n");
  assert.doesNotMatch(queryBlocks, /auth\.users|email|phone|exact_address|medical|acquisition|herdharbor_user_data/i);
});
