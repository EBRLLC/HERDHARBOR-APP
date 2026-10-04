"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const cleanup = read("supabase/stack-c7c-marketplace-cleanup.sql");
const mediaEdge = read("supabase/functions/marketplace-public-media/index.ts");

test("C7C removes all abandoned triggers that conflict with the final Marketplace contract", () => {
  for (const trigger of [
    "marketplace_enforce_active_conversation_creator",
    "marketplace_enforce_active_listing_writer",
    "marketplace_notify_saved_searches",
    "marketplace_sanitize_public_pedigree",
    "marketplace_enforce_active_message_sender",
    "marketplace_message_unread",
    "marketplace_message_rate_limit",
    "marketplace_enforce_active_reviewer"
  ]) {
    assert.match(cleanup, new RegExp("drop trigger if exists " + trigger));
  }

  assert.doesNotMatch(cleanup, /drop trigger if exists marketplace_reset_pedigree_snapshot_on_source_change/);
});

test("C7C message sending owns unread and rate-limit behavior exactly once", () => {
  const send = cleanup.match(/create or replace function public\.marketplace_member_send_message[\s\S]*?\$c7c_send_message\$;/i)?.[0] || "";
  assert.match(send, /recent_count>=20/);
  assert.match(send, /created_at>now\(\)-interval '1 minute'/);
  assert.equal((send.match(/unread_count=unread_count\+1/g) || []).length, 1);
  assert.equal((send.match(/set updated_at=now\(\)/g) || []).length, 1);
});

test("C7C removes the legacy pedigree sanitizer that could rewrite canonical snapshots", () => {
  assert.match(cleanup, /drop trigger if exists marketplace_sanitize_public_pedigree/);
  assert.match(cleanup, /drop function if exists herdharbor_private\.marketplace_sanitize_listing_pedigree\(\)/);
  assert.match(cleanup, /drop function if exists herdharbor_private\.marketplace_sanitize_public_pedigree\(jsonb\)/);
});

test("C7C serializes first-contact conversation creation", () => {
  const open = cleanup.match(/create or replace function public\.marketplace_member_open_listing_conversation[\s\S]*?\$c7c_open_conversation\$;/i)?.[0] || "";
  assert.match(open, /pg_advisory_xact_lock/);
  assert.match(open, /listing_id_value::text\|\|':'\|\|actor::text/);
  assert.match(open, /marketplace_account_suspensions/);
});

test("C7C removes abandoned API generations and empty abandoned feature tables", () => {
  for (const table of [
    "marketplace_listing_agreements",
    "marketplace_deposit_records",
    "marketplace_agreement_templates",
    "marketplace_notifications",
    "marketplace_reviews",
    "marketplace_saved_searches",
    "marketplace_listing_attributes",
    "marketplace_message_attachments"
  ]) {
    assert.match(cleanup, new RegExp("drop table if exists public\\." + table));
  }

  for (const legacy of [
    "marketplace_search_listings",
    "marketplace_public_listing",
    "marketplace_public_profile",
    "marketplace_public_pedigree",
    "marketplace_open_listing_conversation",
    "marketplace_owner_search_preview",
    "marketplace_owner_save_listing",
    "marketplace_owner_profile_editor"
  ]) {
    assert.match(cleanup, new RegExp("'" + legacy + "'"));
  }
});

test("C7C public media is Edge-signed and browser path RPCs are removed", () => {
  assert.match(cleanup, /drop function if exists public\.marketplace_public_listing_media_v2\(uuid\[\]\)/);
  assert.match(cleanup, /drop function if exists public\.marketplace_public_seller_media_v2\(uuid\)/);
  assert.match(cleanup, /drop policy if exists marketplace_storage_public_read/);

  assert.match(mediaEdge, /WEBSITE_ORIGINS = new Set\(\["https:\/\/herdharbor\.com", "https:\/\/www\.herdharbor\.com"\]\)/);
  assert.match(mediaEdge, /WEBSITE_ORIGINS\.has\(origin\)/);
  assert.match(mediaEdge, /createSignedUrls\(paths, 300\)/);
  assert.match(mediaEdge, /createSignedUrl\(avatarPath, 300\)/);
  assert.match(mediaEdge, /return reply\(req, \{ listings: result \}\)/);
  assert.match(mediaEdge, /return reply\(req, \{ avatarUrl:/);
  assert.doesNotMatch(mediaEdge, /return reply\(req, \{[^}]*storage_path/i);
});

test("C7C Marketplace-only suspensions do not modify main account_access status", () => {
  assert.match(cleanup, /create table if not exists public\.marketplace_account_suspensions/);
  assert.match(cleanup, /marketplace_current_account_active/);
  assert.match(cleanup, /s\.lifted_at is null/);
  assert.match(cleanup, /marketplace_owner_admin_resolve_report_v2/);
  assert.match(cleanup, /resolution_name not in \('dismiss','resolve','remove_listing','suspend_seller','suspend_account'\)/);
  assert.match(cleanup, /marketplace_owner_admin_reactivate_account/);
  assert.doesNotMatch(cleanup, /update public\.account_access[\s\S]*account_status/i);
});

test("C7C Admin report context covers messages and conversations", () => {
  const reports = cleanup.match(/create or replace function public\.marketplace_owner_admin_reports_v2[\s\S]*?\$c7c_admin_reports\$;/i)?.[0] || "";
  assert.match(reports, /marketplace_messages msg/);
  assert.match(reports, /marketplace_conversations conv/);
  assert.match(reports, /message_excerpt/);
  assert.match(reports, /conversation_excerpt/);
  assert.match(reports, /reported_user_id/);
  assert.match(reports, /can_suspend_account boolean/);
});

test("C7C supersedes C6 report/summary RPCs rather than leaving two live admin contracts", () => {
  assert.match(cleanup, /drop function if exists public\.marketplace_owner_admin_summary\(\)/);
  assert.match(cleanup, /drop function if exists public\.marketplace_owner_admin_reports\(text\)/);
  assert.match(cleanup, /drop function if exists public\.marketplace_owner_admin_resolve_report\(uuid,text,text\)/);
});


test("C7C seller-only suspension stays distinct from full Marketplace-account suspension", () => {
  const active = cleanup.match(/create or replace function herdharbor_private\.marketplace_current_account_active[\s\S]*?\$c7c_active\$;/i)?.[0] || "";
  assert.match(active, /marketplace_account_suspensions/);
  assert.doesNotMatch(active, /marketplace_public_profiles[\s\S]*marketplace_status = 'suspended'/);

  assert.match(cleanup, /marketplace_prevent_suspended_account_activation/);
  assert.match(cleanup, /new\.marketplace_status='active'/);
  assert.match(cleanup, /s\.lifted_at is null/);
  assert.match(cleanup, /Reactivate the Marketplace account suspension before activating the seller profile/);
});


test("C7C rejects self-target reports before they can misattribute moderation", () => {
  const report = cleanup.match(/create or replace function public\.marketplace_member_submit_report[\s\S]*?\$c7c_submit_report\$;/i)?.[0] || "";

  assert.match(report, /l\.seller_id<>actor/);
  assert.match(report, /p\.user_id<>actor/);
  assert.match(report, /m\.sender_id<>actor/);
  assert.match(report, /cm\.user_id<>actor/);

  const adminReports = cleanup.match(/create or replace function public\.marketplace_owner_admin_reports_v2[\s\S]*?\$c7c_admin_reports\$;/i)?.[0] || "";
  assert.match(adminReports, /x\.effective_reported_user_id<>x\.reporter_id/);
  assert.match(adminReports, /account_role,''\)\)='owner'/);
});


test("C7C suspension history survives repeat suspend/reactivate cycles", () => {
  assert.match(cleanup, /suspension_id uuid primary key default gen_random_uuid\(\)/);
  assert.match(cleanup, /marketplace_account_suspensions_one_active/);
  assert.match(cleanup, /where lifted_at is null/);
  assert.match(cleanup, /on conflict\(user_id\) where lifted_at is null do update/);
  assert.match(cleanup, /prior_profile_status=excluded\.prior_profile_status/);

  const reactivate = cleanup.match(/create or replace function public\.marketplace_owner_admin_reactivate_account[\s\S]*?\$c7c_reactivate\$;/i)?.[0] || "";
  assert.match(reactivate, /update public\.marketplace_account_suspensions[\s\S]*where suspension_id=row_value\.suspension_id[\s\S]*lifted_at is null/);
  assert.match(reactivate, /update public\.marketplace_public_profiles[\s\S]*where user_id=row_value\.user_id and marketplace_status='suspended'/);
});


test("C7C serializes abuse rate limits and blocks suspended recipients", () => {
  const send = cleanup.match(/create or replace function public\.marketplace_member_send_message[\s\S]*?\$c7c_send_message\$;/i)?.[0] || "";
  assert.match(send, /pg_advisory_xact_lock\(hashtextextended\('marketplace-message-rate:'\|\|actor::text,0\)\)/);
  assert.match(send, /marketplace_account_suspensions s/);
  assert.match(send, /other\.user_id<>actor/);

  const report = cleanup.match(/create or replace function public\.marketplace_member_submit_report[\s\S]*?\$c7c_submit_report\$;/i)?.[0] || "";
  assert.match(report, /pg_advisory_xact_lock\(hashtextextended\('marketplace-report-rate:'\|\|actor::text,0\)\)/);
});

test("C7C conversation reports excerpt only the reported participant's content", () => {
  const reports = cleanup.match(/create or replace function public\.marketplace_owner_admin_reports_v2[\s\S]*?\$c7c_admin_reports\$;/i)?.[0] || "";
  assert.match(reports, /m2\.sender_id<>r\.reporter_id/);
});


test("C7C Admin separates seller-only suspensions from full account suspensions", () => {
  const summary = cleanup.match(/create or replace function public\.marketplace_owner_admin_summary_v2[\s\S]*?\$c7c_admin_summary\$;/i)?.[0] || "";
  const sellers = cleanup.match(/create or replace function public\.marketplace_owner_admin_sellers[\s\S]*?\$c7c_sellers\$;/i)?.[0] || "";

  assert.match(summary, /p\.marketplace_status='suspended'/);
  assert.match(summary, /not exists \([\s\S]*marketplace_account_suspensions/);
  assert.match(sellers, /not exists \([\s\S]*marketplace_account_suspensions/);
  assert.match(sellers, /s\.lifted_at is null/);
});


test("C7C Storage mutations preserve Admin-removed listing evidence", () => {
  assert.match(cleanup, /marketplace_storage_object_mutable/);
  assert.match(cleanup, /l\.state='removed'/);
  assert.match(cleanup, /ph\.seller_id=\(select auth\.uid\(\)\)/);
  assert.match(cleanup, /drop policy if exists marketplace_storage_member_own_update/);
  assert.match(cleanup, /drop policy if exists marketplace_storage_member_own_delete/);
  assert.match(cleanup, /marketplace_current_account_active\(\)/);
});


test("C7C indexes current rate-limit and high-traffic Marketplace paths", () => {
  for (const index of [
    "marketplace_messages_sender_rate_idx",
    "marketplace_reports_reporter_rate_idx",
    "marketplace_moderation_actions_created_idx",
    "marketplace_favorites_user_created_idx",
    "marketplace_listings_public_newest_idx",
    "marketplace_public_profiles_status_updated_idx",
    "marketplace_account_suspensions_active_created_idx"
  ]) {
    assert.match(cleanup, new RegExp("create index if not exists " + index));
  }
});


test("C7C Owner Admin access is independent of seller-profile status", () => {
  const active = cleanup.match(/create or replace function herdharbor_private\.marketplace_current_account_active[\s\S]*?\$c7c_active\$;/i)?.[0] || "";
  assert.doesNotMatch(active, /marketplace_public_profiles[\s\S]*marketplace_status/);
  assert.match(cleanup, /drop trigger if exists marketplace_prevent_owner_self_lockout/);
  assert.match(cleanup, /drop function if exists herdharbor_private\.marketplace_prevent_owner_self_lockout\(\)/);
});


test("C7C conversation blocking works without public seller profiles or exposed user IDs", () => {
  assert.match(cleanup, /drop function if exists public\.marketplace_member_block_profile\(uuid\)/);

  const state = cleanup.match(/create or replace function public\.marketplace_member_conversation_block_state[\s\S]*?\$c7c_block_state\$;/i)?.[0] || "";
  const setBlock = cleanup.match(/create or replace function public\.marketplace_member_set_conversation_block[\s\S]*?\$c7c_set_block\$;/i)?.[0] || "";

  for (const block of [state,setBlock]) {
    assert.match(block, /marketplace_current_user_is_conversation_member/);
    assert.match(block, /cm\.user_id<>actor/);
    assert.doesNotMatch(block, /public_id_value|target_user_id|peer_id_value/);
  }

  assert.match(setBlock, /insert into public\.marketplace_blocks\(blocker_id,blocked_id\)/);
  assert.match(setBlock, /delete from public\.marketplace_blocks/);
});


test("C7C Storage writes are limited to Marketplace-generated path shapes", () => {
  const helper = cleanup.match(/create or replace function herdharbor_private\.marketplace_storage_object_insert_allowed[\s\S]*?\$c7c_storage_insert\$;/i)?.[0] || "";

  assert.match(helper, /\^profiles\/avatar-/);
  assert.match(helper, /\^listings\//);
  assert.match(helper, /photo-\[0-5\]-/);
  assert.match(helper, /listing_uuid := listing_text::uuid/);
  assert.match(helper, /l\.seller_id=\(select auth\.uid\(\)\)/);
  assert.match(helper, /l\.state<>'removed'/);

  assert.match(cleanup, /drop policy if exists marketplace_storage_member_own_insert/);
  assert.match(cleanup, /marketplace_storage_object_insert_allowed\(name\)/);
});


test("C7C reports preserve immutable evidence and reported account identity", () => {
  assert.match(cleanup, /add column if not exists reported_user_id uuid references auth\.users\(id\) on delete set null/);
  assert.match(cleanup, /add column if not exists target_snapshot jsonb not null default '\{\}'::jsonb/);

  const submit = cleanup.match(/create or replace function public\.marketplace_member_submit_report[\s\S]*?\$c7c_submit_report\$;/i)?.[0] || "";
  assert.match(submit, /reported_user uuid/);
  assert.match(submit, /target_snapshot jsonb/);
  assert.match(submit, /'description',left\(coalesce\(l\.description,''\),2000\)/);
  assert.match(submit, /'body',left\(m\.body,2000\)/);
  assert.match(submit, /reported_user_id,target_snapshot/);

  const reports = cleanup.match(/create or replace function public\.marketplace_owner_admin_reports_v2[\s\S]*?\$c7c_admin_reports\$;/i)?.[0] || "";
  assert.match(reports, /effective_reported_user_id/);
  assert.match(reports, /target_snapshot->>'description'/);
  assert.match(reports, /target_snapshot->>'body'/);

  const resolve = cleanup.match(/create or replace function public\.marketplace_owner_admin_resolve_report_v2[\s\S]*?\$c7c_resolve_report\$;/i)?.[0] || "";
  assert.match(resolve, /target_user:=report_row\.reported_user_id/);
});


test("C7C caps Marketplace media bucket to supported image types and uploader size", () => {
  assert.match(cleanup, /file_size_limit=8388608/);
  assert.match(cleanup, /allowed_mime_types=array\['image\/jpeg','image\/png','image\/webp'\]::text\[\]/);
  assert.match(cleanup, /where id='marketplace-public'/);
});
