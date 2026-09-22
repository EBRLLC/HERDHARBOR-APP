"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const paper = read("supabase/functions/paper-pedigree-extract/index.ts");
const photo = read("supabase/functions/record-photo-extract/index.ts");
const sql = read("supabase/v1.8.3-ai-image-usage-guard.sql");
const pkg = JSON.parse(read("package.json"));

test("AI image readers default to five scans per user per UTC day", () => {
  assert.match(paper, /const DEFAULT_DAILY_LIMIT = 5;/);
  assert.match(photo, /const DEFAULT_DAILY_LIMIT = 5;/);
  assert.match(paper, /PAPER_PEDIGREE_DAILY_LIMIT/);
  assert.match(photo, /PHOTO_ENTRY_DAILY_LIMIT/);
});

test("both readers share a conservative global daily backstop", () => {
  assert.match(paper, /const DEFAULT_GLOBAL_DAILY_LIMIT = 25;/);
  assert.match(photo, /const DEFAULT_GLOBAL_DAILY_LIMIT = 25;/);
  assert.match(paper, /AI_IMAGE_GLOBAL_DAILY_LIMIT/);
  assert.match(photo, /AI_IMAGE_GLOBAL_DAILY_LIMIT/);
  assert.match(paper, /herdharbor_reserve_ai_image_request/);
  assert.match(photo, /herdharbor_reserve_ai_image_request/);
  assert.match(paper, /p_feature:\s*"paper_pedigree"/);
  assert.match(photo, /p_feature:\s*"record_photo"/);
});

test("shared SQL guard atomically enforces user and global quotas", () => {
  assert.match(sql, /create table if not exists public\.herdharbor_ai_image_usage/);
  assert.match(sql, /create table if not exists public\.herdharbor_ai_image_global_usage/);
  assert.match(sql, /create or replace function public\.herdharbor_reserve_ai_image_request/);
  assert.match(sql, /for update;/i);
  assert.match(sql, /return 'user_quota'/);
  assert.match(sql, /return 'global_quota'/);
  assert.match(sql, /return 'reserved'/);
  assert.match(sql, /feature in \('paper_pedigree', 'record_photo'\)/);
});

test("AI usage ledgers are service-role-only and store no image or extracted farm content", () => {
  assert.match(sql, /revoke all on table public\.herdharbor_ai_image_usage from public, anon, authenticated/);
  assert.match(sql, /revoke all on table public\.herdharbor_ai_image_global_usage from public, anon, authenticated/);
  assert.match(sql, /grant all on table public\.herdharbor_ai_image_usage to service_role/);
  assert.match(sql, /grant execute on function public\.herdharbor_reserve_ai_image_request\(uuid, text, integer, integer\)[\s\S]*to service_role/);
  const userTable = sql.slice(sql.indexOf("create table if not exists public.herdharbor_ai_image_usage"), sql.indexOf(");", sql.indexOf("create table if not exists public.herdharbor_ai_image_usage")) + 2);
  const globalTable = sql.slice(sql.indexOf("create table if not exists public.herdharbor_ai_image_global_usage"), sql.indexOf(");", sql.indexOf("create table if not exists public.herdharbor_ai_image_global_usage")) + 2);
  assert.doesNotMatch(userTable + globalTable, /data_url|image_url|prompt|provider_response|farm_state|extracted_(?:text|value)/i);
});

test("quota failures occur before provider fetches and fail closed", () => {
  for (const source of [paper, photo]) {
    const reserveIndex = source.indexOf('herdharbor_reserve_ai_image_request');
    const providerIndex = source.indexOf('fetch(OPENAI_API');
    assert.ok(reserveIndex >= 0 && providerIndex > reserveIndex);
    assert.match(source, /usage_ledger_unavailable/);
    assert.match(source, /quota_exceeded/);
    assert.match(source, /global_quota_exceeded/);
  }
});

test("formal v1.8.3 gate includes AI image usage-limit coverage", () => {
  assert.match(pkg.scripts["test:v1.8.3"], /ai-image-usage-limits-v1\.8\.3\.test\.cjs/);
});
