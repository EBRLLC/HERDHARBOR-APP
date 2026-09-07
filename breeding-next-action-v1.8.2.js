(function(root){
  "use strict";
  if(!root?.document)return;
  const Core=root.HerdHarborBreedingNextActionCore;if(!Core)return;
  let observer=null,queued=false,installed=false;
  const clean=v=>String(v==null?"":v).trim();
  const lower=v=>clean(v).toLowerCase();
  const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const stateNow=()=>{try{return root.HerdHarborApp?.getState?.()||{};}catch{return{};}};
  const today=()=>new Date().toISOString().slice(0,10);
  function waitFor(selector,fn,attempt=0,max=50){const node=root.document.querySelector(selector);if(node){fn(node);return true;}if(attempt>=max)return false;root.setTimeout(()=>waitFor(selector,fn,attempt+1,max),50);return true;}
  function tone(urgency){return urgency==="overdue"?"danger":urgency==="today"?"warning":urgency==="soon"?"teal":"green";}
  function actionHtml(next,compact=false){if(!next)return"";return`<div class="hh-next-copy"><span class="eyebrow">Next breeding action</span><strong>${esc(next.label)}</strong><small>${esc(next.reason||"")}</small></div>${next.actionable?`<button type="button" class="button ${compact?"button-small ":""}button-primary" data-hh-next-kind="${esc(next.kind)}" data-hh-next-animal="${esc(next.animalId||"")}" data-hh-next-breeding="${esc(next.breedingId||"")}" data-hh-next-litter="${esc(next.litterId||"")}" data-hh-next-sale="${esc(next.saleId||"")}" data-hh-next-tab="${esc(next.tab||"")}">${esc(next.shortLabel||next.label)}</button>`:""}`;}

  function renderProfile(){
    const view=root.document.querySelector("#view-animal-profile.hh-p2-profile-view.active");if(!view)return false;
    const animalId=clean(view.querySelector("[data-hh-p2-animal-id]")?.dataset?.hhP2AnimalId);if(!animalId)return false;
    const next=Core.animalNextAction(stateNow(),animalId,today());
    let box=view.querySelector(".hh-next-profile");if(!next){box?.remove();return false;}
    if(!box){box=root.document.createElement("section");box.className="hh-next-profile";const anchor=view.querySelector(".hh-p2-profile-tabs")||view.firstElementChild;anchor?.insertAdjacentElement("beforebegin",box);}
    box.className=`hh-next-profile is-${tone(next.urgency)}`;box.innerHTML=actionHtml(next,false);return true;
  }

  function renderBreedingCards(){
    const state=stateNow();root.document.querySelectorAll("#view-animal-profile .hh-p2-life-card[data-hh-p2-breeding-id]").forEach(card=>{
      const breedingId=card.dataset.hhP2BreedingId,breeding=(state.breedings||[]).find(row=>String(row.id)===String(breedingId));if(!breeding)return;
      const next=Core.breedingNextAction(state,breeding,today());let row=card.querySelector(".hh-next-card-row");if(!next){row?.remove();return;}
      if(!row){row=root.document.createElement("div");row.className="hh-next-card-row";const actions=card.querySelector(".hh-p2-life-actions");actions?.insertAdjacentElement("beforebegin",row);}
      row.className=`hh-next-card-row is-${tone(next.urgency)}`;row.innerHTML=actionHtml(next,true);
    });
  }

  function renderWorkspace(){
    const overlay=root.document.getElementById("hh-breeding-litter-workspace");if(!overlay)return false;
    const litterId=clean(overlay.dataset.hhBwLitterId||overlay.dataset.hhLstLitterId);if(!litterId)return false;
    const litter=(stateNow().litters||[]).find(row=>String(row.id)===String(litterId));if(!litter)return false;
    const next=Core.litterNextAction(stateNow(),litter,today());let box=overlay.querySelector(".hh-next-workspace");if(!next){box?.remove();return false;}
    if(!box){box=root.document.createElement("div");box.className="hh-next-workspace";overlay.querySelector(".hh-bw-stats")?.insertAdjacentElement("afterend",box);}
    box.className=`hh-next-workspace is-${tone(next.urgency)}`;box.innerHTML=actionHtml(next,true);return true;
  }

  function alreadyInToday(panel,next){
    const text=lower(panel?.textContent);const name=lower(next.animalName);if(!text||!name||!text.includes(name))return false;
    const keys={"pregnancy-check":["pregnancy","check"],"record-birth":["birth"],"wean-litter":["wean"],"transfer-buyer":["transfer"],"create-sale":["sale"]}[next.kind]||[];
    return keys.some(key=>text.includes(key));
  }
  function renderDashboard(){
    const panel=root.document.querySelector("#hh-p1-today");if(!panel)return false;
    const actions=Core.dashboardActions(stateNow(),today(),14).filter(next=>!alreadyInToday(panel,next)).slice(0,6);
    let section=panel.querySelector(".hh-next-dashboard");if(!actions.length){section?.remove();return false;}
    if(!section){section=root.document.createElement("section");section.className="hh-next-dashboard";panel.appendChild(section);}
    section.innerHTML=`<div class="hh-next-dashboard-head"><div><strong>Breeding next actions</strong><span>Derived from the breeding and litter records you already entered.</span></div></div><div class="hh-next-dashboard-list">${actions.map(next=>`<article class="is-${tone(next.urgency)}"><div><strong>${esc(next.animalName)} · ${esc(next.label)}</strong><small>${esc(next.reason||"")}</small></div><button type="button" class="button button-small button-primary" data-hh-next-kind="${esc(next.kind)}" data-hh-next-animal="${esc(next.animalId||"")}" data-hh-next-breeding="${esc(next.breedingId||"")}" data-hh-next-litter="${esc(next.litterId||"")}" data-hh-next-sale="${esc(next.saleId||"")}" data-hh-next-tab="${esc(next.tab||"")}">${esc(next.shortLabel||"Open")}</button></article>`).join("")}</div>`;return true;
  }

  function openProfile(next){
    if(!next.animalId)return false;root.HerdHarborFlowPhase2?.openAnimalProfile?.(next.animalId,"breeding",{history:"push"});
    if(["start-breeding","plan-rebreed"].includes(next.kind)){waitFor('#view-animal-profile.active [data-hh-p2-action="breeding"]',button=>button.click());return true;}
    if(["pregnancy-check","record-birth"].includes(next.kind)&&next.breedingId){waitFor(`#view-animal-profile.active [data-hh-p2-breeding-id="${root.CSS?.escape?root.CSS.escape(next.breedingId):next.breedingId}"] .hh-p2-life-actions button:first-child`,button=>button.click());}
    return true;
  }
  function openWorkspace(next){
    if(!next.litterId)return false;root.HerdHarborBreedingWorkspace?.open?.(next.litterId);
    const tab=next.kind==="wean-litter"?"weaning":next.kind==="evaluate-litter"?"decisions":next.kind==="update-offspring"?"offspring":next.tab||"offspring";
    if(["create-sale","transfer-buyer"].includes(next.kind)){
      waitFor("#hh-breeding-litter-workspace [data-hh-lst-tab]",button=>{button.click();if(next.kind==="transfer-buyer"&&next.saleId)waitFor(`#hh-breeding-litter-workspace [data-hh-lst-transfer="${root.CSS?.escape?root.CSS.escape(next.saleId):next.saleId}"]`,transfer=>transfer.click(),0,60);},0,60);
    }else waitFor(`#hh-breeding-litter-workspace [data-hh-bw-tab="${tab}"]`,button=>button.click());
    return true;
  }
  function activate(node){const next={kind:clean(node.dataset.hhNextKind),animalId:clean(node.dataset.hhNextAnimal),breedingId:clean(node.dataset.hhNextBreeding),litterId:clean(node.dataset.hhNextLitter),saleId:clean(node.dataset.hhNextSale),tab:clean(node.dataset.hhNextTab)};if(["manage-litter","update-offspring","wean-litter","evaluate-litter","create-sale","transfer-buyer","lifecycle-complete"].includes(next.kind))return openWorkspace(next);return openProfile(next);}

  function captureEvaluation(event){
    const button=event.target.closest?.("#hh-breeding-litter-workspace [data-hh-bw-disposition]");if(!button)return;
    const overlay=button.closest("#hh-breeding-litter-workspace"),litterId=clean(overlay?.dataset?.hhBwLitterId||overlay?.dataset?.hhLstLitterId);if(!litterId)return;
    const ids=[...overlay.querySelectorAll('[data-hh-bw-select]:checked')].map(input=>input.value).filter(Boolean);if(!ids.length)return;
    root.setTimeout(()=>{
      const state=stateNow(),next=Core.markEvaluated(state,litterId,ids);if(next===state)return;
      root.HerdHarborApp?.commitState?.(next,`${ids.length} offspring evaluation decision${ids.length===1?"":"s"} recorded.`);root.HerdHarborApp?.refresh?.();schedule();
    },40);
  }

  function enhance(){renderProfile();renderBreedingCards();renderWorkspace();renderDashboard();}
  function run(){queued=false;const body=root.document.body;if(observer&&body)observer.disconnect();try{enhance();}finally{if(observer&&body)observer.observe(body,{childList:true,subtree:true,characterData:true});}}
  function schedule(){if(queued)return;queued=true;(root.requestAnimationFrame||root.setTimeout)(run,0);}
  function install(){if(installed)return;installed=true;root.addEventListener("click",event=>{const node=event.target.closest?.("[data-hh-next-kind]");if(node){event.preventDefault();event.stopPropagation();activate(node);return;}captureEvaluation(event);},true);["herdharbor:app-ready","herdharbor:litter-workspace-changed","herdharbor:litter-sale-transfer-changed","hashchange"].forEach(name=>root.addEventListener(name,schedule));observer=new root.MutationObserver(schedule);if(root.document.body)observer.observe(root.document.body,{childList:true,subtree:true,characterData:true});schedule();}
  install();
})(typeof globalThis!=="undefined"?globalThis:this);