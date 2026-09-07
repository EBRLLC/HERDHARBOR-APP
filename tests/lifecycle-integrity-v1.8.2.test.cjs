const test=require("node:test");
const assert=require("node:assert/strict");
const Core=require("../lifecycle-integrity-core-v1.8.2.js");

function baseState(){
  return{
    breedings:[
      {id:"b1",femaleId:"dam",maleId:"sire",updatedAt:"2026-09-01T12:00:00Z"},
      {id:"b2",femaleId:"dam",maleId:"sire",updatedAt:"2026-09-02T12:00:00Z"}
    ],
    litters:[
      {id:"l1",breedingId:"b1",damId:"dam",sireId:"sire",birthDate:"2026-09-01",offspringIds:["a1"],updatedAt:"2026-09-01T12:00:00Z"},
      {id:"l2",breedingId:"b2",damId:"dam",sireId:"sire",birthDate:"2026-09-03",offspringIds:["a2"],updatedAt:"2026-09-03T12:00:00Z"},
      {id:"l3",breedingId:"",damId:"dam",birthDate:"2026-08-01",offspringIds:["a3"],updatedAt:"2026-08-01T12:00:00Z"}
    ],
    animals:[
      {id:"dam",name:"Judy",species:"Rabbit",status:"Active",updatedAt:"2026-09-01T12:00:00Z"},
      {id:"sire",name:"Patches",species:"Rabbit",status:"Active",updatedAt:"2026-09-01T12:00:00Z"},
      {id:"a1",name:"Valid kit",dob:"2026-09-01",status:"Active",sourceBirthId:"l1",damId:"dam",sireId:"sire",weanedDate:"",updatedAt:"2026-09-01T12:00:00Z"},
      {id:"a2",name:"Ghost",dob:"2026-09-03",status:"Active",sourceBirthId:"l2",damId:"dam",sireId:"sire",weanedDate:"2026-10-22",location:"Nest box",updatedAt:"2026-09-04T12:00:00Z"},
      {id:"a3",name:"Standalone kit",dob:"2026-08-01",status:"Active",sourceBirthId:"l3",damId:"dam",weanedDate:"2026-08-29",updatedAt:"2026-08-02T12:00:00Z"},
      {id:"a4",name:"Unrelated dangling kit",dob:"2026-07-01",status:"Active",sourceBirthId:"legacy-missing",weanedDate:"2026-08-01",updatedAt:"2026-08-01T12:00:00Z"}
    ],
    sales:[
      {id:"s1",status:"Completed",sourceLitterId:"l1"},
      {id:"s2",status:"Draft",sourceLitterId:"l2"},
      {id:"s3",status:"Draft",sourceLitterId:"legacy-missing"}
    ]
  };
}

test("explicit breeding and birth deletions receive durable tombstones",()=>{
  const before=baseState();
  const after={
    ...before,
    breedings:before.breedings.filter(row=>row.id!=="b2"),
    litters:before.litters.filter(row=>row.id!=="l2")
  };
  const result=Core.recordDeletionTombstones(before,after,"2026-09-07T22:30:00Z");
  assert.equal(result.changed,true);
  assert.deepEqual(result.added.map(row=>row.id).sort(),["breeding:b2","litter:l2"]);
  assert.deepEqual(result.state.lifecycleTombstones.map(row=>row.recordId).sort(),["b2","l2"]);
});

test("a tombstoned birth cannot return from stale cloud state",()=>{
  const state=baseState();
  state.lifecycleTombstones=[{id:"litter:l2",kind:"litter",recordId:"l2",deletedAt:"2026-09-07T22:30:00Z"}];
  const result=Core.reconcile(state,"2026-09-07T22:31:00Z","2026-09-07");
  assert.equal(result.changed,true);
  assert.equal(result.state.litters.some(row=>row.id==="l2"),false);
  assert.deepEqual(result.removedLitterIds,["l2"]);

  const ghost=result.state.animals.find(row=>row.id==="a2");
  assert.ok(ghost,"individual offspring profile is preserved");
  assert.equal(ghost.sourceBirthId,"");
  assert.equal(ghost.weanedDate,"","invalid future completed-weaning date is cleared with the deleted workflow");
  assert.equal(ghost.location,"Nest box");
  assert.equal(result.state.sales.find(row=>row.id==="s2").sourceLitterId,"");
});

test("deleting a breeding preserves its birth while removing the stale breeding link",()=>{
  const state=baseState();
  state.lifecycleTombstones=[{id:"breeding:b2",kind:"breeding",recordId:"b2",deletedAt:"2026-09-07T22:30:00Z"}];
  const result=Core.reconcile(state,"2026-09-07T22:31:00Z","2026-09-07");
  assert.equal(result.state.breedings.some(row=>row.id==="b2"),false);
  const birth=result.state.litters.find(row=>row.id==="l2");
  assert.ok(birth,"birth/litter stays available when only breeding is deleted");
  assert.equal(birth.breedingId,"");
  assert.deepEqual(result.unlinkedLitterIds,["l2"]);
  assert.equal(result.state.animals.find(row=>row.id==="a2").sourceBirthId,"l2");
});

test("missing breeding references are detached rather than deleting the birth",()=>{
  const state=baseState();
  state.breedings=state.breedings.filter(row=>row.id!=="b2");
  const result=Core.reconcile(state,"2026-09-07T22:31:00Z","2026-09-07");
  const birth=result.state.litters.find(row=>row.id==="l2");
  assert.ok(birth);
  assert.equal(birth.breedingId,"");
  assert.equal(result.removedLitterIds.includes("l2"),false);
});

test("a resurrected deleted birth is recognized after its offspring links were cleared",()=>{
  const state=baseState();
  state.breedings=state.breedings.filter(row=>row.id!=="b2");
  state.litters.find(row=>row.id==="l2").breedingId="";
  const ghost=state.animals.find(row=>row.id==="a2");
  ghost.sourceBirthId="";
  ghost.updatedAt="2026-09-07T22:30:00Z";

  assert.deepEqual(Core.staleResurrectedLitterIds(state),["l2"]);
  const result=Core.reconcile(state,"2026-09-07T22:31:00Z","2026-09-07");
  assert.equal(result.state.litters.some(row=>row.id==="l2"),false);
  assert.deepEqual(result.detectedStaleLitterIds,["l2"]);
  assert.ok(result.state.lifecycleTombstones.some(row=>row.id==="litter:l2"));
});

test("valid linked and legitimate standalone births are left intact",()=>{
  const result=Core.reconcile(baseState(),"2026-09-07T22:31:00Z","2026-09-07");
  assert.equal(result.state.litters.some(row=>row.id==="l1"),true);
  assert.equal(result.state.litters.some(row=>row.id==="l3"),true);
  assert.equal(result.state.animals.find(row=>row.id==="a3").sourceBirthId,"l3");
});

test("unrelated legacy dangling links are not broadly erased",()=>{
  const state=baseState();
  state.lifecycleTombstones=[{id:"litter:l2",kind:"litter",recordId:"l2",deletedAt:"2026-09-07T22:30:00Z"}];
  const result=Core.reconcile(state,"2026-09-07T22:31:00Z","2026-09-07");
  assert.equal(result.state.animals.find(row=>row.id==="a4").sourceBirthId,"legacy-missing");
  assert.equal(result.state.sales.find(row=>row.id==="s3").sourceLitterId,"legacy-missing");
});

test("reconciliation is idempotent after cleanup",()=>{
  const state=baseState();
  state.lifecycleTombstones=[{id:"litter:l2",kind:"litter",recordId:"l2",deletedAt:"2026-09-07T22:30:00Z"}];
  const first=Core.reconcile(state,"2026-09-07T22:31:00Z","2026-09-07");
  const second=Core.reconcile(first.state,"2026-09-07T22:32:00Z","2026-09-07");
  assert.equal(second.changed,false);
  assert.strictEqual(second.state,first.state);
});
