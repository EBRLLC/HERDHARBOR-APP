(function(root){
  "use strict";
  if(!root?.document)return;
  let Core=root.HerdHarborGeneticsV2Phase3Core,observer=null,queued=false,activeLitterId="";
  const clean=v=>String(v==null?"":v).trim();
  const lower=v=>clean(v).toLowerCase();
  const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const stateNow=()=>{try{return root.HerdHarborApp?.getState?.()||null;}catch{return null;}};
  function activeAnimalId(){const p=clean(root.location?.hash).replace(/^#/,"").split("/");if(p[0]!=="animal"||!p[1])return"";try{return decodeURIComponent(p[1]);}catch{return p[1];}}
  function animalById(state,id){return(Array.isArray(state?.animals)?state.animals:[]).find(a=>String(a.id)===String(id))||null;}
  function isRabbit(a){return lower(a?.species).startsWith("rabbit");}
  function fmt(value){if(!value)return"";const d=new Date(`${String(value).slice(0,10)}T12:00:00`);return Number.isNaN(d.getTime())?clean(value):d.toLocaleDateString();}

  function proofCard(row){
    const link=row.childId?`<button type="button" class="hh-gv2p3-link" data-hh-gv2p3-animal="${esc(row.childId)}">${esc(row.childName)}</button>`:esc(row.childName);
    return`<article class="hh-gv2p3-proof"><div class="hh-gv2p3-proof-locus"><strong>${esc(row.locus)}</strong><span>${esc(row.allele)}</span></div><div><strong>${esc(row.parentName)} — offspring-proven</strong><p>${esc(row.note)}</p><small>Evidence: ${link}${row.breedingId?` · breeding ${esc(row.breedingId)}`:""}</small></div></article>`;
  }

  function litterPanel(summary){
    const proofs=summary.proofs.slice(0,8),progress=summary.progress;
    const progressHtml=progress?.goal?`<div class="hh-gv2p3-progress ${progress.status==="achieved"?"is-achieved":""}"><span>Current goal · ${esc(progress.goal.label)}</span><strong>${esc(progress.label)}</strong><small>${progress.identifiedCount} identified · ${progress.targetCount} matching · ${progress.totalOffspring} offspring profiles</small></div>`:
      `<div class="hh-gv2p3-progress"><span>Breeding goal</span><strong>${esc(progress?.label||"No breeding goal selected")}</strong><small>Set a goal in either parent's Genetics tab to track progress here.</small></div>`;
    const proofHtml=proofs.length?`<div class="hh-gv2p3-proof-list">${proofs.map(proofCard).join("")}</div>`:
      `<div class="hh-gv2p3-empty"><strong>${esc(summary.headline)}</strong><span>${summary.offspring.some(child=>clean(child.color||child.variety))?"The recorded litter still improves the history. HerdHarbor will only promote a hidden allele when the biology actually proves it.":"Use the existing Offspring tab to record colors or varieties. There is no separate genetics form to complete."}</span></div>`;
    return`<section class="hh-gv2p3-litter" data-hh-gv2p3-litter-panel><div class="hh-gv2p3-head"><div><span class="eyebrow">Genetics V2 · Phase 3</span><h3>What this litter taught us</h3><p>Record the offspring once. HerdHarbor uses those real results to improve the parents' genetics and future pairing guidance.</p></div><div class="hh-gv2p3-count"><strong>${summary.proofs.length}</strong><span>parent proof${summary.proofs.length===1?"":"s"}</span></div></div>${progressHtml}${proofHtml}<div class="hh-gv2p3-rule"><strong>No recessive offspring ≠ non-carrier.</strong><span>${esc(summary.rule)}</span></div></section>`;
  }

  function renderLitter(){
    Core=root.HerdHarborGeneticsV2Phase3Core||Core;if(!Core)return false;
    const shell=root.document.querySelector('#hh-breeding-litter-workspace .hh-bw-shell');if(!shell||!activeLitterId)return false;
    const state=stateNow(),summary=state?Core.litterLearningSummary(state,activeLitterId):null;
    const old=shell.querySelector("[data-hh-gv2p3-litter-panel]");if(!summary){old?.remove();return false;}
    const wrap=root.document.createElement("div");wrap.innerHTML=litterPanel(summary);const next=wrap.firstElementChild;if(!next)return false;
    if(old&&old.innerHTML===next.innerHTML)return true;
    if(old)old.replaceWith(next);else{const stats=shell.querySelector(".hh-bw-stats");if(stats)stats.insertAdjacentElement("afterend",next);else shell.querySelector(".hh-bw-header")?.insertAdjacentElement("afterend",next);}
    return true;
  }

  function historyCard(row){
    const latest=row.latest,child=latest?.child;
    return`<article class="hh-gv2p3-history-card"><div><strong>${esc(row.label)}</strong><span>${row.supportingOffspring} supporting offspring across ${row.supportingLitters} litter${row.supportingLitters===1?"":"s"}</span></div><div class="hh-gv2p3-history-meta">${child?`<button type="button" data-hh-gv2p3-animal="${esc(child.id)}">Latest: ${esc(child.name||"Offspring")}</button>`:""}${latest?.litter?.birthDate?`<small>${esc(fmt(latest.litter.birthDate))}</small>`:""}</div></article>`;
  }

  function profilePanel(state,animal){
    const history=Core.animalLearningHistory(state,animal.id),progress=Core.goalProgressForAnimal(state,animal.id);
    const goal=progress?.goal;
    const historyHtml=history.conclusions.length?history.conclusions.map(historyCard).join(""):`<div class="hh-gv2p3-empty"><strong>No offspring-proven conclusions yet.</strong><span>That is not a problem. As identified offspring create biologically decisive evidence, HerdHarbor will add it here automatically.</span></div>`;
    let goalHtml=`<div class="hh-gv2p3-progress"><span>Breeding goal progress</span><strong>Choose a breeding goal above</strong><small>Phase 2 will rank mates; Phase 3 will measure what your real litters teach HerdHarbor.</small></div>`;
    if(goal){
      const label=progress.targetCount?`${progress.targetCount} recorded offspring have matched ${goal.label}`:`No recorded offspring have matched ${goal.label} yet`;
      goalHtml=`<div class="hh-gv2p3-progress ${progress.targetCount?"is-achieved":""}"><span>Breeding goal progress · ${esc(goal.label)}</span><strong>${esc(label)}</strong><small>${progress.successfulLitters} successful litter${progress.successfulLitters===1?"":"s"} · ${progress.identifiedCount} identified offspring across ${progress.litterCount} litter${progress.litterCount===1?"":"s"}</small></div>`;
    }
    return`<section class="hh-gv2p3-profile" data-hh-gv2p3-profile-panel><div class="hh-gv2p3-head"><div><span class="eyebrow">Genetics V2 · Phase 3</span><h3>Offspring learning</h3><p>Every real litter can strengthen this rabbit's genetic evidence. HerdHarbor keeps the child and litter trail so you can see why a conclusion exists.</p></div><div class="hh-gv2p3-count"><strong>${history.offspringCount}</strong><span>teaching offspring</span></div></div>${goalHtml}<section class="hh-gv2p3-history"><div class="hh-gv2p3-section-head"><div><h4>What this rabbit's offspring have proven</h4><p>Additional offspring and litters add corroboration; they do not create fake certainty or negative carrier evidence.</p></div><span>${history.litterCount} litter${history.litterCount===1?"":"s"}</span></div>${historyHtml}</section><div class="hh-gv2p3-rule"><strong>Testing remains optional.</strong><span>HerdHarbor uses real offspring, phenotype, pedigree and existing records first. A DNA test is only a shortcut when you want an unresolved question answered sooner.</span></div></section>`;
  }

  function renderProfile(){
    Core=root.HerdHarborGeneticsV2Phase3Core||Core;if(!Core)return false;
    const host=root.document.querySelector('#view-animal-profile.active [data-hh-p2-panel="genetics"]');if(!host)return false;
    const state=stateNow(),animal=state?animalById(state,activeAnimalId()):null,old=host.querySelector("[data-hh-gv2p3-profile-panel]");
    if(!animal||!isRabbit(animal)){old?.remove();return false;}
    const wrap=root.document.createElement("div");wrap.innerHTML=profilePanel(state,animal);const next=wrap.firstElementChild;if(!next)return false;
    if(old&&old.innerHTML===next.innerHTML)return true;if(old)old.replaceWith(next);else host.appendChild(next);return true;
  }

  function render(){renderLitter();renderProfile();}
  function schedule(){if(queued)return;queued=true;(root.requestAnimationFrame||root.setTimeout)(()=>{queued=false;render();},0);}
  function openAnimal(id){if(!id)return;root.HerdHarborBreedingWorkspace?.close?.();root.HerdHarborFlowPhase2?.openAnimalProfile?.(id,"genetics",{history:"push",label:"Offspring genetics evidence"});}
  function onClick(event){
    const manage=event.target.closest?.("[data-hh-bw-manage-litter]");if(manage?.dataset?.hhBwManageLitter){activeLitterId=clean(manage.dataset.hhBwManageLitter);schedule();}
    const link=event.target.closest?.("[data-hh-gv2p3-animal]");if(!link)return;event.preventDefault();event.stopPropagation();openAnimal(link.dataset.hhGv2p3Animal);
  }
  function onOffspringCreated(event){if(event?.detail?.litterId)activeLitterId=clean(event.detail.litterId);schedule();}
  function onWorkspaceChanged(event){if(event?.detail?.litterId)activeLitterId=clean(event.detail.litterId);schedule();}
  function install(){
    root.document.addEventListener("click",onClick,true);
    root.addEventListener("herdharbor:offspring-auto-created",onOffspringCreated);
    root.addEventListener("herdharbor:litter-workspace-changed",onWorkspaceChanged);
    ["herdharbor:app-ready","herdharbor:genetics-v2-updated","hashchange","storage"].forEach(name=>root.addEventListener(name,schedule));
    observer=new root.MutationObserver(schedule);if(root.document.body)observer.observe(root.document.body,{childList:true,subtree:true});schedule();
  }
  root.HerdHarborGeneticsV2Phase3=Object.freeze({VERSION:"2.0.0-phase3",refresh:schedule});install();
})(typeof globalThis!=="undefined"?globalThis:this);