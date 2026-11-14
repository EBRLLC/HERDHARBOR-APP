(function(root,factory){"use strict";const api=factory();
if(typeof module==="object"&&module.exports)module.exports=api;
if(root)root.HerdHarborCavyOffspring203=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){"use strict";
const txt=x=>String(x==null?"":x).trim(),arr=x=>Array.isArray(x)?x:[];
const isCavy=a=>/^(cavy|cavies|guinea pigs?|guinea-pigs?)$/i.test(txt(a?.species));
const date=x=>{x=txt(x);if(!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;
 const d=new Date(x+"T00:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===x;};
function generatePups(state,litterId,entries){
 const litter=arr(state?.litters).find(row=>row.id===litterId);
 const sow=arr(state?.animals).find(a=>a.id===litter?.damId);
 if(!litter||!isCavy(sow)||!date(litter.birthDate))return {valid:false,issues:["Valid cavy birth and sow required."],state};
 const animals=arr(state.animals);
 const linked=animals.filter(a=>isCavy(a)&&(a.sourceBirthId===litterId||arr(litter.offspringIds).includes(a.id)));
 const slots=Number(litter.bornAlive)-linked.length,issues=[],ids=new Set(animals.map(a=>a.id));
 if(!Array.isArray(entries)||entries.length>slots||slots<0)issues.push("Pup count exceeds recorded live births.");
 const recordedExposures=arr(sow.cavyReproduction?.records).filter(event=>{
  if(event.type!=="exposure"||!date(event.date)||!date(event.endDate))return false;
  const born=Date.parse(litter.birthDate+"T00:00:00Z");
  return born>=Date.parse(event.date+"T00:00:00Z")+59*86400000 &&
         born<=Date.parse(event.endDate+"T00:00:00Z")+72*86400000;
 });
 const possible=[...new Set([...arr(litter.potentialSireIds),...recordedExposures.map(e=>
  txt(e.boarId)||(txt(e.externalBoar)?"external:"+txt(e.externalBoar):"unknown")),
  ...(txt(litter.sireId)?[txt(litter.sireId)]:[])].filter(Boolean))];
 const born=[];
 for(const entry of arr(entries)){
  const id=txt(entry.id);
  if(!id||ids.has(id))issues.push("Pup identifier already exists.");
  ids.add(id);
  if(!txt(entry.name))issues.push("Pup name required.");
  if(!["Female","Male","Unknown"].includes(entry.sex||"Unknown"))issues.push("Invalid pup sex.");
  const potentialBoars=possible;
  const boarId=txt(entry.confirmedSireId)||(potentialBoars.length===1&&!potentialBoars[0].startsWith("external:")&&potentialBoars[0]!=="unknown"?potentialBoars[0]:"");
  if(entry.confirmedSireId&&potentialBoars.length&&!potentialBoars.includes(boarId))issues.push("Unrecorded sire confirmation.");
  born.push({id,name:txt(entry.name),species:"Cavy",sex:entry.sex||"Unknown",
   breed:txt(entry.breed)||sow.breed||"",color:txt(entry.color),tag:txt(entry.tag),
   dob:litter.birthDate,status:"Growing",sireId:boarId,damId:sow.id,sourceBirthId:litterId,
   potentialSireIds:potentialBoars,paternityStatus:entry.confirmedSireId?"breeder-confirmed":potentialBoars.length>1?"unresolved":potentialBoars.length===0?"unknown":"recorded-unverified",
   cavyGrowth:[],cavyCare:[],createdAt:new Date().toISOString()});
 }
 if(issues.length)return {valid:false,issues,state};
 return {valid:true,issues:[],created:born,state:{...state,
  animals:animals.concat(born),litters:state.litters.map(l=>l===litter?{...l,offspringIds:[...new Set([...arr(l.offspringIds),...born.map(x=>x.id)])]}:l)}};
}
function observe(state,pupId,input){
 const animal=arr(state?.animals).find(a=>a.id===pupId);
 if(!isCavy(animal)||!animal.sourceBirthId)return {valid:false,issues:["Birth-linked cavy pup required."],state};
 const kind=txt(input?.kind),at=txt(input?.date),notes=txt(input?.notes);
 if(!["weight","health","development","housing","separation","coat","show"].includes(kind)||!date(at))
  return {valid:false,issues:["Invalid observation type/date."],state};
 const grams=Number(input?.grams);
 if(kind==="weight"&&(!Number.isFinite(grams)||grams<=0||grams>30000))
  return {valid:false,issues:["Positive gram weight required."],state};
 if(kind!=="weight"&&!notes)return {valid:false,issues:["Notes or evidence required."],state};
 const key=txt(input.id)||["cavy",pupId,kind,at].join(":"),records=arr(animal.cavyCare).map(x=>({...x}));
 const existing=records.find(x=>x.id===key);
 const row={id:key,kind,date:at,notes,source:"breeder-recorded",
  ...(kind==="weight"?{grams}:{}),evidenceRef:txt(input.evidenceRef)};
 if(existing&&existing.kind!==kind)return {valid:false,issues:["Observation ID conflict."],state};
 if(existing)Object.assign(existing,row);else records.push(row);
 records.sort((a,b)=>a.date.localeCompare(b.date));
 const next={...animal,cavyCare:records};
 return {valid:true,issues:[],state:{...state,animals:state.animals.map(a=>a===animal?next:a)},record:row};
}
function changeStatus(state,pupId,nextStatus,buyerId=""){
 const permitted=["Growing","Retained","Available","Reserved","Sold"],pup=arr(state?.animals).find(a=>a.id===pupId);
 if(!isCavy(pup)||!pup.sourceBirthId||!permitted.includes(nextStatus))
  return {valid:false,issues:["Invalid pup or status."],state};
 if(["Reserved","Sold"].includes(nextStatus)&&!txt(buyerId))
  return {valid:false,issues:["Buyer required for reservation or sale."],state};
 if(buyerId&&!arr(state.customers).some(x=>x.id===buyerId))
  return {valid:false,issues:["Buyer is missing from Customers."],state};
 return {valid:true,issues:[],state:{...state,animals:state.animals.map(a=>a===pup?{...a,status:nextStatus,buyerId,updatedAt:new Date().toISOString()}:a)}};
}
function weightSeries(animal){
 return arr(animal?.cavyCare).filter(x=>x.kind==="weight"&&Number.isFinite(Number(x.grams)))
  .sort((a,b)=>a.date.localeCompare(b.date)).map(x=>({date:x.date,grams:Number(x.grams)}));
}
function litterOverview(litter,animals){
 const pups=arr(animals).filter(a=>isCavy(a)&&a.sourceBirthId===litter?.id);
 return {litterId:txt(litter?.id),bornAlive:Number(litter?.bornAlive)||0,pups:pups.length,
  separationRecorded:pups.filter(a=>arr(a.cavyCare).some(e=>e.kind==="separation")).length,
  sold:pups.filter(a=>a.status==="Sold").length,unresolvedSires:pups.filter(a=>a.paternityStatus==="unresolved").length};
}
return Object.freeze({VERSION:"2.0.3",generatePups,observe,changeStatus,weightSeries,litterOverview});
});