"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

test("2.0.0 production release contract documents stable product and preserved safety boundaries", () => {
  const notes = read("RELEASE_NOTES-v2.0.0.md");
  const contract = read("V2.0.0-PRODUCTION-RELEASE-CONTRACT.md");

  assert.match(notes, /stable production release/i);
  assert.match(notes, /farm management/i);
  assert.match(notes, /specialized rabbit/i);
  assert.match(contract, /account-boundary/i);
  assert.match(contract, /Founder eligibility/i);
  assert.match(contract, /row-level security/i);
  assert.match(contract, /must not.*delete|delete or reset canonical user data/is);
});

test("2.0.0 contract does not silently change normalized sync authority", () => {
  const notes = read("RELEASE_NOTES-v2.0.0.md");
  const contract = read("V2.0.0-PRODUCTION-RELEASE-CONTRACT.md");

  assert.match(notes, /does not automatically mass-enable normalized sync/i);
  assert.match(notes, /Legacy full-state recovery remains retained/i);
  assert.match(contract, /application version bump does not change an account's sync stage/i);
  assert.match(contract, /adjacent rollback/i);
});

test("AI inventory reflects current controlled-access behavior instead of declaring a public launch", () => {
  const notes = read("RELEASE_NOTES-v2.0.0.md");
  const contract = read("V2.0.0-PRODUCTION-RELEASE-CONTRACT.md");

  assert.match(contract, /Paper Pedigree photo reading[\s\S]*controlled-access/i);
  assert.match(contract, /Voice-assisted entry[\s\S]*controlled-access/i);
  assert.match(contract, /Photo-assisted entry[\s\S]*controlled-access/i);
  assert.match(contract, /Multi-photo pedigree merging remains deferred/i);
  assert.match(notes, /does not make hidden capabilities public/i);
  assert.doesNotMatch(notes, /AI (?:is|tools are) now (?:public|available to everyone)/i);
});

test("component versions remain internal while whole-app support version stays allowed", () => {
  const contract = read("V2.0.0-PRODUCTION-RELEASE-CONTRACT.md");
  assert.match(contract, /whole application version may appear in Settings\/About/i);
  assert.match(contract, /internal engine\/runtime\/module\/adapter version numbers/i);
  assert.match(contract, /stable component files/i);
});
