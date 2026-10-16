"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const lineage=require("../canine-lineage-v2.0.1.js");
const automation=require("../task-automation-v1.8.3.js");
const tasks=require("../task-runtime-v1.8.3.js");

function runtime(state) {
  let saves=0;
  const noop=()=>{};
  const text=()=> "";
  const api=tasks.create({
    getState:()=>state,getCurrentRoute:()=> "tasks",$:()=>null,$$:()=>[],
    esc:String,headerHtml:text,statCard:text,emptyState:text,
    animalName:id=>state.animals.find(x=>x.id===id)?.name||"Unknown",
    formatDate:String,daysFromNow:()=>0,scheduleUiWork:noop,
    openModal:noop,closeModal:noop,field:text,selectField:text,
    selectAnimalField:text,textareaField:text,todayISO:()=> "2026-10-16",
    addDays:noop,uid:()=> "id",recordActivity:noop,saveState:()=>{saves++;return true;},
    renderCurrentView:noop
  });
  return {api,getSaves:()=>saves};
}
const when="2026-10-16T12:00:00.000Z";

test("editing legacy unknown-sex rabbit sire's name does not corrupt or block the parent",()=>{
  const records=[{id:"s",species:"Rabbit",sex:"Unknown",name:"Old name"},
    {id:"kit",species:"Rabbit",sex:"Female",sireId:"s"}];
  const changed={...records[0],name:"New name"};
  assert.deepEqual(lineage.validateMutation(records,changed),{valid:true,issues:[]});
  assert.equal(records[0].name,"Old name");
  assert.equal(records[1].sireId,"s");
});
test("editing legacy unknown-sex goat dam status does not enforce dog sex requirements",()=>{
  const records=[{id:"g",species:"Goat",sex:"Unknown",name:"Doe"},{id:"kid",species:"Goat",damId:"g"}];
  assert.equal(lineage.validateMutation(records,{...records[0],status:"Sold"}).valid,true);
});
test("parent sex changes remain protected and dependent canine links still reject mismatches",()=>{
  const rabbit=[{id:"s",species:"Rabbit",sex:"Male"},{id:"kit",species:"Rabbit",sireId:"s"}];
  assert.equal(lineage.validateMutation(rabbit,{...rabbit[0],sex:"Female"}).valid,false);
  const dogs=[{id:"s",species:"Dog",sex:"Male"},{id:"p",species:"Dog",sex:"Female",sireId:"s"}];
  assert.equal(lineage.validateMutation(dogs,{...dogs[0],sex:"Female"}).valid,false);
  assert.equal(lineage.validateMutation(dogs,{...dogs[0],species:"Rabbit"}).valid,false);
});
test("existing incomplete canine records can be renamed without mutating parent links",()=>{
  const animals=[{id:"s",species:"Dog",sex:"Unknown",name:"Old Sire"},
    {id:"p",species:"Dog",sex:"Female",sireId:"s"}];
  assert.equal(lineage.validateMutation(animals,{...animals[0],name:"Corrected Sire Name"}).valid,true);
  assert.equal(lineage.validateMutation(animals,{...animals[0],sex:"Male"}).valid,true);
});
test("legacy completed dog reminder remains completed when title gains Dog label",()=>{
  const old={animals:[{id:"d",name:"Molly",species:"Rabbit"}],
    breedings:[],litters:[],health:[{id:"h1",animalId:"d",type:"Medication",followUpDate:"2026-10-20"}],tasks:[]};
  const original=automation.deriveTaskDefinitions(old)[0];
  const task={...original,completed:true,completedAt:"2026-10-15T12:00:00.000Z",
    automationManaged:true,automationFingerprint:JSON.stringify([
      original.title,original.category,original.dueDate,original.animalId,
      original.sourceType,original.sourceRecordId,original.reminderType,
      original.recurrence,original.recurrenceDays
    ])};
  const state={...old,animals:[{id:"d",name:"Molly",species:"Dog"}],tasks:[task]};
  const {api}=runtime(state);
  const result=api.syncDerivedAutomation(when,{persist:false});
  assert.equal(result.reopened,0);
  assert.equal(task.completed,true);
  assert.equal(task.completedAt,"2026-10-15T12:00:00.000Z");
  assert.match(task.title,/\(Dog\)/);
  assert.equal(api.syncDerivedAutomation(when,{persist:false}).changed,false,"reconciliation is idempotent");
});
test("real source due-date changes can still reopen a completed non-recurring reminder",()=>{
  const state={animals:[{id:"r",name:"Clover",species:"Rabbit"}],health:[
    {id:"h",animalId:"r",type:"Vaccination",followUpDate:"2026-10-20"}
  ],breedings:[],litters:[],tasks:[]};
  const {api}=runtime(state);
  api.syncDerivedAutomation(when,{persist:false});
  const task=state.tasks[0];
  task.completed=true;
  task.completedAt=when;
  state.health[0].followUpDate="2026-11-22";
  const result=api.syncDerivedAutomation(when,{persist:false});
  assert.equal(result.reopened,1);
  assert.equal(task.completed,false);
  assert.equal(task.dueDate,"2026-11-22");
});
test("animal display-name change does not reopen completed reminders",()=>{
  const state={animals:[{id:"r",name:"Old",species:"Rabbit"}],health:[
    {id:"h",animalId:"r",type:"Medication",followUpDate:"2026-10-20"}
  ],breedings:[],litters:[],tasks:[]};
  const {api}=runtime(state);
  api.syncDerivedAutomation(when,{persist:false});
  state.tasks[0].completed=true;
  state.tasks[0].completedAt=when;
  state.animals[0].name="New";
  const result=api.syncDerivedAutomation(when,{persist:false});
  assert.equal(result.reopened,0);
  assert.equal(state.tasks[0].completed,true);
  assert.match(state.tasks[0].title,/New/);
});
test("shared print function routes Dog to canine adapter, and fails closed without it",()=>{
  const code=fs.readFileSync(path.join(__dirname,"../herdharbor-app-runtime.js"),"utf8");
  const start=code.indexOf("  function openPrintPedigreeForm(animalId) {");
  const stop=code.indexOf("    const customization = window.HerdHarborPedigreeCustomization;",start);
  assert.ok(start>=0&&stop>start,"shared printer has species routing before legacy UI");
  const isolated=code.slice(start,stop)+"    return 'legacy-rabbit-flow';\n  }\n";
  const make=(animals,window,toasts)=>new Function("state","window","toast",isolated+"return openPrintPedigreeForm;")(
    {animals},window,(msg)=>toasts.push(msg));
  const animals=[{id:"d",name:"Dog",species:"Dog"},{id:"r",name:"Rabbit",species:"Rabbit"}];
  const invoked=[],toasts=[];
  const fn=make(animals,{HerdHarborCanineIdentity:{isDog:a=>a.species==="Dog"},
    HerdHarborCaninePedigreePrint:{openForAnimal:id=>{invoked.push(id);return true;}}},toasts);
  assert.equal(fn("d"),true);
  assert.deepEqual(invoked,["d"]);
  assert.equal(fn("r"),"legacy-rabbit-flow");
  const noPrinter=make(animals,{HerdHarborCanineIdentity:{isDog:a=>a.species==="Dog"}},toasts);
  assert.equal(noPrinter("d"),false);
  assert.match(toasts[0],/unavailable/);
  assert.match(code,/data-print-pedigree[\s\S]*?openPrintPedigreeForm\(printButton\.dataset\.printPedigree\)/);
  assert.match(code,/print-pedigree-record[\s\S]*?openPrintPedigreeForm\(record\.subjectAnimalId\)/);
});
