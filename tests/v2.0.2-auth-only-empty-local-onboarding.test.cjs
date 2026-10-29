"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"..","herdharbor-cloud.js"),"utf8");
const start=source.indexOf("  async function startFreshAuthOnlyWorkspace() {");
const end=source.indexOf("  // Auth-only recovery is owner-initiated.",start);
assert.ok(start>0 && end>start,"explicit Auth-only local onboarding gate must exist");
const body=source.slice(start,end);
assert.match(source,/id="hh-auth-only-empty-start"/);
async function simulate({
  consent=true, activeOwner="owner-A", activeRaw=null, cachedRaw=null,
  cloudData=null, cloudError=null, manifestData=null, manifestError=null,
  recordsData=null, recordsError=null, authorityStage="legacy",
  schemaVerified=true, authorityThrows=false, cloudThrows=false,
  switched=false, ownerWriteFails=false
}={}){
  const actions={confirmed:0,cloudReads:0,manifestReads:0,recordReads:0,authorityReads:0,
    ownerWrites:0,unlocked:0,states:[],held:[],clickedHidden:false};
  let owner=activeOwner;
  const query=()=>{
    return {
      select:()=>query(),
      eq:()=>query(),
      limit:()=>query(),
      maybeSingle:async()=>{
        const selected=query.table;
        if(selected==="manifest"){actions.manifestReads++;return {data:manifestData,error:manifestError};}
        actions.recordReads++;return {data:recordsData,error:recordsError};
      }
    };
  };
  const deps={
    session:{user:{id:"owner-A"}},captureAccountOperation:()=>({}),
    isAccountOperationCurrent:()=>!switched,
    activeStateRaw:()=>activeRaw,
    originalGetItem:{call:(_storage,key)=>key==="active_owner"?owner:key==="owner_cache"?cachedRaw:null},
    localStorage:{},ACTIVE_OWNER_KEY:"active_owner",cacheKey:()=>"owner_cache",
    showAccountBoundaryRecovery:x=>actions.held.push(x),
    window:{confirm:()=>{actions.confirmed++;return consent;}},
    fetchCloudRecord:async()=>{actions.cloudReads++;if(cloudThrows)throw Error("read failed");return {data:cloudData,error:cloudError}},
    client:{from:table=>({
      select:()=>({
        eq:()=>({
          maybeSingle:async()=>{actions.manifestReads++;return {data:manifestData,error:manifestError}},
          limit:()=>({maybeSingle:async()=>{actions.recordReads++;return {data:recordsData,error:recordsError}})}
        })
      })
    })},
    getNormalizedSyncCohortStatus:async()=>{
      actions.authorityReads++;if(authorityThrows)throw Error("authority failed");
      return {schemaVerified,stage:authorityStage};
    },
    setSyncState:(...args)=>actions.states.push(args),
    safeStorageSet:(key,value)=>{actions.ownerWrites++;if(ownerWriteFails)return false;owner=value;return true},
    document:{querySelector:()=>({querySelector:()=>({hidden:false})})},
    unlockApp:()=>actions.unlocked++
  };
  const exec=new Function("deps",`
    return async function run() {
      let {session,captureAccountOperation,isAccountOperationCurrent,activeStateRaw,
        originalGetItem,localStorage,ACTIVE_OWNER_KEY,cacheKey,
        showAccountBoundaryRecovery,window,fetchCloudRecord,client,
        getNormalizedSyncCohortStatus,setSyncState,safeStorageSet,
        document,unlockApp}=deps;
      let authOnlyRecoveryOwner="owner-A";
      ${body}
      return await startFreshAuthOnlyWorkspace();
    }`)(deps);
  return {result:await exec(),actions};
}
test("no local records and verified absent cloud require explicit consent",async()=>{
  const {result,actions}=await simulate({consent:false});
  assert.equal(result,false);assert.equal(actions.ownerWrites,0);assert.equal(actions.unlocked,0);
  assert.equal(actions.cloudReads,0);
});
test("verified empty owner can create only a LOCAL operation, not a cloud baseline",async()=>{
  const {result,actions}=await simulate();
  assert.equal(result,true);assert.equal(actions.cloudReads,1);
  assert.equal(actions.manifestReads,1);assert.equal(actions.recordReads,1);
  assert.equal(actions.ownerWrites,1);assert.equal(actions.unlocked,1);
  assert.match(actions.states.at(-1)[0],/Local setup only/);
});
test("another owner's active workspace is never cleared for blank onboarding",async()=>{
  const {result,actions}=await simulate({activeOwner:"owner-B",activeRaw:'{"animals":[{"id":"other"}]}'});
  assert.equal(result,false);assert.equal(actions.ownerWrites,0);assert.equal(actions.unlocked,0);
});
test("same-owner cached records require recovery instead of new operation",async()=>{
  const {result,actions}=await simulate({cachedRaw:'{"animals":[{"id":"local"}]}'});
  assert.equal(result,false);assert.equal(actions.ownerWrites,0);
});
test("existing legacy, normalized records or manifest abort blank onboarding",async()=>{
  for(const args of [
    {cloudData:{app_state:{profile:{operationName:"Remote"}}}},
    {manifestData:{user_id:"owner-A"}},
    {recordsData:{record_id:"remote"}},
    {authorityStage:"normalized"},
    {schemaVerified:false}
  ]) {
    const {result,actions}=await simulate(args);
    assert.equal(result,false);assert.equal(actions.unlocked,0);assert.equal(actions.ownerWrites,0);
  }
});
test("network and cloud authorization errors fail closed",async()=>{
  for(const args of [
    {cloudError:{code:"503"}},{manifestError:{code:"42501"}},
    {recordsError:{code:"42501"}},{authorityThrows:true},{cloudThrows:true}
  ]) {
    const {result,actions}=await simulate(args);
    assert.equal(result,false);assert.equal(actions.ownerWrites,0);assert.equal(actions.unlocked,0);
  }
});
test("account switch during blank-state probe cannot create an owner marker",async()=>{
  const {result,actions}=await simulate({switched:true});
  assert.equal(result,false);assert.equal(actions.ownerWrites,0);
});
test("failed owner-marker persistence blocks unlocked onboarding",async()=>{
  const {result,actions}=await simulate({ownerWriteFails:true,activeOwner:""});
  assert.equal(result,false);assert.equal(actions.unlocked,0);
});
