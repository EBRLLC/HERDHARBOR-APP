"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const flow = fs.readFileSync(path.join(root, "cloud-sync-v2-flow-v1.8.2.js"), "utf8");
const completion = fs.readFileSync(path.join(root, "flow-phase1-completion-v1.8.2.js"), "utf8");

test("v1.8.2 cloud sync flow treats recoverable unsynced work as non-blocking", () => {
  assert.match(flow, /state\.signedIn && state\.unsynced && !state\.conflict/);
  assert.match(flow, /Saved on this device\./);
  assert.match(flow, /Safe to close HerdHarbor\./);
  assert.match(flow, /dataset\.state = "working"/);
  assert.match(flow, /status\.dataset\.type = "working"/);
});

test("v1.8.2 cloud sync flow normalizes recoverable cloud errors without hiding real conflicts", () => {
  assert.match(flow, /function isRecoverableCloudState\(state\)/);
  assert.match(flow, /if \(!state \|\| state\.conflict \|\| !state\.signedIn\) return false/);
  assert.match(flow, /\/cloud unavailable\/i/);
  assert.match(flow, /\/cloud save failed\/i/);
  assert.match(flow, /\/offline copy loaded\/i/);
  assert.match(flow, /\/\^offline;\/i/);
  assert.match(flow, /Working from the protected copy on this device/);
});

test("v1.8.2 cloud sync flow automatically retries pending cloud backup", () => {
  assert.match(flow, /RETRY_DELAYS_MS = \[1500, 4000, 10000, 30000\]/);
  assert.match(flow, /await cloud\(\)\?\.syncNow\?\.\(\)/);
  assert.match(flow, /window\.addEventListener\("online", resumeImmediately\)/);
  assert.match(flow, /window\.addEventListener\("focus", resumeImmediately\)/);
  assert.match(flow, /document\.addEventListener\("visibilitychange"/);
});

test("v1.8.2 cloud sync flow never installs a close blocker", () => {
  assert.doesNotMatch(flow, /addEventListener\(["']beforeunload["']/);
  assert.doesNotMatch(flow, /preventDefault\(\).*unload/);
});

test("v1.8.2 cloud sync flow loads the local-first device cache", () => {
  assert.match(flow, /local-cache-v2-v1\.8\.2\.js\?v=1/);
  assert.match(flow, /HerdHarborLocalCacheV2\.install/);
  assert.match(flow, /ensureLocalCache\(\)/);
});

test("v1.8.2 completion runtime wires the background sync flow without changing auth", () => {
  assert.match(completion, /cloud-sync-v2-flow-v1\.8\.2\.js\?v=1/);
  assert.match(completion, /ensureCloudSyncFlow\(\)/);
  assert.doesNotMatch(completion, /hh-auth-locked/);
  assert.doesNotMatch(completion, /client\.auth/);
});