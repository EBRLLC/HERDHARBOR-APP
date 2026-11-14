(function(root,factory){"use strict";const api=factory(root);
if(typeof module==="object"&&module.exports)module.exports=api;
if(root)root.HerdHarborCavyReproduction203=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(root){"use strict";
const text=x=>String(x==null?"":x).trim(),arr=x=>Array.isArray(x)?x:[];
const isCavy=a=>/^(cavy|cavies|guinea pigs?|guinea-pigs?)$/i.test(text(a?.species));
const owner=a=>text(a?.ownerId||a?.userId||a?.accountId);
const date=x=>{x=text(x);if(!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;
 const d=new Date(x+"T00:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===x;};
const offset=(d,n)=>{if(!date(d))return "";const x=new Date(d+"T00:00:00Z");x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
function windowFromExposure(from,to=from){
 if(!date(from)||!date(to)||to<from)return {estimated:false,confirmedPregnancy:false,earliest:"",latest:""};
 return {estimated:true,confirmedPregnancy:false,reference:"recorded-sow-boar-exposure-only",
  earliest:offset(from,59),latest:offset(to,72),central:offset(to,68)};
}
function addRecord(state,sowId,entry,options={}){
 const animals=arr(state?.animals),sow=animals.find(a=>a.id===sowId),user=text(options.ownerId),issues=[];
 if(!sow||!isCavy(sow)||text(sow.sex).toLowerCase()!=="female")issues.push("Select an existing female Cavy sow.");
 if(sow&&owner(sow)&&owner(sow)!==user)issues.push("Sow does not belong to this account.");
 const type=text(entry?.type);
 if(!["planned-pairing","exposure","pregnancy-observation","pregnancy-assessment","birth","follow-up"].includes(type))issues.push("Unknown cavy reproduction record type.");
 if(!date(entry?.date))issues.push("Enter a valid record date.");
 if(type==="exposure"&&(!date(entry?.endDate)||text(entry.endDate)<text(entry.date)))issues.push("Exposure end date must be on or after its start date.");
 if(type==="pregnancy-assessment"&&!["positive","negative","inconclusive","not-assessed"].includes(text(entry?.result)))issues.push("Record the observed assessment outcome.");
 if(["planned-pairing","exposure"].includes(type)&&!text(entry?.boarId)&&!text(entry?.externalBoar))issues.push("Record an owned or external boar.");
 const boar=animals.find(a=>a.id===entry?.boarId);
 if(boar&&(!isCavy(boar)||text(boar.sex).toLowerCase()!=="male"))issues.push("Referenced boar must be a male Cavy.");
 if(boar&&owner(boar)&&owner(boar)!==user)issues.push("Boar is outside this account.");
 if(type==="birth"&&(!Number.isSafeInteger(Number(entry?.bornAlive))||Number(entry.bornAlive)<0))issues.push("Birth requires a nonnegative live-birth count.");
 if(issues.length)return {valid:false,issues,state};
 const prior=arr(sow.cavyReproduction?.records).map(x=>({...x}));
 const id=text(entry.id)||["cavy",sowId,type,text(entry.date),text(entry.boarId)||text(entry.externalBoar)||"event"].join(":");
 const record={id,type,date:text(entry.date),endDate:type==="exposure"?text(entry.endDate):"",
  boarId:text(entry.boarId),externalBoar:text(entry.externalBoar),
  result:text(entry.result),notes:text(entry.notes),evidenceRef:text(entry.evidenceRef),
  followUpDate:date(entry.followUpDate)?entry.followUpDate:"",
  ...(type==="birth"?{bornAlive:Number(entry.bornAlive),stillborn:Math.max(0,Number(entry.stillborn)||0)}:{}),
  source:"breeder-entered"};
 const old=prior.find(x=>x.id===id);
 if(old&&old.type!==type)return {valid:false,issues:["Duplicate event identity conflicts with earlier record."],state};
 if(old)Object.assign(old,record);else prior.push(record);
 prior.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 const changed={...sow,cavyReproduction:{...sow.cavyReproduction,records:prior}};
 return {valid:true,issues:[],record,
  estimate:type==="exposure"?windowFromExposure(record.date,record.endDate):null,
  state:{...state,animals:animals.map(a=>a===sow?changed:a)}};
}
function summary(sow){
 if(!isCavy(sow))return {supported:false};
 const records=arr(sow.cavyReproduction?.records),exposures=records.filter(x=>x.type==="exposure");
 const assess=records.filter(x=>x.type==="pregnancy-assessment").at(-1);
 const births=records.filter(x=>x.type==="birth");
 return {supported:true,exposures,estimates:exposures.map(e=>windowFromExposure(e.date,e.endDate)),
  latestAssessment:assess||null,pregnancyStatus:assess?.result||"not-assessed",
  birthHistory:births,reminders:records.filter(r=>date(r.followUpDate)).map(r=>({sourceId:r.id,dueDate:r.followUpDate,kind:r.type})),
  potentialBoars:[...new Set(exposures.map(e=>e.boarId||e.externalBoar||"unknown"))]};
}
function openForAnimal(id){
 const state=root?.HerdHarborApp?.getState?.(),sow=arr(state?.animals).find(a=>a.id===id),account=text(root?.HerdHarborCloud?.getSession?.()?.user?.id);
 if(!isCavy(sow)||text(sow.sex).toLowerCase()!=="female"||(owner(sow)&&owner(sow)!==account))return false;
 root.document?.getElementById("hh-cavy-repro")?.remove();
 const original=JSON.stringify(sow.cavyReproduction||{});
 const overlay=root.document.createElement("div");overlay.id="hh-cavy-repro";
 overlay.style.cssText="position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,.65);display:grid;place-items:center;padding:16px";
 const box=root.document.createElement("section");
 box.style.cssText="background:var(--card,#fff);color:var(--text,#222);border-radius:12px;padding:20px;width:min(560px,100%);max-height:90vh;overflow:auto";
 const history=summary(sow);
 box.innerHTML='<h2>Cavy sow breeding records</h2><p>Recorded exposures: '+history.exposures.length+'. Dates are estimates, not pregnancy diagnosis.</p>'+
 '<form id="hh-cavy-repro-form"><label>Event<select name="type"><option value="planned-pairing">Planned pairing</option><option value="exposure">Exposure period</option><option value="pregnancy-observation">Pregnancy observation</option><option value="pregnancy-assessment">Pregnancy assessment</option><option value="birth">Birth outcome</option><option value="follow-up">Follow-up</option></select></label>'+
 '<label>Start/event date<input type="date" name="date" required></label><label>Exposure end<input type="date" name="endDate"></label>'+
 '<label>Owned boar ID<input name="boarId"></label><label>External boar<input name="externalBoar"></label>'+
 '<label>Assessment<select name="result"><option value="not-assessed">Not assessed</option><option value="positive">Positive</option><option value="negative">Negative</option><option value="inconclusive">Inconclusive</option></select></label>'+
 '<label>Born alive<input type="number" name="bornAlive" min="0"></label><label>Stillborn<input type="number" name="stillborn" min="0"></label>'+
 '<label>Next reminder date<input type="date" name="followUpDate"></label><label>Evidence reference<input name="evidenceRef"></label>'+
 '<label>Notes<textarea name="notes"></textarea></label><p role="alert" id="hh-cavy-error"></p>'+
 '<button type="submit">Save record</button><button type="button" id="hh-cavy-close">Close</button></form>';
 overlay.appendChild(box);root.document.body.appendChild(overlay);
 box.querySelector("#hh-cavy-close").addEventListener("click",()=>overlay.remove());
 box.querySelector("form").addEventListener("submit",event=>{
  event.preventDefault();const live=root.HerdHarborApp?.getState?.();
  const current=arr(live?.animals).find(a=>a.id===id),error=box.querySelector("#hh-cavy-error");
  if(account!==text(root.HerdHarborCloud?.getSession?.()?.user?.id)||original!==JSON.stringify(current?.cavyReproduction||{})){
   error.textContent="Account or sow records changed; reopen this form.";return;
  }
  const data=Object.fromEntries(new FormData(event.currentTarget));
  const result=addRecord(live,id,data,{ownerId:account});
  if(!result.valid){error.textContent=result.issues.join(" ");return;}
  if(!root.HerdHarborApp?.commitState?.(result.state)){error.textContent="Local save failed. Existing data retained.";return;}
  overlay.remove();
 });
 return true;
}
return Object.freeze({VERSION:"2.0.3",windowFromExposure,addRecord,summary,openForAnimal});
});