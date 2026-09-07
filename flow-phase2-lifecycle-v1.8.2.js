(function(root,factory){
  "use strict";
  const api=factory(root);
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.HerdHarborFlowPhase2Lifecycle=api;
  if(root&&root.document)api.install();
})(typeof globalThis!=="undefined"?globalThis:this,function(root){
  "use strict";

  const VERSION="1.8.2";
  const STAGES=Object.freeze([
    {id:"planned",label:"Pairing"},
    {id:"bred",label:"Bred"},
    {id:"check",label:"Check"},
    {id:"confirmed",label:"Confirmed"},
    {id:"due",label:"Due"},
    {id:"birth",label:"Birth"},
    {id:"weaning",label:"Weaning"}
  ]);
  const TERMINAL_NEGATIVE=new Set(["not pregnant","cancelled","canceled"]);
  let installed=false;
  let observer=null;
  let queued=false;
  let pendingReturn=null;

  const clean=value=>String(value==null?"":value).trim();
  const lower=value=>clean(value).toLowerCase();
  const esc=value=>String(value==null?"":value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));
  const cssEscape=value=>{const text=String(value);try{return root.CSS?.escape?root.CSS.escape(text):text.replace(/["\\]/g,"\\$&");}catch{return text.replace(/["\\]/g,"\\$&");}};
  const array=(value,key)=>Array.isArray(value?.[key])?value[key]:[];
  const stateNow=()=>{try{return root.HerdHarborApp?.getState?.()||{};}catch{return{};}};
  const fmt=value=>{if(!value)return"—";const d=new Date(`${String(value).slice(0,10)}T12:00:00`);return Number.isNaN(d.getTime())?clean(value):d.toLocaleDateString();};
  const animalById=(state,id)=>array(state,"animals").find(row=>String(row.id)===String(id))||null;
  const animalName=(state,id)=>animalById(state,id)?.name||"Unknown animal";

  function offspringForLitter(state,litter){
    const ids=new Set(Array.isArray(litter?.offspringIds)?litter.offspringIds.map(String):[]);
    return array(state,"animals").filter(animal=>ids.has(String(animal.id))||String(animal.sourceBirthId||"")===String(litter?.id||""));
  }

  function linkedLitter(state,breeding){
    return array(state,"litters").find(litter=>String(litter.breedingId||"")===String(breeding?.id||""))||null;
  }

  function liveAvailable(litter={}){
    return Math.max(0,Number(litter.bornAlive||0)+Number(litter.fosteredIn||0)-Number(litter.fosteredOut||0)-Number(litter.lostBeforeWeaning||0));
  }

  function breedingStage(record={},litter=null,today=new Date().toISOString().slice(0,10)){
    const status=lower(record.status||"Bred");
    const check=lower(record.pregnancyCheckStatus||"Not checked");
    if(TERMINAL_NEGATIVE.has(status)||check==="negative")return{index:2,id:"check",terminal:true,outcome:status.includes("cancel")?"Cancelled":"Not pregnant"};
    if(litter){
      const available=liveAvailable(litter);
      const weaned=Math.max(0,Number(litter.weaned||0));
      const complete=available===0||weaned>=available;
      return{index:complete?6:5,id:complete?"weaning":"birth",terminal:false,outcome:complete?"Weaning complete":"Birth recorded"};
    }
    if(status==="delivered")return{index:5,id:"birth",terminal:false,outcome:"Birth record needed"};
    if(status==="due soon"||(record.dueDate&&String(record.dueDate).slice(0,10)<=today))return{index:4,id:"due",terminal:false,outcome:"Due / birth next"};
    if(status==="confirmed pregnant"||check==="positive")return{index:3,id:"confirmed",terminal:false,outcome:"Pregnancy confirmed"};
    if(status==="pregnancy check due"||(record.pregnancyCheckDate&&String(record.pregnancyCheckDate).slice(0,10)<=today&&check==="not checked"))return{index:2,id:"check",terminal:false,outcome:"Pregnancy check due"};
    if(status==="planned")return{index:0,id:"planned",terminal:false,outcome:"Pairing planned"};
    return{index:1,id:"bred",terminal:false,outcome:"Bred"};
  }

  function lifecycleAction(record={},litter=null,today=new Date().toISOString().slice(0,10)){
    const stage=breedingStage(record,litter,today);
    if(stage.terminal)return{kind:"edit-breeding",label:"Review breeding"};
    if(!litter&&stage.index>=4)return{kind:"record-birth",label:"Record birth"};
    if(litter){
      const available=liveAvailable(litter),weaned=Math.max(0,Number(litter.weaned||0));
      if(available>0&&weaned<available)return{kind:"edit-litter",label:"Update weaning"};
      const offspring=Number(litter.bornAlive||0)>0;
      return offspring?{kind:"create-offspring",label:"Add offspring records"}:{kind:"edit-litter",label:"View birth"};
    }
    if(stage.index===2)return{kind:"edit-breeding",label:"Record pregnancy check"};
    return{kind:"edit-breeding",label:"Update breeding"};
  }

  function ownershipRows(state,animalId){
    const animal=animalById(state,animalId)||{};
    const rows=[];
    if(animal.breeder)rows.push({date:animal.dob||"",type:"breeder",title:`Bred by ${animal.breeder}`,detail:"Original breeder recorded on the animal."});
    array(animal,"ownershipHistory").forEach(item=>{
      rows.push({
        date:item.date||item.at||"",
        type:item.type||"transfer",
        title:item.from&&item.to?`${item.from} → ${item.to}`:item.to?`Transferred to ${item.to}`:item.from?`Received from ${item.from}`:"Ownership transfer",
        detail:[item.transferId,item.sourceSaleNumber].filter(Boolean).join(" · ")
      });
    });
    array(state,"sales").filter(sale=>array(sale,"items").some(item=>String(item.animalId)===String(animalId))).forEach(sale=>rows.push({date:sale.saleDate||sale.completedAt||"",type:"sale",title:`${sale.status||"Sale"}${sale.customerName?` · ${sale.customerName}`:""}`,detail:sale.transferNumber||sale.saleNumber||sale.invoiceNumber||""}));
    array(state,"transfers").filter(item=>String(item.animalId||"")===String(animalId)||array(item,"animalIds").map(String).includes(String(animalId))).forEach(item=>rows.push({date:item.transferDate||item.createdAt||item.date||"",type:"transfer",title:`${item.direction||"Transfer"} · ${item.senderName||item.recipientName||"HerdHarbor transfer"}`,detail:item.transferNumber||item.transferId||item.sourceTransferId||""}));
    const seen=new Set();
    return rows.filter(row=>{const key=[row.date,row.type,row.title,row.detail].join("|");if(seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
  }

  function offspringDisposition(state,animal={}){
    const status=clean(animal.status)||"Active";
    const sold=array(state,"sales").some(sale=>lower(sale.status)==="completed"&&array(sale,"items").some(item=>String(item.animalId)===String(animal.id)));
    const transferred=array(animal,"ownershipHistory").length>0||array(state,"transfers").some(item=>String(item.animalId||"")===String(animal.id)||array(item,"animalIds").map(String).includes(String(animal.id)));
    if(transferred)return"Transferred";
    if(sold||lower(status)==="sold")return"Sold";
    if(lower(status)==="for sale")return"For sale";
    if(lower(status)==="reserved")return"Reserved";
    return"Retained";
  }

  function stageStepper(stage){
    return`<ol class="hh-p2-life-steps" aria-label="Breeding lifecycle">${STAGES.map((item,index)=>{
      const cls=stage.terminal?(index<stage.index?"is-complete":index===stage.index?"is-terminal":""):(index<stage.index?"is-complete":index===stage.index?"is-current":"");
      return`<li class="${cls}"><span>${index+1}</span><b>${esc(item.label)}</b></li>`;
    }).join("")}</ol>`;
  }

  function breedingCard(state,record){
    const litter=linkedLitter(state,record);
    const stage=breedingStage(record,litter);
    const action=lifecycleAction(record,litter);
    const offspring=litter?offspringForLitter(state,litter):[];
    const mateId=String(record.femaleId||"")===String(activeAnimalId())?record.maleId:record.femaleId;
    const checkText=record.pregnancyCheckStatus&&record.pregnancyCheckStatus!=="Not checked"?record.pregnancyCheckStatus:(record.pregnancyCheckDate?`Due ${fmt(record.pregnancyCheckDate)}`:"Not scheduled");
    const birthText=litter?`${Number(litter.bornAlive||0)} alive · ${Number(litter.stillborn||0)} stillborn`:record.dueDate?`Expected ${fmt(record.dueDate)}`:"Not recorded";
    const weanText=litter?`${Number(litter.weaned||0)} / ${liveAvailable(litter)} weaned${litter.expectedWeanDate?` · Expected ${fmt(litter.expectedWeanDate)}`:""}`:"After birth";
    return`<article class="hh-p2-life-card" data-hh-p2-breeding-id="${esc(record.id)}">
      <div class="hh-p2-life-head"><div><span class="eyebrow">${esc(stage.outcome)}</span><h4>${esc(animalName(state,record.femaleId))} × ${esc(animalName(state,record.maleId))}</h4><p>${fmt(record.breedingDate)}${mateId?` · Mate: ${esc(animalName(state,mateId))}`:""}</p></div><span class="badge ${stage.terminal?"gray":stage.index>=4?"warning":"green"}">${esc(record.status||stage.outcome)}</span></div>
      ${stageStepper(stage)}
      <div class="hh-p2-life-facts"><div><span>Pregnancy check</span><strong>${esc(checkText)}</strong></div><div><span>Due / birth</span><strong>${esc(birthText)}</strong></div><div><span>Weaning</span><strong>${esc(weanText)}</strong></div><div><span>Offspring records</span><strong>${offspring.length}</strong></div></div>
      ${offspring.length?`<div class="hh-p2-offspring-strip">${offspring.slice(0,12).map(animal=>`<button type="button" data-hh-p2-open-offspring="${esc(animal.id)}"><strong>${esc(animal.name||animal.tag||"Offspring")}</strong><span>${esc([animal.sex,animal.color,offspringDisposition(state,animal)].filter(Boolean).join(" · "))}</span></button>`).join("")}</div>`:""}
      <div class="hh-p2-life-actions"><button type="button" class="button button-primary button-small" data-hh-p2-life-action="${esc(action.kind)}" data-breeding-id="${esc(record.id)}" ${litter?`data-litter-id="${esc(litter.id)}"`:""}>${esc(action.label)}</button><button type="button" class="button button-ghost button-small" data-hh-p2-life-action="edit-breeding" data-breeding-id="${esc(record.id)}">Breeding details</button>${litter?`<button type="button" class="button button-ghost button-small" data-hh-p2-life-action="edit-litter" data-litter-id="${esc(litter.id)}">Birth details</button>`:""}</div>
    </article>`;
  }

  function activeAnimalId(){
    const view=root.document?.querySelector("#view-animal-profile.hh-p2-profile-view.active");
    return clean(view?.querySelector("[data-hh-p2-animal-id]")?.dataset?.hhP2AnimalId||parseAnimalIdFromHash());
  }

  function parseAnimalIdFromHash(){
    try{return root.HerdHarborFlowPhase2?.parseProfileHash?.(root.location?.hash||"")?.animalId||"";}catch{return"";}
  }

  function renderLifecyclePanel(panel,state,animalId){
    const records=array(state,"breedings").filter(record=>String(record.femaleId)===String(animalId)||String(record.maleId)===String(animalId)).sort((a,b)=>String(b.breedingDate||"").localeCompare(String(a.breedingDate||"")));
    const animal=animalById(state,animalId)||{};
    const canBreed=!new Set(["sold","deceased","archived","ancestor only"]).has(lower(animal.status));
    panel.innerHTML=`<div class="hh-p2-panel-head"><div><h3>Breeding lifecycle</h3><p>Pairing, pregnancy checks, birth, weaning, and offspring stay connected to the same canonical records.</p></div>${canBreed?'<button type="button" class="button button-primary button-small" data-hh-p2-action="breeding">Start breeding</button>':""}</div>${records.length?`<div class="hh-p2-life-list">${records.map(record=>breedingCard(state,record)).join("")}</div>`:'<div class="hh-p2-empty"><strong>No breeding history is connected to this animal yet.</strong></div>'}`;
    panel.dataset.hhP2LifecycleEnhanced="1";
  }

  function renderOwnership(panel,state,animalId){
    const rows=ownershipRows(state,animalId);
    const existing=panel.querySelector(".hh-p2-ownership");
    existing?.remove();
    const section=root.document.createElement("section");
    section.className="panel hh-p2-ownership";
    section.innerHTML=`<div class="panel-header"><h3>Ownership & provenance</h3><small>Breeder, sale, and transfer chain</small></div>${rows.length?`<div class="hh-p2-ownership-list">${rows.slice(0,20).map(row=>`<article><span>${esc(fmt(row.date))}</span><div><strong>${esc(row.title)}</strong>${row.detail?`<small>${esc(row.detail)}</small>`:""}</div></article>`).join("")}</div>`:'<p class="muted">No sale or transfer history has been recorded for this animal.</p>'}`;
    panel.appendChild(section);
  }

  function enhanceProfile(){
    const view=root.document?.querySelector("#view-animal-profile.hh-p2-profile-view.active");
    if(!view)return false;
    const parsed=root.HerdHarborFlowPhase2?.parseProfileHash?.(root.location?.hash||"");
    const animalId=clean(parsed?.animalId);if(!animalId)return false;
    let marker=view.querySelector("[data-hh-p2-animal-id]");
    if(!marker){marker=view.querySelector(".hh-p2-profile-shell");if(marker)marker.dataset.hhP2AnimalId=animalId;}
    const panel=view.querySelector("[data-hh-p2-panel]");if(!panel)return false;
    const tab=clean(panel.dataset.hhP2Panel);
    const state=stateNow();
    if(tab==="breeding"&&!panel.dataset.hhP2LifecycleEnhanced)renderLifecyclePanel(panel,state,animalId);
    if((tab==="overview"||tab==="history")&&!panel.querySelector(".hh-p2-ownership"))renderOwnership(panel,state,animalId);
    return true;
  }

  function clickRoute(route){const button=root.document?.querySelector(`.nav-item[data-route="${route}"]`);if(!button)return false;button.click();return true;}
  function waitFor(selector,callback,attempt=0,max=50){const node=root.document?.querySelector(selector);if(node){callback(node);return true;}if(attempt>=max)return false;root.setTimeout?.(()=>waitFor(selector,callback,attempt+1,max),50);return true;}

  function rememberReturn(animalId){pendingReturn={animalId:clean(animalId),tab:"breeding",expiresAt:Date.now()+5*60*1000};}
  function restoreAfterForm(form){
    if(!pendingReturn||!form)return;
    const target={...pendingReturn};
    const watch=(attempt=0)=>{
      if(!form.isConnected){pendingReturn=null;root.setTimeout?.(()=>root.HerdHarborFlowPhase2?.openAnimalProfile?.(target.animalId,"breeding",{history:"replace"}),80);return;}
      if(attempt<180)root.setTimeout?.(()=>watch(attempt+1),75);
    };
    watch();
  }

  function openCoreRecord(kind,id,animalId){
    const route=(kind==="edit-litter"||kind==="create-offspring")?"litters":"breeding";
    if(!clickRoute(route))return false;
    rememberReturn(animalId);
    const selector=kind==="edit-breeding"?`[data-edit-breeding="${cssEscape(id)}"]`:kind==="record-birth"?`[data-record-birth="${cssEscape(id)}"]`:kind==="edit-litter"?`[data-edit-litter="${cssEscape(id)}"]`:`[data-create-offspring="${cssEscape(id)}"]`;
    waitFor(selector,button=>{button.click();const formSelector=kind==="edit-breeding"?"#breeding-form":kind==="record-birth"||kind==="edit-litter"?"#litter-form":"#offspring-form";waitFor(formSelector,form=>restoreAfterForm(form));});
    return true;
  }

  function onClick(event){
    const offspring=event.target.closest?.("[data-hh-p2-open-offspring]");
    if(offspring){event.preventDefault();event.stopPropagation();root.HerdHarborFlowPhase2?.openAnimalProfile?.(offspring.dataset.hhP2OpenOffspring,"overview",{history:"push"});return;}
    const action=event.target.closest?.("[data-hh-p2-life-action]");
    if(!action)return;
    event.preventDefault();event.stopPropagation();
    const animalId=activeAnimalId();
    const kind=action.dataset.hhP2LifeAction||"";
    const breedingId=action.dataset.breedingId||"";
    const litterId=action.dataset.litterId||"";
    if(kind==="edit-breeding"||kind==="record-birth")openCoreRecord(kind,breedingId,animalId);
    else if(kind==="edit-litter"||kind==="create-offspring")openCoreRecord(kind,litterId,animalId);
  }

  function schedule(){if(queued)return;queued=true;(root.requestAnimationFrame||root.setTimeout)(()=>{queued=false;if(observer&&root.document?.body)observer.disconnect();try{enhanceProfile();}finally{if(observer&&root.document?.body)observer.observe(root.document.body,{childList:true,subtree:true});}},0);}

  function install(){
    if(installed||!root.document)return API;installed=true;
    root.addEventListener?.("click",onClick,true);
    root.addEventListener?.("hashchange",schedule);
    root.addEventListener?.("herdharbor:app-ready",schedule);
    root.addEventListener?.("herdharbor:health-intelligence-changed",schedule);
    observer=new root.MutationObserver(schedule);if(root.document.body)observer.observe(root.document.body,{childList:true,subtree:true});schedule();return API;
  }
  function uninstall(){observer?.disconnect?.();observer=null;root.removeEventListener?.("click",onClick,true);installed=false;queued=false;pendingReturn=null;}

  const API=Object.freeze({VERSION,STAGES,offspringForLitter,linkedLitter,liveAvailable,breedingStage,lifecycleAction,ownershipRows,offspringDisposition,install,uninstall});
  return API;
});
