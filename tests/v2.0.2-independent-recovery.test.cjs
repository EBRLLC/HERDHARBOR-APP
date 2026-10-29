"use strict";
// Portable independent-restore acceptance. The writer and reader run in
// separate Node processes / modules with an on-disk encrypted artifact.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const cp = require("node:child_process");
const { storeBackup } = require("../scripts/s19-cloud-migration.cjs");
const normalizer = require("../cloud-state-normalizer-v1.8.3.js");
const verify = path.resolve(__dirname, "../scripts/s19-independent-backup-verify.cjs");
const secret = "synthetic-test-passphrase-longer-than-24";
const userId = "123e4567-e89b-42d3-a456-426614174000";

function syntheticAccount() {
  const app_state = {
    operation: {name: "Test Farm"},
    animals: [
      {id: "dog-1", name: "Scout", species: "dog", breed: "Great Pyrenees"},
      {id: "rabbit-1", name: "Clover", species: "rabbit", breed: "Holland Lop"}
    ],
    litters: [{id: "litter-1", species: "rabbit", damId: "rabbit-1"}],
    tasks: [{id: "t-1", animalId: "dog-1", category: "Canine reproduction"}],
    settings: {aiEnabled: false}
  };
  const rows = normalizer.mapLegacySnapshot(app_state).records.map(r=>({...r, deleted_at: null}));
  rows.push({namespace:"legacy-state", record_id:"old-deleted-id",
    payload:{kind:"array_item",key:"animals",value:{id:"retired"}},
    payload_checksum:normalizer.checksumValue({kind:"array_item",key:"animals",value:{id:"retired"}}),
    deleted_at:"2026-10-01T12:00:00Z"});
  return {userId, enabled:true, cohort:"internal_test",
    legacy:{app_state,updated_at:"2026-10-29T10:00:00.000Z"},
    manifest:{cutover_stage:"dual_write",sync_generation:7},
    rows};
}

function reader(backup, sha, output, envSecret=secret, expectedUser=userId) {
  const args = [verify,"--backup",backup,"--expect-user",expectedUser,
    "--expect-sha256",sha];
  if (output) args.push("--output",output);
  return cp.spawnSync(process.execPath,args,{
    encoding:"utf8",timeout:20_000,
    env:{...process.env,S19_BACKUP_PASSPHRASE:envSecret}
  });
}

test("2.0.2 independently restores complete mixed-species encrypted backup in a new process and directory",()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"hh-s19-restore-"));
  try {
    const input=syntheticAccount();
    const backupDir=path.join(root,"source");
    const restoreDir=path.join(root,"destination");
    fs.mkdirSync(backupDir);
    fs.mkdirSync(restoreDir);
    const artifact=storeBackup(input,backupDir,secret);
    const destination=path.join(restoreDir,"recovered.json");
    const cpResult=reader(artifact.file,artifact.checksum,destination);
    assert.equal(cpResult.status,0,cpResult.stderr);
    const report=JSON.parse(cpResult.stdout);
    assert.deepEqual(report,{ok:true,userId,backupSha256:artifact.checksum,
      recordCount:input.rows.length,restoredToNewFile:true});
    assert.equal(fs.statSync(destination).mode & 0o777,0o600);
    const restored=JSON.parse(fs.readFileSync(destination,"utf8"));
    assert.deepEqual(restored,input);
    assert.equal(normalizer.snapshotChecksum(restored.legacy.app_state),
      normalizer.snapshotChecksum(input.legacy.app_state));
    assert.equal(normalizer.reassembleAuthoritativeSnapshotWithMetadata(restored.rows).checkpointStale,false);
    assert.deepEqual(
      normalizer.reassembleAuthoritativeSnapshotWithMetadata(restored.rows).snapshot,
      normalizer.reassembleAuthoritativeSnapshotWithMetadata(input.rows).snapshot);
    assert.equal(restored.rows.filter(r=>r.deleted_at).length,1);
    assert.equal(fs.statSync(artifact.file).mode & 0o777,0o600);
    assert.equal(reader(artifact.file,artifact.checksum,destination).status!==0,true,
      "independent restore must not overwrite an existing recovered file");
  }finally{fs.rmSync(root,{force:true,recursive:true});}
});

test("2.0.2 independent restore fails closed for wrong identity, key, digest and damaged artifact",()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"hh-s19-damage-"));
  try {
    const artifact=storeBackup(syntheticAccount(),root,secret);
    const noPlaintext=path.join(root,"must-not-exist.json");
    assert.notEqual(reader(artifact.file,artifact.checksum,noPlaintext,
      "wrong-passphrase-with-sufficient-length").status,0);
    assert.notEqual(reader(artifact.file,artifact.checksum,noPlaintext,secret,
      "123e4567-e89b-42d3-a456-426614174001").status,0);
    assert.notEqual(reader(artifact.file,"a".repeat(64),noPlaintext).status,0);
    assert.equal(fs.existsSync(noPlaintext),false);
    const tampered=JSON.parse(fs.readFileSync(artifact.file,"utf8"));
    tampered.data=tampered.data.replace(/^[A-Za-z0-9]/,"B");
    fs.writeFileSync(artifact.file,JSON.stringify(tampered));
    assert.notEqual(reader(artifact.file,artifact.checksum,noPlaintext).status,0);
    assert.equal(fs.existsSync(noPlaintext),false);
  }finally{fs.rmSync(root,{force:true,recursive:true});}
});
