"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const lineage=require("../canine-lineage-v2.0.1.js");
const dog=(id,sex="Male",extra={})=>({id,name:id,species:"Dog",sex,...extra});
const rabbit=(id,sex="Male",extra={})=>({id,name:id,species:"Rabbit",sex,...extra});
test("dog sire and dam may only link dogs with correct sexes",()=>{
  const animals=[dog("sire"),dog("dam","Female"),rabbit("rabbit")];
  assert.equal(lineage.validate(animals,dog("puppy","Female",{sireId:"sire",damId:"dam"})).valid,true);
  assert.equal(lineage.validate(animals,dog("puppy","Female",{sireId:"rabbit"})).valid,false);
  assert.equal(lineage.validate(animals,dog("puppy","Female",{sireId:"dam"})).valid,false);
});
test("missing cross-account and self parent IDs fail closed",()=>{
  const parents=[dog("one","Male",{accountId:"ownerA"}),dog("two","Female",{accountId:"ownerB"})];
  assert.equal(lineage.validate(parents,dog("child","Female",{sireId:"unknown"})).valid,false);
  assert.equal(lineage.validate(parents,dog("child","Female",{sireId:"child"})).valid,false);
  assert.equal(lineage.validate(parents,dog("child","Female",{accountId:"ownerA",damId:"two"})).valid,false);
});
test("duplicate IDs and ancestor cycles are rejected while repeats on separate branches are valid",()=>{
  const duplicates=[dog("root"),dog("root"),dog("dam","Female")];
  assert.equal(lineage.validate(duplicates,dog("child","Female",{sireId:"root"})).valid,false);
  const circle=[dog("dad","Male",{sireId:"grand"}),dog("grand","Male",{sireId:"dad"})];
  assert.equal(lineage.validate(circle,dog("pup","Female",{sireId:"dad"})).valid,false);
  const shared=[dog("grand"),dog("dad","Male",{sireId:"grand"}),dog("mom","Female",{sireId:"grand"})];
  assert.equal(lineage.validate(shared,dog("pup","Female",{sireId:"dad",damId:"mom"})).valid,true);
});
test("historic Ancestor Only dog records remain eligible as parents, not operational animals",()=>{
  const animals=[dog("ancestor","Male",{status:"Ancestor Only"}),rabbit("rabbit")];
  const parents=lineage.parentOptions(animals,dog("pup","Female"),"sireId");
  assert.deepEqual(parents.map(x=>x.id),["ancestor"]);
  assert.equal(lineage.validate(animals,dog("pup","Female",{sireId:"ancestor"})).valid,true);
});
test("rabbit lineage is not changed by canine validator",()=>{
  const animals=[rabbit("dad"),rabbit("mom","Female")];
  const result=lineage.validate(animals,rabbit("pup","Female",{sireId:"dad",damId:"mom"}));
  assert.equal(result.valid,true);
  const profile=fs.readFileSync(path.join(__dirname,"../animal-profile-runtime-v1.8.3.js"),"utf8");
  assert.match(profile,/const lineage = canineLineage\?\.validate\?\./);
  assert.match(profile,/if \(canineIdentity\?\.isDog\(data\.species\)\)/);
});
