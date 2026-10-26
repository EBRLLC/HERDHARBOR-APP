"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const canine=require("../canine-identity-v2.0.1.js");
const lineage=require("../canine-lineage-v2.0.1.js");
const engine=require("../pedigree-engine-v2.0.0.js");
const standard=require("../standard-pedigree-print-v2.0.0.js");
const printer=require("../canine-pedigree-print-v2.0.1.js");
const options={engine,standard,canine,lineage};
const dog=(id,sex="Male",extra={})=>({id,species:"Dog",sex,name:id,...extra});

test("deep shared ancestors are processed linearly rather than exponentially",()=>{
 const depth=50,records=[];
 for(let i=0;i<depth;i++){
  const sire=i<depth-1?"m"+(i+1):"";
  const dam=i<depth-1?"f"+(i+1):"";
  records.push(dog("m"+i,"Male",{sireId:sire,damId:dam}));
  records.push(dog("f"+i,"Female",{sireId:sire,damId:dam}));
 }
 const subject=dog("p","Female",{sireId:"m0",damId:"f0"});
 const now=performance.now();
 const result=lineage.validate(records,subject);
 assert.equal(result.valid,true,result.issues.join("; "));
 assert.ok(performance.now()-now<2000,"memoized lineage should remain bounded for 100 shared ancestors");
});
test("a real deep cycle is still rejected; repeat ancestor without cycle is permitted",()=>{
 const shared=[dog("gp"),dog("father","Male",{sireId:"gp"}),dog("mother","Female",{sireId:"gp"})];
 assert.equal(lineage.validate(shared,dog("child","Female",{sireId:"father",damId:"mother"})).valid,true);
 const cyclic=[dog("dad","Male",{sireId:"grand"}),dog("grand","Male",{sireId:"dad"})];
 assert.ok(lineage.validate(cyclic,dog("child","Female",{sireId:"dad"})).issues.some(s=>s.includes("Circular")));
});
test("selected UKC registry is used consistently in chart and full-text appendix",()=>{
 const animal=dog("d","Female",{canine:{
  registeredName:"Long Orchard Name",
  preferredRegistrationId:"reg1",
  registrations:[{id:"reg1",registry:"AKC",number:"111"},{id:"reg2",registry:"UKC",number:"222"}]
 }});
 const output=printer.buildDocument({animals:[animal],subjectId:"d",registry:"UKC",paperSize:"a4",...options});
 const before=output.html.split("Complete canine pedigree details")[0];
 const after=output.html.split("Complete canine pedigree details")[1];
 assert.match(before,/UKC 222/);
 assert.match(after,/UKC 222/);
 assert.doesNotMatch(after,/AKC 111/);
 assert.match(output.html,/<\/div><section class="hh-canine-appendix">/);
 assert.doesNotMatch(output.html,/<section class="sale-strip">/);
 assert.doesNotMatch(output.html,/<section class="certification">/);
});
test("a changed shared renderer fails closed rather than emitting an undisclosed Dog sale form",()=>{
 const animal=dog("d","Female");
 const badStandard={buildHtml:()=>"<html><head></head><body><main>Changed template</main></body></html>"};
 assert.throws(()=>printer.buildDocument({animals:[animal],subjectId:"d",...options,standard:badStandard}),/print contract changed/i);
});
