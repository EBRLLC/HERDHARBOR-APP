(function(root,factory){"use strict";const api=factory(root);
if(typeof module==="object"&&module.exports)module.exports=api;
if(root)root.HerdHarborFelineReproduction203=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(root){"use strict";
const clean=x=>String(x==null?"":x).trim(),arr=x=>Array.isArray(x)?x:[];
const isCat=a=>/^(cat|cats|feline)$/i.test(clean(a?.species));
const owner=a=>clean(a?.ownerId||a?.userId||a?.accountId);
const validDate=v=>{v=clean(v);if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
 const d=new Date(v+"T00:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;};
const addDays=(v,n)=>{if(!validDate(v))return "";const d=new Date(v+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const esc=x=>clean(x).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
function calculateMatingWindow(matingDate){
 return {basedOn:"recorded-mating-date-only",pregnancyConfirmed:false,
   centralDueDate:addDays(matingDate,65),earliestDueDate:addDays(matingDate,63),
   latestDueDate:addDays(matingDate,71)};
}
function appendEvent(state,queenId,event,options={}){
 const errors=[],account=clean(options.accountId),animals=arr(state?.animals);
 const source=animals.find(a=>a?.id===queenId);
 if(!source||!isCat(source)||clean(source.sex).toLowerCase()!=="female")errors.push("Select a recorded female cat.");
 if(source&&owner(source)&&owner(source)!==account)errors.push("Cat does not belong to the current account.");
 const kind=clean(event?.kind),date=clean(event?.date);
 if(!["heat","mating","pregnancy-assessment","outcome"].includes(kind))errors.push("Unknown feline reproductive event.");
 if(!validDate(date))errors.push("Enter a valid date.");
 if(kind==="mating"&&!clean(event?.sireId)&&!clean(event?.externalSireName))errors.push("Record an owned or external sire; do not invent parentage.");
 if(kind==="pregnancy-assessment"&&!["positive","negative","inconclusive","not-assessed"].includes(clean(event?.result)))errors.push("A pregnancy assessment result is required.");
 if(errors.length)return {valid:false,issues:errors,state};
 const sire=animals.find(a=>a?.id===event.sireId);
 if(sire&&(!isCat(sire)||clean(sire.sex).toLowerCase()!=="male"))return {valid:false,issues:["Sire must be a male Cat."],state};
 if(sire&&owner(sire)&&owner(sire)!==account)return {valid:false,issues:["Sire is outside the current account."],state};
 const events=arr(source.felineReproduction?.events).map(x=>({...x}));
 const id=clean(event?.id)||["feline",kind,date,clean(event?.sireId)||clean(event?.externalSireName)||"event"].join(":");
 const item={id,kind,date,notes:clean(event.notes),sireId:kind==="mating"?clean(event.sireId):"",
   externalSireName:kind==="mating"?clean(event.externalSireName):"",
   result:kind==="pregnancy-assessment"?clean(event.result):"",
   evidenceRef:clean(event.evidenceRef),source:"breeder-entered"};
 const prior=events.find(x=>x.id===id);
 if(prior){
  if(prior.kind!==item.kind||prior.date!==item.date)return {valid:false,issues:["Event identity conflict."],state};
  Object.assign(prior,item);
 }else events.push(item);
 events.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 const changed={...source,felineReproduction:{...(source.felineReproduction||{}),events}};
 const next={...state,animals:animals.map(a=>a===source?changed:a)};
 return {valid:true,issues:[],state:next,event:item,
    estimatedWindow:kind==="mating"?calculateMatingWindow(date):null};
}
function review(queen){
 if(!isCat(queen))return {supported:false};
 const events=arr(queen.felineReproduction?.events);
 const matings=events.filter(e=>e.kind==="mating");
 const assessments=events.filter(e=>e.kind==="pregnancy-assessment");
 const latest=assessments[assessments.length-1]||null;
 const potentialSires=[...new Map(matings.map(e=>[(e.sireId||e.externalSireName||"unknown"),{id:e.sireId||"",externalName:e.externalSireName||""}])).values()];
 return {supported:true,heatRecords:events.filter(e=>e.kind==="heat").length,
  matings,latestAssessment:latest,potentialSires,requiresSireReview:potentialSires.length!==1,
  pregnancyStatus:latest?.result||"not-assessed",
  estimates:matings.map(e=>calculateMatingWindow(e.date))};
}
let active=null;
function openForAnimal(id){
 const state=root?.HerdHarborApp?.getState?.(),cat=arr(state?.animals).find(a=>a.id===id);
 const account=clean(root?.HerdHarborCloud?.getSession?.()?.user?.id);
 if(!cat||!isCat(cat)||clean(cat.sex).toLowerCase()!=="female"||(owner(cat)&&owner(cat)!==account))return false;
 root.document?.getElementById("hh-feline-repro-modal")?.remove();
 const original=JSON.stringify(cat.felineReproduction||{});
 const overlay=root.document.createElement("div");overlay.id="hh-feline-repro-modal";
 overlay.style.cssText="position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,.65);display:grid;place-items:center;padding:16px";
 const box=root.document.createElement("section");
 box.style.cssText="background:var(--card,#fff);color:var(--text,#222);border-radius:12px;padding:20px;width:min(560px,100%);max-height:90vh;overflow:auto";
 const summary=review(cat);
 box.innerHTML='<h2>Cat heat & mating records</h2><p>Breeder-entered information only. Mating dates do not confirm pregnancy. Recorded potential sires: '+summary.potentialSires.length+'.</p>'+
 '<form id="hh-feline-repro-form"><label>Event<select name="kind"><option value="heat">Heat observation</option><option value="mating">Mating</option><option value="pregnancy-assessment">Pregnancy assessment</option><option value="outcome">Reproductive outcome</option></select></label>'+
 '<label>Date<input type="date" name="date" required></label>'+
 '<label>Owned sire ID (mating only)<input name="sireId" placeholder="Existing male Cat ID"></label>'+
 '<label>External sire (mating only)<input name="externalSireName"></label>'+
 '<label>Assessment<select name="result"><option value="not-assessed">Not assessed</option><option value="positive">Positive</option><option value="negative">Negative</option><option value="inconclusive">Inconclusive</option></select></label>'+
 '<label>Evidence reference<input name="evidenceRef"></label><label>Notes<textarea name="notes"></textarea></label>'+
 '<p id="hh-feline-repro-error" role="alert"></p>'+
 '<button type="submit">Save event</button><button type="button" id="hh-feline-repro-close">Close</button></form>';
 overlay.appendChild(box);root.document.body.appendChild(overlay);
 box.querySelector("#hh-feline-repro-close").addEventListener("click",()=>overlay.remove());
 box.querySelector("form").addEventListener("submit",event=>{
  event.preventDefault();const live=root.HerdHarborApp?.getState?.();
  const current=arr(live?.animals).find(a=>a.id===id);
  const message=box.querySelector("#hh-feline-repro-error");
  if(clean(root.HerdHarborCloud?.getSession?.()?.user?.id)!==account||JSON.stringify(current?.felineReproduction||{})!==original){
   message.textContent="The account or reproductive records changed. Reopen and review before saving.";return;
  }
  const data=Object.fromEntries(new FormData(event.currentTarget));
  const result=appendEvent(live,id,data,{accountId:account});
  if(!result.valid){message.textContent=result.issues.join(" ");return;}
  if(!root.HerdHarborApp?.commitState?.(result.state)){message.textContent="Save failed. Existing records preserved.";return;}
  overlay.remove();
 });
 active=overlay;return true;
}
return Object.freeze({VERSION:"2.0.3",isCat,calculateMatingWindow,appendEvent,review,openForAnimal});
});