"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
require("../herdharbor-pedigree-platform.js");
const market=require("../herdharbor-marketplace.js");
const migration=fs.readFileSync(path.resolve(__dirname,"..","supabase/migrations/20261002074000_v2_0_1_marketplace_public_pedigree.sql"),"utf8");

test("public pedigree snapshot uses opaque keys and strips private animal fields before storage",()=>{
 const animals=[
  {id:"private-root",name:"Root",sireId:"private-sire",damId:"private-dam",notes:"PRIVATE_NOTE",medicalNotes:"PRIVATE_MEDICAL",genotype:"Aa"},
  {id:"private-sire",name:"Sire",sex:"Male",email:"PRIVATE_CONTACT",genotype:"Bb"},
  {id:"private-dam",name:"Dam",sex:"Female",acquisitionNotes:"PRIVATE_ACQUISITION"}
 ];
 const snapshot=market.buildPublicPedigreeSnapshot(animals,"private-root",{visibility:"3",ancestorFields:["name","sex","genotype","notes","email"]});
 const text=JSON.stringify(snapshot);
 assert.equal(text.includes("private-root"),false);
 assert.equal(text.includes("private-sire"),false);
 assert.equal(text.includes("private-dam"),false);
 assert.equal(text.includes("PRIVATE_"),false);
 assert.equal(text.includes("genotype"),false);
 assert.match(text,/"publicKey":"p1"/);
});

test("seller controls supported pedigree visibility depths without fabricating deeper data",()=>{
 assert.equal(market.publicPedigreeDepth("hidden"),0);
 assert.equal(market.publicPedigreeDepth("parents"),2);
 assert.equal(market.publicPedigreeDepth("3"),3);
 assert.equal(market.publicPedigreeDepth("4"),4);
 assert.equal(market.publicPedigreeDepth("5"),5);
 const snapshot=market.buildPublicPedigreeSnapshot([{id:"r",name:"R"}],"r",{visibility:"5",ancestorFields:["name"]});
 assert.equal(snapshot.pedigree.nodes.length,31);
 assert.equal(snapshot.pedigree.nodes.filter(n=>n.known).length,1);
});

test("database trigger re-sanitizes public pedigree instead of trusting the browser",()=>{
 assert.match(migration,/create trigger marketplace_sanitize_public_pedigree/);
 assert.match(migration,/marketplace_sanitize_public_pedigree\(payload jsonb\)/);
 ["name","rabbitry","sex","dob","breed","variety","color","weight","registrationNumber","gcNumber","photoData"].forEach((field)=>assert.ok(migration.includes("'"+field+"'"),field));
 ["notes","medical","acquisition","email","phone","genotype","source_animal_id","user_id"].forEach((term)=>{
   const sanitize=migration.slice(migration.indexOf("marketplace_sanitize_public_pedigree"),migration.indexOf("create or replace function herdharbor_private.marketplace_sanitize_listing_pedigree"));
   assert.equal(sanitize.includes("'"+term+"'"),false,term);
 });
});

test("public pedigree RPC reads only the pre-sanitized listing object and not private herd state",()=>{
 const start=migration.indexOf("create or replace function public.marketplace_public_pedigree");
 const block=migration.slice(start,migration.indexOf("revoke all on function public.marketplace_public_pedigree",start));
 assert.match(block,/l\.public_pedigree/);
 assert.doesNotMatch(block,/herdharbor_user_data|herdharbor_sync_records|source_animal_id|email|phone/);
});

test("public Marketplace renderer reuses unified pedigree renderer public mode",()=>{
 const snapshot=market.buildPublicPedigreeSnapshot([{id:"r",name:"R"}],"r",{visibility:"3",ancestorFields:["name"]});
 const html=market.renderPublicPedigree(snapshot.pedigree);
 assert.match(html,/data-mode="publicMarketplace"/);
 assert.doesNotMatch(html,/genotype|PRIVATE_/i);
});
