"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sql = fs.readFileSync(path.join(root, "supabase/stack-d3-marketplace-moderation.sql"), "utf8");

test("D3 adds Marketplace-only user warnings without touching private herd tables", () => {
  assert.match(sql, /create table if not exists public\.marketplace_user_warnings/i);
  assert.match(sql, /marketplace_member_warnings/i);
  assert.match(sql, /marketplace_member_acknowledge_warning/i);
  assert.doesNotMatch(sql, /herdharbor_user_data|herdharbor_state|herdharbor_sync_manifest/i);
});

test("D3 Owner moderation is server authorized", () => {
  for (const fn of [
    "marketplace_owner_admin_set_report_reviewing",
    "marketplace_owner_admin_warn_reported_user",
    "marketplace_owner_admin_reports_v3"
  ]) {
    assert.ok(sql.includes(fn), fn);
  }
  assert.match(sql, /public\.herdharbor_account_role\(\)<>'owner'/i);
});

test("D3 warning actions are auditable and can derive the reported user across target types", () => {
  assert.match(sql, /'warn_user'/i);
  assert.match(sql, /marketplace_moderation_actions/i);
  for (const type of ["listing","user","message","conversation"]) {
    assert.ok(sql.includes("report_row.target_type='"+type+"'"), type);
  }
});

test("D3 reports v3 exposes D2 category and evidence refs through the existing v2 context query", () => {
  assert.match(sql, /marketplace_owner_admin_reports_v3/i);
  assert.match(sql, /coalesce\(r\.category,'other'\)/i);
  assert.match(sql, /coalesce\(r\.evidence_refs,'\[\]'::jsonb\)/i);
  assert.match(sql, /marketplace_owner_admin_reports_v2\(safe_status\)/i);
});
