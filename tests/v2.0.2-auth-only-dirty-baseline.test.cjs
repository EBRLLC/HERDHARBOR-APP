"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "herdharbor-cloud.js"), "utf8");
const start = source.indexOf("    if (dirty && !verifiedExistingCloudRecord) {", source.indexOf("async function hydrateUserDataOnce"));
const end = source.indexOf('    setSyncState("Loading cloud records', start);
assert.ok(start > 0 && end > start, "dirty first-login preflight must be present");
const dirtyGuard = source.slice(start, end);
assert.match(dirtyGuard, /firstLoginCloudProbe/);
assert.ok(dirtyGuard.indexOf("fetchCloudRecord(userId)") < dirtyGuard.indexOf("drainSyncQueue()"),
  "remote existence must be checked before a legacy upload");

async function simulateDirty({cloud, activeRaw = JSON.stringify({profile:{name:"Ranch"}, animals:[{id:"dog"}]}),
  fresh = true, dirty = true} = {}) {
  const calls = {probes:0, writes:0, states:[], retained:[], unlocked:0, deferred:0};
  const deps = {
    dirty, userId:"owner-A", activeRaw, cachedRaw:null, writeSequence:9, pendingSync:null,
    verifiedExistingCloudRecord:null,
    fetchCloudRecord:async () => {calls.probes++; return cloud;},
    isCurrentHydration:()=>true,
    staleHydration:()=>({stale:true}),
    setSyncState:(...args)=>calls.states.push(args),
    baselineRestorePromise:Promise.resolve(),
    safeParse:raw=>{try{return JSON.parse(raw)}catch{return null}},
    setActiveUserData:(...args)=>calls.retained.push(args),
    unlockApp:()=>calls.unlocked++,
    drainSyncQueue:async()=>{calls.writes++;return true},
    hydrationInputCurrent:()=>fresh,
    deferHydrationForNewEdit:()=>{calls.deferred++;return {ok:false,reason:"new-local-edit"}}
  };
  const execute = new Function("deps", `
    return async function execute() {
      let {dirty,userId,activeRaw,cachedRaw,writeSequence,pendingSync,
        verifiedExistingCloudRecord,fetchCloudRecord,isCurrentHydration,staleHydration,
        setSyncState,baselineRestorePromise,safeParse,setActiveUserData,unlockApp,
        drainSyncQueue,hydrationInputCurrent,deferHydrationForNewEdit} = deps;
      ` + dirtyGuard + `
      return {ok:true,verifiedExistingCloudRecord,pendingSync};
    };`)(deps);
  return { result:await execute(), calls };
}

test("dirty Auth-only account never uploads local state before reconciliation", async () => {
  const {result,calls}=await simulateDirty({cloud:{data:null,error:null}});
  assert.equal(calls.probes,1);
  assert.equal(calls.writes,0);
  assert.equal(calls.unlocked,0);
  assert.equal(result.ok,true);
  assert.deepEqual(result.verifiedExistingCloudRecord,{data:null,error:null},
    "terminal first-login hold must receive verified absence of cloud data");
});

test("dirty login fails closed on cloud read errors instead of interpreting absence", async () => {
  const {result,calls}=await simulateDirty({cloud:{error:{message:"network unavailable"}}});
  assert.equal(result.reason,"first-login-cloud-probe-failed");
  assert.equal(calls.writes,0);
  assert.match(calls.states[0][0], /remain protected/);
});

test("dirty existing legacy account with verified cloud baseline still syncs", async () => {
  const raw={app_state:{profile:{name:"Ranch"}},updated_at:"2026-10-28T10:00:00Z"};
  const {result,calls}=await simulateDirty({cloud:{data:raw,error:null}});
  assert.equal(result,undefined,"successful dirty startup completes via existing queue");
  assert.equal(calls.probes,1);
  assert.equal(calls.writes,1);
  assert.equal(calls.unlocked,1);
});

test("an edit during first-login preflight cannot upload stale data", async () => {
  const {result,calls}=await simulateDirty({
    cloud:{data:{app_state:{profile:{name:"Ranch"}},updated_at:"2026-10-28T10:00:00Z"}},
    fresh:false
  });
  assert.equal(result.reason,"new-local-edit");
  assert.equal(calls.deferred,1);
  assert.equal(calls.writes,0);
  assert.equal(calls.unlocked,0);
});

const writerStart=source.indexOf("    // 2.0.2: Never INSERT a whole-account legacy snapshot");
const writerEnd=source.indexOf("    const remoteRaw = remoteRecord?.app_state",writerStart);
assert.ok(writerStart > 0 && writerEnd > writerStart, "legacy record writer must block unverified INSERT");
const writerGuard=source.slice(writerStart,writerEnd);
function simulateWriter(remoteRecord) {
  const calls=[];
  const invoke=new Function("remoteRecord","setSyncState",
    `return function() { ${writerGuard} return true; }`);
  return {result:invoke(remoteRecord,(...args)=>calls.push(args))(),calls};
}
test("legacy sync writer refuses any new full-state row without a confirmed version",()=>{
  const missing=simulateWriter(null);
  assert.equal(missing.result,false);
  assert.match(missing.calls[0][0],/reconciliation is required/);
  assert.equal(simulateWriter({app_state:{}}).result,false);
  const existing=simulateWriter({updated_at:"2026-10-28T10:00:00Z"});
  assert.equal(existing.result,true);
  assert.equal(existing.calls.length,0);
});

const emptyGuardStart=source.indexOf("    let verifiedExistingCloudRecord = null;",source.indexOf("async function hydrateUserDataOnce"));
const emptyGuardEnd=source.indexOf("    if (dirty && !verifiedExistingCloudRecord) {",emptyGuardStart);
assert.ok(emptyGuardStart>0 && emptyGuardEnd>emptyGuardStart,"dirty unconfigured pre-hydration guard exists");
const emptyGuard=source.slice(emptyGuardStart,emptyGuardEnd);
async function simulateDirtyUnconfigured(cloud) {
  const calls={probes:0,uploads:0,unlocks:0,errors:[]};
  const execute=new Function("args",`
    return async function run(){
      const {dirty,activeRaw,cachedRaw,hasConfiguredOperationProfile,
        hasUnsyncedDomainRecords,unlockApp,setSyncState,fetchCloudRecord,
        userId,isCurrentHydration,staleHydration}=args;
      ${emptyGuard}
      return {ok:true,verifiedExistingCloudRecord};
    };`)({
      dirty:true,activeRaw:null,cachedRaw:null,
      hasConfiguredOperationProfile:s=>!!s?.profile?.operationName,
      hasUnsyncedDomainRecords:()=>false,
      unlockApp:()=>calls.unlocks++,
      setSyncState:(...a)=>calls.errors.push(a),
      fetchCloudRecord:async()=>{calls.probes++;return cloud},
      userId:"owner-A",isCurrentHydration:()=>true,
      staleHydration:()=>({stale:true})
    });
  return {result:await execute(),calls};
}
test("dirty empty account without any cloud row still reaches the consented Auth-only recovery hold",async()=>{
  const {result,calls}=await simulateDirtyUnconfigured({data:null,error:null});
  assert.equal(result.ok,true);assert.deepEqual(result.verifiedExistingCloudRecord,{data:null,error:null});
  assert.equal(calls.probes,1);assert.equal(calls.unlocks,0);
});
test("dirty empty account with cloud read error stays locked",async()=>{
  const {result,calls}=await simulateDirtyUnconfigured({error:{code:"network"}});
  assert.equal(result.reason,"dirty-unconfigured-cloud-probe-failed");assert.equal(calls.unlocks,0);
});
test("dirty empty onboarding does not overwrite malformed existing cloud state",async()=>{
  const {result,calls}=await simulateDirtyUnconfigured({data:{app_state:{profile:{}}}});
  assert.equal(result.reason,"dirty-unconfigured-cloud-profile-invalid");
  assert.equal(calls.errors.length,1);
});
test("dirty startup recognizes existing valid cloud operation",async()=>{
  const cloud={data:{app_state:{profile:{operationName:"Existing farm"}},updated_at:"current"}};
  const {result,calls}=await simulateDirtyUnconfigured(cloud);
  assert.equal(result.ok,true);assert.deepEqual(result.verifiedExistingCloudRecord,cloud);
  assert.equal(calls.unlocks,0);
});
