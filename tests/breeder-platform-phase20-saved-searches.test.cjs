"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const market=require("../herdharbor-marketplace.js");
const root=path.resolve(__dirname,"..");
const migration=fs.readFileSync(path.join(root,"supabase/migrations/20261002082000_v2_0_1_marketplace_saved_searches.sql"),"utf8");
const source=fs.readFileSync(path.join(root,"herdharbor-marketplace.js"),"utf8");

test("saved searches are owner scoped with server-side CRUD",()=>{
 assert.match(migration,/marketplace_saved_searches_owner_select[\s\S]*auth\.uid\(\)\)=user_id/);
 assert.match(migration,/marketplace_saved_searches_owner_update[\s\S]*with check \(\(select auth\.uid\(\)\)=user_id\)/);
 assert.match(migration,/marketplace_save_search/);
 assert.match(migration,/marketplace_delete_saved_search/);
});

test("new available listings generate deduplicated saved-search alerts on the server",()=>{
 assert.match(migration,/create trigger marketplace_notify_saved_searches/);
 assert.match(migration,/'saved_search_match'/);
 assert.match(migration,/'saved-search:'\|\|s\.id::text\|\|':'\|\|new\.id::text/);
 assert.match(migration,/on conflict \(user_id,dedupe_key\)/);
});

test("saved-search matching mirrors Marketplace search filters",()=>{
 for(const term of ["search_text","species","breed","sex","min_price_cents","max_price_cents","pedigree_status","region"]) assert.ok(migration.includes(term),term);
 assert.match(migration,/new\.seller_id/);
});

test("in-app is current delivery channel while preferences leave room for later push or email",()=>{
 assert.match(migration,/delivery_preferences jsonb/);
 assert.match(migration,/Phase 20 uses in-app notifications/);
 assert.match(migration,/future email\/push channels/);
});

test("client can save apply toggle and delete searches without touching herd persistence",()=>{
 for(const fn of ["saveSearch","listSavedSearches","deleteSavedSearch","applySavedSearchToForm","renderSavedSearches"]) assert.ok(source.includes("function "+fn)||source.includes("async function "+fn),fn);
 assert.doesNotMatch(source,/HerdHarborStateStore|commitState|saveState/);
 assert.match(source,/id="hh-market-save-search"/);
 assert.match(source,/id="hh-market-saved-searches"/);
});

test("saved search payload is normalized from server search arguments",()=>{
 const payload=market.savedSearchPayloadFromFilters({search:"blue",species:"Rabbit",minPriceCents:5000,maxPriceCents:12000},"Blue rabbits",true,null);
 assert.equal(payload.search_name,"Blue rabbits");
 assert.equal(payload.search_text_value,"blue");
 assert.equal(payload.species_value,"Rabbit");
 assert.equal(payload.min_price_value,5000);
 assert.equal(payload.max_price_value,12000);
 assert.equal(payload.alerts_value,true);
});


test("saved-search alerts only target listings that remain publicly visible",()=>{
 const start=migration.indexOf("marketplace_notify_saved_searches()");
 const end=migration.indexOf("drop trigger if exists marketplace_notify_saved_searches",start);
 const block=migration.slice(start,end);
 assert.match(block,/new\.expires_at is not null and new\.expires_at<=now\(\)/);
 assert.match(block,/marketplace_public_profiles p/);
 assert.match(block,/p\.user_id=new\.seller_id/);
 assert.match(block,/p\.marketplace_status='active'/);
});
