"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const readme = read("README.md");
const playReadme = read("google-play/README.md");
const appContent = read("google-play/app-content.md");
const dataSafety = read("google-play/data-safety.md");
const fullDescription = read("google-play/listing/en-US/full-description.txt");
const shortDescription = read("google-play/listing/en-US/short-description.txt");
const releaseNotes = read("google-play/listing/en-US/release-notes.txt");

test("Google Play submission material identifies stable 2.0.0 instead of an Alpha build", () => {
  assert.match(playReadme, /HerdHarbor 2\.0\.0/);
  assert.match(playReadme, /Version name: `2\.0\.0`/);
  assert.match(playReadme, /Version code: `19`/);
  assert.doesNotMatch(playReadme, /Alpha v1\.3\.0|1\.3\.0-alpha|closed alpha/i);
  assert.match(dataSafety, /HerdHarbor 2\.0\.0 stable behavior/);
  assert.doesNotMatch(dataSafety, /Alpha v1\.3\.0/i);
});

test("store review material uses review-account language rather than product tester wording", () => {
  assert.match(appContent, /working review account/);
  assert.doesNotMatch(appContent, /working test account|invite(?:d|s|ing)? testers?/i);
  assert.doesNotMatch(playReadme, /invite(?:d|s|ing)? testers?/i);
});

test("store listing positions HerdHarbor as farm management with rabbit specialization", () => {
  assert.match(fullDescription, /farm management app/i);
  assert.match(fullDescription, /specialized rabbit-management workflows/i);
  assert.match(shortDescription, /Farm management/i);
  assert.match(releaseNotes, /stable farm management release/i);
  assert.doesNotMatch(fullDescription + shortDescription + releaseNotes, /Alpha|Beta|Founder tester|engine v\d|runtime v\d/i);
});

test("distribution status keeps web install available while store releases remain coming soon", () => {
  assert.match(readme, /Web \/ installable web app/);
  assert.match(readme, /https:\/\/app\.herdharbor\.com/);
  assert.match(readme, /Google Play:\*\* coming soon/i);
  assert.match(readme, /Apple App Store:\*\* coming soon/i);
  assert.match(readme, /must not be claimed until Play Console confirms/i);
  assert.match(readme, /App Store availability must not be claimed until that separate release is completed/i);
});

test("release documentation does not claim the unmerged 2.0.0 branch is already live", () => {
  assert.match(readme, /2\.0\.0 release is not considered live until the exact merged `main` commit completes the monitored production publisher/i);
});
