"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const migration=fs.readFileSync(path.join(root,"supabase/migrations/20261002086000_v2_0_1_marketplace_suspension_enforcement.sql"),"utf8");

test("Marketplace suspension has one server-side active-member predicate",()=>{
 assert.match(migration,/marketplace_is_active_member\(target_user uuid\)/);
 assert.match(migration,/p\.marketplace_status='active'/);
 assert.match(migration,/set search_path=''/);
 assert.match(migration,/grant execute on function herdharbor_private\.marketplace_is_active_member\(uuid\) to authenticated/);
});

test("suspended sellers cannot create or update listing content",()=>{
 const listing=migration.slice(migration.indexOf("marketplace_listings_owner_insert"),migration.indexOf("-- Split photo"));
 assert.match(listing,/marketplace_is_active_member/);
 assert.match(migration,/marketplace_enforce_active_listing_writer/);
 assert.match(migration,/tg_op<>'DELETE'/);
 assert.match(migration,/if tg_op='DELETE' then[\s\S]*return old;[\s\S]*return new;/);
 assert.match(migration,/marketplace access suspended/);
});

test("suspension blocks new Marketplace conversations messages and verified reviews",()=>{
 for(const trigger of [
  "marketplace_enforce_active_conversation_creator",
  "marketplace_enforce_active_message_sender",
  "marketplace_enforce_active_reviewer"
 ]) assert.ok(migration.includes(trigger),trigger);
 assert.match(migration,/caller=new\.created_by[\s\S]*marketplace_is_active_member/);
 assert.match(migration,/caller=new\.sender_id[\s\S]*marketplace_is_active_member/);
 assert.match(migration,/caller=new\.reviewer_id[\s\S]*marketplace_is_active_member/);
});

test("suspended accounts cannot upload or replace Marketplace storage objects",()=>{
 const storage=migration.slice(migration.indexOf("drop policy if exists marketplace_storage_owner_insert"),migration.indexOf("comment on function"));
 assert.match(storage,/for insert to authenticated[\s\S]*marketplace_is_active_member/);
 assert.match(storage,/for update to authenticated[\s\S]*marketplace_is_active_member/);
 assert.doesNotMatch(storage,/drop policy if exists marketplace_storage_owner_delete/);
});

test("suspension enforcement remains Marketplace-only",()=>{
 assert.doesNotMatch(migration,/update public\.account_access|herdharbor_user_data|herdharbor_sync_records|delete from auth/i);
});
