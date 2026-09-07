(function(root,factory){
  "use strict";
  const api=factory(root);
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.HerdHarborFlowPhase2ProfileFinish=api;
  if(root&&root.document)api.install();
})(typeof globalThis!=="undefined"?globalThis:this,function(root){
  "use strict";

  const VERSION="1.8.2";
  let installed=false;
  let observer=null;
  let queued=false;
  let pendingSaleReturn=null;

  const clean=value=>String(value==null?"":value).trim();
  const lower=value=>clean(value).toLowerCase();
  const esc=value=>String(value==null?"":value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));
  const cssEscape=value=>{const text=String(value);try{return root.CSS?.escape?root.CSS.escape(text):text.replace(/["\\]/g,"\\$&");}catch{return text.replace(/["\\]/g,"\\$&");}};
  const array=(value,key)=>Array.isArray(value?.[key])?value[key]:[];
  const stateNow=()=>{try{return root.HerdHarborApp?.getState?.()||{};}catch{return{};}};
  const animalById=(state,id)=>array(state,"animals").find(row=>String(row.id)===String(id))||null;
  const fmt=value=>{if(!value)return"—";const d=new Date(`${String(value).slice(0,10)}T12:00:00`);return Number.isNaN(d.getTime())?clean(value):d.toLocaleDateString();};

  function activeAnimalId(){
    try{return clean(root.HerdHarborFlowPhase2?.parseProfileHash?.(root.location?.hash||"")?.animalId);}catch{return"";}
  }

  function offspringForLitter(state,litter){
    const ids=new Set(Array.isArray(litter?.offspringIds)?litter.offspringIds.map(String):[]);
    return array(state,"animals").filter(animal=>ids.has(String(animal.id))||String(animal.sourceBirthId||"")===String(litter?.id||""));
  }

  function liveAvailable(litter={}){
    return Math.max(0,Number(litter.bornAlive||0)+Number(litter.fosteredIn||0)-Number(litter.fosteredOut||0)-Number(litter.lostBeforeWeaning||0));
  }

  function remainingOffspringSlots(state,litter){
    return Math.max(0,liveAvailable(litter)-offspringForLitter(state,litter).length);
  }

  function pedigreeRelations(state,animalId){
    const subject=animalById(state,animalId);if(!subject)return[];
    const relations=[];
    const add=(id,label,generation)=>{if(!id)return;const animal=animalById(state,id);if(animal)relations.push({id:String(animal.id),label,generation,name:animal.name||label,breed:animal.breed||animal.species||"",status:animal.status||""});};
    add(subject.sireId,"Sire",1);add(subject.damId,"Dam",1);
    const sire=animalById(state,subject.sireId),dam=animalById(state,subject.damId);
    add(sire?.sireId,"Sire's sire",2);add(sire?.damId,"Sire's dam",2);add(dam?.sireId,"Dam's sire",2);add(dam?.damId,"Dam's dam",2);
    return relations;
  }

  function salesForAnimal(state,animalId){
    return array(state,"sales").filter(sale=>array(sale,"items").some(item=>String(item.animalId)===String(animalId))).sort((a,b)=>String(b.saleDate||b.completedAt||"").localeCompare(String(a.saleDate||a.completedAt||"")));
  }

  function currentOwnershipState(state,animalId){
    const animal=animalById(state,animalId)||{};
    const sales=salesForAnimal(state,animalId);
    const sale=sales[0]||null;
    const history=array(animal,"ownershipHistory").slice().sort((a,b)=>String(b.date||b.at||"").localeCompare(String(a.date||a.at||"")));
    const transfer=history[0]||null;
    const status=clean(animal.status)||"Unknown";
    const statusKey=lower(status);
    if(statusKey==="sold"||lower(sale?.status)==="completed"){
      const detail=transfer?.to?`Transferred to ${transfer.to}`:sale?.saleNumber||sale?.transferNumber||"Completed sale";
      return{label:transfer?"Transferred":"Sold",detail,date:transfer?.date||transfer?.at||sale?.saleDate||sale?.completedAt||"",saleId:sale?.id||"",canSell:false};
    }
    if(statusKey==="reserved")return{label:"Reserved",detail:sale?.saleNumber||"Reserved for buyer",date:sale?.saleDate||"",saleId:sale?.id||"",canSell:true};
    if(statusKey==="for sale")return{label:"For sale",detail:animal.askingPrice?`Asking price ${animal.askingPrice}`:"Available for sale",date:"",saleId:sale?.id||"",canSell:true};
    if(["deceased","archived","ancestor only"].includes(statusKey))return{label:status,detail:"Historical/non-operational record",date:"",saleId:sale?.id||"",canSell:false};
    if(transfer){
      const received=transfer.from?`Received from ${transfer.from}`:"Received through HerdHarbor transfer";
      return{label:"Owned here",detail:[received,transfer.transferId].filter(Boolean).join(" · "),date:transfer.date||transfer.at||"",saleId:sale?.id||"",canSell:true};
    }
    return{label:"Owned here",detail:animal.location||"Current HerdHarbor animal",date:"",saleId:sale?.id||"",canSell:true};
  }

  function enhanceLifecycle(state){
    const panel=root.document?.querySelector('#view-animal-profile.active [data-hh-p2-panel="breeding"]');if(!panel)return false;
    panel.querySelectorAll(".hh-p2-life-card").forEach(card=>{
      const breedingId=clean(card.dataset.hhP2BreedingId);const breeding=array(state,"breedings").find(row=>String(row.id)===breedingId);if(!breeding)return;
      const litter=array(state,"litters").find(row=>String(row.breedingId||"")===breedingId);if(!litter)return;
      const remaining=remainingOffspringSlots(state,litter);
      const actions=card.querySelector(".hh-p2-life-actions");if(!actions)return;
      const create=actions.querySelector('[data-hh-p2-life-action="create-offspring"]');
      if(create){
        if(remaining<=0){create.dataset.hhP2LifeAction="edit-litter";create.textContent="View completed litter";}
        else create.textContent=`Create ${remaining} offspring record${remaining===1?"":"s"}`;
      }
      if(remaining>0&&!actions.querySelector('[data-hh-p2-finish-create-offspring]')){
        const button=root.document.createElement("button");button.type="button";button.className="button button-ghost button-small";button.dataset.hhP2FinishCreateOffspring=litter.id;button.textContent=`Add offspring (${remaining} remaining)`;actions.appendChild(button);
      }
    });
    return true;
  }

  function enhancePedigree(state,animalId){
    const panel=root.document?.querySelector('#view-animal-profile.active [data-hh-p2-panel="pedigree"]');if(!panel||panel.querySelector(".hh-p2-family-links"))return false;
    const relations=pedigreeRelations(state,animalId);
    const section=root.document.createElement("section");section.className="hh-p2-family-links";
    section.innerHTML=`<div class="hh-p2-family-head"><div><h4>Family links</h4><p>Open known parents and grandparents without leaving the animal-profile workflow.</p></div></div>${relations.length?`<div class="hh-p2-family-grid">${relations.map(row=>`<button type="button" data-hh-p2-open-relation="${esc(row.id)}"><span>${esc(row.label)}</span><strong>${esc(row.name)}</strong><small>${esc([row.breed,row.status].filter(Boolean).join(" · "))}</small></button>`).join("")}</div>`:'<p class="muted">No linked parent records are available yet.</p>'}`;
    panel.prepend(section);return true;
  }

  function enhanceOwnership(state,animalId){
    const view=root.document?.querySelector("#view-animal-profile.active");if(!view)return false;
    const animal=animalById(state,animalId);if(!animal)return false;
    const ownership=currentOwnershipState(state,animalId);
    const actions=view.querySelector(".hh-p2-actions");
    if(actions&&!actions.querySelector("[data-hh-p2-sale-action]")){
      const button=root.document.createElement("button");button.type="button";button.className="button button-ghost button-small";button.dataset.hhP2SaleAction=ownership.saleId&&!ownership.canSell?"open-sale":"new-sale";button.dataset.saleId=ownership.saleId||"";button.textContent=ownership.saleId&&!ownership.canSell?"Sale / transfer":"Sell / transfer";actions.appendChild(button);
    }
    const panel=view.querySelector('[data-hh-p2-panel="overview"]');if(panel&&!panel.querySelector(".hh-p2-current-owner")){
      const card=root.document.createElement("section");card.className="panel hh-p2-current-owner";
      card.innerHTML=`<div class="panel-header"><h3>Current ownership</h3><small>Animal status and next handoff</small></div><div class="hh-p2-owner-state"><div><span>Status</span><strong>${esc(ownership.label)}</strong><small>${esc(ownership.detail)}</small></div><div><span>Last ownership change</span><strong>${esc(fmt(ownership.date))}</strong><small>${ownership.saleId?"Connected sale record":"No completed sale on this account"}</small></div></div>`;
      const provenance=panel.querySelector(".hh-p2-ownership");provenance?panel.insertBefore(card,provenance):panel.appendChild(card);
    }
    return true;
  }

  function clickRoute(route){const button=root.document?.querySelector(`.nav-item[data-route="${route}"]`);if(!button)return false;button.click();return true;}
  function waitFor(selector,fn,attempt=0,max=50){const node=root.document?.querySelector(selector);if(node){fn(node);return true;}if(attempt>=max)return false;root.setTimeout?.(()=>waitFor(selector,fn,attempt+1,max),50);return true;}

  function returnAfterForm(form,animalId,tab="overview"){
    const target={animalId,tab,expiresAt:Date.now()+5*60*1000};pendingSaleReturn=target;
    const watch=(attempt=0)=>{if(!form.isConnected){if(pendingSaleReturn===target)pendingSaleReturn=null;root.setTimeout?.(()=>root.HerdHarborFlowPhase2?.openAnimalProfile?.(animalId,tab,{history:"replace"}),80);return;}if(attempt<180)root.setTimeout?.(()=>watch(attempt+1),75);};watch();
  }

  function openNewSale(animalId){
    if(!clickRoute("sales"))return false;
    waitFor("#add-sale",button=>{button.click();waitFor("#sale-form",form=>{
      const boxes=Array.from(form.querySelectorAll("[data-sale-animal]"));boxes.forEach(box=>{const selected=String(box.value)===String(animalId);box.checked=selected;if(selected){box.dispatchEvent(new Event("input",{bubbles:true}));box.scrollIntoView?.({block:"center",behavior:"smooth"});}});returnAfterForm(form,animalId,"overview");
    });});return true;
  }

  function openSale(saleId){
    if(!saleId||!clickRoute("sales"))return false;
    waitFor(`[data-view-sale="${cssEscape(saleId)}"]`,button=>button.click());
    return true;
  }

  function openOffspringCreator(litterId,animalId){
    if(!litterId||!clickRoute("litters"))return false;
    waitFor(`[data-create-offspring="${cssEscape(litterId)}"]`,button=>{button.click();waitFor("#offspring-form",form=>returnAfterForm(form,animalId,"breeding"));});return true;
  }

  function onClick(event){
    const relation=event.target.closest?.("[data-hh-p2-open-relation]");if(relation){event.preventDefault();event.stopPropagation();root.HerdHarborFlowPhase2?.openAnimalProfile?.(relation.dataset.hhP2OpenRelation,"pedigree",{history:"push"});return;}
    const create=event.target.closest?.("[data-hh-p2-finish-create-offspring]");if(create){event.preventDefault();event.stopPropagation();openOffspringCreator(create.dataset.hhP2FinishCreateOffspring,activeAnimalId());return;}
    const sale=event.target.closest?.("[data-hh-p2-sale-action]");if(sale){event.preventDefault();event.stopPropagation();const animalId=activeAnimalId();if(sale.dataset.hhP2SaleAction==="open-sale")openSale(sale.dataset.saleId);else openNewSale(animalId);}
  }

  function enhance(){const animalId=activeAnimalId();if(!animalId)return false;const state=stateNow();enhanceLifecycle(state);enhancePedigree(state,animalId);enhanceOwnership(state,animalId);return true;}
  function schedule(){if(queued)return;queued=true;(root.requestAnimationFrame||root.setTimeout)(()=>{queued=false;if(observer&&root.document?.body)observer.disconnect();try{enhance();}finally{if(observer&&root.document?.body)observer.observe(root.document.body,{childList:true,subtree:true});}},0);}
  function install(){if(installed||!root.document)return API;installed=true;root.addEventListener?.("click",onClick,true);root.addEventListener?.("hashchange",schedule);root.addEventListener?.("herdharbor:app-ready",schedule);observer=new root.MutationObserver(schedule);if(root.document.body)observer.observe(root.document.body,{childList:true,subtree:true});schedule();return API;}
  function uninstall(){observer?.disconnect?.();observer=null;root.removeEventListener?.("click",onClick,true);installed=false;queued=false;pendingSaleReturn=null;}

  const API=Object.freeze({VERSION,offspringForLitter,liveAvailable,remainingOffspringSlots,pedigreeRelations,salesForAnimal,currentOwnershipState,install,uninstall});
  return API;
});
