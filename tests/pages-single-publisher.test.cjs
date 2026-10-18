"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const workflow = fs.readFileSync(
  path.join(__dirname, "../.github/workflows/v2.0.0-production-pages.yml"), "utf8"
);
const ci = fs.readFileSync(
  path.join(__dirname, "../.github/workflows/v2.0.0-ci.yml"), "utf8"
);

test("only one main-branch GitHub Actions Pages publisher deploys the exact verified artifact", () => {
  assert.match(workflow, /name: HerdHarbor 2\.0\.1 production Pages verification/);
  assert.match(workflow, /node scripts\/verify-release-candidate-artifact\.mjs _site/);
  assert.match(workflow, /Require GitHub Actions Pages source before publishing/);
  assert.match(workflow, /settings\.get\("build_type"\) != "workflow"/);
  assert.match(workflow, /actions\/upload-pages-artifact@v3/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /path: _site/);
  assert.match(workflow, /github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  assert.equal((workflow.match(/actions\/deploy-pages@/g) || []).length, 1);
  assert.doesNotMatch(ci, /actions\/deploy-pages@|actions\/upload-pages-artifact@/);
});

test("production publishing never waits on or races a branch-source Pages publisher", () => {
  assert.doesNotMatch(workflow, /Wait for branch-source Pages publisher/);
  assert.doesNotMatch(workflow, /gh api .*actions\/runs/);
  assert.doesNotMatch(workflow, /sleep 10/);
  assert.match(workflow, /group: herdharbor-pages-production-verification/);
});
