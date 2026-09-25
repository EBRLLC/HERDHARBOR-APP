"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

const runbook = fs.readFileSync(
  path.join(root, "CLOUD-SYNC-NORMALIZED-AUTHORITY-RUNBOOK-v1.8.4.md"),
  "utf8"
);
const historical = fs.readFileSync(
  path.join(root, "CLOUD-SYNC-CONTROLLED-ROLLOUT-v1.8.3.md"),
  "utf8"
);
const runtime = fs.readFileSync(
  path.join(root, "cloud-sync-rollout-runtime-v1.8.4.js"),
  "utf8"
);
const cohortSql = fs.readFileSync(
  path.join(root, "supabase", "v1.8.4-normalized-sync-internal-cohort.sql"),
  "utf8"
);
const authoritySql = fs.readFileSync(
  path.join(root, "supabase", "v1.8.4-normalized-authority-cutover.sql"),
  "utf8"
);

test("v1.8.4 authority runbook preserves the controlled rollout boundary", () => {
  assert.match(runbook, /legacy -> shadow -> dual_write -> normalized/);
  assert.match(runbook, /normalized -> dual_write -> shadow -> legacy/);
  assert.match(runbook, /does not authorize a mass rollout/i);
  assert.match(runbook, /Do not:\s*[\s\S]*use percentage rollout/i);
  assert.match(runbook, /choose or infer a test account by scanning `auth\.users`/i);
  assert.match(runbook, /manually update `herdharbor_sync_manifest\.cutover_stage`/i);
  assert.match(runbook, /Completing one controlled trial does not authorize removal of legacy sync/i);
  assert.match(runbook, /Retirement, when separately authorized, must be its own reviewed change/i);
});

test("runbook acceptance gates match the executable v1.8.4 runtime", () => {
  assert.match(runtime, /const REQUIRED_VALIDATION_PASSES = 3;/);
  assert.match(runbook, /three consecutive successful checkpoints/i);
  assert.match(runbook, /promoteToDualWrite\(\)/);
  assert.match(runbook, /promoteToNormalized\(\)/);
  assert.match(runbook, /rollbackToLegacy\(\)/);
  assert.match(runtime, /while \(ctx\.stage !== "legacy"\)/);
  assert.match(runtime, /legacy-dirty-without-record-outbox/);
  assert.match(runtime, /pending-normalized-mutations/);
  assert.match(runtime, /HH_SYNC_NORMALIZED_READ_VERIFY_FAILED/);
});

test("runbook cohort procedure matches server-enforced allowlist-only controls", () => {
  const executableCohortSql = cohortSql.replace(/--.*$/gm, "");
  assert.doesNotMatch(executableCohortSql, /\bpercentage\b/i);
  assert.doesNotMatch(executableCohortSql, /insert into public\.herdharbor_sync_cohort/i);
  assert.match(cohortSql, /revoke all on table public\.herdharbor_sync_cohort from anon, authenticated/i);
  assert.match(cohortSql, /'mode', 'allowlist'/i);
  assert.match(cohortSql, /'percentage_enabled', false/i);
  assert.match(runbook, /There is intentionally no browser write RPC for cohort administration/i);
  assert.match(runbook, /insert into public\.herdharbor_sync_cohort/);
});

test("authority and rollback claims in the runbook remain backed by SQL guards", () => {
  assert.match(authoritySql, /HH_SYNC_LEGACY_WRITE_BLOCKED_AFTER_CUTOVER/);
  assert.match(authoritySql, /HH_SYNC_AUTHORITY_ACTIVATION_RPC_REQUIRED/);
  assert.match(authoritySql, /legacy_recovery_lock/);
  assert.match(authoritySql, /herdharbor_sync_materialize_legacy_recovery/);
  assert.match(authoritySql, /normalized -> dual_write/i);
  assert.match(runbook, /stale legacy clients blocked by the database guard/i);
  assert.match(runbook, /retain normalized rows/i);
  assert.match(runbook, /clear the recovery lock only on return to legacy/i);
});

test("historical v1.8.3 rollout guide points operators to the current runbook", () => {
  assert.match(historical, /Current operator note \(Alpha v1\.8\.4\)/);
  assert.match(historical, /CLOUD-SYNC-NORMALIZED-AUTHORITY-RUNBOOK-v1\.8\.4\.md/);
  assert.match(historical, /Do not use this historical guide to enroll or promote an account/i);
});
