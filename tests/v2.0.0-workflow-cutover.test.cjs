"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));

const ciPath = ".github/workflows/v2.0.0-ci.yml";
const pagesPath = ".github/workflows/v2.0.0-production-pages.yml";
const acceptancePath = ".github/workflows/v2.0.0-production-acceptance.yml";
const ci = read(ciPath);
const pages = read(pagesPath);
const acceptance = read(acceptancePath);

test("2.0.0 workflows are the only active current-release workflow files", () => {
  for (const p of [ciPath, pagesPath, acceptancePath]) assert.equal(exists(p), true, p);
  for (const p of [
    ".github/workflows/v1.8.4-ci.yml",
    ".github/workflows/v1.8.4-production-pages.yml",
    ".github/workflows/v1.8.4-production-acceptance.yml"
  ]) assert.equal(exists(p), false, p);
});

test("CI presents stable 2.0.0 names and still validates stacked release PRs", () => {
  assert.match(ci, /^name: HerdHarbor 2\.0\.0 CI$/m);
  assert.ok(ci.includes("branches: [main, 'release-2.0.0-phase-*', 'breeder-docs/phase-*', 'breeding-intel/phase-*', 'marketplace-site/app-*', 'marketplace-comms/app-*']"));
  assert.match(ci, /group: herdharbor-v2\.0\.0-ci-/);
  assert.match(ci, /Verify current 2\.0\.0 release contract/);
  assert.match(ci, /Android 2\.0\.0 review bundle/);
  assert.match(ci, /herdharbor-v2\.0\.0-monitoring-bundle/);
  assert.match(ci, /herdharbor-v2\.0\.0-unsigned-aab/);
  assert.doesNotMatch(ci, /Alpha v1\.8\.4|current v1\.8\.4 release|Android v1\.8\.4/);
});

test("production Pages verification validates 2.0.0 without becoming a second publisher", () => {
  assert.match(pages, /^name: HerdHarbor 2\.0\.0 production Pages verification$/m);
  assert.match(pages, /npm run test:v2\.0\.0/);
  assert.match(pages, /version: "2\.0\.0"/);
  assert.match(pages, /HerdHarbor@2\.0\.0/);
  assert.match(pages, /RELEASE_SHA="\$\(git rev-parse HEAD\)"/);
  assert.match(pages, /test "\$RELEASE_SHA" = "\$\{GITHUB_SHA\}"/);
  assert.match(pages, /generate-release-assets\.mjs _site/);
  assert.match(pages, /Production Pages artifact verified/);
  assert.doesNotMatch(pages, /actions\/deploy-pages@v4|actions\/upload-pages-artifact@v3/);
  assert.doesNotMatch(pages, /Wait for branch-source Pages publisher|sleep 10/);
  assert.doesNotMatch(pages, /npm run test:v1\.8\.4|HerdHarbor@1\.8\.4|version: "1\.8\.4"/);
});

test("production acceptance identifies and tests the stable 2.0.0 release", () => {
  assert.match(acceptance, /^name: HerdHarbor 2\.0\.0 production acceptance$/m);
  assert.match(acceptance, /HERDHARBOR_BUILD_ID: v2\.0\.0-production-acceptance/);
  assert.match(acceptance, /npm run test:v2\.0\.0/);
  assert.match(acceptance, /HerdHarbor 2\.0\.0 protected production acceptance finished/);
  assert.doesNotMatch(acceptance, /Alpha v1\.8\.4|test:v1\.8\.4|v1\.8\.4-production-acceptance/);
});
