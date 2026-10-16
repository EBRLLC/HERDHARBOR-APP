"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const src=n=>fs.readFileSync(path.join(__dirname,"..",n),"utf8");
const paper=src("paper-pedigree-import-v1.8.2.js"),appText=src("herdharbor-app-runtime.js"),photo=src("photo-assisted-entry-v1.8.3.js");
async function flush(){for(let i=0;i<12;i++)await Promise.resolve();}
function commitApp(initial,saveState){
 const a=appText.indexOf('    commitState: (next, message = "") => {');
 const b=appText.indexOf('\n    refresh: () =>',a);
 assert.ok(a>=0&&b>a);
 const method=appText.slice(a,b).trim().replace(/,\s*$/,"");
 return new Function("initial","saveState","let state=initial;const app={"+method+"};return {app,get:()=>state};")(initial,saveState);
}
function fixture(options={}){
 let user="A",dialog=null;
 const nodes=new Map(),events={},readers=[],sent=[],attachments=new Map();
 const node=key=>{
  if(!nodes.has(key))nodes.set(key,{
   checked:false,disabled:false,innerHTML:"",textContent:"",dataset:{},value:"",
   addEventListener(t,fn){this["on_"+t]=fn;},querySelectorAll:()=>[]
  });
  return nodes.get(key);
 };
 const makeDialog=()=>({
  open:false,innerHTML:"",
  addEventListener(t,fn){this["on_"+t]=fn;},
  querySelector:node,querySelectorAll:q=>q==="[data-pp-close]"?[node("[data-pp-close]")]:[],
  showModal(){this.open=true;},close(){this.open=false;this.on_close?.();}
 });
 const doc={
  readyState:"loading",documentElement:{},head:{appendChild(){}},body:{appendChild(d){dialog=d;}},
  createElement:makeDialog,
  getElementById:id=>id==="hh-paper-pedigree-style"?{}:id==="hh-paper-pedigree-dialog"?dialog:null,
  querySelector:q=>q.startsWith("#hh-paper-pedigree-dialog ")?node(q.slice("#hh-paper-pedigree-dialog ".length)):null,
  querySelectorAll:()=>[],
  addEventListener(t,fn){events[t]=fn;}
 };
 class Reader{
  readAsDataURL(file){readers.push(()=>{this.result="data:image/jpeg;base64,YQ==";this.onload?.();});}
 }
 class ImageStub{
  constructor(){this.naturalWidth=100;this.naturalHeight=100;}
  set src(_){this.onload?.();}
 }
 const indexedDB={open(){
  const request={result:{
   objectStoreNames:{contains:()=>true},createObjectStore(){},close(){},
   transaction(){return {objectStore(){return {
    put(value,id){const req={};queueMicrotask(()=>{attachments.set(id,value);req.onsuccess?.();});return req;},
    delete(id){const req={};queueMicrotask(()=>{attachments.delete(id);req.onsuccess?.();});return req;}
   };}};}
  }};
  queueMicrotask(()=>request.onsuccess?.());return request;
 }};
 const initial={animals:[{id:"existing",species:"Rabbit"}],pedigrees:[]};
 const state=commitApp(initial,options.save||(()=>true));
 const root={
  document:doc,indexedDB,setTimeout:fn=>fn(),
  HerdHarborCloud:{
   getSession:()=>({user:{id:user}}),
   invokeFunctionWithDiagnostics:async(name,payload)=>{
    sent.push({name,user,payload});
    if(options.service)return options.service(name,payload);
    return {extraction:{extractionId:"test",nodes:[{role:"subject",name:"New Rabbit",species:"Rabbit",present:true}],warnings:[]}};
   }
  },
  HerdHarborApp:{getState:state.get,commitState:state.app.commitState},
  HerdHarborPaperPedigreeImportCore:{
   ROLE_PATHS:[{role:"subject",generation:0}],
   normalizeExtraction:()=>({nodes:[{role:"subject",name:"New Rabbit",present:true}],warnings:[]}),
   buildImportPlan:()=>({canCommit:true,conflicts:[],actions:[]}),
   applyImportPlan:input=>{
    const copy=structuredClone(input);
    copy.animals.push({id:"newrabbit",species:"Rabbit",name:"New Rabbit"});
    return {state:copy,subjectAnimalId:"newrabbit"};
   }
  }
 };
 new Function("globalThis","FileReader","Image",paper)(root,Reader,ImageStub);
 async function select(name){
  const promise=node("[data-pp-file]").on_change({target:{files:[{name,type:"image/jpeg",size:10}]}});
  await flush();
  const release=readers.shift();assert.ok(release,"preview read scheduled");release();await promise;
 }
 function optIn(v){
  const el=node("[data-pp-ai-optin]");el.checked=v;el.on_change?.({currentTarget:el});
 }
 async function finishRead(){
  const release=readers.shift();assert.ok(release,"reader scheduled");release();await flush();
 }
 return{
  root,nodes,events,readers,sent,attachments,state:state.get,dialog:()=>dialog,node,
  open:()=>root.HerdHarborPaperPedigreeImport.open(),select,optIn,finishRead,
  read:()=>node("[data-pp-read]").on_click(),
  switchUser:id=>{user=id;events["herdharbor:auth-session"]?.({detail:{signedIn:true}});},
  confirm:()=>{node("[data-pp-confirm-review]").checked=true;node("[data-pp-confirm-review]").on_change?.();return node("[data-pp-commit]").on_click();}
 };
}
test("shared commitState restores old state after false or thrown durable commit",()=>{
 const old={animals:[{id:"old"}]},next={animals:[{id:"new"}]};
 for(const saver of [()=>false,()=>{throw Error("storage failed");}]){
  const x=commitApp(old,saver);
  assert.equal(x.app.commitState(next,"write"),false);assert.equal(x.get(),old);
 }
 const pass=commitApp(old,()=>true);assert.equal(pass.app.commitState(next,"write"),true);assert.equal(pass.get(),next);
});
test("consent withdrawal during paper photo preparation stops the transmission",async()=>{
 const x=fixture();x.open();await x.select("A.jpg");x.optIn(true);
 const pending=x.read();x.optIn(false);await x.finishRead();
 assert.equal(await pending,false);assert.equal(x.sent.length,0);
});
test("switching A to B and back to A invalidates the pending paper photo",async()=>{
 const x=fixture();x.open();await x.select("A.jpg");x.optIn(true);
 const pending=x.read();x.switchUser("B");x.switchUser("A");await x.finishRead();
 assert.equal(await pending,false);assert.equal(x.sent.length,0);
});
test("replacing the selected file prevents an older provider response from appearing",async()=>{
 let resolve;
 const x=fixture({service:()=>new Promise(r=>resolve=r)});
 x.open();await x.select("A.jpg");x.optIn(true);
 const pending=x.read();await x.finishRead();assert.equal(x.sent.length,1);
 await x.select("B.jpg");
 resolve({extraction:{nodes:[{role:"subject",species:"Rabbit",name:"OLD"}]}});
 assert.equal(await pending,false);
 assert.equal(x.node("[data-pp-review]").innerHTML,"");
});
test("closing the dialog prevents a stale provider response from rendering",async()=>{
 let resolve;
 const x=fixture({service:()=>new Promise(r=>resolve=r)});
 x.open();await x.select("A.jpg");x.optIn(true);
 const pending=x.read();await x.finishRead();
 x.dialog().close();
 resolve({extraction:{nodes:[{role:"subject",name:"OLD"}]}});
 assert.equal(await pending,false);assert.equal(x.node("[data-pp-review]").innerHTML,"");
});
test("failed reviewed import restores active farm data and deletes orphan attachment",async()=>{
 const x=fixture({save:()=>false});x.open();await x.select("A.jpg");x.optIn(true);
 const reading=x.read();await x.finishRead();assert.equal(await reading,true);
 const previous=x.state();assert.equal(await x.confirm(),false);
 assert.equal(x.state(),previous);assert.equal(x.attachments.size,0);assert.equal(x.dialog().open,true);
});
test("review commit verifies account and live state AFTER attachment write, before commit",()=>{
 const write=paper.indexOf("await putPedigreeAttachment(record.id, file);");
 const guard=paper.indexOf("if (!isCurrentAttempt(attempt) || reviewedAttempt !== attempt || app()?.getState?.() !== current)");
 const commit=paper.indexOf('const saved = app().commitState(applied.state, "Paper pedigree imported.");');
 assert.ok(write>0&&guard>write&&commit>guard);
});
test("record-photo auth boundary always invalidates pre-prepared work",()=>{
 assert.match(photo,/root\.document\?\.addEventListener\?\.\("herdharbor:auth-session"/);
 assert.match(photo,/if \(!photoDialogActive\) return;\s*invalidatePhotoWork\(\)/);
});
