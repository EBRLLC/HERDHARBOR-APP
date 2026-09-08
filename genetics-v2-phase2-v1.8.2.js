(function(root){
  "use strict";
  if(!root?.document)return;
  let Core=root.HerdHarborGeneticsV2Phase2Core,observer=null,queued=false;
  const drafts=new Map();
  const clean=v=>String(v==null?"":v).trim();
  const lower=v=>clean(v).toLowerCase();
  const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const pct=v=>`${Math.round(Number(v||0)*100)}%`;
  const stateNow=()=>{try{return root.HerdHarborApp?.getState?.()||null;}catch{return null;}};
  function animalId(){const p=clean(root.location?.hash).replace(/^#/,"").split("/");if(p[0]!=="animal"||!p[1])return"";try{return decodeURIComponent(p[1]);}catch{return p[1];}}
  function animalById(state,id){return(Array.isArray(state?.animals)?state.animals:[]).find(a=>String(a.id)===String(id))||null;}
  function isRabbit(a){return lower(a?.species).startsWith("rabbit");}
  function savedGoal(animal){return clean(animal?.genetics?.breedingGoal?.goalId)||"dilute";}
  function selectedGoal(animal){return drafts.get(String(animal.id))||savedGoal(animal);}
  function routeClass(route){return["good","info","neutral"].includes(route?.tone)?`is-${route.tone}`:"is-neutral";}
  function probabilityCopy(candidate){return candidate.probabilityKnown?`${pct(candidate.probability)} target probability`:`Not enough evidence for a responsible %`;}
  function confidenceCopy(candidate){if(!candidate.probabilityKnown)return candidate.unknownLoci.length?`Unresolved loci: ${candidate.unknownLoci.join(", ")}`:"Evidence incomplete";return `${Math.round(candidate.confidence)} / 100 evidence confidence`;}
  function riskCopy(candidate){if(candidate.avoidKnown&&Number(candidate.avoidProbability)>0)return`Known caution: ${pct(candidate.avoidProbability)} tracked avoid-risk`;if(candidate.avoidKnown)return"No tracked avoid-risk from this goal";return"Avoid-risk cannot be calculated yet";}
  function proofCopy(candidate){if(!candidate.proofOpportunities.length)return"";const rows=candidate.proofOpportunities.slice(0,2).map(r=>`${esc(r.testerName)} can help reveal whether ${esc(r.unknownName)} carries ${esc(r.allele)} at ${esc(r.locus)}.`);return`<div class="hh-gv2p2-proof"><strong>Breeding can be evidence.</strong><span>${rows.join(" ")}</span></div>`;}
  function candidateCard(candidate,index){
    return`<article class="hh-gv2p2-candidate ${index===0?"is-best":""}">
      <div class="hh-gv2p2-candidate-head"><div><span class="hh-gv2p2-rank">${index===0?"Best current path":`Option ${index+1}`}</span><h4>${esc(candidate.mateName)}</h4><p>${esc(candidate.breed||"Rabbit")} · ${esc(candidate.sex||"Sex recorded in animal profile")}</p></div><strong class="hh-gv2p2-score">${candidate.score}<small>/100</small></strong></div>
      <div class="hh-gv2p2-metrics"><div><span>Selected target</span><strong>${esc(probabilityCopy(candidate))}</strong></div><div><span>Evidence</span><strong>${esc(confidenceCopy(candidate))}</strong></div><div><span>Risk check</span><strong>${esc(riskCopy(candidate))}</strong></div></div>
      <div class="hh-gv2p2-route ${routeClass(candidate.route)}"><strong>${esc(candidate.route.label)}</strong><span>${esc(candidate.route.text)}</span></div>
      ${proofCopy(candidate)}
      <div class="hh-gv2p2-actions"><button type="button" class="button button-ghost button-small" data-hh-gv2p2-view-mate="${esc(candidate.mateId)}">View mate</button><button type="button" class="button button-primary button-small" data-hh-p2-action="breeding" data-hh-gv2p2-recommended-mate="${esc(candidate.mateId)}">Start breeding</button></div>
    </article>`;
  }
  function panel(state,animal){
    const goalId=selectedGoal(animal),plan=Core.planForAnimal(state,animal.id,goalId),goal=plan.goal,stored=savedGoal(animal);
    const options=Core.GOALS.map(g=>`<option value="${esc(g.id)}" ${g.id===goal.id?"selected":""}>${esc(g.label)}</option>`).join("");
    const candidates=plan.candidates.slice(0,5);
    const cards=candidates.length?candidates.map(candidateCard).join(""):`<div class="hh-gv2p2-empty"><strong>No compatible current mates found.</strong><span>Add or reactivate an opposite-sex rabbit to compare breeding paths.</span></div>`;
    const dirty=goal.id!==stored;
    return`<section class="hh-gv2p2-panel" data-hh-gv2p2-panel>
      <div class="hh-gv2p2-head"><div><span class="eyebrow">Genetics V2 · Phase 2</span><h3>Breeding Goal Planner</h3><p>Tell HerdHarbor what you are working toward. It uses the genetics your herd has already taught it to rank the next breeding paths.</p></div></div>
      <div class="hh-gv2p2-philosophy"><strong>DNA testing is optional.</strong><span>Phenotype, pedigree and real offspring can all improve the evidence trail. Testing is an optional shortcut when an important unknown needs to be resolved immediately.</span></div>
      <section class="hh-gv2p2-goal"><label for="hh-gv2p2-goal-${esc(animal.id)}">What are you trying to produce?</label><div class="hh-gv2p2-goal-row"><select id="hh-gv2p2-goal-${esc(animal.id)}" data-hh-gv2p2-goal>${options}</select><button type="button" class="button button-primary button-small" data-hh-gv2p2-save-goal ${dirty?"":"disabled"}>${dirty?"Save goal":"Goal saved"}</button></div><strong>${esc(goal.short)}</strong><p>${esc(goal.note)}</p></section>
      <div class="hh-gv2p2-next ${routeClass(plan.next)}"><span>Best next genetics step</span><strong>${esc(plan.next.label)}</strong><p>${esc(plan.next.text)}</p></div>
      <div class="hh-gv2p2-section-head"><div><h4>Best breeding paths in your herd</h4><p>Target probability and evidence confidence are shown separately so a prediction never masquerades as certainty.</p></div><span>${plan.candidates.length} compatible mate${plan.candidates.length===1?"":"s"}</span></div>
      <div class="hh-gv2p2-candidates">${cards}</div>
      <div class="hh-gv2p2-rule"><strong>Breeding can be evidence.</strong><span>A target/recessive offspring can prove a hidden allele when the biology supports it. Failing to produce that offspring does not prove the parent lacks the allele.</span></div>
      <p class="hh-gv2p2-disclaimer">${esc(plan.disclaimer)}</p>
    </section>`;
  }
  function render(){Core=root.HerdHarborGeneticsV2Phase2Core||Core;if(!Core)return false;const host=root.document.querySelector('#view-animal-profile.active [data-hh-p2-panel="genetics"]');if(!host)return false;const state=stateNow(),animal=animalById(state,animalId()),old=host.querySelector("[data-hh-gv2p2-panel]");if(!state||!animal||!isRabbit(animal)){old?.remove();return false;}const wrap=root.document.createElement("div");wrap.innerHTML=panel(state,animal);const next=wrap.firstElementChild;if(!next)return false;if(old&&old.innerHTML===next.innerHTML)return true;if(old)old.replaceWith(next);else host.appendChild(next);return true;}
  function schedule(){if(queued)return;queued=true;(root.requestAnimationFrame||root.setTimeout)(()=>{queued=false;render();},0);}
  function saveGoal(){const state=stateNow(),id=animalId(),animal=animalById(state,id);if(!state||!animal)return false;const goalId=selectedGoal(animal),animals=(state.animals||[]).map(row=>{if(String(row.id)!==String(id))return row;const genetics={...(row.genetics||{}),breedingGoal:{...((row.genetics||{}).breedingGoal||{}),goalId,updatedAt:new Date().toISOString()}};return{...row,genetics,updatedAt:new Date().toISOString()};});root.HerdHarborApp?.commitState?.({...state,animals},"");root.HerdHarborApp?.refresh?.();drafts.delete(String(id));root.HerdHarborApp?.toast?.(`Breeding goal saved: ${Core.goalById(goalId).label}.`,"success");schedule();return true;}
  function viewMate(id){if(!id)return;root.HerdHarborFlowPhase2?.openAnimalProfile?.(id,"genetics",{history:"push",label:"Genetics comparison"});}
  function onChange(event){const select=event.target.closest?.("[data-hh-gv2p2-goal]");if(!select)return;const id=animalId();if(!id)return;drafts.set(String(id),clean(select.value));schedule();}
  function onClick(event){const view=event.target.closest?.("[data-hh-gv2p2-view-mate]");if(view){event.preventDefault();event.stopPropagation();viewMate(view.dataset.hhGv2p2ViewMate);return;}if(event.target.closest?.("[data-hh-gv2p2-save-goal]")){event.preventDefault();event.stopPropagation();saveGoal();}}
  function install(){root.document.addEventListener("change",onChange,true);root.document.addEventListener("click",onClick,true);["herdharbor:app-ready","herdharbor:genetics-v2-updated","herdharbor:litter-workspace-changed","hashchange","storage"].forEach(name=>root.addEventListener(name,schedule));observer=new root.MutationObserver(schedule);if(root.document.body)observer.observe(root.document.body,{childList:true,subtree:true});schedule();}
  root.HerdHarborGeneticsV2Phase2=Object.freeze({VERSION:"2.0.0-phase2",refresh:schedule});install();
})(typeof globalThis!=="undefined"?globalThis:this);