"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const appHtml=fs.readFileSync(path.join(root,"index.html"),"utf8");
const appRuntime=fs.readFileSync(path.join(root,"herdharbor-app-runtime.js"),"utf8");
const marketHtml=fs.readFileSync(path.join(root,"marketplace/index.html"),"utf8");
const marketJs=fs.readFileSync(path.join(root,"marketplace/marketplace-app.js"),"utf8");

test("primary Marketplace navigation opens the standalone storefront instead of an in-app route",()=>{
  assert.match(appHtml,/<a class="nav-item" href="marketplace\/" target="_blank" rel="noopener" title="Marketplace">/);
  assert.doesNotMatch(appHtml,/<button class="nav-item" data-route="marketplace" title="Marketplace">/);
  assert.match(appRuntime,/if \(!item\.dataset\.route\) return;[\s\S]*event\.preventDefault\(\);[\s\S]*navigate\(item\.dataset\.route\)/);
});

test("standalone Marketplace uses only public Marketplace dependencies and does not boot the HerdHarbor app",()=>{
  assert.match(marketHtml,/vendor\/supabase-2\.111\.0\.js/);
  assert.match(marketHtml,/herdharbor-marketplace\.js\?v=1/);
  assert.match(marketHtml,/herdharbor-pedigree-platform\.js\?v=1/);
  assert.doesNotMatch(marketHtml,/herdharbor-cloud\.js|herdharbor-app-runtime\.js|pwa\.js|cloud-sync-rollout-runtime|task-runtime|breeding-litter-runtime/);
});

test("public storefront searches listings and keeps private herd management in the app",()=>{
  assert.match(marketJs,/market\.searchListings\(/);
  assert.match(marketJs,/market\.getListingDetails\(/);
  assert.match(marketJs,/market\.getPublicListingPedigree\(/);
  assert.match(marketJs,/market\.getPublicSellerProfile\(/);
  assert.match(marketJs,/market\.getPublicAgreement\(/);
  assert.match(marketHtml,/href="\.\.\/\?route=marketplace"[^>]*>Seller tools<\/a>/);
  assert.doesNotMatch(marketJs,/herdharbor_user_data|herdharbor_user_cache|localStorage\.getItem\(/);
});
