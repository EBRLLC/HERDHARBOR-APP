"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (name) => fs.readFileSync(name, "utf8");
const helper = read("supabase/functions/_shared/subscription-email.ts");
const billing = read("supabase/functions/subscription-billing/index.ts");
const webhook = read("supabase/functions/subscription-webhook/index.ts");
const config = read("supabase/config.toml");

const EVENTS = [
  "referral_reward_earned",
  "admin_credit_added",
  "upcoming_free_renewal",
  "upcoming_paid_renewal",
  "free_month_applied",
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

test("all locked subscription and referral notifications have fixed server templates", () => {
  for (const event of EVENTS) assert.match(helper, new RegExp(`eventType === "${event}"`));
  assert.match(helper, /Your upcoming HerdHarbor renewal is \$0\.00/);
  assert.match(helper, /Five of your referrals have now completed their qualifying renewal/);
  assert.match(helper, /Existing records remain preserved/);
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

test("Stripe webhook delivery failures remain retryable while member/admin actions remain durable", () => {
  assert.match(webhook, /deliverSubscriptionNotification\(admin, outboxId\)/);
  assert.doesNotMatch(webhook, /subscription-notification-delivery/);
  assert.match(billing, /deliverSubscriptionNotification\(admin, outboxId\)/);
  assert.match(billing, /Billing\/account actions must not be rolled back/);
  assert.match(billing, /subscription-notification-delivery/);
});

test("Supabase auth contract stays explicit for browser billing and external Stripe webhooks", () => {
  assert.match(config, /\[functions\.subscription-billing\][\s\S]*?verify_jwt\s*=\s*true/);
  assert.match(config, /\[functions\.subscription-webhook\][\s\S]*?verify_jwt\s*=\s*false/);
  assert.match(config, /\[functions\.email-engine\][\s\S]*?verify_jwt\s*=\s*true/);
});

test("transactional subscription messages are not marketing broadcasts", () => {
  assert.doesNotMatch(helper, /RESEND_UNSUBSCRIBE_URL/);
  assert.doesNotMatch(helper, /\/broadcasts/);
  assert.match(helper, /transactional account or subscription message/);
});
