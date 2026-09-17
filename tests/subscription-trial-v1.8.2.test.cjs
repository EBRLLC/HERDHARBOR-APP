"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadTrialHelper() {
  const source = fs.readFileSync("supabase/functions/_shared/subscription-trial.ts", "utf8")
    .replace(/^export\s+/gm, "");
  const context = vm.createContext({ Intl, Date, Math, Number, String, Object, console });
  vm.runInContext(`${source}\nthis.api={HARD_LAUNCH_AT,addCalendarMonthInZone,initialTrialEndsAt,trialSnapshot};`, context);
  return context.api;
}

const api = loadTrialHelper();

test("pre-launch accounts stay free until October 1", () => {
  assert.equal(api.initialTrialEndsAt("2026-08-15T16:00:00.000Z").toISOString(), "2026-10-01T04:00:00.000Z");
});

test("September 24 signup gets one full calendar month", () => {
  assert.equal(api.initialTrialEndsAt("2026-09-24T18:30:00.000Z").toISOString(), "2026-10-24T18:30:00.000Z");
});

test("September 30 signup ends October 30 at same New York wall clock", () => {
  assert.equal(api.initialTrialEndsAt("2026-09-30T13:15:00.000Z").toISOString(), "2026-10-30T13:15:00.000Z");
});

test("October signup preserves New York wall-clock time across DST", () => {
  // Oct 10 10:00 EDT = 14:00Z; Nov 10 10:00 EST = 15:00Z.
  assert.equal(api.initialTrialEndsAt("2026-10-10T14:00:00.000Z").toISOString(), "2026-11-10T15:00:00.000Z");
});

test("end-of-month signup clamps to final day of shorter month", () => {
  assert.equal(api.addCalendarMonthInZone("2027-01-31T15:00:00.000Z").toISOString(), "2027-02-28T15:00:00.000Z");
});

test("trial boundary becomes inactive exactly at authoritative end", () => {
  const user = { created_at: "2026-09-24T18:30:00.000Z" };
  assert.equal(api.trialSnapshot(user, new Date("2026-10-24T18:29:59.999Z")).active, true);
  assert.equal(api.trialSnapshot(user, new Date("2026-10-24T18:30:00.000Z")).active, false);
});

test("billing source uses authoritative auth user creation and preserves early-subscribe free time", () => {
  const billing = fs.readFileSync("supabase/functions/subscription-billing/index.ts", "utf8");
  assert.match(billing, /buildSnapshot\(admin, user\)/);
  assert.match(billing, /trialSnapshot\(user\)/);
  assert.match(billing, /user\.created_at/);
  assert.doesNotMatch(billing, /body\.(?:trialEndsAt|createdAt|accountCreatedAt)/);
  assert.match(billing, /billing_cycle_anchor:\s*trialEndUnix/);
  assert.match(billing, /proration_behavior:\s*"none"/);
  assert.match(billing, /herdharbor_initial_trial_end/);
  assert.match(billing, /subscriptionRequired/);
  assert.match(billing, /"free_junior"/);
});

test("admin authorization and audit trail remain server-side", () => {
  const billing = fs.readFileSync("supabase/functions/subscription-billing/index.ts", "utf8");
  assert.match(billing, /async function requireAdmin/);
  assert.match(billing, /\["owner", "admin"\]\.includes\(role\)/);
  assert.match(billing, /admin_audit_log/);
  assert.match(billing, /subscription_credit_added/);
});

test("browser provider keeps auth lock independent and marks only live session snapshots trusted", () => {
  const provider = fs.readFileSync("subscription-stripe-provider-v1.8.0.js", "utf8");
  assert.match(provider, /classList\.contains\("hh-auth-locked"\)/);
  assert.match(provider, /verifiedSnapshotUserId/);
  assert.match(provider, /HerdHarborStripeSnapshotTrust/);
  assert.match(provider, /isVerified/);
  assert.doesNotMatch(provider, /setSession\s*\(/);
  assert.doesNotMatch(provider, /signOut\s*\(/);
  assert.match(provider, /No credit card is required during your free trial/);
  assert.match(provider, /Subscribe — billing starts/);
});
