"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const market=require("../herdharbor-marketplace.js");
const root=path.resolve(__dirname,"..");
const migration=fs.readFileSync(path.join(root,"supabase/migrations/20261002083000_v2_0_1_marketplace_seller_feedback.sql"),"utf8");
const source=fs.readFileSync(path.join(root,"herdharbor-marketplace.js"),"utf8");

test("seller reviews require a sold listing and verified buyer conversation membership",()=>{
 const block=migration.slice(migration.indexOf("marketplace_submit_review"),migration.indexOf("marketplace_seller_feedback_summary"));
 assert.match(block,/l\.state='sold'/);
 assert.match(block,/m\.user_id=caller/);
 assert.match(block,/m\.role='buyer'/);
 assert.match(block,/verified_transaction\)\s*values[\s\S]*true/);
});

test("one buyer can leave one review per sold listing",()=>{
 assert.match(migration,/unique\(listing_id,reviewer_id,seller_id\)/);
 assert.match(migration,/feedback already submitted for this transaction/);
});

test("public seller feedback exposes verified review content without reviewer account ids",()=>{
 const start=migration.indexOf("create or replace function public.marketplace_seller_feedback(");
 const sig=migration.slice(migration.indexOf("returns table",start),migration.indexOf("language sql",start));
 ["review_id uuid","rating smallint","feedback text","verified_transaction boolean","reviewer_label text","created_at timestamptz"].forEach((field)=>assert.ok(sig.includes(field),field));
 assert.equal(sig.includes("reviewer_id"),false);
 assert.equal(sig.includes("seller_id"),false);
});

test("review disputes create moderation reports and review reports can be hidden",()=>{
 assert.match(migration,/marketplace_dispute_review/);
 assert.match(migration,/values\(caller,'review'/);
 assert.match(migration,/status='disputed'/);
 assert.match(migration,/moderation_action='hide_review'/);
 assert.match(migration,/marketplace_reviews set status='hidden'/);
});

test("client review submission validates rating and uses server RPC",async()=>{
 const calls=[];
 const fake={rpc(name,args){calls.push([name,args]);return Promise.resolve({data:"review",error:null});}};
 await market.submitSellerReview("l1",5,"Good transaction",fake);
 assert.equal(calls[0][0],"marketplace_submit_review");
 assert.equal(calls[0][1].review_rating,5);
 await assert.rejects(()=>market.submitSellerReview("l1",6,"",fake),/1 to 5/);
});

test("seller profile feedback UI labels reviews as verified transactions",()=>{
 const html=market.sellerFeedbackHtml({review_count:1,average_rating:4.5,verified_review_count:1},[{review_id:"r1",rating:5,feedback:"Good",verified_transaction:true,reviewer_label:"Buyer",created_at:"2026-10-02T00:00:00Z"}]);
 assert.match(html,/Verified Marketplace transaction/);
 assert.match(html,/4\.5 \/ 5/);
 assert.match(html,/data-report-review="r1"/);
 assert.match(source,/Leave seller feedback/);
});
