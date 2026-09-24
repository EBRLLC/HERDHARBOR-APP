"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");

test("v1.8.4 state-integrity coverage retains required lifecycle and cross-device scenarios",()=>{
  const e2e=read("tests/state-integrity-e2e-v1.8.2.test.cjs");
  for(const phrase of [
    "breeding -> pregnancy -> birth -> offspring -> weights -> weaning -> retained",
    "direct member transfer preserves identity, pedigree, and provenance",
    "phone create -> PC update -> phone edit again",
    "same-field phone/PC edits stop as a conflict",
    "stale device",
    "tombstone"
  ]) assert.ok(e2e.toLowerCase().includes(phrase.toLowerCase()), phrase);
});

test("canonical state protection still includes dirty state, conflict and recovery",()=>{
  const cloud=read("herdharbor-cloud.js");
  assert.match(cloud,/safeStorageSet\(dirtyKey\(userId\), "1"\)/);
  assert.match(cloud,/mergeRawStates/);
  assert.match(cloud,/markConflict/);
  assert.match(cloud,/recordRecoverySnapshot/);
  assert.match(cloud,/backup/i);
});

test("sale and transfer regressions continue to protect duplicate provenance",()=>{
  const sale=read("tests/litter-sale-transfer-v1.8.2.test.cjs");
  assert.match(sale,/cannot be sold twice/i);
  assert.match(sale,/direct transfer/i);
  assert.match(sale,/sourceLitterId/);
  assert.match(sale,/sourceBreedingId/);
  const e2e=read("tests/state-integrity-e2e-v1.8.2.test.cjs");
  assert.match(e2e,/replaying the accepted transfer must not duplicate/i);
});

test("canonical weight and task recurrence ownership remain tested",()=>{
  const e2e=read("tests/state-integrity-e2e-v1.8.2.test.cjs");
  assert.match(e2e,/row\.type === "Weight"/);
  const task=read("tests/runtime-task-extraction-v1.8.3.test.cjs");
  assert.match(task,/idempotent|recurr/i);
});
