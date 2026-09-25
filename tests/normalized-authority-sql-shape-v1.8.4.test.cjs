"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sql = fs.readFileSync(
  path.join(__dirname, "..", "supabase", "v1.8.4-normalized-authority-cutover.sql"),
  "utf8"
);

const functions = [
  "herdharbor_block_legacy_write_after_normalized",
  "herdharbor_touch_sync_manifest",
  "herdharbor_sync_activate_normalized_authority",
  "herdharbor_sync_materialize_legacy_recovery",
  "herdharbor_sync_set_stage",
  "herdharbor_sync_apply_record",
  "herdharbor_sync_cohort_status"
];

test("PR7 authority migration contains one canonical definition of every modified function", () => {
  for (const name of functions) {
    const pattern = new RegExp("create or replace function public\\." + name + "\\b", "gi");
    const matches = sql.match(pattern) || [];
    assert.equal(matches.length, 1, name + " must be defined exactly once");
  }
  assert.equal((sql.match(/\bcommit;/gi) || []).length, 1, "migration must contain exactly one COMMIT");
  assert.equal((sql.match(/^begin;$/gmi) || []).length, 1, "migration must contain exactly one top-level BEGIN");
});

test("PR7 authority migration has balanced PL/pgSQL dollar quotes and no truncated fragments", () => {
  const dollars = sql.match(/\$\$/g) || [];
  assert.equal(dollars.length % 2, 0, "every PL/pgSQL body must have paired $$ delimiters");
  assert.equal(dollars.length, functions.length * 2, "each function must have one $$ body pair");
  assert.doesNotMatch(sql, /as \$\s*$/mi, "single-dollar function delimiters are invalid");
  assert.doesNotMatch(sql, /!~ '\^\[0-9\]\+\s*$/mi, "numeric validation regex must not be truncated");
});

test("PR7 migration is one additive transaction with no normalized-record cleanup", () => {
  assert.match(sql, /^begin;/mi);
  assert.match(sql, /commit;\s*$/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.herdharbor_sync_records/i);
  assert.doesNotMatch(sql, /truncate\s+table/i);
  assert.doesNotMatch(sql, /drop\s+table/i);
});
