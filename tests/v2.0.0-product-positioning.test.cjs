"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

test("normal product identity leads with farm management and rabbit specialty", () => {
  const index = read("index.html");
  const manifest = JSON.parse(read("manifest.json"));
  const androidManifest = JSON.parse(read("android/app/src/main/res/raw/web_app_manifest.json"));
  const shortDescription = read("google-play/listing/en-US/short-description.txt");
  const fullDescription = read("google-play/listing/en-US/full-description.txt");

  assert.match(index, /<title>HerdHarbor — Farm Management<\/title>/);
  assert.match(index, /farm management app/i);
  assert.match(index, /specialized rabbit management/i);

  assert.match(manifest.description, /farm management/i);
  assert.match(manifest.description, /specialized rabbit/i);
  assert.match(androidManifest.description, /farm management/i);
  assert.match(androidManifest.description, /specialized rabbit/i);

  assert.match(shortDescription, /Farm management/i);
  assert.match(shortDescription, /rabbit workflows/i);
  assert.match(fullDescription, /^HerdHarbor is a farm management app/i);
  assert.match(fullDescription, /specialized rabbit-management/i);
});

test("normal product metadata does not expose release or development branding", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const androidManifest = JSON.parse(read("android/app/src/main/res/raw/web_app_manifest.json"));
  const shortDescription = read("google-play/listing/en-US/short-description.txt");
  const fullDescription = read("google-play/listing/en-US/full-description.txt");

  for (const source of [manifest.description, androidManifest.description, shortDescription, fullDescription]) {
    assert.doesNotMatch(source, /\bAlpha\b|\bBeta\b|tester|test build/i);
    assert.doesNotMatch(source, /\bv?2\.0\.0\b|engine\s+v\d|runtime\s+v\d|module\s+v\d/i);
  }
});

test("sign-in brand copy describes farm records rather than the whole product as livestock management", () => {
  const cloud = read("herdharbor-cloud.js");
  assert.match(cloud, /Secure farm records, available wherever you sign in/);
  assert.doesNotMatch(cloud, /Secure livestock records, available wherever you sign in/);
});

test("current repository README is stable and contains no Alpha/tester guidance", () => {
  const readme = read("README.md");
  assert.match(readme, /^# HerdHarbor\s*$/m);
  assert.match(readme, /farm management application/i);
  assert.match(readme, /specialized depth in rabbit management/i);
  assert.doesNotMatch(readme, /active alpha development|Tester guidance|Alpha v1\.8\.4/i);
});

test("onboarding and How To Center avoid tester, version-current, and engine branding", () => {
  const index = read("index.html");
  const help = read("how-to/index.html");

  assert.match(index, /AI tools — Coming Soon/);
  assert.doesNotMatch(index, /being tested before wider release/i);

  assert.doesNotMatch(help, /\bversion-current\b/i);
  assert.doesNotMatch(help, /species engine|multi-species engine|engines available/i);
  assert.match(help, /specialized rabbit genetics tools/i);
  assert.match(help, /appropriate genetics tools/i);
});
