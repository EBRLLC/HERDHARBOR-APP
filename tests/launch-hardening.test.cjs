"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const cloud = fs.readFileSync(path.join(root, "herdharbor-cloud.js"), "utf8");
const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const pwa = fs.readFileSync(path.join(root, "pwa.js"), "utf8");

assert.match(html, /const APP_VERSION = "1\.3\.0"/);
assert.match(html, /id="request-account-deletion"/);
assert.match(html, /Type DELETE to confirm/);
assert.match(html, /herdharbor\.com\/delete-account\//);
assert.match(html, /herdharbor\.com\/privacy\//);
assert.match(html, /herdharbor\.com\/terms\//);
assert.match(html, /herdharbor\.com\/support\//);
assert.match(html, /Clear local data/);
assert.doesNotMatch(html, />Clear all data</);

assert.match(cloud, /async function requestAccountDeletion/);
assert.match(cloud, /confirmation !== "DELETE"/);
assert.match(cloud, /account_user_id/);
assert.match(cloud, /Account and associated data deletion/);
assert.match(cloud, /navigator\.onLine === false/);
assert.match(cloud, /dirty && !\(await syncNow\(\)\)/);
assert.match(cloud, /requestAccountDeletion\n/);

assert.match(worker, /v1\.4\.1-alpha-20260824-2/);
assert.match(worker, /herdharbor-cloud\.js\?v=17/);
assert.match(worker, /symptom-guide\.js\?v=1/);
assert.match(worker, /pwa\.js\?v=21/);
assert.match(worker, /pwa\.js\?v=24/);
assert.match(worker, /pedigree-visual\.css\?v=2/);
assert.match(worker, /pedigree-visual\.js\?v=2/);
assert.match(worker, /breeding-intelligence-core\.js\?v=1\.4\.0/);
assert.match(worker, /breeding-intelligence\.js\?v=1\.4\.0/);
assert.match(worker, /breeding-pair-hotfix-v1\.4\.1\.js\?v=2/);
assert.match(worker, /breeding-intelligence-tools\.js\?v=1\.4\.0/);
assert.match(worker, /spreadsheet-import\.js\?v=17/);
assert.match(pwa, /1\.4\.1-alpha-rabbit-pair-hotfix-2/);
assert.match(pwa, /loadPedigreeVisuals/);
assert.match(pwa, /loadBreedingIntelligence/);
assert.match(pwa, /breeding-pair-hotfix-v1\.4\.1\.js\?v=2/);

console.log("launch hardening and account deletion tests passed");
