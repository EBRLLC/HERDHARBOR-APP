"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const exists = (name) => fs.existsSync(path.join(root, name));
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("2.0.1 retains canine pedigree and optional AI capabilities", () => {
  for (const filename of [
    "canine-breeds-v2.0.1.js",
    "canine-identity-v2.0.1.js",
    "canine-lineage-v2.0.1.js",
    "canine-pedigree-print-v2.0.1.js",
    "supabase/functions/_shared/herdharbor-ai-access-v2.0.1.ts",
    "supabase/functions/paper-pedigree-extract/index.ts",
    "supabase/functions/record-photo-extract/index.ts",
    "tests/ai-access-gate-v2.0.1.test.cjs",
  ]) {
    assert.ok(exists(filename), `2.0.1 must include ${filename}`);
  }
  assert.match(read("index.html"), /canine-identity-v2\.0\.1\.js/);
  assert.match(read("package.json"), /"version":\s*"2\.0\.2"/);
});

test("2.0.2 integrates the separately gated migration without dropping 2.0.1 features", () => {
  for (const filename of [
    "cloud-normalized-upgrade-v2.0.1.js",
    "supabase/v2.0.1-s20-normalized-only-signup.sql",
    "scripts/s19-cloud-migration.cjs",
    "scripts/s19-cloud-migration-core.cjs",
    "scripts/s19-cloud-migration-sql.cjs",
    "docs/2.0.1-s18-normalized-primary-implementation.md",
    "docs/2.0.1-s19-server-normalized-migration.md",
    "docs/2.0.1-s20-automatic-normalized-upgrade.md",
    "docs/2.0.1-s22-staging-acceptance.md",
    "tests/v2.0.1-stabilization-s18-normalized-primary.test.cjs",
    "docs/2.0.2-staging-execution-evidence.md",
  ]) {
    assert.ok(exists(filename), `2.0.2 candidate must include ${filename}`);
  }
  assert.match(read("index.html"), /cloud-normalized-upgrade-v2\.0\.1\.js\?v=2/);
  assert.match(read("herdharbor-cloud.js"), /hh_normalized_signup_client: "record-cas-v1"/);
  assert.match(read("herdharbor-cloud.js"), /herdharbor_normalized_signup_ready/);
  assert.match(read("service-worker.js"), /herdharbor-shell-v2\.0\.2-normalized-cloud-1/);
  assert.match(read("service-worker.js"), /canine-reproductive-workspace-v2\.0\.1\.js/);
  assert.match(read("supabase/v2.0.1-s20-normalized-only-signup.sql"), /HH_S20_CLIENT_UPDATE_REQUIRED/);
  assert.match(read("supabase/v2.0.1-s20-normalized-only-signup.sql"), /security invoker/);
});

test("2.0.1 preserves existing dual-write, cloud, and PWA safety contracts", () => {
  for (const filename of [
    "herdharbor-cloud.js",
    "cloud-sync-rollout-runtime-v1.8.4.js",
    "pwa.js",
    "service-worker.js",
    "tests/v1.8.4-dual-write-authority-reconcile.test.cjs",
    "tests/v2.0.1-stabilization-s17-compatibility.test.cjs",
  ]) {
    assert.ok(exists(filename), `2.0.1 must retain ${filename}`);
  }
});


test("release instructions authorize #505 only and keep 2.0.2 migration deferred", () => {
  const owner = read("docs/2.0.1-owner-acceptance.md");
  const stability = read("docs/2.0.1-stabilization-s17.md");
  const roadmap = read("ROADMAP.md");
  assert.match(owner, /#505/);
  assert.match(owner, /#506/);
  assert.match(owner, /S17-B-LEGACY-TIMER/);
  assert.doesNotMatch(owner, /Only #497 may|merge of #497|exact green #497/);
  assert.match(stability, /S17-B-LEGACY-TIMER remains an unresolved production upgrade blocker/);
  assert.match(roadmap, /# Release 2\.0\.2 — Normalized Cloud Replacement/);
  assert.match(roadmap, /# Release 2\.0\.3 — Distribution and Install Quality/);
});
