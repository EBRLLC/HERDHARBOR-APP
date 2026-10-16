"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const source=name=>fs.readFileSync(path.join(root,name),"utf8");
const load=(file,rootObject)=>{
  const mod={exports:{}};
  new Function("module","exports","globalThis",source(file))(mod,mod.exports,rootObject);
  return mod.exports;
};
const lineage=require("../canine-lineage-v2.0.1.js");

function photoFixture({online=true,prepareImage,send}={}){
  const elems=new Map(),listeners={},notices=[],requests=[];
  let user="account-A",connected=online,reviewHtml="";
  const element=(id)=>{
    if(!elems.has(id))elems.set(id,{
      checked:false,disabled:false,dataset:{},innerHTML:"",textContent:"",files:[],value:"",
      classList:{toggle(){}},
      addEventListener(event,fn){this["on_"+event]=fn;}
    });
    return elems.get(id);
  };
  const scope={
    document:{getElementById:element,visibilityState:"visible",addEventListener(event,fn){listeners["document:"+event]=fn;}},
    navigator:{get onLine(){return connected;}},
    addEventListener(event,fn){listeners[event]=fn;}
  };
  const mobile=load("mobile-capture-v1.8.3.js",scope);
  scope.HerdHarborMobileCapture={...mobile,
    prepareImage:prepareImage||((file)=>Promise.resolve({
      dataUrl:"data:image/png;base64,aA==",mimeType:"image/png",fileName:file.name}))};
  scope.HerdHarborCloud={
    getSession:()=>({user:{id:user}}),
    invokeFunctionWithDiagnostics:async (name,payload)=>{
      requests.push({user,name,payload});
      if(send)return send(name,payload);
      return {draft:{documentType:"unknown",warnings:["returned draft"]}};
    }
  };
  const api=load("photo-assisted-entry-v1.8.3.js",scope).create({
    getState:()=>({animals:[]}),openModal(){},closeModal(){},
    openAnimalForm(){},openHealthForm(){},esc:String,toast:msg=>notices.push(msg)
  });
  const choose=(fileName)=>{
    element("photo-entry-file").on_change({target:{files:[{name:fileName,type:"image/png"}]}});
  };
  const consent=(yes)=>{
    element("photo-entry-consent").checked=yes;
    element("photo-entry-consent").on_change?.({currentTarget:element("photo-entry-consent")});
  };
  return {api,element,choose,consent,notices,requests,scope,listeners,
    setOnline:v=>{connected=v;},setUser:v=>{user=v;}};
}
async function flush(times=12){for(let i=0;i<times;i++)await Promise.resolve();}

test("withdrawing consent during async image preparation stops the actual provider dispatch",async()=>{
  let finish;
  const f=photoFixture({prepareImage:()=>new Promise(resolve=>finish=()=>resolve({
    dataUrl:"data:image/png;base64,aA==",mimeType:"image/png",fileName:"doc.png"}))});
  f.api.open();f.choose("doc.png");f.consent(true);
  const pending=f.api.analyze();
  f.consent(false);finish();
  assert.equal(await pending,false);
  assert.equal(f.requests.length,0);
  assert.equal(f.element("photo-entry-analyze").disabled,false);
});

test("offline photo originating under A never uploads using B's session",async()=>{
  const f=photoFixture({online:false});
  f.api.open();f.choose("account-A-private.png");f.consent(true);
  assert.equal((await f.api.analyze()).queued,true);
  f.setUser("account-B");f.setOnline(true);
  await f.listeners.online();await flush();
  assert.equal(f.requests.length,0);
  assert.equal(f.element("photo-entry-analyze").disabled,false);
});

test("session boundary invalidates pending image before reconnect even if user switches back",async()=>{
  const f=photoFixture({online:false});
  f.api.open();f.choose("from-A.png");f.consent(true);
  await f.api.analyze();
  f.setUser("account-B");
  f.listeners["document:herdharbor:auth-session"]({detail:{signedIn:true}});
  f.setUser("account-A");f.setOnline(true);
  await f.listeners.online();await flush();
  assert.equal(f.requests.length,0);
});

test("replacing Photo A while provider is in flight never renders A's response as Photo B",async()=>{
  let complete;
  const f=photoFixture({send:()=>new Promise(resolve=>complete=resolve)});
  f.api.open();f.choose("a.png");f.consent(true);
  const pending=f.api.analyze();await flush();
  assert.equal(typeof complete,"function");
  f.choose("b.png");
  complete({draft:{documentType:"unknown",warnings:["Photo A"]}});
  assert.equal(await pending,false);
  assert.equal(f.element("photo-entry-review").innerHTML,"");
  assert.equal(f.requests.length,1,"an already dispatched call cannot be recalled");
  assert.equal(f.requests[0].payload.__hhAttempt,undefined,"client metadata is never transmitted");
});

test("closing photo modal makes in-flight result unusable",async()=>{
  let complete;
  const f=photoFixture({send:()=>new Promise(resolve=>complete=resolve)});
  f.api.open();f.choose("a.png");f.consent(true);
  const pending=f.api.analyze();await flush();
  f.element("photo-entry-cancel").on_click();
  complete({draft:{documentType:"unknown",warnings:["Stale"]}});
  assert.equal(await pending,false);
  assert.equal(f.element("photo-entry-review").innerHTML,"");
});

test("animal deletion blocks litter, draft, saved ancestor, medical, task and breeding dependencies",()=>{
  const animals=[{id:"a",name:"Dam",species:"Rabbit"}];
  const cases=[
    {litters:[{id:"l",damId:"a"}]},
    {pedigrees:[{id:"p",subjectAnimalId:"unrelated",ancestorIds:{parent:"a"}}]},
    {pedigreeDrafts:[{id:"pd",ancestorIds:{dam:"a"}}]},
    {health:[{id:"h",animalId:"a"}]},
    {tasks:[{id:"t",animalId:"a",completed:true}]},
    {breedings:[{id:"b",femaleId:"a"}]},
    {sales:[{id:"s",items:[{animalId:"a"}]}]}
  ];
  for(const state of cases){
    const result=lineage.validateDeletion(animals,"a",state);
    assert.equal(result.valid,false,JSON.stringify(state));
    assert.ok(result.issues.length>=2);
  }
  assert.equal(lineage.validateDeletion(animals,"a",{}).valid,true);
});

function deletionClick(state,saveOk){
  const content=source("animal-profile-runtime-v1.8.3.js");
  const start=content.indexOf('      $("#delete-animal")?.addEventListener("click", () => {');
  const end=content.indexOf("      return true;\n    }\n\n    function pedigreeRecordPreviewHtml",start);
  assert.ok(start>=0&&end>start,"deletion handler was found");
  let handler,closed=0,saved=0;const messages=[];
  const deps={
    toast:message=>messages.push(message),
    recordActivity:(message)=>{state.activity.unshift({text:message});state.activity=state.activity.slice(0,30);},
    saveState:()=>{saved++;return saveOk;},
    closeModal:()=>{closed++;},
    renderCurrentView:()=>{}
  };
  const $=()=>({addEventListener:(_,fn)=>handler=fn});
  new Function("$","stateNow","id","deps","canineLineage","root",
    content.slice(start,end))($,()=>state,"a",deps,lineage,{confirm:()=>true});
  handler();
  return {closed,saved,messages};
}

test("failed durable delete restores animal AND activity and keeps modal open",()=>{
  const state={animals:[{id:"a",species:"Rabbit",name:"Clover"}],activity:[{id:"old",text:"Previous note"}]};
  const before=structuredClone(state);
  const result=deletionClick(state,false);
  assert.deepEqual(state,before);
  assert.equal(result.closed,0);
  assert.equal(result.saved,1);
});
test("linked litter cannot be deleted even after confirmation; unlinked animal deletes on successful save",()=>{
  const linked={animals:[{id:"a",species:"Rabbit",name:"Clover"}],activity:[],litters:[{id:"l",damId:"a"}]};
  const no=deletionClick(linked,true);
  assert.equal(no.saved,0);
  assert.equal(linked.animals.length,1);
  const free={animals:[{id:"a",species:"Rabbit",name:"Clover"}],activity:[]};
  const yes=deletionClick(free,true);
  assert.equal(yes.closed,1);
  assert.equal(yes.saved,1);
  assert.equal(free.animals.length,0);
});
