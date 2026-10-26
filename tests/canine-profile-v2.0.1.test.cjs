"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const root=path.join(__dirname,"..");
const canine=require("../canine-identity-v2.0.1.js");
const voice=require("../voice-assisted-entry-v1.8.3.js");
const read=(name)=>fs.readFileSync(path.join(root,name),"utf8");

test("Dog profile explicitly excludes rabbit breeding/genetics/show actions",()=>{
  const profile=read("flow-phase2-v1.8.2.js");
  assert.match(profile,/if\(root\.HerdHarborCanineIdentity\?\.isDog\(model\?\.animal\)\)return \["overview","health","pedigree","history"\]/);
  assert.match(profile,/canineIdentitySummary\(animal\)/);
  assert.match(profile,/Dog registration &amp; titles/);
  assert.match(profile,/Canine reproduction/);
  assert.match(profile,/Edit dog and parent links/);
});
test("Dog action router denies rabbit breeding/import/genetics and birth certificate even on manipulated action clicks",()=>{
  const module={exports:{}},toasts=[];
  const sandbox={module,globalThis:null,HerdHarborCanineIdentity:canine,HerdHarborApp:{
    getState:()=>({animals:[{id:"dog1",species:"Dog",name:"Rex"}]}),
    toast:(message)=>toasts.push(message)
  }};
  sandbox.globalThis=sandbox;
  vm.runInNewContext(read("animal-action-router-v1.8.3.js"),sandbox);
  for(const action of ["breeding","genetics","pedigree","birth-certificate","show-entry"]){
    assert.equal(module.exports.open(action,"dog1"),false,action);
  }
  assert.equal(toasts.length,5);
  // Canine printing is enabled by K4 without opening the rabbit print workflow.
  let caninePrintInvocations=0;
  sandbox.HerdHarborCaninePedigreePrint={openForAnimal:()=>{caninePrintInvocations++;return true;}};
  assert.equal(module.exports.open("print-pedigree","dog1"),true);
  assert.equal(caninePrintInvocations,1);
});
test("Voice cannot route dog mating to legacy breeding engine but manual rabbit instruction remains parseable",()=>{
  const dogAnimals=[
    {id:"d1",name:"Rex",species:"Dog",sex:"Male"},
    {id:"d2",name:"Lulu",species:"Dog",sex:"Female"}
  ];
  const draft=voice.interpretTranscript("Breed Rex and Lulu today",{animals:dogAnimals,todayISO:"2026-10-16"});
  assert.equal(draft.recordType,"breeding");
  assert.ok(draft.issues.some(x=>x.includes("Canine breeding")));
  assert.equal(voice.validateDraft(draft,dogAnimals).ok,false);
  const rabbits=[
    {id:"r1",name:"Buck",species:"Rabbit",sex:"Male"},
    {id:"r2",name:"Doe",species:"Rabbit",sex:"Female"}
  ];
  const rabbitDraft=voice.interpretTranscript("Breed Buck and Doe today",{animals:rabbits,todayISO:"2026-10-16"});
  assert.equal(rabbitDraft.recordType,"breeding");
  assert.ok(!rabbitDraft.issues.some(x=>x.includes("Canine breeding")));
});
test("Mixed species retains shared animal directory and only dog metadata opt-in",()=>{
  assert.equal(canine.isDog({species:"Rabbit"}),false);
  assert.equal(canine.isDog({species:"Dog"}),true);
  const profile=read("flow-phase2-v1.8.2.js");
  assert.match(profile,/const model=profileModel\(state,activeProfile\.animalId\)/);
  assert.match(profile,/backToAnimals/);
});
