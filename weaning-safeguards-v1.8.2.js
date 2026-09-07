(function(root){
  "use strict";
  if(!root?.document)return;

  let Core=root.HerdHarborWeaningSafeguardsCore;
  let activeLitterId="";
  let observer=null;
  let queued=false;

  const clean=v=>String(v==null?"":v).trim();
  const lower=v=>clean(v).toLowerCase();
  const stateNow=()=>{try{return root.HerdHarborApp?.getState?.()||{};}catch{return{};}};
  const fmt=value=>{if(!value)return"—";const d=new Date(`${String(value).slice(0,10)}T12:00:00`);return Number.isNaN(d.getTime())?clean(value):d.toLocaleDateString();};

  function ensureCore(){
    Core=root.HerdHarborWeaningSafeguardsCore||Core;
    return Core;
  }

  function toast(message,type="warning"){
    let node=root.document.getElementById("hh-weaning-safeguard-toast");
    if(!node){
      node=root.document.createElement("div");
      node.id="hh-weaning-safeguard-toast";
      node.className="hh-ws-toast";
      root.document.body.appendChild(node);
    }
    node.className=`hh-ws-toast ${type}`;
    node.textContent=message;
    node.setAttribute("role","alert");
    node.classList.add("show");
    root.clearTimeout?.(node._hhTimer);
    node._hhTimer=root.setTimeout?.(()=>node.classList.remove("show"),4200);
  }

  function litterIdFromForm(form,state){
    if(activeLitterId&&Core?.litterById(state,activeLitterId))return activeLitterId;
    const ids=[...form.querySelectorAll("[data-hh-bw-select]")].map(node=>String(node.value||"")).filter(Boolean);
    if(ids.length){
      const animals=Array.isArray(state.animals)?state.animals:[];
      const birthIds=[...new Set(animals.filter(a=>ids.includes(String(a.id))&&a.sourceBirthId).map(a=>String(a.sourceBirthId)))];
      if(birthIds.length===1)return birthIds[0];
      const litters=Array.isArray(state.litters)?state.litters:[];
      const match=litters.find(litter=>{
        const linked=new Set(Array.isArray(litter.offspringIds)?litter.offspringIds.map(String):[]);
        return ids.some(id=>linked.has(id));
      });
      if(match)return String(match.id);
    }
    return "";
  }

  function litterContext(form){
    if(!ensureCore())return null;
    const state=stateNow();
    const litterId=litterIdFromForm(form,state);
    const litter=Core.litterById(state,litterId);
    if(!litter)return null;
    activeLitterId=litterId;
    const offspring=Core.offspringForLitter(state,litter);
    return{state,litterId,litter,offspring};
  }

  function primarySpecies(context){
    const living=context.offspring.find(a=>lower(a.status)!=="deceased")||context.offspring[0];
    return Core.speciesForAnimal(context.state,context.litter,living)||"";
  }

  function automaticUnlock(context){
    const candidates=context.offspring.map(animal=>Core.defaultUnlockDate(context.state,context.litter,animal)).filter(Boolean).sort();
    return candidates.length?candidates[candidates.length-1]:"";
  }

  function currentWeanDate(form){
    return clean(form.elements?.date?.value)||new Date().toISOString().slice(0,10);
  }

  function selectedIds(form){
    return[...form.querySelectorAll("[data-hh-bw-select]:checked")].map(node=>String(node.value||"")).filter(Boolean);
  }

  function remainingIds(context){
    return context.offspring
      .filter(a=>lower(a.status)!=="deceased"&&!clean(a.weanedDate))
      .map(a=>String(a.id));
  }

  function blockMessage(result,animal){
    const name=clean(animal?.name||animal?.tag||animal?.tattoo)||"This offspring";
    if(result?.unlockDate)return`${name} cannot be marked weaned before ${fmt(result.unlockDate)}${Number.isFinite(result.ageDays)?` (${result.ageDays} days old on the selected date)`:``}.`;
    return result?.reason||`${name} cannot be marked weaned yet.`;
  }

  function validateIds(context,ids,date){
    const result=Core.eligibleForDate(context.state,context.litterId,ids,date);
    if(!result.blocked.length)return true;
    const first=result.blocked[0];
    const animal=context.offspring.find(a=>String(a.id)===String(first.animalId));
    toast(blockMessage(first,animal),"warning");
    return false;
  }

  function onClickCapture(event){
    const manage=event.target.closest?.("[data-hh-bw-manage-litter]");
    if(manage?.dataset?.hhBwManageLitter)activeLitterId=String(manage.dataset.hhBwManageLitter);

    const form=event.target.closest?.("#hh-bw-weaning-form");
    if(!form)return;

    const context=litterContext(form);
    if(!context)return;

    if(event.target.closest?.("[data-hh-bw-wean-all]")){
      const ids=remainingIds(context);
      if(!validateIds(context,ids,currentWeanDate(form))){
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }

    const undo=event.target.closest?.("[data-hh-ws-unwean]");
    if(undo){
      event.preventDefault();
      event.stopImmediatePropagation();
      const animalId=String(undo.dataset.hhWsUnwean||"");
      const result=Core.unweanSelected(context.state,context.litterId,[animalId]);
      if(result.updated.length){
        root.HerdHarborApp?.commitState?.(result.state,"Weaning undone and litter totals recalculated.");
        root.HerdHarborApp?.refresh?.();
        toast("Weaning undone. The offspring is back in the unweaned litter count.","success");
        schedule();
      }
      return;
    }

    const undoAll=event.target.closest?.("[data-hh-ws-unwean-all]");
    if(undoAll){
      event.preventDefault();
      event.stopImmediatePropagation();
      const ids=context.offspring.filter(a=>clean(a.weanedDate)).map(a=>a.id);
      const result=Core.unweanSelected(context.state,context.litterId,ids);
      if(result.updated.length){
        root.HerdHarborApp?.commitState?.(result.state,`${result.updated.length} weaning record${result.updated.length===1?"":"s"} undone.`);
        root.HerdHarborApp?.refresh?.();
        toast(`${result.updated.length} offspring returned to unweaned status.`,"success");
        schedule();
      }
      return;
    }

    const saveLock=event.target.closest?.("[data-hh-ws-save-lock]");
    if(saveLock){
      event.preventDefault();
      event.stopImmediatePropagation();
      const input=form.querySelector("[data-hh-ws-lock-date]");
      const result=Core.setWeanNotBefore(context.state,context.litterId,input?.value||"");
      if(result.changed){
        root.HerdHarborApp?.commitState?.(result.state,"Litter weaning lock updated.");
        root.HerdHarborApp?.refresh?.();
        toast(input?.value?`Weaning is locked through ${fmt(input.value)}.`:"Custom weaning lock cleared. Species safety rules still apply.","success");
        schedule();
      }
      return;
    }
  }

  function onSubmitCapture(event){
    const form=event.target;
    if(form?.id!=="hh-bw-weaning-form")return;
    const context=litterContext(form);
    if(!context)return;
    const ids=selectedIds(form);
    if(!ids.length)return;
    if(!validateIds(context,ids,currentWeanDate(form))){
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  function onDateChange(event){
    if(event.target?.closest?.("#hh-bw-weaning-form")&&event.target?.name==="date")schedule();
  }

  function safeguardCard(context){
    const species=primarySpecies(context);
    const automatic=automaticUnlock(context);
    const custom=clean(context.litter.weanNotBeforeDate);
    const minimum=Core.defaultMinimumDays(species);
    const effectiveCandidates=context.offspring.map(animal=>Core.effectiveUnlockDate(context.state,context.litter,animal)).filter(Boolean).sort();
    const effective=effectiveCandidates.length?effectiveCandidates[effectiveCandidates.length-1]:"";
    const description=minimum
      ? `${species} offspring have a ${minimum}-day minimum-age safety lock. A custom litter date can extend that lock.`
      : "Set an optional date to prevent this litter from being marked weaned too early.";
    return`<section class="hh-ws-lock-card" data-hh-ws-lock-card>
      <div class="hh-ws-lock-copy"><strong>Weaning safety lock</strong><span>${description}</span>${effective?`<small>Earliest allowed date: <b>${fmt(effective)}</b>${automatic?` · automatic ${fmt(automatic)}`:""}</small>`:""}</div>
      <div class="hh-ws-lock-control"><label>Do not allow weaning before<input type="date" data-hh-ws-lock-date value="${custom}" ${automatic?`min="${automatic}"`:""}></label><button type="button" class="button button-ghost button-small" data-hh-ws-save-lock>Save lock</button></div>
    </section>`;
  }

  function undoSection(context){
    const weaned=context.offspring.filter(a=>clean(a.weanedDate));
    if(!weaned.length)return"";
    return`<section class="hh-ws-undo-card" data-hh-ws-undo-card>
      <div class="hh-ws-undo-head"><div><strong>Currently marked weaned</strong><span>Mistake? Undoing weaning clears the offspring's weaning date and recalculates the litter total.</span></div>${weaned.length>1?`<button type="button" class="button button-ghost button-small" data-hh-ws-unwean-all>Undo all</button>`:""}</div>
      <div class="hh-ws-undo-list">${weaned.map(animal=>`<div class="hh-ws-undo-row"><span><strong>${clean(animal.name||animal.tag||animal.tattoo)||"Offspring"}</strong><small>Weaned ${fmt(animal.weanedDate)}</small></span><button type="button" class="button button-ghost button-small" data-hh-ws-unwean="${animal.id}">Undo weaning</button></div>`).join("")}</div>
    </section>`;
  }

  function applyEligibility(form,context){
    const date=currentWeanDate(form);
    const byId=new Map(context.offspring.map(a=>[String(a.id),a]));
    let blockedRemaining=0;
    let remaining=0;

    form.querySelectorAll("[data-hh-bw-select]").forEach(input=>{
      const id=String(input.value||"");
      const animal=byId.get(id);
      if(!animal||clean(animal.weanedDate)||lower(animal.status)==="deceased")return;
      remaining+=1;
      const result=Core.weanEligibility(context.state,context.litterId,id,date);
      const row=input.closest(".hh-bw-select-row");
      if(!result.allowed){
        blockedRemaining+=1;
        input.checked=false;
        input.disabled=true;
        row?.classList.add("hh-ws-age-locked");
        row?.setAttribute("title",result.reason);
        let note=row?.querySelector(".hh-ws-lock-note");
        if(row&&!note){
          note=root.document.createElement("em");
          note.className="hh-ws-lock-note";
          row.querySelector("span")?.appendChild(note);
        }
        if(note)note.textContent=result.unlockDate?`Locked until ${fmt(result.unlockDate)}`:"Not weanable yet";
      }else{
        input.disabled=false;
        row?.classList.remove("hh-ws-age-locked");
        row?.removeAttribute("title");
        row?.querySelector(".hh-ws-lock-note")?.remove();
      }
    });

    const allButton=form.querySelector("[data-hh-bw-wean-all]");
    if(allButton){
      allButton.disabled=remaining===0||blockedRemaining>0;
      allButton.title=blockedRemaining?`${blockedRemaining} offspring are still protected by the weaning safety lock.`:"";
    }
    const submit=form.querySelector('button[type="submit"]');
    if(submit)submit.title=blockedRemaining?"Only eligible, unlocked offspring can be selected.":"";
  }

  function enhanceForm(form){
    const context=litterContext(form);
    if(!context)return;
    const oldLock=form.querySelector("[data-hh-ws-lock-card]");
    if(oldLock)oldLock.remove();
    const toolbar=form.querySelector(".hh-bw-toolbar");
    toolbar?.insertAdjacentHTML("afterend",safeguardCard(context));

    form.querySelector("[data-hh-ws-undo-card]")?.remove();
    const undo=undoSection(context);
    if(undo)form.insertAdjacentHTML("beforeend",undo);

    applyEligibility(form,context);
  }

  function enhance(){
    const form=root.document.querySelector("#hh-bw-weaning-form");
    if(form)enhanceForm(form);
  }

  function run(){
    queued=false;
    const body=root.document.body;
    observer?.disconnect?.();
    try{enhance();}finally{if(body&&observer)observer.observe(body,{childList:true,subtree:true});}
  }

  function schedule(){
    if(queued)return;
    queued=true;
    (root.requestAnimationFrame||root.setTimeout)(run,0);
  }

  function install(){
    root.addEventListener("click",onClickCapture,true);
    root.addEventListener("submit",onSubmitCapture,true);
    root.addEventListener("change",onDateChange,true);
    root.addEventListener("herdharbor:offspring-auto-created",event=>{
      if(event?.detail?.litterId)activeLitterId=String(event.detail.litterId);
      schedule();
    });
    root.addEventListener("herdharbor:litter-workspace-changed",event=>{
      if(event?.detail?.litterId)activeLitterId=String(event.detail.litterId);
      schedule();
    });
    observer=new root.MutationObserver(schedule);
    if(root.document.body)observer.observe(root.document.body,{childList:true,subtree:true});
    schedule();
  }

  root.HerdHarborWeaningSafeguards=Object.freeze({VERSION:"1.8.2",refresh:schedule});
  install();
})(typeof globalThis!=="undefined"?globalThis:this);
