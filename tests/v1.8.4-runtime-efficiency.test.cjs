"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("AI live-test modules are not eagerly loaded for every account", () => {
  const index = read("index.html");
  const optional = read("herdharbor-optional-tools.js");
  assert.doesNotMatch(index, /<script[^>]+voice-assisted-entry-v1\.8\.3\.js/);
  assert.doesNotMatch(index, /<script[^>]+photo-assisted-entry-v1\.8\.3\.js/);
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
  assert.match(optional, /HerdHarborVoiceAssistedEntry/);
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
  assert.ok(!entries.some((entry) => /voice-assisted-entry|photo-assisted-entry/.test(entry)), "AI tester assets are not precached globally");
});

test("service worker install tolerates optional cache failures but protects core shell", () => {
  const sw = read("service-worker.js");
  assert.match(sw, /Promise\.allSettled/);
  assert.match(sw, /Required HerdHarbor shell assets failed to cache/);
  assert.match(sw, /herdharbor-app-runtime\.js/);
  assert.match(sw, /herdharbor-cloud\.js/);
});

test("versioned static assets use cache-first while mutable authority files remain network-first", () => {
  const sw = read("service-worker.js");
  assert.match(sw, /function isVersionedStaticAsset/);
  assert.match(sw, /event\.respondWith\(cacheFirst\(request\)\)/);
  assert.match(sw, /"\/herdharbor-build\.js"/);
  assert.match(sw, /"\/herdharbor-cloud\.js"/);
  assert.match(sw, /"\/manifest\.json"/);
});
