"use strict";
const test=require("node:test"), assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const app=fs.readFileSync(path.join(__dirname,"../herdharbor-app-runtime.js"),"utf8");
const profile=fs.readFileSync(path.join(__dirname,"../animal-profile-runtime-v1.8.3.js"),"utf8");
function runAnimalSave(original,animalId,accepted){
 const state=structuredClone(original);
 const prior=structuredClone(state);
 const breedStart=app.indexOf("function rememberBreed(");
 const breedEnd=app.indexOf("function breedComboboxField(",breedStart);
 assert.ok(breedStart>=0&&breedEnd>breedStart);
 const remember=new Function("state",app.slice(breedStart,breedEnd)+"return rememberBreed;")(state);
 const start=profile.indexOf('      $("#animal-form")?.addEventListener("submit", async (event) => {');
 const end=profile.indexOf('      $("#delete-animal")?.addEventListener("click", () => {',start);
 assert.ok(start>=0&&end>start);
 const input={name:"Updated",species:"Rabbit",breed:"Mini Rex",askingPrice:"",birthWeight:"",
   birthWeightOunces:"",birthWeightUnit:"lb"};
 class FormDataStub{
  constructor(form){this.form=form;}
  *[Symbol.iterator](){yield* Object.entries(this.form.fields);}
 }
 let handler,closed=0,rendered=0;
 const deps={
   rememberBreed:remember,
   recordActivity:label=>{state.activity.unshift({label});state.activity=state.activity.slice(0,10);},
   saveState:()=>accepted,
   allowsAnimalTransition:()=>true,
   uid:()=> "new_animal",
   closeModal:()=>{closed++;},
   renderCurrentView:()=>{rendered++;},
   toast:()=>{}
 };
 const $$=()=>({addEventListener:(_event,fn)=>{handler=fn;}});
 const create=new Function("$","stateNow","FormData","id","deps","canineIdentity","canineLineage","photoPreparationPromise","photoStatus","animal","pendingPhotoData","pendingPhotoFileName",
   profile.slice(start,end)+"return true;");
 create($,()=>state,FormDataStub,animalId,deps,
   {isDog:()=>false},{validateMutation:()=>({valid:true})},null,null,{canine:{}}, "", "");
 const capture=handler;
 assert.equal(typeof capture,"function");
 return Promise.resolve(capture({preventDefault(){},currentTarget:{fields:input}}))
  .then(()=>({state,prior,closed,rendered}));
}
test("failed animal edit rolls back animal, breed suggestions, and activity",async()=>{
 const initial={animals:[{id:"a",name:"Old",species:"Rabbit",breed:"Holland Lop"}],
  activity:[{label:"Prior"}],settings:{breedsBySpecies:{Rabbit:["Holland Lop"]}}};
 const {state,prior,closed}=await runAnimalSave(initial,"a",false);
 assert.deepEqual(state,prior);
 assert.equal(closed,0);
});
test("failed new animal save rolls back breed list and activity",async()=>{
 const initial={animals:[],activity:[{label:"Prior"}],
  settings:{breedsBySpecies:{Rabbit:["Holland Lop"]}}};
 const {state,prior,closed}=await runAnimalSave(initial,"",false);
 assert.deepEqual(state,prior);assert.equal(closed,0);
});
test("successful animal edit retains the breed and activity updates",async()=>{
 const initial={animals:[{id:"a",name:"Old",species:"Rabbit",breed:"Holland Lop"}],
  activity:[{label:"Prior"}],settings:{breedsBySpecies:{Rabbit:["Holland Lop"]}}};
 const {state,closed,rendered}=await runAnimalSave(initial,"a",true);
 assert.equal(state.animals[0].name,"Updated");
 assert.ok(state.settings.breedsBySpecies.Rabbit.includes("Mini Rex"));
 assert.equal(state.activity[0].label,"Updated Updated.");
 assert.equal(closed,1);assert.equal(rendered,1);
});
