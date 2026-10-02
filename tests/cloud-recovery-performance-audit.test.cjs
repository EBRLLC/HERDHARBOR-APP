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
