"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (name) => fs.readFileSync(name, "utf8");
const helper = read("supabase/functions/_shared/subscription-email.ts");
const billing = read("supabase/functions/subscription-billing/index.ts");
const webhook = read("supabase/functions/subscription-webhook/index.ts");
const maintenance = read("supabase/functions/subscription-maintenance/index.ts");
const config = read("supabase/config.toml");

const EVENTS = [
  "referral_reward_earned",
  "referral_reward_adjusted",
  "referral_reward_restored",
  "admin_credit_added",
  "upcoming_free_renewal",
  "upcoming_paid_renewal",
  "free_month_applied",
  "member_credit_started",
  "payment_failed",
  "subscription_canceled",
  "subscription_ended",
  "junior_fallback"
];

test("subscription email delivery uses the configured Resend transactional sender", () => {
  assert.match(helper, /RESEND_API\s*=\s*"https:\/\/api\.resend\.com"/);
  assert.match(helper, /HerdHarbor <updates@auth\.herdharbor\.com>/);
  assert.match(helper, /Deno\.env\.get\("RESEND_API_KEY"\)/);
  assert.match(helper, /fetch\(`\$\{RESEND_API\}\/emails`/);
});

test("all v1.8.1 subscription, referral and credit notifications have fixed server templates", () => {
  for (const event of EVENTS) assert.match(helper, new RegExp(`eventType === "${event}"`));
  assert.match(helper, /Your upcoming HerdHarbor renewal is \$0\.00/);
  assert.match(helper, /Five of your referrals have now completed their qualifying renewal/);
  assert.match(helper, /Existing records remain preserved/);
  assert.match(helper, /does not take back a free month that was already promised or used/);
});

test("transactional sends are idempotent and backed by the durable outbox", () => {
  assert.match(helper, /Idempotency-Key/);
  assert.match(helper, /herdharbor:\$\{outbox\.dedupe_key\}/);
  assert.match(helper, /subscription_notification_outbox/);
  assert.match(helper, /status:\s*"processing"/);
  assert.match(helper, /status:\s*"sent"/);
  assert.match(helper, /status:\s*"failed"/);
  assert.match(helper, /provider:\s*"resend"/);
  assert.match(helper, /provider_message_id/);
});

test("Stripe webhook failures remain retryable and billing/admin actions remain durable", () => {
  assert.match(webhook, /deliverSubscriptionNotification\(admin, outboxId\)/);
  assert.doesNotMatch(webhook, /subscription-notification-delivery/);
  assert.match(billing, /deliverSubscriptionNotification\(admin, outboxId\)/);
  assert.match(billing, /catch \(deliveryError\)/);
  assert.match(billing, /subscription-notification-delivery/);
  assert.match(maintenance, /subscription_notification_outbox/);
  assert.match(maintenance, /MAX_DELIVERY_ATTEMPTS = 8/);
  assert.match(maintenance, /BACKOFF_MS/);
});

test("Supabase auth contract stays explicit for browser billing, maintenance and external Stripe webhooks", () => {
  assert.match(config, /\[functions\.subscription-billing\][\s\S]*?verify_jwt\s*=\s*true/);
  assert.match(config, /\[functions\.subscription-webhook\][\s\S]*?verify_jwt\s*=\s*false/);
  assert.match(config, /\[functions\.subscription-maintenance\][\s\S]*?verify_jwt\s*=\s*false/);
  assert.match(maintenance, /X-HerdHarbor-Maintenance/);
  assert.match(config, /\[functions\.email-engine\][\s\S]*?verify_jwt\s*=\s*true/);
});

test("transactional subscription messages are not marketing broadcasts", () => {
  assert.doesNotMatch(helper, /RESEND_UNSUBSCRIBE_URL/);
  assert.doesNotMatch(helper, /\/broadcasts/);
  assert.match(helper, /transactional account or subscription message/);
});
