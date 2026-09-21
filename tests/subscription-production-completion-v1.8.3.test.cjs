"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (file) => fs.readFileSync(file, "utf8");
const launch = read("subscription-launch-v1.8.1.js");
const engine = read("subscription-engine-v1.8.0.js");
const provider = read("subscription-stripe-provider-v1.8.0.js");
const bridge = read("subscription-stripe-launch-bridge-v1.8.1.js");
const billing = read("supabase/functions/subscription-billing/index.ts");
const webhook = read("supabase/functions/subscription-webhook/index.ts");
const trial = read("supabase/functions/_shared/subscription-trial.ts");
const email = read("supabase/functions/_shared/subscription-email.ts");
const build = read("herdharbor-build.js");
const worker = read("service-worker.js");
const packageJson = JSON.parse(read("package.json"));

test("trial dates are backend-owned and cannot be manufactured from browser state", () => {
  assert.match(trial, /trialSnapshot\(user/);
  assert.match(trial, /user\?\.created_at/);
  assert.match(billing, /trialSnapshot\(user\)/);
  assert.doesNotMatch(billing, /body\.(?:trialEndsAt|initialTrialEndsAt|createdAt|accountCreatedAt)/);
  assert.match(provider, /verifiedSnapshotUserId/);
  assert.match(provider, /HerdHarborStripeSnapshotTrust/);
  assert.match(launch, /trustedSnapshot/);
  assert.match(launch, /An unverified browser snapshot can never create or extend a trial/);
  assert.doesNotMatch(launch, /membershipSource:\s*"launch_trial_fallback"/);
});

test("one-month Member trial is automatic and requires no card to begin", () => {
  assert.match(trial, /addCalendarMonthInZone/);
  assert.match(trial, /Math\.min\(parts\.day, daysInTargetMonth\)/);
  assert.match(billing, /effectiveStatus = trial\.active \? "trialing" : "free_adult"/);
  assert.match(provider, /No credit card is required to begin or use the trial/);
  assert.doesNotMatch(billing.slice(billing.indexOf("async function buildSnapshot"), billing.indexOf('if \(action === "checkout"')), /stripe\.checkout|payment_method/);
});

test("protected roles and Junior remain outside adult trial/free fallback", () => {
  assert.match(billing, /role === "owner"/);
  assert.match(billing, /role === "admin"/);
  assert.match(billing, /membershipSource === "manual_override"/);
  assert.match(billing, /membershipSource === "founder"/);
  assert.match(billing, /storedTier === "founder"/);
  assert.match(billing, /juniorAccess = storedTier === "junior" \|\| requestedPlan === "junior"/);
  assert.match(launch, /role === "owner" \|\| role === "admin" \|\| currentSource === "manual_override"/);
  assert.match(launch, /isFounder\(base\)/);
  assert.match(launch, /isJunior\(base, snapshot\)/);
});

test("Free Adult is permanent non-destructive access with a five-active-animal growth ceiling", () => {
  assert.match(launch, /FREE_ADULT_MAX_ACTIVE_ANIMALS = 5/);
  assert.match(launch, /allowed:\s*limit === null \|\| after <= limit \|\| after <= before/);
  assert.match(launch, /Your existing records stay available/);
  assert.match(provider, /Existing herds above the allowance remain manageable but cannot increase/);
  assert.match(provider, /Upgrade to Member whenever you need unlimited active animals/);
  assert.doesNotMatch(launch, /state\.(?:animals|health|pedigrees)\s*=\s*\[\]/);
  assert.doesNotMatch(webhook, /delete\(\).*herdharbor_user_data|from\("herdharbor_user_data"\)\.delete/);
});

test("early Member checkout retains trial boundary and is server-idempotent", () => {
  assert.match(billing, /billing_cycle_anchor:\s*trialEndUnix/);
  assert.match(billing, /proration_behavior:\s*"none"/);
  assert.match(billing, /herdharbor_initial_trial_end:\s*trial\.endsAt/);
  assert.match(billing, /checkoutIdempotencyKey/);
  assert.match(billing, /idempotencyKey:\s*checkoutIdempotencyKey/);
  assert.match(provider, /if \(checkoutState === "pending"\) return/);
});

test("checkout and payment failure preserve existing access instead of destructively downgrading", () => {
  assert.match(provider, /checkoutState = "error"/);
  assert.match(provider, /Your current access is unchanged/);
  assert.match(webhook, /invoice\.payment_failed/);
  assert.match(webhook, /status:\s*"past_due"/);
  assert.match(launch, /ACTIVE_PAID_STATUSES = new Set\(\["active", "trialing", "past_due"/);
});

test("paid adult access ends in Free Adult and preserves a separate Junior state", () => {
  assert.match(webhook, /accessStatus\(context\.userId, "free_adult", context\.planId\)/);
  assert.match(webhook, /eventType:\s*"free_adult_fallback"/);
  assert.match(webhook, /fallbackPlan:\s*"free_adult"/);
  assert.match(email, /Your HerdHarbor account is now on Free Adult/);
  assert.match(email, /eventType === "junior_fallback"/);
  assert.match(launch, /accessMode:\s*"junior"/);
});

test("user-facing access state exposes trial, paid, Free Adult, ending, checkout, and unavailable states", () => {
  for (const marker of [
    "trial_active",
    "paid_member",
    "free_adult",
    "paid_access_ending",
    "status_unavailable",
    "checkout_pending",
    "checkout_error"
  ]) assert.match(launch + provider, new RegExp(marker));
  assert.match(launch, /daysRemaining:\s*remainingDays/);
  assert.match(provider, /Subscribe — billing starts/);
});

test("billing resolution remains asynchronous and cannot own or deadlock sign-in", () => {
  assert.match(engine, /function boot\(\)[\s\S]*refresh\(\{ force: true \}\);/);
  assert.doesNotMatch(engine, /await refresh\(\{ force: true \}\)/);
  assert.match(bridge, /window\.setInterval/);
  assert.match(bridge, /void refreshOnce\(\)/);
  for (const source of [provider, bridge]) {
    assert.doesNotMatch(source, /setSession\s*\(/);
    assert.doesNotMatch(source, /signOut\s*\(/);
    assert.doesNotMatch(source, /createClient\s*\(/);
  }
});

test("backend refresh failure is fail-open for application access", () => {
  assert.match(engine, /catch \(error\)[\s\S]*subscription_engine_refresh_failure/);
  assert.match(engine, /status:\s*state\.status === "not_configured" \? "unavailable" : state\.status/);
  assert.doesNotMatch(engine, /location\.(?:reload|replace).*subscription_engine_refresh_failure/);
  assert.match(provider, /Subscription status is resolving asynchronously\. HerdHarbor startup and existing records are not blocked by billing/);
});

test("Phase 4 refreshes changed subscription assets without whole-app v1.8.3 bump", () => {
  assert.equal(packageJson.version, "1.8.2");
  assert.match(build, /subscription-launch-v1\.8\.1\.js\?v=2/);
  assert.match(build, /subscription-stripe-provider-v1\.8\.0\.js\?v=2/);
  assert.match(worker, /\.\/subscription-launch-v1\.8\.1\.js\?v=2/);
  assert.match(worker, /\.\/subscription-stripe-provider-v1\.8\.0\.js\?v=2/);
  assert.match(worker, /herdharbor-shell-v1\.8\.2/);
});

test("v1.8.3 development gate includes the production subscription completion contract", () => {
  assert.match(packageJson.scripts["test:v1.8.3"], /subscription-production-completion-v1\.8\.3\.test\.cjs/);
});
