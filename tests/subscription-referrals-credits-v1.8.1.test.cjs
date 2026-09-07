"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (name) => fs.readFileSync(name, "utf8");
const policy = read("subscription-referral-policy-v1.8.1.js");
const adminCredits = read("subscription-admin-credits-v1.8.1.js");
const registrationFn = read("supabase/functions/registration-referral/index.ts");
const billing = read("supabase/functions/subscription-billing/index.ts");
const webhook = read("supabase/functions/subscription-webhook/index.ts");
const schema = read("supabase/v1.8.1-referrals-credits.sql");
const readPolicy = read("supabase/v1.8.1-referral-code-read-policy.sql");
const config = read("supabase/config.toml");
const build = read("herdharbor-build.js");
const sw = read("service-worker.js");

test("public signup exposes Junior, Member and Business Coming Soon but never Founder", () => {
  assert.match(policy, /<strong>Junior<\/strong>/);
  assert.match(policy, /<strong>Member<\/strong><small>\$14\.99\/month/);
  assert.match(policy, /<strong>Business<\/strong><small>Coming Soon<\/small>/);
  assert.doesNotMatch(policy, /<strong>Founder<\/strong>/);
  assert.match(policy, /plans\[1\]\.hidden\s*=\s*true/);
  assert.match(policy, /button\.disabled\s*=\s*true/);
  assert.match(policy, /localStorage\.setItem\(INTERVAL_KEY, "month"\)/);
});

test("referral ID is optional: blank never performs validation or stalls signup", () => {
  assert.match(policy, /Optional — leave this blank if nobody referred you/);
  assert.match(policy, /if \(!choice\.referralCode\) return; \/\/ Blank referral must never delay signup\./);
  assert.match(policy, /Invalid referral ID\. Check the code or remove it to continue signup/);
  assert.match(policy, /window\.alert\("Invalid referral ID/);
  assert.match(policy, /Referral ID verified\./);
});

test("signup referral layer does not create or replace the proven browser Supabase auth client", () => {
  assert.doesNotMatch(policy, /createClient\s*\(/);
  assert.match(policy, /HerdHarborCloud\.invokeFunction\("registration-referral"/);
  assert.match(policy, /functions\/v1\/registration-referral/);
  assert.doesNotMatch(policy, /signOut\s*\(/);
  assert.doesNotMatch(policy, /setSession\s*\(/);
});

test("email-confirmation signout cannot erase the pending signup choice", () => {
  const signedOut = policy.match(/herdharbor:auth-session[\s\S]{0,700}?registration-profile/)?.[0] || "";
  assert.match(signedOut, /signedIn === false/);
  assert.doesNotMatch(signedOut, /clearChoice\s*\(\)/);
  assert.match(policy, /registration-profile[\s\S]*complete === true\) clearChoice\(\)/);
  assert.match(policy, /CHOICE_MAX_AGE_MS\s*=\s*24 \* 60 \* 60 \* 1000/);
});

test("public referral validation is privacy-minimal while secure completion authenticates the member", () => {
  assert.match(registrationFn, /action === "validate"/);
  assert.match(registrationFn, /return json\(\{ valid: Boolean\(data\?\.code\) \}\)/);
  assert.doesNotMatch(registrationFn, /valid:[^\n]*(email|name|user_id)/i);
  assert.match(registrationFn, /admin\.auth\.getUser\(token\)/);
  assert.match(registrationFn, /action === "complete"/);
  assert.match(registrationFn, /complete_registration_choice/);
  assert.match(config, /\[functions\.registration-referral\][\s\S]*verify_jwt\s*=\s*false/);
});

test("referrals are immutable per referred account and use a separate public HH code", () => {
  assert.match(schema, /create table if not exists public\.referral_codes/);
  assert.match(schema, /code text not null unique check \(code ~ '\^HH-\[A-Z0-9\]\{8\}\$'\)/);
  assert.match(schema, /subscription_referrals_referred_user_uq/);
  assert.match(schema, /on public\.subscription_referrals\(referred_user_id\)/);
  assert.match(schema, /You cannot refer your own HerdHarbor account/);
  assert.match(readPolicy, /users read own referral code/);
  assert.match(readPolicy, /user_id = auth\.uid\(\)/);
});

test("first monthly renewal qualifies a referral; initial subscription does not", () => {
  assert.match(webhook, /billingReason === "subscription_create"/);
  assert.match(webhook, /status:\s*"subscribed"/);
  assert.match(webhook, /billingReason !== "subscription_cycle"/);
  assert.match(webhook, /status:\s*"qualified"/);
  assert.match(webhook, /first_renewal_paid_at/);
  assert.match(webhook, /qualifying_invoice_id/);
  assert.match(webhook, /\.in\("status", \["pending", "subscribed"\]\)/);
  assert.match(webhook, /customer\.subscription\.deleted[\s\S]*expireUnqualifiedReferral/);
});

test("every five qualified referrals produces exactly one stackable Member month credit", () => {
  assert.match(schema, /generate_series\(5, greatest\(coalesce\(active_referrals,0\),0\), 5\)/);
  assert.match(webhook, /for \(let milestone = 5; milestone <= qualified; milestone \+= 5\)/);
  assert.match(webhook, /source:\s*"referral_reward"/);
  assert.match(webhook, /quantity:\s*1/);
  assert.match(webhook, /sourceReference = `qualified:\$\{milestone\}`/);
  assert.match(policy, /Every 5 qualified referrals = 1 Member subscription month credit/);
  assert.match(policy, /qualified % 5/);
});

test("free-month renewal becomes $0 only after a credit has been reserved", () => {
  assert.match(webhook, /event\.type === "invoice\.upcoming"/);
  assert.match(webhook, /reserveMemberCredit/);
  assert.match(webhook, /status:\s*"reserved"/);
  assert.match(webhook, /eventType:\s*"upcoming_free_renewal"/);
  assert.match(webhook, /amountCents:\s*0/);
  assert.match(webhook, /creditsRemainingAfterRenewal:\s*balance\.available/);
  assert.match(schema, /reserved_at timestamptz/);
  assert.match(schema, /reservation_reference text/);
});

test("reserved credit applies to one draft renewal invoice without moving billing cycle", () => {
  assert.match(webhook, /event\.type === "invoice\.created"/);
  assert.match(webhook, /stripe\.invoices\.retrieve\(invoice\.id\)/);
  assert.match(webhook, /duration:\s*"once"/);
  assert.match(webhook, /percent_off:\s*100/);
  assert.match(webhook, /stripe\.invoices\.update\(invoice\.id/);
  assert.match(webhook, /herdharbor_credit_id/);
  assert.doesNotMatch(webhook, /billing_cycle_anchor/);
  assert.match(webhook, /markCreditApplied/);
  assert.match(webhook, /status:\s*"applied"/);
});

test("subscription notification outbox is provider-neutral for the separate email integration", () => {
  assert.match(schema, /create table if not exists public\.subscription_notification_outbox/);
  assert.match(schema, /event_type text not null/);
  assert.match(schema, /dedupe_key text not null unique/);
  assert.match(schema, /not_before timestamptz/);
  assert.match(schema, /provider_message_id text/);
  assert.match(webhook, /upcoming_paid_renewal/);
  assert.match(webhook, /upcoming_free_renewal/);
  assert.match(webhook, /referral_reward_earned/);
  assert.match(webhook, /free_month_applied/);
  assert.match(webhook, /payment_failed/);
  assert.doesNotMatch(webhook, /api\.resend\.com|RESEND_API_KEY/);
  assert.doesNotMatch(billing, /api\.resend\.com|RESEND_API_KEY/);
});

test("admin can add auditable stackable Member credits without assigning Founder", () => {
  assert.match(adminCredits, /Add Member month credit/);
  assert.match(adminCredits, /admin_credit_snapshot/);
  assert.match(adminCredits, /admin_credit/);
  assert.match(adminCredits, /window\.confirm/);
  assert.match(billing, /Owner or Admin access is required for subscription credits/);
  assert.match(billing, /months < 1 \|\| months > 60/);
  assert.match(billing, /source:\s*"admin"/);
  assert.match(billing, /action:\s*"subscription_credit_added"/);
  assert.match(billing, /eventType:\s*"admin_credit_added"/);
  assert.doesNotMatch(adminCredits, /MutationObserver/);
});

test("public checkout is server-enforced as Junior free, Member monthly and Business coming soon", () => {
  assert.match(billing, /planId === "founder"/);
  assert.match(billing, /planId === "business"/);
  assert.match(billing, /planId === "junior"/);
  assert.match(billing, /planId !== "member" \|\| billingInterval !== "month"/);
  assert.match(billing, /price_1UCOjrGlRukEX5RK9my06yUP/);
  assert.match(billing, /cents:\s*1499/);
});

test("new policy assets load in the build and remain network-first in the PWA", () => {
  for (const asset of ["subscription-referral-policy-v1.8.1.js", "subscription-admin-credits-v1.8.1.js"]) {
    assert.match(build, new RegExp(asset.replaceAll(".", "\\.")));
    assert.match(sw, new RegExp(asset.replaceAll(".", "\\.")));
  }
  assert.match(sw, /herdharbor-shell-v1\.8\.1-alpha-october-referrals-credits-2/);
  assert.match(sw, /NETWORK_FIRST_PATHS/);
});
