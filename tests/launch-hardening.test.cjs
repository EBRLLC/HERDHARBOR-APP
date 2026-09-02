"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const cloud = fs.readFileSync(path.join(root, "herdharbor-cloud.js"), "utf8");
const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const pwa = fs.readFileSync(path.join(root, "pwa.js"), "utf8");
const release = fs.readFileSync(path.join(root, "herdharbor-release-v1.6.1.js"), "utf8");
const build = fs.readFileSync(path.join(root, "herdharbor-build.js"), "utf8");
const shows = fs.readFileSync(path.join(root, "shows-v1.6.1.js"), "utf8");
const hardening = fs.readFileSync(path.join(root, "shows-v1.6.1-hardening.js"), "utf8");

// The recovered consolidated shell remains intact; HerdHarborBuild is authoritative for v1.6.6.
assert.match(build, /version:\s*"1\.6\.6"/);
assert.match(html, /const APP_VERSION = window\.HerdHarborBuild\?\.version \|\| "1\.6\.5"/);
assert.match(html, /id="request-account-deletion"/);
assert.match(html, /Type DELETE to confirm/);
assert.match(html, /herdharbor\.com\/delete-account\//);
assert.match(html, /herdharbor\.com\/privacy\//);
assert.match(html, /herdharbor\.com\/terms\//);
assert.match(html, /herdharbor\.com\/support\//);
assert.match(html, /Clear local data/);
assert.doesNotMatch(html, />Clear all data</);

assert.match(cloud, /const STORAGE_KEY = "herdharbor_pre_alpha_v1"/);
assert.match(cloud, /async function requestAccountDeletion/);
assert.match(cloud, /confirmation !== "DELETE"/);
assert.match(cloud, /navigator\.onLine === false/);
assert.match(cloud, /dirty && !\(await syncNow\(\)\)/);
assert.doesNotMatch(cloud, /SKIP_WAITING|registration\.update|HerdHarborPWA/);

assert.match(worker, /v1\.6\.6-alpha-completion-debt-1/);
assert.match(worker, /herdharbor-access-cache-v1\.6\.1\.js\?v=1\.6\.6/);
assert.match(worker, /herdharbor-cloud\.js\?v=19/);
assert.match(worker, /pwa\.js\?v=27/);
assert.match(worker, /pedigree-genetics-v1\.6\.1\.js\?v=1\.6\.6/);
assert.match(worker, /rabbit-genetics-runtime-v1\.6\.1\.js\?v=1\.6\.6/);
assert.match(worker, /shows-v1\.6\.1\.js\?v=1\.6\.6/);
assert.match(worker, /shows-v1\.6\.1-hardening\.js\?v=1\.6\.6/);
assert.match(worker, /fetch\(request, \{ cache: "no-store" \}\)/);
assert.match(pwa, /const BUILD_ID = "completion-debt-1"/);
assert.match(pwa, /loadPedigreeVisuals/);
assert.match(pwa, /loadBreedingIntelligence/);
assert.match(pwa, /loadShows/);
assert.match(pwa, /schemaVersion: 3/);
assert.match(pwa, /shows-v1\.6\.1-hardening\.js\?v=1\.6\.6/);
assert.match(pwa, /registration\.update\(\)/);
assert.match(pwa, /updateViaCache: "none"/);
assert.doesNotMatch(pwa, /HerdHarborCloud/);
assert.match(release, /Open HerdHarbor How-To Center/);
assert.match(release, /https:\/\/herdharbor\.com\/how-to\//);
assert.match(release, /billingEnabled: false/);

assert.match(shows, /litters\.insertAdjacentElement\('afterend'/);
assert.match(shows, /state\.transactions\.push\(/);
assert.match(shows, /state\.health\.push\(/);
assert.doesNotMatch(shows, /4-H Records/);
assert.doesNotMatch(shows, /showExpenses\s*:/);
assert.doesNotMatch(shows, /showIncome\s*:/);
assert.match(hardening, /Archive this show\?/);
assert.match(hardening, /Remove this attachment from the record\?/);
assert.match(hardening, /Animal Show History/);
assert.match(hardening, /PAGE_SIZE = 24/);

console.log("Alpha v1.6.6 launch hardening, PWA update independence, and account-safety tests passed");
