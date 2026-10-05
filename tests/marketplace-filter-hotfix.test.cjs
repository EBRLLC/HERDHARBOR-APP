"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sql = fs.readFileSync(path.join(root, "supabase/marketplace-filter-catalog-hotfix.sql"), "utf8");

test("Marketplace filter hotfix normalizes supported species aliases", () => {
  for (const token of [
    "marketplace_normalize_species",
    "when 'rabbits' then 'rabbit'",
    "when 'cow' then 'cattle'",
    "when 'chicken' then 'poultry'",
    "when 'pig' then 'swine'"
  ]) assert.ok(sql.toLowerCase().includes(token.toLowerCase()), token);
});

test("Marketplace filter hotfix normalizes animal sex terms", () => {
  for (const token of [
    "marketplace_normalize_sex",
    "when 'buck' then 'male'",
    "when 'bull' then 'male'",
    "when 'wether' then 'male'",
    "when 'doe' then 'female'",
    "when 'cow' then 'female'",
    "when 'hen' then 'female'"
  ]) assert.ok(sql.toLowerCase().includes(token.toLowerCase()), token);
});

test("Marketplace filter hotfix normalizes full US state names and abbreviations", () => {
  assert.match(sql, /marketplace_normalize_region/i);
  assert.match(sql, /when 'kentucky' then 'ky' when 'ky' then 'ky'/i);
  assert.match(sql, /when 'california' then 'ca' when 'ca' then 'ca'/i);
  assert.match(sql, /when 'new york' then 'ny' when 'ny' then 'ny'/i);
});

test("Marketplace public search keeps its v2 contract while using normalized filters", () => {
  assert.match(sql, /create or replace function public\.marketplace_public_search_v2/i);
  assert.match(sql, /marketplace_normalize_species\(l\.species\)/i);
  assert.match(sql, /marketplace_normalize_sex\(l\.sex\)/i);
  assert.match(sql, /marketplace_normalize_region\(l\.location_region\)/i);
  assert.match(sql, /grant execute on function public\.marketplace_public_search_v2[\s\S]*to anon, authenticated/i);
});

test("Marketplace facets expose species-associated live breeds without private identifiers", () => {
  assert.match(sql, /'breed_pairs'/);
  assert.match(sql, /jsonb_build_object\('species',species_value,'breed',breed_value\)/i);
  assert.doesNotMatch(sql, /source_animal_id|email|phone|exact_address/i);
});
