(function(root){
  "use strict";
  if(!root?.document)return;
  const Core=root.HerdHarborLitterSaleTransferCore;
  if(!Core)return;

  const STORAGE_KEY="herdharbor_pre_alpha_v1";
  let activeLitterId="";
  let saleTabOpen=false;
  let observer=null;
  let queued=false;

  const clean=value=>String(value==null?"":value).trim();
  const lower=value=>clean(value).toLowerCase();
  const esc=value=>String(value==null?"":value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));
  const money=value=>`$${Number(value||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const fmt=value=>{if(!value)return"—";const d=new Date(`${String(value).slice(0,10)}T12:00:00`);return Number.isNaN(d.getTime())?clean(value):d.toLocaleDateString();};
  const stateNow=()=>{try{return root.HerdHarborApp?.getState?.()||readPersistedState();}catch{return readPersistedState();}};

  function readPersistedState(){try{return JSON.parse(root.localStorage?.getItem(STORAGE_KEY)||"{}");}catch{return{};}}

  function toast(message,type="info"){
    const node=root.document.createElement("div");
    node.className=`hh-lst-toast ${type}`;node.textContent=message;root.document.body.appendChild(node);
    (root.requestAnimationFrame||root.setTimeout)(()=>node.classList.add("show"),0);
    root.setTimeout?.(()=>{node.classList.remove("show");root.setTimeout?.(()=>node.remove(),220);},3800);
  }

  function customerById(state,id){return(Array.isArray(state?.customers)?state.customers:[]).find(row=>String(row.id)===String(id))||null;}
  function animalById(state,id){return Core.animalById(state,id);}
  function saleAnimals(state,sale){return(Array.isArray(sale?.items)?sale.items:[]).map(item=>animalById(state,item.animalId)).filter(Boolean);}

  function candidateCard(animal){
    const asking=Number(animal.askingPrice||0);
    return`<label class="hh-lst-candidate" data-hh-lst-animal="${esc(animal.id)}"><input type="checkbox" data-hh-lst-select value="${esc(animal.id)}"><span class="hh-lst-candidate-main"><strong>${esc(animal.name||animal.tag||animal.tattoo||"Offspring")}</strong><small>${esc([animal.sex,animal.color,animal.tag||animal.tattoo].filter(Boolean).join(" · ")||"Sale-ready offspring")}</small></span><span class="hh-lst-price"><small>Sale price</small><span><b>$</b><input type="number" min="0" step="0.01" data-hh-lst-price="${esc(animal.id)}" value="${asking?asking.toFixed(2):""}" placeholder="0.00"></span></span></label>`;
  }

  function statusBadge(stage){
    const cls=stage.stage==="transfer"?"green":stage.stage==="completed"?"teal":stage.stage==="cancelled"?"gray":"warning";
    return`<span class="hh-lst-stage ${cls}">${esc(stage.label)}</span>`;
  }

  function saleCard(state,sale){
    const buyer=customerById(state,sale.customerId);
    const animals=saleAnimals(state,sale);
    const stage=Core.saleStage(readPersistedState(),sale);
    const canComplete=!new Set(["Completed","Cancelled"]).has(clean(sale.status));
    const canTransfer=clean(sale.status)==="Completed"&&!stage.transfer;
    return`<article class="hh-lst-sale-card" data-hh-lst-sale="${esc(sale.id)}"><div class="hh-lst-sale-head"><div><strong>${esc(sale.saleNumber||"Animal sale")}</strong><span>${esc(buyer?.name||"Buyer")}</span></div>${statusBadge(stage)}</div><p>${esc(animals.map(animal=>animal.name||animal.tag||"Offspring").join(", ")||"No animals")}</p><div class="hh-lst-sale-meta"><span>${fmt(sale.saleDate)}</span><strong>${money(Core.saleTotal(sale))}</strong></div><div class="hh-lst-sale-actions">${canComplete?`<button type="button" class="button button-primary button-small" data-hh-lst-complete="${esc(sale.id)}">Complete sale</button>`:""}${canTransfer?`<button type="button" class="button button-primary button-small" data-hh-lst-transfer="${esc(sale.id)}">Send to HerdHarbor member</button>`:""}<button type="button" class="button button-ghost button-small" data-hh-lst-open-sale="${esc(sale.id)}">Open full sale</button></div></article>`;
  }

  function buyerFields(state){
    const customers=(Array.isArray(state?.customers)?state.customers:[]).slice().sort((a,b)=>clean(a.name).localeCompare(clean(b.name)));
    return`<div class="hh-lst-buyer-grid"><label>Buyer<select name="customerId" data-hh-lst-customer><option value="__new__">+ New buyer</option>${customers.map(customer=>`<option value="${esc(customer.id)}">${esc(customer.name)}${customer.email?` · ${esc(customer.email)}`:""}</option>`).join("")}</select></label><div class="hh-lst-new-buyer" data-hh-lst-new-buyer><label>Name<input name="customerName" placeholder="Buyer name"></label><label>Email<input name="email" type="email" placeholder="buyer@example.com"></label><label>Phone<input name="phone" type="tel" placeholder="Optional"></label></div></div>`;
  }

  function salePanel(state,litterId){
    const candidates=Core.saleCandidateOffspring(state,litterId);
    const sales=Core.litterSales(state,litterId);
    const forSaleCount=Core.offspringForLitter(state,litterId).filter(animal=>lower(animal.status)==="for sale").length;
    return`<div class="hh-lst-panel" data-hh-lst-panel><div class="hh-bw-toolbar hh-lst-toolbar"><div><strong>Buyer sale & transfer</strong><span>Take sale-ready offspring from this litter through buyer, sale, and HerdHarbor transfer without re-entering the animals.</span></div>${candidates.length?'<button type="button" class="button button-ghost button-small" data-hh-lst-select-all>Select all sale-ready</button>':""}</div>${candidates.length?`<form id="hh-lst-sale-form"><section class="hh-lst-section"><div class="hh-lst-section-head"><div><strong>1. Select offspring & actual sale price</strong><span>Asking prices are used as a starting point and are never overwritten.</span></div><span>${candidates.length} available</span></div><div class="hh-lst-candidates">${candidates.map(candidateCard).join("")}</div></section><section class="hh-lst-section"><div class="hh-lst-section-head"><div><strong>2. Buyer & sale</strong><span>Create the same canonical sale used by Sales & Customers.</span></div></div>${buyerFields(state)}<div class="hh-lst-sale-fields"><label>Sale date<input type="date" name="saleDate" value="${new Date().toISOString().slice(0,10)}" required></label><label>Start as<select name="status"><option value="Reserved" selected>Reserved for buyer</option><option value="Completed">Completed sale</option></select></label></div><div class="hh-lst-create-actions"><button type="submit" class="button button-primary">Create buyer sale</button><small>Payments, invoices, bill of sale, and other advanced details remain available from the full Sales screen.</small></div></section></form>`:`<div class="hh-lst-empty"><strong>${forSaleCount?"All sale-ready offspring are already attached to a sale.":"No offspring are marked For Sale yet."}</strong><span>${forSaleCount?"Use the sale cards below to continue their buyer workflow.":"Use Evaluation to mark the offspring you intend to sell, then return here."}</span>${!forSaleCount?'<button type="button" class="button button-primary" data-hh-lst-evaluation>Go to Evaluation</button>':""}</div>`}<section class="hh-lst-section hh-lst-existing"><div class="hh-lst-section-head"><div><strong>3. Litter sales & transfers</strong><span>Complete the sale, then hand the animal and pedigree directly to the buyer's HerdHarbor account.</span></div><span>${sales.length} sale${sales.length===1?"":"s"}</span></div>${sales.length?`<div class="hh-lst-sales">${sales.map(sale=>saleCard(state,sale)).join("")}</div>`:'<div class="hh-lst-empty compact"><strong>No buyer sales from this litter yet.</strong></div>'}</section></div>`;
  }

  function commit(next,message){
    const ok=root.HerdHarborApp?.commitState?.(next,message);root.HerdHarborApp?.refresh?.();
    try{root.dispatchEvent?.(new root.CustomEvent("herdharbor:litter-sale-transfer-changed",{detail:{litterId:activeLitterId}}));}catch{}
    saleTabOpen=true;schedule();return ok;
  }

  function ensureTab(overlay){
    const nav=overlay.querySelector(".hh-bw-tabs");if(!nav)return null;
    const decisions=nav.querySelector('[data-hh-bw-tab="decisions"]');if(decisions&&decisions.textContent!=="Evaluation")decisions.textContent="Evaluation";
    let tab=nav.querySelector("[data-hh-lst-tab]");
    if(!tab){tab=root.document.createElement("button");tab.type="button";tab.dataset.hhLstTab="sale";tab.textContent="Sale & transfer";nav.appendChild(tab);}
    tab.classList.toggle("active",saleTabOpen);if(saleTabOpen)nav.querySelectorAll("[data-hh-bw-tab]").forEach(button=>button.classList.remove("active"));return tab;
  }

  function enhanceDecisions(overlay){
    if(saleTabOpen)return;
    const activeBase=overlay.querySelector('.hh-bw-tabs [data-hh-bw-tab="decisions"].active');if(!activeBase)return;
    const actions=overlay.querySelector(".hh-bw-decision-actions");if(!actions||actions.querySelector("[data-hh-lst-continue]"))return;
    const available=Core.saleCandidateOffspring(stateNow(),activeLitterId).length;
    const button=root.document.createElement("button");button.type="button";button.className="button button-primary";button.dataset.hhLstContinue="1";button.textContent=available?`Continue to buyer sale (${available})`:"Continue to buyer sale";actions.appendChild(button);
  }

  function renderSaleTab(overlay){const content=overlay.querySelector(".hh-bw-content");if(!content)return;content.innerHTML=salePanel(stateNow(),activeLitterId);syncBuyerMode(content);}

  function enhanceWorkspace(){
    const overlay=root.document.getElementById("hh-breeding-litter-workspace");if(!overlay){saleTabOpen=false;return false;}
    if(!activeLitterId)activeLitterId=clean(overlay.dataset.hhBwLitterId);if(!activeLitterId)return false;
    overlay.dataset.hhLstLitterId=activeLitterId;ensureTab(overlay);if(saleTabOpen)renderSaleTab(overlay);else enhanceDecisions(overlay);return true;
  }

  function syncBuyerMode(scope){
    const select=scope.querySelector?.("[data-hh-lst-customer]");const fields=scope.querySelector?.("[data-hh-lst-new-buyer]");if(!select||!fields)return;
    const isNew=select.value==="__new__";fields.hidden=!isNew;fields.querySelectorAll("input").forEach(input=>{input.disabled=!isNew;input.required=isNew&&input.name==="customerName";});
  }

  function selectedSaleEntries(form){
    const ids=[...form.querySelectorAll('[data-hh-lst-select]:checked')].map(input=>input.value);const prices={};
    ids.forEach(id=>{const safe=root.CSS?.escape?root.CSS.escape(id):id;prices[id]=form.querySelector(`[data-hh-lst-price="${safe}"]`)?.value||"";});return{ids,prices};
  }

  function createSale(form){
    const{ids,prices}=selectedSaleEntries(form);if(!ids.length)return toast("Select at least one sale-ready offspring.","error");
    const data=new root.FormData(form);const customerId=clean(data.get("customerId"));
    const result=Core.createSaleFromLitter(stateNow(),activeLitterId,{animalIds:ids,prices,customerId:customerId==="__new__"?"":customerId,customerName:data.get("customerName"),email:data.get("email"),phone:data.get("phone"),saleDate:data.get("saleDate"),status:data.get("status")});
    if(result.error)return toast(result.error,"error");
    commit(result.state,`${ids.length} offspring added to ${result.sale.saleNumber}.`);toast(result.sale.status==="Completed"?"Sale completed. It is ready for member transfer.":"Buyer sale created and offspring reserved.","success");
  }

  function completeSale(saleId){
    const result=Core.updateSaleStatus(stateNow(),saleId,"Completed");if(result.error)return toast(result.error,"error");
    commit(result.state,`${result.sale.saleNumber} completed.`);toast("Sale completed. The animal can now be sent directly to the buyer's HerdHarbor account.","success");
  }

  function openFullSale(saleId){
    const state=stateNow();const sale=(Array.isArray(state.sales)?state.sales:[]).find(row=>String(row.id)===String(saleId));
    root.HerdHarborBreedingWorkspace?.close?.();root.document.querySelector('[data-route="sales"]')?.click();
    root.setTimeout?.(()=>{const rows=[...root.document.querySelectorAll("#view-sales .data-table tbody tr")];const row=rows.find(item=>clean(item.querySelector("td:first-child strong")?.textContent)===clean(sale?.saleNumber));row?.scrollIntoView?.({block:"center",behavior:"smooth"});if(row){row.classList.add("hh-lst-highlight");root.setTimeout?.(()=>row.classList.remove("hh-lst-highlight"),2600);}},120);
  }

  function sendTransfer(saleId){const api=root.HerdHarborDirectTransfers;if(!api?.sendSale)return toast("HerdHarbor Direct Transfer is still loading. Try again in a moment.","error");api.sendSale(saleId);}
  function goEvaluation(){saleTabOpen=false;const overlay=root.document.getElementById("hh-breeding-litter-workspace");overlay?.querySelector('[data-hh-bw-tab="decisions"]')?.click();schedule();}

  function onClick(event){
    const manage=event.target.closest?.("[data-hh-bw-manage-litter]");if(manage){activeLitterId=clean(manage.dataset.hhBwManageLitter);saleTabOpen=false;schedule();return;}
    const overlay=event.target.closest?.("#hh-breeding-litter-workspace");if(!overlay)return;
    const baseTab=event.target.closest?.("[data-hh-bw-tab]");if(baseTab){saleTabOpen=false;schedule();return;}
    if(event.target.closest?.("[data-hh-lst-tab],[data-hh-lst-continue]")){event.preventDefault();event.stopPropagation();saleTabOpen=true;enhanceWorkspace();return;}
    if(event.target.closest?.("[data-hh-lst-evaluation]")){event.preventDefault();goEvaluation();return;}
    if(event.target.closest?.("[data-hh-lst-select-all]")){event.preventDefault();overlay.querySelectorAll('[data-hh-lst-select]:not(:disabled)').forEach(input=>{input.checked=true;});return;}
    const complete=event.target.closest?.("[data-hh-lst-complete]");if(complete){event.preventDefault();completeSale(complete.dataset.hhLstComplete);return;}
    const transfer=event.target.closest?.("[data-hh-lst-transfer]");if(transfer){event.preventDefault();sendTransfer(transfer.dataset.hhLstTransfer);return;}
    const openSale=event.target.closest?.("[data-hh-lst-open-sale]");if(openSale){event.preventDefault();openFullSale(openSale.dataset.hhLstOpenSale);return;}
  }

  function onSubmit(event){const form=event.target;if(form?.id!=="hh-lst-sale-form")return;event.preventDefault();createSale(form);}
  function onChange(event){if(event.target?.matches?.("[data-hh-lst-customer]"))syncBuyerMode(event.target.closest("[data-hh-lst-panel]"));}
  function schedule(){if(queued)return;queued=true;(root.requestAnimationFrame||root.setTimeout)(()=>{queued=false;if(observer&&root.document.body)observer.disconnect();try{enhanceWorkspace();}finally{if(observer&&root.document.body)observer.observe(root.document.body,{childList:true,subtree:true});}},0);}

  function install(){
    root.addEventListener("click",onClick,true);root.addEventListener("submit",onSubmit,true);root.addEventListener("change",onChange,true);
    root.addEventListener("herdharbor:litter-workspace-changed",event=>{activeLitterId=clean(event.detail?.litterId)||activeLitterId;schedule();});
    root.addEventListener("herdharbor:offspring-auto-created",event=>{activeLitterId=clean(event.detail?.litterId)||activeLitterId;saleTabOpen=false;schedule();});
    root.addEventListener("herdharbor:litter-sale-transfer-changed",schedule);
    observer=new root.MutationObserver(schedule);if(root.document.body)observer.observe(root.document.body,{childList:true,subtree:true});schedule();
  }

  root.HerdHarborLitterSaleTransfer=Object.freeze({VERSION:Core.VERSION,open(litterId){activeLitterId=clean(litterId);saleTabOpen=true;root.HerdHarborBreedingWorkspace?.open?.(activeLitterId);schedule();},refresh:schedule});
  install();
})(typeof globalThis!=="undefined"?globalThis:this);