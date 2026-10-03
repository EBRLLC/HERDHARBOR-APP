"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const market=require("../herdharbor-marketplace.js");
const migration=fs.readFileSync(path.resolve(__dirname,"..","supabase/migrations/20261002071000_v2_0_1_marketplace_public_profiles.sql"),"utf8");

test("public seller draft is an allowlist and drops private account fields",()=>{
 const preview=market.publicProfilePreview({
  displayName:"Blue Barn",rabbitryName:"Blue Barn Rabbits",city:"Berea",state:"Kentucky",about:"Holland Lops",
  speciesBreeds:["Rabbit · Holland Lop"],email:"PRIVATE_EMAIL",phone:"PRIVATE_PHONE",street_address:"PRIVATE_STREET",billing:"PRIVATE_BILLING"
 });
 assert.deepEqual(Object.keys(preview),["display_name","rabbitry_name","avatar_path","city","region","about","species_breeds"]);
 assert.equal(JSON.stringify(preview).includes("PRIVATE_"),false);
});

test("public profile RPC returns a privacy-safe projection and no auth user id",()=>{
 const signature=migration.slice(migration.indexOf("returns table"),migration.indexOf("language sql"));
 ["display_name text","rabbitry_name text","city text","region text","about text","species_breeds jsonb","verification_status text","active_listing_count bigint"].forEach((field)=>assert.ok(signature.includes(field),field));
 ["user_id","email","phone","street","billing","subscription"].forEach((field)=>assert.equal(signature.includes(field),false,field));
 assert.match(migration,/p\.marketplace_status='active'/);
});

test("public profile function execution is deliberate for anonymous and authenticated callers",()=>{
 assert.match(migration,/revoke all on function public\.marketplace_public_profile\(uuid\) from public/);
 assert.match(migration,/grant execute on function public\.marketplace_public_profile\(uuid\) to anon, authenticated/);
});
