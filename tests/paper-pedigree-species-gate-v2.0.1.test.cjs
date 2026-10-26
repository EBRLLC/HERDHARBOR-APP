"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const core=require("../paper-pedigree-import-core-v1.8.2.js");
const root=path.join(__dirname,"..");
const rabbit={id:"r1",name:"Clover",species:"Rabbit",sex:"Female"};
const input=(species)=>({extractionId:"test",nodes:[{role:"subject",name:"Sample",registrationNumber:"REG12",species,sex:"Female"}]});
test("review plan denies clearly canine and unknown non-rabbit paper AI species",()=>{
  for(const species of ["Dog","Cattle","Horse"]){
    const plan=core.buildImportPlan({animals:[]},input(species));
    assert.equal(plan.canCommit,false,species);
    assert.ok(plan.conflicts.some(c=>c.type==="unsupported-species"),species);
    assert.throws(()=>core.applyImportPlan({animals:[]},{...plan,conflicts:[],actions:plan.actions.map(a=>({...a,mode:"create",animalId:"dog-inject"}))}),/supports rabbits only/);
  }
});
test("ordinary rabbit AI review and explicit plan commit retain canonical behavior",()=>{
  const plan=core.buildImportPlan({animals:[rabbit]},input("Rabbit"));
  assert.equal(plan.canCommit,true);
  const applied=core.applyImportPlan({animals:[rabbit]},plan);
  assert.equal(applied.state.animals.find(a=>a.name==="Sample").species,"Rabbit");
  assert.equal(applied.state.animals.find(a=>a.id==="r1").name,"Clover");
});
test("a forged reviewed plan cannot alter an existing Dog record",()=>{
  const dog={id:"d1",name:"Rex",species:"Dog",sex:"Male"};
  const forged={contract:core.CONTRACT,actions:[{role:"subject",mode:"merge",animalId:"d1",incoming:{name:"Rex",species:"Rabbit",registrationNumber:"R55"}}],conflicts:[]};
  assert.throws(()=>core.applyImportPlan({animals:[dog]},forged),/another species/);
});
test("both AI and client reject explicit canine source before normal commit",()=>{
  const server=fs.readFileSync(path.join(root,"supabase/functions/paper-pedigree-extract/index.ts"),"utf8");
  const ui=fs.readFileSync(path.join(root,"paper-pedigree-import-v1.8.2.js"),"utf8");
  assert.match(server,/expectedSpecies !== "rabbit"/);
  assert.match(server,/normalized\.nodes\.some/);
  assert.match(ui,/species: "Rabbit"/);
  assert.match(ui,/supports rabbit pedigrees only/);
  assert.match(ui,/reviewed\.nodes \|\| \[\]/);
});
