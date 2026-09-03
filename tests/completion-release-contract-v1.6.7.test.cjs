"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));

test("v1.6.7 completion ledger closes inherited debt without overstating future scope", () => {
  const audit = read("V1.6.7-COMPLETION-AUDIT.md");
  const notes = read("RELEASE_NOTES-v1.6.7.md");
  const acceptance = read("V1.6.7-PRODUCTION-ACCEPTANCE.md");

  assert.match(audit, /Alpha v1\.6\.7|v1\.6\.7/);
  assert.match(audit, /v1\.5\.1 memberships\/Junior\/Admin[\s\S]*production read-only acceptance path added/i);
  assert.match(audit, /Alpha v1\.6\.0 Analytics[\s\S]*Completed by v1\.6\.5/i);
  assert.match(audit, /Alpha v1\.6\.1 Rabbit Genetics[\s\S]*Completed by the v1\.6\.5 genetics completion pass/i);
  assert.match(audit, /Alpha v1\.6\.6 mobile Analytics hotfix[\s\S]*Complete\/live and preserved/i);
  assert.match(audit, /Paid billing[\s\S]*not release debt/i);
  assert.match(audit, /Full ARBA Standards & Judging[\s\S]*future/i);
  assert.match(audit, /protected production deployment\/acceptance remains an explicit release gate/i);
  assert.match(notes, /Alpha v1\.6\.7/i);
  assert.match(acceptance, /production acceptance/i);
});

test("Market Analytics hardening is privacy-suppressed, consent-destructive, retryable, and contract-aligned", () => {
  const market = read("market-analytics-v1.6.5.js");
  const edge = read("supabase/functions/market-contribution/index.ts");
  const sql = read("supabase/v1.6.7-market-privacy-hardening.sql");

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

test("production acceptance is explicit, protected, and manual-only", () => {
  const workflow = read(".github/workflows/v1.6.7-production-acceptance.yml");
  const membership = read("scripts/membership-production-acceptance.mjs");
  const sentry = read("scripts/sentry-production-acceptance.mjs");

  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s*push:/m);
  assert.doesNotMatch(workflow, /^\s*pull_request:/m);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /supabase\/v1\.6\.7-market-privacy-hardening\.sql/);
  assert.match(workflow, /supabase functions deploy market-contribution/);
  assert.match(workflow, /node scripts\/membership-production-acceptance\.mjs/);
  assert.match(workflow, /node scripts\/sentry-production-acceptance\.mjs/);
  assert.match(workflow, /npm run test:completion/);

  assert.match(membership, /admin_member_directory/);
  assert.match(membership, /Ordinary User unexpectedly accessed the protected member directory/);
  assert.match(membership, /membership_tier, "member"/);
  assert.match(sentry, /synthetic-only/i);
  assert.match(sentry, /HerdHarbor@1\.6\.7/);
  assert.match(sentry, /privacy: "synthetic_only"/);
});

test("completed Analytics, genetics, membership, Shows, and mobile protections remain under regression", () => {
  for (const required of [
    "tests/analytics-release-contract-v1.6.5.test.cjs",
    "tests/genetics-release-contract-v1.6.5.test.cjs",
    "tests/membership-policy-v1.5.1.test.cjs",
    "tests/admin-membership-v1.5.1.test.cjs",
    "tests/shows-v1.5.0.test.cjs",
    "tests/mobile-growth-layout-v1.6.6.test.cjs",
    "tests/current-release-reference-audit-v1.6.6.test.cjs"
  ]) assert.ok(exists(required), `required carried-forward regression is missing: ${required}`);

  const release = read("herdharbor-release-v1.6.1.js");
  const mobile = read("tests/mobile-growth-layout-v1.6.6.test.cjs");
  const historicalAudit = read("tests/current-release-reference-audit-v1.6.6.test.cjs");
  assert.match(release, /billingEnabled: false/);
  assert.match(mobile, /mobile Growth layout guard passed/);
  assert.match(historicalAudit, /historical shipped hotfix/);
});

test("v1.6.7 release review runs completion and dual-timezone regression without duplicating the Android PR build", () => {
  const workflow = read(".github/workflows/v1.6.7-release-review.yml");
  const androidAlpha = read(".github/workflows/android-alpha.yml");
  const pkg = JSON.parse(read("package.json"));

  assert.match(workflow, /branches: \[v1\.6\.7-completion-debt\]/);
  assert.match(workflow, /Run v1\.6\.7 completion contract[\s\S]*npm run test:completion/);
  assert.match(workflow, /TZ=UTC node "\$test_file"/);
  assert.match(workflow, /TZ=America\/New_York node "\$test_file"/);
  assert.match(workflow, /Android TWA review build only/);
  assert.match(workflow, /if: github\.event_name != 'pull_request'/);
  assert.match(workflow, /\.\/gradlew --no-daemon bundleRelease/);
  assert.match(workflow, /herdharbor-v1\.6\.7-release-review-unsigned-aab/);
  assert.match(androidAlpha, /^\s*pull_request:/m);
  assert.match(androidAlpha, /\.\/gradlew --no-daemon bundleRelease/);
  assert.equal(pkg.scripts["test:completion"], "node --test tests/completion-release-contract-v1.6.7.test.cjs tests/current-release-reference-audit-v1.7.0.test.cjs");
});

console.log("Alpha v1.6.7 completion release contract passed");
