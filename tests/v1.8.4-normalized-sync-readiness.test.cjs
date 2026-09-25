"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=(p)=>fs.readFileSync(path.join(root,p),"utf8");

test("v1.8.4 normalized readiness binds schema, preflight, rollout, fallback and rollback safeguards",()=>{
  const readiness=read("V1.8.4-NORMALIZED-SYNC-READINESS.md");
  const schema=read("supabase/v1.8.3-cloud-sync-normalized-records.sql");
  const guard=read("supabase/v1.8.3-cloud-sync-cutover-legacy-guard.sql");
  const preflight=read("supabase/v1.8.3-cloud-sync-rollout-preflight.sql");
  const index=read("index.html");
  for(const token of [
    "herdharbor_sync_records","herdharbor_sync_manifest",
    "herdharbor_sync_apply_batch","herdharbor_sync_mark_verified",
    "herdharbor_sync_set_stage","herdharbor_sync_prepare_normalized_writer"
  ]) assert.match(schema,new RegExp(token));
  assert.match(guard,/herdharbor_legacy_write_cutover_guard/);
  assert.match(preflight,/READ ONLY/i);
  assert.match(readiness,/legacy -> shadow -> dual_write -> normalized/);
  assert.match(readiness,/normalized -> dual_write -> shadow -> legacy/);
  assert.match(index,/cloud-sync-rollout-runtime-v1\.8\.4\.js/);
  assert.doesNotMatch(index,/cloud-sync-rollout-control-v1\.8\.3\.js/);
  const rollout=read("cloud-sync-rollout-runtime-v1.8.4.js");
  assert.match(rollout,/eligibility\?\.mode !== "allowlist"/);
  assert.match(rollout,/eligibility\?\.percentageEnabled === true/);
  assert.match(rollout,/REQUIRED_VALIDATION_PASSES = 3/);
  assert.doesNotMatch(rollout,/promote\("normalized"/);
});

test("v1.8.4 normalized readiness preserves owner RLS and no destructive legacy cleanup",()=>{
  const schema=read("supabase/v1.8.3-cloud-sync-normalized-records.sql");
  const readiness=read("V1.8.4-NORMALIZED-SYNC-READINESS.md");
  assert.match(schema,/enable row level security/i);
  assert.match(schema,/user_id = \(select auth\.uid\(\)\)/i);
  assert.match(schema,/revoke all on table public\.herdharbor_sync_records from anon, authenticated/i);
  assert.match(schema,/revoke all on table public\.herdharbor_sync_manifest from anon, authenticated/i);
  assert.match(schema,/grant select on table public\.herdharbor_sync_records to authenticated/i);
  assert.match(schema,/grant select on table public\.herdharbor_sync_manifest to authenticated/i);
  assert.match(readiness,/do not perform destructive cleanup/i);
  assert.match(readiness,/does not[\s\S]*mass-enable normalized sync/i);
  assert.match(readiness,/does not[\s\S]*enable percentage cohorts/i);
});
