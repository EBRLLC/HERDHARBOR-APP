"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const breeds = require("../canine-breeds-v2.0.1.js");
const canine = require("../canine-identity-v2.0.1.js");

test("AKC catalog has 205 unique sourced breed IDs without umbrella/duplicate entries", () => {
  const rows = breeds.list();
  assert.equal(rows.length, 205);
  assert.equal(new Set(rows.map(r=>r.id)).size, 205);
  assert.equal(breeds.SOURCE.sourceUpdated, "2026-01-01");
  assert.ok(rows.every(r=>r.recognized && r.registry==="AKC"));
  assert.equal(rows.filter(r => r.name === "Bracco Italiano").length, 1);
  assert.equal(rows.filter(r => r.name === "Fox Terrier").length, 0);
  assert.deepEqual(breeds.resolve("Retriever (Golden)")?.name, "Golden Retriever");
  assert.equal(breeds.resolve("Toy Manchester Terrier")?.name, "Manchester Terrier");
});
test("catalog searches aliases while unlisted/mixed dogs remain user-defined", () => {
  assert.equal(breeds.search("labrador").length, 1);
  assert.equal(breeds.search("Labrador")[0].name, "Labrador Retriever");
  assert.equal(breeds.classify("Golden Retriever").status, "recognized");
  assert.equal(breeds.classify("Goldendoodle").status, "user-entered");
  assert.equal(breeds.classify("Mixed Breed").status, "user-entered");
});
test("structured registrations retain distinct registry/number pairs without any verification claim", () => {
  const input = {callName:"Rex", registeredName:"Meadow's Example", registrations:[
    {registry:"AKC",number:"AB123456",status:"Registered",verification:"verified"},
    {registry:"UKC",number:"0021",source:"Owner"}
  ],titles:[{organization:"AKC",abbreviation:"CH",placement:"prefix",displayOrder:1},
           {organization:"AKC",abbreviation:"CGC",placement:"suffix",displayOrder:0}]};
  const result=canine.validate(input);
  assert.equal(result.valid,true,result.errors.join("; "));
  assert.equal(result.value.registrations.length,2);
  assert.ok(result.value.registrations.every(r=>r.verification==="unverified"));
  assert.equal(canine.displayName({name:"Rex",species:"Dog",canine:result.value}),"CH Meadow's Example CGC");
  assert.equal(canine.preferredRegistration({canine:result.value}).registry,"AKC");
  assert.equal(result.value.callName,"Rex");
});
test("invalid/duplicate registries and unissued title entries cannot be accepted", () => {
  const result=canine.validate({registrations:[{registry:"AKC",number:"1"},{registry:" akc ",number:"1"},
    {registry:"",number:"2"}],titles:[{abbreviation:"CH",organization:""}]});
  assert.equal(result.valid,false);
  assert.ok(result.errors.some(s=>s.includes("Duplicate")));
  assert.ok(result.errors.some(s=>s.includes("requires both")));
  assert.ok(result.errors.some(s=>s.includes("organization")));
});
test("Dog editor HTML escapes text and remains hidden for rabbits",()=>{
  assert.match(canine.editorHtml({species:"Rabbit",canine:{registeredName:'<img src=x>'}}),/ hidden/);
  assert.doesNotMatch(canine.editorHtml({species:"Rabbit"}),/data-canine-panel[^>]*>[^]*<script>/);
  assert.match(canine.editorHtml({species:"Dog",canine:{registeredName:'<img src=x>'}}),/&lt;img/);
  assert.equal(canine.isDog("Rabbit"),false);
});
test("existing animal form remains canonical dog metadata save authority",()=>{
  const root=path.join(__dirname,"..");
  const runtime=fs.readFileSync(path.join(root,"animal-profile-runtime-v1.8.3.js"),"utf8");
  const shell=fs.readFileSync(path.join(root,"index.html"),"utf8");
  assert.match(runtime,/data\.canine = checked\.value/);
  assert.match(runtime,/canineIdentity\.readEditor\(form, animal\.canine\)/);
  assert.match(runtime,/deps\.saveState\("Animal updated\."\)/);
  assert.match(runtime,/deps\.saveState\("Animal added\."\)/);
  assert.match(shell,/canine-breeds-v2\.0\.1\.js/);
  assert.match(shell,/canine-identity-v2\.0\.1\.js/);
});
