const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const Core=require("../lifecycle-integrity-core-v1.8.2.js");

test("invalid future weaning is self-repaired and litter total is recalculated",()=>{
  const state={
    breedings:[{id:"b1"}],
    litters:[{id:"l1",breedingId:"b1",bornAlive:"1",weaned:"1",offspringIds:["k1"],updatedAt:"2026-09-03T12:00:00Z"}],
    animals:[{id:"k1",status:"Active",sourceBirthId:"l1",weanedDate:"2026-10-22",updatedAt:"2026-09-04T12:00:00Z"}],
    sales:[]
  };
  const result=Core.reconcile(state,"2026-09-07T22:30:00Z","2026-09-07");
  assert.equal(result.changed,true);
  assert.deepEqual(result.clearedFutureWeaningIds,["k1"]);
  assert.equal(result.state.animals[0].weanedDate,"");
  assert.equal(result.state.litters[0].weaned,"0");
});

test("workspace integration loads lifecycle repair before safeguard UI",()=>{
  const root=path.resolve(__dirname,"..");
  const integration=fs.readFileSync(path.join(root,"breeding-litter-workspace-integration-v1.8.2.js"),"utf8");
  assert.match(integration,/lifecycle-integrity-core-v1\.8\.2\.js\?v=1/);
  assert.match(integration,/lifecycle-integrity-v1\.8\.2\.js\?v=1/);
  assert.match(integration,/loadLifecycleIntegrity\(\)/);
});

test("runtime captures explicit birth and breeding deletions and rechecks after cloud sync",()=>{
  const root=path.resolve(__dirname,"..");
  const runtime=fs.readFileSync(path.join(root,"lifecycle-integrity-v1.8.2.js"),"utf8");
  assert.match(runtime,/#delete-litter,#delete-breeding/);
  assert.match(runtime,/recordDeletionTombstones/);
  assert.match(runtime,/herdharbor:sync-status/);
  assert.match(runtime,/herdharbor:auth-session/);
});
