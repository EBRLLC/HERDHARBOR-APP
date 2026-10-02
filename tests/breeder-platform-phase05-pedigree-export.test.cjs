"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const pedigree=require("../herdharbor-pedigree-platform.js");
const docs=require("../herdharbor-document-center.js");

const animals=[
 {id:"r",name:"A Very Long Root Animal Name That Must Not Break A Printed Pedigree",sireId:"s",damId:"d",sex:"Female",breed:"Holland Lop",color:"Black"},
 {id:"s",name:"Sire",sex:"Male",registrationNumber:"S-1"},
 {id:"d",name:"Dam",sex:"Female",registrationNumber:"D-1"}
];
const graph=pedigree.buildPedigreeGraph({animals,rootId:"r",generations:3});

test("pedigree export layout has deterministic page dimensions and card positions",()=>{
 const a=docs.buildPedigreeLayout(graph,{pageSize:"letter",orientation:"landscape",generatedAt:"2026-10-02T00:00:00Z",config:{generations:3}});
 const b=docs.buildPedigreeLayout(graph,{pageSize:"letter",orientation:"landscape",generatedAt:"2026-10-02T00:00:00Z",config:{generations:3}});
 assert.equal(a.geometry.width,792);
 assert.equal(a.geometry.height,612);
 assert.deepEqual(a.cards,b.cards);
});

test("printer-friendly output is a fixed-page document independent of app print CSS",()=>{
 const model=docs.buildPedigreeLayout(graph,{pageSize:"a4",orientation:"portrait",branding:{rabbitryName:"Hill Farm"}});
 const html=docs.renderDocumentHtml(model);
 assert.match(html,/@page\{size:/);
 assert.match(html,/Hill Farm/);
 assert.match(html,/position:absolute/);
});

test("PDF generation emits a standalone PDF with the requested media box",()=>{
 const model=docs.buildPedigreeLayout(graph,{pageSize:"letter",orientation:"landscape",generatedAt:"fixed",config:{generations:3}});
 const bytes=docs.buildPdfBytes(model);
 const text=Buffer.from(bytes).toString("latin1");
 assert.match(text,/^%PDF-1\.4/);
 assert.match(text,/\/MediaBox \[0 0 792\.00 612\.00\]/);
 assert.match(text,/A Very Long Root Animal Name/);
 assert.match(text,/%%EOF/);
});

test("missing photos and missing ancestors do not break export",()=>{
 const sparse=pedigree.buildPedigreeGraph({animals:[{id:"only",name:"Only"}],rootId:"only",generations:5});
 const model=docs.buildPedigreeLayout(sparse,{config:{generations:5,photos:true}});
 assert.doesNotThrow(()=>docs.buildPdfBytes(model));
 assert.match(docs.renderDocumentHtml(model),/Unknown ancestor/);
});
