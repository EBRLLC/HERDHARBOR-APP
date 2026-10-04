const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("C1A app exposes only an Owner-only external website link", () => {
  const index = read("index.html");
  const nav = read("marketplace-nav-v2.0.1.js");

  assert.match(index, /data-marketplace-nav/);
  assert.match(index, /href="https:\/\/herdharbor\.com\/marketplace\/"/);
  assert.match(index, /target="_blank"/);
  assert.match(index, /rel="noopener noreferrer"/);
  assert.match(nav, /HerdHarborMembership/);
  assert.match(nav, /isOwner\?\.\(\) === true/);
  assert.match(nav, /backendReady === true/);
  assert.doesNotMatch(nav, /supabase|marketplace_listings|marketplace_public_profiles|location\.assign|addEventListener\("click"/i);
});

test("C1A app repo does not host Marketplace website runtime", () => {
  const forbidden = [
    "marketplace/index.html",
    "marketplace/marketplace-gate-v2.0.1.js",
    "marketplace/marketplace-app-v2.0.1.js",
    "marketplace/marketplace-v2.0.1.css"
  ];
  for (const file of forbidden) {
    assert.equal(fs.existsSync(path.join(root, file)), false, file + " must not exist in APP-C1");
  }
});

test("C1A service worker caches no Marketplace website assets", () => {
  const sw = read("service-worker.js");
  const required = sw.match(/const REQUIRED_SHELL = \[([\s\S]*?)\];/)?.[1] || "";
  const runtime = sw.match(/const RUNTIME_CACHE_PATHS = \[([\s\S]*?)\];/)?.[1] || "";
  assert.match(required, /marketplace-nav-v2\.0\.1\.js\?v=2/);
  assert.doesNotMatch(required, /marketplace\//);
  assert.doesNotMatch(runtime, /marketplace\//);
  assert.doesNotMatch(sw, /herdharbor\.com\/marketplace/);
});

test("C1A migration keeps Marketplace DB RPC and storage access Owner-only", () => {
  const sql = read("supabase/stack-c1a-marketplace-owner-preview-security.sql");
  assert.match(sql, /revoke all privileges on table public\.%I from anon, authenticated/i);
  assert.match(sql, /p\.proname like 'marketplace_%'/i);
  assert.match(sql, /revoke all privileges on function %s from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function %s to service_role/i);
  assert.match(sql, /herdharbor_account_role\(\)\) = 'owner'/i);
  assert.doesNotMatch(sql, /grant[^;]+\bto anon\b/i);
  assert.match(sql, /values \('marketplace-public', 'marketplace-public', false\)/i);
  assert.match(sql, /marketplace_storage_owner_preview_select/i);
});

test("C1A does not introduce hard-coded Owner identity or private sync coupling", () => {
  const content = [
    read("marketplace-nav-v2.0.1.js"),
    read("supabase/stack-c1a-marketplace-owner-preview-security.sql")
  ].join("\n");
  assert.doesNotMatch(content, /@(?:gmail|yahoo|outlook|icloud)\.com|owner[_-]?(?:email|user[_-]?id)\s*=|HerdHarborStateStore|offline save queue|cloud conflict/i);
});
