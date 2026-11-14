(function(root,factory){"use strict";const api=factory();
if(typeof module==="object"&&module.exports)module.exports=api;
if(root)root.HerdHarborFelineKittens203=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){"use strict";
const txt=x=>String(x==null?"":x).trim(),arr=x=>Array.isArray(x)?x:[];
const isCat=a=>/^(cat|cats|feline)$/i.test(txt(a?.species));
const dateValid=x=>{x=txt(x);if(!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;
 const d=new Date(x+"T00:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===x;};
function createKittens(state,litterId,items){
 const issues=[],litter=arr(state?.litters).find(l=>l.id===litterId);
 const dam=arr(state?.animals).find(a=>a.id===litter?.damId);
 if(!litter||!isCat(dam))return {valid:false,issues:["A cat litter and recorded queen are required."],state};
 if(!dateValid(litter.birthDate))issues.push("The birth date is missing or invalid.");
 const existing=arr(state.animals),used=new Set(existing.map(x=>txt(x.id)));
 const bornAlive=Number(litter.bornAlive);
 const linked=existing.filter(a=>isCat(a)&&(a.sourceBirthId===litterId||arr(litter.offspringIds).includes(a.id)));
 if(!Number.isInteger(bornAlive)||bornAlive<0||bornAlive>200)issues.push("Invalid live-birth count.");
 if(!Array.isArray(items)||items.length>Math.max(0,bornAlive-linked.length))issues.push("Requested kittens exceed recorded live births.");
 const recordedMatings=arr(dam.felineReproduction?.events).filter(event=>{
  if(event.kind!=="mating"||!dateValid(event.date))return false;
  const days=(Date.parse(litter.birthDate+"T00:00:00Z")-Date.parse(event.date+"T00:00:00Z"))/86400000;
  return days>=63&&days<=71;
 });
 const possible=[...new Set([...arr(litter.potentialSireIds),...recordedMatings.map(e=>
   txt(e.sireId) || (txt(e.externalSireName) ? "external:"+txt(e.externalSireName) : "unknown")),
   ...(txt(litter.sireId)?[txt(litter.sireId)]:[])].filter(Boolean))];
 const created=[];
 for(const item of arr(items)){
  const id=txt(item.id);
  if(!id||used.has(id)){issues.push("Kitten IDs must be new and unique.");continue;}
  used.add(id);
  if(!txt(item.name))issues.push("Every kitten needs a name.");
  if(!["Male","Female","Unknown"].includes(item.sex||"Unknown"))issues.push("Kitten sex must be recorded as male, female or unknown.");
  const potential=possible;
  const confirmedSire=txt(item.confirmedSireId);
  if(confirmedSire&&potential.length&&!potential.includes(confirmedSire))issues.push("Confirmed sire is not among recorded potential sires.");
  created.push({id,name:txt(item.name),species:"Cat",breed:txt(item.breed)||dam.breed||"",sex:item.sex||"Unknown",
   color:txt(item.color),tag:txt(item.tag),status:"Growing",dob:litter.birthDate,
   damId:dam.id,sireId:confirmedSire || (potential.length===1 && !potential[0].startsWith("external:") && potential[0]!=="unknown" ? potential[0] : ""),
   potentialSireIds:potential.slice(),paternityStatus:confirmedSire?"breeder-confirmed":potential.length>1?"unresolved-multiple-sires":potential.length===0?"unknown":"recorded-unverified",
   sourceBirthId:litterId,kittenCare:[],createdAt:new Date().toISOString()});
 }
 if(issues.length)return {valid:false,issues,state};
 const nextLitter={...litter,offspringIds:[...new Set([...arr(litter.offspringIds),...created.map(x=>x.id)])]};
 return {valid:true,issues:[],created,state:{...state,animals:existing.concat(created),
   litters:state.litters.map(row=>row===litter?nextLitter:row)}};
}
function addObservation(state,id,item){
 const target=arr(state?.animals).find(a=>a.id===id);
 if(!isCat(target)||!target.sourceBirthId)return {valid:false,issues:["Record must be a birth-linked Cat kitten."],state};
 const kind=txt(item?.kind),date=txt(item?.date),notes=txt(item?.notes);
 if(!["weight","development","health","veterinary","coat"].includes(kind)||!dateValid(date))
  return {valid:false,issues:["Unknown observation or invalid date."],state};
 const grams=Number(item?.grams);
 if(kind==="weight"&&(!Number.isFinite(grams)||grams<=0||grams>50000))
  return {valid:false,issues:["Weight must be a valid positive gram value."],state};
 if(kind!=="weight"&&!notes)return {valid:false,issues:["Evidence or observation notes required."],state};
 const observations=arr(target.kittenCare).map(x=>({...x}));
 const key=txt(item.id)||["kitten",id,kind,date].join(":");
 const previous=observations.find(x=>x.id===key);
 const record={id:key,kind,date,notes,source:"breeder-entered",
  ...(kind==="weight"?{grams}:{})};
 if(previous&&previous.kind!==kind)return {valid:false,issues:["Observation ID conflict."],state};
 if(previous)Object.assign(previous,record);else observations.push(record);
 observations.sort((a,b)=>a.date.localeCompare(b.date));
 const next={...target,kittenCare:observations};
 return {valid:true,issues:[],record,state:{...state,animals:state.animals.map(a=>a===target?next:a)}};
}
function catteryStatus(state,id,status,buyerId=""){
 const allowed=new Set(["Growing","Retained","Available","Reserved","Sold"]);
 if(!allowed.has(status))return {valid:false,issues:["Invalid cattery status."],state};
 const animal=arr(state?.animals).find(a=>a.id===id);
 if(!isCat(animal)||!animal.sourceBirthId)return {valid:false,issues:["Recorded birth-linked kitten required."],state};
 if(["Reserved","Sold"].includes(status)&&!txt(buyerId))return {valid:false,issues:["Buyer record required for reserved or sold kittens."],state};
 if(buyerId&&!arr(state.customers).some(x=>x.id===buyerId))return {valid:false,issues:["Selected buyer does not exist."],state};
 const next={...animal,status,buyerId:buyerId||"",updatedAt:new Date().toISOString()};
 return {valid:true,issues:[],state:{...state,animals:state.animals.map(a=>a===animal?next:a)}};
}
function litterSummary(litter,animals){
 const kittens=arr(animals).filter(a=>isCat(a)&&a.sourceBirthId===litter?.id);
 return {litterId:litter?.id||"",recorded:kittens.length,bornAlive:Number(litter?.bornAlive)||0,
  sexUnknown:kittens.filter(x=>x.sex==="Unknown").length,
  unresolvedSires:kittens.filter(x=>x.paternityStatus==="unresolved-multiple-sires").length,
  reserved:kittens.filter(x=>x.status==="Reserved").length,
  sold:kittens.filter(x=>x.status==="Sold").length};
}
return Object.freeze({VERSION:"2.0.3",createKittens,addObservation,catteryStatus,litterSummary});
});