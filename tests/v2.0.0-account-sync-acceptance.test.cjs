"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const cloud = read("herdharbor-cloud.js");
const boundary = read("account-boundary-core-v1.8.4.js");
const rollout = read("cloud-sync-rollout-runtime-v1.8.4.js");
const stateStore = read("herdharbor-state-store-v1.8.4.js");
const pwa = read("pwa.js");

test("2.0.0 account boundary remains the only supported authenticated ownership transition", () => {
  assert.match(cloud, /async function ensureAuthenticatedAccountBoundary/);
  assert.match(cloud, /HerdHarborAccountBoundaryCore\?\.applyPlan/);
  assert.match(boundary, /function evaluate/);
  assert.match(boundary, /createGenerationFence/);
  assert.match(cloud, /preserveActiveForUser/);
  assert.match(cloud, /clearActiveUserData/);
  assert.match(cloud, /resetAccountBoundaryRuntime/);
});

test("cross-account hydration and save work remain generation-fenced", () => {
  assert.match(cloud, /captureAccountOperation\(userId\)/);
  assert.match(cloud, /isAccountOperationCurrent\(operationToken, userId\)/);
  assert.match(cloud, /while \(pendingSync && stillCurrent\(\)\)/);
  assert.match(cloud, /if \(!stillCurrent\(\)\) return false/);
  assert.match(cloud, /clearTimeout\(syncTimer\)/);
});

test("normal account switching preserves old-account state before clearing the active boundary", () => {
  const switchBlock = cloud.slice(
    cloud.indexOf("async function ensureAuthenticatedAccountBoundary"),
    cloud.indexOf("async function hydrateUserData")
  );
  assert.match(switchBlock, /preserve:\s*async \(staleOwnerId\)/);
  assert.match(switchBlock, /preserveActiveForUser/);
  assert.match(switchBlock, /clearActive:\s*clearActiveUserData/);

  const applyStart = boundary.indexOf("async function applyPlan");
  const applyEnd = boundary.indexOf("function createGenerationFence", applyStart);
  const applyBlock = boundary.slice(applyStart, applyEnd);
  const preserveAt = applyBlock.indexOf("await adapters.preserve");
  const clearAt = applyBlock.indexOf("adapters.clearActive");
  assert.ok(preserveAt >= 0 && clearAt > preserveAt, "boundary core must preserve the stale account before clearing active state");

  assert.doesNotMatch(cloud, /localStorage\.clear\(\)|indexedDB\.deleteDatabase\(/);
});

test("two-device legacy hydration refreshes normalized baseline before local replacement", () => {
  assert.match(cloud, /async function refreshDualWriteBaselineForRemoteState/);
  assert.match(cloud, /normalizedRollout\.refreshDualWriteBaseline\(\)/);
  const remote = cloud.indexOf("const baselineRefresh = await refreshDualWriteBaselineForRemoteState();", cloud.indexOf("async function checkForCloudChanges"));
  const replace = cloud.indexOf("setActiveUserData(userId, deviceCloudRaw);", remote);
  assert.ok(remote >= 0 && replace > remote);
});

test("repeated local changes cannot postpone cloud save indefinitely", () => {
  const match = cloud.match(/const MAX_SYNC_DEBOUNCE_MS = (\d+);/);
  assert.ok(match);
  assert.ok(Number(match[1]) > 0 && Number(match[1]) <= 15000);
  assert.match(cloud, /function boundedSyncDelay/);
  assert.match(cloud, /function scheduleCloudSync/);
});

test("canonical state persistence does not reparse large freshly serialized state", () => {
  const start = stateStore.indexOf("function commit(nextState");
  const end = stateStore.indexOf("function replaceRaw", start);
  const block = stateStore.slice(start, end);
  assert.match(block, /const rawValue = JSON\.stringify\(nextState/);
  assert.match(block, /const nextComparable =/);
  assert.doesNotMatch(block, /nextComparable\s*=\s*safeParse\(rawValue\)/);
});

test("normalized rollout remains controlled and cannot silently become mass authority", () => {
  assert.match(rollout, /percentageEnabled/);
  assert.match(rollout, /authorityActive/);
  assert.match(rollout, /recoveryPending/);
  assert.match(rollout, /refreshDualWriteBaseline/);
});

test("PWA update remains independent of farm-state clearing and Cloud Sync", () => {
  assert.doesNotMatch(pwa, /localStorage\.(?:clear|removeItem)\(/);
  assert.doesNotMatch(pwa, /HerdHarborCloud|syncNow\(/);
  assert.match(pwa, /controllerchange/);
  assert.match(pwa, /Update Now/);
});

test("member-facing recovery remains safe instead of instructing routine manual storage clearing", () => {
  assert.match(cloud, /Refresh account data/);
  assert.match(cloud, /Your records are safe/);
  assert.doesNotMatch(cloud, /clear your browser data|clear browser storage|delete local storage/i);
});
