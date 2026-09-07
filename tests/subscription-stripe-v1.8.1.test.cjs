"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const read = (name) => fs.readFileSync(name, "utf8");
const provider = read("subscription-stripe-provider-v1.8.0.js");
const bridge = read("subscription-stripe-launch-bridge-v1.8.1.js");
const launch = read("subscription-launch-v1.8.1.js");
const referralPolicy = read("subscription-referral-policy-v1.8.1.js");
const build = read("herdharbor-build.js");
const sw = read("service-worker.js");
const billing = read("supabase/functions/subscription-billing/index.ts");
const webhook = read("supabase/functions/subscription-webhook/index.ts");
const correction = read("supabase/v1.8.0-stripe-price-id-correction.sql");
const memberUi = read("subscription-member-ui-v1.8.0.css");

const PRICE_IDS = [
  "price_1UCOktGlRukEX5RKPo6jm6Vr",
  "price_1UCOwAGlRukEX5RK34xr9dQS",
  "price_1UCOjrGlRukEX5RK9my06yUP",
  "price_1UCOvPGlRukEX5RKJA05lDmb",
  "price_1UCOuYGlRukEX5RKo6LUWZq3",
  "price_1UCOnnGlRukEX5RK36kjzNZ6"
];

test("v1.8.1 preserves the six production Stripe prices while public checkout is Member monthly only", () => {
  for (const id of PRICE_IDS) assert.match(correction, new RegExp(id));
  assert.match(billing, /price_1UCOjrGlRukEX5RK9my06yUP/);
  assert.match(billing, /Founder access is assigned internally/);
  assert.match(billing, /HerdHarbor Business is coming soon/);
  assert.match(billing, /Member is currently offered month-to-month/);
});

test("Stripe credentials stay server-side and browser billing reuses HerdHarbor auth transport", () => {
  assert.doesNotMatch(provider, /sk_(?:live|test)_/i);
  assert.doesNotMatch(provider, /whsec_/i);
  assert.doesNotMatch(provider, /STRIPE_SECRET_KEY/);
  assert.match(provider, /HerdHarborCloud/);
  assert.match(provider, /invokeFunction\("subscription-billing"/);
  assert.match(provider, /classList\.contains\("hh-auth-locked"\)/);
  assert.doesNotMatch(provider, /setSession\s*\(/);
  assert.doesNotMatch(provider, /signOut\s*\(/);
  assert.match(billing, /Deno\.env\.get\("STRIPE_SECRET_KEY"\)/);
  assert.match(webhook, /Deno\.env\.get\("STRIPE_WEBHOOK_SIGNING_SECRET"\)/);
});

test("Stripe webhook remains signature-verified, idempotent and account-access synchronized", () => {
  assert.match(webhook, /constructEventAsync/);
  assert.match(webhook, /Stripe-Signature/);
  assert.match(webhook, /provider_event_id/);
  assert.match(webhook, /23505/);
  assert.match(webhook, /provider_updated_at/);
  assert.match(webhook, /membership_source\s*=|patch\.membership_source/);
  assert.match(webhook, /subscription_status/);
});

test("October 1 recognizes webhook-synchronized paid access before browser Stripe refresh settles", () => {
  const base = {
    accountRole: "user",
    membershipTier: "business",
    effectiveMembershipTier: "business",
    membershipSource: "subscription",
    storedMembershipSource: "subscription",
    subscriptionStatus: "active",
    maxActiveAnimals: null,
    features: { animalRecords: true }
  };
  const original = {
    getAccount: () => ({ ...base }),
    activeAnimalCount: () => 0,
    showJuniorLimit() {}
  };
  const document = { documentElement: { dataset: {} }, dispatchEvent() {} };
  const window = { document, HerdHarborMembership: original, HerdHarborSubscriptionEngine: { getState: () => ({ status: "not_configured", plan: null }) } };
  window.window = window;
  const context = vm.createContext({
    window,
    document,
    CustomEvent: class CustomEvent { constructor(name, options) { this.type = name; this.detail = options?.detail; } },
    Date,
    Set,
    Object,
    Array,
    String,
    Number,
    Math,
    JSON,
    structuredClone,
    console
  });
  vm.runInContext(launch, context, { filename: "subscription-launch-v1.8.1.js" });
  const resolved = window.HerdHarborSubscriptionLaunch.__test.resolveAccount(new Date("2026-10-01T00:00:01-04:00"));
  assert.equal(resolved.effectiveMembershipTier, "business");
  assert.equal(resolved.membershipSource, "subscription");
  assert.equal(resolved.subscriptionStatus, "active");
});

test("auth-settled Stripe launch bridge performs one bounded post-login provider refresh without owning auth", () => {
  assert.match(bridge, /MAX_ATTEMPTS\s*=\s*40/);
  assert.match(bridge, /INTERVAL_MS\s*=\s*250/);
  assert.match(bridge, /HerdHarborCloud\?\.getSession/);
  assert.match(bridge, /classList\.contains\("hh-auth-locked"\)/);
  assert.match(bridge, /provider === "stripe"/);
  assert.match(bridge, /\.refresh\?\.\(\{ force: true \}\)/);
  assert.match(bridge, /refreshedUserId/);
  assert.doesNotMatch(bridge, /setSession\s*\(/);
  assert.doesNotMatch(bridge, /signOut\s*\(/);
  assert.doesNotMatch(bridge, /createClient\s*\(/);
});

test("legacy Stripe provider keeps the price catalog while v1.8.1 policy hides yearly/public Founder controls", () => {
  assert.match(provider, /founder:[\s\S]*month:\s*999[\s\S]*year:\s*11000/);
  assert.match(provider, /member:[\s\S]*month:\s*1499[\s\S]*year:\s*15000/);
  assert.match(provider, /business:[\s\S]*month:\s*4999[\s\S]*year:\s*55000/);
  assert.match(provider, /data-hh-stripe-interval="month"/);
  assert.match(provider, /data-hh-stripe-interval="year"/);
  assert.match(memberUi, /hh-subscription-interval-switcher/);
  assert.match(referralPolicy, /plans\[1\]\.hidden\s*=\s*true/);
  assert.match(referralPolicy, /hh-subscription-interval-switcher/);
  assert.match(referralPolicy, /Coming Soon/);
});

test("v1.8.1 loads referral policy before Stripe provider and preserves safe launch order", () => {
  const referralIndex = build.indexOf("subscription-referral-policy-v1.8.1.js?v=1");
  const policyIndex = build.indexOf("subscription-launch-v1.8.1.js?v=1");
  const engineIndex = build.indexOf("subscription-engine-v1.8.0.js?v=1");
  const providerIndex = build.indexOf("subscription-stripe-provider-v1.8.0.js?v=1");
  const bridgeIndex = build.indexOf("subscription-stripe-launch-bridge-v1.8.1.js?v=1");
  assert.ok(referralIndex >= 0 && providerIndex > referralIndex);
  assert.ok(policyIndex >= 0 && engineIndex > policyIndex && providerIndex > engineIndex && bridgeIndex > providerIndex);
  assert.match(build, /version:\s*"1\.8\.1"/);
});

test("PWA keeps referral, admin-credit and Stripe subscription assets network-first", () => {
  assert.match(sw, /herdharbor-shell-v1\.8\.1-alpha-october-referrals-credits-2/);
  for (const asset of [
    "subscription-referral-policy-v1.8.1.js",
    "subscription-admin-credits-v1.8.1.js",
    "subscription-member-ui-v1.8.0.css",
    "subscription-tab-visibility-v1.8.0.js",
    "subscription-header-copy-v1.8.0.js",
    "subscription-stripe-provider-v1.8.0.js",
    "subscription-stripe-launch-bridge-v1.8.1.js"
  ]) assert.match(sw, new RegExp(asset.replaceAll(".", "\\.")));
  assert.match(sw, /NETWORK_FIRST_PATHS/);
});
