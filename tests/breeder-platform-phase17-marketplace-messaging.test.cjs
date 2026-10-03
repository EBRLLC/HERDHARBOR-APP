"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const market=require("../herdharbor-marketplace.js");
const root=path.resolve(__dirname,"..");
const migration=fs.readFileSync(path.join(root,"supabase/migrations/20261002075000_v2_0_1_marketplace_messaging.sql"),"utf8");
const source=fs.readFileSync(path.join(root,"herdharbor-marketplace.js"),"utf8");

test("listing conversation membership is created server-side from authenticated caller and listing seller",()=>{
 const block=migration.slice(migration.indexOf("marketplace_open_listing_conversation"),migration.indexOf("create or replace function public.marketplace_inbox"));
 assert.match(block,/caller uuid := \(select auth\.uid\(\)\)/);
 assert.match(block,/select l\.seller_id into seller/);
 assert.match(block,/values \(new_id,caller,'buyer'\),\(new_id,seller,'seller'\)/);
 assert.doesNotMatch(block,/target_seller|seller_id uuid default/);
});

test("blocked users cannot open Marketplace conversations",()=>{
 assert.match(migration,/marketplace_blocks[\s\S]*blocker_id=caller[\s\S]*blocked_id=seller/);
 assert.match(migration,/conversation unavailable/);
});

test("inbox RPC is scoped to auth.uid and supports Buying Selling Unread filters",()=>{
 const block=migration.slice(migration.indexOf("create or replace function public.marketplace_inbox"),migration.indexOf("create or replace function herdharbor_private.marketplace_message_unread"));
 assert.match(block,/m\.user_id=\(select auth\.uid\(\)\)/);
 assert.match(block,/lower\(folder\)='buying'/);
 assert.match(block,/lower\(folder\)='selling'/);
 assert.match(block,/lower\(folder\)='unread'/);
});

test("message sending stays in Marketplace tables and never invokes private herd sync",async()=>{
 assert.doesNotMatch(source,/HerdHarborStateStore|commitState|saveState/);
 const calls=[];
 const chain={select(){return this;},single(){return Promise.resolve({data:{id:"m1"},error:null});}};
 const fake={async user(){return {id:"u1"};},table(name){return {insert(payload){calls.push([name,payload]);return chain;}};}};
 await market.sendMessage("c1","hello",fake);
 assert.equal(calls[0][0],"marketplace_messages");
 assert.equal(calls[0][1].conversation_id,"c1");
 assert.equal(calls[0][1].sender_id,"u1");
});

test("realtime subscription is scoped to one conversation and message table",()=>{
 const calls=[];
 const channel={on(event,filter,handler){calls.push([event,filter]);return this;},subscribe(){calls.push(["subscribe"]);return this;}};
 const fake={channel(){return channel;}};
 market.subscribeConversation("c1",()=>{},fake);
 assert.equal(calls[0][0],"postgres_changes");
 assert.equal(calls[0][1].table,"marketplace_messages");
 assert.equal(calls[0][1].filter,"conversation_id=eq.c1");
 assert.match(migration,/alter publication supabase_realtime add table public\.marketplace_messages/);
});


test("message threads bound initial history and append realtime events without full refetch loops",()=>{
 assert.match(source,/\.order\("created_at",\{ascending:false\}\)[\s\S]*\.limit\(200\)/);
 assert.match(source,/realtime=subscribeConversation\(conversationId,appendMessage,gw\)/);
 assert.doesNotMatch(source,/subscribeConversation\(conversationId,function\(\)\{void openThread\(conversationId\);\},gw\)/);
 assert.match(source,/const sent=await sendMessage[\s\S]*appendMessage\(sent\)/);
});


test("muting suppresses interruption state but does not silently mark future messages read",()=>{
 const block=migration.slice(migration.indexOf("marketplace_message_unread()"),migration.indexOf("drop trigger if exists marketplace_message_unread"));
 assert.match(block,/unread_count=unread_count\+1/);
 assert.match(block,/user_id<>new\.sender_id/);
 assert.doesNotMatch(block,/muted_at is null/);
});

test("an already-open realtime thread clears the server unread increment after displaying an incoming message",()=>{
 const start=source.indexOf("async function openThread(conversationId)");
 const end=source.indexOf("host.querySelectorAll",start);
 const block=source.slice(start,end);
 assert.match(block,/subscribeConversation\(conversationId,function\(message\)/);
 assert.match(block,/appendMessage\(message\)/);
 assert.match(block,/message\?\.sender_id[\s\S]*user\.id[\s\S]*updateConversationMember\(conversationId,\{unread_count:0\}/);
});
