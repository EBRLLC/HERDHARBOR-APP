"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sql = fs.readFileSync(path.join(root, "supabase/stack-d4-marketplace-favorites-lifecycle.sql"), "utf8");

test("D4 drives canonical expires_at and last_confirmed_at columns", () => {
  assert.match(sql, /marketplace_listing_lifecycle_defaults/i);
  assert.match(sql, /now\(\)\+interval '30 days'/i);
  assert.match(sql, /last_confirmed_at/i);
  assert.match(sql, /where state='available'[\s\S]*expires_at is null/i);
});

test("D4 stale cleanup and reconfirmation operate only on the signed-in seller listings", () => {
  assert.match(sql, /marketplace_member_refresh_listing_lifecycle/i);
  assert.match(sql, /seller_id=actor[\s\S]*state='available'[\s\S]*expires_at<=now\(\)/i);
  assert.match(sql, /marketplace_member_reconfirm_listing/i);
  assert.match(sql, /marketplace_member_update_listing_lifecycle/i);
});

test("D4 lifecycle preserves moderation removal lock", () => {
  assert.match(sql, /current_state='removed'/i);
  assert.match(sql, /raise exception 'Listing is unavailable for this account'/i);
});

test("D4 Saved Animals reuses marketplace_favorites and hides removed or suspended snapshots", () => {
  assert.match(sql, /marketplace_member_saved_listings/i);
  assert.match(sql, /from public\.marketplace_favorites f/i);
  assert.match(sql, /l\.state<>'removed'/i);
  assert.match(sql, /marketplace_account_suspensions/i);
  assert.match(sql, /'Listing unavailable'/i);
});


test("D4 favorite v2 can always remove a stale favorite but still validates new saves", () => {
  assert.match(sql, /marketplace_member_toggle_favorite_v2/i);
  assert.match(sql, /if not coalesce\(favorite_value,false\)[\s\S]*delete from public\.marketplace_favorites/i);
  assert.match(sql, /l\.state='available'/i);
  assert.match(sql, /marketplace_account_suspensions/i);
});
