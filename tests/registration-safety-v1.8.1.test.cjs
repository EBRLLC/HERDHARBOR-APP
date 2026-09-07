"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const ui = fs.readFileSync("registration-safety-v1.8.1.js", "utf8");
const edge = fs.readFileSync("supabase/functions/registration-profile/index.ts", "utf8");
const sql = fs.readFileSync("supabase/v1.8.1-registration-safety.sql", "utf8");
const build = fs.readFileSync("herdharbor-build.js", "utf8");
const sw = fs.readFileSync("service-worker.js", "utf8");
const config = fs.readFileSync("supabase/config.toml", "utf8");

test("signup collects the minimum identity and contact fields for fraud review", () => {
  for (const marker of [
    "Legal first name",
    "Legal last name",
    "Date of birth",
    "Phone number",
    "State / province / region",
    "ZIP / postal code",
    "Farm, rabbitry, club, or business name",
    "Who will primarily use this account?"
  ]) assert.match(ui, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(ui, /data-hh-reg-website/);
  assert.doesNotMatch(ui, /social security|\bssn\b|driver'?s license|passport number|government id/i);
});

test("under-18 users are blocked and directed to a parent or legal guardian", () => {
  assert.match(ui, /const MINIMUM_AGE = 18/);
  assert.match(ui, /age < MINIMUM_AGE/);
  assert.match(ui, /parent or legal guardian/i);
  assert.match(ui, /guardian_for_minor/);
  assert.match(ui, /guardianAttestation/);
  assert.match(edge, /age < policy\.minimum_account_holder_age/);
  assert.match(edge, /parent or legal guardian/i);
});

test("registration uses the existing authenticated cloud transport", () => {
  assert.match(ui, /HerdHarborCloud\.invokeFunction\("registration-profile"/);
  assert.doesNotMatch(ui, /createClient\s*\(/);
  assert.match(edge, /admin\.auth\.getUser\(token\)/);
  assert.match(config, /\[functions\.registration-profile\][\s\S]*verify_jwt = true/);
});

test("registration PII is server-only and full date of birth is not retained", () => {
  assert.match(sql, /create table if not exists public\.registration_profiles/);
  assert.match(sql, /alter table public\.registration_profiles enable row level security/);
  assert.match(sql, /revoke all on table public\.registration_profiles from anon, authenticated/);
  assert.match(sql, /age_at_registration/);
  assert.doesNotMatch(sql, /date_of_birth\s+(date|text|timestamp)/i);
  assert.match(edge, /age_at_registration:\s*age/);
  assert.doesNotMatch(edge, /date_of_birth:/);
});

test("new-account enforcement is rollout-controlled so legacy members are grandfathered", () => {
  assert.match(sql, /registration_policy/);
  assert.match(sql, /enabled boolean not null default false/);
  assert.match(edge, /Date\.parse\(userCreatedAt\) >= Date\.parse\(policy\.enforcement_started_at\)/);
  assert.match(edge, /legacy:\s*true/);
});

test("registration safety asset is loaded and refreshed by the current PWA shell", () => {
  assert.match(build, /registration-safety-v1\.8\.1\.js\?v=1/);
  assert.match(sw, /\.\/registration-safety-v1\.8\.1\.js\?v=1/);
  assert.match(sw, /"\/registration-safety-v1\.8\.1\.js"/);
});
