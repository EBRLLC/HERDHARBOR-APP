"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { transformSync } = require("esbuild");

const read = (path) => fs.readFileSync(path, "utf8");
const schema = read("supabase/v1.8.1-subscription-closeout.sql");
const maintenance = read("supabase/functions/subscription-maintenance/index.ts");
const registration = read("supabase/functions/registration-referral/index.ts");
const billing = read("supabase/functions/subscription-billing/index.ts");
const webhook = read("supabase/functions/subscription-webhook/index.ts");
const email = read("supabase/functions/_shared/subscription-email.ts");
const launch = read("subscription-launch-v1.8.1.js");
const provider = read("subscription-stripe-provider-v1.8.0.js");
const policy = read("subscription-referral-policy-v1.8.1.js");
const closeout = read("subscription-closeout-v1.8.1.js");
const adminHealth = read("subscription-admin-health-v1.8.1.js");
const build = read("herdharbor-build.js");
const worker = read("service-worker.js");
const config = read("supabase/config.toml");

for (const [name, source] of [
  ["subscription-maintenance", maintenance],
  ["registration-referral", registration],
  ["subscription-billing", billing],
  ["subscription-webhook", webhook],
  ["subscription-email", email]
]) {
  test(`${name} TypeScript parses after v1.8.1 closeout`, () => {
    assert.doesNotThrow(() => transformSync(source, { loader: "ts", target: "es2022", format: "esm" }));
  });
}

test("credit-only Member access is auditable, one-at-a-time and never overlaps paid-through Stripe access", () => {
  assert.match(schema, /subscription_credit_entitlements/);
  assert.match(schema, /unique[\s\S]*credit_id|credit_id uuid not null unique/i);
  assert.match(schema, /subscription_credit_entitlements_one_active_uq/);
  assert.match(schema, /where status = 'active'/);
  assert.match(schema, /2026-10-01 00:00:00-04/);
  assert.match(schema, /\('active','trialing','past_due'\)/);
  assert.match(schema, /current_period_end is not null and v_sub\.current_period_end > v_now/);
  assert.match(schema, /for update skip locked/);
  assert.match(schema, /status='applied'/);
  assert.match(schema, /membership_source='subscription_credit'/);
  assert.match(schema, /subscription_status='credit_active'/);
  assert.match(schema, /member_credit_started/);
});

test("maintenance worker is private, bounded and reclaims failed transactional work", () => {
  assert.match(schema, /subscription_maintenance_config/);
  assert.match(schema, /herdharbor-subscription-maintenance-hourly/);
  assert.match(schema, /X-HerdHarbor-Maintenance/);
  assert.match(schema, /'7 \* \* \* \*'/);
  assert.match(maintenance, /safeEqual/);
  assert.match(maintenance, /X-HerdHarbor-Maintenance/);
  assert.match(maintenance, /MAX_DELIVERY_ATTEMPTS = 8/);
  assert.match(maintenance, /Recovered stale processing claim/);
  assert.match(maintenance, /BACKOFF_MS/);
  assert.match(maintenance, /registration_intents/);
  assert.match(config, /\[functions\.subscription-maintenance\][\s\S]*verify_jwt\s*=\s*false/);
  assert.doesNotMatch(maintenance, /maintenance_token\s*=\s*["'][A-Za-z0-9_-]{32,}["']/);
});

test("cross-device registration persists only a hashed email key and never reveals referrer identity", () => {
  assert.match(schema, /registration_intents/);
  assert.match(schema, /email_hash text primary key/);
  assert.doesNotMatch(schema, /\n\s*email\s+text/i);
  assert.match(registration, /registrationIntentHash/);
  assert.match(registration, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(registration, /action === "stage"/);
  assert.match(registration, /stagedChoice/);
  assert.match(registration, /admin\.auth\.getUser\(token\)/);
  assert.doesNotMatch(registration, /stagedChoice:[^\n]*(name|email|user_id)/i);
  assert.match(policy, /keepalive/);
  assert.match(policy, /hydrateRemoteChoice/);
});

test("refund and dispute reconciliation is auditable and does not claw back used reward months", () => {
  assert.match(webhook, /charge\.refunded/);
  assert.match(webhook, /charge\.dispute\.created/);
  assert.match(webhook, /charge\.dispute\.closed/);
  assert.match(webhook, /fullyRefunded/);
  assert.match(webhook, /reverseReferralForInvoice/);
  assert.match(webhook, /restoreReferralForInvoice/);
  assert.match(schema, /subscription_referral_reward_offsets/);
  assert.match(webhook, /activeCredits\.filter\(\(item\) => item\.status === "available"\)/);
  assert.match(webhook, /subscription_referral_reward_offsets/);
  assert.match(webhook, /status:\s*"settled"/);
  assert.match(email, /referral_reward_adjusted/);
  assert.match(email, /referral_reward_restored/);
});

test("subscription deletion continues Member access with an earned/admin credit before Junior fallback", () => {
  assert.match(webhook, /customer\.subscription\.deleted/);
  assert.match(webhook, /activate_member_credit_entitlement/);
  assert.match(webhook, /continuingWithCredit/);
  assert.match(webhook, /setJuniorFallback/);
  assert.match(email, /continuingWithCredit/);
  assert.match(email, /member_credit_started/);
  assert.match(billing, /reconcileCreditEntitlement/);
  assert.match(billing, /status: creditActive \? "credit_active"/);
});

test("browser entitlement layers recognize credit_active without changing the proven auth client", () => {
  assert.match(launch, /credit_active/);
  assert.match(launch, /subscription_credit/);
  assert.match(provider, /credit_active/);
  assert.doesNotMatch(launch, /createClient\s*\(/);
  assert.doesNotMatch(provider, /createClient\s*\(/);
  assert.doesNotMatch(closeout, /createClient\s*\(/);
});

test("continuous 5:1 referral policy is exposed over the preserved v1.8.0 engine", () => {
  const base = Object.freeze({
    getState: () => ({ referral: { successfulReferrals: 0 } }),
    getReferralRules: () => [],
    referralProjection: () => null
  });
  const document = { addEventListener(){}, getElementById(){return null} };
  const window = { HerdHarborSubscriptionEngine: base };
  window.window = window;
  const context = vm.createContext({ window, document, setTimeout, Object, Number, Math, String });
  vm.runInContext(closeout, context, { filename: "subscription-closeout-v1.8.1.js" });
  const wrapped = window.HerdHarborSubscriptionEngine;
  assert.equal(wrapped.getReferralRules()[0].continuous, true);
  assert.equal(wrapped.referralProjection(4).next.remaining, 1);
  assert.equal(wrapped.referralProjection(5).cycles, 1);
  assert.equal(wrapped.referralProjection(10).cycles, 2);
  assert.equal(wrapped.referralProjection(23).cycles, 4);
  assert.equal(wrapped.referralProjection(23).next.remaining, 2);
});

test("admin subscription health exposes reconciliation failures without a document-wide observer", () => {
  assert.match(billing, /admin_subscription_health/);
  assert.match(billing, /admin_retry_notifications/);
  assert.match(billing, /buildAdminHealth/);
  assert.match(billing, /Stripe is active but account_access/);
  assert.match(billing, /transactional subscription emails need retry attention/);
  assert.match(adminHealth, /Subscription health/);
  assert.match(adminHealth, /Retry failed emails/);
  assert.doesNotMatch(adminHealth, /MutationObserver/);
});

test("closeout assets are in the loader and PWA network-first cache", () => {
  for (const asset of ["subscription-closeout-v1.8.1.js", "subscription-admin-health-v1.8.1.js"]) {
    assert.ok(build.includes(asset), `${asset} missing from build loader`);
    assert.ok(worker.includes(asset), `${asset} missing from PWA shell`);
  }
  assert.match(worker, /october-subscription-launch-referrals-credits-5/);
});
