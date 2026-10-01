"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs");

const root = path.resolve(__dirname, "..");

async function policy() {
  return import(pathToFileURL(path.join(root, "supabase/functions/_shared/subscription-lifecycle-policy.mjs")).href);
}

test("stale subscription events cannot replace a newer active subscription", async () => {
  const p = await policy();
  assert.equal(p.isSubscriptionUpdateStale({
    existingSubscriptionId: "sub_new",
    incomingSubscriptionId: "sub_old",
    existingStatus: "active",
    incomingStatus: "canceled",
    storedProviderUpdatedAt: "2026-09-30T20:10:00Z",
    eventOccurredAt: "2026-09-30T20:05:00Z"
  }), true);

  assert.equal(p.isSubscriptionUpdateStale({
    existingSubscriptionId: "sub_old",
    incomingSubscriptionId: "sub_old",
    existingStatus: "active",
    incomingStatus: "past_due",
    storedProviderUpdatedAt: "2026-09-30T20:05:00Z",
    eventOccurredAt: "2026-09-30T20:10:00Z"
  }), false);
});

test("payment failure cannot resurrect terminal or newer subscription state", async () => {
  const p = await policy();
  assert.equal(p.shouldIgnorePaymentFailure({
    currentStatus: "canceled",
    storedProviderUpdatedAt: "2026-09-30T20:00:00Z",
    eventOccurredAt: "2026-09-30T20:05:00Z"
  }), true);

  assert.equal(p.shouldIgnorePaymentFailure({
    currentStatus: "active",
    storedProviderUpdatedAt: "2026-09-30T20:10:00Z",
    eventOccurredAt: "2026-09-30T20:05:00Z"
  }), true);

  assert.equal(p.shouldIgnorePaymentFailure({
    currentStatus: "active",
    storedProviderUpdatedAt: "2026-09-30T20:00:00Z",
    eventOccurredAt: "2026-09-30T20:05:00Z"
  }), false);
});

test("processing lease is reclaimable only after timeout", async () => {
  const p = await policy();
  const now = Date.parse("2026-09-30T20:10:00Z");
  assert.equal(p.isProcessingLeaseStale("2026-09-30T20:09:00Z", now), false);
  assert.equal(p.isProcessingLeaseStale("2026-09-30T20:04:59Z", now), true);
  assert.equal(p.isProcessingLeaseStale(null, now), true);
});

test("Founder migration separates paid eligibility from complimentary override", () => {
  const migration = fs.readFileSync(path.join(root, "supabase/v1.8.4-subscription-lifecycle-hardening.sql"), "utf8");
  assert.match(migration, /where membership_tier = 'founder'[\s\S]*membership_source = 'manual_override'/);
  assert.match(migration, /next_source := case when new_tier = 'founder' then 'founder' else 'manual_override' end/);
  assert.match(migration, /founder_eligibility_granted/);
});

test("webhook uses lease recovery, stale guards, and invoice-before-subscription recovery", () => {
  const webhook = fs.readFileSync(path.join(root, "supabase/functions/subscription-webhook/index.ts"), "utf8");
  assert.match(webhook, /isProcessingLeaseStale/);
  assert.match(webhook, /isSubscriptionUpdateStale/);
  assert.match(webhook, /shouldIgnorePaymentFailure/);
  assert.match(webhook, /customer\.subscription\.deleted" && context\?\.userId && context\.stale !== true/);
  assert.match(webhook, /Stripe can deliver invoice\.paid \/ invoice\.payment_succeeded before/);
  assert.match(webhook, /stripe\.subscriptions\.retrieve\(subscriptionId\)/);
  assert.match(webhook, /await upsertSubscription\(liveSubscription\)/);
  assert.match(webhook, /const recovered = await loadByProviderSubscriptionId\(\)/);
  assert.match(webhook, /Could not resolve HerdHarbor subscription context for Stripe invoice/);
});

test("checkout restricts return URLs and keeps Founder discount private", () => {
  const billing = fs.readFileSync(path.join(root, "supabase/functions/subscription-billing/index.ts"), "utf8");
  assert.match(billing, /hostname === "herdharbor\.com" \|\| hostname\.endsWith\("\.herdharbor\.com"\)/);
  assert.match(billing, /allow_promotion_codes: planId === "member"/);
  assert.match(billing, /integration_identifier: "herdharbor_sub_qmtzrkpa"/);
});
