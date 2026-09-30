"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const launch=read("subscription-launch-v1.8.1.js");
const engine=read("subscription-engine-v1.8.0.js");
const provider=read("subscription-stripe-provider-v1.8.0.js");
const billing=read("supabase/functions/subscription-billing/index.ts");
const webhook=read("supabase/functions/subscription-webhook/index.ts");

test("member checkout and portal remain server-authoritative with secrets off the browser",()=>{
  assert.match(provider,/invokeFunction\("subscription-billing"/);
  assert.match(billing,/checkout/i);
  assert.match(billing,/portal/i);
  assert.doesNotMatch(provider,/sk_(?:live|test)_/i);
  assert.doesNotMatch(provider,/whsec_/i);
  assert.match(webhook,/Stripe-Signature/);
});

test("entitlement transitions preserve records and separate Free Adult from Junior",()=>{
  assert.match(webhook,/free_adult_fallback/);
  assert.match(launch,/accessMode:\s*"junior"/);
  assert.match(launch,/FREE_ADULT_MAX_ACTIVE_ANIMALS = 5/);
  assert.match(launch,/Your existing records stay available/);
  assert.doesNotMatch(launch,/state\.(?:animals|health|pedigrees)\s*=\s*\[\]/);
  assert.doesNotMatch(webhook,/from\("herdharbor_user_data"\)\.delete/);
});

test("protected/manual/founder authority and trusted backend subscription remain protected",()=>{
  assert.match(launch,/role === "owner" \|\| role === "admin"/);
  assert.match(launch,/currentSource === "manual_override"/);
  assert.match(launch,/isFounder\(base\)/);
  assert.match(launch,/hasBackendPaidSubscription/);
  assert.match(launch,/trustedSnapshot/);
});

test("failed renewal and checkout failures do not cause temporary destructive downgrade",()=>{
  assert.match(webhook,/invoice\.payment_failed/);
  assert.match(webhook,/status:\s*"past_due"/);
  assert.match(launch,/ACTIVE_PAID_STATUSES = new Set\(\["active", "trialing", "past_due"/);
  assert.match(provider,/Your current access is unchanged/);
});

test("referral and member-month credit contracts remain covered by the current suite",()=>{
  const refs=read("tests/subscription-referrals-credits-v1.8.1.test.cjs");
  assert.match(refs,/cannot refer your own HerdHarbor account/i);
  assert.match(refs,/five|5/);
  assert.match(refs,/credit/i);
  assert.match(refs,/renewal/i);
});

test("v1.8.3 production subscription completion remains part of the aggregate gate",()=>{
  const pkg=JSON.parse(read("package.json"));
  assert.match(pkg.scripts["test:v1.8.3"],/subscription-production-completion-v1\.8\.3\.test\.cjs/);
});


test("Founder eligibility exposes $7.99 checkout before Stripe customer and portal after connection",()=>{
  assert.match(billing,/founderEligible = membershipSource === "founder" \|\| storedTier === "founder"/);
  assert.match(billing,/effectiveStatus = "founder"/);
  assert.match(billing,/effectivePlan = "founder"/);
  assert.match(engine,/const protectedAccess = experience\?\.key === "protected_access"/);
  assert.match(engine,/const canManageBilling = providerCapability\("createPortalSession"\) && Boolean\(state\.providerCustomerId\)/);
  assert.match(engine,/Founder pricing is \$7\.99\/month/);
  assert.match(provider,/Set up Founder billing — \$7\.99\/mo/);
  assert.match(provider,/beginCheckout\("founder"/);
  assert.match(billing,/Founder pricing is available only to accounts already granted Founder eligibility/);
  assert.match(engine,/\$\{canManageBilling \? '<button[^']*data-hh-subscription-manage/);
});
