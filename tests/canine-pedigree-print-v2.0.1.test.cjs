"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const engine=require("../pedigree-engine-v2.0.0.js");
const standard=require("../standard-pedigree-print-v2.0.0.js");
const lineage=require("../canine-lineage-v2.0.1.js");
const canine=require("../canine-identity-v2.0.1.js");
const printer=require("../canine-pedigree-print-v2.0.1.js");
const deps={engine,standard,lineage,canine};
const longName="Autumn Meadow Heritage National Champion of "+("Silver Moon ".repeat(10));
const dogs=[
  {id:"d",name:"Rex",species:"Dog",sex:"Male",breed:"Golden Retriever",sireId:"s",damId:"m",canine:{
    registeredName:longName,
    registrations:[{registry:"AKC",number:"AKC12345"},{registry:"UKC",number:"UKC67890"}],
    titles:[{organization:"AKC",abbreviation:"CGC",placement:"suffix",displayOrder:2},{organization:"AKC",abbreviation:"CH",placement:"prefix",displayOrder:1}]}},
  {id:"s",name:"Father",species:"Dog",sex:"Male",status:"Ancestor Only",canine:{registeredName:"Sire Registered"}},
  {id:"m",name:"Mother",species:"Dog",sex:"Female",status:"Ancestor Only",canine:{registeredName:"Dam Registered"}},
];
test("Canine 3/4 generation documents preserve all registered names and disclaimer",()=>{
  for(const generations of [3,4]){
    const doc=printer.buildDocument({animals:dogs,subjectId:"d",generations,paperSize:"a4",registry:"AKC",...deps});
    assert.equal(doc.generations,generations);
    assert.equal(doc.paperSize,"A4");
    assert.match(doc.html,/CH Autumn Meadow Heritage National Champion/);
    assert.match(doc.html,/Silver Moon Silver Moon/);
    assert.match(doc.html,/CGC/);
    assert.match(doc.html,/AKC AKC12345/);
    assert.match(doc.html,/not an official AKC-certified document/);
    assert.match(doc.html,/Complete canine pedigree details/);
    assert.match(doc.html,/white-space:normal!important/);
    assert.match(doc.html,/size:A4 landscape/);
    assert.doesNotMatch(doc.html,/AKC-logo|AKC\.png|Official AKC Pedigree/);
    assert.match(doc.html,/Unknown/);
  }
});
test("Owner-entered registry and title data stay unchanged; US Letter supported",()=>{
  const original=JSON.stringify(dogs);
  const doc=printer.buildDocument({animals:dogs,subjectId:"d",generations:4,paperSize:"letter",registry:"UKC",...deps});
  assert.match(doc.html,/UKC UKC67890/);
  assert.match(doc.html,/size:letter landscape/);
  assert.equal(JSON.stringify(dogs),original);
});
test("Cross-species lineage blocks print before exporter",()=>{
  const broken=[{...dogs[0],sireId:"rabbit"},...dogs.slice(1),{id:"rabbit",name:"Rabbit",species:"Rabbit",sex:"Male"}];
  assert.throws(()=>printer.buildDocument({animals:broken,subjectId:"d",...deps}),/Fix dog parentage/);
});
test("Rabbit standard print output is unchanged after running canine adapter",()=>{
  const rabbit={id:"r",name:"Holland Lop",species:"Rabbit",sex:"Female",registrationNumber:"ARBA123",prefix:"Bunny Farm"};
  const graph=engine.buildGraph({animals:[rabbit],subjectId:"r",generations:3});
  const options={graph,subject:rabbit,config:{generations:3,rootFields:["name","prefix","registrationNumber"],ancestorFields:["name","prefix"],photos:false,unknownDisplay:"label"},branding:{rabbitryName:"Bunny Farm"},speciesIcon:()=>"•",formatDate:x=>x};
  const before=standard.buildHtml(options);
  printer.buildDocument({animals:dogs,subjectId:"d",...deps});
  const after=standard.buildHtml(options);
  assert.equal(after,before);
  assert.match(after,/BREEDER/);
  assert.doesNotMatch(after,/HerdHarbor breeder-maintained pedigree/);
});
