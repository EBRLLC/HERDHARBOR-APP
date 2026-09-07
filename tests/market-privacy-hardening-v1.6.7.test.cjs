"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (name) => fs.readFileSync(name, "utf8");
const market = read("market-analytics-v1.6.5.js");
const edge = read("supabase/functions/market-contribution/index.ts");
const sql = read("supabase/v1.6.7-market-privacy-hardening.sql");

test("Market Analytics hardening remains privacy-suppressed, consent-destructive, retryable and contract-aligned", () => {
  assert.match(market, /const VERSION = "1\.6\.6"/);
  assert.match(market, /const CONSENT_VERSION = "2026-09-v2"/);
  assert.match(edge, /const CONSENT_VERSION = "2026-09-v2"/);
  const clientConsent = market.match(/const CONSENT_VERSION = "([^"]+)"/)?.[1];
  const edgeConsent = edge.match(/const CONSENT_VERSION = "([^"]+)"/)?.[1];
  assert.equal(edgeConsent, clientConsent, "Market client and Edge Function must accept the same consent contract");
  assert.match(market, /const MINIMUM_SAMPLE_SIZE = 5/);
  assert.match(market, /RETRY_DELAYS_MS = Object\.freeze\(\[1800, 5000, 15000, 60000, 300000\]\)/);
  assert.match(market, /herdharbor:sync-status/);
  assert.match(market, /if \(!enabled\) \{[\s\S]*?clearContributionQueue\(\);[\s\S]*?writeReceipts\(\{\}\);[\s\S]*?resetRetry\(\);/);
  assert.match(market, /PROHIBITED_FIELDS/);
  for (const prohibited of ["customer_name", "breeder_name", "farm_name", "animal_name", "street_address", "notes", "photos", "documents"]) {
    assert.ok(market.includes(`"${prohibited}"`), `Market client prohibited-field list is missing ${prohibited}`);
  }

  assert.match(sql, /minimum_extreme_sample_size[^\n]*10/i);
  assert.match(sql, /if not p_enabled then[\s\S]*?delete from market_private\.market_contribution_processing/i);
  assert.match(sql, /v_threshold := greatest\(coalesce\(v_threshold, 5\), 5\)/);
  assert.match(sql, /v_extreme_threshold := greatest\(coalesce\(v_extreme_threshold, 10\), v_threshold, 10\)/);
  assert.match(sql, /if v_count < v_threshold then[\s\S]*?'available', false/);
  assert.match(sql, /if v_count >= v_extreme_threshold then[\s\S]*?'minimumSalePrice'[\s\S]*?'maximumSalePrice'/);
  assert.match(sql, /revoke all on function public\.market_aggregate[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.market_aggregate[\s\S]*to service_role/i);
});
