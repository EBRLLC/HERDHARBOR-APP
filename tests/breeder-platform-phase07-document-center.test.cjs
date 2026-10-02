"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
require("../herdharbor-pedigree-platform.js");
const docs=require("../herdharbor-document-center.js");
const root=path.resolve(__dirname,"..");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const runtime=fs.readFileSync(path.join(root,"herdharbor-app-runtime.js"),"utf8");

test("Document Center registry preserves initial types as later reserved types go live",()=>{
 const active=docs.activeDocumentTypes().map(x=>x.id);
 for(const id of ["pedigree","birthCertificate","saleTransferRecord","animalInformationSheet"])assert.ok(active.includes(id),id);
 assert.deepEqual(docs.futureDocumentTypes().map(x=>x.id),["healthSummary","breedingRecord","litterRecord"]);
});

test("Documents is a canonical app route with a real view container",()=>{
 assert.match(html,/data-route="documents"/);
 assert.match(html,/id="view-documents"/);
 assert.match(runtime,/documents: "Animal documents"/);
 assert.match(runtime,/documents: \(\) => window\.HerdHarborDocumentCenter\?\.renderHub/);
});

test("document hub exports both Pedigree and Birth Certificate actions from one renderer",()=>{
 const source=fs.readFileSync(path.join(root,"herdharbor-document-center.js"),"utf8");
 assert.match(source,/hh-document-pedigree-preview/);
 assert.match(source,/hh-document-birth-preview/);
 assert.match(source,/buildPedigreeLayout/);
 assert.match(source,/buildBirthCertificateModel/);
});
