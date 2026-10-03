"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const cloud=fs.readFileSync(path.resolve(__dirname,"..","herdharbor-cloud.js"),"utf8");

test("routine recovery snapshots are deferred off the local save event",()=>{
  assert.match(cloud,/function scheduleRoutineRecoverySnapshot\(userId, rawValue\)/);
  assert.match(cloud,/requestIdleCallback\(run, \{ timeout: 1200 \}\)/);
  const start=cloud.indexOf("async function handleCanonicalStateCommit");
  const end=cloud.indexOf("function installStateStoreBridge",start);
  const block=cloud.slice(start,end);
  assert.match(block,/scheduleRoutineRecoverySnapshot\(userId, previousValue\)/);
  assert.doesNotMatch(block,/recordRecoverySnapshot\(userId, previousValue, "Before local change"\)/);
});

test("routine snapshot bursts preserve the first pre-change state and coalesce later saves",()=>{
  const start=cloud.indexOf("function scheduleRoutineRecoverySnapshot");
  const end=cloud.indexOf("function cancelRoutineRecoverySnapshots",start);
  const block=cloud.slice(start,end);
  assert.match(block,/if \(routineRecoveryPending\.has\(id\)\) return true/);
  assert.match(block,/rawValue: String\(rawValue\)/);
  assert.match(block,/recordRecoverySnapshot\(id, pending\.rawValue, "Before local change"\)/);
});

test("critical conflict and hydration recovery snapshots remain immediate",()=>{
  assert.match(cloud,/await Promise\.all\(\[[\s\S]*recordRecoverySnapshot\(userId, localRaw, "Local copy saved during sync conflict"\)/);
  assert.match(cloud,/await recordRecoverySnapshot\(userId, activeRaw, "Local copy before loading newer cloud records"\)/);
});

test("account-boundary reset cancels deferred routine recovery work",()=>{
  const start=cloud.indexOf("function resetAccountBoundaryRuntime");
  const end=cloud.indexOf("function captureAccountOperation",start);
  assert.match(cloud.slice(start,end),/cancelRoutineRecoverySnapshots\(\)/);
});


test("canonical bridge does not recanonicalize full snapshots already diffed by StateStore",()=>{
  const start=cloud.indexOf("async function handleCanonicalStateCommit");
  const end=cloud.indexOf("function installStateStoreBridge",start);
  const block=cloud.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.doesNotMatch(block,/sameState\s*\(/);
  assert.match(block,/if \(previousValue\) \{\s*scheduleRoutineRecoverySnapshot\(userId, previousValue\)/);
});

test("routine snapshot throttle runs before full JSON validation",()=>{
  const start=cloud.indexOf("async function recordRecoverySnapshot");
  const end=cloud.indexOf("function scheduleRoutineRecoverySnapshot",start);
  const block=cloud.slice(start,end);
  assert.ok(start>=0&&end>start);
  const throttleAt=block.indexOf("snapshotStartedAt - previousStartedAt < ROUTINE_RECOVERY_SNAPSHOT_INTERVAL_MS");
  const parseAt=block.indexOf("safeParse(rawValue)");
  assert.ok(throttleAt>=0);
  assert.ok(parseAt>throttleAt,"throttled routine backups should return before parsing the entire state");
});


test("sign-in hydration validates the active local snapshot only once before cloud prefetch",()=>{
  const start=cloud.indexOf("async function hydrateUserDataOnce");
  const end=cloud.indexOf("async function hydrateUserData(",start);
  const block=cloud.slice(start,end);
  assert.match(block,/const activeStateIsValid = Boolean\(activeRaw && safeParse\(activeRaw\)\)/);
  assert.match(block,/if \(activeStateIsValid\) removeRedundantStateCache\(userId\)/);
  assert.match(block,/!dirty &&\s*activeStateIsValid &&\s*Boolean\(knownCloudVersion\)/);
  assert.equal((block.match(/safeParse\(activeRaw\)/g)||[]).length,1);
});


test("account-boundary sign-in parses active and authenticated cache snapshots only once",()=>{
  const start=cloud.indexOf("async function ensureAuthenticatedAccountBoundary");
  const end=cloud.indexOf("function setSyncState",start);
  const block=cloud.slice(start,end);
  assert.match(block,/const activeState = activeRaw \? safeParse\(activeRaw\) : null/);
  assert.match(block,/const authenticatedCacheState = authenticatedCache \? safeParse\(authenticatedCache\) : null/);
  assert.match(block,/const hasActiveState = Boolean\(activeState\)/);
  assert.match(block,/sameParsedState\(activeState, authenticatedCacheState\)/);
  assert.equal((block.match(/safeParse\(activeRaw\)/g)||[]).length,1);
  assert.equal((block.match(/safeParse\(authenticatedCache\)/g)||[]).length,1);
  assert.doesNotMatch(block,/hasActiveState:\s*Boolean\(activeRaw && safeParse\(activeRaw\)\)/);
});


test("canonical local save bridge does not reparse StateStore's freshly serialized state",()=>{
  const start=cloud.indexOf("async function handleCanonicalStateCommit");
  const end=cloud.indexOf("function installStateStoreBridge",start);
  const block=cloud.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.match(block,/const rawValue = String\(detail\.rawValue \|\| ""\)/);
  assert.match(block,/if \(!rawValue\) return false/);
  assert.doesNotMatch(block,/safeParse\(rawValue\)/);
  assert.match(block,/scheduleCloudSync\(rawValue, writeSequence\)/);
});


test("clean-baseline capture returns on cheap guards before parsing large previous state",()=>{
  const start=cloud.indexOf("function captureCleanBaselineBeforeLocalCommit");
  const end=cloud.indexOf("async function handleCanonicalStateCommit",start);
  const block=cloud.slice(start,end);
  const memoryAt=block.indexOf("cloudBaselineMemory.has(userId)");
  const dirtyAt=block.indexOf('originalGetItem.call(localStorage, dirtyKey(userId)) === "1"');
  const versionAt=block.indexOf("originalGetItem.call(localStorage, versionKey(userId))");
  const parseAt=block.indexOf("safeParse(previousValue)");
  assert.ok(memoryAt>=0&&dirtyAt>memoryAt&&versionAt>dirtyAt&&parseAt>versionAt);
  assert.equal((block.match(/safeParse\(previousValue\)/g)||[]).length,1);
  assert.doesNotMatch(block,/safeParse\(memoryBaseline\)/);
});
