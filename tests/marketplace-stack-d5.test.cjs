"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sql = fs.readFileSync(path.join(root, "supabase/stack-d5-marketplace-notifications-hardening.sql"), "utf8");

test("D5 uses a new canonical notification inbox and does not resurrect C7 abandoned names", () => {
  assert.match(sql, /create table if not exists public\.marketplace_notification_inbox/i);
  assert.doesNotMatch(sql, /create table if not exists public\.marketplace_notifications\b/i);
  assert.doesNotMatch(sql, /create table if not exists public\.marketplace_saved_searches\b/i);
  assert.doesNotMatch(sql, /create or replace function public\.marketplace_my_notifications\b/i);
  assert.doesNotMatch(sql, /create or replace function public\.marketplace_refresh_seller_notifications\b/i);
});

test("D5 deduplicates notifications per member and preserves future saved-search architecture", () => {
  assert.match(sql, /unique\(user_id,dedupe_key\)/i);
  assert.match(sql, /on conflict\(user_id,dedupe_key\) do nothing/i);
  assert.match(sql, /'saved_search'/i);
  assert.match(sql, /entity_type text/i);
  assert.match(sql, /metadata jsonb/i);
});

test("D5 producers cover messages lifecycle expiration and moderation warning without raw message bodies", () => {
  assert.match(sql, /marketplace_notify_new_message/i);
  assert.match(sql, /marketplace_notify_listing_lifecycle/i);
  assert.match(sql, /marketplace_notify_user_warning/i);
  assert.match(sql, /marketplace_member_refresh_notifications/i);
  assert.match(sql, /listing-expiry:/i);
  assert.doesNotMatch(sql, /new\.body/);
});

test("D5 notification table remains RPC-only and member scoped", () => {
  assert.match(sql, /revoke all on table public\.marketplace_notification_inbox from public,anon,authenticated/i);
  for (const fn of [
    "marketplace_member_notifications",
    "marketplace_member_mark_notification_read",
    "marketplace_member_mark_all_notifications_read",
    "marketplace_member_notification_summary"
  ]) {
    assert.ok(sql.includes(fn), fn);
  }
  assert.match(sql, /where n\.user_id=actor/i);
});

test("D5 expiration reminders are deterministic for each expiry window", () => {
  assert.match(sql, /'listing-expiry:'\|\|l\.id::text\|\|':'\|\|l\.expires_at::text/i);
  assert.match(sql, /expires_at<=now\(\)\+interval '5 days'/i);
});
