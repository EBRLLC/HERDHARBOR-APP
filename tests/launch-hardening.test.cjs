"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const cloud = fs.readFileSync(path.join(root, "herdharbor-cloud.js"), "utf8");
const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const pwa = fs.readFileSync(path.join(root, "pwa.js"), "utf8");

assert.match(html, /const APP_VERSION = "0\.5\.2"/);
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

assert.match(worker, /v0\.5\.2-20260809-2/);
assert.match(worker, /herdharbor-cloud\.js\?v=12/);
assert.match(worker, /pwa\.js\?v=15/);
assert.match(worker, /spreadsheet-import\.js\?v=11/);
assert.match(pwa, /0\.5\.2-mobile-pedigree-2/);

console.log("launch hardening and account deletion tests passed");
