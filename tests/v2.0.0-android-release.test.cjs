"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

test("Android/TWA package identity is stable HerdHarbor 2.0.0", () => {
  const twa = JSON.parse(read("twa-manifest.json"));
  const embedded = JSON.parse(read("android/app/src/main/res/raw/web_app_manifest.json"));
  const gradle = read("android/app/build.gradle");

  assert.equal(twa.packageId, "com.ebrllc.herdharbor");
  assert.equal(twa.host, "app.herdharbor.com");
  assert.equal(twa.appVersion, "2.0.0");
  assert.equal(twa.appVersionCode, 19);
  assert.equal(embedded.version, "2.0.0");

  assert.match(gradle, /namespace "com\.ebrllc\.herdharbor"/);
  assert.match(gradle, /applicationId "com\.ebrllc\.herdharbor"/);
  assert.match(gradle, /versionName "2\.0\.0"/);
  assert.match(gradle, /versionCode 19/);
  assert.match(gradle, /targetSdkVersion 36/);
});

test("2.0.0 Play release notes are production-facing", () => {
  const notes = read("google-play/listing/en-US/release-notes.txt");
  assert.match(notes, /HerdHarbor 2\.0\.0/);
  assert.match(notes, /Stable farm management release/i);
  assert.match(notes, /rabbit-management/i);
  assert.doesNotMatch(notes, /\bAlpha\b|\bBeta\b|tester/i);
});

test("Android web scope stays bound to the production app", () => {
  const twa = JSON.parse(read("twa-manifest.json"));
  const gradle = read("android/app/build.gradle");
  assert.equal(twa.webManifestUrl, "https://app.herdharbor.com/manifest.json");
  assert.equal(twa.fullScopeUrl, "https://app.herdharbor.com/");
  assert.match(gradle, /webManifestUrl", 'https:\/\/app\.herdharbor\.com\/manifest\.json'/);
  assert.match(gradle, /fullScopeUrl", 'https:\/\/app\.herdharbor\.com\/'/);
});
