(function(root){
  "use strict";
  if(!root?.document)return;
  const Core=root.HerdHarborBreedingPerformanceCore;if(!Core)return;
  let observer=null,queued=false,installed=false;
  const clean=value=>String(value==null?"":value).trim();
  const esc=value=>String(value==null?"":value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));
  const pct=value=>value===null||value===undefined||!Number.isFinite(Number(value))?"—":`${Number(value).toFixed(1)}%`;
  const dec=value=>value===null||value===undefined||!Number.isFinite(Number(value))?"—":Number(value).toFixed(1).replace(/\.0$/,"");
  const dateLabel=value=>{if(!value)return"—";const d=new Date(`${String(value).slice(0,10)}T12:00:00`);return Number.isNaN(d.getTime())?clean(value):d.toLocaleDateString();};
  const stateNow=()=>{try{return root.HerdHarborApp?.getState?.()||{};}catch{return{};}};

  function activeBreedingAnalytics(){
    const view=root.document.querySelector("#view-analytics");if(!view?.classList.contains("active"))return null;
    const tab=view.querySelector('[data-analytics-tab="breeding"]');
    return tab&&(tab.getAttribute("aria-selected")==="true"||tab.classList.contains("button-primary"))?view:null;
  }
  function filterOptions(view){
    return{
      species:clean(view.querySelector("[data-analytics-species]")?.value),
      range:clean(view.querySelector("[data-analytics-range]")?.value)||"all",
      start:clean(view.querySelector("[data-analytics-start]")?.value),
      end:clean(view.querySelector("[data-analytics-end]")?.value),
      today:new Date().toISOString().slice(0,10)
    };
  }
  function metric(label,value,note=""){
    return`<article class="hh-bpd-metric"><span>${esc(label)}</span><strong>${esc(value)}</strong>${note?`<small>${esc(note)}</small>`:""}</article>`;
  }
  function coverage(label,value,note){
    const width=value===null||value===undefined?0:Math.max(0,Math.min(100,Number(value)));
    return`<div class="hh-bpd-coverage-row"><div><strong>${esc(label)}</strong><span>${esc(note)}</span></div><div class="hh-bpd-progress" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(width)}"><i style="width:${width}%"></i></div><b>${pct(value)}</b></div>`;
  }
  function profileButton(id,label="Open"){
    return id?`<button type="button" class="button button-ghost button-small" data-hh-bpd-animal="${esc(id)}">${esc(label)}</button>`:"—";
  }
  function parentTable(rows,role){
    if(!rows.length)return`<div class="hh-bpd-empty">No ${role} performance records match the current filters.</div>`;
    return`<div class="hh-bpd-table-wrap"><table class="hh-bpd-table"><thead><tr><th>${role==="dam"?"Dam":"Sire"}</th><th>Breedings</th><th>Litters</th><th>Conception</th><th>Avg born alive</th><th>Weaning survival</th><th>Weaned</th><th></th></tr></thead><tbody>${rows.slice(0,12).map(row=>`<tr><td><strong>${esc(row.name)}</strong><small>${esc([row.species,row.breed].filter(Boolean).join(" · "))}</small></td><td>${row.breedings}</td><td>${row.litters}</td><td>${pct(row.conceptionRate)}</td><td>${dec(row.averageBornAlive)}</td><td>${pct(row.survivalToWeaning)}</td><td>${row.totalWeaned}</td><td>${profileButton(row.id)}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function pairingTable(rows){
    if(!rows.length)return`<div class="hh-bpd-empty">No historical pairings match the current filters.</div>`;
    return`<div class="hh-bpd-table-wrap"><table class="hh-bpd-table"><thead><tr><th>Pairing</th><th>Breedings</th><th>Litters</th><th>Conception</th><th>Avg born alive</th><th>Weaning survival</th><th>Latest</th></tr></thead><tbody>${rows.slice(0,16).map(row=>`<tr><td><div class="hh-bpd-pair"><button type="button" data-hh-bpd-animal="${esc(row.damId)}">${esc(row.damName)}</button><span>×</span><button type="button" data-hh-bpd-animal="${esc(row.sireId)}">${esc(row.sireName)}</button></div></td><td>${row.breedings}</td><td>${row.litters}</td><td>${pct(row.conceptionRate)}</td><td>${dec(row.averageBornAlive)}</td><td>${pct(row.survivalToWeaning)}</td><td>${dateLabel(row.latestDate)}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function litterTable(rows){
    if(!rows.length)return`<div class="hh-bpd-empty">No litter outcomes match the current filters.</div>`;
    return`<div class="hh-bpd-table-wrap"><table class="hh-bpd-table"><thead><tr><th>Date</th><th>Pairing</th><th>Born alive</th><th>Stillborn</th><th>Losses</th><th>Weaned</th><th>Survival</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${dateLabel(row.date)}</td><td><div class="hh-bpd-pair"><button type="button" data-hh-bpd-animal="${esc(row.damId)}">${esc(row.damName)}</button><span>×</span><button type="button" data-hh-bpd-animal="${esc(row.sireId)}">${esc(row.sireName)}</button></div></td><td>${row.bornAlive}</td><td>${row.stillborn}</td><td>${row.losses}</td><td>${row.weaned}</td><td>${row.resolved?pct(row.survival):"In progress"}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function dashboardHtml(data,options){
    const c=data.conception,l=data.litter;
    const range=data.filters.start||data.filters.end?`${data.filters.start||"Beginning"} → ${data.filters.end||"Today"}`:"All recorded history";
    return`<section class="hh-bpd" aria-label="Breeding performance dashboard"><header class="hh-bpd-head"><div><span class="eyebrow">Breeding performance</span><h3>Performance dashboard</h3><p>Calculated from your actual breeding and litter records. Pending breedings are not counted as failed conceptions, and incomplete litters are excluded from weaning-survival percentages.</p></div><div class="hh-bpd-scope"><strong>${esc(options.species||"All species")}</strong><span>${esc(range)}</span></div></header>
      <div class="hh-bpd-metrics">${metric("Conception rate",pct(c.rate),`${c.conceived} conceived · ${c["not-conceived"]} not conceived · ${c.pending} pending`)}${metric("Recorded litters",String(l.litters),`${data.recordCounts.breedings} breeding records`)}${metric("Born alive",String(l.bornAlive),`${l.stillborn} stillborn recorded`)}${metric("Live birth rate",pct(l.liveBirthRate),"Born alive ÷ recorded births")}${metric("Avg born alive / litter",dec(l.averageBornAlive),l.largestBornAlive===null?"No litter sizes recorded":`Largest recorded: ${l.largestBornAlive}`)}${metric("Survival to weaning",pct(l.survivalToWeaning),`${l.resolvedWeaningLitters} resolved litter${l.resolvedWeaningLitters===1?"":"s"}`)}${metric("Avg weaned / litter",dec(l.averageWeaned),`${l.totalWeaned} total weaned recorded`)}${metric("Pre-weaning losses",String(l.recordedPreWeaningLosses),"Explicitly recorded losses only")}</div>
      <section class="hh-bpd-card hh-bpd-coverage"><div class="hh-bpd-section-head"><div><h4>Record coverage</h4><p>Percentages are only as complete as the breeding outcomes and weaning outcomes that have been recorded.</p></div></div>${coverage("Pregnancy / conception outcomes",data.coverage.pregnancyOutcome,`${c.resolved} resolved of ${Math.max(0,c.total-c.cancelled)} eligible breeding records`)}${coverage("Weaning outcomes",data.coverage.weaningOutcome,`${l.resolvedWeaningLitters} resolved of ${l.weaningEligibleLitters} litters with live offspring`)}</section>
      <div class="hh-bpd-two"><section class="hh-bpd-card"><div class="hh-bpd-section-head"><div><h4>Dam performance</h4><p>Historical reproductive results. Sorted by recorded litters, not by a predictive score.</p></div></div>${parentTable(data.dams,"dam")}</section><section class="hh-bpd-card"><div class="hh-bpd-section-head"><div><h4>Sire performance</h4><p>Historical offspring results. This does not assign cause for pregnancy loss or litter outcomes.</p></div></div>${parentTable(data.sires,"sire")}</section></div>
      <section class="hh-bpd-card"><div class="hh-bpd-section-head"><div><h4>Pairing history</h4><p>See what each exact dam × sire pairing has actually produced before moving into future Pairing Intelligence.</p></div></div>${pairingTable(data.pairings)}</section>
      <section class="hh-bpd-card"><div class="hh-bpd-section-head"><div><h4>Recent litter outcomes</h4><p>Only completed weaning outcomes receive a survival percentage; active litters remain marked In progress.</p></div></div>${litterTable(data.recentLitters)}</section>
      <div class="hh-bpd-existing"><strong>Trend charts</strong><span>The existing HerdHarbor breeding outcome, litter-size trend, and historical pairing charts continue below.</span></div>
    </section>`;
  }

  function render(){
    const view=activeBreedingAnalytics();if(!view)return false;
    const tabs=view.querySelector(".analytics-tabs");if(!tabs)return false;
    const options=filterOptions(view),data=Core.dashboard(stateNow(),options);
    let dash=view.querySelector(".hh-bpd");
    if(!dash){const wrapper=root.document.createElement("div");wrapper.innerHTML=dashboardHtml(data,options);dash=wrapper.firstElementChild;tabs.insertAdjacentElement("afterend",dash);}else dash.outerHTML=dashboardHtml(data,options);
    const current=view.querySelector(".hh-bpd");
    const legacy=current?.nextElementSibling;
    if(legacy?.classList.contains("stats-grid")){legacy.hidden=true;legacy.dataset.hhBpdLegacySummary="1";}
    return true;
  }
  function openAnimal(id){if(!id)return;root.HerdHarborFlowPhase2?.openAnimalProfile?.(id,"breeding",{history:"push"});}
  function onClick(event){const button=event.target.closest?.("[data-hh-bpd-animal]");if(!button)return;event.preventDefault();openAnimal(clean(button.dataset.hhBpdAnimal));}
  function run(){queued=false;const body=root.document.body;if(observer&&body)observer.disconnect();try{render();}finally{if(observer&&body)observer.observe(body,{childList:true,subtree:true,characterData:true});}}
  function schedule(){if(queued)return;queued=true;(root.requestAnimationFrame||root.setTimeout)(run,0);}
  function install(){if(installed)return;installed=true;root.addEventListener("click",onClick,true);root.addEventListener("herdharbor:app-ready",schedule);root.addEventListener("hashchange",schedule);observer=new root.MutationObserver(schedule);if(root.document.body)observer.observe(root.document.body,{childList:true,subtree:true,characterData:true});schedule();}
  install();
})(typeof globalThis!=="undefined"?globalThis:this);
