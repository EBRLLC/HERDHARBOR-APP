"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {storeBackup,restoreBackup}=require("../scripts/s19-cloud-migration.cjs");
const secret="synthetic-test-passphrase-longer-than-24";
const sample={userId:"123e4567-e89b-42d3-a456-426614174000",
  legacy:{app_state:{animals:[{id:"dog-1",species:"dog"},{id:"rabbit-1",species:"rabbit"}]}},
  rows:[{namespace:"animals",record_id:"dog-1",deleted_at:null}]};
test("2.0.2 recovery backup can be independently decrypted and inspected",()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"hh-backup-"));
  try {
    const saved=storeBackup(sample,dir,secret);
    assert.deepEqual(restoreBackup(saved.file,secret),sample);
    assert.equal(fs.statSync(saved.file).mode & 0o777,0o600);
    assert.throws(()=>restoreBackup(saved.file,"incorrect-password-with-sufficient-length"));
    const tampered=JSON.parse(fs.readFileSync(saved.file,"utf8"));
    tampered.sha256="0".repeat(64);
    fs.writeFileSync(saved.file,JSON.stringify(tampered));
    assert.throws(()=>restoreBackup(saved.file,secret),/checksum mismatch/i);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test("2.0.2 backup restore fails closed for incomplete or invalid envelopes",()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"hh-backup-"));
  try {
    const saved=storeBackup(sample,dir,secret);
    const bad=JSON.parse(fs.readFileSync(saved.file,"utf8"));
    bad.format="unknown";
    fs.writeFileSync(saved.file,JSON.stringify(bad));
    assert.throws(()=>restoreBackup(saved.file,secret),/unsupported backup format/);
    assert.throws(()=>restoreBackup(saved.file,"short"),/PASSPHRASE/);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
