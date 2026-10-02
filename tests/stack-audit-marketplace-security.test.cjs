"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const foundation=fs.readFileSync(path.join(root,"supabase/migrations/20261002070000_v2_0_1_marketplace_foundation.sql"),"utf8");
const client=fs.readFileSync(path.join(root,"herdharbor-marketplace.js"),"utf8");

test("Marketplace browser table access matches the six direct client tables",()=>{
 const direct=[...client.matchAll(/gw\.table\(TABLES\.([a-zA-Z0-9_]+)\)/g)].map(m=>m[1]);
 assert.deepEqual([...new Set(direct)].sort(),["favorites","members","messages","photos","profiles","listings"].sort());
 assert.match(foundation,/from anon,authenticated;/);
 for(const table of ["marketplace_listing_attributes","marketplace_conversations","marketplace_message_attachments","marketplace_blocks","marketplace_reports","marketplace_moderation_actions","marketplace_notifications"]){
   const grants=[...foundation.matchAll(new RegExp("grant[^;]+on public\\."+table+"[^;]+to authenticated;","gi"))];
   assert.equal(grants.length,0,table+" must remain RPC-only");
 }
});

test("profile writes cannot self-verify or reactivate a suspended Marketplace account",()=>{
 const insert=foundation.match(/grant insert \(([^)]+)\)\s+on public\.marketplace_public_profiles to authenticated;/i)?.[1]||"";
 const update=foundation.match(/grant update \(([^)]+)\)\s+on public\.marketplace_public_profiles to authenticated;/i)?.[1]||"";
 for(const protectedColumn of ["verification_status","marketplace_status","member_since","created_at","updated_at"]){
   assert.equal(insert.includes(protectedColumn),false,protectedColumn);
   assert.equal(update.includes(protectedColumn),false,protectedColumn);
 }
 for(const editable of ["display_name","rabbitry_name","avatar_path","city","region","about","species_breeds"]){
   assert.ok(update.includes(editable),editable);
 }
});

test("conversation membership updates cannot rewrite role identity or conversation ownership",()=>{
 const update=foundation.match(/grant update \(([^)]+)\)\s+on public\.marketplace_conversation_members to authenticated;/i)?.[1]||"";
 assert.deepEqual(update.split(",").map(x=>x.trim()).filter(Boolean),["unread_count","muted_at","archived_at"]);
 for(const protectedColumn of ["conversation_id","user_id","role","joined_at"]) assert.equal(update.includes(protectedColumn),false,protectedColumn);
});

test("listing child rows are bound to a listing actually owned by the authenticated seller",()=>{
 const photo=foundation.slice(foundation.indexOf("create policy marketplace_listing_photos_owner_all"),foundation.indexOf("create policy marketplace_listing_attributes_owner_all"));
 const attr=foundation.slice(foundation.indexOf("create policy marketplace_listing_attributes_owner_all"),foundation.indexOf("create policy marketplace_favorites_owner_all"));
 for(const block of [photo,attr]){
   assert.match(block,/exists \([\s\S]*from public\.marketplace_listings l/);
   assert.match(block,/l\.seller_id=\(select auth\.uid\(\)\)/);
 }
 assert.match(photo,/l\.id=marketplace_listing_photos\.listing_id/);
 assert.match(attr,/l\.id=marketplace_listing_attributes\.listing_id/);
});

test("messages can be inserted and read but not directly edited or deleted by the browser",()=>{
 assert.match(foundation,/grant select on[\s\S]*public\.marketplace_messages[\s\S]*to authenticated;/);
 assert.match(foundation,/grant insert \(conversation_id,sender_id,body\) on public\.marketplace_messages to authenticated;/);
 assert.doesNotMatch(foundation,/grant update[^;]*on public\.marketplace_messages/i);
 assert.doesNotMatch(foundation,/grant delete[^;]*on public\.marketplace_messages/i);
});
