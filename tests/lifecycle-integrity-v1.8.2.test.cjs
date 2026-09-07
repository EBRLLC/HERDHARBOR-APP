const test=require("node:test");
const assert=require("node:assert/strict");
const Core=require("../lifecycle-integrity-core-v1.8.2.js");

function fixture(){
  return{
    breedings:[{id:"b1",femaleId:"dam",maleId:"sire"}],
    litters:[
      {id:"l1",breedingId:"b1",damId:"dam",sireId:"sire",birthDate:"2026-09-01"},
      {id:"l2",breedingId:"deleted-breeding",damId:"dam",sireId:"sire",birthDate:"2026-09-03"},
      {id:"l3",damId:"dam",birthDate:"2026-08-01"}
    ],
    animals:[
      {id:"dam",name:"Judy",species:"Rabbit",status:"Active"},
      {id:"sire",name:"Patches",species:"Rabbit",status:"Active"},
      {id:"a1",name:"Valid kit",dob:"2026-09-01",status:"Active",sourceBirthId:"l1",damId:"dam",sireId:"sire",weanedDate:""},
      {id:"a2",name:"Ghost",dob:"2026-09-03",status:"Active",sourceBirthId:"l2",damId:"dam",sireId:"sire",weanedDate:"2026-10-22",location:"Nest box"},
      {id:"a3",name:"Dangling kit",dob:"2026-08-15",status:"Active",sourceBirthId:"missing-litter",damId:"dam",sireId:"sire",weanedDate:"2026-08-30"},
      {id:"a4",name:"Standalone litter kit",dob:"2026-08-01",status:"Active",sourceBirthId:"l3",damId:"dam",weanedDate:"2026-08-29"}
    ],
    sales:[
      {id:"s1",status:"Completed",sourceLitterId:"l1"},
      {id:"s2",status:"Draft",sourceLitterId:"l2"},
      {id:"s3",status:"Draft",sourceLitterId:"missing-litter"}
    ]
  };
}

test("linked litter becomes orphaned when its breeding record is deleted",()=>{
  const state=fixture();
  assert.equal(Core.isOrphanLinkedLitter(state,state.litters[0]),false);
  assert.equal(Core.isOrphanLinkedLitter(state,state.litters[1]),true);
  assert.equal(Core.isOrphanLinkedLitter(state,state.litters[2]),false,"standalone litter without breedingId remains valid");
});

test("reconcile removes orphan workflow but preserves individual offspring profiles",()=>{
  const state=fixture();
  const result=Core.reconcile(state,"2026-09-07T22:30:00Z","2026-09-07");
  assert.equal(result.changed,true);
  assert.deepEqual(result.removedLitterIds,["l2"]);
  assert.deepEqual(result.state.litters.map(row=>row.id),["l1","l3"]);

  const ghost=result.state.animals.find(row=>row.id==="a2");
  assert.ok(ghost,"offspring profile must not be deleted with the workflow");
  assert.equal(ghost.sourceBirthId,"");
  assert.equal(ghost.name,"Ghost");
  assert.equal(ghost.dob,"2026-09-03");
  assert.equal(ghost.damId,"dam");
  assert.equal(ghost.sireId,"sire");
  assert.equal(ghost.status,"Active");
  assert.equal(ghost.location,"Nest box");
});

test("future weaning recorded on a deleted workflow is cleared as invalid",()=>{
  const result=Core.reconcile(fixture(),"2026-09-07T22:30:00Z","2026-09-07");
  const ghost=result.state.animals.find(row=>row.id==="a2");
  assert.equal(ghost.weanedDate,"");
  assert.deepEqual(result.clearedFutureWeaningIds,["a2"]);
});

test("historical weaning data is preserved when only its litter link is dangling",()=>{
  const result=Core.reconcile(fixture(),"2026-09-07T22:30:00Z","2026-09-07");
  const animal=result.state.animals.find(row=>row.id==="a3");
  assert.equal(animal.sourceBirthId,"");
  assert.equal(animal.weanedDate,"2026-08-30");
});

test("sales keep their records while stale litter source links are removed",()=>{
  const result=Core.reconcile(fixture(),"2026-09-07T22:30:00Z","2026-09-07");
  assert.equal(result.state.sales.find(row=>row.id==="s1").sourceLitterId,"l1");
  assert.equal(result.state.sales.find(row=>row.id==="s2").sourceLitterId,"");
  assert.equal(result.state.sales.find(row=>row.id==="s3").sourceLitterId,"");
  assert.equal(result.state.sales.length,3);
});

test("valid linked and standalone litter records are left untouched",()=>{
  const result=Core.reconcile(fixture(),"2026-09-07T22:30:00Z","2026-09-07");
  assert.equal(result.state.animals.find(row=>row.id==="a1").sourceBirthId,"l1");
  assert.equal(result.state.animals.find(row=>row.id==="a4").sourceBirthId,"l3");
});

test("second reconciliation is idempotent",()=>{
  const first=Core.reconcile(fixture(),"2026-09-07T22:30:00Z","2026-09-07");
  const second=Core.reconcile(first.state,"2026-09-07T22:31:00Z","2026-09-07");
  assert.equal(second.changed,false);
  assert.strictEqual(second.state,first.state);
});
