"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const market=require("../herdharbor-marketplace.js");
const root=path.resolve(__dirname,"..");
const migration=fs.readFileSync(path.join(root,"supabase/migrations/20261002084000_v2_0_1_marketplace_trust_indicators.sql"),"utf8");

test("trust indicators expose factual aggregates without a composite score",()=>{
 const sig=migration.slice(migration.indexOf("returns table"),migration.indexOf("language sql"));
 ["marketplace_member_since","verification_status","sold_listing_count","accepted_transfer_count","repeat_transfer_recipient_count","verified_review_count","average_rating"].forEach((field)=>assert.ok(sig.includes(field),field));
 assert.equal(sig.includes("trust_score"),false);
 assert.match(migration,/No composite score or hidden weighting/);
});

test("accepted transfer evidence uses completed HerdHarbor transfers and does not expose counterpart ids",()=>{
 assert.match(migration,/herdharbor_direct_animal_transfers/);
 assert.match(migration,/accepted_at is not null/);
 assert.match(migration,/having count\(\*\)>=2/);
 const sig=migration.slice(migration.indexOf("returns table"),migration.indexOf("language sql"));
 assert.equal(sig.includes("recipient_id"),false);
});

test("seller trust panel labels each indicator separately",()=>{
 const html=market.trustIndicatorsHtml({
  marketplace_member_since:"2026-01-01T00:00:00Z",verification_status:"verified",sold_listing_count:3,
  accepted_transfer_count:5,repeat_transfer_recipient_count:2,verified_review_count:4,average_rating:4.75
 });
 assert.match(html,/Sold Marketplace listings/);
 assert.match(html,/Accepted HerdHarbor transfers/);
 assert.match(html,/Repeat transfer partners/);
 assert.match(html,/Verified transaction reviews/);
 assert.match(html,/does not combine them into a trust score/);
});

test("verification wording distinguishes verified pending and not verified without inventing status",()=>{
 assert.match(market.trustIndicatorsHtml({marketplace_member_since:"2026-01-01",verification_status:"verified"}),/>verified</);
 assert.match(market.trustIndicatorsHtml({marketplace_member_since:"2026-01-01",verification_status:"pending"}),/>pending</);
 assert.match(market.trustIndicatorsHtml({marketplace_member_since:"2026-01-01",verification_status:"none"}),/>not verified</);
});
