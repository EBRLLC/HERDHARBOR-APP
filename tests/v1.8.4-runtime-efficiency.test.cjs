"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("AI live-test modules are not eagerly loaded for every account", () => {
  const index = read("index.html");
  const build = read("herdharbor-build.js");
  const optional = read("herdharbor-optional-tools.js");
  assert.doesNotMatch(index, /<script[^>]+voice-assisted-entry-v1\.8\.3\.js/);
  assert.doesNotMatch(index, /<script[^>]+photo-assisted-entry-v1\.8\.3\.js/);
  assert.doesNotMatch(index, /<script[^>]+mobile-capture-v1\.8\.3\.js/);
  assert.doesNotMatch(build, /addScript\("hh-paper-pedigree-core-v182"/);
  assert.match(optional, /paperPedigreeCore:\s*"paper-pedigree-import-core-v1\.8\.2\.js\?v=1"/);
  assert.match(optional, /paperPedigreeUi:\s*"paper-pedigree-import-v1\.8\.2\.js\?v=2"/);
  assert.match(optional, /herdharbor_ai_live_tester_v1/);
  assert.match(optional, /ensureAiLiveTools/);
  assert.match(optional, /isAiLiveTester/);
  assert.match(optional, /data-quick="voice"/);
  assert.match(optional, /data-quick="photo"/);
  assert.match(optional, /data-pp-read/);
});

test("AI tester tools load concurrently only after explicit tester enablement", () => {
  const optional = read("herdharbor-optional-tools.js");
  assert.match(optional, /if \(!isAiLiveTester\(\)\) throw new Error/);
  assert.match(optional, /Promise\.all\(\[/);
  assert.match(optional, /HerdHarborPaperPedigreeImportCore/);
  assert.match(optional, /HerdHarborPaperPedigreeImport/);
  assert.match(optional, /HerdHarborVoiceAssistedEntry/);
  assert.match(optional, /mobileCapture:\s*"mobile-capture-v1\.8\.3\.js\?v=1"/);
  assert.match(optional, /HerdHarborMobileCapture/);
  assert.match(optional, /HerdHarborPhotoAssistedEntry/);
});

test("service worker precache is bounded to the operational shell", () => {
  const sw = read("service-worker.js");
  assert.match(sw, /const REQUIRED_SHELL = \[/);
  assert.doesNotMatch(sw, /const APP_SHELL = \[/);
  const block = sw.match(/const REQUIRED_SHELL = \[([\s\S]*?)\];/);
  assert.ok(block, "required shell declaration");
  const entries = [...block[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.ok(entries.length <= 45, "required shell should stay bounded");
  assert.ok(!entries.some((entry) => /voice-assisted-entry|photo-assisted-entry|paper-pedigree-import|mobile-capture/.test(entry)), "AI tester assets are not precached globally");
});

test("service worker install tolerates optional cache failures but protects core shell", () => {
  const sw = read("service-worker.js");
  assert.match(sw, /Promise\.allSettled/);
  assert.match(sw, /Required HerdHarbor shell assets failed to cache/);
  assert.match(sw, /herdharbor-app-runtime\.js/);
  assert.match(sw, /herdharbor-cloud\.js/);
});

test("fingerprinted static assets use cache-first while mutable authority files remain network-first", () => {
  const sw = read("service-worker.js");
  assert.match(sw, /function isImmutableFingerprintAsset/);
  assert.match(sw, /searchParams\.get\("rev"\)/);
  assert.match(sw, /event\.respondWith\(cacheFirst\(request\)\)/);
  assert.match(sw, /if \(isRuntimeCachePath\(url\)\)[\s\S]*networkFirst\(request\)/);
  assert.match(sw, /"\/herdharbor-build\.js"/);
  assert.match(sw, /"\/herdharbor-cloud\.js"/);
  assert.match(sw, /"\/manifest\.json"/);
});


test("canonical commit does not parse its freshly serialized next state a second time", () => {
  const stateStore = read("herdharbor-state-store-v1.8.4.js");
  const commitStart = stateStore.indexOf("function commit(nextState");
  const commitEnd = stateStore.indexOf("function replaceRaw", commitStart);
  const commitSource = stateStore.slice(commitStart, commitEnd);

  assert.match(commitSource, /const rawValue = JSON\.stringify\(nextState/);
  assert.match(
    commitSource,
    /const nextComparable =\s*nextState && typeof nextState === "object" \? nextState : \{\}/
  );
  assert.doesNotMatch(
    commitSource,
    /nextComparable\s*=\s*safeParse\(rawValue\)/,
    "large photo-heavy state must not be reparsed immediately after serialization"
  );
});


test("legacy stability compatibility patches lazy spreadsheets without a perpetual polling loop", () => {
  const optional = read("herdharbor-optional-tools.js");
  const stability = read("herdharbor-v1.7.1-stability-hotfix.js");
  assert.match(optional, /herdharbor:spreadsheet-ready/);
  assert.match(optional, /window\.dispatchEvent\(new CustomEvent\("herdharbor:spreadsheet-ready"\)\)/);
  assert.match(stability, /addEventListener\?\.\('herdharbor:spreadsheet-ready',installSpreadsheetPatch\)/);
  assert.doesNotMatch(stability, /setInterval\?\.\(\(\)=>\{patchCurrentDom\(\)/);
  assert.doesNotMatch(stability, /,150\)/);
});


test("PWA artwork caches one core logo while keeping the large install icon non-blocking", () => {
  const sw = read("service-worker.js");
  const required = sw.slice(sw.indexOf("const REQUIRED_SHELL"), sw.indexOf("const RUNTIME_CACHE_PATHS"));
  const runtime = sw.slice(sw.indexOf("const RUNTIME_CACHE_PATHS"), sw.indexOf("const NETWORK_FIRST_PATHS"));
  assert.equal(required.includes("./icon-192.png"), true, "core shell logo stays available offline");
  assert.equal(runtime.includes("./icon-192.png"), false, "core logo is not duplicated across cache tiers");
  assert.equal(required.includes("icon-512.png"), false, "large install artwork does not block shell installation");
  assert.equal(runtime.includes("./icon-512.png"), true, "large install artwork remains runtime-cacheable");
});

test("index shell reuses one external 192px logo instead of embedding four base64 copies", () => {
  const index = read("index.html");
  assert.doesNotMatch(index, /data:image\/png;base64/);
  assert.equal((index.match(/icon-192\.png/g) || []).length, 4);
});


test("Admin UI is lazy for ordinary members while navigation authorization stays in core runtime", () => {
  const index = read("index.html");
  const app = read("herdharbor-app-runtime.js");
  const sw = read("service-worker.js");
  const required = sw.slice(sw.indexOf("const REQUIRED_SHELL"), sw.indexOf("const RUNTIME_CACHE_PATHS"));
  const runtime = sw.slice(sw.indexOf("const RUNTIME_CACHE_PATHS"), sw.indexOf("const NETWORK_FIRST_PATHS"));
  assert.doesNotMatch(index, /<script[^>]+herdharbor-admin-v1\.6\.1\.js/);
  assert.match(app, /function syncAdminNavigation\(\)/);
  assert.match(app, /HerdHarborMembership\?\.canAccessAdmin\?\.\(\) === true/);
  assert.match(app, /"herdharbor-admin-v1\.6\.1\.js\?v=2"/);
  assert.equal(required.includes("herdharbor-admin-v1.6.1.js"), false);
  assert.equal(runtime.includes("./herdharbor-admin-v1.6.1.js?v=2"), true);
});
