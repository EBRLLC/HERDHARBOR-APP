"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
require("../herdharbor-pedigree-platform.js");
const docs=require("../herdharbor-document-center.js");
const market=require("../herdharbor-marketplace.js");
const root=path.resolve(__dirname,"..");
const migration=fs.readFileSync(path.join(root,"supabase/migrations/20261002085000_v2_0_1_marketplace_breeder_extensions.sql"),"utf8");
const source=fs.readFileSync(path.join(root,"herdharbor-marketplace.js"),"utf8");
const appRuntime=fs.readFileSync(path.join(root,"herdharbor-app-runtime.js"),"utf8");
const appHtml=fs.readFileSync(path.join(root,"index.html"),"utf8");

test("Phase 24 supports individual future-offspring and litter-announcement listing types",()=>{
 assert.deepEqual(market.LISTING_KINDS,["individual","future_offspring","litter_announcement"]);
 assert.equal(market.normalizeListingKind("future_offspring"),"future_offspring");
 assert.equal(market.listingKindLabel("future_offspring"),"Future offspring");
 assert.equal(market.listingKindLabel("litter_announcement"),"Litter announcement");
 assert.match(migration,/listing_kind in \('individual','future_offspring','litter_announcement'\)/);
 assert.match(source,/name="availableFrom" type="date"/);
 assert.match(source,/Listing title \/ animal name/);
});

test("seller listing extension updates are owner-scoped and public projection is deliberately narrow",()=>{
 const update=migration.slice(migration.indexOf("marketplace_update_listing_extensions"),migration.indexOf("marketplace_listing_extension"));
 assert.match(update,/seller_id=caller/);
 const start=migration.indexOf("create or replace function public.marketplace_listing_extension");
 const sig=migration.slice(migration.indexOf("returns table",start),migration.indexOf("language sql",start));
 assert.match(sig,/listing_kind text/);
 assert.match(sig,/available_from date/);
 assert.match(sig,/agreement_available boolean/);
 ["seller_id","source_animal_id","public_snapshot","email","phone","deposit"].forEach((term)=>assert.equal(sig.includes(term),false,term));
});

test("agreement templates are private reusable records and attachment creates a separate public snapshot",()=>{
 assert.match(migration,/marketplace_agreement_templates_owner_all[\s\S]*auth\.uid\(\)\)=user_id/);
 assert.match(migration,/marketplace_listing_agreements_owner_all[\s\S]*auth\.uid\(\)\)=seller_id/);
 const attach=migration.slice(migration.indexOf("marketplace_attach_agreement"),migration.indexOf("marketplace_public_agreement"));
 assert.match(attach,/template_row\.title,template_row\.body/);
 assert.match(attach,/on conflict \(listing_id\) do update/);
 assert.match(attach,/version=public\.marketplace_listing_agreements\.version\+1/);
 assert.match(migration,/Editing the private template does not silently change an attached listing agreement/);
});

test("public agreement RPC exposes only attached snapshot text and version",()=>{
 const start=migration.indexOf("create or replace function public.marketplace_public_agreement");
 const sig=migration.slice(migration.indexOf("returns table",start),migration.indexOf("language sql",start));
 assert.match(sig,/title text/);
 assert.match(sig,/body text/);
 assert.match(sig,/version integer/);
 assert.match(sig,/updated_at timestamptz/);
 ["seller_id","template_id","user_id","deposit","source_animal_id"].forEach((term)=>assert.equal(sig.includes(term),false,term));
 assert.match(migration,/grant execute on function public\.marketplace_public_agreement\(uuid\) to anon,authenticated/);
});

test("deposit records stay seller-private and HerdHarbor does not become a payment processor",()=>{
 assert.match(migration,/marketplace_deposit_records_owner_all[\s\S]*auth\.uid\(\)\)=seller_id/);
 assert.match(migration,/where d\.listing_id=target_listing_id and d\.seller_id=\(select auth\.uid\(\)\)/);
 assert.match(migration,/Seller-private deposit tracking only/);
 assert.match(migration,/does not process or hold deposit payments/);
 assert.doesNotMatch(migration,/grant execute on function public\.marketplace_deposit_records\(uuid\) to anon/i);
 assert.doesNotMatch(source,/Stripe|PayPal|paymentIntent|checkoutSession/i);
});

test("client breeder tools use Marketplace RPCs and do not route deposits or agreements through herd sync",async()=>{
 const calls=[];
 const fake={rpc(name,args){calls.push([name,args]);return Promise.resolve({data:name==="marketplace_deposit_records"?[]:"ok",error:null});}};
 await market.updateListingExtensions("l1","future_offspring","2027-01-01",fake);
 await market.saveAgreementTemplate(null,"Terms","Buyer agrees to terms.",fake);
 await market.attachAgreementTemplate("l1","t1",fake);
 await market.addDepositRecord("l1",5000,"received","Cash received outside HerdHarbor",fake);
 await market.listDepositRecords("l1",fake);
 assert.deepEqual(calls.map(x=>x[0]),[
  "marketplace_update_listing_extensions",
  "marketplace_save_agreement_template",
  "marketplace_attach_agreement",
  "marketplace_add_deposit_record",
  "marketplace_deposit_records"
 ]);
 assert.doesNotMatch(source,/HerdHarborStateStore|commitState|saveState/);
});

test("agreement snapshots render and export as standalone multi-page PDFs for long contracts",()=>{
 const body=Array.from({length:90},(_,i)=>"Clause "+(i+1)+": This is a deliberately long breeder agreement clause describing responsibilities, timing, and handoff terms.").join("\n\n");
 const model=docs.buildAgreementSnapshotModel({
  title:"Rabbit Sale Agreement",
  body,
  version:3,
  listingName:"Bluebell",
  sellerName:"Hill Farm",
  buyerName:"Buyer",
  effectiveDate:"2026-10-02",
  agreementUpdatedAt:"2026-10-02T12:00:00Z"
 });
 const html=docs.renderAgreementSnapshotHtml(model);
 const pdf=Buffer.from(docs.buildAgreementSnapshotPdfBytes(model)).toString("latin1");
 assert.match(html,/Rabbit Sale Agreement/);
 assert.match(html,/snapshot/);
 assert.match(html,/HerdHarbor does not process or hold payment/);
 assert.match(pdf,/^%PDF-1\.4/);
 const count=pdf.match(/\/Count (\d+)/);
 assert.ok(count && Number(count[1])>=2,"expected multi-page agreement PDF");
});

test("agreement download bridge reuses the shared document center rather than a second PDF system",()=>{
 assert.match(source,/HerdHarborDocumentCenter/);
 assert.match(source,/buildAgreementSnapshotModel/);
 assert.match(source,/buildAgreementSnapshotPdfBytes/);
 assert.match(source,/downloadBytes/);
 assert.match(source,/Download PDF snapshot/);
});

test("Breeder Tools exposes availability agreements and private deposits from My Listings",()=>{
 for(const term of ["Breeder Tools","Public agreement snapshot","Private deposit tracking","does not process or hold payment","Agreement Templates"]) assert.ok(source.includes(term),term);
 assert.match(source,/data-breeder-tools/);
 assert.match(source,/id="hh-market-agreements"/);
});


test("stack audit lazy-loads heavy Documents and Marketplace bundles",()=>{
 assert.doesNotMatch(appHtml,/<script src="herdharbor-document-center\.js/);
 assert.doesNotMatch(appHtml,/<script src="herdharbor-marketplace\.js/);
 assert.match(appRuntime,/function ensureDocumentCenterRuntime/);
 assert.match(appRuntime,/function ensureMarketplaceRuntime/);
 assert.match(appRuntime,/renderLazyRoute\([\s\S]*"documents"/);
 assert.match(appRuntime,/renderLazyRoute\([\s\S]*"marketplace"/);
});

test("stack audit removes redundant reset listener and rolls back partial listing creation",()=>{
 assert.doesNotMatch(source,/hh-market-reset"\)\?\.addEventListener\("click",function\(\)\{\}\)/);
 assert.match(source,/if\(created\?\.id\)await deleteListing\(created\.id,gw\)\.catch/);
});

test("stack audit removes uploaded object when photo metadata insert fails",()=>{
 assert.match(source,/if\(row\.error\)\{[\s\S]*BUCKETS\.publicMedia\)\.remove\(\[path\]\)[\s\S]*throw row\.error/);
});


test("lazy Marketplace and Documents are runtime cached instead of required shell precache",()=>{
 const sw=fs.readFileSync(path.join(root,"service-worker.js"),"utf8");
 const required=sw.slice(sw.indexOf("const REQUIRED_SHELL"),sw.indexOf("const RUNTIME_CACHE_PATHS"));
 const runtime=sw.slice(sw.indexOf("const RUNTIME_CACHE_PATHS"),sw.indexOf("const NETWORK_FIRST_PATHS"));
 assert.doesNotMatch(required,/herdharbor-document-center\.js/);
 assert.doesNotMatch(required,/herdharbor-marketplace\.js/);
 assert.match(runtime,/herdharbor-document-center\.js/);
 assert.match(runtime,/herdharbor-marketplace\.js/);
});

test("routine cloud recovery snapshots are coalesced during rapid save bursts",()=>{
 const cloud=fs.readFileSync(path.join(root,"herdharbor-cloud.js"),"utf8");
 assert.match(cloud,/ROUTINE_RECOVERY_SNAPSHOT_INTERVAL_MS = 5000/);
 assert.match(cloud,/reason === "Before local change"/);
 assert.match(cloud,/snapshotStartedAt - previousStartedAt < ROUTINE_RECOVERY_SNAPSHOT_INTERVAL_MS/);
 assert.match(cloud,/routineRecoverySnapshotAt\.clear\(\)/);
 assert.match(cloud,/Local copy saved during sync conflict/);
 assert.match(cloud,/Local copy retained at sign out/);
});
