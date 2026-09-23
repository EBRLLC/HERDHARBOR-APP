"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const launch=read("subscription-launch-v1.8.1.js");
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
  assert.match(refs,/self-referral|self referral/i);
  assert.match(refs,/five|5/);
  assert.match(refs,/credit/i);
  assert.match(refs,/renewal/i);
});

test("v1.8.3 production subscription completion remains part of the aggregate gate",()=>{
  const pkg=JSON.parse(read("package.json"));
  assert.match(pkg.scripts["test:v1.8.3"],/subscription-production-completion-v1\.8\.3\.test\.cjs/);
});
