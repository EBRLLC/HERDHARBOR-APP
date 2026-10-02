"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const marketplace=require("../herdharbor-marketplace.js");
const root=path.resolve(__dirname,"..");
const source=fs.readFileSync(path.join(root,"herdharbor-marketplace.js"),"utf8");
const migration=fs.readFileSync(path.join(root,"supabase/migrations/20261002070000_v2_0_1_marketplace_foundation.sql"),"utf8");

test("Marketplace gateway is server-native and has no private herd persistence dependency",()=>{
 assert.doesNotMatch(source,/HerdHarborStateStore|commitState|saveState|herdharbor_user_data|herdharbor_sync_records/);
 const calls=[];
 const fake={
  from(name){calls.push(["from",name]);return {name};},
  rpc(name,args){calls.push(["rpc",name,args]);return {name,args};},
  channel(name){calls.push(["channel",name]);return {name};},
  storage:{from(name){calls.push(["bucket",name]);return {name};}},
  auth:{async getUser(){return {data:{user:{id:"u1"}}};}}
 };
 const gateway=marketplace.createGateway(fake);
 assert.equal(gateway.table(marketplace.TABLES.listings).name,"marketplace_listings");
 assert.equal(gateway.bucket(marketplace.BUCKETS.publicMedia).name,"marketplace-public");
 assert.throws(()=>gateway.table("herdharbor_user_data"),/Unknown Marketplace table/);
});

test("foundation enables RLS on every Marketplace table and grants no anon table access",()=>{
 Object.values(marketplace.TABLES).forEach((table)=>{
   assert.ok(migration.includes("alter table public."+table+" enable row level security"),table);
 });
 assert.match(migration,/revoke all on public\.marketplace_public_profiles[\s\S]*from anon;/);
 assert.doesNotMatch(migration,/grant [^;]* on public\.marketplace_[^;]* to anon;/i);
});

test("ownership and conversation policies enforce server-side authorization",()=>{
 assert.match(migration,/marketplace_listings_owner_update[\s\S]*auth\.uid\(\)\)=seller_id[\s\S]*with check/);
 assert.match(migration,/marketplace_messages_member_select[\s\S]*marketplace_is_conversation_member/);
 assert.match(migration,/marketplace_messages_member_insert[\s\S]*auth\.uid\(\)\)=sender_id[\s\S]*marketplace_is_conversation_member/);
 assert.doesNotMatch(migration,/marketplace_conversation_members_self_insert/);
 assert.match(migration,/revoke insert,delete on public\.marketplace_conversation_members from authenticated/);
 assert.match(migration,/revoke insert,update,delete on public\.marketplace_conversations from authenticated/);
});

test("public source animal ids cannot be enumerated because listing table has no anon read grant or policy",()=>{
 assert.match(migration,/source_animal_id text/);
 assert.doesNotMatch(migration,/create policy [^\n]* on public\.marketplace_listings for select to anon/i);
 assert.doesNotMatch(migration,/grant select on public\.marketplace_listings to anon/i);
});

test("Marketplace storage is private-by-default and owner constrained",()=>{
 assert.match(migration,/marketplace-public','marketplace-public',false/);
 assert.match(migration,/marketplace-message-attachments','marketplace-message-attachments',false/);
 assert.match(migration,/owner_id=\(select auth\.uid\(\)::text\)/);
});
