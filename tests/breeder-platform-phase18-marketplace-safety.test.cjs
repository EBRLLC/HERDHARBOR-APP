"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const market=require("../herdharbor-marketplace.js");
const root=path.resolve(__dirname,"..");
const migration=fs.readFileSync(path.join(root,"supabase/migrations/20261002080000_v2_0_1_marketplace_moderation.sql"),"utf8");

test("Marketplace admin authorization comes from server-side account_access",()=>{
 const block=migration.slice(migration.indexOf("marketplace_is_admin"),migration.indexOf("marketplace_conversation_is_blocked"));
 assert.match(block,/public\.account_access/);
 assert.match(block,/account_role in \('owner','admin'\)/);
 assert.match(block,/account_status='active'/);
 assert.match(block,/auth\.uid\(\)/);
});

test("Marketplace suspension is isolated from account and private herd state",()=>{
 const start=migration.indexOf("marketplace_moderate_report");
 const block=migration.slice(start,migration.indexOf("comment on function public.marketplace_moderate_report",start));
 assert.match(block,/marketplace_public_profiles set marketplace_status='suspended'/);
 assert.doesNotMatch(block,/update public\.account_access|herdharbor_user_data|herdharbor_sync_records|delete from auth/);
});

test("moderation actions are target-specific and audited",()=>{
 assert.match(migration,/hide_listing requires a listing report/);
 assert.match(migration,/suspend_marketplace requires a user report/);
 assert.match(migration,/insert into public\.marketplace_moderation_actions/);
 assert.match(migration,/jsonb_build_object\('report_id',target_report_id\)/);
});

test("blocking prevents both new conversations and messages in existing conversations",()=>{
 assert.match(migration,/marketplace_conversation_is_blocked/);
 assert.match(migration,/not herdharbor_private\.marketplace_conversation_is_blocked\(conversation_id\)/);
 const prior=fs.readFileSync(path.join(root,"supabase/migrations/20261002075000_v2_0_1_marketplace_messaging.sql"),"utf8");
 assert.match(prior,/marketplace_blocks/);
});

test("rate limits apply to messages and reports",()=>{
 assert.match(migration,/recent_count>=20[\s\S]*message rate limit exceeded/);
 assert.match(migration,/recent_count>=10[\s\S]*report rate limit exceeded/);
});

test("client safety actions call only Marketplace RPCs",async()=>{
 const calls=[];
 const fake={rpc(name,args){calls.push([name,args]);return Promise.resolve({data:"ok",error:null});}};
 await market.submitReport("listing","l1","misleading","",fake);
 await market.blockPublicProfile("p1",fake);
 await market.moderateReport("r1","dismiss","done",fake);
 assert.deepEqual(calls.map(x=>x[0]),["marketplace_submit_report","marketplace_block_profile","marketplace_moderate_report"]);
});
