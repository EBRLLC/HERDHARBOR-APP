"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const market=require("../herdharbor-marketplace.js");
const root=path.resolve(__dirname,"..");
const migration=fs.readFileSync(path.join(root,"supabase/migrations/20261002073000_v2_0_1_marketplace_browse_search.sql"),"utf8");
const app=fs.readFileSync(path.join(root,"herdharbor-app-runtime.js"),"utf8");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");

test("Marketplace browse is a canonical responsive app route",()=>{
 assert.match(html,/data-route="marketplace"/);
 assert.match(html,/id="view-marketplace"/);
 assert.match(app,/marketplace: "Marketplace"/);
 assert.match(app,/renderMarketplace/);
});

test("browse and detail queries are server-side RPCs, not whole-catalog client filtering",async()=>{
 const calls=[];
 const fake={
  async user(){return {id:"u1"};},
  rpc(name,args){calls.push([name,args]);return Promise.resolve({data:[],error:null});},
  bucket(){return {getPublicUrl(){return {data:{publicUrl:""}};}};}
 };
 await market.searchListings({species:"Rabbit",breed:"Holland Lop",minPriceCents:1000,maxPriceCents:20000,limit:20},fake);
 await market.getListingDetails("00000000-0000-0000-0000-000000000001",fake);
 assert.equal(calls[0][0],"marketplace_search_listings");
 assert.equal(calls[0][1].species_filter,"Rabbit");
 assert.equal(calls[1][0],"marketplace_public_listing");
});

test("public listing RPCs never return private source/snapshot/contact/account fields",()=>{
 const searchSig=migration.slice(migration.indexOf("create or replace function public.marketplace_search_listings"),migration.indexOf("language sql",migration.indexOf("create or replace function public.marketplace_search_listings")));
 const detailStart=migration.indexOf("create or replace function public.marketplace_public_listing");
 const detailSig=migration.slice(detailStart,migration.indexOf("language sql",detailStart));
 for(const signature of [searchSig,detailSig]){
   ["source_animal_id","public_snapshot","seller_id","email","phone","street","billing","subscription"].forEach((term)=>assert.equal(signature.includes(term),false,term));
 }
});

test("Marketplace search covers intended server filters and clamps result size",()=>{
 const args=market.searchArgs({search:"blue",species:"Rabbit",breed:"Holland Lop",sex:"Female",region:"Kentucky",minPriceCents:5000,maxPriceCents:25000,pedigreeStatus:"available",limit:500,offset:10});
 assert.equal(args.search_text,"blue");
 assert.equal(args.result_limit,100);
 assert.equal(args.result_offset,10);
 assert.match(migration,/species_filter/);
 assert.match(migration,/breed_filter/);
 assert.match(migration,/sex_filter/);
 assert.match(migration,/min_price_cents/);
 assert.match(migration,/max_price_cents/);
 assert.match(migration,/pedigree_filter/);
 assert.match(migration,/region_filter/);
});

test("public media bucket contains only deliberately public Marketplace media",()=>{
 assert.match(migration,/update storage\.buckets[\s\S]*public=true[\s\S]*marketplace-public/);
 assert.doesNotMatch(migration,/marketplace-message-attachments'[\s\S]{0,120}public=true/);
});
