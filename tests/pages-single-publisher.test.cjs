"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const workflow = fs.readFileSync(
  path.join(root, ".github/workflows/v2.0.0-production-pages.yml"),
  "utf8"
);

test("production Pages monitored workflow never deploys a second Pages artifact", () => {
  assert.match(workflow, /name: HerdHarbor 2\.0\.0 production Pages verification/);
  assert.match(workflow, /Wait for branch-source Pages publisher/);
  assert.match(workflow, /Production Pages artifact verified/);
  assert.doesNotMatch(workflow, /actions\/deploy-pages@/);
  assert.doesNotMatch(workflow, /actions\/upload-pages-artifact@/);
  assert.doesNotMatch(workflow, /environment:\s*\n\s*name:\s*github-pages/);
});

test("production verification requires branch-source Pages to complete successfully enough to finish", () => {
  assert.match(workflow, /if \[ -z "\$found" \]; then[\s\S]*exit 1/);
  assert.match(workflow, /group: herdharbor-pages-production-verification/);
});
