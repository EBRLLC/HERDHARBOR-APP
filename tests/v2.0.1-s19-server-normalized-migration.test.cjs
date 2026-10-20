"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const mapper = require("../cloud-state-normalizer-v1.8.3.js");
const { planMigration } = require("../scripts/s19-cloud-migration-core.cjs");
const { sqlForCutover } = require("../scripts/s19-cloud-migration-sql.cjs");
const { execute,options } = require("../scripts/s19-cloud-migration.cjs");
const uid = "123e4567-e89b-42d3-a456-426614174000";
const legacy = {
  app_state: {
    operation: { name:"Test Farm" },
    animals: [
      {id:"dog-1",species:"dog",name:"Dog"},
      {id:"rabbit-1",species:"rabbit",name:"Rabbit"}
    ],
    litters: [{ id:"l-1", sireId:"rabbit-1" }],
    health: [{ id:"h-1",animalId:"dog-1"}],
    settings: { darkMode:true }
  },updated_at:"2026-10-20T12:00:00.000Z"
};
function account(stage="missing",extras={}) {
  const mapped=mapper.mapLegacySnapshot(legacy.app_state);
  return {
    userId:uid,enabled:true,cohort:"internal_test",legacy,
    manifest:stage==="missing"?null:{cutover_stage:stage,sync_generation:7},
    rows:stage==="missing"?[]:mapped.records.map(r=>({...r,deleted_at:null})),
    ...extras
  };
}
test("S19 builds deterministic, complete pre-login snapshot plan",()=>{
  const first=planMigration(account());
  const second=planMigration(account());
  assert.equal(first.stage,"missing");
  assert.equal(first.digest,second.digest);
  assert.equal(first.sourceChecksum,mapper.snapshotChecksum(legacy.app_state));
  assert.ok(first.recordCount>4);
  assert.equal(mapper.stableStringify(mapper.reassembleAuthoritativeSnapshotWithMetadata(first.normalizedRecords).snapshot),mapper.stableStringify(legacy.app_state));
});
test("S19 accepts exact dual-write reassembly and keeps existing tombstones",()=>{
  const original=account("dual_write");
  original.rows.push({...original.rows[0],record_id:"deleted-old",deleted_at:"2026-10-20T12:00:00.000Z"});
  assert.equal(planMigration(original).verified,true);
});
test("S19 refuses missing or unknown owner, snapshot, stages and orphan rows",()=>{
  assert.throws(()=>planMigration(account("missing",{enabled:false})),/COHORT|allowlisted/i);
  assert.throws(()=>planMigration(account("missing",{legacy:null})),/source/i);
  assert.throws(()=>planMigration(account("shadow")),/unsupported stage/i);
  assert.throws(()=>planMigration(account("missing",{rows:[{}]})),/orphaned/i);
});
test("S19 rejects mismatching normalized record content or deleted expected row",()=>{
  const a=account("dual_write");
  a.rows[0]={...a.rows[0],payload_checksum:"mismatch"};
  assert.throws(()=>planMigration(a),/differs/i);
  const b=account("dual_write");
  b.rows[0]={...b.rows[0],deleted_at:"2026-10-20T12:00:00Z"};
  assert.throws(()=>planMigration(b),/count differs/i);
});
test("S19 detects stale source changes and checksum drift in plan digest",()=>{
  const a=account();
  const b=account("missing",{legacy:{...legacy,updated_at:"2026-10-20T12:01:00.000Z"}});
  assert.notEqual(planMigration(a).digest,planMigration(b).digest);
});
test("S19 generated SQL is serializable, backup-gated outside SQL, and source fenced",()=>{
  for(const stage of ["dual_write"]) {
    const a=account(stage);
    const sql=sqlForCutover(a,planMigration(a));
    assert.match(sql,/BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE/i);
    assert.match(sql,/S19_LEGACY_CHANGED/);
    assert.match(sql,/S19_RECORD_READBACK_MISMATCH/);
    assert.match(sql,/herdharbor_legacy_write_cutover_guard/);
    assert.match(sql,/S19_STAGE_CHANGED/);
    assert.match(sql,/cutover_stage='normalized'/);
    assert.match(sql,/COMMIT;/);
    assert.doesNotMatch(sql,/Dog|Rabbit|Test Farm/);
  }
});
test("S19 forbids direct SQL creation of normalized authority for a missing manifest",()=>{
  assert.throws(()=>sqlForCutover(account("missing")),/S19_ONLINE_BOOTSTRAP_REQUIRED/);
});
test("S19 defaults to non-writing planning and rejects unapproved execution",()=>{
  let wrote=false;
  const log=console.log;
  console.log=()=>{};
  try {
    const read=()=>account();
    const fakeWrite=()=>{wrote=true;};
    const result=execute(["--account",uid],read,fakeWrite);
    assert.equal(result.executed,false);
    assert.equal(wrote,false);
    assert.throws(()=>execute(["--account",uid,"--execute"],read,fakeWrite),/legacy clients/i);
    assert.equal(wrote,false);
  } finally {console.log=log;}
});
test("S19 CLI rejects unknown flags",()=>{
  assert.throws(()=>options(["--account",uid,"--wipe"]),/Unsupported option/);
});
