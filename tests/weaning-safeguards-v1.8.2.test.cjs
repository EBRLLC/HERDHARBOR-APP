const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const Core=require("../weaning-safeguards-core-v1.8.2.js");

function fixture(){
  return{
    animals:[
      {id:"dam",name:"Judy",species:"Rabbit",status:"Active"},
      {id:"k1",name:"Kit 1",species:"Rabbit",dob:"2026-09-01",status:"Active",sourceBirthId:"l1",weanedDate:""},
      {id:"k2",name:"Kit 2",species:"Rabbit",dob:"2026-09-01",status:"Active",sourceBirthId:"l1",weanedDate:"2026-09-05"},
      {id:"k3",name:"Kit 3",species:"Rabbit",dob:"2026-09-01",status:"Deceased",sourceBirthId:"l1",weanedDate:""}
    ],
    litters:[{id:"l1",damId:"dam",birthDate:"2026-09-01",bornAlive:"3",lostBeforeWeaning:"1",weaned:"1",offspringIds:["k1","k2","k3"]}]
  };
}

test("rabbit offspring are locked from weaning before 28 days",()=>{
  const state=fixture();
  const blocked=Core.weanEligibility(state,"l1","k1","2026-09-05");
  assert.equal(blocked.allowed,false);
  assert.equal(blocked.unlockDate,"2026-09-29");
  assert.equal(blocked.ageDays,4);
  const allowed=Core.weanEligibility(state,"l1","k1","2026-09-29");
  assert.equal(allowed.allowed,true);
});

test("custom no-wean-before date can extend the automatic rabbit lock",()=>{
  let state=fixture();
  const changed=Core.setWeanNotBefore(state,"l1","2026-10-05","2026-09-07T21:00:00Z");
  state=changed.state;
  assert.equal(Core.effectiveUnlockDate(state,state.litters[0],state.animals[1]),"2026-10-05");
  assert.equal(Core.weanEligibility(state,"l1","k1","2026-09-30").allowed,false);
  assert.equal(Core.weanEligibility(state,"l1","k1","2026-10-05").allowed,true);
});

test("clearing a custom lock restores the species safety minimum",()=>{
  let state=fixture();
  state.litters[0].weanNotBeforeDate="2026-10-05";
  const cleared=Core.setWeanNotBefore(state,"l1","","2026-09-07T21:00:00Z");
  assert.equal(cleared.state.litters[0].weanNotBeforeDate,"");
  assert.equal(Core.effectiveUnlockDate(cleared.state,cleared.state.litters[0],cleared.state.animals[1]),"2026-09-29");
});

test("undo weaning clears the animal date and recalculates litter weaned count",()=>{
  const state=fixture();
  const result=Core.unweanSelected(state,"l1",["k2"],"2026-09-07T21:00:00Z");
  assert.deepEqual(result.updated,["k2"]);
  assert.equal(result.state.animals.find(a=>a.id==="k2").weanedDate,"");
  assert.equal(result.state.litters[0].weaned,"0");
});

test("undo does not alter unrelated fields such as current location",()=>{
  const state=fixture();
  state.animals.find(a=>a.id==="k2").location="Grow-out Pen";
  const result=Core.unweanSelected(state,"l1",["k2"]);
  assert.equal(result.state.animals.find(a=>a.id==="k2").location,"Grow-out Pen");
});

test("deceased offspring cannot be marked weaned",()=>{
  const state=fixture();
  const result=Core.weanEligibility(state,"l1","k3","2026-10-10");
  assert.equal(result.allowed,false);
  assert.match(result.reason,/Deceased/);
});

test("litter workspace integration loads the safeguard UI and styling",()=>{
  const root=path.resolve(__dirname,"..");
  const integration=fs.readFileSync(path.join(root,"breeding-litter-workspace-integration-v1.8.2.js"),"utf8");
  const ui=fs.readFileSync(path.join(root,"weaning-safeguards-v1.8.2.js"),"utf8");
  const css=fs.readFileSync(path.join(root,"weaning-safeguards-v1.8.2.css"),"utf8");
  assert.match(integration,/weaning-safeguards-core-v1\.8\.2\.js\?v=1/);
  assert.match(integration,/weaning-safeguards-v1\.8\.2\.js\?v=1/);
  assert.match(integration,/weaning-safeguards-v1\.8\.2\.css\?v=1/);
  assert.match(ui,/data-hh-ws-unwean/);
  assert.match(ui,/data-hh-ws-lock-date/);
  assert.match(ui,/#hh-bw-weaning-form/);
  assert.match(css,/hh-ws-age-locked/);
});