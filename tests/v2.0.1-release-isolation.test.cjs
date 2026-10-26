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
  assert.match(read("package.json"), /"version":\s*"2\.0\.1"/);
});

test("2.0.1 does not ship the 2.0.2 normalized-primary cutover or Auth trigger", () => {
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
  ]) {
    assert.equal(exists(filename), false, `2.0.1 must defer ${filename} to 2.0.2`);
  }
  const html = read("index.html");
  assert.doesNotMatch(html, /cloud-normalized-upgrade-v2\.0\.1\.js/);
  assert.doesNotMatch(html, /hh_normalized_signup_client|herdharbor_normalized_signup_ready/);
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
