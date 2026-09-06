"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Launch = require("../subscription-launch-v1.8.1.js");

const sql = fs.readFileSync("supabase/v1.8.1-october-launch-trial.sql", "utf8");
const edge = fs.readFileSync("supabase/functions/subscription-billing/index.ts", "utf8");
const build = fs.readFileSync("herdharbor-build.js", "utf8");
const worker = fs.readFileSync("service-worker.js", "utf8");
const release = fs.readFileSync("herdharbor-release-v1.6.1.js", "utf8");

const launch = "2026-10-01T04:00:00.000Z";

test("v1.8.1 defines the October 1 midnight EDT hard-launch boundary", () => {
  assert.equal(Launch.version, "1.8.1");
  assert.equal(Launch.hardLaunchAt, launch);
  assert.equal(Launch.phase("2026-09-06T22:52:00Z"), "launch_trial");
  assert.equal(Launch.phase("2026-10-01T03:59:59.999Z"), "launch_trial");
  assert.equal(Launch.phase(launch), "subscriptions_live");
});

test("all accounts created before the hard launch are launch-trial eligible", () => {
  assert.equal(Launch.signupEligible("2026-07-30T00:00:00Z"), true);
  assert.equal(Launch.signupEligible("2026-09-06T12:00:00Z"), true);
  assert.equal(Launch.signupEligible("2026-10-01T03:59:59.999Z"), true);
  assert.equal(Launch.signupEligible(launch), false);
});

test("launch trial is free through September 30 and expires at the boundary", () => {
  assert.equal(Launch.trialActive(launch, "2026-09-30T23:59:59-04:00"), true);
  assert.equal(Launch.trialActive(launch, "2026-10-01T00:00:00-04:00"), false);
  assert.equal(Launch.launchPolicy().autoCharge, false);
});

test("an expired launch-trial snapshot cannot remain an active paid entitlement", () => {
  const during = Launch.normalizeSnapshot({ status: "trialing", plan: "member", trialEndsAt: launch }, "2026-09-30T23:00:00-04:00");
  const after = Launch.normalizeSnapshot({ status: "trialing", plan: "member", trialEndsAt: launch }, "2026-10-01T00:00:00-04:00");
  assert.equal(during.status, "trialing");
  assert.equal(during.plan, "member");
  assert.equal(Launch.snapshotIsEntitled(during, "2026-09-30T23:00:00-04:00"), true);
  assert.equal(after.status, "expired");
  assert.equal(after.plan, null);
  assert.equal(Launch.snapshotIsEntitled(after, "2026-10-01T00:00:00-04:00"), false);
});

test("manual and founder access remain protected from automatic subscription fallback", () => {
  assert.equal(Launch.__test.manualAccessIsProtected({ membership_source: "manual_override", membership_tier: "founder" }), true);
  assert.equal(Launch.__test.manualAccessIsProtected({ membership_source: "founder", membership_tier: "founder" }), true);
  assert.equal(Launch.__test.manualAccessIsProtected({ membership_source: "default", membership_tier: "member" }), false);
});

test("database migration backfills existing users and makes future signup trial assignment atomic", () => {
  assert.match(sql, /create or replace function public\.handle_new_herdharbor_user\(\)/i);
  assert.match(sql, /from auth\.users u[\s\S]*u\.created_at < '2026-10-01 04:00:00\+00'/i);
  assert.match(sql, /status,\s*billing_interval[\s\S]*'trialing'[\s\S]*'2026-10-01 04:00:00\+00'/i);
  assert.match(sql, /case when before_launch then 'member' else 'junior' end/i);
  assert.match(sql, /case when before_launch then 'trialing' else 'not_configured' end/i);
  assert.match(sql, /on conflict \(user_id\) do update[\s\S]*provider = 'none'[\s\S]*status in \('not_configured', 'trialing'\)/i);
  assert.match(sql, /'auto_charge', false/i);
});

test("checkout is blocked server-side before October 1 and automatically opens at the hard launch", () => {
  assert.match(edge, /const HARD_LAUNCH_AT = "2026-10-01T04:00:00\.000Z"/);
  assert.match(edge, /if \(Date\.now\(\) < HARD_LAUNCH_MS\)[\s\S]*Subscriptions launch October 1/i);
  assert.match(edge, /action === "snapshot"/);
  assert.match(edge, /launchPolicy: launchPolicy\(\)/);
});

test("v1.8.1 shell loads the launch policy after the standalone v1.8.0 subscription engine", () => {
  assert.match(build, /version:\s*"1\.8\.1"/);
  assert.match(build, /buildId:\s*"october-launch-trial-1"/);
  assert.ok(build.indexOf("subscription-launch-v1.8.1.js?v=1") > build.indexOf("subscription-engine-v1.8.0.js?v=1"));
  assert.match(build, /subscription-launch-v1\.8\.1\.css\?v=1/);
  assert.match(worker, /herdharbor-shell-v1\.8\.1-alpha-october-launch-trial-1/);
  assert.match(worker, /"\.\/subscription-launch-v1\.8\.1\.js\?v=1"/);
  assert.match(worker, /"\/subscription-launch-v1\.8\.1\.js"/);
  assert.match(release, /billingEnabled:\s*false/);
});

test("launch copy does not claim automatic billing at trial end", () => {
  const source = fs.readFileSync("subscription-launch-v1.8.1.js", "utf8");
  assert.match(source, /will not be automatically charged on October 1/i);
  assert.doesNotMatch(source, /\bwill automatically charge\b/i);
});