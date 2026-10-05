"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sql = fs.readFileSync(path.join(root, "supabase/stack-d2-marketplace-blocking-reporting.sql"), "utf8");

test("D2 extends the canonical report table with structured categories and evidence refs", () => {
  assert.match(sql, /alter table public\.marketplace_reports/i);
  assert.match(sql, /category text not null default 'other'/i);
  assert.match(sql, /evidence_refs jsonb not null default '\[\]'::jsonb/i);
  assert.match(sql, /marketplace_reports_category_check/i);
  assert.match(sql, /jsonb_array_length\(evidence_refs\)<=20/i);
});

test("D2 direct seller blocking reuses marketplace_blocks", () => {
  assert.match(sql, /marketplace_member_set_user_block/i);
  assert.match(sql, /insert into public\.marketplace_blocks/i);
  assert.match(sql, /delete from public\.marketplace_blocks/i);
  assert.doesNotMatch(sql, /create table[^;]*block/i);
});

test("D2 blocking preserves history but prevents active contact paths", () => {
  assert.match(sql, /set archived_at=coalesce\(mine\.archived_at,now\(\)\)/i);
  assert.match(sql, /marketplace_member_user_block_state/i);
});

test("D2 report v2 delegates target validation and evidence snapshotting to canonical report RPC", () => {
  assert.match(sql, /result_id := public\.marketplace_member_submit_report\(/i);
  assert.match(sql, /update public\.marketplace_reports[\s\S]*category=safe_category/i);
  assert.match(sql, /revoke all on function public\.marketplace_member_submit_report_v2/i);
});
