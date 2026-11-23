"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const Core=require("../rabbit-genetics-v1.6.1.js");
const Inheritance=require("../rabbit-genetics-inheritance-v2.0.3.js");
const Normalizer=require("../cloud-state-normalizer-v1.8.3.js");
const from=(id,color="",loci={},extra={})=>({
 id, species:"Rabbit", name:id, color,
 genetics:{loci:Object.fromEntries(Object.entries(loci)
  .map(([locus,alleles])=>[locus,{alleles,status:"confirmed",source:"breeder"}]))},...extra
});
const locus=(animal,name)=>animal.genetics?.loci?.[name];
const inferred=(animal,name)=>(animal.genetics?.evidence||[]).find(e=>
 e.source==="family-inferred"&&e.locus===name);

test("recorded parents and kit color save exact but non-DNA-confirmed genotype to kit",()=>{
 const sire=from("sire","Black",{D:["D","d"]},{sex:"Male"});
 const dam=from("dam","Blue",{D:["d","d"]},{sex:"Female"});
 const kit=from("kit","Black",{}, {sireId:"sire",damId:"dam",sourceBirthId:"l1"});
 const state={animals:[kit,dam,sire],litters:[{id:"l1",damId:"dam",sireId:"sire"}]};
 assert.ok(Inheritance.reconcile(state,Core).changed>0);
 assert.deepEqual(locus(kit,"D").alleles,["D","d"]);
 assert.equal(locus(kit,"D").status,"strongly-inferred");
 assert.equal(locus(kit,"D").source,"family-inferred");
 assert.match(locus(kit,"D").note,/not DNA-confirmed/);
 assert.ok(inferred(kit,"D").relatedAnimalIds.includes("sire"));
 assert.ok(inferred(kit,"D").relatedAnimalIds.includes("dam"));
 const saved=JSON.stringify(state);
 assert.equal(Inheritance.reconcile(state,Core).changed,0);
 assert.equal(JSON.stringify(state),saved);
});

test("ambiguous kit gets persisted genotype possibilities but no invented exact alleles",()=>{
 const sire=from("s","",{D:["D","d"]},{sex:"Male"});
 const dam=from("d","",{D:["D","d"]},{sex:"Female"});
 const kit=from("k","",{}, {sireId:"s",damId:"d"});
 const state={animals:[sire,dam,kit]};
 assert.ok(Inheritance.reconcile(state,Core).changed>0);
 assert.equal(locus(kit,"D"),undefined);
 const rows=inferred(kit,"D").possibleGenotypes;
 assert.deepEqual(rows.map(x=>x.alleles.join("/")).sort(),["D/D","D/d","d/d"]);
 assert.deepEqual(rows.map(x=>x.probability).sort((a,b)=>a-b),[0.25,0.25,0.5]);
 assert.equal(inferred(kit,"D").status,"possible");
 assert.equal(Inheritance.reconcile(state,Core).changed,0);
});

test("partially known parent alleles result in possible genotypes without false percentages",()=>{
 const sire=from("s","Black");
 const dam=from("d","Blue",{D:["d","d"]});
 const kit=from("k","",{}, {sireId:"s",damId:"d"});
 const state={animals:[sire,dam,kit]};
 Inheritance.reconcile(state,Core);
 const d=inferred(kit,"D");
 assert.ok(d);
 assert.ok(d.possibleGenotypes.length>1);
 assert.ok(d.possibleGenotypes.every(row=>row.probability===null));
 assert.equal(locus(kit,"D"),undefined);
});

test("no recorded parent genotypes and no informative color do not fabricate family evidence",()=>{
 const sire=from("s"),dam=from("d");
 const kit=from("k","",{}, {sireId:"s",damId:"d"});
 const state={animals:[sire,dam,kit]};
 Inheritance.reconcile(state,Core);
 assert.equal(inferred(kit,"D"),undefined);
 assert.equal(locus(kit,"D"),undefined);
});

test("recorded blue kit informs both black parents without assuming DNA confirmation",()=>{
 const sire=from("s","Black",{}, {sex:"Male"});
 const dam=from("d","Black",{}, {sex:"Female"});
 const kit=from("k","Blue",{}, {sireId:"s",damId:"d"});
 const state={animals:[sire,dam,kit]};
 Inheritance.reconcile(state,Core);
 assert.deepEqual(locus(sire,"D").alleles,["D","d"]);
 assert.deepEqual(locus(dam,"D").alleles,["D","d"]);
 assert.equal(locus(sire,"D").source,"family-inferred");
 assert.equal(locus(dam,"D").status,"strongly-inferred");
});

test("offspring evidence retracts after parent records change without overwriting DNA",()=>{
 const sire=from("s","Black",{D:["D","d"]});
 const dam=from("d","Blue",{D:["d","d"]});
 const kit=from("k","Black",{}, {sireId:"s",damId:"d"});
 const state={animals:[sire,dam,kit]};
 Inheritance.reconcile(state,Core);
 assert.deepEqual(locus(kit,"D").alleles,["D","d"]);
 sire.color="Blue";sire.genetics.loci.D={alleles:["d","d"],status:"confirmed",source:"dna"};
 Inheritance.reconcile(state,Core);
 assert.equal(locus(kit,"D"),undefined);
 assert.equal(inferred(kit,"D"),undefined);
 assert.ok(kit.genetics.conflicts.some(x=>x.locus==="D"&&x.source==="family-inferred"));
 kit.genetics.loci.D={alleles:["D","D"],status:"confirmed",source:"genetic-test"};
 Inheritance.reconcile(state,Core);
 assert.deepEqual(locus(kit,"D").alleles,["D","D"]);
 assert.equal(locus(kit,"D").source,"genetic-test");
});

test("reject unknown sire, duplicate species IDs and cross-account inference",()=>{
 const sire=from("s","Black",{D:["D","d"]},{ownerId:"account-1"});
 const dam=from("d","Blue",{D:["d","d"]},{ownerId:"account-1"});
 const makeKit=extra=>from("k","Black",{}, {sireId:"s",damId:"d",ownerId:"account-1",...extra});
 for(const extra of [{paternityStatus:"recorded-unverified"},
  {paternityStatus:"unresolved"},{potentialSireIds:["s","other"]}]){
   const kit=makeKit(extra);
   Inheritance.reconcile({animals:[sire,dam,kit]},Core);
   assert.equal(locus(kit,"D"),undefined);
   assert.equal(inferred(kit,"D"),undefined);
 }
 const foreign=makeKit({ownerId:"account-2"});
 Inheritance.reconcile({animals:[sire,dam,foreign]},Core);
 assert.equal(locus(foreign,"D"),undefined);
 const duplicate=makeKit();
 Inheritance.reconcile({animals:[sire,dam,duplicate,{id:"s",species:"Dog",name:"dog"}]},Core);
 assert.equal(locus(duplicate,"D"),undefined);
});

test("ancestral cycles never assign misleading inferred kit genetics",()=>{
 const sire=from("s","Black",{D:["D","d"]},{damId:"k"});
 const dam=from("d","Blue",{D:["d","d"]});
 const kit=from("k","Black",{}, {sireId:"s",damId:"d"});
 Inheritance.reconcile({animals:[sire,dam,kit]},Core);
 assert.equal(locus(kit,"D"),undefined);
 assert.equal(inferred(kit,"D"),undefined);
});

test("normalized serializer preserves kit and parental evidence across reload",()=>{
 const sire=from("s","Black",{D:["D","d"]},{sex:"Male"});
 const dam=from("d","Blue",{D:["d","d"]},{sex:"Female"});
 const kit=from("k","",{}, {sireId:"s",damId:"d"});
 const state={animals:[sire,dam,kit],litters:[],births:[],settings:{theme:"light"}};
 Inheritance.reconcile(state,Core);
 const mapped=Normalizer.mapLegacySnapshot(state);
 const rows=mapped.records.map(row=>({
   namespace:row.namespace,record_id:row.record_id,
   payload:row.payload,payload_checksum:row.payload_checksum,record_version:1,deleted_at:null
 }));
 const restored=Normalizer.reassembleLegacySnapshot(rows);
 assert.deepEqual(restored,state);
 assert.deepEqual(inferred(restored.animals[2],"D"),inferred(kit,"D"));
 assert.equal(Inheritance.reconcile(restored,Core).changed,0);
});

test("button uses canonical state rather than the legacy snapshot",()=>{
 const ui=fs.readFileSync(path.join(__dirname,"../breeding-intelligence-v1.6.1.js"),"utf8");
 assert.match(ui,/const live = window\.HerdHarborApp\?\.getState\?\.\(\)/);
 assert.match(ui,/const inheritance = window\.HerdHarborRabbitInheritance/);
 assert.match(ui,/inheritance\.reconcile\(state, Core\)/);
 assert.match(ui,/await writeState\(state\)/);
 assert.match(ui,/Offspring Genetics Not Saved/);
 assert.match(ui,/Recorded family and offspring inheritance/);
 assert.doesNotMatch(ui.slice(ui.indexOf("async function learnFromOffspring"),ui.indexOf("function snapshotParents")),_re=/offspringEvidenceForParent|localStorage\.setItem/);
});
