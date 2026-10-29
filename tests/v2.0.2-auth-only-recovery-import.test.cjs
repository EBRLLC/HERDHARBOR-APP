"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"..","herdharbor-cloud.js"),"utf8");
const a=source.indexOf("  async function claimAuthOnlyDeviceRecovery() {");
const b=source.indexOf("  async function resolveConflict(choice) {",a);
assert.ok(a>0 && b>a,"owner-approved Auth-only recovery must be implemented");
const body=source.slice(a,b);
assert.match(source, /id="hh-auth-only-claim"/);
assert.match(source, /result\?\.reason !== "auth-only-reconciliation-required"/);

async function simulate({
  consent=true, backup=true, matchingOwner=true, profile=true, changed=false,
  rpcError=null, rpcData={ok:true}, remoteMatches=true, baseline=true,
  accountSwitch=false, rpcThrows=false, readThrows=false, baselineThrows=false,
  refreshThrows=false, refreshResult=true, refreshInvalidatesToken=false, refreshChangesAccount=false,
  storedPedigree=false, attachmentReaderMissing=false, attachmentReadThrows=false
}={}){
  const userId="owner-A";
  const state={profile:profile?{operationName:"Synthetic breeder"}:{},animals:[{id:"rabbit-1"}]};
  if (storedPedigree) state.pedigrees=[{id:"ped-1",attachmentStored:true,sourceDataUrl:""}];
  const raw=JSON.stringify(state);
  const calls={rpc:0,backup:0,reads:0,baseline:0,refresh:0,messages:[],versions:[],confirmed:0};
  let currentRaw=raw;
  let tokenCurrent=true;
  let authOnlyRecoveryOwner=userId;
  const deps={
    session:{user:{id:userId}},
    captureAccountOperation:()=>({owner:userId}),
    isAccountOperationCurrent:()=>!accountSwitch && tokenCurrent,
    activeStateRaw:()=>currentRaw,
    safeParse:value=>{try{return JSON.parse(value)}catch{return null}},
    hasConfiguredOperationProfile:s=>!!s?.profile?.operationName,
    originalGetItem:{call:(_storage,key)=>key==="ACTIVE_OWNER"?matchingOwner?userId:"owner-B":null},
    localStorage:{}, ACTIVE_OWNER_KEY:"ACTIVE_OWNER",
    window:{confirm:()=>{calls.confirmed++;return consent},
      HerdHarborAttachments:attachmentReaderMissing?null:{stateWithPedigreeAttachments:async()=>{
        if(attachmentReadThrows)throw new Error("IndexedDB document missing");
        return {...state,pedigrees:[{id:"ped-1",attachmentStored:true,sourceDataUrl:"data:application/pdf;base64,dGVzdA=="}]};
      }}},
    setSyncState:(...args)=>calls.messages.push(args),
    recordRecoverySnapshot:async()=>{calls.backup++;if(changed)currentRaw=JSON.stringify({...state,animals:[{id:"new-edit"}]});return backup},
    client:{rpc:async(_name,args)=>{calls.rpc++;assert.equal(_name,"herdharbor_claim_auth_only_local_recovery");assert.deepEqual(args,{p_app_state:state});if(rpcThrows)throw new Error("network interrupted");return {data:rpcData,error:rpcError}}},
    fetchCloudRecord:async()=>{calls.reads++;if(readThrows)throw new Error("readback interrupted");return {data:{app_state:remoteMatches?state:{profile:{operationName:"Other device"}},updated_at:"2026-10-29T18:00:00Z"},error:null}},
    exactSameState:(left,right)=>JSON.stringify(JSON.parse(left))===JSON.stringify(JSON.parse(right)),
    writeCloudBaseline:async()=>{calls.baseline++;if(baselineThrows)throw new Error("local baseline unavailable");return baseline},
    safeStorageSet:(...args)=>{calls.versions.push(args);return true},
    versionKey:id=>"version_"+id,
    updateAuthOnlyRecoveryControls:()=>{},
    refreshAuthenticatedAccountData:async()=>{
      calls.refresh++;
      if(refreshThrows)throw new Error("refresh interrupted");
      if(refreshInvalidatesToken)tokenCurrent=false;
      if(refreshChangesAccount)deps.session.user.id="owner-B";
      return refreshResult;
    }
  };
  const exec=new Function("deps",`
    return async function execute() {
      let {session,captureAccountOperation,isAccountOperationCurrent,activeStateRaw,
        safeParse,hasConfiguredOperationProfile,originalGetItem,localStorage,ACTIVE_OWNER_KEY,
        window,setSyncState,recordRecoverySnapshot,client,fetchCloudRecord,exactSameState,
        writeCloudBaseline,safeStorageSet,versionKey,updateAuthOnlyRecoveryControls,
        refreshAuthenticatedAccountData}=deps;
      let authOnlyRecoveryOwner="owner-A";
      ${body}
      return await claimAuthOnlyDeviceRecovery();
    };
  `)(deps);
  return {result:await exec(),calls};
}
test("owner cancels without checkpoint or server upload",async()=>{
  const {result,calls}=await simulate({consent:false});
  assert.equal(result,false);assert.equal(calls.backup,0);assert.equal(calls.rpc,0);
});
test("owner cannot import a different account's active state",async()=>{
  const {result,calls}=await simulate({matchingOwner:false});
  assert.equal(result,false);assert.equal(calls.rpc,0);
});
test("unconfigured operation cannot become cloud authority",async()=>{
  const {result,calls}=await simulate({profile:false});
  assert.equal(result,false);assert.equal(calls.rpc,0);
});
test("failed local recovery snapshot is a hard stop",async()=>{
  const {result,calls}=await simulate({backup:false});
  assert.equal(result,false);assert.equal(calls.rpc,0);
});
test("local edits during checkpoint prevent stale import",async()=>{
  const {result,calls}=await simulate({changed:true});
  assert.equal(result,false);assert.equal(calls.rpc,0);
});
test("server rejects existing cloud state without overwriting or applying local baseline",async()=>{
  const {result,calls}=await simulate({rpcError:{code:"23505"}});
  assert.equal(result,false);assert.equal(calls.rpc,1);assert.equal(calls.baseline,0);
  assert.equal(calls.refresh,0);
});
test("cloud readback divergence blocks migration refresh",async()=>{
  const {result,calls}=await simulate({remoteMatches:false});
  assert.equal(result,false);assert.equal(calls.reads,1);assert.equal(calls.baseline,0);
  assert.equal(calls.refresh,0);
});
test("local durable cloud baseline persistence failure is held",async()=>{
  const {result,calls}=await simulate({baseline:false});
  assert.equal(result,false);assert.equal(calls.baseline,1);assert.equal(calls.refresh,0);
});
test("first-login import with matching authenticated owner, checkpoint and cloud readback resumes",async()=>{
  const {result,calls}=await simulate();
  assert.equal(result,true);
  assert.equal(calls.confirmed,1);
  assert.equal(calls.backup,1);
  assert.equal(calls.rpc,1);
  assert.equal(calls.reads,1);
  assert.equal(calls.baseline,1);
  assert.equal(calls.refresh,1);
  assert.deepEqual(calls.versions,[["version_owner-A","2026-10-29T18:00:00Z"]]);
});
test("account switching during the recovery checkpoint rejects the import",async()=>{
  const {result,calls}=await simulate({accountSwitch:true});
  assert.equal(result,false);assert.equal(calls.rpc,0);
});

test("exception from RPC is preserved as unconfirmed claim, not an unhandled rejection",async()=>{
  const {result,calls}=await simulate({rpcThrows:true});
  assert.equal(result,false);
  assert.equal(calls.backup,1);assert.equal(calls.rpc,1);
  assert.equal(calls.reads,0);assert.equal(calls.refresh,0);
  assert.match(calls.messages.at(-1)[0],/interrupted/);
});
test("exception from cloud readback leaves recovery held",async()=>{
  const {result,calls}=await simulate({readThrows:true});
  assert.equal(result,false);
  assert.equal(calls.reads,1);assert.equal(calls.baseline,0);assert.equal(calls.refresh,0);
});
test("exception from local baseline retains cloud claim but blocks authoritative success",async()=>{
  const {result,calls}=await simulate({baselineThrows:true});
  assert.equal(result,false);
  assert.equal(calls.baseline,1);assert.equal(calls.refresh,0);
});
test("failed post-claim auth refresh does not claim migration readiness",async()=>{
  for (const args of [{refreshThrows:true},{refreshResult:false}]) {
    const {result,calls}=await simulate(args);
    assert.equal(result,false);assert.equal(calls.refresh,1);
    assert.match(calls.messages.at(-1)[0],/refresh/i);
  }
});

test("successful same-owner refresh deliberately invalidates old fence but completes import",async()=>{
  const {result,calls}=await simulate({refreshInvalidatesToken:true});
  assert.equal(result,true);
  assert.equal(calls.refresh,1);
  assert.equal(calls.baseline,1);
});
test("account change during refresh cannot claim successful import",async()=>{
  const {result,calls}=await simulate({refreshInvalidatesToken:true,refreshChangesAccount:true});
  assert.equal(result,false);
  assert.equal(calls.refresh,1);
});

test("import with IndexedDB-only pedigree originals requires a second explicit consent",async()=>{
  const {result,calls}=await simulate({storedPedigree:true});
  assert.equal(result,true);
  assert.equal(calls.confirmed,2);
  assert.equal(calls.rpc,1);
});
test("import stops when device-only pedigree reader is unavailable",async()=>{
  const {result,calls}=await simulate({storedPedigree:true,attachmentReaderMissing:true});
  assert.equal(result,false);
  assert.equal(calls.rpc,0);
});
test("import stops when device-only pedigree original cannot be loaded",async()=>{
  const {result,calls}=await simulate({storedPedigree:true,attachmentReadThrows:true});
  assert.equal(result,false);
  assert.equal(calls.rpc,0);
});
