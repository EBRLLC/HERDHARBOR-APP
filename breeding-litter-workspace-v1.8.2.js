(function(root,factory){
  "use strict";
  const api=factory(root);
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.HerdHarborBreedingWorkspace=api;
  if(root&&root.document)api.install();
})(typeof globalThis!=="undefined"?globalThis:this,function(root){
  "use strict";

  const VERSION="1.8.2";
  const PROTECTED_STATUSES=new Set(["sold","deceased","archived","ancestor only"]);
  const HEALTH_TYPES=new Set(["Treatment","Medication","Vaccination","Observation","Veterinary visit"]);
  let installed=false;
  let observer=null;
  let queued=false;
  let activeLitterId="";
  let activeTab="offspring";
  let lossTargetId="";

  const clean=value=>String(value==null?"":value).trim();
  const lower=value=>clean(value).toLowerCase();
  const esc=value=>String(value==null?"":value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));
  const array=(value,key)=>Array.isArray(value?.[key])?value[key]:[];
  const stateNow=()=>{try{return root.HerdHarborApp?.getState?.()||{};}catch{return{};}};
  const today=()=>new Date().toISOString().slice(0,10);
  const fmt=value=>{if(!value)return"—";const d=new Date(`${String(value).slice(0,10)}T12:00:00`);return Number.isNaN(d.getTime())?clean(value):d.toLocaleDateString();};
  const safe=value=>String(value||"").replace(/[^a-zA-Z0-9_-]/g,"").slice(-64)||"record";
  const unique=(values)=>[...new Set(values.map(String).filter(Boolean))];

  function litterById(state,litterId){return array(state,"litters").find(row=>String(row.id)===String(litterId))||null;}
  function animalById(state,animalId){return array(state,"animals").find(row=>String(row.id)===String(animalId))||null;}
  function offspringForLitter(state,litterOrId){
    const litter=typeof litterOrId==="object"?litterOrId:litterById(state,litterOrId);
    if(!litter)return[];
    const ids=new Set(array(litter,"offspringIds").map(String));
    return array(state,"animals").filter(animal=>ids.has(String(animal.id))||String(animal.sourceBirthId||"")===String(litter.id));
  }
  function liveAvailable(litter={}){
    return Math.max(0,Number(litter.bornAlive||0)+Number(litter.fosteredIn||0)-Number(litter.fosteredOut||0)-Number(litter.lostBeforeWeaning||0));
  }
  function protectedAnimal(animal={}){return PROTECTED_STATUSES.has(lower(animal.status));}
  function livingOffspring(state,litterId){return offspringForLitter(state,litterId).filter(animal=>lower(animal.status)!=="deceased");}
  function editableOffspring(state,litterId){return offspringForLitter(state,litterId).filter(animal=>!PROTECTED_STATUSES.has(lower(animal.status)));}
  function cloneState(state){return{...state,animals:[...array(state,"animals")],litters:[...array(state,"litters")],health:[...array(state,"health")]};}
  function replaceLitter(state,litter){state.litters=array(state,"litters").map(row=>String(row.id)===String(litter.id)?litter:row);return state;}

  function applyIdentityUpdates(state={},litterId,updates=[],now=new Date().toISOString()){
    const allowed=new Set(offspringForLitter(state,litterId).map(animal=>String(animal.id)));
    const byId=new Map((Array.isArray(updates)?updates:[]).map(update=>[String(update?.animalId||""),update]));
    let changed=0;
    const next=cloneState(state);
    next.animals=array(state,"animals").map(animal=>{
      const id=String(animal.id);
      const update=allowed.has(id)?byId.get(id):null;
      if(!update)return animal;
      const patch={};
      ["name","color","tattoo","tag"].forEach(key=>{if(Object.prototype.hasOwnProperty.call(update,key))patch[key]=clean(update[key]);});
      if(Object.prototype.hasOwnProperty.call(update,"sex")&&["Unknown","Female","Male"].includes(clean(update.sex)))patch.sex=clean(update.sex);
      const differs=Object.entries(patch).some(([key,value])=>String(animal[key]||"")!==String(value));
      if(!differs)return animal;
      changed+=1;
      return{...animal,...patch,updatedAt:now};
    });
    return{state:next,updated:changed};
  }

  function healthRecordId(kind,litterId,animalId,now,index=0){
    const stamp=String(now||Date.now()).replace(/\D/g,"").slice(-18)||String(Date.now());
    return`health_${safe(kind)}_${safe(litterId)}_${safe(animalId)}_${stamp}_${index}`;
  }

  function addBulkWeights(state={},litterId,entries=[],options={},now=new Date().toISOString()){
    const allowed=new Set(offspringForLitter(state,litterId).map(animal=>String(animal.id)));
    const date=clean(options.date)||String(now).slice(0,10);
    const weightUnit=["lb","lb+oz","oz","kg","g"].includes(clean(options.weightUnit))?clean(options.weightUnit):"lb";
    const records=[];
    (Array.isArray(entries)?entries:[]).forEach((entry,index)=>{
      const animalId=String(entry?.animalId||"");
      if(!allowed.has(animalId)||entry?.weight===""||entry?.weight==null)return;
      const weight=Number(entry.weight);
      const ounces=entry.weightOunces===""||entry.weightOunces==null?0:Number(entry.weightOunces);
      if(!Number.isFinite(weight)||weight<0)return;
      if(weightUnit==="lb+oz"&&(!Number.isFinite(ounces)||ounces<0||ounces>=16))return;
      records.push({
        id:healthRecordId("weight",litterId,animalId,now,index),animalId,date,type:"Weight",details:"Litter weight",
        weight:String(weight),weightUnit,weightOunces:weightUnit==="lb+oz"?String(ounces):"",followUpDate:"",createdAt:now
      });
    });
    if(!records.length)return{state,created:[]};
    const next=cloneState(state);next.health=[...array(state,"health"),...records];
    return{state:next,created:records};
  }

  function addBulkHealth(state={},litterId,animalIds=[],options={},now=new Date().toISOString()){
    const allowed=new Set(offspringForLitter(state,litterId).map(animal=>String(animal.id)));
    const selected=unique(Array.isArray(animalIds)?animalIds:[]).filter(id=>allowed.has(id));
    const type=HEALTH_TYPES.has(clean(options.type))?clean(options.type):"Observation";
    const date=clean(options.date)||String(now).slice(0,10);
    const details=clean(options.details);
    if(!selected.length||!details)return{state,created:[]};
    const records=selected.map((animalId,index)=>({
      id:healthRecordId("batch",litterId,animalId,now,index),animalId,date,type,details,
      weight:"",weightUnit:"lb",weightOunces:"",followUpDate:clean(options.followUpDate),createdAt:now
    }));
    const next=cloneState(state);next.health=[...array(state,"health"),...records];
    return{state:next,created:records};
  }

  function recordLoss(state={},litterId,animalId,options={},now=new Date().toISOString()){
    const litter=litterById(state,litterId);const animal=animalById(state,animalId);
    if(!litter||!animal||!offspringForLitter(state,litter).some(row=>String(row.id)===String(animalId)))return{state,changed:false};
    if(lower(animal.status)==="deceased")return{state,changed:false};
    const next=cloneState(state);
    const date=clean(options.date)||String(now).slice(0,10);
    const reason=clean(options.reason)||"Loss recorded";
    const wasWeaned=Boolean(clean(animal.weanedDate));
    next.animals=array(state,"animals").map(row=>String(row.id)===String(animalId)?{...row,status:"Deceased",deathDate:date,deathReason:reason,updatedAt:now}:row);
    let nextLitter={...litter,updatedAt:now};
    if(!wasWeaned){
      const base=Math.max(0,Number(litter.bornAlive||0)+Number(litter.fosteredIn||0)-Number(litter.fosteredOut||0));
      nextLitter.lostBeforeWeaning=String(Math.min(base,Math.max(0,Number(litter.lostBeforeWeaning||0)+1)));
    }
    replaceLitter(next,nextLitter);
    const health={
      id:healthRecordId("loss",litterId,animalId,now,0),animalId,date,type:"Observation",
      details:`Loss recorded: ${reason}`,weight:"",weightUnit:"lb",weightOunces:"",followUpDate:"",createdAt:now
    };
    next.health=[...array(state,"health"),health];
    return{state:next,changed:true,litter:nextLitter,health};
  }

  function weanSelected(state={},litterId,animalIds=[],options={},now=new Date().toISOString()){
    const litter=litterById(state,litterId);if(!litter)return{state,updated:[]};
    const offspring=offspringForLitter(state,litter);
    const allowed=new Set(offspring.filter(animal=>lower(animal.status)!=="deceased").map(animal=>String(animal.id)));
    const selected=new Set(unique(Array.isArray(animalIds)?animalIds:[]).filter(id=>allowed.has(id)));
    if(!selected.size)return{state,updated:[]};
    const date=clean(options.date)||String(now).slice(0,10);const location=clean(options.location);
    const updated=[];const next=cloneState(state);
    next.animals=array(state,"animals").map(animal=>{
      const id=String(animal.id);if(!selected.has(id)||clean(animal.weanedDate))return animal;
      updated.push(id);return{...animal,weanedDate:date,...(location?{location}:{}),updatedAt:now};
    });
    if(!updated.length)return{state,updated:[]};
    const linkedIds=new Set(offspring.map(animal=>String(animal.id)));
    const marked=next.animals.filter(animal=>linkedIds.has(String(animal.id))&&clean(animal.weanedDate)).length;
    const nextLitter={...litter,weaned:String(Math.min(liveAvailable(litter),Math.max(Number(litter.weaned||0),marked))),updatedAt:now};
    replaceLitter(next,nextLitter);
    return{state:next,updated,litter:nextLitter};
  }

  function setDisposition(state={},litterId,animalIds=[],disposition="retain",now=new Date().toISOString()){
    const allowed=new Set(offspringForLitter(state,litterId).filter(animal=>!protectedAnimal(animal)).map(animal=>String(animal.id)));
    const selected=new Set(unique(Array.isArray(animalIds)?animalIds:[]).filter(id=>allowed.has(id)));
    const status=disposition==="for-sale"?"For Sale":disposition==="reserved"?"Reserved":"Active";
    if(!selected.size)return{state,updated:[]};
    const updated=[];const next=cloneState(state);
    next.animals=array(state,"animals").map(animal=>{
      const id=String(animal.id);if(!selected.has(id)||PROTECTED_STATUSES.has(lower(animal.status)))return animal;
      if(clean(animal.status)===status)return animal;updated.push(id);return{...animal,status,updatedAt:now};
    });
    return{state:next,updated,status};
  }

  function summary(state={},litterId){
    const litter=litterById(state,litterId);if(!litter)return null;
    const offspring=offspringForLitter(state,litter);
    return{litter,offspring,bornAlive:Number(litter.bornAlive||0),living:offspring.filter(a=>lower(a.status)!=="deceased").length,weaned:Number(litter.weaned||0),available:liveAvailable(litter)};
  }

  function commit(next,message){
    const ok=root.HerdHarborApp?.commitState?.(next,message);
    root.HerdHarborApp?.refresh?.();
    try{root.dispatchEvent?.(new root.CustomEvent("herdharbor:litter-workspace-changed",{detail:{litterId:activeLitterId}}));}catch{}
    render();return ok;
  }

  function sexOptions(value,species){
    const rabbit=lower(species)==="rabbit";
    return["Unknown","Female","Male"].map(item=>`<option value="${item}" ${item===clean(value||"Unknown")?"selected":""}>${item}${rabbit&&item==="Female"?" (Doe)":rabbit&&item==="Male"?" (Buck)":""}</option>`).join("");
  }
  function selectableRow(animal,context){
    const disabled=context==="wean"?(lower(animal.status)==="deceased"||Boolean(clean(animal.weanedDate))):protectedAnimal(animal);
    return`<label class="hh-bw-select-row ${disabled?"is-disabled":""}"><input type="checkbox" data-hh-bw-select value="${esc(animal.id)}" ${disabled?"disabled":""}><span><strong>${esc(animal.name||animal.tag||"Offspring")}</strong><small>${esc([animal.sex,animal.color,animal.status,animal.weanedDate?`Weaned ${fmt(animal.weanedDate)}`:""].filter(Boolean).join(" · "))}</small></span></label>`;
  }

  function offspringPanel(state,litter,offspring){
    const dam=animalById(state,litter.damId);const species=dam?.species||offspring[0]?.species||"";
    return`<form id="hh-bw-offspring-form"><div class="hh-bw-toolbar"><div><strong>Bulk offspring editor</strong><span>Update the whole litter once. Pedigree and birth links stay untouched.</span></div><button class="button button-primary button-small" type="submit">Save litter updates</button></div>
      ${lossTargetId?(()=>{const target=animalById(state,lossTargetId);return target?`<section class="hh-bw-loss-box"><div><strong>Record loss — ${esc(target.name||"Offspring")}</strong><span>This keeps the animal profile for breeding statistics and history.</span></div><label>Date<input type="date" name="lossDate" value="${today()}"></label><label>Reason<input name="lossReason" placeholder="Reason or observation" required></label><div class="hh-bw-loss-actions"><button type="button" class="button button-ghost button-small" data-hh-bw-loss-cancel>Cancel</button><button type="button" class="button button-danger button-small" data-hh-bw-loss-confirm>Record loss</button></div></section>`:"";})():""}
      <div class="hh-bw-offspring-grid">${offspring.map(animal=>`<article class="hh-bw-offspring-card" data-animal-id="${esc(animal.id)}"><div class="hh-bw-card-head"><div><strong>${esc(animal.name||"Offspring")}</strong><small>${esc(animal.status||"Active")}</small></div><button type="button" class="button button-ghost button-small" data-hh-bw-open-animal="${esc(animal.id)}">Profile</button></div><div class="hh-bw-fields"><label>Name<input data-hh-bw-field="name" value="${esc(animal.name||"")}"></label><label>Sex<select data-hh-bw-field="sex">${sexOptions(animal.sex,species)}</select></label><label>Color<input data-hh-bw-field="color" value="${esc(animal.color||"")}"></label><label>Tattoo<input data-hh-bw-field="tattoo" value="${esc(animal.tattoo||"")}"></label><label>Tag / ID<input data-hh-bw-field="tag" value="${esc(animal.tag||"")}"></label></div>${lower(animal.status)!=="deceased"?`<button type="button" class="hh-bw-text-danger" data-hh-bw-loss="${esc(animal.id)}">Record loss</button>`:`<span class="hh-bw-deceased-note">Loss recorded ${animal.deathDate?`· ${esc(fmt(animal.deathDate))}`:""}</span>`}</article>`).join("")}</div></form>`;
  }

  function weightsPanel(state,litter,offspring){
    const live=offspring.filter(animal=>lower(animal.status)!=="deceased");
    return`<form id="hh-bw-weights-form"><div class="hh-bw-toolbar"><div><strong>Record litter weights</strong><span>One save creates an individual Weight record for every entered animal.</span></div><button class="button button-primary button-small" type="submit">Save weights</button></div><div class="hh-bw-inline-fields"><label>Date<input type="date" name="date" value="${today()}" required></label><label>Unit<select name="weightUnit"><option>oz</option><option>lb</option><option>lb+oz</option><option>g</option><option>kg</option></select></label></div><div class="hh-bw-weight-list">${live.map(animal=>`<label><span><strong>${esc(animal.name||"Offspring")}</strong><small>${esc([animal.sex,animal.color].filter(Boolean).join(" · "))}</small></span><input type="number" min="0" step="0.01" data-hh-bw-weight="${esc(animal.id)}" placeholder="—"></label>`).join("")}</div></form>`;
  }

  function healthPanel(state,litter,offspring){
    const live=offspring.filter(animal=>lower(animal.status)!=="deceased");
    return`<form id="hh-bw-health-form"><div class="hh-bw-toolbar"><div><strong>Apply health record to litter</strong><span>Choose the animals once; HerdHarbor writes the individual histories.</span></div><button class="button button-primary button-small" type="submit">Save health records</button></div><div class="hh-bw-inline-fields"><label>Date<input type="date" name="date" value="${today()}" required></label><label>Type<select name="type">${[...HEALTH_TYPES].map(type=>`<option>${esc(type)}</option>`).join("")}</select></label><label>Follow-up<input type="date" name="followUpDate"></label></div><label class="hh-bw-details">Details<textarea name="details" rows="3" required placeholder="Treatment, observation, vaccination, medication, etc."></textarea></label><div class="hh-bw-select-head"><strong>Apply to</strong><button type="button" data-hh-bw-select-all>All living offspring</button></div><div class="hh-bw-select-list">${live.map(animal=>selectableRow(animal,"health")).join("")}</div></form>`;
  }

  function weaningPanel(state,litter,offspring){
    const remaining=offspring.filter(animal=>lower(animal.status)!=="deceased"&&!clean(animal.weanedDate));
    return`<form id="hh-bw-weaning-form"><div class="hh-bw-toolbar"><div><strong>Weaning</strong><span>Mark the litter in one action while preserving each animal's own weaning date.</span></div><div class="hh-bw-toolbar-actions"><button type="button" class="button button-ghost button-small" data-hh-bw-wean-all ${remaining.length?"":"disabled"}>Wean all remaining</button><button class="button button-primary button-small" type="submit" ${remaining.length?"":"disabled"}>Wean selected</button></div></div><div class="hh-bw-inline-fields"><label>Date<input type="date" name="date" value="${today()}" required></label><label>Move to location<input name="location" placeholder="Optional"></label></div>${remaining.length?`<div class="hh-bw-select-head"><strong>${remaining.length} remaining</strong><button type="button" data-hh-bw-select-all>Select all</button></div><div class="hh-bw-select-list">${offspring.map(animal=>selectableRow(animal,"wean")).join("")}</div>`:`<div class="hh-bw-empty"><strong>Weaning is complete.</strong><span>${Number(litter.weaned||0)} offspring are recorded as weaned.</span></div>`}</form>`;
  }

  function dispositionPanel(state,litter,offspring){
    const editable=offspring.filter(animal=>!protectedAnimal(animal));
    return`<div id="hh-bw-disposition-panel"><div class="hh-bw-toolbar"><div><strong>Offspring decisions</strong><span>Retain, list for sale, or reserve multiple offspring at once.</span></div></div>${editable.length?`<div class="hh-bw-select-head"><strong>Select offspring</strong><button type="button" data-hh-bw-select-all>All available</button></div><div class="hh-bw-select-list">${offspring.map(animal=>selectableRow(animal,"disposition")).join("")}</div><div class="hh-bw-decision-actions"><button class="button button-primary" type="button" data-hh-bw-disposition="retain">Retain</button><button class="button button-ghost" type="button" data-hh-bw-disposition="for-sale">For Sale</button><button class="button button-ghost" type="button" data-hh-bw-disposition="reserved">Reserved</button></div>`:`<div class="hh-bw-empty"><strong>No offspring are available for a disposition change.</strong></div>`}</div>`;
  }

  function panelHtml(state,litter,offspring){
    if(activeTab==="weights")return weightsPanel(state,litter,offspring);
    if(activeTab==="health")return healthPanel(state,litter,offspring);
    if(activeTab==="weaning")return weaningPanel(state,litter,offspring);
    if(activeTab==="decisions")return dispositionPanel(state,litter,offspring);
    return offspringPanel(state,litter,offspring);
  }

  function render(){
    if(!root.document||!activeLitterId)return false;
    const state=stateNow();const info=summary(state,activeLitterId);if(!info){close();return false;}
    const {litter,offspring}=info;const dam=animalById(state,litter.damId);const sire=animalById(state,litter.sireId);
    let overlay=root.document.getElementById("hh-breeding-litter-workspace");
    if(!overlay){overlay=root.document.createElement("div");overlay.id="hh-breeding-litter-workspace";overlay.className="hh-bw-overlay";root.document.body.appendChild(overlay);}
    overlay.innerHTML=`<section class="hh-bw-shell" role="dialog" aria-modal="true" aria-labelledby="hh-bw-title"><header class="hh-bw-header"><div><span class="eyebrow">Breeding workspace</span><h2 id="hh-bw-title">${esc(dam?.name||"Dam")} × ${esc(sire?.name||"Sire")}</h2><p>Born ${fmt(litter.birthDate)} · ${esc(dam?.species||offspring[0]?.species||"")} ${esc(dam?.breed||offspring[0]?.breed||"")}</p></div><button type="button" class="hh-bw-close" data-hh-bw-close aria-label="Close">×</button></header><div class="hh-bw-stats"><div><span>Born alive</span><strong>${info.bornAlive}</strong></div><div><span>Current profiles</span><strong>${offspring.length}</strong></div><div><span>Living</span><strong>${info.living}</strong></div><div><span>Weaned</span><strong>${info.weaned} / ${info.available}</strong></div></div><nav class="hh-bw-tabs" aria-label="Litter tools">${[["offspring","Offspring"],["weights","Weights"],["health","Health"],["weaning","Weaning"],["decisions","Decisions"]].map(([id,label])=>`<button type="button" data-hh-bw-tab="${id}" class="${activeTab===id?"active":""}">${label}</button>`).join("")}</nav><main class="hh-bw-content">${panelHtml(state,litter,offspring)}</main></section>`;
    root.document.documentElement.classList.add("hh-bw-open");
    return true;
  }

  function open(litterId){activeLitterId=clean(litterId);activeTab="offspring";lossTargetId="";return render();}
  function close(){root.document?.getElementById("hh-breeding-litter-workspace")?.remove();root.document?.documentElement?.classList.remove("hh-bw-open");activeLitterId="";lossTargetId="";}
  function selectedIds(container){return[...container.querySelectorAll('[data-hh-bw-select]:checked')].map(input=>input.value);}
  function selectAll(container){container.querySelectorAll('[data-hh-bw-select]:not(:disabled)').forEach(input=>{input.checked=true;});}

  function onClick(event){
    const manage=event.target.closest?.("[data-hh-bw-manage-litter]");if(manage){event.preventDefault();event.stopPropagation();open(manage.dataset.hhBwManageLitter);return;}
    const overlay=event.target.closest?.("#hh-breeding-litter-workspace");if(!overlay)return;
    if(event.target.closest("[data-hh-bw-close]")){event.preventDefault();close();return;}
    const tab=event.target.closest("[data-hh-bw-tab]");if(tab){event.preventDefault();activeTab=tab.dataset.hhBwTab;lossTargetId="";render();return;}
    const profile=event.target.closest("[data-hh-bw-open-animal]");if(profile){event.preventDefault();close();root.HerdHarborFlowPhase2?.openAnimalProfile?.(profile.dataset.hhBwOpenAnimal,"overview",{history:"push"});return;}
    const loss=event.target.closest("[data-hh-bw-loss]");if(loss){event.preventDefault();lossTargetId=loss.dataset.hhBwLoss;render();return;}
    if(event.target.closest("[data-hh-bw-loss-cancel]")){event.preventDefault();lossTargetId="";render();return;}
    if(event.target.closest("[data-hh-bw-loss-confirm]")){event.preventDefault();const form=overlay.querySelector("#hh-bw-offspring-form");const date=form?.elements?.lossDate?.value;const reason=form?.elements?.lossReason?.value;if(!clean(reason))return;const result=recordLoss(stateNow(),activeLitterId,lossTargetId,{date,reason});if(result.changed){lossTargetId="";commit(result.state,"Offspring loss recorded and litter totals updated.");}return;}
    if(event.target.closest("[data-hh-bw-select-all]")){event.preventDefault();selectAll(overlay);return;}
    if(event.target.closest("[data-hh-bw-wean-all]")){event.preventDefault();const form=overlay.querySelector("#hh-bw-weaning-form");const state=stateNow();const ids=offspringForLitter(state,activeLitterId).filter(a=>lower(a.status)!=="deceased"&&!clean(a.weanedDate)).map(a=>a.id);const result=weanSelected(state,activeLitterId,ids,{date:form?.elements?.date?.value,location:form?.elements?.location?.value});if(result.updated.length)commit(result.state,`${result.updated.length} offspring marked weaned.`);return;}
    const disposition=event.target.closest("[data-hh-bw-disposition]");if(disposition){event.preventDefault();const ids=selectedIds(overlay);const result=setDisposition(stateNow(),activeLitterId,ids,disposition.dataset.hhBwDisposition);if(result.updated.length)commit(result.state,`${result.updated.length} offspring updated to ${result.status}.`);return;}
  }

  function onSubmit(event){
    const form=event.target;if(!activeLitterId||!form?.closest?.("#hh-breeding-litter-workspace"))return;
    event.preventDefault();
    if(form.id==="hh-bw-offspring-form"){
      const updates=[...form.querySelectorAll("[data-animal-id]")].map(card=>({animalId:card.dataset.animalId,...Object.fromEntries([...card.querySelectorAll("[data-hh-bw-field]")].map(input=>[input.dataset.hhBwField,input.value]))}));
      const result=applyIdentityUpdates(stateNow(),activeLitterId,updates);if(result.updated)commit(result.state,`${result.updated} offspring profile${result.updated===1?"":"s"} updated.`);return;
    }
    if(form.id==="hh-bw-weights-form"){
      const entries=[...form.querySelectorAll("[data-hh-bw-weight]")].map(input=>({animalId:input.dataset.hhBwWeight,weight:input.value}));
      const result=addBulkWeights(stateNow(),activeLitterId,entries,{date:form.elements.date.value,weightUnit:form.elements.weightUnit.value});if(result.created.length)commit(result.state,`${result.created.length} litter weight record${result.created.length===1?"":"s"} added.`);return;
    }
    if(form.id==="hh-bw-health-form"){
      const ids=selectedIds(form);const result=addBulkHealth(stateNow(),activeLitterId,ids,{date:form.elements.date.value,type:form.elements.type.value,details:form.elements.details.value,followUpDate:form.elements.followUpDate.value});if(result.created.length)commit(result.state,`${result.created.length} health record${result.created.length===1?"":"s"} added from one litter action.`);return;
    }
    if(form.id==="hh-bw-weaning-form"){
      const ids=selectedIds(form);const result=weanSelected(stateNow(),activeLitterId,ids,{date:form.elements.date.value,location:form.elements.location.value});if(result.updated.length)commit(result.state,`${result.updated.length} offspring marked weaned.`);return;
    }
  }

  function enhanceLittersView(){
    if(!root.document)return;
    root.document.querySelectorAll('#view-litters [data-edit-litter]').forEach(edit=>{
      const footer=edit.closest(".animal-card-footer")||edit.parentElement;const id=edit.dataset.editLitter;if(!footer||!id||footer.querySelector(`[data-hh-bw-manage-litter="${String(id).replace(/"/g,"\\\"")}"]`))return;
      const button=root.document.createElement("button");button.type="button";button.className="button button-primary button-small";button.dataset.hhBwManageLitter=id;button.textContent="Manage litter";footer.insertBefore(button,footer.firstChild);
    });
  }
  function schedule(){if(queued)return;queued=true;(root.requestAnimationFrame||root.setTimeout)(()=>{queued=false;enhanceLittersView();},0);}
  function install(){if(installed||!root.document)return API;installed=true;root.addEventListener("click",onClick,true);root.addEventListener("submit",onSubmit,true);observer=new root.MutationObserver(schedule);if(root.document.body)observer.observe(root.document.body,{childList:true,subtree:true});schedule();return API;}
  function uninstall(){observer?.disconnect?.();observer=null;root.removeEventListener?.("click",onClick,true);root.removeEventListener?.("submit",onSubmit,true);installed=false;queued=false;close();}

  const API=Object.freeze({VERSION,litterById,offspringForLitter,liveAvailable,applyIdentityUpdates,addBulkWeights,addBulkHealth,recordLoss,weanSelected,setDisposition,summary,open,close,install,uninstall});
  return API;
});