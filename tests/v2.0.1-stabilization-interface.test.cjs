"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const canine=require("../canine-identity-v2.0.1.js");
const photo=require("../photo-assisted-entry-v1.8.3.js");
const root=path.join(__dirname,"..");
test("photo registration matching recognizes dog registry entries and registered names",()=>{
 const dogs=[{id:"d1",name:"Scout",species:"Dog",canine:{registeredName:"Example Scout V",registrations:[{registry:"AKC",number:"AB123456"}]}},
             {id:"r1",name:"Clover",species:"Rabbit",registrationNumber:"R123"}];
 assert.deepEqual(photo.exactAnimalMatches({identifier:"AB123456"},dogs).map(x=>x.id),["d1"]);
 assert.deepEqual(photo.exactAnimalMatches({registrationNumber:"AKC AB123456"},dogs).map(x=>x.id),["d1"]);
 assert.deepEqual(photo.exactAnimalMatches({name:"Example Scout V"},dogs).map(x=>x.id),["d1"]);
 assert.deepEqual(photo.exactAnimalMatches({identifier:"R123"},dogs).map(x=>x.id),["r1"]);
});
test("ambiguous registered names are not auto-selected for a health entry",()=>{
 const animals=[{id:"d1",species:"Dog",name:"Scout",canine:{registeredName:"Daisy"}},
  {id:"r1",species:"Rabbit",name:"Daisy"}];
 const result=photo.canonicalDraft({documentType:"veterinary_document",veterinaryRecord:{animalName:"Daisy",date:"2026-10-16",summary:"Exam"}},animals);
 assert.equal(result.defaults.animalId,"");
 assert.ok(result.warnings.length);
});
test("editing a dog after deleting preferred registration does not strand the Save button",()=>{
 const records=[{id:"other",registry:"UKC",number:"U123"}];
 const panel={
  hidden:false,
  querySelectorAll(selector){if(selector==="[data-canine-reg-row]")return records.map(row=>({querySelector(sel){const k=sel.match(/="([^"]+)"/)?.[1];return {value:row[k]||""};}}));return[];},
  querySelector(sel){if(sel==="[data-canine-call-name]")return{value:"Scout"};if(sel==="[data-canine-registered-name]")return{value:"Example Scout"};return null;}
 };
 const form={querySelector(selector){return selector==="[data-canine-panel]"?panel:null;}};
 const updated=canine.readEditor(form,{preferredRegistrationId:"deleted",registrations:[{id:"deleted",registry:"AKC",number:"A123"}]});
 assert.equal(updated.valid,true,updated.errors?.join(" "));
 assert.equal(updated.value.preferredRegistrationId,"");
 assert.equal(updated.value.registrations.length,1);
});
test("legacy dog detail modal does not expose rabbit-only buttons and keeps canine printing",()=>{
 const source=fs.readFileSync(path.join(root,"animal-profile-runtime-v1.8.3.js"),"utf8");
 assert.match(source,/const isCanine = root\.HerdHarborCanineIdentity\?\.isDog\(animal\)/);
 assert.match(source,/isCanine \?[\s\S]*?detail-print-canine/);
 assert.match(source,/if \(!isCanine\) root\.HerdHarborAnimalDocuments\?\.bindCenter/);
 assert.match(source,/canine\.registrations|canine\.registeredName|canineInfo\.registrations/);
 assert.match(source,/detail-print-canine.*addEventListener/);
});
test("ordinary Rabbit animal fields and owner-entered Dog search remain canonical",()=>{
 const source=fs.readFileSync(path.join(root,"animal-profile-runtime-v1.8.3.js"),"utf8");
 assert.match(source,/animal\?\.canine\?\.registeredName/);
 assert.match(source,/animal\.canine\.registrations\.flatMap/);
 assert.match(source,/animal\?\.registrationNumber/);
});
