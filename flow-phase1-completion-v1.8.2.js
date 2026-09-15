(function(root,factory){
  "use strict";
  const api=factory(root);
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.HerdHarborFlowPhase1Completion=api;
  if(root&&root.document)api.install();
})(typeof globalThis!=="undefined"?globalThis:this,function(root){
  "use strict";

  const VERSION="1.8.2";
  const RETURN_KEY="herdharbor_flow_return_origin_v1";
  const RETURN_TTL_MS=5*60*1000;
  let installed=false;
  let observer=null;
  let queued=false;
  let pendingOrigin=null;
  let restoring=false;

  const clean=v=>String(v==null?"":v).trim();
  const lower=v=>clean(v).toLowerCase();
  const stateNow=()=>{try{return root.HerdHarborApp?.getState?.()||{};}catch{return{};}};
  const healthNow=state=>{try{return root.HerdHarborHealthIntelligence?.readHealthState?.()||state?.healthIntelligence||{};}catch{return state?.healthIntelligence||{};}};
  const cssEscape=v=>{const s=String(v);try{return root.CSS?.escape?root.CSS.escape(s):s.replace(/["\\]/g,"\\$&");}catch{return s.replace(/["\\]/g,"\\$&");}};

  function ensureCloudSyncFlow(){
    if(!root.document||root.HerdHarborCloudSyncFlowV2||root.document.getElementById("hh-cloud-sync-v2-flow-v182"))return;
    const script=root.document.createElement("script");
    script.id="hh-cloud-sync-v2-flow-v182";
    script.src="cloud-sync-v2-flow-v1.8.2.js?v=1";
    script.async=false;
    (root.document.head||root.document.documentElement||root.document.body)?.appendChild(script);
  }

  function clickRoute(route){const button=root.document?.querySelector(`.nav-item[data-route="${route}"]`);if(!button)return false;button.click();return true;}
  function waitFor(selector,fn,attempt=0,max=45){const node=root.document?.querySelector(selector);if(node){fn(node);return true;}if(attempt>=max)return false;root.setTimeout?.(()=>waitFor(selector,fn,attempt+1,max),50);return true;}

  function taskTargetStatus(task={}){return task.completed?"Completed":"All open";}
  function transferStatusMeta(status=""){
    const value=lower(status);
    if(value==="pending")return{label:"Transfer pending",tone:"warning",canSend:false};
    if(value==="accepted")return{label:"Transfer accepted",tone:"green",canSend:false};
    if(value==="declined")return{label:"Transfer declined",tone:"danger",canSend:true};
    if(value==="cancelled"||value==="canceled")return{label:"Transfer cancelled",tone:"gray",canSend:true};
    return{label:"Transfer status unknown",tone:"gray",canSend:true};
  }
  function originForAction(action,animalId){
    const id=clean(animalId);if(!id)return null;
    const map={
      weight:{tab:"health",forms:["#health-form"]},health:{tab:"health",forms:["#health-form"]},
      episode:{tab:"health",forms:["#hh-health-intelligence-modal form"]},care:{tab:"health",forms:["#hh-health-intelligence-modal form"]},
      breeding:{tab:"breeding",forms:["#breeding-form"]},"show-entry":{tab:"shows",forms:["#hh-entry-form"]},
      pedigree:{tab:"pedigree",forms:["#pedigree-import-form"]},edit:{tab:"overview",forms:["#animal-form"]}
    };
    const def=map[clean(action)];return def?{animalId:id,action:clean(action),tab:def.tab,forms:def.forms.slice(),startedAt:Date.now()}:null;
  }

  function eventTarget(key,state={},health={}){
    const [source,id]=clean(key).split(":");if(!source||!id)return null;
    if(source==="episode"){const r=(health.episodes||[]).find(x=>String(x.id)===id);return r?.animalId?{kind:"animal",animalId:String(r.animalId),tab:"health",label:r.concern||"Health episode"}:null;}
    if(source==="care"){const r=(health.careRecords||[]).find(x=>String(x.id)===id);return r?.animalId?{kind:"animal",animalId:String(r.animalId),tab:"health",label:r.product||r.type||"Care record"}:null;}
    if(source==="health"){const r=(state.health||[]).find(x=>String(x.id)===id);return r?.animalId?{kind:"animal",animalId:String(r.animalId),tab:"health",label:r.type||"Health record"}:null;}
    if(source==="task"){
      const task=(state.tasks||[]).find(x=>String(x.id)===id);
      if(task?.animalId&&task.sourceType==="breeding")return{kind:"animal",animalId:String(task.animalId),tab:"breeding",label:task.title||"Breeding task"};
      return{kind:"task",id};
    }
    if(source==="show")return{kind:"show",id};
    return null;
  }

  function resetAnimalFilters(){
    const host=root.document?.querySelector("#view-animals");if(!host)return;
    const fields=[host.querySelector("#animal-species"),host.querySelector("#animal-sex"),host.querySelector("#animal-status")];
    const search=host.querySelector("#animal-search");
    if(search?.value){search.value="";search.dispatchEvent(new Event("input",{bubbles:true}));}
    fields.forEach(field=>{if(field?.value){field.value="";field.dispatchEvent(new Event("change",{bubbles:true}));}});
  }
  function openAnimal(target){
    if(!target?.animalId||!clickRoute("animals"))return false;
    waitFor("#view-animals #animal-results",()=>{resetAnimalFilters();root.setTimeout?.(()=>waitFor(`[data-view-animal="${cssEscape(target.animalId)}"]`,button=>{
      button.click();waitFor(".hh-p1-profile-hub",hub=>{const tab=target.tab||"overview";hub.querySelector(`[data-hh-p1-tab="${tab}"]`)?.click();const panel=hub.querySelector(`[data-hh-p1-panel="${tab}"]`);if(panel&&target.label){const needle=lower(target.label);const row=Array.from(panel.querySelectorAll(".hh-p1-record-list article")).find(item=>lower(item.textContent).includes(needle));if(row){row.classList.add("hh-flow-target-record");row.scrollIntoView?.({block:"nearest",behavior:"smooth"});root.setTimeout?.(()=>row.classList.remove("hh-flow-target-record"),3200);}}});
    },0,45),25);});return true;
  }
  function openTask(id){
    if(!clickRoute("tasks"))return false;
    const task=(stateNow().tasks||[]).find(x=>String(x.id)===String(id))||{};
    waitFor("#view-tasks #task-results",()=>{
      const host=root.document.querySelector("#view-tasks"),search=host?.querySelector("#task-search"),category=host?.querySelector("#task-category-filter"),animal=host?.querySelector("#task-animal-filter"),status=host?.querySelector("#task-status-filter");
      if(search?.value){search.value="";search.dispatchEvent(new Event("input",{bubbles:true}));}
      [category,animal].forEach(field=>{if(field?.value){field.value="";field.dispatchEvent(new Event("change",{bubbles:true}));}});
      const desired=taskTargetStatus(task);if(status&&status.value!==desired){status.value=desired;status.dispatchEvent(new Event("change",{bubbles:true}));}
      root.setTimeout?.(()=>waitFor(`[data-edit-task="${cssEscape(id)}"]`,button=>button.click(),0,40),25);
    });return true;
  }
  function openShow(id){
    if(!clickRoute("shows"))return false;
    const attempt=(n=0)=>{const node=root.document?.querySelector(`[data-view-show="${cssEscape(id)}"]`)||root.document?.querySelector(`[data-edit-show="${cssEscape(id)}"]`);if(node)return node.click();if(n<40)root.setTimeout?.(()=>attempt(n+1),60);};attempt();return true;
  }
  function openToday(key){const state=stateNow(),target=eventTarget(key,state,healthNow(state));if(!target)return false;if(target.kind==="animal")return openAnimal(target);if(target.kind==="task")return openTask(target.id);if(target.kind==="show")return openShow(target.id);return false;}

  function writeOrigin(origin){try{root.sessionStorage?.setItem(RETURN_KEY,JSON.stringify({animalId:origin.animalId,tab:origin.tab,action:origin.action,submittedAt:Date.now()}));}catch{}}
  function clearOrigin(){try{root.sessionStorage?.removeItem(RETURN_KEY);}catch{}}
  function formMatches(form,origin=pendingOrigin){return!!(form&&origin?.forms?.some(selector=>{try{return form.matches(selector);}catch{return false;}}));}
  function watchForm(form,origin,attempt=0){if(!form||!origin)return;if(!form.isConnected){pendingOrigin=null;clearOrigin();openAnimal({animalId:origin.animalId,tab:origin.tab});return;}if(attempt>=150){pendingOrigin=null;clearOrigin();return;}root.setTimeout?.(()=>watchForm(form,origin,attempt+1),100);}
  function onSubmit(form){if(!pendingOrigin||Date.now()-Number(pendingOrigin.startedAt||0)>RETURN_TTL_MS){pendingOrigin=null;return;}if(!formMatches(form))return;const origin={...pendingOrigin};writeOrigin(origin);watchForm(form,origin);}
  function restoreOrigin(){
    if(restoring||!root.HerdHarborApp?.getState)return false;let saved=null;try{saved=JSON.parse(root.sessionStorage?.getItem(RETURN_KEY)||"null");}catch{}
    if(!saved?.animalId||!saved?.submittedAt||Date.now()-Number(saved.submittedAt)>RETURN_TTL_MS){clearOrigin();return false;}
    restoring=true;clearOrigin();root.setTimeout?.(()=>{restoring=false;openAnimal({animalId:saved.animalId,tab:saved.tab||"overview"});},120);return true;
  }
  function rememberOrigin(event){const node=event.target.closest?.("[data-hh-p1-action]");if(!node||!node.closest?.(".hh-p1-profile-hub"))return;const animalId=clean(root.document?.querySelector("#modal-content")?.dataset?.hhPhase1AnimalId);pendingOrigin=originForAction(node.dataset.hhP1Action,animalId);}
  function cancelOrigin(event){if(!pendingOrigin)return;const cancel=event.target.closest?.("#cancel-modal,[data-shows-cancel],#cancel-pedigree-import");if(!cancel)return;const form=root.document?.querySelector(pendingOrigin.forms.join(","));if(form){pendingOrigin=null;clearOrigin();}}

  function enhanceToday(){const view=root.document?.querySelector("#view-dashboard"),today=view?.querySelector("#hh-p1-today");if(!today)return false;view.querySelector(".task-today-panel")?.remove();return true;}
  function latestTransfer(outbox,saleNumber){return(outbox||[]).find(row=>clean(row.sourceSaleNumber)===saleNumber)||null;}
  function transferBadge(cell,transfer){
    let badge=cell.querySelector(".hh-flow-sale-transfer-status");if(!transfer){badge?.remove();return null;}const meta=transferStatusMeta(transfer.status);
    if(!badge){badge=root.document.createElement("span");const send=cell.querySelector("[data-hh-direct-send]");badge.className="badge hh-flow-sale-transfer-status";send?cell.insertBefore(badge,send):cell.appendChild(badge);}
    badge.className=`badge ${meta.tone} hh-flow-sale-transfer-status`;badge.textContent=meta.label;badge.title=transfer.recipientDisplayName?`${meta.label} · ${transfer.recipientDisplayName}`:meta.label;return meta;
  }
  function enhanceSales(){
    const host=root.document?.querySelector("#view-sales");if(!host?.classList.contains("active"))return false;const api=root.HerdHarborDirectTransfers,outbox=typeof api?.getOutbox==="function"?api.getOutbox():[];
    host.querySelectorAll(".data-table tbody tr").forEach(row=>{const saleNumber=clean(row.querySelector("td:first-child strong")?.textContent);if(!saleNumber)return;const cell=row.querySelector("td:last-child");if(!cell)return;const transfer=latestTransfer(outbox,saleNumber),meta=transferBadge(cell,transfer),send=cell.querySelector("[data-hh-direct-send]");if(send){const allowed=!transfer||meta?.canSend;send.hidden=!allowed;send.disabled=!allowed;if(allowed)send.textContent=transfer?"Send again":"Send to member";}});
    return true;
  }
  function enhanceSaleDetail(){
    const transferFile=root.document?.querySelector("#sale-transfer"),actions=transferFile?.closest?.(".modal-actions");if(!transferFile||!actions)return false;const saleNumber=clean(root.document?.querySelector("#modal-title")?.textContent),state=stateNow(),sale=(state.sales||[]).find(x=>clean(x.saleNumber)===saleNumber);if(!sale||lower(sale.status)!=="completed")return false;
    const api=root.HerdHarborDirectTransfers,outbox=typeof api?.getOutbox==="function"?api.getOutbox():[],transfer=latestTransfer(outbox,saleNumber),meta=transfer?transferStatusMeta(transfer.status):null;
    let direct=actions.querySelector("[data-hh-flow-sale-direct]");if(!direct){direct=root.document.createElement("button");direct.type="button";direct.dataset.hhFlowSaleDirect="1";transferFile.insertAdjacentElement("afterend",direct);}
    const allowed=!transfer||meta?.canSend;direct.disabled=!allowed;if(allowed){direct.dataset.hhDirectSend=sale.id;direct.textContent=transfer?"Send direct again":"Send to member";direct.className="button button-ghost";direct.title="Send the animal and available pedigree directly to another HerdHarbor member.";}else{delete direct.dataset.hhDirectSend;direct.textContent=meta.label;direct.className=`button button-ghost hh-flow-direct-status is-${meta.tone}`;direct.title=transfer?.recipientDisplayName?`${meta.label} · ${transfer.recipientDisplayName}`:meta.label;}return true;
  }

  function enhance(){enhanceToday();enhanceSales();enhanceSaleDetail();}
  function run(){queued=false;const body=root.document?.body;if(observer&&body)observer.disconnect();try{enhance();}finally{if(observer&&body)observer.observe(body,{childList:true,subtree:true,characterData:true});}}
  function schedule(){if(queued)return;queued=true;if(typeof root.requestAnimationFrame==="function")root.requestAnimationFrame(run);else root.setTimeout?.(run,0);}

  function install(){
    if(installed||!root.document)return API;installed=true;ensureCloudSyncFlow();
    root.addEventListener?.("click",event=>{
      rememberOrigin(event);cancelOrigin(event);
      const allTasks=event.target.closest?.("[data-hh-p1-open-tasks]");if(allTasks){event.preventDefault();event.stopImmediatePropagation();clickRoute("tasks");return;}
      const today=event.target.closest?.("[data-hh-p1-event]");if(today){event.preventDefault();event.stopImmediatePropagation();openToday(today.dataset.hhP1Event||"");}
    },true);
    root.addEventListener?.("submit",event=>onSubmit(event.target),true);
    root.addEventListener?.("herdharbor:app-ready",()=>{restoreOrigin();schedule();});
    root.addEventListener?.("herdharbor:health-intelligence-changed",schedule);
    observer=new root.MutationObserver(schedule);if(root.document.body)observer.observe(root.document.body,{childList:true,subtree:true,characterData:true});restoreOrigin();schedule();return API;
  }
  function uninstall(){observer?.disconnect?.();observer=null;queued=false;installed=false;pendingOrigin=null;}

  const API=Object.freeze({VERSION,taskTargetStatus,transferStatusMeta,originForAction,eventTarget,install,uninstall});
  return API;
});
