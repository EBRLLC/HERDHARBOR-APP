"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const canine=require("../canine-lineage-v2.0.1.js");
const tasks=require("../task-automation-v1.8.3.js");
const dog=(id,sex="Male",more={})=>({id,name:id,species:"Dog",sex,...more});
const rabbit=(id,sex="Female",more={})=>({id,name:id,species:"Rabbit",sex,...more});
test("editing a sire's sex is rejected if any offspring reference depends on it",()=>{
 const list=[dog("sire"),dog("puppy","Female",{sireId:"sire"})];
 assert.equal(canine.validateMutation(list,{...list[0],sex:"Female"}).valid,false);
 assert.equal(canine.validateMutation(list,{...list[0],name:"New Name"}).valid,true);
});
test("species transitions cannot orphan a dog or silently discard registered details",()=>{
 const list=[dog("sire"),dog("puppy","Female",{sireId:"sire"})];
 assert.equal(canine.validateMutation(list,{...list[0],species:"Rabbit"}).valid,false);
 const registered=dog("lone","Female",{canine:{registeredName:"AKC Long Name",registrations:[{registry:"AKC",number:"123"}]}});
 assert.equal(canine.validateMutation([registered],{...registered,species:"Rabbit"}).valid,false);
 const unregistered=dog("unregistered");
 assert.equal(canine.validateMutation([unregistered],{...unregistered,species:"Rabbit"}).valid,true);
});
test("reverse dependency checks prevent deleting any recorded animal used as a parent",()=>{
 const records=[rabbit("mother"),dog("other"),rabbit("kit","Female",{damId:"mother"})];
 assert.equal(canine.validateDeletion(records,"mother").valid,false);
 assert.equal(canine.validateDeletion(records,"other").valid,true);
});
test("existing mixed-species breeding/litter task IDs survive the upgrade intact",()=>{
 const state={animals:[dog("d","Female"),rabbit("r")],
   breedings:[{id:"b-dog",femaleId:"d",followUpDate:"2026-10-20"},{id:"b-rabbit",femaleId:"r",followUpDate:"2026-10-20"}],
   litters:[{id:"l-dog",damId:"d",followUpDate:"2026-10-21"}]};
 const rows=tasks.deriveTaskDefinitions(state);
 assert.equal(rows.length,3);
 assert.equal(new Set(rows.map(x=>x.id)).size,3);
 assert.ok(rows.some(x=>x.id==="task_breeding_b-dog_breeding-follow-up"));
 assert.ok(rows.some(x=>x.id==="task_birth_l-dog_litter-follow-up"));
});
test("archived dogs preserve existing health reminders without manufacturing new ones",()=>{
 const state={animals:[dog("history","Male",{status:"Ancestor Only"})],
 health:[{id:"h1",animalId:"history",type:"Medication",followUpDate:"2026-10-25"}],tasks:[]};
 assert.equal(tasks.deriveTaskDefinitions(state).length,0);
 state.tasks=[{id:"task_health_h1_medication-follow-up",sourceType:"health",sourceRecordId:"h1",automationManaged:true,completed:false}];
 assert.equal(tasks.deriveTaskDefinitions(state).length,1);
});
test("shared animal form applies mutation checks for Dog and non-Dog edits before save",()=>{
 const source=fs.readFileSync(path.join(__dirname,"../animal-profile-runtime-v1.8.3.js"),"utf8");
 assert.match(source,/canineLineage\?\.validateMutation\?\.\(liveState\.animals/);
 assert.match(source,/canineLineage\?\.validateDeletion\?\.\(liveState\.animals/);
 assert.match(source,/if \(leavingDog\) delete nextAnimal\.canine/);
 assert.ok(source.indexOf("const mutationCheck")<source.indexOf("if (id) {\n          const currentAnimal"));
});
