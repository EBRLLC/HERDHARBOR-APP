"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"..","herdharbor-app-runtime.js"),"utf8");
const start=source.indexOf("  async function stateWithPedigreeAttachments() {");
const end=source.indexOf("  window.HerdHarborAttachments = ",start);
assert.ok(start>0 && end>start,"document-inclusive recovery export must be implemented");
const body=source.slice(start,end);
async function run({pedigree=false,draft=false,found=true,readError=false}={}){
  const initial={
    pedigrees:pedigree?[{id:"p-1",attachmentStored:true,sourceDataUrl:""}]:[],
    pedigreeDrafts:draft?[{id:"d-1",sourceDocument:{attachmentStored:true,dataUrl:""}}]:[]
  };
  const execute=new Function("state","structuredClone","getPedigreeAttachment",`
    ${body}
    return stateWithPedigreeAttachments();
  `);
  return execute(initial,structuredClone,async id=>{
    if(readError)throw Error("IndexedDB unavailable");
    return found?{dataUrl:"data:application/pdf;base64,ZGF0YQ=="}:undefined;
  });
}
test("export fully loads device-only pedigree original",async()=>{
  const state=await run({pedigree:true});
  assert.match(state.pedigrees[0].sourceDataUrl,/^data:application\/pdf/);
});
test("export fully loads device-only pedigree draft",async()=>{
  const state=await run({draft:true});
  assert.match(state.pedigreeDrafts[0].sourceDocument.dataUrl,/^data:application\/pdf/);
});
test("export rejects missing pedigree original instead of silently creating an incomplete backup",async()=>{
  await assert.rejects(run({pedigree:true,found:false}),/missing from this device/);
});
test("export rejects missing pedigree draft instead of silently creating an incomplete backup",async()=>{
  await assert.rejects(run({draft:true,found:false}),/missing from this device/);
});
test("IndexedDB failures block both pedigree and draft backups",async()=>{
  await assert.rejects(run({pedigree:true,readError:true}),/IndexedDB unavailable/);
  await assert.rejects(run({draft:true,readError:true}),/IndexedDB unavailable/);
});
const cloudSource=fs.readFileSync(path.join(__dirname,"..","herdharbor-cloud.js"),"utf8");
test("download safety backup surfaces missing attachments without reporting success",()=>{
  const start=cloudSource.indexOf("  async function downloadSafetyBackup() {");
  const end=cloudSource.indexOf("  //",start+100);
  const portion=cloudSource.slice(start,start+1900);
  assert.match(portion,/try\s*\{[\s\S]*stateWithPedigreeAttachments\(\)/);
  assert.match(portion,/catch \(error\)[\s\S]*return false/);
});
