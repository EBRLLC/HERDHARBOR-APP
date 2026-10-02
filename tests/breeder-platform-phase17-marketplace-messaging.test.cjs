"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const market=require("../herdharbor-marketplace.js");
const migration=fs.readFileSync(path.resolve(__dirname,"..","supabase/migrations/20261002075000_v2_0_1_marketplace_messaging.sql"),"utf8");

test("conversation opening derives participants server-side",()=>{
 assert.match(migration,/marketplace_open_listing_conversation/);
 assert.match(migration,/select l\.seller_id into seller/);
 assert.match(migration,/values \(new_id,caller,'buyer'\),\(new_id,seller,'seller'\)/);
});

test("inbox is authenticated-member scoped",()=>{
 assert.match(migration,/m\.user_id=\(select auth\.uid\(\)\)/);
 assert.match(migration,/lower\(folder\)='buying'/);
 assert.match(migration,/lower\(folder\)='selling'/);
 assert.match(migration,/lower\(folder\)='unread'/);
});

test("client sends only Marketplace messages",async()=>{
 const calls=[];
 const chain={select(){return this;},single(){return Promise.resolve({data:{id:"m1"},error:null});}};
 const fake={async user(){return {id:"u1"};},table(name){return {insert(payload){calls.push([name,payload]);return chain;}};}};
 await market.sendMessage("c1","hello",fake);
 assert.equal(calls[0][0],"marketplace_messages");
 assert.equal(calls[0][1].conversation_id,"c1");
});

test("realtime listens only to one Marketplace conversation",()=>{
 const calls=[];
 const channel={on(event,filter){calls.push([event,filter]);return this;},subscribe(){return this;}};
 market.subscribeConversation("c1",()=>{},{channel(){return channel;}});
 assert.equal(calls[0][1].table,"marketplace_messages");
 assert.equal(calls[0][1].filter,"conversation_id=eq.c1");
});
