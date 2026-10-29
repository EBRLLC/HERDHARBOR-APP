// Real staging Auth/REST/RPC acceptance, NEVER an emulated PostgreSQL JWT session.
// Requires two confirmed, synthetic staging Auth users configured as protected
// GitHub Actions environment secrets. No customer data, billing, or migrations.
// Refuses the production Supabase project even if credentials are misconfigured.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const normalizer = require("../cloud-state-normalizer-v1.8.3.js");

const expectedProject = "vaxsrkhiidoxctrtzkug";
const url = new URL(process.env.HH_STAGE_SUPABASE_URL || "");
const apiKey = process.env.HH_STAGE_PUBLISHABLE_KEY || "";
assert.equal(url.hostname, expectedProject + ".supabase.co",
  "2.0.2 staging Auth acceptance refuses any non-staging Supabase target");
assert.ok(apiKey.startsWith("sb_publishable_") || apiKey.startsWith("eyJ"),
  "Missing staging publishable key");
const accounts = [
  [process.env.HH_STAGE_USER_A_EMAIL, process.env.HH_STAGE_USER_A_PASSWORD],
  [process.env.HH_STAGE_USER_B_EMAIL, process.env.HH_STAGE_USER_B_PASSWORD]
];
for (const [email,password] of accounts) {
  assert.ok(email && password && password.length >= 12,
    "Two preprovisioned confirmed synthetic staging users are required");
}
assert.notEqual(accounts[0][0],accounts[1][0],"Expected distinct synthetic Auth owners");

async function request(path,{method="GET",accessToken="",body}={}) {
  const headers = {apikey:apiKey,Accept:"application/json"};
  if (accessToken) headers.Authorization="Bearer "+accessToken;
  if (body !== undefined) headers["Content-Type"]="application/json";
  const response=await fetch(url.origin+path,{
    method, headers, body:body===undefined?undefined:JSON.stringify(body),
    signal:AbortSignal.timeout(15000)
  });
  const raw=await response.text();
  let data;
  try { data=raw?JSON.parse(raw):null; } catch { data={unexpectedResponse:true}; }
  return {ok:response.ok,status:response.status,data};
}
function requireOk(result,phase) {
  assert.ok(result.ok,phase+" HTTP status "+result.status+" (response body intentionally withheld)");
  return result.data;
}
async function signIn(email,password) {
  const response=await request("/auth/v1/token?grant_type=password",{
    method:"POST",body:{email,password}
  });
  const data=requireOk(response,"real GoTrue password login");
  assert.ok(data?.access_token && data?.refresh_token && data?.user?.id,
    "GoTrue did not issue an authenticated session");
  const verify=requireOk(await request("/auth/v1/user",{accessToken:data.access_token}),
    "real GoTrue user lookup");
  assert.equal(verify.id,data.user.id,"JWT owner and Auth user must match");
  return {...data,userId:data.user.id};
}
function headersFor(subject){return subject.access_token}
async function table(subject,table,query) {
  return requireOk(await request("/rest/v1/"+table+"?"+query,{
    accessToken:headersFor(subject)
  }),table+" authenticated read");
}
async function rpc(subject,name,args={}) {
  return requireOk(await request("/rest/v1/rpc/"+name,{
    method:"POST",accessToken:headersFor(subject),body:args
  }),name+" authenticated RPC");
}
const [A,B]=await Promise.all(accounts.map(([email,password])=>signIn(email,password)));
assert.notEqual(A.userId,B.userId,"Synthetic owners must have different JWT subjects");
const manifestQuery=id=>"select=user_id,cutover_stage,sync_generation,metadata&user_id=eq."+encodeURIComponent(id);
const [aManifest,bManifest,bCannotReadA,aCannotReadB]=await Promise.all([
  table(A,"herdharbor_sync_manifest",manifestQuery(A.userId)),
  table(B,"herdharbor_sync_manifest",manifestQuery(B.userId)),
  table(B,"herdharbor_sync_manifest",manifestQuery(A.userId)),
  table(A,"herdharbor_sync_manifest",manifestQuery(B.userId))
]);
assert.equal(aManifest.length,1,"Signed-in owner A cannot read its own server manifest");
assert.equal(bManifest.length,1,"Signed-in owner B cannot read its own server manifest");
assert.equal(bCannotReadA.length,0,"B can read A's manifest: CROSS-ACCOUNT DISCLOSURE");
assert.equal(aCannotReadB.length,0,"A can read B's manifest: CROSS-ACCOUNT DISCLOSURE");
for (const owner of [A,B]) {
  const status=await rpc(owner,"herdharbor_sync_cohort_status");
  assert.ok(status && ["legacy","shadow","dual_write","normalized"].includes(status.stage),
    "Current owner is missing its signed-in authority status");
}

const writable = [[A,aManifest[0]],[B,bManifest[0]]].find(([,m])=>
  m.cutover_stage==="normalized" &&
  m.metadata?.normalized_authority_ready===true &&
  m.metadata?.normalized_writer_ready===true &&
  typeof m.metadata?.normalized_writer_version==="string");
assert.ok(writable,"Requires at least one confirmed synthetic normalized-authority test account");
const [writer,manifest]=writable;
const other=writer.userId===A.userId?B:A;
const ns="integration-test";
const recordId="http-"+crypto.randomUUID();
const payload={kind:"integration-marker",value:{synthetic:true,run:"2.0.2",recordId}};
const checksum=normalizer.checksumValue(payload);
const args={
  p_namespace:ns,p_record_id:recordId,p_payload:payload,
  p_payload_checksum:checksum,p_expected_version:null,p_delete:false,
  p_writer_version:manifest.metadata.normalized_writer_version
};
const created=await rpc(writer,"herdharbor_sync_apply_record",args);
assert.ok(created && created.ok!==false && created.record_version>=1,
  "Real JWT normalized CAS create did not commit");
const q="select=user_id,namespace,record_id,payload_checksum,record_version,deleted_at&namespace=eq."+
  encodeURIComponent(ns)+"&record_id=eq."+encodeURIComponent(recordId);
const [ownRecords,foreignRecords]=await Promise.all([
  table(writer,"herdharbor_sync_records",q),table(other,"herdharbor_sync_records",q)
]);
assert.equal(ownRecords.length,1,"Owner cannot read its own confirmed normalized CAS write");
assert.equal(ownRecords[0].payload_checksum,checksum,"Server checksum differs from client record");
assert.equal(foreignRecords.length,0,"Other JWT can read fresh owner record");
const stale=await request("/rest/v1/rpc/herdharbor_sync_apply_record",{
  method:"POST",accessToken:writer.access_token,
  body:{...args,p_expected_version:Number(created.record_version)-1}
});
assert.ok(!stale.ok || stale.data?.ok===false,
  "Stale record update unexpectedly succeeded without conflict");
const deleted=await rpc(writer,"herdharbor_sync_apply_record",{
  ...args,p_payload:null,p_payload_checksum:null,
  p_expected_version:Number(created.record_version),p_delete:true
});
assert.ok(deleted && deleted.ok!==false,"Owner's versioned tombstone mutation failed");
const [ownTombstone,otherTombstone]=await Promise.all([
  table(writer,"herdharbor_sync_records",q),table(other,"herdharbor_sync_records",q)
]);
assert.equal(ownTombstone.length,1);
assert.ok(ownTombstone[0].deleted_at,"Versioned delete did not create a tombstone");
assert.equal(otherTombstone.length,0,"Other JWT can read tombstoned owner record");
const refreshed=requireOk(await request("/auth/v1/token?grant_type=refresh_token",{
  method:"POST",body:{refresh_token:A.refresh_token}
}),"Auth returning session refresh");
assert.equal(refreshed.user?.id,A.userId,"Refresh changed account ownership");
const logout=await request("/auth/v1/logout",{method:"POST",accessToken:refreshed.access_token});
assert.ok(logout.ok,"GoTrue logout failed");
const relogin=await signIn(...accounts[0]);
assert.equal(relogin.userId,A.userId,"Returning login resolved different account");
console.log(JSON.stringify({
  status:"PASS",environment:"synthetic staging",project:expectedProject,
  authentication:"GoTrue password JWT, user lookup, refresh, logout and re-login",
  ownerIsolation:"two signed-in users; cross-owner manifest/record access denied",
  normalizedCAS:"create, own read, stale rejection, tombstone, cross-owner denial",
  customerDataUsed:false
}));
