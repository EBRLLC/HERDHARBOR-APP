"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.join(__dirname,"..");
const normalizer=require("../cloud-state-normalizer-v1.8.3.js");
const graph=require("../pedigree-engine-v2.0.0.js");
const standard=require("../standard-pedigree-print-v2.0.0.js");
const canine=require("../canine-identity-v2.0.1.js");
const lineage=require("../canine-lineage-v2.0.1.js");
const printer=require("../canine-pedigree-print-v2.0.1.js");
const tasks=require("../task-automation-v1.8.3.js");
const reader=require("../paper-pedigree-import-core-v1.8.2.js");
const photo=require("../photo-assisted-entry-v1.8.3.js");
const voice=require("../voice-assisted-entry-v1.8.3.js");
const state={
 settings:{species:["Rabbit","Dog"]},
 animals:[
  {id:"r1",name:"Clover",species:"Rabbit",breed:"Holland Lop",sex:"Female",status:"Active",registrationNumber:"R123"},
  {id:"d1",name:"Scout",species:"Dog",breed:"Golden Retriever",sex:"Male",status:"Active",sireId:"ds",damId:"dd",canine:{
   registeredName:"Autumn Meadow Scout",
   callName:"Scout",
   registrations:[{id:"reg1",registry:"AKC",number:"AB123456"}],
   titles:[{abbreviation:"CH",organization:"AKC",placement:"prefix",displayOrder:1},{abbreviation:"CGC",organization:"AKC",placement:"suffix",displayOrder:2}]
  }},
  {id:"ds",name:"Sire",species:"Dog",sex:"Male",status:"Ancestor Only",canine:{registeredName:"Northwoods Sire"}},
  {id:"dd",name:"Dam",species:"Dog",sex:"Female",status:"Ancestor Only",canine:{registeredName:"Willow Dam"}}
 ],
 health:[
  {id:"h-r",type:"Vaccination",animalId:"r1",followUpDate:"2026-10-20"},
  {id:"h-d",type:"Veterinary visit",animalId:"d1",followUpDate:"2026-10-20"}
 ],
 breedings:[],litters:[],
 tasks:[{id:"manual-dog",title:"Groom Scout",category:"Health",animalId:"d1",dueDate:"2026-10-20",completed:false}]
};
test("rabbit + dog cloud normalization roundtrip preserves titles, lineage, records and tasks",()=>{
  const original=structuredClone(state);
  const mapped=normalizer.mapLegacySnapshot(original);
  const recovered=normalizer.reassembleLegacySnapshot(mapped.records);
  assert.deepEqual(recovered,original);
  assert.equal(recovered.animals[1].canine.titles[0].abbreviation,"CH");
  assert.equal(recovered.animals[0].registrationNumber,"R123");
  assert.equal(recovered.tasks[0].animalId,"d1");
});
test("canine document and existing rabbit standard print coexist without overwriting source records",()=>{
  const before=JSON.stringify(state);
  const document=printer.buildDocument({
   animals:state.animals,subjectId:"d1",generations:4,
   engine:graph,standard,canine,lineage
  });
  assert.match(document.html,/CH Autumn Meadow Scout CGC/);
  assert.match(document.html,/not an official AKC-certified document/);
  const rabbit=state.animals[0];
  const rabbitGraph=graph.buildGraph({animals:state.animals,subjectId:"r1",generations:3});
  const html=standard.buildHtml({graph:rabbitGraph,subject:rabbit,config:{generations:3,rootFields:["name","registrationNumber"],ancestorFields:["name"],photos:false,unknownDisplay:"label"},speciesIcon:()=>"🐇"});
  assert.match(html,/Clover/);
  assert.doesNotMatch(html,/not an official AKC-certified document/);
  assert.equal(JSON.stringify(state),before,"neither print pipeline mutates canonical records");
});
test("dog and rabbit health tasks have disjoint stable IDs in one existing Today queue",()=>{
 const derived=tasks.deriveTaskDefinitions(state);
 assert.equal(derived.filter(x=>x.sourceType==="health").length,2);
 assert.equal(new Set(derived.map(x=>x.id)).size,derived.length);
 assert.ok(derived.some(x=>x.animalId==="d1"&&x.title.includes("Dog")));
 assert.ok(!derived.some(x=>x.animalId==="ds"));
 assert.equal(state.tasks.length,1);
});
test("wrong-species parent and unsafe dog AI paper draft fail closed",()=>{
 assert.equal(lineage.validate(state.animals,{...state.animals[1],sireId:"r1"}).valid,false);
 const plan=reader.buildImportPlan(state,{nodes:[{role:"subject",name:"Dog Sample",species:"Dog"}]});
 assert.equal(plan.canCommit,false);
});
test("manual entry remains independently viable when AI is unavailable",()=>{
 const draft=photo.canonicalDraft({documentType:"registration",registration:{name:"New Dog",species:"Dog"}},state.animals);
 assert.equal(photo.validateReview(draft,state.animals).ok,true);
 const voiceDraft={recordType:"weight",date:"2026-10-16",defaults:{animalId:"d1",weight:"25"}};
 assert.equal(voice.validateDraft(voiceDraft,state.animals).ok,true);
 const source=fs.readFileSync(path.join(root,"animal-profile-runtime-v1.8.3.js"),"utf8");
 assert.match(source,/deps\.saveState\("Animal added\."\)/);
 assert.match(source,/canineIdentity\.readEditor\(form, animal\.canine\)/);
});
test("all canine modules load in one existing app and stable production is not silently promoted",()=>{
 const shell=fs.readFileSync(path.join(root,"index.html"),"utf8");
 for(const name of ["canine-breeds-v2.0.1.js","canine-identity-v2.0.1.js",
  "canine-lineage-v2.0.1.js","canine-pedigree-print-v2.0.1.js"])
  assert.match(shell,new RegExp(name.replace(/\./g,"\\.")));
 const status=fs.readFileSync(path.join(root,"RELEASE-STATUS.md"),"utf8");
 assert.match(status,/Stable production version: 2\.0\.0/);
 assert.match(status,/Canine Foundation \+ Optional AI Public Release/);
});
