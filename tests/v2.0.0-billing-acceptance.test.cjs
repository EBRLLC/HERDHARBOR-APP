"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const billing = read("supabase/functions/subscription-billing/index.ts");
const webhook = read("supabase/functions/subscription-webhook/index.ts");
const launch = read("subscription-launch-v1.8.1.js");
const provider = read("subscription-stripe-provider-v1.8.0.js");
const referral = read("subscription-referral-policy-v1.8.1.js");

test("2.0.0 keeps Founder pricing private and Member pricing public", () => {
  assert.match(billing, /FOUNDER_MONTH = \{ priceId: "[^"]+", cents: 799 \}/);
  assert.match(billing, /MEMBER_MONTH = \{ priceId: "[^"]+", cents: 1499 \}/);
  assert.match(billing, /founderEligible = normalize\(checkoutAccess\?\.membership_tier\) === "founder"[\s\S]*membership_source\) === "founder"/);
  assert.match(billing, /planId === "founder" && !founderEligible/);
  assert.match(billing, /Founder pricing is available only to accounts already granted Founder eligibility/);
  assert.match(referral, /founderPlan\.hidden = !founderEligible/);
  assert.doesNotMatch(referral, /<strong>Founder<\/strong>/);
});

test("checkout is monthly, server-authoritative, idempotent, and preserves remaining trial time", () => {
  assert.match(billing, /\["founder", "member"\]\.includes\(planId\)/);
  assert.match(billing, /billingInterval !== "month"/);
  assert.match(billing, /billing_cycle_anchor:\s*trialEndUnix/);
  assert.match(billing, /proration_behavior:\s*"none"/);
  assert.match(billing, /checkoutIdempotencyKey/);
  assert.match(billing, /idempotencyKey:\s*checkoutIdempotencyKey/);
  assert.match(provider, /invokeFunction\("subscription-billing"/);
  assert.doesNotMatch(provider, /sk_(?:live|test)_|whsec_|STRIPE_SECRET_KEY/i);
});

test("billing portal, cancellation and reactivation remain recoverable member actions", () => {
  assert.match(billing, /action === "portal"/);
  assert.match(billing, /stripe\.billingPortal\.sessions\.create/);
  assert.match(billing, /action === "cancel"/);
  assert.match(billing, /cancel_at_period_end:\s*true/);
  assert.match(billing, /action === "reactivate"/);
  assert.match(billing, /cancel_at_period_end:\s*false/);
  assert.match(billing, /safeReturnOrigin/);
});

test("invoice-before-subscription delivery recovers context before payment ledger insertion", () => {
  assert.match(webhook, /async function resolveInvoiceContext/);
  assert.match(webhook, /stripe\.subscriptions\.retrieve\(subscriptionId\)/);
  assert.match(webhook, /metadata\?\.herdharbor_user_id/);
  assert.match(webhook, /await upsertSubscription\(liveSubscription\)/);
  assert.match(webhook, /Could not resolve HerdHarbor subscription context/);
  assert.match(webhook, /subscription_payments/);
  assert.match(webhook, /onConflict:\s*"provider,provider_payment_id"/);
});

test("webhook processing remains signature-verified and idempotent", () => {
  assert.match(webhook, /Stripe-Signature/);
  assert.match(webhook, /constructEventAsync/);
  assert.match(webhook, /provider_event_id/);
  assert.match(webhook, /event_status === "processed"/);
  assert.match(webhook, /isProcessingLeaseStale/);
  assert.match(webhook, /isSubscriptionUpdateStale/);
  assert.match(webhook, /shouldIgnorePaymentFailure/);
});

test("credits are stackable Member months and apply to one renewal without moving the billing cycle", () => {
  assert.match(webhook, /reserveMemberCredit/);
  assert.match(webhook, /plan_id", "member"/);
  assert.match(webhook, /credit_type", "free_month"/);
  assert.match(webhook, /status:\s*"reserved"/);
  assert.match(webhook, /duration:\s*"once"/);
  assert.match(webhook, /percent_off:\s*100/);
  assert.match(webhook, /markCreditApplied/);
  assert.match(webhook, /status:\s*"applied"/);
  assert.doesNotMatch(webhook, /billing_cycle_anchor/);
});

test("referral reward policy remains five qualified referrals for one Member month", () => {
  assert.match(webhook, /for \(let milestone = 5; milestone <= qualified; milestone \+= 5\)/);
  assert.match(webhook, /source:\s*"referral_reward"/);
  assert.match(webhook, /quantity:\s*1/);
  assert.match(referral, /Every 5 qualified referrals = 1 Member subscription month credit/);
  assert.match(webhook, /billingReason !== "subscription_cycle"/);
});

test("subscription failure and termination preserve farm records and degrade adult access safely", () => {
  assert.match(webhook, /invoice\.payment_failed/);
  assert.match(webhook, /status:\s*"past_due"/);
  assert.match(launch, /ACTIVE_PAID_STATUSES = new Set\(\["active", "trialing", "past_due"/);
  assert.match(webhook, /eventType:\s*"free_adult_fallback"/);
  assert.match(webhook, /fallbackPlan:\s*"free_adult"/);
  assert.doesNotMatch(webhook, /from\("herdharbor_user_data"\)\.delete/);
  assert.doesNotMatch(launch, /state\.(?:animals|health|pedigrees)\s*=\s*\[\]/);
});
