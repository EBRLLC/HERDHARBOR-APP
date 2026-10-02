"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
require("../herdharbor-pedigree-platform.js");
const docs=require("../herdharbor-document-center.js");

test("birth certificate uses the shared document engine and expected animal fields",()=>{
 const model=docs.buildBirthCertificateModel({
   generatedAt:"fixed",
   animal:{name:"Bluebell",dob:"2026-09-01",sex:"Female",breed:"Holland Lop",color:"Blue",tattoo:"A12",birthWeight:"2 oz"},
   sireName:"Sire One",
   damName:"Dam One",
   goHomeDate:"2026-11-01",
   newOwnerName:"Buyer",
   breederName:"Hill Farm"
 });
 assert.equal(model.type,"birthCertificate");
 assert.match(model.fields.map(x=>x.label).join("|"),/Date of birth|Sire|Dam|Go-home date|New owner/);
 assert.equal(model.breederName,"Hill Farm");
});

test("birth certificate contact fields are off by default",()=>{
 const model=docs.buildBirthCertificateModel({
   animal:{name:"Rabbit"},
   branding:{email:"private@example.test",phone:"PRIVATE_PHONE",website:"example.test"}
 });
 const html=docs.renderBirthCertificateHtml(model);
 assert.equal(model.contact.email,"");
 assert.equal(model.contact.phone,"");
 assert.doesNotMatch(html,/private@example\.test|PRIVATE_PHONE/);
 assert.match(html,/example\.test/);
});

test("private birth certificate can deliberately include contact data",()=>{
 const model=docs.buildBirthCertificateModel({
   animal:{name:"Rabbit"},
   branding:{email:"owner@example.test",phone:"5550100",includeEmail:true,includePhone:true}
 });
 assert.equal(model.contact.email,"owner@example.test");
 assert.equal(model.contact.phone,"5550100");
});

test("birth certificate PDF and printable preview survive optional missing data and long names",()=>{
 const model=docs.buildBirthCertificateModel({
   generatedAt:"fixed",
   animal:{name:"Rabbit With A Very Long Registered Name That Should Still Render Cleanly"},
   qrTarget:"https://example.test/transfer/token"
 });
 const html=docs.renderBirthCertificateHtml(model);
 const pdf=docs.buildBirthCertificatePdfBytes(model);
 assert.match(html,/Birth Certificate/);
 assert.match(html,/QR-ready transfer/);
 assert.match(Buffer.from(pdf).toString("latin1"),/^%PDF-1\.4/);
 assert.doesNotThrow(()=>docs.birthCertificatePreview({animal:{name:"Sparse"}}));
});
