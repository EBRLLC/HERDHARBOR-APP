"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const foundation = fs.readFileSync(
  path.join(root, "supabase", "v1.8.3-cloud-sync-normalized-records.sql"),
  "utf8"
);
const hardening = fs.readFileSync(
  path.join(root, "supabase", "v1.8.4-normalized-sync-rls-performance.sql"),
  "utf8"
);

test("normalized owner RLS initializes auth.uid once per statement", () => {
  for (const source of [foundation, hardening]) {
    assert.match(source, /using\s*\(user_id = \(select auth\.uid\(\)\)\)/i);
    assert.doesNotMatch(source, /using\s*\(user_id = auth\.uid\(\)\)/i);
  }
});

test("v1.8.4 RLS hardening changes policies only and never mutates application rows", () => {
  assert.match(hardening, /drop policy if exists "users read own normalized sync records"/i);
  assert.match(hardening, /create policy "users read own normalized sync records"/i);
  assert.match(hardening, /drop policy if exists "users read own sync manifest"/i);
  assert.match(hardening, /create policy "users read own sync manifest"/i);
  assert.doesNotMatch(hardening, /\b(?:insert|update|delete|truncate)\s+(?:into\s+|from\s+)?public\.herdharbor_/i);
});
