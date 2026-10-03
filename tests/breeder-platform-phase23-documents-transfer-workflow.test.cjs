"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
require("../herdharbor-pedigree-platform.js");
const docs=require("../herdharbor-document-center.js");
const market=require("../herdharbor-marketplace.js");
const source=fs.readFileSync(path.resolve(__dirname,"..","herdharbor-marketplace.js"),"utf8");

test("Sale Transfer Record and Animal Information Sheet are live shared document types",()=>{
 const live=docs.activeDocumentTypes().map(x=>x.id);
 assert.ok(live.includes("saleTransferRecord"));
 assert.ok(live.includes("animalInformationSheet"));
});

test("sale transfer record supports buyer handoff fields and optional secure QR target",()=>{
 const model=docs.buildSaleTransferRecordModel({
  animal:{name:"Bluebell",breed:"Holland Lop",sex:"Female",dob:"2026-01-01",tattoo:"A1"},
  sellerName:"Hill Farm",buyerName:"Buyer",saleDate:"2026-10-02",saleNumber:"S-100",
  transferId:"T-200",transferMethod:"HerdHarbor Direct",qrTarget:"https://example.test/secure-transfer"
 });
 assert.equal(model.type,"saleTransferRecord");
 assert.match(model.fields.map(x=>x.label).join("|"),/Buyer|Sale date|Sale number|Transfer ID|Transfer method/);
 assert.equal(model.qrTarget,"https://example.test/secure-transfer");
 assert.match(docs.renderRecordDocumentHtml(model),/QR-ready transfer link/);
 assert.match(Buffer.from(docs.buildRecordDocumentPdfBytes(model)).toString("latin1"),/^%PDF-1\.4/);
});

test("animal information sheet excludes private notes unless explicitly requested",()=>{
 const animal={name:"Rabbit",notes:"PRIVATE NOTE",breed:"Holland Lop"};
 const safe=docs.buildAnimalInformationSheetModel({animal});
 assert.equal(safe.notes,"");
 assert.doesNotMatch(docs.renderRecordDocumentHtml(safe),/PRIVATE NOTE/);
 const explicit=docs.buildAnimalInformationSheetModel({animal,includeNotes:true});
 assert.equal(explicit.notes,"PRIVATE NOTE");
});

test("Marketplace transfer bridge reuses completed private sale and existing Direct Transfer UI",()=>{
 const state={sales:[
  {id:"old",status:"Completed",saleDate:"2026-01-01",items:[{animalId:"a1"}]},
  {id:"new",status:"Completed",saleDate:"2026-10-01",items:[{animalId:"a1"}]}
 ]};
 assert.equal(market.findCompletedSaleForAnimal(state,"a1").id,"new");
 assert.match(source,/HerdHarborDirectTransfers\?\.sendSale/);
 assert.doesNotMatch(source,/buildTransferPayload|prepare_accept|complete_accept/);
});

test("Marketplace transfer bridge does not create or mutate private sales itself",()=>{
 const state={sales:[]};
 const before=JSON.stringify(state);
 market.openDirectTransferForListing({source_animal_id:"a1"},state,()=>{});
 assert.equal(JSON.stringify(state),before);
 assert.doesNotMatch(source,/state\.sales\.push|commitState|saveState/);
});

test("manual listings do not pretend to have a direct private-animal transfer link",()=>{
 let message="";
 const result=market.openDirectTransferForListing({source_animal_id:null},{sales:[]},(m)=>{message=m;});
 assert.equal(result,false);
 assert.match(message,/not linked to a private herd animal/);
});
