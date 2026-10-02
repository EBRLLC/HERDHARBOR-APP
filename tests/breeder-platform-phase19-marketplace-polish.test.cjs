"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const market=require("../herdharbor-marketplace.js");
const root=path.resolve(__dirname,"..");
const migration=fs.readFileSync(path.join(root,"supabase/migrations/20261002081000_v2_0_1_marketplace_polish.sql"),"utf8");
const source=fs.readFileSync(path.join(root,"herdharbor-marketplace.js"),"utf8");

test("seller listing management stays owner-scoped and supports planned lifecycle states",()=>{
 assert.match(migration,/l\.seller_id=\(select auth\.uid\(\)\)/);
 assert.match(migration,/desired not in \('draft','available','pending','sold','archived'\)/);
 assert.deepEqual(market.stateActionsForListing("available"),["pending","sold","archived"]);
 assert.deepEqual(market.stateActionsForListing("expired"),["available","archived"]);
});

test("stale listing reminders are server generated and deduplicated",()=>{
 assert.match(migration,/kind,'stale_listing'/);
 assert.match(migration,/now\(\)-interval '30 days'/);
 assert.match(migration,/on conflict \(user_id,dedupe_key\)/);
 assert.match(migration,/state='expired'/);
});

test("favorites and notifications are private authenticated projections",()=>{
 const fav=migration.slice(migration.indexOf("marketplace_my_favorites"),migration.indexOf("commit;"));
 assert.match(fav,/f\.user_id=\(select auth\.uid\(\)\)/);
 const note=migration.slice(migration.indexOf("marketplace_my_notifications"),migration.indexOf("marketplace_mark_notification_read"));
 assert.match(note,/n\.user_id=\(select auth\.uid\(\)\)/);
});

test("photo upload is isolated to Marketplace storage and listing metadata",()=>{
 assert.match(source,/BUCKETS\.publicMedia/);
 assert.match(source,/TABLES\.photos/);
 assert.doesNotMatch(source,/HerdHarborStateStore|commitState|saveState/);
 assert.match(source,/image\/webp/);
 assert.match(source,/maxSide=1600/);
});

test("Marketplace screen includes accessible loading state and mobile management entry points",()=>{
 assert.match(source,/aria-live="polite"/);
 assert.match(source,/aria-busy="true"/);
 for(const id of ["hh-market-notifications","hh-market-saved","hh-market-my-listings","hh-market-messages","hh-market-sell"]) assert.ok(source.includes(id),id);
 assert.match(source,/type="reset"/);
});

test("seller profile expansion uses only the public seller profile API",()=>{
 assert.match(source,/getPublicSellerProfile\(row\.seller_public_id/);
 assert.doesNotMatch(source,/row\.seller_id/);
});
