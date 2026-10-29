"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "herdharbor-cloud.js"), "utf8");
const start = source.indexOf("    // 2.0.2: An existing Auth identity without a verified cloud record");
const end = source.indexOf("    const newUserRaw = cachedRaw || activeRaw;", start);
assert.ok(start > 0 && end > start, "first-login reconciliation guard must exist");
const guard = source.slice(start, end);

async function simulate({ cloud, authority = false, activeRaw = null, cachedRaw = null, fresh = true } = {}) {
  const calls = { updated: [], states: [], held: [], unlocked: 0, deferred: 0 };
  const dependencies = [
    "data", "rolloutDecision", "hydrationInputCurrent", "deferHydrationForNewEdit",
    "activeRaw", "cachedRaw", "safeParse", "setActiveUserData", "userId",
    "unlockApp", "setSyncState", "showAccountBoundaryRecovery",
    "authOnlyRecoveryOwner", "updateAuthOnlyRecoveryControls"
  ];
  const values = [
    cloud?.data ?? null, { authoritative: authority, stage: authority ? "normalized" : "legacy" },
    () => fresh, () => { calls.deferred++; return {ok:false, reason:"stale-local-edit"}; },
    activeRaw, cachedRaw,
    raw => { try {return Boolean(JSON.parse(raw));} catch {return false;} },
    (...args) => calls.updated.push(args), "owner-A",
    () => {calls.unlocked++;}, (...args) => calls.states.push(args),
    value => calls.held.push(value),
    null, () => {}
  ];
  const execute = new Function(...dependencies,
    "return async function executeGuard() {\n" + guard + "\nreturn { ok: true, reason: 'continue-legacy-hydration' };\n}"
  )(...values);
  const result = await execute();
  return {result, calls};
}

test("Auth-only login without this device's records holds instead of creating blank cloud", async () => {
  const {result,calls} = await simulate({cloud:{data:null}});
  assert.equal(result.ok, false);
  assert.equal(result.reason, "auth-only-reconciliation-required");
  assert.equal(result.localPreserved, false);
  assert.equal(calls.held.length, 1);
  assert.match(calls.held[0], /another device may contain unsynced records/i);
  assert.equal(calls.unlocked, 0);
  assert.equal(calls.updated.length, 0);
});

test("Auth-only login retains owner A's active local records and blocks cloud upload", async () => {
  const raw = JSON.stringify({animals:[{id:"dog-1"}],litters:[{id:"litter-1"}]});
  const {result,calls} = await simulate({cloud:{data:null},activeRaw:raw});
  assert.equal(result.reason,"auth-only-reconciliation-required");
  assert.equal(result.localPreserved,true);
  assert.equal(calls.unlocked,1);
  assert.equal(calls.updated.length,0);
  assert.match(calls.states[0][0], /first-login reconciliation is required/i);
  assert.equal(calls.states[0][1], "error");
});

test("Auth-only login restores its own cached state for review without treating it as cloud-confirmed", async () => {
  const raw=JSON.stringify({animals:[{id:"rabbit-1"}]});
  const {result,calls}=await simulate({cloud:{data:null},cachedRaw:raw});
  assert.equal(result.localPreserved,true);
  assert.deepEqual(calls.updated, [["owner-A",raw,"auth-only-reconciliation-hold"]]);
  assert.equal(calls.held.length,0);
});

test("Verified legacy cloud record is not blocked by Auth-only guard", async () => {
  const {result,calls}=await simulate({cloud:{data:{app_state:{animals:[]}}}});
  assert.equal(result.ok,true);
  assert.equal(calls.held.length,0);
});

test("Verified normalized-only authority stays on normalized initialization path", async () => {
  const {result,calls}=await simulate({cloud:{data:null},authority:true});
  assert.equal(result.ok,true);
  assert.equal(calls.held.length,0);
});

test("New local edits during Auth-only detection invalidate the hydration before changing data", async () => {
  const {result,calls}=await simulate({cloud:{data:null},activeRaw:'{"animals":[]}',fresh:false});
  assert.equal(result.reason,"stale-local-edit");
  assert.equal(calls.deferred,1);
  assert.equal(calls.updated.length,0);
  assert.equal(calls.unlocked,0);
});
