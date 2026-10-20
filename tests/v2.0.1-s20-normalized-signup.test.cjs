"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const mapper=require("../cloud-state-normalizer-v1.8.3.js");
const upgrade=require("../s20-login-normalized-upgrade.js");
const root=path.resolve(__dirname,"..");
const sql=fs.readFileSync(path.join(root,"scripts/sql/s20-new-normalized-signups.sql"),"utf8");
const cloud=fs.readFileSync(path.join(root,"herdharbor-cloud.js"),"utf8");
const approvalSql=fs.readFileSync(path.join(root,"scripts/sql/s20-cutover-approval-gate.sql"),"utf8");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const sw=fs.readFileSync(path.join(root,"service-worker.js"),"utf8");
const uid="123e4567-e89b-42d3-a456-426614174000";
function state(opts={}){
 return {serverApproved:true,session:{user:{id:uid}},status:{eligible:true,schemaVerified:true,stage:"dual_write"},
 manifest:{cutover_stage:"dual_write",metadata:{
  s20_client_cutover_approved:true,
  s20_offdevice_backup_verified:true,
  s20_legacy_clients_closed:true
 }},details:{online:true,syncing:false,unsynced:false},
 pending:false,conflict:false,...opts};
}
test("S20 new user starts from a valid canonical empty normalized snapshot",()=>{
 const empty=mapper.mapLegacySnapshot({});
 assert.equal(empty.records.length,1);
 assert.equal(empty.checksum,"hh64:5465b825fabc98ff");
 assert.equal(empty.records[0].record_id,"snapshot-manifest");
 assert.equal(empty.records[0].payload_checksum,"hh64:976db5f570268d3b");
 assert.match(sql,/hh64:5465b825fabc98ff/);
 assert.match(sql,/hh64:976db5f570268d3b/);
 assert.equal(mapper.stableStringify(mapper.reassembleAuthoritativeSnapshotWithMetadata(empty.records).snapshot),"{}");
});
test("S20 signup trigger is restricted to newly inserted auth identities and does not touch legacy",()=>{
 assert.match(sql,/AFTER INSERT ON auth\.users/);
 assert.match(sql,/CREATE TRIGGER herdharbor_s20_normalized_signup/);
 assert.match(sql,/cutover_stage.*?normalized/s);
 assert.match(sql,/s20_normalized_signup/);
 assert.match(sql,/EXISTS \(SELECT 1 FROM public\.herdharbor_user_data/);
 assert.doesNotMatch(sql,/INSERT INTO public\.herdharbor_user_data/);
 assert.doesNotMatch(sql,/UPDATE public\.herdharbor_user_data/);
 assert.match(sql,/REVOKE ALL ON FUNCTION/);
});
test("S20 only offers a cutover on verified clean approved dual-write accounts",()=>{
 assert.equal(upgrade.preflight(state()).ok,true);
 for(const over of [
  {session:null},{status:{...state().status,stage:"legacy"}},
  {status:{...state().status,stage:"normalized"}},
  {status:{...state().status,schemaVerified:false}},
  {manifest:{cutover_stage:"missing",metadata:{}}},
  {serverApproved:false},
  {manifest:{cutover_stage:"normalized",metadata:state().manifest.metadata}},
  {details:{online:false}},{details:{online:true,syncing:true}},
  {details:{online:true,unsynced:true}},{pending:true},{conflict:true}
 ]) assert.equal(upgrade.preflight(state(over)).ok,false,JSON.stringify(over));
});
test("S20 upgrade uses verified S18 account cutover and never deletes legacy tables",()=>{
 const js=fs.readFileSync(path.join(root,"s20-login-normalized-upgrade.js"),"utf8");
 assert.match(js,/cutoverToNormalizedPrimary/);
 assert.match(js,/getS20MigrationApproval/);
 assert.match(approvalSql,/herdharbor_internal\.s20_cutover_approval/);
 assert.match(approvalSql,/REVOKE ALL ON TABLE/);
 assert.match(approvalSql,/source_updated_at = d\.updated_at/);
 assert.match(js,/document\.createElement\("dialog"\)/);
 assert.match(js,/cloud\.syncNow\(\)/);
 assert.match(js,/getNormalizedSyncCohortStatus\(\{force:true\}\)/);
 assert.doesNotMatch(js,/writeCloudRecord|\.delete\(\)|DROP TABLE/i);
});
test("S20 cloud hydration announces a safe authenticated account without changing old account",()=>{
 assert.match(cloud,/lastHydratedUserId = userId;[\s\S]{0,240}herdharbor:cloud-hydrated/);
 assert.match(cloud,/stillCurrentUser && appUnlocked && !recoveryMode/);
});
test("S20 offline shell has matching cache/versioned references",()=>{
 assert.match(html,/herdharbor-cloud\.js\?v=41/);
 assert.match(html,/s20-login-normalized-upgrade\.js\?v=1/);
 assert.match(sw,/herdharbor-shell-v2\.0\.1-v2\.0\.1-release-1-s20-1/);
 assert.match(sw,/herdharbor-cloud\.js\?v=41/);
 assert.match(sw,/s20-login-normalized-upgrade\.js\?v=1/);
});
