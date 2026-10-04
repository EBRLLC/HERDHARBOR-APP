const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("C1 keeps Marketplace as a separate gated web surface", () => {
  const html = read("marketplace/index.html");
  const gate = read("marketplace/marketplace-gate-v2.0.1.js");

  assert.match(html, /marketplace-gate-v2\.0\.1\.js\?v=1/);
  assert.doesNotMatch(html, /marketplace-app-v2\.0\.1\.js/);
  assert.match(gate, /client\.auth\.getSession\(\)/);
  assert.match(gate, /client\.rpc\("herdharbor_account_role"\)/);
  assert.match(gate, /String\(role \|\| ""\)\.toLowerCase\(\) !== "owner"/);
  assert.match(gate, /loadStyle\(\)/);
  assert.match(gate, /loadApp\(\)/);
});

test("C1 core app exposes only a lightweight Owner-only Marketplace link", () => {
  const index = read("index.html");
  const nav = read("marketplace-nav-v2.0.1.js");
  const runtime = read("herdharbor-app-runtime.js");

  assert.match(index, /data-marketplace-nav/);
  assert.match(index, /data-marketplace-url="\/marketplace\/"/);
  assert.match(index, /hidden aria-hidden="true"/);
  assert.match(index, /marketplace-nav-v2\.0\.1\.js\?v=1/);
  assert.match(nav, /HerdHarborMembership/);
  assert.match(nav, /isOwner\?\.\(\) === true/);
  assert.match(nav, /backendReady === true/);
  assert.match(nav, /accountStatus/);
  assert.doesNotMatch(nav, /marketplace_listings|marketplace_public_profiles|from\(/);
  assert.match(runtime, /document\.querySelectorAll\("\\.nav-item, \\.brand"\)\.forEach/);
  assert.match(runtime, /item\.hasAttribute\("data-marketplace-nav"\)/);
});

test("C1 service worker does not precache or runtime-cache Marketplace web bundles", () => {
  const sw = read("service-worker.js");
  const required = sw.match(/const REQUIRED_SHELL = \[([\s\S]*?)\];/)?.[1] || "";
  const runtime = sw.match(/const RUNTIME_CACHE_PATHS = \[([\s\S]*?)\];/)?.[1] || "";

  assert.match(required, /marketplace-nav-v2\.0\.1\.js\?v=1/);
  assert.doesNotMatch(required, /marketplace\/marketplace-(?:gate|app|v2)/);
  assert.doesNotMatch(runtime, /marketplace\/marketplace-(?:gate|app|v2)/);
  assert.match(sw, /request\.mode === "navigate" && url\.pathname\.startsWith\("\/marketplace"\)/);
  assert.match(sw, /event\.respondWith\(fetch\(request, \{ cache: "no-store" \}\)\)/);
});

test("C1 migration closes failed-stack access and reopens only Owner-preview core tables", () => {
  const sql = read("supabase/stack-c1-marketplace-owner-preview-security.sql");

  assert.match(sql, /revoke all privileges on table public\.%I from anon, authenticated/i);
  assert.match(sql, /p\.proname like 'marketplace_%'/i);
  assert.match(sql, /revoke all privileges on function %s from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function %s to service_role/i);
  assert.match(sql, /drop policy if exists/i);
  assert.match(sql, /herdharbor_account_role\(\)\) = 'owner'/i);
  assert.match(sql, /grant select, insert, update, delete on table public\.marketplace_listings to authenticated/i);
  assert.doesNotMatch(sql, /grant[^;]+\bto anon\b/i);
  assert.match(sql, /values \('marketplace-public', 'marketplace-public', false\)/i);
  assert.match(sql, /marketplace_storage_owner_preview_select/i);
  assert.match(sql, /owner_id = \(select auth\.uid\(\)\)::text/i);
});

test("C1 migration preserves Marketplace as server-native data, outside private herd sync", () => {
  const sql = read("supabase/stack-c1-marketplace-owner-preview-security.sql");
  const gate = read("marketplace/marketplace-gate-v2.0.1.js");
  const app = read("marketplace/marketplace-app-v2.0.1.js");

  for (const content of [sql, gate, app]) {
    assert.doesNotMatch(content, /HerdHarborStateStore|herdharbor_user_data|herdharbor_sync_records|cloud conflict|offline save queue/i);
  }
});
