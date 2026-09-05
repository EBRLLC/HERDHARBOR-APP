(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.HerdHarborPhase1Workflow=api;
  if(root&&root.document) api.install(root);
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';

  const VERSION='1.7.1';
  const CONTRACT=Object.freeze({
    id:'HH-ANIMAL-FIRST-001',
    version:VERSION,
    hardlocked:true,
    rule:'Animal-first workflow surfaces orchestrate existing HerdHarbor records and engines without duplicating domain state.',
    dataRule:'Enter a fact once; downstream workflow surfaces reuse the canonical fact instead of copying it.',
    speciesRule:'Operational species-aware actions remain limited to the current farm context.'
  });
  const INACTIVE=new Set(['sold','deceased','archived','ancestor only','ancestor-only','ancestor_only']);
  const PRODUCTION_SPECIES=new Set(['cattle','goat','sheep','swine','pig','poultry','chicken','duck','turkey','rabbit']);
  const PENDING_ANIMAL_MAX_AGE_MS=5000;
  let pendingAnimalId='';
  let pendingAnimalAt=0;
  let observer=null;
  let queued=false;
  let installed=false;
  let appReady=false;

  const clean=v=>String(v==null?'':v).trim();
  const lower=v=>clean(v).toLowerCase();
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const today=()=>new Date().toISOString().slice(0,10);
  const fmtDate=value=>{
    if(!value)return'—';
    const d=new Date(`${String(value).slice(0,10)}T12:00:00`);
    return Number.isNaN(d.getTime())?clean(value):d.toLocaleDateString();
  };
  const stateNow=()=>{
    try{return root.HerdHarborApp?.getState?.()||{};}catch{return{};}
  };
  const array=(state,key)=>Array.isArray(state?.[key])?state[key]:[];
  const canonicalSpecies=value=>{
    try{return root.HerdHarborSpeciesContext?.canonicalSpecies?.(value)||root.HerdHarborGeneticsPlatform?.canonicalSpecies?.(value)||lower(value).replace(/s$/,'');}catch{return lower(value).replace(/s$/,'');}
  };
  function isCurrentAnimal(animal){
    if(!animal)return false;
    const context=root.HerdHarborSpeciesContext;
    try{
      if(typeof context?.isCurrentAnimal==='function')return!!context.isCurrentAnimal(animal);
      if(typeof context?.isActiveAnimal==='function')return!!context.isActiveAnimal(animal);
    }catch{}
    return!INACTIVE.has(lower(animal.status));
  }
  function currentAnimalIds(state=stateNow()){
    return new Set(array(state,'animals').filter(isCurrentAnimal).map(a=>String(a.id)));
  }
  function healthState(state=stateNow()){
    try{return root.HerdHarborHealthIntelligence?.readHealthState?.()||state.healthIntelligence||{};}catch{return state.healthIntelligence||{};}
  }
  function isQuarantined(animalId,state=stateNow()){
    const h=healthState(state);
    return array(h,'episodes').some(e=>String(e.animalId)===String(animalId)&&!e.resolved&&e.quarantined);
  }
  function animalById(state,id){return array(state,'animals').find(a=>String(a.id)===String(id))||null;}
  function animalName(state,id){return animalById(state,id)?.name||'Unknown animal';}
  function geneticsSupported(animal){
    if(!animal||!isCurrentAnimal(animal))return false;
    const species=canonicalSpecies(animal.species);
    if(species==='rabbit')return true;
    try{if(root.HerdHarborGeneticsPlatform?.getAdapter?.(species))return true;}catch{}
    return ['cattle','goat','sheep','poultry','swine'].includes(species);
  }
  function showHistory(state,animalId){
    const entries=array(state,'showEntries').filter(e=>String(e.animalId)===String(animalId));
    const ids=new Set(entries.map(e=>String(e.id)));
    const results=array(state,'showResults').filter(r=>ids.has(String(r.entryId)));
    const resultIds=new Set(results.map(r=>String(r.id)));
    const awards=array(state,'showAwards').filter(a=>String(a.animalId)===String(animalId)||ids.has(String(a.entryId))||resultIds.has(String(a.resultId)));
    return{entries,results,awards};
  }
  function productionRecords(state,animalId){return array(state,'productionRecords').filter(r=>String(r.animalId)===String(animalId));}
  function breedingRecords(state,animalId){return array(state,'breedings').filter(b=>String(b.femaleId)===String(animalId)||String(b.maleId)===String(animalId));}
  function legacyHealth(state,animalId){return array(state,'health').filter(h=>String(h.animalId)===String(animalId));}
  function healthIntelligenceFor(state,animalId){
    const h=healthState(state);
    const id=String(animalId);
    return{
      episodes:array(h,'episodes').filter(e=>String(e.animalId)===id),
      care:array(h,'careRecords').filter(r=>String(r.animalId)===id),
      groups:array(h,'groupRecords').filter(r=>array(r,'animalIds').map(String).includes(id))
    };
  }
  function profileTabs(state,animal){
    if(!animal)return[];
    const tabs=['overview','health'];
    const breedings=breedingRecords(state,animal.id);
    if(breedings.length||(isCurrentAnimal(animal)&&['female','male'].includes(lower(animal.sex))))tabs.push('breeding');
    if(geneticsSupported(animal))tabs.push('genetics');
    tabs.push('pedigree');
    const shows=showHistory(state,animal.id);
    if(root.HerdHarborShows||shows.entries.length||shows.results.length||shows.awards.length)tabs.push('shows');
    if(productionRecords(state,animal.id).length||PRODUCTION_SPECIES.has(canonicalSpecies(animal.species)))tabs.push('production');
    tabs.push('history');
    return tabs;
  }
  function profileModel(state,animalId){
    const animal=animalById(state,animalId);
    if(!animal)return null;
    const hi=healthIntelligenceFor(state,animalId);
    const shows=showHistory(state,animalId);
    return{
      animal,
      current:isCurrentAnimal(animal),
      quarantined:isQuarantined(animalId,state),
      tabs:profileTabs(state,animal),
      health:{legacy:legacyHealth(state,animalId),...hi},
      breedings:breedingRecords(state,animalId),
      shows,
      production:productionRecords(state,animalId)
    };
  }
  function timelineRows(state,animalId){
    const animal=animalById(state,animalId);if(!animal)return[];
    const rows=[];
    const push=(date,type,title,detail='')=>{if(date)rows.push({date:String(date).slice(0,10),type,title,detail});};
    push(animal.dob,'Birth','Born',animal.breed||animal.species||'');
    legacyHealth(state,animalId).forEach(r=>push(r.date,'Health',r.type||'Health record',r.details||r.notes||''));
    const hi=healthIntelligenceFor(state,animalId);
    hi.episodes.forEach(r=>push(r.startedDate,'Health episode',r.concern||'Health episode',r.assessment?.level||r.healthStatus||''));
    hi.care.forEach(r=>push(r.date,'Care',r.type||'Care record',[r.product,r.reason].filter(Boolean).join(' · ')));
    hi.groups.forEach(r=>push(r.date,'Group care',r.type||'Group record',r.description||r.product||''));
    breedingRecords(state,animalId).forEach(r=>push(r.breedingDate,'Breeding',`${animalName(state,r.femaleId)} × ${animalName(state,r.maleId)}`,r.status||''));
    array(state,'litters').filter(l=>String(l.damId)===String(animalId)||String(l.sireId)===String(animalId)).forEach(l=>push(l.birthDate,'Birth / litter','Birth recorded',`${Number(l.bornAlive||0)} born alive`));
    const shows=showHistory(state,animalId);
    shows.entries.forEach(e=>{const show=array(state,'shows').find(s=>String(s.id)===String(e.showId));push(show?.startDate||e.date,'Show',show?.name||'Show entry',e.className||e.division||'');});
    productionRecords(state,animalId).forEach(r=>push(r.date,'Production',r.product||r.type||'Production record',[r.amount??r.quantity,r.unit].filter(v=>v!==undefined&&v!==null&&v!=='').join(' ')));
    array(state,'sales').forEach(s=>{if(array(s,'items').some(i=>String(i.animalId)===String(animalId)))push(s.saleDate||s.completedAt||s.date,'Sale',s.status==='Completed'?'Sold / transferred':'Sale record',s.invoiceNumber||s.customerName||'');});
    array(state,'transfers').filter(t=>String(t.animalId)===String(animalId)).forEach(t=>push(t.transferDate||t.date,'Transfer','Transfer recorded',t.transferNumber||''));
    array(state,'tasks').filter(t=>String(t.animalId)===String(animalId)&&t.completed).forEach(t=>push(t.completedAt||t.dueDate,'Task',t.title||'Task completed','Completed'));
    return rows.sort((a,b)=>String(b.date).localeCompare(String(a.date))||a.type.localeCompare(b.type));
  }
  function contextualQuickTypes(route){
    return({dashboard:['animal','health','task'],animals:['animal','pedigree','health'],breeding:['breeding','litter','task'],litters:['litter','animal','task'],health:['health','task'],tasks:['task','health'],budget:['expense','income','task'],sales:['sale','customer','income'],shows:['task','health']}[route]||['animal','health','task']);
  }
  function eventTone(date,kind='dated'){
    const d=clean(date),t=today();
    if(kind==='attention')return'attention';
    if(!d)return'normal';
    if(d<t)return'overdue';
    if(d===t)return'today';
    return'soon';
  }
  function todayEvents(state=stateNow(),options={}){
    const t=options.today||today();
    const horizon=options.horizon||7;
    const end=new Date(`${t}T12:00:00`);end.setDate(end.getDate()+horizon);const endIso=end.toISOString().slice(0,10);
    const currentIds=currentAnimalIds(state),currentSpecies=new Set(array(state,'animals').filter(a=>currentIds.has(String(a.id))).map(a=>canonicalSpecies(a.species)).filter(Boolean)),events=[];
    const add=e=>{if(!e||!e.key||events.some(x=>x.key===e.key))return;events.push(e);};
    array(state,'tasks').filter(task=>!task.completed&&task.dueDate&&task.dueDate<=endIso&&(!task.animalId||currentIds.has(String(task.animalId)))).forEach(task=>add({key:`task:${task.id}`,source:'task',sourceId:task.id,animalId:task.animalId||'',date:task.dueDate,title:task.title||'Task',detail:task.category||'Task',tone:eventTone(task.dueDate)}));
    array(state,'health').filter(r=>r.followUpDate&&r.followUpDate<=endIso&&(!r.animalId||currentIds.has(String(r.animalId)))).forEach(r=>add({key:`health:${r.id}:followup`,source:'health',sourceId:r.id,animalId:r.animalId||'',date:r.followUpDate,title:`Health follow-up: ${animalName(state,r.animalId)}`,detail:r.type||'Health',tone:eventTone(r.followUpDate)}));
    const h=healthState(state);
    array(h,'episodes').filter(e=>!e.resolved&&currentIds.has(String(e.animalId))).forEach(e=>{
      if(e.quarantined)add({key:`episode:${e.id}:quarantine`,source:'health',sourceId:e.id,animalId:e.animalId,date:'',title:`Quarantine: ${animalName(state,e.animalId)}`,detail:e.concern||'Active health episode',tone:'attention'});
      if(e.recheckDate&&e.recheckDate<=endIso)add({key:`episode:${e.id}:recheck`,source:'health',sourceId:e.id,animalId:e.animalId,date:e.recheckDate,title:`Health recheck: ${animalName(state,e.animalId)}`,detail:e.concern||'Health episode',tone:eventTone(e.recheckDate)});
    });
    array(h,'careRecords').filter(r=>currentIds.has(String(r.animalId))).forEach(r=>{
      if(r.boosterDueDate&&r.boosterDueDate<=endIso)add({key:`care:${r.id}:booster`,source:'health',sourceId:r.id,animalId:r.animalId,date:r.boosterDueDate,title:`Booster / follow-up: ${animalName(state,r.animalId)}`,detail:r.product||r.type||'Care record',tone:eventTone(r.boosterDueDate)});
      [['Meat',r.meatWithdrawalEnd],['Milk',r.milkWithdrawalEnd],['Egg',r.eggWithdrawalEnd]].forEach(([label,date])=>{if(date&&date>=t&&date<=endIso)add({key:`care:${r.id}:withdrawal:${label}`,source:'health',sourceId:r.id,animalId:r.animalId,date,title:`${label} withdrawal ends: ${animalName(state,r.animalId)}`,detail:r.product||'User-entered withdrawal date',tone:eventTone(date)});});
    });
    array(h,'groupRecords').forEach(r=>{const ids=array(r,'animalIds').map(String),applies=ids.length?ids.some(id=>currentIds.has(id)):currentSpecies.has(canonicalSpecies(r.species));if(applies&&r.followUpDate&&r.followUpDate<=endIso)add({key:`group:${r.id}:followup`,source:'health',sourceId:r.id,date:r.followUpDate,title:'Group health follow-up',detail:[r.species,r.description||r.product].filter(Boolean).join(' · '),tone:eventTone(r.followUpDate)});});
    array(state,'shows').forEach(show=>{
      const deadline=show.registrationDeadline||show.entryDeadline||'';
      if(deadline&&deadline>=t&&deadline<=endIso)add({key:`show:${show.id}:deadline`,source:'shows',sourceId:show.id,date:deadline,title:`Show entry deadline: ${show.name||'Show'}`,detail:show.organization||show.showType||'Shows',tone:eventTone(deadline)});
      if(show.startDate&&show.startDate>=t&&show.startDate<=endIso)add({key:`show:${show.id}:start`,source:'shows',sourceId:show.id,date:show.startDate,title:`Show: ${show.name||'Show'}`,detail:show.organization||show.showType||'Shows',tone:eventTone(show.startDate)});
    });
    const order={overdue:0,attention:1,today:2,soon:3,normal:4};
    return events.sort((a,b)=>(order[a.tone]??9)-(order[b.tone]??9)||String(a.date||'9999').localeCompare(String(b.date||'9999'))||a.title.localeCompare(b.title));
  }

  function toast(message,type='info'){try{root.HerdHarborApp?.toast?.(message,type);}catch{}}
  function closeCoreModal(){root.document?.querySelector('#modal-close')?.click();}
  function nav(route){const button=root.document?.querySelector(`.nav-item[data-route="${route}"]`);if(button){button.click();return true;}return false;}
  function waitFor(selector,fn,attempt=0){const node=root.document?.querySelector(selector);if(node){fn(node);return;}if(attempt>=40)return;root.setTimeout?.(()=>waitFor(selector,fn,attempt+1),50);}
  function setFormValue(formSelector,name,value){waitFor(formSelector,form=>{const field=form.querySelector(`[name="${name}"]`);if(!field)return;field.value=value==null?'':String(value);field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));});}
  function openCoreHealth(animalId,type='Observation'){closeCoreModal();if(!nav('health'))return toast('Health is not available right now.','error');root.setTimeout?.(()=>{const add=root.document.querySelector('#add-health');if(!add)return toast('Health entry did not load. Try again.','error');add.click();setFormValue('#health-form','animalId',animalId);setFormValue('#health-form','type',type);},0);}
  function openHealthIntelligence(animalId,action='episode'){closeCoreModal();if(!root.HerdHarborHealthIntelligence)return openCoreHealth(animalId,'Observation');const trigger=root.document.createElement('button');trigger.type='button';trigger.dataset.hiAction=action;trigger.hidden=true;root.document.body.appendChild(trigger);trigger.click();trigger.remove();setFormValue('#hh-health-intelligence-modal form','animalId',animalId);}
  function openBreeding(animal){if(!animal)return;if(!isCurrentAnimal(animal))return toast('Historical animals cannot start a new breeding.','error');if(isQuarantined(animal.id))return toast(`${animal.name||'This animal'} is quarantined. Clear the active quarantine before starting a breeding.`,'error');if(!['female','male'].includes(lower(animal.sex)))return toast('Record the animal sex before starting a breeding.','error');closeCoreModal();if(!nav('breeding'))return toast('Breeding is not available right now.','error');root.setTimeout?.(()=>{const add=root.document.querySelector('#add-breeding');if(!add)return toast('Breeding entry did not load. Try again.','error');add.click();setFormValue('#breeding-form',lower(animal.sex)==='female'?'femaleId':'maleId',animal.id);},0);}
  function openShowEntry(animalId=''){closeCoreModal();const showNav=root.document.querySelector('.nav-item[data-route="shows"]');if(!showNav)return toast('Shows is still loading. Try again in a moment.','error');showNav.click();waitFor('[data-add-entry]',button=>{button.click();if(animalId)setFormValue('#hh-entry-form','animalId',animalId);});}
  function delegateCore(buttonId){const b=root.document?.querySelector(buttonId);if(b)b.click();}

  const tabLabels={overview:'Overview',health:'Health',breeding:'Breeding',genetics:'Genetics',pedigree:'Pedigree',shows:'Shows',production:'Production',history:'History'};
  function recordList(rows,emptyText){if(!rows.length)return`<p class="muted">${esc(emptyText)}</p>`;return`<div class="hh-p1-record-list">${rows.map(r=>`<article><strong>${esc(r.title)}</strong><span>${esc(r.meta||'')}</span>${r.detail?`<small>${esc(r.detail)}</small>`:''}</article>`).join('')}</div>`;}
  function healthPanel(model){const rows=[...model.health.legacy.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,6).map(r=>({title:r.type||'Health record',meta:fmtDate(r.date),detail:r.details||r.notes||''})),...model.health.episodes.slice().sort((a,b)=>String(b.startedDate||'').localeCompare(String(a.startedDate||''))).slice(0,4).map(r=>({title:r.concern||'Health episode',meta:`${fmtDate(r.startedDate)} · ${r.assessment?.level||r.healthStatus||''}`,detail:r.resolved?'Resolved':r.quarantined?'Quarantined':'Open'})),...model.health.care.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,4).map(r=>({title:r.product||r.type||'Care record',meta:`${fmtDate(r.date)} · ${r.type||'Care'}`,detail:r.reason||r.notes||''}))].slice(0,10);return`<div class="hh-p1-panel-head"><div><h3>Health</h3><p>${model.health.legacy.length+model.health.episodes.length+model.health.care.length+model.health.groups.length} connected health records.</p></div><div><button class="button button-primary button-small" data-hh-p1-action="weight">Add weight</button><button class="button button-ghost button-small" data-hh-p1-action="episode">Start episode</button><button class="button button-ghost button-small" data-hh-p1-action="care">Add care</button></div></div>${recordList(rows,'No health records are connected to this animal yet.')}`;}
  function breedingPanel(model,state){const rows=model.breedings.slice().sort((a,b)=>String(b.breedingDate||'').localeCompare(String(a.breedingDate||''))).map(r=>({title:`${animalName(state,r.femaleId)} × ${animalName(state,r.maleId)}`,meta:`${fmtDate(r.breedingDate)} · ${r.status||'Bred'}`,detail:r.dueDate?`Due ${fmtDate(r.dueDate)}`:''}));const blocked=model.quarantined?'Breeding is unavailable while this animal is quarantined.':!model.current?'Historical animals cannot start a new breeding.':'';return`<div class="hh-p1-panel-head"><div><h3>Breeding</h3><p>${blocked||'Existing HerdHarbor breeding records stay authoritative.'}</p></div>${!blocked?`<button class="button button-primary button-small" data-hh-p1-action="breeding">Start breeding</button>`:''}</div>${recordList(rows,'No breeding history is connected to this animal.')}`;}
  function geneticsPanel(model){return`<div class="hh-p1-panel-head"><div><h3>Genetics</h3><p>Open the existing ${canonicalSpecies(model.animal.species)==='rabbit'?'Rabbit genetics engine':'species genetics adapter'} for this animal. Phase 1 does not duplicate or reinterpret genetics.</p></div><button class="button button-primary button-small" data-hh-p1-action="genetics">Open genetics</button></div>`;}
  function pedigreePanel(model,state){const a=model.animal;return`<div class="hh-p1-panel-head"><div><h3>Pedigree</h3><p>Sire: <strong>${esc(animalName(state,a.sireId))}</strong> · Dam: <strong>${esc(animalName(state,a.damId))}</strong></p></div><div><button class="button button-primary button-small" data-hh-p1-action="pedigree">Build / import</button><button class="button button-ghost button-small" data-hh-p1-action="print-pedigree">Print pedigree</button></div></div><p class="muted">The existing pedigree builder, attachments, genetics display, and print system remain the source of truth.</p>`;}
  function showsPanel(model,state){const rows=model.shows.entries.slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).slice(0,8).map(e=>{const show=array(state,'shows').find(s=>String(s.id)===String(e.showId));return{title:show?.name||'Show entry',meta:fmtDate(show?.startDate||e.date),detail:e.className||e.division||''};});return`<div class="hh-p1-panel-head"><div><h3>Shows</h3><p>${model.shows.entries.length} entries · ${model.shows.results.length} results · ${model.shows.awards.length} awards.</p></div><button class="button button-primary button-small" data-hh-p1-action="show-entry">Add show entry</button></div>${recordList(rows,'No show history is connected to this animal.')}`;}
  function productionPanel(model){const rows=model.production.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,10).map(r=>({title:r.product||r.type||'Production',meta:fmtDate(r.date),detail:[r.amount??r.quantity,r.unit].filter(v=>v!==undefined&&v!==null&&v!=='').join(' ')}));return`<div class="hh-p1-panel-head"><div><h3>Production</h3><p>${model.production.length} production records connected to this animal.</p></div><button class="button button-primary button-small" data-hh-p1-action="analytics">View analytics</button></div>${recordList(rows,'No production records are connected to this animal yet.')}`;}
  function historyPanel(state,animalId){const rows=timelineRows(state,animalId).slice(0,40).map(r=>({title:r.title,meta:`${fmtDate(r.date)} · ${r.type}`,detail:r.detail}));return`<div class="hh-p1-panel-head"><div><h3>Activity history</h3><p>One timeline assembled from existing HerdHarbor records. No duplicate history database is created.</p></div></div>${recordList(rows,'No dated history is available yet.')}`;}
  function renderPanel(id,model,state){if(id==='health')return healthPanel(model);if(id==='breeding')return breedingPanel(model,state);if(id==='genetics')return geneticsPanel(model);if(id==='pedigree')return pedigreePanel(model,state);if(id==='shows')return showsPanel(model,state);if(id==='production')return productionPanel(model);if(id==='history')return historyPanel(state,model.animal.id);return'';}
  function actionButtons(model){const a=model.animal,buttons=[['weight','Add weight','primary'],['episode','Health episode','ghost']];if(model.current&&['female','male'].includes(lower(a.sex))&&!model.quarantined)buttons.push(['breeding','Breed','ghost']);if(model.tabs.includes('genetics'))buttons.push(['genetics','Genetics','ghost']);buttons.push(['pedigree','Pedigree','ghost']);if(model.tabs.includes('shows'))buttons.push(['show-entry','Show entry','ghost']);buttons.push(['edit','Edit / status','ghost']);return buttons.map(([action,label,tone])=>`<button type="button" class="button button-${tone} button-small" data-hh-p1-action="${action}">${esc(label)}</button>`).join('');}

  function rememberAnimalTrigger(id){pendingAnimalId=clean(id);pendingAnimalAt=pendingAnimalId?Date.now():0;}
  function consumePendingAnimal(state){if(!pendingAnimalId||!pendingAnimalAt||Date.now()-pendingAnimalAt>PENDING_ANIMAL_MAX_AGE_MS){pendingAnimalId='';pendingAnimalAt=0;return'';}const id=pendingAnimalId;pendingAnimalId='';pendingAnimalAt=0;return animalById(state,id)?id:'';}
  function resolveProfileAnimalId(content){
    const state=stateNow();
    const explicit=clean(content?.dataset?.hhPhase1AnimalId);if(explicit&&animalById(state,explicit))return explicit;
    const pending=consumePendingAnimal(state);if(pending)return pending;
    const title=clean(root.document?.querySelector('#modal-title')?.textContent);
    const query=new URLSearchParams(root.location?.search||'').get('animal');
    const queryAnimal=query?animalById(state,query):null;
    if(queryAnimal&&(!title||clean(queryAnimal.name)===title))return String(queryAnimal.id);
    const matches=array(state,'animals').filter(a=>clean(a.name)===title);
    return matches.length===1?String(matches[0].id):'';
  }
  function enhanceAnimalProfile(){
    const content=root.document?.querySelector('#modal-content');
    if(!content||content.querySelector('.hh-p1-profile-hub')||!content.querySelector('#detail-edit')||!content.querySelector('.animal-detail-hero'))return false;
    const id=resolveProfileAnimalId(content),state=stateNow(),model=profileModel(state,id);if(!model)return false;
    content.dataset.hhPhase1AnimalId=id;
    const hero=content.querySelector('.animal-detail-hero');
    const originals=Array.from(content.children).filter(node=>node!==hero);
    const hub=root.document.createElement('section');hub.className='hh-p1-profile-hub';
    hub.innerHTML=`<div class="hh-p1-context-actions" aria-label="${esc(model.animal.name||'Animal')} actions">${actionButtons(model)}</div><nav class="hh-p1-tabs" role="tablist">${model.tabs.map((tab,i)=>`<button type="button" role="tab" aria-selected="${i===0?'true':'false'}" data-hh-p1-tab="${tab}">${esc(tabLabels[tab])}</button>`).join('')}</nav><div class="hh-p1-tab-panels"><section class="hh-p1-tab-panel active" data-hh-p1-panel="overview"></section>${model.tabs.filter(t=>t!=='overview').map(t=>`<section class="hh-p1-tab-panel" data-hh-p1-panel="${t}">${renderPanel(t,model,state)}</section>`).join('')}</div>`;
    hero.insertAdjacentElement('afterend',hub);
    const overview=hub.querySelector('[data-hh-p1-panel="overview"]');originals.forEach(node=>overview.appendChild(node));
    hub.addEventListener('click',e=>{
      const tab=e.target.closest('[data-hh-p1-tab]');if(tab){hub.querySelectorAll('[data-hh-p1-tab]').forEach(b=>b.setAttribute('aria-selected',String(b===tab)));hub.querySelectorAll('[data-hh-p1-panel]').forEach(p=>p.classList.toggle('active',p.dataset.hhP1Panel===tab.dataset.hhP1Tab));return;}
      const action=e.target.closest('[data-hh-p1-action]')?.dataset?.hhP1Action;if(!action)return;
      if(action==='weight')openCoreHealth(id,'Weight');
      if(action==='health')openCoreHealth(id,'Observation');
      if(action==='episode')openHealthIntelligence(id,'episode');
      if(action==='care')openHealthIntelligence(id,'care');
      if(action==='breeding')openBreeding(model.animal);
      if(action==='genetics'){closeCoreModal();root.HerdHarborAnimalGenetics?.open?.(id);}
      if(action==='pedigree')delegateCore('#detail-import-pedigree');
      if(action==='print-pedigree')delegateCore('#detail-print-pedigree');
      if(action==='show-entry')openShowEntry(id);
      if(action==='analytics')delegateCore('#detail-analytics');
      if(action==='edit')delegateCore('#detail-edit');
    });
    return true;
  }

  function dashboardEventHtml(event,state){const animal=event.animalId?animalName(state,event.animalId):'';const badge=event.tone==='overdue'?'Overdue':event.tone==='today'?'Today':event.tone==='attention'?'Attention':'Soon';return`<article class="hh-p1-today-item is-${event.tone}"><div class="hh-p1-today-date">${event.date?esc(fmtDate(event.date)):'Now'}</div><div class="hh-p1-today-copy"><strong>${esc(event.title)}</strong><span>${esc([event.detail,animal].filter(Boolean).join(' · '))}</span></div><span class="badge ${event.tone==='overdue'||event.tone==='attention'?'danger':event.tone==='today'?'green':'warning'}">${badge}</span><button type="button" class="button button-ghost button-small" data-hh-p1-event="${esc(event.key)}">Open</button></article>`;}
  function eventSignature(events){let hash=2166136261;const text=JSON.stringify(events.map(e=>[e.key,e.date,e.title,e.detail,e.tone,e.animalId]));for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}return`${today()}:${events.length}:${(hash>>>0).toString(36)}`;}
  function enhanceDashboard(){
    const view=root.document?.querySelector('#view-dashboard');if(!view||!view.classList.contains('active'))return false;
    const state=stateNow(),events=todayEvents(state),signature=eventSignature(events),existing=view.querySelector('#hh-p1-today');
    if(existing?.dataset?.hhP1Signature===signature)return false;
    const overdue=events.filter(e=>e.tone==='overdue').length,due=events.filter(e=>e.tone==='today').length,attention=events.filter(e=>e.tone==='attention').length,soon=events.filter(e=>e.tone==='soon').length;
    const panel=root.document.createElement('section');panel.id='hh-p1-today';panel.className='panel hh-p1-today';panel.dataset.hhP1Signature=signature;
    panel.innerHTML=`<div class="hh-p1-today-head"><div><p class="eyebrow">Today</p><h3>What needs attention?</h3><p>One operational queue from existing tasks, Health, breeding reminders, withdrawals, quarantine, and shows.</p></div><div class="hh-p1-today-stats"><span><b>${overdue}</b> overdue</span><span><b>${due}</b> today</span><span><b>${attention}</b> attention</span><span><b>${soon}</b> soon</span></div></div>${events.length?`<div class="hh-p1-today-list">${events.slice(0,12).map(e=>dashboardEventHtml(e,state)).join('')}</div>`:`<div class="empty-state"><strong>Today is clear.</strong><p>New tasks, rechecks, quarantine alerts, withdrawals, and upcoming show dates will appear here automatically.</p></div>`}<div class="hh-p1-today-footer"><button type="button" class="button button-ghost button-small" data-hh-p1-open-tasks>View all tasks</button><button type="button" class="button button-primary button-small" data-hh-p1-quick-add>Quick add</button></div>`;
    if(existing)existing.replaceWith(panel);else{const header=view.querySelector('.page-header');if(header)header.insertAdjacentElement('afterend',panel);else view.prepend(panel);}
    view.querySelector('.task-today-panel')?.classList.add('hh-p1-task-panel-hidden');
    panel.addEventListener('click',e=>{if(e.target.closest('[data-hh-p1-open-tasks]')){root.document.querySelector('#dashboard-view-tasks')?.click();return;}if(e.target.closest('[data-hh-p1-quick-add]')){root.document.querySelector('#quick-add-button')?.click();return;}const key=e.target.closest('[data-hh-p1-event]')?.dataset?.hhP1Event;if(!key)return;const item=events.find(x=>x.key===key);if(!item)return;if(item.source==='health')nav('health');else if(item.source==='shows')root.document.querySelector('.nav-item[data-route="shows"]')?.click();else nav('tasks');});
    return true;
  }
  function enhanceQuickAdd(){const content=root.document?.querySelector('#modal-content'),title=clean(root.document?.querySelector('#modal-title')?.textContent);if(!content||title!=='Quick add'||content.querySelector('.hh-p1-quick-context'))return false;const route=root.HerdHarborApp?.getCurrentRoute?.()||'dashboard',types=contextualQuickTypes(route),labels={animal:'Animal',health:'Health',task:'Task',pedigree:'Pedigree',breeding:'Breeding',litter:'Birth / litter',expense:'Expense',income:'Income',sale:'Animal sale',customer:'Customer'};const block=root.document.createElement('section');block.className='hh-p1-quick-context';block.innerHTML=`<p class="eyebrow">Suggested here</p><div>${types.map(type=>`<button type="button" class="button button-ghost button-small" data-hh-p1-quick="${type}">${esc(labels[type]||type)}</button>`).join('')}</div>`;content.prepend(block);block.addEventListener('click',e=>{const type=e.target.closest('[data-hh-p1-quick]')?.dataset?.hhP1Quick;if(!type)return;content.querySelector(`[data-quick="${type}"]`)?.click();});return true;}

  function enhance(){enhanceAnimalProfile();enhanceDashboard();enhanceQuickAdd();}
  function runEnhance(){queued=false;if(!appReady)return;const body=root.document?.body;if(observer&&body)observer.disconnect();try{enhance();}finally{if(observer&&body)observer.observe(body,{childList:true,subtree:true});}}
  function scheduleEnhance(){if(!appReady||queued)return;queued=true;if(typeof root.requestAnimationFrame==='function')root.requestAnimationFrame(runEnhance);else root.setTimeout?.(runEnhance,0);}
  function startObserver(){if(observer||!root.document?.body||typeof root.MutationObserver!=='function')return;observer=new root.MutationObserver(scheduleEnhance);observer.observe(root.document.body,{childList:true,subtree:true});}
  function markAppReady(){if(appReady)return;appReady=true;startObserver();scheduleEnhance();}
  function install(){
    if(installed)return API;installed=true;root.__hhPhase1WorkflowInstalled=true;
    root.document.addEventListener('click',e=>{const view=e.target.closest?.('[data-view-animal]');if(view?.dataset?.viewAnimal)rememberAnimalTrigger(view.dataset.viewAnimal);},true);
    root.addEventListener?.('herdharbor:app-ready',markAppReady);
    root.addEventListener?.('herdharbor:health-intelligence-changed',scheduleEnhance);
    if(root.HerdHarborApp?.getState)markAppReady();
    return API;
  }
  function uninstall(){observer?.disconnect?.();observer=null;queued=false;appReady=false;installed=false;root.__hhPhase1WorkflowInstalled=false;}
  const API=Object.freeze({VERSION,CONTRACT,isCurrentAnimal,profileTabs,profileModel,timelineRows,contextualQuickTypes,todayEvents,eventSignature,enhanceAnimalProfile,enhanceDashboard,enhanceQuickAdd,install,uninstall});
  return API;
});
