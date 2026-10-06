"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("E2 seller UI previews exact optional transfer categories", () => {
  const ui = read("direct-transfer-v1.8.2.js");
  assert.match(ui, /id="hh-direct-include-genetics"/);
  assert.match(ui, /id="hh-direct-include-history"/);
  assert.match(ui, /transferCategories:\s*\{[\s\S]*genetics:[\s\S]*ownershipHistory:/);
  assert.match(ui, /Identity and pedigree are required/);
  assert.match(ui, /Marketplace messages are never transferred/);
});

test("E2 links sold Marketplace listings to the canonical transfer table", () => {
  const sql = read("supabase/stack-e2-ownership-transfer-marketplace-link.sql");
  assert.match(sql, /alter table public\.herdharbor_direct_animal_transfers/);
  assert.match(sql, /marketplace_listing_id uuid/);
  assert.match(sql, /references public\.marketplace_listings\(id\)/);
  assert.match(sql, /status in \('pending','accepted'\)/);
  assert.doesNotMatch(sql, /create table/i);
});

test("E2 server verifies seller, sold state and source animal before linking Marketplace", () => {
  const edge = read("supabase/functions/animal-transfer/index.ts");
  assert.match(edge, /resolveMarketplaceListing/);
  assert.match(edge, /\.eq\("seller_id", userId\)/);
  assert.match(edge, /\.eq\("state", "sold"\)/);
  assert.match(edge, /source_animal_id/);
  assert.match(edge, /marketplace_listing_id: marketplaceListingId/);
  assert.doesNotMatch(edge, /marketplace_messages|marketplace_conversations/);
});

test("E2 buyer preview reports the approved category contract", () => {
  const ui = read("direct-transfer-v1.8.2.js");
  assert.match(ui, /transfer\.categories\?\.genetics/);
  assert.match(ui, /transfer\.categories\?\.ownershipHistory/);
});
