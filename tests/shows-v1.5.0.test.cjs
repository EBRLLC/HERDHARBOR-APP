"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const Shows=require("../shows-v1.5.0.js");

const state=Shows.normalizeState({
  animals:[
    {id:"a1",name:"Annie",species:"Rabbit",breed:"Holland Lop",sex:"Female",color:"Black Self VC",status:"Archived"},
    {id:"a2",name:"Buck",species:"Rabbit",breed:"Holland Lop",sex:"Male",color:"Blue"}
  ],
  health:[
    {id:"h1",animalId:"a1",type:"Weight",date:"2026-01-01",weight:"4.0",weightUnit:"lb"},
    {id:"h2",animalId:"a1",type:"Weight",date:"2026-02-10",weight:"5.2",weightUnit:"lb"}
  ],
  transactions:[
    {id:"t1",date:"2026-06-01",type:"Expense",classification:"Operating",category:"Entry Fee",amount:"25.00",showId:"s1",animalId:"a1"},
    {id:"t2",date:"2026-06-02",type:"Income",classification:"",category:"Premium",amount:"75.00",showId:"s1",animalId:"a1"},
    {id:"t3",date:"2026-06-03",type:"Expense",classification:"Operating",category:"Project Supplies",amount:"10.00",projectId:"p1",animalId:"a1"}
  ],
  shows:[{id:"s1",name:"County Fair",startDate:"2026-06-01",showType:"County Fair",status:"Active",organization:"County Extension"}],
  exhibitors:[{id:"e1",firstName:"Sam",lastName:"Breeder",status:"Active"}],
  showEntries:[
    {id:"en1",showId:"s1",exhibitorId:"e1",animalId:"a1",className:"Senior Doe",projectId:"p1"},
    {id:"en2",showId:"s1",exhibitorId:"e1",animalId:"a1",className:"Breed Class",projectId:"p1"}
  ],
  showResults:[
    {id:"r1",entryId:"en1",placement:"1st"},
    {id:"r2",entryId:"en2",placement:"Custom",customPlacement:"Best of Breed"}
  ],
  showAwards:[
    {id:"aw1",entryId:"en1",resultId:"r1",showId:"s1",animalId:"a1",exhibitorId:"e1",awardType:"Class Winner"},
    {id:"aw2",entryId:"en2",resultId:"r2",showId:"s1",animalId:"a1",exhibitorId:"e1",awardType:"Best of Breed"},
    {id:"aw3",entryId:"en2",resultId:"r2",showId:"s1",animalId:"a1",exhibitorId:"e1",awardType:"Grand Champion"}
  ],
  showProjects:[{id:"p1",projectName:"2026 Rabbit Project",year:"2026",exhibitorId:"e1",animalId:"a1",projectType:"Rabbit",status:"Active",startDate:"2026-01-01"}],
  projectGoals:[{id:"g1",projectId:"p1",goal:"Attend county fair",status:"Completed",targetDate:"2026-06-01"}],
  projectNotes:[{id:"n1",projectId:"p1",date:"2026-03-01",title:"Progress",note:"Doing well."}],
  projectPhotos:[]
});

assert.equal(Shows.VERSION,"1.5.0");
for(const key of Shows.COLLECTIONS) assert.ok(Array.isArray(state[key]),`${key} is additive collection`);
assert.equal(Shows.validateShow({name:"Fair",startDate:"2026-06-02",endDate:"2026-06-01"}),"End date cannot be before the start date.");
assert.equal(Shows.validateShow({name:"Fair",startDate:"2026-06-01",endDate:"2026-06-02"}),"");
assert.match(Shows.validateEntry({showId:"s1",exhibitorId:"e1",animalId:""}),/existing HerdHarbor animal/);
assert.match(Shows.validateResult({placementNumber:"0"}),/positive whole number/);
assert.match(Shows.validateProject({year:"26",exhibitorId:"e1",animalId:"a1"}),/four-digit year/);

let showFinance=Shows.showFinancials(state,"s1");
assert.equal(showFinance.expenses,25);
assert.equal(showFinance.income,75);
assert.equal(showFinance.net,50);
// Canonical Finance is the source of truth: editing/deleting the transaction changes Shows immediately.
state.transactions.find(t=>t.id==="t1").amount="30.00";
showFinance=Shows.showFinancials(state,"s1");
assert.equal(showFinance.expenses,30);
assert.equal(showFinance.net,45);
state.transactions=state.transactions.filter(t=>t.id!=="t2");
showFinance=Shows.showFinancials(state,"s1");
assert.equal(showFinance.income,0);
assert.equal(showFinance.net,-30);
const projectFinance=Shows.projectFinancials(state,"p1");
assert.equal(projectFinance.expenses,10);
assert.equal(projectFinance.income,0);
assert.equal(projectFinance.net,-10);

// Archived animals retain historical competition records.
const ah=Shows.animalHistory(state,"a1");
assert.equal(ah.totals.shows,1);
assert.equal(ah.totals.classes,2);
assert.equal(ah.totals.firstPlaces,1);
assert.equal(ah.totals.awards,3);
assert.equal(ah.totals.championships,2);
const eh=Shows.exhibitorHistory(state,"e1");
assert.equal(eh.totals.shows,1);
assert.equal(eh.totals.animals,1);
assert.equal(eh.totals.classes,2);
assert.equal(eh.totals.awards,3);
const growth=Shows.growthSummary(state,state.showProjects[0]);
assert.ok(Math.abs(growth.gain-1.2)<1e-9);
assert.equal(growth.days,40);
assert.ok(Math.abs(growth.adg-0.03)<1e-9);
const timeline=Shows.projectTimeline(state,"p1");
for(const type of ["Health","Finance","Show","Goal","Note"]) assert.ok(timeline.some(x=>x.type===type),`${type} is a timeline view over canonical data`);

const source=fs.readFileSync(path.join(__dirname,"..","shows-v1.5.0.js"),"utf8");
const hardening=fs.readFileSync(path.join(__dirname,"..","shows-v1.5.0-hardening.js"),"utf8");
const cloud=fs.readFileSync(path.join(__dirname,"..","herdharbor-cloud.js"),"utf8");
assert.match(source,/dataset\.route='shows'/);
assert.match(source,/litters\.insertAdjacentElement\('afterend'/);
assert.doesNotMatch(source,/4-H Records/);
assert.match(source,/state\.transactions\.push\(/);
assert.doesNotMatch(source,/showExpenses\s*:/);
assert.doesNotMatch(source,/showIncome\s*:/);
assert.match(source,/state\.health\.push\(/);
assert.match(source,/showId:defaults\.showId/);
assert.match(source,/showEntryId:defaults\.showEntryId/);
assert.match(source,/exhibitorId:defaults\.exhibitorId/);
assert.match(source,/projectId:defaults\.projectId/);
assert.match(source,/sourceType:'show'/);
assert.match(source,/Print \/ Save PDF/);
assert.match(source,/not automatically an official state or county 4-H record book/i);
assert.match(source,/location\.reload\(\)/);
assert.match(source,/MAX_ATTACHMENTS=12/);
assert.match(source,/MAX_FILE_BYTES=5\*1024\*1024/);
assert.match(hardening,/Animal Show History/);
assert.match(hardening,/Edit result/);
assert.match(hardening,/Award for result/);
assert.match(hardening,/Remove this attachment from the record\?/);
assert.match(hardening,/Remove this project photo\?/);
assert.match(hardening,/Archive this show\?/);
assert.match(hardening,/data-hh-filter="exhibitor"/);
assert.match(hardening,/data-hh-filter="animal"/);
assert.match(hardening,/data-hh-filter="species"/);
assert.match(hardening,/data-hh-filter="breed"/);
assert.match(hardening,/data-hh-filter="organization"/);
assert.match(hardening,/data-hh-filter="placement"/);
assert.match(hardening,/data-hh-filter="award"/);
assert.match(hardening,/data-hh-filter="project"/);
assert.match(hardening,/data-eh="year"/);
assert.match(hardening,/data-eh="species"/);
assert.match(hardening,/data-eh="animal"/);
assert.match(hardening,/data-eh="organization"/);
assert.match(hardening,/data-eh="showType"/);
assert.match(hardening,/PAGE_SIZE = 24/);
// Cloud merge is schema-agnostic for top-level objects and ID-record arrays, so Shows collections sync through the existing farm state.
assert.match(cloud,/function isIdRecordArray/);
assert.match(cloud,/function mergeIdRecordArray/);
assert.match(cloud,/Object\.keys\(local\)/);
assert.match(cloud,/Object\.keys\(remote\)/);
console.log("HerdHarbor Alpha v1.5.0 Shows tests passed");