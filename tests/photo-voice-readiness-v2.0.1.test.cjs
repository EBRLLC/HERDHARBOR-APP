"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const Photo=require("../photo-assisted-entry-v1.8.3.js");
const Voice=require("../voice-assisted-entry-v1.8.3.js");
test("photo registration with unknown species requires explicit member correction",()=>{
  const draft=Photo.canonicalDraft({
    documentType:"registration",registration:{name:"Rex",registrationNumber:"AKC55",breed:"Golden Retriever"}
  },[]);
  assert.equal(draft.classification,"registration_document");
  assert.equal(draft.defaults.species,"");
  assert.equal(Photo.validateReview(draft,[]).ok,false);
  assert.ok(draft.warnings.some(x=>x.includes("Species")));
  draft.defaults.species="Dog";
  assert.equal(Photo.validateReview(draft,[]).ok,true);
});
test("photo health record requires a specific current animal before canonical handoff",()=>{
  const animals=[{id:"rabbit1",name:"Daisy",species:"Rabbit"},{id:"dog1",name:"Daisy",species:"Dog"}];
  const draft=Photo.canonicalDraft({documentType:"veterinary_document",
    veterinaryRecord:{animalName:"Daisy",date:"2026-10-16",summary:"Checkup"}},animals);
  assert.equal(draft.defaults.animalId,"");
  assert.equal(Photo.validateReview(draft,animals).ok,false);
  draft.defaults.animalId="dog1";
  assert.equal(Photo.validateReview(draft,animals).ok,true);
});
test("voice refuses nonexistent animal or malformed date even with other fields complete",()=>{
  const animals=[{id:"a1",name:"Daisy",species:"Rabbit",sex:"Female"}];
  const base={recordType:"weight",date:"2026-10-16",defaults:{animalId:"a1",weight:"2"}};
  assert.equal(Voice.validateDraft(base,animals).ok,true);
  assert.equal(Voice.validateDraft({...base,defaults:{...base.defaults,animalId:"absent"}},animals).ok,false);
  assert.equal(Voice.validateDraft({...base,date:"yesterday"},animals).ok,false);
});
test("dog breeding voice draft remains blocked even after review",()=>{
  const animals=[{id:"m",name:"Rex",species:"Dog",sex:"Male"},{id:"f",name:"Lulu",species:"Dog",sex:"Female"}];
  const draft={recordType:"breeding",date:"2026-10-16",defaults:{femaleId:"f",maleId:"m"}};
  assert.equal(Voice.validateDraft(draft,animals).ok,false);
});
test("photo and voice remain read-only until canonical form handoff",()=>{
  const root=path.join(__dirname,"..");
  const photo=fs.readFileSync(path.join(root,"photo-assisted-entry-v1.8.3.js"),"utf8");
  const voice=fs.readFileSync(path.join(root,"voice-assisted-entry-v1.8.3.js"),"utf8");
  assert.match(photo,/deps\.openAnimalForm\("", next\.defaults\)/);
  assert.match(photo,/deps\.openHealthForm\("", next\.defaults\)/);
  assert.match(voice,/deps\.openHealthForm\("", next\.defaults\)/);
  assert.doesNotMatch(photo,/\.animals\.push\(|\.health\.push\(/);
  assert.doesNotMatch(voice,/\.animals\.push\(|\.health\.push\(/);
});
