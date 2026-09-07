(function(root,factory){
  "use strict";
  const api=factory(root);
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.HerdHarborFlowPhase2=api;
  if(root&&root.document)api.install();
})(typeof globalThis!=="undefined"?globalThis:this,function(root){
  "use strict";

  const VERSION="1.8.2";
  const PROFILE_ROUTE="animal";
  const TABS=Object.freeze(["overview","health","breeding","genetics","pedigree","shows","production","history"]);
  const TAB_LABELS=Object.freeze({overview:"Overview",health:"Health",breeding:"Breeding",genetics:"Genetics",pedigree:"Pedigree",shows:"Shows",production:"Production",history:"History"});
  const RETURN_TTL_MS=5*60*1000;
  let installed=false;
  let activeProfile=null;
  let coreModalBypass=0;
  let pendingReturn=null;
  let syncingLocation=false;

  const clean=value=>String(value==null?"":value).trim();
  const lower=value=>clean(value).toLowerCase();
  const esc=value=>String(value==null?"":value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));
  const cssEscape=value=>{const text=String(value);try{return root.CSS?.escape?root.CSS.escape(text):text.replace(/["\\]/g,"\\$&");}catch{return text.replace(/["\\]/g,"\\$&");}};
  const formatDate=value=>{if(!value)return"—";const date=new Date(`${String(value).slice(0,10)}T12:00:00`);return Number.isNaN(date.getTime())?clean(value):date.toLocaleDateString();};
  const array=(value,key)=>Array.isArray(value?.[key])?value[key]:[];
  const stateNow=()=>{try{return root.HerdHarborApp?.getState?.()||{};}catch{return{};}};
  const workflow=()=>root.HerdHarborPhase1Workflow||null;
  const healthNow=state=>{try{return root.HerdHarborHealthIntelligence?.readHealthState?.()||state?.healthIntelligence||{};}catch{return state?.healthIntelligence||{};}};
  const animalById=(state,id)=>array(state,"animals").find(animal=>String(animal.id)===String(id))||null;
  const animalName=(state,id)=>animalById(state,id)?.name||"Unknown animal";

  function normalizeTab(tab="overview"){
    const value=lower(tab);
    return TABS.includes(value)?value:"overview";
  }

  function profileHash(animalId,tab="overview"){
    const id=encodeURIComponent(clean(animalId));
    return id?`#${PROFILE_ROUTE}/${id}/${normalizeTab(tab)}`:"#animals";
  }

  function parseProfileHash(value=""){
    const raw=clean(value).replace(/^#/,"");
    const parts=raw.split("/");
    if(parts[0]!==PROFILE_ROUTE||!parts[1])return null;
    let animalId="";
    try{animalId=decodeURIComponent(parts[1]);}catch{animalId=parts[1];}
    if(!clean(animalId))return null;
    return{animalId:clean(animalId),tab:normalizeTab(parts[2]||"overview")};
  }

  function lifecycleSummary(state={},model={}){
    const animal=model.animal||{};
    const animalId=String(animal.id||"");
    const breedings=array(state,"breedings")
      .filter(record=>String(record.femaleId)===animalId||String(record.maleId)===animalId)
      .sort((a,b)=>String(b.breedingDate||"").localeCompare(String(a.breedingDate||"")));
    const sales=array(state,"sales")
      .filter(sale=>array(sale,"items").some(item=>String(item.animalId)===animalId))
      .sort((a,b)=>String(b.saleDate||b.completedAt||"").localeCompare(String(a.saleDate||a.completedAt||"")));
    const transfers=array(state,"transfers")
      .filter(record=>String(record.animalId||"")===animalId||array(record,"animalIds").map(String).includes(animalId))
      .sort((a,b)=>String(b.createdAt||b.transferDate||b.date||"").localeCompare(String(a.createdAt||a.transferDate||a.date||"")));
    const latestBreeding=breedings[0]||null;
    const latestSale=sales[0]||null;
    const latestTransfer=transfers[0]||null;
    return{
      status:clean(animal.status)||"Unknown",
      current:Boolean(model.current),
      quarantined:Boolean(model.quarantined),
      latestBreeding:latestBreeding?{
        status:clean(latestBreeding.status)||"Recorded",
        date:clean(latestBreeding.breedingDate),
        dueDate:clean(latestBreeding.dueDate),
        mateId:String(latestBreeding.femaleId)===animalId?clean(latestBreeding.maleId):clean(latestBreeding.femaleId)
      }:null,
      latestSale:latestSale?{status:clean(latestSale.status)||"Sale",date:clean(latestSale.saleDate||latestSale.completedAt),number:clean(latestSale.saleNumber||latestSale.invoiceNumber)}:null,
      latestTransfer:latestTransfer?{status:clean(latestTransfer.status)||clean(latestTransfer.direction)||"Transfer",date:clean(latestTransfer.createdAt||latestTransfer.transferDate||latestTransfer.date),transferId:clean(latestTransfer.transferId||latestTransfer.transferNumber)}:null
    };
  }

  function profileModel(state,animalId){
    try{return workflow()?.profileModel?.(state,animalId)||null;}catch{return null;}
  }

  function timelineRows(state,animalId){
    try{return workflow()?.timelineRows?.(state,animalId)||[];}catch{return[];}
  }

  function currentTabs(model){
    const tabs=Array.isArray(model?.tabs)?model.tabs.map(normalizeTab):["overview","health","pedigree","history"];
    return[...new Set(tabs.filter(tab=>TABS.includes(tab)))];
  }

  function ensureProfileView(){
    let view=root.document?.querySelector("#view-animal-profile");
    if(view)return view;
    const main=root.document?.querySelector(".main-content");
    if(!main)return null;
    view=root.document.createElement("section");
    view.id="view-animal-profile";
    view.className="view hh-p2-profile-view";
    view.setAttribute("aria-live","polite");
    main.appendChild(view);
    view.addEventListener("click",event=>{
      const back=event.target.closest?.("[data-hh-p2-back]");
      if(back){event.preventDefault();backToAnimals();return;}
      const tabButton=event.target.closest?.("[data-hh-p2-tab]");
      if(tabButton){event.preventDefault();selectTab(tabButton.dataset.hhP2Tab||"overview");return;}
      const action=event.target.closest?.("[data-hh-p2-action]");
      if(action){event.preventDefault();openCoreAction(action.dataset.hhP2Action||"");}
    });
    return view;
  }

  function clickAnimalsRoute(){
    const button=root.document?.querySelector('.nav-item[data-route="animals"]');
    if(!button)return false;
    button.click();
    return true;
  }

  function activateProfileView(view,animal){
    root.document?.querySelectorAll(".view").forEach(node=>node.classList.remove("active"));
    view.classList.add("active");
    root.document?.querySelectorAll(".nav-item").forEach(item=>item.classList.toggle("active",item.dataset.route==="animals"));
    const subtitle=root.document?.querySelector("#page-subtitle");
    if(subtitle)subtitle.textContent=`${animal.name||"Animal"} · Profile`;
    root.document?.querySelector("#sidebar")?.classList.remove("open");
  }

  function statusTone(status=""){
    const value=lower(status);
    if(["active","breeding","growing"].includes(value))return"green";
    if(["for sale","reserved"].includes(value))return"warning";
    if(["sold","deceased","archived","ancestor only"].includes(value))return"gray";
    return"";
  }

  function animalVisual(animal={}){
    if(animal.photoData)return`<img src="${esc(animal.photoData)}" alt="${esc(animal.name||"Animal")}">`;
    const initials=clean(animal.name).split(/\s+/).slice(0,2).map(part=>part[0]?.toUpperCase()||"").join("")||"HH";
    return`<span>${esc(initials)}</span>`;
  }

  function identityRows(animal={}){
    return[
      ["Primary ID",animal.earTagNumber||animal.tag||animal.tattoo||"—"],
      ["Registration",animal.registrationNumber||"—"],
      ["Species",animal.species||"—"],
      ["Breed",animal.breed||"—"],
      ["Sex",animal.sex||"—"],
      ["Born",formatDate(animal.dob)],
      ["Color / variety",[animal.color,animal.variety].filter(Boolean).join(" · ")||"—"],
      ["Breeder",animal.breeder||"—"]
    ];
  }

  function recordList(rows=[],empty="No records yet."){
    if(!rows.length)return`<div class="hh-p2-empty"><strong>${esc(empty)}</strong></div>`;
    return`<div class="hh-p2-record-list">${rows.map(row=>`<article class="hh-p2-record"><div><strong>${esc(row.title||"Record")}</strong>${row.detail?`<small>${esc(row.detail)}</small>`:""}</div><span>${esc(row.meta||"")}</span></article>`).join("")}</div>`;
  }

  function overviewPanel(state,model,lifecycle){
    const animal=model.animal;
    const rows=identityRows(animal);
    const recent=timelineRows(state,animal.id).slice(0,8).map(row=>({title:row.title,detail:row.detail,meta:`${formatDate(row.date)} · ${row.type}`}));
    const latestBreeding=lifecycle.latestBreeding;
    const latestSale=lifecycle.latestSale;
    const latestTransfer=lifecycle.latestTransfer;
    const healthCount=(model.health?.legacy?.length||0)+(model.health?.episodes?.length||0)+(model.health?.care?.length||0)+(model.health?.groups?.length||0);
    return`<div class="hh-p2-overview-grid">
      <section class="panel hh-p2-summary-card"><div class="panel-header"><h3>Identity</h3><small>Canonical animal record</small></div><div class="hh-p2-detail-grid">${rows.map(([label,value])=>`<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("")}</div></section>
      <section class="panel hh-p2-summary-card"><div class="panel-header"><h3>Lifecycle</h3><small>Live status across HerdHarbor</small></div><div class="hh-p2-lifecycle-grid">
        <div><span>Status</span><strong>${esc(lifecycle.status)}</strong><small>${lifecycle.current?"Current animal":"Historical record"}</small></div>
        <div><span>Health</span><strong>${lifecycle.quarantined?"Quarantined":`${healthCount} records`}</strong><small>${lifecycle.quarantined?"Breeding actions are blocked":"Connected health history"}</small></div>
        <div><span>Breeding</span><strong>${latestBreeding?esc(latestBreeding.status):"No breeding yet"}</strong><small>${latestBreeding?`${formatDate(latestBreeding.date)}${latestBreeding.dueDate?` · Due ${formatDate(latestBreeding.dueDate)}`:""}`:"Start from this profile when ready"}</small></div>
        <div><span>Sale / transfer</span><strong>${esc(latestTransfer?.status||latestSale?.status||"No transfer activity")}</strong><small>${esc(latestTransfer?.transferId||latestSale?.number||"Ownership stays with this account")}</small></div>
      </div></section>
    </div>
    <section class="panel hh-p2-recent"><div class="panel-header"><h3>Recent activity</h3><small>One timeline from existing records</small></div>${recordList(recent,"No dated activity is available yet.")}</section>`;
  }

  function healthPanel(model){
    const rows=[
      ...(model.health?.legacy||[]).map(record=>({title:record.type||"Health record",detail:record.details||record.notes||"",meta:formatDate(record.date)})),
      ...(model.health?.episodes||[]).map(record=>({title:record.concern||"Health episode",detail:record.resolved?"Resolved":record.quarantined?"Quarantined":"Open",meta:`${formatDate(record.startedDate)} · ${record.assessment?.level||record.healthStatus||""}`})),
      ...(model.health?.care||[]).map(record=>({title:record.product||record.type||"Care record",detail:record.reason||record.notes||"",meta:formatDate(record.date)}))
    ].sort((a,b)=>String(b.meta).localeCompare(String(a.meta))).slice(0,30);
    return`<div class="hh-p2-panel-head"><div><h3>Health</h3><p>Health records stay connected directly to this animal.</p></div><div><button class="button button-primary button-small" data-hh-p2-action="weight">Add weight</button><button class="button button-ghost button-small" data-hh-p2-action="episode">Start episode</button><button class="button button-ghost button-small" data-hh-p2-action="care">Add care</button></div></div>${recordList(rows,"No health records are connected to this animal yet.")}`;
  }

  function breedingPanel(state,model){
    const rows=(model.breedings||[]).slice().sort((a,b)=>String(b.breedingDate||"").localeCompare(String(a.breedingDate||""))).map(record=>({title:`${animalName(state,record.femaleId)} × ${animalName(state,record.maleId)}`,detail:record.dueDate?`Due ${formatDate(record.dueDate)}`:"",meta:`${formatDate(record.breedingDate)} · ${record.status||"Recorded"}`}));
    const blocked=model.quarantined?"Breeding is unavailable while this animal is quarantined.":!model.current?"Historical animals cannot start a new breeding.":"Pairings and birth outcomes remain part of one animal lifecycle.";
    return`<div class="hh-p2-panel-head"><div><h3>Breeding lifecycle</h3><p>${esc(blocked)}</p></div>${model.current&&!model.quarantined?'<button class="button button-primary button-small" data-hh-p2-action="breeding">Start breeding</button>':""}</div>${recordList(rows,"No breeding history is connected to this animal yet.")}`;
  }

  function geneticsPanel(model){
    const animal=model.animal;
    const loci=animal.genetics?.loci&&typeof animal.genetics.loci==="object"?Object.keys(animal.genetics.loci).length:0;
    const phenotype=animal.genetics?.phenotype?.recorded||animal.genetics?.phenotype?.canonical||animal.color||"No phenotype recorded";
    return`<div class="hh-p2-panel-head"><div><h3>Genetics</h3><p>Structured genetics remain in the existing species engine.</p></div><button class="button button-primary button-small" data-hh-p2-action="genetics">Open genetics</button></div><div class="hh-p2-lifecycle-grid"><div><span>Recorded phenotype</span><strong>${esc(phenotype)}</strong></div><div><span>Structured loci</span><strong>${loci}</strong><small>${loci?"Transferable genetics profile available":"Add genetics when known"}</small></div></div>`;
  }

  function pedigreePanel(state,model){
    const animal=model.animal;
    const pedigrees=array(state,"pedigrees").filter(record=>String(record.subjectAnimalId)===String(animal.id));
    return`<div class="hh-p2-panel-head"><div><h3>Pedigree</h3><p>Sire: <strong>${esc(animalName(state,animal.sireId))}</strong> · Dam: <strong>${esc(animalName(state,animal.damId))}</strong></p></div><div><button class="button button-primary button-small" data-hh-p2-action="pedigree">Build / import</button><button class="button button-ghost button-small" data-hh-p2-action="print-pedigree">Print</button></div></div><div class="hh-p2-lifecycle-grid"><div><span>Completed pedigree records</span><strong>${pedigrees.length}</strong></div><div><span>Transfer-ready ancestry</span><strong>${animal.sireId||animal.damId?"Linked":"Not linked yet"}</strong><small>Pedigree relationships stay attached to the animal.</small></div></div>`;
  }

  function showsPanel(state,model){
    const rows=(model.shows?.entries||[]).slice().sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))).map(entry=>{const show=array(state,"shows").find(record=>String(record.id)===String(entry.showId));return{title:show?.name||"Show entry",detail:entry.className||entry.division||"",meta:formatDate(show?.startDate||entry.date)};});
    return`<div class="hh-p2-panel-head"><div><h3>Shows</h3><p>${model.shows?.entries?.length||0} entries · ${model.shows?.results?.length||0} results · ${model.shows?.awards?.length||0} awards</p></div><button class="button button-primary button-small" data-hh-p2-action="show-entry">Add show entry</button></div>${recordList(rows,"No show history is connected to this animal yet.")}`;
  }

  function productionPanel(model){
    const rows=(model.production||[]).slice().sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).map(record=>({title:record.product||record.type||"Production",detail:[record.amount??record.quantity,record.unit].filter(value=>value!==undefined&&value!==null&&value!=="").join(" "),meta:formatDate(record.date)}));
    return`<div class="hh-p2-panel-head"><div><h3>Production</h3><p>Production records linked directly to this animal.</p></div><button class="button button-primary button-small" data-hh-p2-action="analytics">View analytics</button></div>${recordList(rows,"No production records are connected to this animal yet.")}`;
  }

  function historyPanel(state,model){
    const rows=timelineRows(state,model.animal.id).slice(0,60).map(row=>({title:row.title,detail:row.detail,meta:`${formatDate(row.date)} · ${row.type}`}));
    return`<div class="hh-p2-panel-head"><div><h3>History</h3><p>Chronological activity assembled from canonical HerdHarbor records.</p></div></div>${recordList(rows,"No dated history is available yet.")}`;
  }

  function renderPanel(tab,state,model,lifecycle){
    if(tab==="overview")return overviewPanel(state,model,lifecycle);
    if(tab==="health")return healthPanel(model);
    if(tab==="breeding")return breedingPanel(state,model);
    if(tab==="genetics")return geneticsPanel(model);
    if(tab==="pedigree")return pedigreePanel(state,model);
    if(tab==="shows")return showsPanel(state,model);
    if(tab==="production")return productionPanel(model);
    return historyPanel(state,model);
  }

  function actionButtons(model){
    const actions=[["weight","Add weight","primary"],["episode","Health episode","ghost"]];
    if(model.current&&["female","male"].includes(lower(model.animal?.sex))&&!model.quarantined)actions.push(["breeding","Breed","ghost"]);
    if(currentTabs(model).includes("genetics"))actions.push(["genetics","Genetics","ghost"]);
    actions.push(["pedigree","Pedigree","ghost"]);
    if(currentTabs(model).includes("shows"))actions.push(["show-entry","Show entry","ghost"]);
    actions.push(["edit","Edit / status","ghost"]);
    return actions.map(([action,label,tone])=>`<button type="button" class="button button-${tone} button-small" data-hh-p2-action="${action}">${esc(label)}</button>`).join("");
  }

  function renderProfile(label=""){
    if(!activeProfile?.animalId)return false;
    const state=stateNow();
    const model=profileModel(state,activeProfile.animalId);
    if(!model){backToAnimals(true);return false;}
    const tabs=currentTabs(model);
    const tab=tabs.includes(activeProfile.tab)?activeProfile.tab:tabs[0]||"overview";
    activeProfile.tab=tab;
    const lifecycle=lifecycleSummary(state,model);
    const animal=model.animal;
    const view=ensureProfileView();
    if(!view)return false;
    activateProfileView(view,animal);
    view.innerHTML=`
      <div class="hh-p2-profile-shell">
        <button type="button" class="hh-p2-back" data-hh-p2-back>← Back to Animals</button>
        <header class="hh-p2-profile-hero">
          <div class="hh-p2-profile-photo ${animal.photoData?"has-photo":""}">${animalVisual(animal)}</div>
          <div class="hh-p2-profile-copy">
            <div class="hh-p2-kicker"><span>${esc(animal.species||"Animal")}</span><span class="badge ${statusTone(animal.status)}">${esc(animal.status||"Unknown status")}</span>${model.quarantined?'<span class="badge danger">Quarantined</span>':""}</div>
            <h1>${esc(animal.name||"Unnamed animal")}</h1>
            <p>${esc([animal.earTagNumber?`Ear tag ${animal.earTagNumber}`:animal.tag||animal.tattoo,animal.earTagColor,animal.breed,animal.color].filter(Boolean).join(" · ")||"No additional identity details")}</p>
          </div>
        </header>
        <div class="hh-p2-actions" aria-label="${esc(animal.name||"Animal")} actions">${actionButtons(model)}</div>
        <nav class="hh-p2-tabs" role="tablist" aria-label="Animal profile sections">${tabs.map(item=>`<button type="button" role="tab" aria-selected="${item===tab}" data-hh-p2-tab="${item}">${esc(TAB_LABELS[item])}</button>`).join("")}</nav>
        <main class="hh-p2-panel" data-hh-p2-panel="${tab}">${renderPanel(tab,state,model,lifecycle)}</main>
      </div>`;
    if(label){const needle=lower(label);const match=Array.from(view.querySelectorAll(".hh-p2-record")).find(node=>lower(node.textContent).includes(needle));if(match){match.classList.add("hh-p2-target-record");match.scrollIntoView?.({block:"center",behavior:"smooth"});root.setTimeout?.(()=>match.classList.remove("hh-p2-target-record"),3200);}}
    return true;
  }

  function writeHistory(hash,mode="replace"){
    if(!root.history||!root.location)return;
    if(mode==="push")root.history.pushState({herdHarborAnimalProfile:true},"",hash);
    else if(mode==="replace")root.history.replaceState({herdHarborAnimalProfile:true},"",hash);
  }

  function openAnimalProfile(animalId,tab="overview",options={}){
    const state=stateNow();
    const model=profileModel(state,animalId);
    if(!model)return false;
    const wasProfile=Boolean(activeProfile?.animalId);
    const animalsActive=root.document?.querySelector("#view-animals")?.classList.contains("active");
    if(!wasProfile&&!animalsActive)clickAnimalsRoute();
    const requestedTab=currentTabs(model).includes(normalizeTab(tab))?normalizeTab(tab):(currentTabs(model)[0]||"overview");
    activeProfile={animalId:String(animalId),tab:requestedTab,pushed:options.history==="push",openedAt:Date.now()};
    const hash=profileHash(animalId,requestedTab);
    if(options.history==="push"&&root.location?.hash!==hash)writeHistory(hash,"push");
    else writeHistory(hash,"replace");
    return renderProfile(options.label||"");
  }

  function selectTab(tab){
    if(!activeProfile?.animalId)return false;
    const state=stateNow(),model=profileModel(state,activeProfile.animalId);if(!model)return false;
    const next=currentTabs(model).includes(normalizeTab(tab))?normalizeTab(tab):"overview";
    activeProfile.tab=next;
    writeHistory(profileHash(activeProfile.animalId,next),"replace");
    return renderProfile();
  }

  function deactivateProfile(){
    const view=root.document?.querySelector("#view-animal-profile");
    view?.classList.remove("active");
    activeProfile=null;
  }

  function backToAnimals(forceReplace=false){
    const pushed=Boolean(activeProfile?.pushed)&&!forceReplace;
    if(pushed&&root.history?.length>1){root.history.back();return true;}
    deactivateProfile();
    clickAnimalsRoute();
    if(root.history)root.history.replaceState(null,"","#animals");
    return true;
  }

  function waitFor(selector,callback,attempt=0,max=45){
    const node=root.document?.querySelector(selector);
    if(node){callback(node);return true;}
    if(attempt>=max)return false;
    root.setTimeout?.(()=>waitFor(selector,callback,attempt+1,max),50);
    return true;
  }

  function openCoreAction(action){
    if(!activeProfile?.animalId||!clean(action))return false;
    const animalId=activeProfile.animalId;
    pendingReturn={animalId,tab:activeProfile.tab,expiresAt:Date.now()+RETURN_TTL_MS};
    const launch=button=>{
      coreModalBypass+=1;
      button.click();
      waitFor("#modal-content .hh-p1-profile-hub",hub=>{
        const actionButton=hub.querySelector(`[data-hh-p1-action="${cssEscape(action)}"]`);
        if(!actionButton){pendingReturn=null;root.HerdHarborApp?.toast?.("That animal action is not available for this record.","error");return;}
        actionButton.click();
      });
    };
    const existing=root.document?.querySelector(`#view-animals [data-view-animal="${cssEscape(animalId)}"]`);
    if(existing){launch(existing);return true;}
    clickAnimalsRoute();
    waitFor(`#view-animals [data-view-animal="${cssEscape(animalId)}"]`,launch);
    return true;
  }

  function todayTarget(eventNode){
    const key=eventNode?.dataset?.hhP1Event||"";
    if(!key)return null;
    const state=stateNow();
    try{return root.HerdHarborFlowPhase1?.eventTarget?.(key,state,healthNow(state))||null;}catch{return null;}
  }

  function interceptWindowClick(event){
    const today=event.target.closest?.("[data-hh-p1-event]");
    if(today){const target=todayTarget(today);if(target?.kind==="animal"&&target.animalId){event.preventDefault();event.stopImmediatePropagation();openAnimalProfile(target.animalId,target.tab||"overview",{history:"push",label:target.label||""});return;}}
    const viewButton=event.target.closest?.("[data-view-animal]");
    if(!viewButton)return;
    if(coreModalBypass>0){coreModalBypass-=1;return;}
    const animalId=viewButton.dataset.viewAnimal||"";
    if(!animalId)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    let tab="overview";
    if(pendingReturn&&pendingReturn.animalId===String(animalId)&&Date.now()<=pendingReturn.expiresAt){tab=pendingReturn.tab||"overview";pendingReturn=null;}
    openAnimalProfile(animalId,tab,{history:"push"});
  }

  function syncFromLocation(){
    if(syncingLocation||!root.location)return;
    syncingLocation=true;
    try{
      const parsed=parseProfileHash(root.location.hash);
      if(parsed){openAnimalProfile(parsed.animalId,parsed.tab,{history:"none"});return;}
      if(activeProfile){deactivateProfile();const route=clean(root.location.hash).replace(/^#/,"")||"animals";const nav=root.document?.querySelector(`.nav-item[data-route="${cssEscape(route)}"]`);if(nav)nav.click();else clickAnimalsRoute();}
    }finally{syncingLocation=false;}
  }

  function install(){
    if(installed||!root.document)return API;
    installed=true;
    ensureProfileView();
    root.addEventListener?.("click",interceptWindowClick,true);
    root.addEventListener?.("hashchange",syncFromLocation);
    root.addEventListener?.("popstate",syncFromLocation);
    root.addEventListener?.("herdharbor:app-ready",()=>root.setTimeout?.(syncFromLocation,50));
    root.addEventListener?.("herdharbor:health-intelligence-changed",()=>{if(activeProfile)renderProfile();});
    root.setTimeout?.(syncFromLocation,100);
    return API;
  }

  function uninstall(){
    if(!installed)return;
    root.removeEventListener?.("click",interceptWindowClick,true);
    root.removeEventListener?.("hashchange",syncFromLocation);
    root.removeEventListener?.("popstate",syncFromLocation);
    installed=false;
    activeProfile=null;
    pendingReturn=null;
  }

  const API=Object.freeze({VERSION,TABS,normalizeTab,profileHash,parseProfileHash,lifecycleSummary,openAnimalProfile,selectTab,backToAnimals,renderProfile,install,uninstall});
  return API;
});
