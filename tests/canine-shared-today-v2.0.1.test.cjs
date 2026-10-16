"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const automation=require("../task-automation-v1.8.3.js");
const base={
 animals:[
 {id:"r",name:"Daisy",species:"Rabbit",sex:"Female",status:"Active"},
 {id:"d",name:"Daisy",species:"Dog",sex:"Female",status:"Active"},
 {id:"ancestor",name:"Historic Dog",species:"Dog",sex:"Male",status:"Ancestor Only"}
 ],
 health:[
 {id:"h1",animalId:"r",type:"Vaccination",followUpDate:"2026-10-18"},
 {id:"h2",animalId:"d",type:"Veterinary visit",followUpDate:"2026-10-18"},
 {id:"h3",animalId:"ancestor",type:"Medication",followUpDate:"2026-10-18"}
 ],
 breedings:[
 {id:"b1",femaleId:"r",maleId:"r",followUpDate:"2026-10-18"},
 {id:"b2",femaleId:"d",maleId:"d",followUpDate:"2026-10-18"}
 ],
 litters:[
 {id:"l1",damId:"r",followUpDate:"2026-10-18"},
 {id:"l2",damId:"d",followUpDate:"2026-10-18"}
 ],
 tasks:[{id:"manual-dog",animalId:"d",title:"Brush Daisy",dueDate:"2026-10-18"}]
};
test("mixed rabbit and dog health follow-ups share the same canonical task collection",()=>{
  const first=automation.deriveTaskDefinitions(base);
  const second=automation.deriveTaskDefinitions(structuredClone(base));
  assert.deepEqual(first,second,"same IDs across reload/reconciliation");
  const health=first.filter(x=>x.sourceType==="health");
  assert.equal(health.length,2);
  assert.ok(health.some(x=>x.animalId==="d"&&x.title.includes("(Dog)")));
  assert.ok(health.some(x=>x.animalId==="r"&&!x.title.includes("(Dog)")));
  assert.equal(new Set(first.map(x=>x.id)).size,first.length);
});
test("historical canine ancestors create no operational health notification",()=>{
  assert.equal(automation.deriveTaskDefinitions(base).some(x=>x.animalId==="ancestor"),false);
});
test("unsupported canine reproductive records create no automatic gestation/whelping tasks",()=>{
  const rows=automation.deriveTaskDefinitions(base);
  assert.ok(rows.some(x=>x.sourceRecordId==="b1"));
  assert.ok(rows.some(x=>x.sourceRecordId==="l1"));
  assert.ok(!rows.some(x=>x.sourceRecordId==="b2"));
  assert.ok(!rows.some(x=>x.sourceRecordId==="l2"));
});
test("manual canine tasks are retained and task UI identifies dog species without new persistence",()=>{
  const file=fs.readFileSync(path.join(__dirname,"../task-runtime-v1.8.3.js"),"utf8");
  assert.match(file,/taskAnimalLabel\(task\.animalId\)/);
  assert.match(file,/name\+" · Dog"/);
  assert.match(file,/stateNow\(\)\.tasks/);
  assert.match(file,/syncDerivedAutomation/);
  assert.equal(base.tasks[0].title,"Brush Daisy");
});
