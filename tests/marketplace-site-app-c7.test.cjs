"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const accessSql = read("supabase/stack-c7a-marketplace-public-member-access.sql");
const pedigreeSql = read("supabase/stack-c7b-marketplace-member-pedigree.sql");
const cleanupSql = read("supabase/stack-c7c-marketplace-cleanup.sql");

test("C7A public browsing grants anon only explicit read-only RPCs", () => {
  for (const fn of [
    "marketplace_public_search_v2",
    "marketplace_public_listing_v2",
    "marketplace_public_seller_v2",
    "marketplace_public_facets_v2",
    "marketplace_public_pedigree_v2"
  ]) {
    assert.match(accessSql, new RegExp("grant execute on function public\\." + fn + "[^;]*to anon, authenticated", "i"));
  }

  assert.doesNotMatch(accessSql, /grant execute[^;]+marketplace_member_[^;]+to anon/i);
  assert.doesNotMatch(accessSql, /grant (?:select|insert|update|delete|all)[^;]+marketplace_(?:messages|conversations|listings|public_profiles)[^;]+to anon/i);
});

test("C7A public contracts contain no auth IDs, private herd data, or message content", () => {
  const publicSection = accessSql.slice(
    accessSql.indexOf("-- Public read-only Marketplace contracts."),
    accessSql.indexOf("-- Authenticated member context")
  );
  assert.doesNotMatch(publicSection, /seller_id\s+uuid|user_id\s+uuid|source_animal_id|herdharbor_user_data|marketplace_messages|marketplace_conversation_members|email|phone|exact_address|medical|acquisition/i);
});

test("C7A direct browser table access is revoked and account ownership remains in RLS", () => {
  for (const table of [
    "marketplace_public_profiles",
    "marketplace_listings",
    "marketplace_listing_photos",
    "marketplace_favorites",
    "marketplace_conversations",
    "marketplace_conversation_members",
    "marketplace_messages",
    "marketplace_message_attachments"
  ]) {
    assert.match(accessSql, new RegExp("revoke all privileges on table public\\." + table + " from anon, authenticated", "i"));
  }
  assert.match(accessSql, /marketplace_profiles_member_self/);
  assert.match(accessSql, /marketplace_listings_member_self/);
  assert.match(accessSql, /marketplace_messages_member_select/);
  assert.match(accessSql, /marketplace_messages_member_insert/);
});

test("C7A seller mutations bind every listing/profile operation to auth.uid", () => {
  const saveProfile = accessSql.match(/create or replace function public\.marketplace_member_save_profile[\s\S]*?\$c7_member_save_profile\$;/i)?.[0] || "";
  const saveListing = accessSql.match(/create or replace function public\.marketplace_member_save_listing[\s\S]*?\$c7_member_save_listing\$;/i)?.[0] || "";
  const deleteListing = accessSql.match(/create or replace function public\.marketplace_member_delete_listing[\s\S]*?\$c7_member_delete_listing\$;/i)?.[0] || "";

  assert.match(saveProfile, /actor uuid := auth\.uid\(\)/);
  assert.match(saveProfile, /insert into public\.marketplace_public_profiles[\s\S]*?actor,/);
  assert.match(saveListing, /seller_id=actor|actor,safe_source/);
  assert.match(saveListing, /where id=listing_id_value[\s\S]*?seller_id=actor[\s\S]*?state<>'removed'/);
  assert.match(deleteListing, /seller_id=actor and state<>'removed'/);
  assert.doesNotMatch(saveListing, /target_user|seller_id_value/i);
});

test("C7A moderation-removed listings cannot be silently restored or deleted by sellers", () => {
  const saveListing = accessSql.match(/create or replace function public\.marketplace_member_save_listing[\s\S]*?\$c7_member_save_listing\$;/i)?.[0] || "";
  const deleteListing = accessSql.match(/create or replace function public\.marketplace_member_delete_listing[\s\S]*?\$c7_member_delete_listing\$;/i)?.[0] || "";
  assert.doesNotMatch(saveListing, /safe_state not in \([^)]*removed/);
  assert.match(saveListing, /state<>'removed'/);
  assert.match(deleteListing, /state<>'removed'/);
});

test("C7A message reads and writes require conversation membership on every RPC", () => {
  const messages = accessSql.match(/create or replace function public\.marketplace_member_messages[\s\S]*?\$c7_messages\$;/i)?.[0] || "";
  const send = accessSql.match(/create or replace function public\.marketplace_member_send_message[\s\S]*?\$c7_send_message\$;/i)?.[0] || "";
  const mark = accessSql.match(/create or replace function public\.marketplace_member_mark_conversation_read[\s\S]*?\$c7_mark_read\$;/i)?.[0] || "";

  assert.match(messages, /marketplace_current_user_is_conversation_member\(conversation_id_value\)/);
  assert.match(send, /marketplace_current_user_is_conversation_member\(conversation_id_value\)/);
  assert.match(mark, /marketplace_current_user_is_conversation_member\(conversation_id_value\)/);
  assert.match(send, /sender_id,body/);
  assert.match(send, /values\(conversation_id_value,actor,safe_body\)/);
});

test("C7A conversation creation never lets a buyer impersonate or target another account", () => {
  const open = accessSql.match(/create or replace function public\.marketplace_member_open_listing_conversation[\s\S]*?\$c7_open_conversation\$;/i)?.[0] || "";
  assert.match(open, /actor uuid := auth\.uid\(\)/);
  assert.match(open, /select l\.seller_id into seller/);
  assert.match(open, /values\(new_id,actor,'buyer'\),\(new_id,seller,'seller'\)/);
  assert.doesNotMatch(open, /buyer_id_value|seller_id_value|user_id_value/i);
});

test("C7A public media uses only the Edge signer; raw paths are not anonymously readable", () => {
  assert.match(accessSql, /values \('marketplace-public','marketplace-public',false\)/);
  assert.doesNotMatch(accessSql, /create policy marketplace_storage_public_read/);
  assert.doesNotMatch(accessSql, /marketplace_public_listing_media_v2/);
  assert.doesNotMatch(accessSql, /marketplace_public_seller_media_v2/);
  assert.doesNotMatch(accessSql, /marketplace_public_media_allowed/);
  assert.match(accessSql, /revoke usage on schema herdharbor_private from anon/);
  assert.match(accessSql, /marketplace_storage_member_own_insert/);
  assert.match(accessSql, /owner_id = \(select auth\.uid\(\)\)::text/);
  assert.match(accessSql, /storage\.foldername\(name\)\)\[1\] in \('profiles','listings'\)/);
  assert.match(accessSql, /o\.owner_id=actor::text/);
  assert.match(accessSql, /avatar_path_value not like 'profiles\/%'/);
  assert.match(accessSql, /path_value not like 'listings\/'\|\|listing_id_value::text\|\|'\/%'/);
  assert.doesNotMatch(accessSql, /actor::text\|\|'\/profiles\/%'/);
  assert.doesNotMatch(accessSql, /actor::text\|\|'\/listings\/'/);

  const edge = read("supabase/functions/marketplace-public-media/index.ts");
  assert.match(edge, /WEBSITE_ORIGIN = "https:\/\/herdharbor\.com"/);
  assert.match(edge, /origin !== WEBSITE_ORIGIN/);
  assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(edge, /\.eq\("state", "available"\)/);
  assert.match(edge, /\.eq\("marketplace_status", "active"\)/);
  assert.match(edge, /createSignedUrls?\(/);
  assert.doesNotMatch(edge, /return reply\(req, \{[^}]*storage_path/i);
});

test("C7B member pedigree source is self-owned and preserves the C5 snapshot allowlist", () => {
  assert.match(pedigreeSql, /marketplace_member_pedigree_source/);
  assert.match(pedigreeSql, /marketplace_member_set_pedigree_snapshot/);
  assert.match(pedigreeSql, /marketplace_current_account_active\(\)/);
  assert.match(pedigreeSql, /l\.seller_id = actor/);
  assert.match(pedigreeSql, /key not in \('schema','engineVersion','visibility','generations','nodes'\)/);
  assert.match(pedigreeSql, /key not in \('name','prefix','sex','dob','breed','color','registrationNumber'\)/);
  assert.doesNotMatch(pedigreeSql, /email|phone|medical|acquisition|photoData/i);
});

test("C7A app Marketplace link uses a one-time SSO ticket and never copies the app refresh token", () => {
  const nav = read("marketplace-nav-v2.0.1.js");
  assert.match(nav, /MARKETPLACE_ORIGIN = "https:\/\/herdharbor\.com"/);
  assert.match(nav, /HerdHarborCloud\?\.getSession/);
  assert.match(nav, /invoke\("marketplace-sso-ticket"/);
  assert.match(nav, /event\.origin !== MARKETPLACE_ORIGIN/);
  assert.match(nav, /event\.source !== handoff\.window/);
  assert.match(nav, /HANDOFF_TTL_MS = 30000/);
  assert.match(nav, /tokenHash: ticket\.tokenHash/);
  assert.match(nav, /fallback\.hash = "sso-ticket=" \+ encodeURIComponent\(ticket\.tokenHash\)/);
  assert.match(nav, /pending\.window\.location\.href = fallback\.href/);
  assert.match(nav, /verificationType: ticket\.verificationType/);
  assert.match(nav, /postMessage\([\s\S]*MARKETPLACE_ORIGIN/);
  assert.doesNotMatch(nav, /activeSession\.access_token|activeSession\.refresh_token|accessToken:|refreshToken:/);
  assert.doesNotMatch(nav, /access_token=.*(?:searchParams|href)|refresh_token=.*(?:searchParams|href)/i);
  assert.doesNotMatch(nav, /isOwner/);
});

test("C7A SSO ticket service validates the existing app user and returns only a one-time token hash", () => {
  const source = read("supabase/functions/marketplace-sso-ticket/index.ts");
  assert.match(source, /APP_ORIGIN = "https:\/\/app\.herdharbor\.com"/);
  assert.match(source, /origin !== APP_ORIGIN/);
  assert.match(source, /admin\.auth\.getUser\(token\)/);
  assert.match(source, /auth\.admin\.generateLink/);
  assert.match(source, /type: "magiclink"/);
  assert.match(source, /properties\?\.hashed_token/);
  assert.match(source, /linkedUserId !== user\.id/);
  assert.match(source, /tokenHash/);
  assert.doesNotMatch(source, /access_token|refresh_token|action_link/);
});

test("C7A Marketplace interaction inherits HerdHarbor registration safety", () => {
  const active = accessSql.match(/create or replace function herdharbor_private\.marketplace_current_account_active[\s\S]*?\$c7_active\$;/i)?.[0] || "";
  assert.match(active, /auth\.users/);
  assert.match(active, /registration_policy/);
  assert.match(active, /registration_profiles/);
  assert.match(active, /age_verified_at is not null/);
  assert.match(active, /u\.created_at < rp\.enforcement_started_at/);
  assert.match(accessSql, /'marketplace_access_ready',herdharbor_private\.marketplace_current_account_active\(\)/);
});

test("C7A app Marketplace asset identity changes with the SSO handoff", () => {
  const index = read("index.html");
  assert.match(index, /marketplace-nav-v2\.0\.1\.js\?v=3/);
});


test("C7C removes legacy triggers and owns message rate limiting inside the member RPC", () => {
  for (const trigger of [
    "marketplace_enforce_active_conversation_creator",
    "marketplace_enforce_active_listing_writer",
    "marketplace_notify_saved_searches",
    "marketplace_sanitize_public_pedigree",
    "marketplace_enforce_active_message_sender",
    "marketplace_message_unread",
    "marketplace_message_rate_limit"
  ]) {
    assert.match(cleanupSql, new RegExp("drop trigger if exists " + trigger));
  }

  const send = cleanupSql.match(/create or replace function public\.marketplace_member_send_message[\s\S]*?\$c7c_send_message\$;/i)?.[0] || "";
  assert.match(send, /created_at>now\(\)-interval '1 minute'/);
  assert.match(send, /recent_count>=20/);
  assert.match(send, /unread_count=unread_count\+1/);
  assert.doesNotMatch(cleanupSql, /drop trigger if exists marketplace_reset_pedigree_snapshot_on_source_change/);
});

test("C7C removes abandoned Marketplace tables and obsolete parallel RPC families", () => {
  for (const table of [
    "marketplace_agreement_templates",
    "marketplace_deposit_records",
    "marketplace_listing_agreements",
    "marketplace_notifications",
    "marketplace_reviews",
    "marketplace_saved_searches",
    "marketplace_listing_attributes",
    "marketplace_message_attachments"
  ]) {
    assert.match(cleanupSql, new RegExp("drop table if exists public\\." + table));
  }

  for (const fn of [
    "marketplace_search_listings",
    "marketplace_public_listing",
    "marketplace_public_profile",
    "marketplace_public_pedigree",
    "marketplace_open_listing_conversation",
    "marketplace_inbox",
    "marketplace_submit_report",
    "marketplace_owner_search_preview",
    "marketplace_owner_save_listing",
    "marketplace_owner_profile_editor"
  ]) {
    assert.match(cleanupSql, new RegExp("['\"]" + fn + "['\"]"));
  }

  for (const fn of [
    "marketplace_member_listings",
    "marketplace_member_messages",
    "marketplace_member_save_listing",
    "marketplace_member_save_profile",
    "marketplace_member_toggle_favorite",
    "marketplace_member_submit_report"
  ]) {
    assert.doesNotMatch(cleanupSql, new RegExp("drop function if exists public\\." + fn + "\\b"));
  }
  assert.match(cleanupSql, /drop function if exists public\.marketplace_member_block_profile\(uuid\)/);
  assert.match(cleanupSql, /drop function if exists public\.marketplace_member_conversation_block_state\(uuid\)/);
  for (const fn of [
    "marketplace_public_search_v2",
    "marketplace_public_listing_v2",
    "marketplace_public_seller_v2",
    "marketplace_public_facets_v2",
    "marketplace_public_pedigree_v2"
  ]) {
    assert.doesNotMatch(cleanupSql, new RegExp("drop function if exists public\\." + fn));
  }
});

test("C7C protects the Owner account without coupling Admin access to seller-profile status", () => {
  assert.match(cleanupSql, /registration_profiles/);
  assert.match(cleanupSql, /target_user=actor[\s\S]*account_role,''\)\)='owner'/);
  assert.match(cleanupSql, /drop trigger if exists marketplace_prevent_owner_self_lockout/);
  assert.match(cleanupSql, /drop function if exists herdharbor_private\.marketplace_prevent_owner_self_lockout\(\)/);
  assert.doesNotMatch(
    cleanupSql.match(/create or replace function herdharbor_private\.marketplace_current_account_active[\s\S]*?\$c7c_active\$;/i)?.[0] || "",
    /marketplace_public_profiles[\s\S]*marketplace_status/
  );
});

test("C7C makes listing conversations idempotent under concurrent opens", () => {
  assert.match(cleanupSql, /create unique index if not exists marketplace_conversations_listing_creator_unique/);
  assert.match(cleanupSql, /pg_advisory_xact_lock/);
  assert.match(cleanupSql, /listing_id_value::text\|\|':'\|\|actor::text/);
  assert.match(cleanupSql, /where c\.listing_id=listing_id_value[\s\S]*m\.user_id=actor/);
});

test("C7 does not create unused message-attachment Storage on a fresh deployment", () => {
  assert.doesNotMatch(accessSql, /insert into storage\.buckets[\s\S]{0,180}marketplace-message-attachments/);
});


test("C7C moves public media signing behind the dedicated Edge function", () => {
  const media = read("supabase/functions/marketplace-public-media/index.ts");
  const config = read("supabase/config.toml");

  assert.match(cleanupSql, /drop policy if exists marketplace_storage_public_read/);
  assert.match(cleanupSql, /drop function if exists public\.marketplace_public_listing_media_v2\(uuid\[\]\)/);
  assert.match(cleanupSql, /drop function if exists public\.marketplace_public_seller_media_v2\(uuid\)/);
  assert.match(media, /WEBSITE_ORIGIN = "https:\/\/herdharbor\.com"/);
  assert.match(media, /origin !== WEBSITE_ORIGIN/);
  assert.match(media, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(media, /createSignedUrls\(paths, 300\)/);
  assert.match(media, /createSignedUrl\(avatarPath, 300\)/);
  assert.match(config, /\[functions\.marketplace-public-media\]/);
  assert.match(config, /verify_jwt = false/);
});

test("C7C Owner moderation covers abusive buyer and seller accounts", () => {
  assert.match(cleanupSql, /create table if not exists public\.marketplace_account_suspensions/);
  assert.match(cleanupSql, /marketplace_owner_admin_reports_v2/);
  assert.match(cleanupSql, /marketplace_owner_admin_resolve_report_v2/);
  assert.match(cleanupSql, /marketplace_owner_admin_suspensions/);
  assert.match(cleanupSql, /marketplace_owner_admin_reactivate_account/);
  assert.match(cleanupSql, /'suspend_account'/);
  assert.match(cleanupSql, /target_type='message'/);
  assert.match(cleanupSql, /target_type='conversation'/);
});

test("C7C never directly deletes a Supabase Storage bucket through SQL", () => {
  assert.doesNotMatch(cleanupSql, /delete from storage\.buckets/i);
});


test("C7A retries an unconfirmed opener SSO handoff through one-time fragment recovery", () => {
  const nav = read("marketplace-nav-v2.0.1.js");
  assert.match(nav, /handshake timeout/);
  assert.match(nav, /recoveryTicket = await pending\.ticket/);
  assert.match(nav, /fallback\.hash = "sso-ticket=" \+ encodeURIComponent\(recoveryTicket\.tokenHash\)/);
  assert.match(nav, /}, 6000\)/);
  assert.match(nav, /pendingHandoffs\.delete\(handoffNonce\)/);
});


test("C7C conversation block state reports both directions without exposing peer identity", () => {
  assert.match(cleanupSql, /drop function if exists public\.marketplace_member_conversation_block_state\(uuid\)/);
  assert.match(cleanupSql, /returns jsonb/);
  assert.match(cleanupSql, /'blocked_by_me',blocked_by_me/);
  assert.match(cleanupSql, /'blocked_by_peer',blocked_by_peer/);
  assert.match(cleanupSql, /'messaging_blocked',blocked_by_me or blocked_by_peer/);
  assert.doesNotMatch(
    cleanupSql.match(/create function public\.marketplace_member_conversation_block_state[\s\S]*?\$c7c_block_state\$;/i)?.[0] || "",
    /public_id|display_name|rabbitry_name|email|phone/i
  );
});
