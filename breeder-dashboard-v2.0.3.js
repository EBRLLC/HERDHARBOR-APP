(function(root,factory){"use strict";const api=factory();
if(typeof module==="object"&&module.exports)module.exports=api;
if(root)root.HerdHarborBreederDashboard203=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){"use strict";
const text=x=>String(x==null?"":x).trim(),arr=x=>Array.isArray(x)?x:[];
const species=x=>{const value=text(x).toLowerCase();
 if(["cat","cats","feline"].includes(value))return "Cat";
 if(["cavy","cavies","guinea pig","guinea pigs"].includes(value))return "Cavy";
 return text(x);};
const dateOnly=x=>{x=text(x);if(!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;
 const d=new Date(x+"T00:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===x;};
function build(state,filter={}){
 const animals=arr(state?.animals),byId=new Map(),duplicates=new Set();
 for(const animal of animals){const id=text(animal?.id);if(!id)continue;if(byId.has(id))duplicates.add(id);else byId.set(id,animal);}
 for(const id of duplicates)byId.delete(id);
 const calendar=[],review=[],seen=new Set();
 const push=(event)=>{
  if(!event||!dateOnly(event.date))return;
  const id=text(event.id);if(!id||seen.has(id))return;seen.add(id);
  calendar.push({id,date:event.date,species:event.species||"Unknown",animalId:event.animalId||"",
   label:event.label||"",evidence:event.evidence||"breeder-recorded",
   source:event.source||"",status:event.status||"scheduled"});
 };
 for(const record of arr(state?.breedings)){
  const id=text(record?.id),dam=byId.get(text(record?.femaleId));
  if(!id||!dam){if(id)review.push({id,reason:"Breeding dam missing or ambiguous."});continue;}
  const label=species(dam.species);
  if(dateOnly(record.pregnancyCheckDate)&&!["Delivered","Cancelled","Not pregnant"].includes(record.status))
   push({id:"breeding:"+id+":check",date:record.pregnancyCheckDate,species:label,
    animalId:dam.id,label:"Pregnancy check due",source:"breeding",evidence:"breeder-scheduled"});
  if(dateOnly(record.dueDate)&&!["Delivered","Cancelled","Not pregnant"].includes(record.status))
   push({id:"breeding:"+id+":due",date:record.dueDate,species:label,animalId:dam.id,
    label:"Estimated "+(label==="Rabbit"?"kindling":label==="Dog"?"whelping":label==="Cat"?"queening":label==="Cavy"?"cavy birth":"birth"),
    source:"breeding",evidence:"due-date-estimate-not-confirmation"});
 }
 for(const animal of animals){
  const id=text(animal?.id);if(!id||duplicates.has(id))continue;
  if(species(animal.species)==="Cat")for(const record of arr(animal.felineReproduction?.events)){
   if(record.kind!=="mating"||!dateOnly(record.date))continue;
   const d=new Date(record.date+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+65);
   push({id:"feline:"+id+":"+record.id+":due",date:d.toISOString().slice(0,10),species:"Cat",
    animalId:id,label:"Estimated queening",evidence:"mating-date-estimate-not-confirmation",source:"feline"});
  }
  if(species(animal.species)==="Cavy")for(const record of arr(animal.cavyReproduction?.records)){
   if(dateOnly(record.followUpDate))
    push({id:"cavy:"+id+":"+record.id+":followup",date:record.followUpDate,species:"Cavy",
     animalId:id,label:"Sow follow-up",source:"cavy",evidence:"breeder-scheduled"});
   if(record.type!=="exposure"||!dateOnly(record.endDate))continue;
   const d=new Date(record.endDate+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+68);
   push({id:"cavy:"+id+":"+record.id+":due",date:d.toISOString().slice(0,10),species:"Cavy",
    animalId:id,label:"Estimated cavy birth",source:"cavy",evidence:"exposure-date-estimate-not-confirmation"});
  }
 }
 for(const task of arr(state?.tasks))if(!task.completed&&dateOnly(task.dueDate)&&text(task.id)){
  const animal=byId.get(text(task.animalId));
  push({id:"task:"+task.id,date:task.dueDate,species:species(animal?.species||"Farm"),
   animalId:animal?.id||"",label:task.title||"Follow-up",source:"task",evidence:"user-task"});
 }
 calendar.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 const selected=calendar.filter(x=>(!filter.species||x.species===filter.species)&&
   (!filter.from||x.date>=filter.from)&&(!filter.to||x.date<=filter.to));
 const counts={};for(const item of selected)counts[item.species]=(counts[item.species]||0)+1;
 const litters=arr(state?.litters),birthsBySpecies={};
 for(const litter of litters){
  const dam=byId.get(text(litter.damId));
  if(!dam){review.push({id:text(litter.id),reason:"Litter dam missing or ambiguous."});continue;}
  const key=species(dam.species),row=birthsBySpecies[key]||{litters:0,bornAlive:0,stillborn:0,weaned:0};
  row.litters++;row.bornAlive+=Math.max(0,Number(litter.bornAlive)||0);
  row.stillborn+=Math.max(0,Number(litter.stillborn)||0);
  row.weaned+=Math.max(0,Number(litter.weaned)||0);
  birthsBySpecies[key]=row;
 }
 return {calendar:selected,counts,birthsBySpecies,review,sourceCount:calendar.length};
}
function panelHtml(state,escapeHtml,formatDate,today=""){
 const esc=typeof escapeHtml==="function"?escapeHtml:x=>text(x).replace(/&/g,"&amp;").replace(/</g,"&lt;");
 const fmt=typeof formatDate==="function"?formatDate:x=>x;
 const result=build(state,{from:today||undefined});
 const events=result.calendar.slice(0,12);
 return '<section class="panel" data-hh-breeder-dashboard aria-label="Unified breeding calendar" style="margin-bottom:20px">'+
 '<div class="panel-header"><div><h3>Unified breeding calendar</h3><small>Breeder-entered dates, follow-ups & estimates across species</small></div></div>'+
 (events.length?'<div class="data-table-wrap"><table class="data-table compact-table"><thead><tr><th>Date</th><th>Species</th><th>Next action</th><th>Basis</th></tr></thead><tbody>'+
 events.map(x=>'<tr><td>'+esc(fmt(x.date))+'</td><td>'+esc(x.species)+'</td><td>'+esc(x.label)+'</td><td>'+esc(x.evidence.replace(/-/g," "))+'</td></tr>').join("")+
 '</tbody></table></div>':'<p class="muted">No upcoming breeder events recorded.</p>')+
 '<p class="muted">Dates are planning estimates. They do not establish pregnancy, paternity or veterinary diagnoses.</p>'+
 (result.review.length?'<p class="muted">Records needing identity review: '+result.review.length+'</p>':'')+
 '</section>';
}
return Object.freeze({VERSION:"2.0.3",build,panelHtml});
});