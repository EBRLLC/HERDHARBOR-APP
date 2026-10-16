"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const Photo=require("../photo-assisted-entry-v1.8.3.js");
const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");

test("both image endpoints reject missing explicit consent before image checks or quota",()=>{
  for(const name of ["paper-pedigree-extract","record-photo-extract"]){
    const source=read("supabase/functions/"+name+"/index.ts");
    const gate=source.indexOf("decideAiAccess(");
    const parsed=source.indexOf("req.json()");
    const consent=source.indexOf('body?.aiOptIn !== true');
    const media=source.indexOf('const mimeType = clean(body?.mimeType');
    const quota=source.indexOf('herdharbor_reserve_ai_image_request');
    assert.ok(gate>=0&&parsed>gate&&consent>parsed&&media>consent&&quota>media,name);
    assert.match(source,/consent_required/);
    assert.match(source,/Manual entry remains available/);
  }
});
test("paper AI requires opt-in before any image preparation, resets it per file and sends consent",()=>{
  const file=read("paper-pedigree-import-v1.8.2.js");
  assert.match(file,/data-pp-ai-optin/);
  const consentCheck=file.indexOf("if (!isOptedIn())");
  const prepare=file.indexOf("const image = await prepareImage(attempt.file)");
  const preDispatch=file.indexOf("if (!isCurrentAttempt(attempt)) return false;",prepare);
  assert.ok(consentCheck>=0&&prepare>consentCheck&&preDispatch>prepare,
    "consent must precede image preparation and be rechecked before upload");
  assert.match(file,/aiOptIn: true/);
  assert.match(file,/if \(optIn\) optIn.checked = false/);
  assert.match(file,/I choose to send this rabbit pedigree image/);
});
test("photo UI denies upload without consent, forwards opted-in flag and revokes queued uploads",async()=>{
  const originalDocument=globalThis.document;
  const originalCloud=globalThis.HerdHarborCloud;
  const originalCapture=globalThis.HerdHarborMobileCapture;
  const nodes=new Map(),toasts=[],uploads=[];
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{id,checked:false,listeners:{},dataset:{},
      textContent:"",innerHTML:"",value:"",files:[],classList:{toggle(){}},
      addEventListener(name,listener){this.listeners[name]=listener;}});
    return nodes.get(id);
  };
  let cleared=0,prepared=0,modalHtml="";
  try {
    globalThis.document={getElementById:id=>node(id),addEventListener(){}};
    globalThis.HerdHarborCloud={getSession:()=>({user:{id:"test-user"}})};
    globalThis.HerdHarborMobileCapture={
      prepareImage:async()=>{prepared++;return {dataUrl:"data:image/png;base64,aA==",mimeType:"image/png",fileName:"vet.png"};},
      createRetryController:()=>({
        run:async payload=>{uploads.push(payload);return {queued:true};},
        clear:()=>{cleared++;},
        getState:()=>({pending:false}),
        resume:async()=>false
      })
    };
    const api=Photo.create({getState:()=>({animals:[]}),
      openModal:(_title,html)=>{modalHtml=html;},closeModal(){},
      openAnimalForm(){},openHealthForm(){},esc:String,
      toast:msg=>toasts.push(msg)});
    assert.equal(api.open(),true);
    assert.match(modalHtml,/photo-entry-consent/);
    node("photo-entry-file").listeners.change({target:{files:[{type:"image/png",name:"vet.png"}]}});
    assert.equal(await api.analyze(),false);
    assert.equal(prepared,0);
    assert.equal(uploads.length,0);
    assert.match(toasts[0],/Choose to send/);
    node("photo-entry-consent").checked=true;
    const result=await api.analyze();
    assert.equal(result.queued,true);
    assert.equal(uploads.length,1);
    assert.equal(uploads[0].aiOptIn,true);
    node("photo-entry-consent").checked=false;
    node("photo-entry-consent").listeners.change({currentTarget:node("photo-entry-consent")});
    assert.ok(cleared>=1,"revoking consent clears queued retries");
  } finally {
    if(originalDocument===undefined) delete globalThis.document; else globalThis.document=originalDocument;
    if(originalCloud===undefined) delete globalThis.HerdHarborCloud; else globalThis.HerdHarborCloud=originalCloud;
    if(originalCapture===undefined) delete globalThis.HerdHarborMobileCapture; else globalThis.HerdHarborMobileCapture=originalCapture;
  }
});
