(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.HerdHarborV171StabilityHotfix=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';

const VERSION='1.7.1-stability-hotfix-1';
const FARM_KEY='herdharbor_pre_alpha_v1';
const LEGACY_HEALTH_KEY='herdharbor_health_intelligence_v1';
const INACTIVE=new Set(['sold','deceased','archived','ancestor only','ancestor-only','ancestor_only']);
const LEGACY_URGENCY=Object.freeze({
  Emergency:'Emergency now',
  Urgent:'Contact a vet soon',
  'Monitor closely':'Monitor and call',
  'Emergency now':'Emergency now',
  'Contact a vet soon':'Contact a vet soon',
  'Monitor and call':'Monitor and call'
});
const DISPLAY_URGENCY=Object.freeze({
  'Emergency now':'Emergency',
  'Contact a vet soon':'Urgent',
  'Monitor and call':'Monitor closely'
});
const clean=v=>String(v==null?'':v).trim();
const lower=v=>clean(v).toLowerCase();
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=v=>{try{return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v))}catch{return v}};

function readState(){
  try{const state=root?.HerdHarborApp?.getState?.();if(state&&typeof state==='object')return state}catch{}
  try{return JSON.parse(root?.localStorage?.getItem(FARM_KEY)||'{}')||{}}catch{return{}}
}
function currentAnimal(animal){return !!animal&&!INACTIVE.has(lower(animal.status));}
function canonicalSpecies(value){
  const genetics=root?.HerdHarborGeneticsPlatform;
  if(typeof genetics?.canonicalSpecies==='function'){
    try{return genetics.canonicalSpecies(value)||''}catch{}
  }
  const raw=lower(value);
  return ({rabbits:'rabbit',bunnies:'rabbit',bunny:'rabbit',cow:'cattle',cows:'cattle',bovine:'cattle',goats:'goat',pigs:'swine',pig:'swine',hogs:'swine',hog:'swine',chickens:'poultry',chicken:'poultry',hens:'poultry',rooster:'poultry',ducks:'poultry',duck:'poultry',turkeys:'poultry',turkey:'poultry'}[raw]||raw.replace(/s$/,''));
}
function activeAnimals(state=readState()){return (Array.isArray(state.animals)?state.animals:[]).filter(currentAnimal);}
function quarantineIds(state=readState()){
  const episodes=state?.healthIntelligence?.episodes||[];
  return new Set(episodes.filter(e=>!e.resolved&&(e.quarantined||lower(e.healthStatus)==='quarantined')).map(e=>String(e.animalId)));
}
function animalById(state,id){return (state.animals||[]).find(a=>String(a.id)===String(id))||null;}
function validateParents({animalId,species,sireId,damId},state=readState()){
  const errors=[];
  const subjectId=String(animalId||'');
  const subjectSpecies=canonicalSpecies(species);
  const check=(role,id)=>{
    if(!id)return;
    if(String(id)===subjectId)errors.push(`An animal cannot be its own ${role}.`);
    const parent=animalById(state,id);
    if(parent&&subjectSpecies&&canonicalSpecies(parent.species)!==subjectSpecies)errors.push(`The ${role} must be the same species as the animal.`);
  };
  check('sire',sireId);check('dam',damId);
  if(sireId&&damId&&String(sireId)===String(damId))errors.push('Sire and dam must be different animals.');
  return errors;
}
function validateBreeding({femaleId,maleId,initialFemaleId='',initialMaleId=''},state=readState()){
  const errors=[];
  if(!femaleId||!maleId)return errors;
  if(String(femaleId)===String(maleId))errors.push('Select two different animals.');
  const female=animalById(state,femaleId),male=animalById(state,maleId);
  if(female&&male&&canonicalSpecies(female.species)!==canonicalSpecies(male.species))errors.push('The sire and dam must be the same species.');
  const quarantined=quarantineIds(state);
  const validateCandidate=(animal,id,initialId,role)=>{
    const unchanged=String(id)===String(initialId||'');
    if(animal&&!currentAnimal(animal)&&!unchanged)errors.push(`${role} is not currently on the farm and cannot be selected for a new breeding.`);
    if(quarantined.has(String(id))&&!unchanged)errors.push(`${role} is currently quarantined and cannot be selected for breeding.`);
  };
  validateCandidate(female,femaleId,initialFemaleId,'Dam');
  validateCandidate(male,maleId,initialMaleId,'Sire');
  return errors;
}
function snapshotGroupAnimalIds(species,state=readState()){
  const target=canonicalSpecies(species);
  return activeAnimals(state).filter(a=>canonicalSpecies(a.species)===target).map(a=>String(a.id));
}
function deleteDependencies(animalId,state=readState()){
  const id=String(animalId||'');
  const deps=[];
  const children=(state.animals||[]).filter(a=>String(a.sireId)===id||String(a.damId)===id);
  if(children.length)deps.push(`${children.length} descendant record${children.length===1?'':'s'}`);
  const litters=(state.litters||[]).filter(l=>String(l.sireId)===id||String(l.damId)===id);
  if(litters.length)deps.push(`${litters.length} birth/litter record${litters.length===1?'':'s'}`);
  const hi=state.healthIntelligence||{};
  const episodes=(hi.episodes||[]).filter(r=>String(r.animalId)===id).length;
  const care=(hi.careRecords||[]).filter(r=>String(r.animalId)===id).length;
  const groups=(hi.groupRecords||[]).filter(r=>Array.isArray(r.animalIds)&&r.animalIds.map(String).includes(id)).length;
  const healthTotal=episodes+care+groups;
  if(healthTotal)deps.push(`${healthTotal} Health Intelligence record${healthTotal===1?'':'s'}`);
  return deps;
}
function combinedWeightGrams(record){
  const value=Number(record?.weight);
  if(!Number.isFinite(value))return null;
  const unit=lower(record?.weightUnit||'lb').replace(/\s+/g,'');
  const ounces=Number(record?.weightOunces||0);
  if(unit==='lb+oz'||unit==='lboz')return value*453.59237+(Number.isFinite(ounces)?ounces:0)*28.349523125;
  if(unit==='lb'||unit==='lbs')return value*453.59237;
  if(unit==='oz')return value*28.349523125;
  if(unit==='kg')return value*1000;
  if(unit==='g')return value;
  return null;
}
function healthRecordCount(animalId,state=readState()){
  const id=String(animalId||'');
  const hi=state.healthIntelligence||{};
  const animal=animalById(state,id);
  const group=(hi.groupRecords||[]).filter(r=>{
    const ids=Array.isArray(r.animalIds)?r.animalIds.map(String):[];
    if(ids.length)return ids.includes(id);
    return animal&&canonicalSpecies(r.species)===canonicalSpecies(animal.species);
  }).length;
  return (state.health||[]).filter(r=>String(r.animalId)===id).length+
    (hi.episodes||[]).filter(r=>String(r.animalId)===id).length+
    (hi.careRecords||[]).filter(r=>String(r.animalId)===id).length+group;
}
function legacyUrgency(value){return LEGACY_URGENCY[clean(value)]||clean(value);}
function displayUrgency(value){return DISPLAY_URGENCY[legacyUrgency(value)]||clean(value);}
function toast(message,type='error'){try{root?.HerdHarborApp?.toast?.(message,type)}catch{}}

function patchSpeciesContext(){
  const base=root?.HerdHarborSpeciesContext;
  if(!base||base.__v171StabilityPatched)return false;
  const grouping=(state=readState(),options={})=>{
    const canonicalize=typeof options.canonicalize==='function'?options.canonicalize:(v=>clean(v).toLowerCase());
    const supported=typeof options.supported==='function'?options.supported:()=>true;
    let animals;
    if(options.includeHistorical===true)animals=base.animalsForSurface(state,options);
    else animals=base.currentAnimals(state);
    const groups=new Map();
    for(const animal of animals){const species=canonicalize(animal?.species);if(!species||!supported(species,animal))continue;if(!groups.has(species))groups.set(species,[]);groups.get(species).push(animal)}
    return [...groups.entries()].map(([species,animals])=>({species,animals:[...animals]}));
  };
  const patched=Object.freeze({
    ...base,
    __v171StabilityPatched:true,
    isActiveAnimal:base.isCurrentAnimal,
    activeSpecies:(state=readState(),options={})=>grouping(state,options).map(g=>g.species),
    groupCurrentAnimalsBySpecies:grouping,
    currentSpecies:(state=readState(),options={})=>grouping(state,options).map(g=>g.species)
  });
  root.HerdHarborSpeciesContext=patched;
  return true;
}

function patchSymptomControls(){
  const state=readState();
  const activeIds=new Set(activeAnimals(state).map(a=>String(a.id)));
  const animalSelect=root.document?.querySelector('#symptom-animal');
  if(animalSelect){
    [...animalSelect.options].forEach(option=>{if(!option.value)return;const allowed=activeIds.has(String(option.value));option.hidden=!allowed;option.disabled=!allowed});
    if(animalSelect.value&&!activeIds.has(String(animalSelect.value))){animalSelect.value='';animalSelect.dispatchEvent(new Event('change',{bubbles:true}))}
  }
  const urgency=root.document?.querySelector('#symptom-urgency');
  if(urgency){
    [...urgency.options].forEach(option=>{
      if(!option.value&&clean(option.textContent)==='All')return;
      const canonical=legacyUrgency(option.value||option.textContent);
      if(canonical){option.value=canonical;option.textContent=displayUrgency(canonical)}
    });
  }
}

function formAnimalId(form){
  if(!form)return'';
  if(form.dataset.hhAnimalId)return form.dataset.hhAnimalId;
  const state=readState();
  const name=clean(form.elements?.name?.value);
  const tag=clean(form.elements?.tag?.value);
  const reg=clean(form.elements?.registrationNumber?.value);
  const tattoo=clean(form.elements?.tattoo?.value);
  const matches=(state.animals||[]).filter(a=>
    (!name||clean(a.name)===name)&&(!tag||clean(a.tag)===tag)&&(!reg||clean(a.registrationNumber)===reg)&&(!tattoo||clean(a.tattoo)===tattoo)
  );
  if(matches.length===1){form.dataset.hhAnimalId=String(matches[0].id);return String(matches[0].id)}
  return'';
}
function patchAnimalParentOptions(form){
  if(!form||form.id!=='animal-form')return;
  const state=readState(),id=formAnimalId(form),species=canonicalSpecies(form.elements?.species?.value);
  for(const name of ['sireId','damId']){
    const select=form.elements?.[name];if(!select)continue;
    [...select.options].forEach(option=>{
      if(!option.value)return;
      const candidate=animalById(state,option.value);
      const allowed=String(option.value)!==String(id)&&(!candidate||!species||canonicalSpecies(candidate.species)===species);
      option.hidden=!allowed;option.disabled=!allowed;
    });
  }
}
function patchBreedingOptions(form){
  if(!form||form.id!=='breeding-form')return;
  const state=readState(),quarantined=quarantineIds(state);
  const female=form.elements?.femaleId,male=form.elements?.maleId;
  if(!form.dataset.hhInitialFemale)form.dataset.hhInitialFemale=female?.value||'';
  if(!form.dataset.hhInitialMale)form.dataset.hhInitialMale=male?.value||'';
  [[female,form.dataset.hhInitialFemale],[male,form.dataset.hhInitialMale]].forEach(([select,initial])=>{
    if(!select)return;
    [...select.options].forEach(option=>{
      if(!option.value)return;
      const animal=animalById(state,option.value),unchanged=String(option.value)===String(initial||'');
      const allowed=unchanged||(currentAnimal(animal)&&!quarantined.has(String(option.value)));
      option.hidden=!allowed;option.disabled=!allowed;
    });
  });
}
function patchLegacyWeightCells(){
  const state=readState();
  root.document?.querySelectorAll('#view-health [data-edit-health]').forEach(button=>{
    const record=(state.health||[]).find(r=>String(r.id)===String(button.dataset.editHealth));
    if(!record||lower(record.weightUnit)!=='lb+oz'||record.weight===''||record.weight==null)return;
    const row=button.closest('tr');const cell=row?.children?.[4];
    if(cell)cell.textContent=`${record.weight} lb ${record.weightOunces||0} oz`;
  });
}
function patchWeightInsights(){
  const state=readState();
  const byAnimal=new Map();
  for(const record of state.health||[]){
    if(record?.type!=='Weight'||!record.animalId||!record.date)continue;
    if(!byAnimal.has(String(record.animalId)))byAnimal.set(String(record.animalId),[]);
    byAnimal.get(String(record.animalId)).push(record);
  }
  for(const [id,rows] of byAnimal){
    rows.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    if(rows.length<2)continue;
    const a=rows.at(-2),b=rows.at(-1);
    if(lower(a.weightUnit)!=='lb+oz'||lower(b.weightUnit)!=='lb+oz')continue;
    const g1=combinedWeightGrams(a),g2=combinedWeightGrams(b);if(!(g1>0)||g2==null)continue;
    const pct=(g2-g1)/g1*100;
    const animal=animalById(state,id);const name=animal?.name||'An animal';
    root.document?.querySelectorAll('#hh-health-intelligence .hh-hi-insight').forEach(node=>{
      if(!node.textContent.includes(name)||!node.textContent.includes('two most recent recorded weights changed'))return;
      if(pct<=-5)node.textContent=`${name}'s two most recent recorded weights changed ${pct.toFixed(1)}%. Review the dates and health context; HerdHarbor is flagging a trend, not assigning a cause.`;
      else node.remove();
    });
  }
}
function patchBreedingQuarantineWarning(){
  const view=root.document?.querySelector('#view-breeding');if(!view)return;
  view.querySelector('.hh-hotfix-quarantine-warning')?.remove();
  const state=readState(),q=quarantineIds(state);if(!q.size)return;
  const affected=(state.breedings||[]).filter(b=>!["not pregnant","delivered","cancelled"].includes(lower(b.status))&&(q.has(String(b.femaleId))||q.has(String(b.maleId))));
  if(!affected.length)return;
  const note=root.document.createElement('div');
  note.className='panel hh-hotfix-quarantine-warning';
  note.setAttribute('role','alert');
  note.innerHTML=`<strong>Breeding review needed.</strong><p>${affected.length} active breeding record${affected.length===1?' includes':'s include'} an animal currently marked quarantined. Review the breeding plan before proceeding.</p>`;
  const header=view.querySelector('.page-header');if(header?.nextSibling)view.insertBefore(note,header.nextSibling);else view.prepend(note);
}
function patchAnimalDetailSummary(){
  const id=String(root.__hhV171SelectedAnimalId||'');if(!id)return;
  const state=readState(),modal=root.document?.querySelector('#modal-content');if(!modal)return;
  const heading=[...modal.querySelectorAll('h3')].find(h=>clean(h.textContent)==='Record summary');if(!heading)return;
  const p=heading.nextElementSibling;if(!p)return;
  const breedings=(state.breedings||[]).filter(b=>String(b.femaleId)===id||String(b.maleId)===id).length;
  const pedigrees=(state.pedigrees||[]).filter(r=>String(r.subjectAnimalId)===id).length;
  const health=healthRecordCount(id,state);
  p.textContent=`${health} health record${health===1?'':'s'} · ${breedings} breeding record${breedings===1?'':'s'} · ${pedigrees} pedigree import${pedigrees===1?'':'s'}`;
}

function ensureHealthHistoryButton(){
  const actions=root.document?.querySelector('#hh-health-intelligence .hh-hi-actions');
  if(!actions||actions.querySelector('[data-hh-health-history]'))return;
  const button=root.document.createElement('button');button.type='button';button.className='button button-ghost';button.dataset.hhHealthHistory='1';button.textContent='Full health history';actions.appendChild(button);
}
function historyState(){
  const state=readState();
  if(state.healthIntelligence)return state.healthIntelligence;
  try{return root.HerdHarborHealthIntelligence?.readHealthState?.()||{episodes:[],careRecords:[],groupRecords:[]}}catch{return{episodes:[],careRecords:[],groupRecords:[]}}
}
function historyModal(){
  const state=readState(),h=historyState();
  root.document?.querySelector('#hh-v171-health-history-modal')?.remove();
  const modal=root.document.createElement('div');modal.id='hh-v171-health-history-modal';modal.className='modal-overlay active hh-hi-overlay';
  const rows=[];
  (h.episodes||[]).forEach(r=>rows.push({kind:'episode',id:r.id,date:r.startedDate||'',title:`${animalById(state,r.animalId)?.name||'Unknown animal'} · ${r.concern||'Health episode'}`,detail:`${r.assessment?.level||r.healthStatus||'Monitor'}${r.resolved?' · Resolved':''}`}));
  (h.careRecords||[]).forEach(r=>rows.push({kind:'care',id:r.id,date:r.date||'',title:`${animalById(state,r.animalId)?.name||'Unknown animal'} · ${r.type||'Care'}`,detail:[r.product,r.reason].filter(Boolean).join(' · ')}));
  (h.groupRecords||[]).forEach(r=>rows.push({kind:'group',id:r.id,date:r.date||'',title:`${r.species||'Group'} · ${r.type||'Group record'}`,detail:`${r.targetCount||r.animalIds?.length||0} snapshotted animals${r.description?` · ${r.description}`:''}`}));
  rows.sort((a,b)=>String(b.date).localeCompare(String(a.date))||a.title.localeCompare(b.title));
  modal.innerHTML=`<section class="modal hh-hi-modal modal-wide" role="dialog" aria-modal="true" aria-label="Full health history"><div class="modal-header"><strong>Full health history</strong><button type="button" class="icon-button" data-hh-history-close aria-label="Close">×</button></div><div class="modal-content"><p class="muted">All Health Intelligence episodes, structured care records, and group records are shown here.</p><div class="hh-hi-list">${rows.length?rows.map(r=>`<article class="hh-hi-record"><div><strong>${esc(r.title)}</strong><small>${esc(r.date||'No date')}${r.detail?` · ${esc(r.detail)}`:''}</small></div><div class="hh-hi-record-actions"><button type="button" class="button button-ghost button-small" data-hh-history-edit="${esc(r.kind)}:${esc(r.id)}">Edit</button><button type="button" class="button button-danger button-small" data-hh-history-delete="${esc(r.kind)}:${esc(r.id)}">Delete</button></div></article>`).join(''):'<p class="muted">No Health Intelligence history yet.</p>'}</div></div></section>`;
  (root.document.body||root.document.documentElement).appendChild(modal);
  modal.querySelectorAll('[data-hh-history-close]').forEach(b=>b.addEventListener('click',()=>modal.remove()));
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove()});
  return modal;
}
function removeHistoryRecord(kind,id){
  const state=clone(readState())||{},h=clone(historyState())||{episodes:[],careRecords:[],groupRecords:[]};
  const key=kind==='episode'?'episodes':kind==='care'?'careRecords':'groupRecords';
  h[key]=(h[key]||[]).filter(r=>String(r.id)!==String(id));h.updatedAt=new Date().toISOString();state.healthIntelligence=h;
  const ok=root.HerdHarborApp?.commitState?.(state,'Health Intelligence record deleted.');
  if(ok===false)return false;
  root.HerdHarborHealthIntelligence?.renderHealthPanel?.();return true;
}
function editHistoryRecord(kind,id){
  const h=historyState(),key=kind==='episode'?'episodes':kind==='care'?'careRecords':'groupRecords',record=(h[key]||[]).find(r=>String(r.id)===String(id));if(!record)return;
  const history=root.document?.querySelector('#hh-v171-health-history-modal');history?.remove();
  const d=root.document.createElement('div');d.id='hh-v171-history-edit';d.className='modal-overlay active hh-hi-overlay';
  let fields='';
  if(kind==='episode')fields=`<label><span>Concern</span><input name="concern" value="${esc(record.concern||'')}" required></label><label><span>Started</span><input name="startedDate" type="date" value="${esc(record.startedDate||'')}"></label><label><span>Recheck</span><input name="recheckDate" type="date" value="${esc(record.recheckDate||'')}"></label><label><span>Health status</span><select name="healthStatus">${['Monitor','Sick','Quarantined','Recovering'].map(v=>`<option ${v===record.healthStatus?'selected':''}>${v}</option>`).join('')}</select></label><label class="hh-hi-check"><input type="checkbox" name="quarantined" value="1" ${record.quarantined?'checked':''}> Mark quarantined</label>`;
  if(kind==='care')fields=`<label><span>Type</span><input name="type" value="${esc(record.type||'')}"></label><label><span>Date</span><input name="date" type="date" value="${esc(record.date||'')}"></label><label><span>Product / medication</span><input name="product" value="${esc(record.product||'')}"></label><label><span>Reason</span><input name="reason" value="${esc(record.reason||'')}"></label><label><span>Amount given</span><input name="amountRecorded" value="${esc(record.amountRecorded||'')}"></label><label><span>Meat withdrawal ends</span><input name="meatWithdrawalEnd" type="date" value="${esc(record.meatWithdrawalEnd||'')}"></label><label><span>Milk withdrawal ends</span><input name="milkWithdrawalEnd" type="date" value="${esc(record.milkWithdrawalEnd||'')}"></label><label><span>Egg withdrawal ends</span><input name="eggWithdrawalEnd" type="date" value="${esc(record.eggWithdrawalEnd||'')}"></label>`;
  if(kind==='group')fields=`<label><span>Type</span><input name="type" value="${esc(record.type||'')}"></label><label><span>Date</span><input name="date" type="date" value="${esc(record.date||'')}"></label><label><span>Description</span><input name="description" value="${esc(record.description||'')}"></label><label><span>Product</span><input name="product" value="${esc(record.product||'')}"></label><label><span>Follow-up date</span><input name="followUpDate" type="date" value="${esc(record.followUpDate||'')}"></label>`;
  d.innerHTML=`<section class="modal hh-hi-modal" role="dialog" aria-modal="true"><div class="modal-header"><strong>Edit health record</strong><button type="button" class="icon-button" data-hh-edit-close>×</button></div><div class="modal-content"><form id="hh-v171-history-edit-form"><div class="hh-hi-grid">${fields}</div><label><span>Notes</span><textarea name="notes" rows="4">${esc(record.notes||'')}</textarea></label><div class="modal-actions"><button type="button" class="button button-ghost" data-hh-edit-close>Cancel</button><button type="submit" class="button button-primary">Save changes</button></div></form></div></section>`;
  (root.document.body||root.document.documentElement).appendChild(d);
  d.querySelectorAll('[data-hh-edit-close]').forEach(b=>b.addEventListener('click',()=>d.remove()));
  d.querySelector('form')?.addEventListener('submit',ev=>{ev.preventDefault();const data=Object.fromEntries(new FormData(ev.currentTarget));let saved;
    if(kind==='episode')saved=root.HerdHarborHealthIntelligence?.saveEpisode?.({...record,...data,quarantined:!!data.quarantined||data.healthStatus==='Quarantined'});
    if(kind==='care')saved=root.HerdHarborHealthIntelligence?.saveCareRecord?.({...record,...data});
    if(kind==='group')saved=root.HerdHarborHealthIntelligence?.saveGroupRecord?.({...record,...data,animalIds:Array.isArray(record.animalIds)?record.animalIds:[]});
    if(saved){d.remove();root.HerdHarborHealthIntelligence?.renderHealthPanel?.();historyModal()}
  });
}

function excelSafe(value){const text=clean(value);return /^[=+\-@]/.test(text)?`'${text}`:text;}
function styleSheet(sheet,widths=[]){
  sheet.views=[{state:'frozen',ySplit:1}];
  sheet.getRow(1).font={bold:true};
  widths.forEach((w,i)=>{sheet.getColumn(i+1).width=w});
  sheet.eachRow({includeEmpty:false},row=>{row.alignment={vertical:'top',wrapText:true}});
}
function addHealthIntelligenceSheets(workbook,state){
  const h=state?.healthIntelligence||{};const animals=new Map((state.animals||[]).map(a=>[String(a.id),a]));const name=id=>animals.get(String(id))?.name||'';
  const episodes=workbook.addWorksheet('Health Episodes');
  episodes.addRow(['Episode ID','Animal','Species','Started','Recheck','Concern','Assessment','Health Status','Quarantined','Resolved','Resolved Date','Appetite','Water','Manure / Droppings','Activity','Breathing','Animals Affected','Temperature','Pulse','Respiration','Body Condition','Mobility','Production Change','Notes']);
  (h.episodes||[]).forEach(r=>episodes.addRow([excelSafe(r.id),excelSafe(name(r.animalId)),excelSafe(r.species),r.startedDate||'',r.recheckDate||'',excelSafe(r.concern),excelSafe(r.assessment?.level),excelSafe(r.healthStatus),r.quarantined?'Yes':'No',r.resolved?'Yes':'No',r.resolvedDate||'',excelSafe(r.appetite),excelSafe(r.water),excelSafe(r.manure),excelSafe(r.activity),excelSafe(r.breathing),Number(r.affectedCount||1),excelSafe(r.temperature),excelSafe(r.pulse),excelSafe(r.respiration),excelSafe(r.bodyCondition),excelSafe(r.mobility),excelSafe(r.productionChange),excelSafe(r.notes)]));
  styleSheet(episodes,[28,24,14,14,14,32,16,16,14,12,14,14,14,18,14,14,16,14,14,14,18,18,20,40]);
  const care=workbook.addWorksheet('Structured Care');
  care.addRow(['Care ID','Animal','Species','Type','Date','Product / Medication','Reason','Amount Recorded','Route','Frequency','Start','End','Prescribed / Directed By','Administered By','Lot Number','Expiration','Booster / Follow-up Due','Meat Withdrawal Ends','Milk Withdrawal Ends','Egg Withdrawal Ends','Outcome','Adverse Reaction','Notes']);
  (h.careRecords||[]).forEach(r=>care.addRow([excelSafe(r.id),excelSafe(name(r.animalId)),excelSafe(r.species),excelSafe(r.type),r.date||'',excelSafe(r.product),excelSafe(r.reason),excelSafe(r.amountRecorded),excelSafe(r.route),excelSafe(r.frequency),r.startDate||'',r.endDate||'',excelSafe(r.prescribedBy),excelSafe(r.administeredBy),excelSafe(r.lotNumber),r.expirationDate||'',r.boosterDueDate||'',r.meatWithdrawalEnd||'',r.milkWithdrawalEnd||'',r.eggWithdrawalEnd||'',excelSafe(r.outcome),excelSafe(r.adverseReaction),excelSafe(r.notes)]));
  styleSheet(care,[28,24,14,18,14,26,26,18,14,18,14,14,24,22,18,14,20,20,20,20,22,22,40]);
  const groups=workbook.addWorksheet('Group Health');
  groups.addRow(['Group Record ID','Species','Animal IDs Snapshot','Animal Names Snapshot','Target Count','Type','Date','Description','Product','Follow-up Date','Notes']);
  (h.groupRecords||[]).forEach(r=>{const ids=Array.isArray(r.animalIds)?r.animalIds.map(String):[];groups.addRow([excelSafe(r.id),excelSafe(r.species),excelSafe(ids.join(', ')),excelSafe(ids.map(name).filter(Boolean).join(', ')),Number(r.targetCount||ids.length||0),excelSafe(r.type),r.date||'',excelSafe(r.description),excelSafe(r.product),r.followUpDate||'',excelSafe(r.notes)])});
  styleSheet(groups,[28,14,42,42,14,20,14,34,24,18,40]);
}
async function pendingSaleNumbersFromFile(file){
  const pending=new Set();
  if(!file||!root?.ExcelJS?.Workbook)return pending;
  try{
    const workbook=new root.ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const normalizeHeader=v=>lower(v).replace(/[^a-z0-9]+/g,' ').trim();
    workbook.worksheets.forEach(sheet=>{
      let saleCol=0,statusCol=0,headerRow=0;
      const max=Math.min(sheet.rowCount||0,30);
      for(let r=1;r<=max&&!headerRow;r+=1){
        const row=sheet.getRow(r);
        row.eachCell({includeEmpty:false},(cell,c)=>{
          const h=normalizeHeader(cell.text||cell.value);
          if(['sale number','invoice number','invoice no','sale id'].includes(h))saleCol=c;
          if(['sale status','invoice status','status'].includes(h))statusCol=c;
        });
        if(saleCol&&statusCol)headerRow=r;
        else{saleCol=0;statusCol=0}
      }
      if(!headerRow)return;
      for(let r=headerRow+1;r<=sheet.rowCount;r+=1){
        const sale=clean(sheet.getRow(r).getCell(saleCol).text||sheet.getRow(r).getCell(saleCol).value);
        const status=lower(sheet.getRow(r).getCell(statusCol).text||sheet.getRow(r).getCell(statusCol).value);
        if(sale&&status==='pending')pending.add(lower(sale));
      }
    });
  }catch{}
  return pending;
}

function installSpreadsheetPatch(){
  const api=root?.HerdHarborSpreadsheet;if(!api||api.__v171StabilityPatched)return false;
  if(!api.__test?.buildExportWorkbook)return false;
  const original=api.downloadExport;
  const originalOpenImport=api.openImport;
  if(typeof originalOpenImport==='function'){
    api.openImport=async function(options={}){
      const pending=await pendingSaleNumbersFromFile(options.file);
      if(!pending.size)return originalOpenImport.call(api,options);
      const commit=options.commit;
      return originalOpenImport.call(api,{...options,commit:async(records,metadata)=>{
        (records?.sales||[]).forEach(sale=>{if(lower(sale.saleNumber)&&pending.has(lower(sale.saleNumber))&&sale.status==='Draft')sale.status='Pending'});
        return commit(records,metadata);
      }});
    };
  }
  api.downloadExport=async function(state,options={}){
    try{
      if(!root.ExcelJS?.Workbook)throw new Error('The Excel report tool did not load. Close and reopen HerdHarbor, then try again.');
      const workbook=api.__test.buildExportWorkbook(state,options);addHealthIntelligenceSheets(workbook,state||{});
      const buffer=await workbook.xlsx.writeBuffer();const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});const url=URL.createObjectURL(blob);const link=root.document.createElement('a');const operation=clean(options.operationName||'herdharbor').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'herdharbor';link.href=url;link.download=`${operation}-herdharbor-records.xlsx`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(error){if(typeof original==='function')return original.call(api,state,options);throw error}
  };
  Object.defineProperty(api,'__v171StabilityPatched',{value:true,enumerable:false});return true;
}

function patchCurrentDom(){
  patchSpeciesContext();patchSymptomControls();patchLegacyWeightCells();patchWeightInsights();patchBreedingQuarantineWarning();patchAnimalDetailSummary();ensureHealthHistoryButton();installSpreadsheetPatch();
  const animalForm=root.document?.querySelector('#animal-form');if(animalForm)patchAnimalParentOptions(animalForm);
  const breedingForm=root.document?.querySelector('#breeding-form');if(breedingForm)patchBreedingOptions(breedingForm);
}
function onSubmit(event){
  const form=event.target;if(!(form instanceof (root.HTMLFormElement||Object)))return;
  if(form.id==='animal-form'){
    const id=formAnimalId(form);const errors=validateParents({animalId:id,species:form.elements?.species?.value,sireId:form.elements?.sireId?.value,damId:form.elements?.damId?.value});
    if(errors.length){event.preventDefault();event.stopImmediatePropagation();toast(errors[0]);return}
  }
  if(form.id==='breeding-form'){
    const errors=validateBreeding({femaleId:form.elements?.femaleId?.value,maleId:form.elements?.maleId?.value,initialFemaleId:form.dataset.hhInitialFemale||'',initialMaleId:form.dataset.hhInitialMale||''});
    if(errors.length){event.preventDefault();event.stopImmediatePropagation();toast(errors[0]);return}
  }
  if(form.id==='hh-hi-group-form'){
    event.preventDefault();event.stopImmediatePropagation();const data=Object.fromEntries(new FormData(form));data.animalIds=snapshotGroupAnimalIds(data.species);const saved=root.HerdHarborHealthIntelligence?.saveGroupRecord?.(data);if(saved){form.closest('.modal-overlay')?.remove();root.HerdHarborHealthIntelligence?.renderHealthPanel?.();toast(`Group health record saved for ${data.animalIds.length} active animal${data.animalIds.length===1?'':'s'}.`,'success')}
  }
}
function onClick(event){
  const target=event.target?.closest?.('*');if(!target)return;
  const view=target.closest?.('[data-view-animal]');if(view)root.__hhV171SelectedAnimalId=String(view.dataset.viewAnimal||'');
  const edit=target.closest?.('[data-edit-animal]');if(edit)root.__hhV171SelectedAnimalId=String(edit.dataset.editAnimal||'');
  if(target.closest?.('#clear-data')){try{root.localStorage?.removeItem(LEGACY_HEALTH_KEY)}catch{}}
  const deleteAnimal=target.closest?.('#delete-animal');
  if(deleteAnimal){const form=root.document?.querySelector('#animal-form'),id=formAnimalId(form)||String(root.__hhV171SelectedAnimalId||''),deps=deleteDependencies(id);if(deps.length){event.preventDefault();event.stopImmediatePropagation();toast(`This animal is still referenced by ${deps.join(', ')}. Archive it instead, or remove those links before deleting.`);return}}
  if(target.closest?.('[data-hh-health-history]')){event.preventDefault();historyModal();return}
  const del=target.closest?.('[data-hh-history-delete]');if(del){event.preventDefault();const [kind,id]=String(del.dataset.hhHistoryDelete||'').split(':');if(root.confirm?.('Delete this Health Intelligence record?')){removeHistoryRecord(kind,id);historyModal()}return}
  const editHistory=target.closest?.('[data-hh-history-edit]');if(editHistory){event.preventDefault();const [kind,id]=String(editHistory.dataset.hhHistoryEdit||'').split(':');editHistoryRecord(kind,id);return}
}
function install(){
  if(!root?.document||root.__hhV171StabilityInstalled)return;
  root.__hhV171StabilityInstalled=true;
  root.document.addEventListener('submit',onSubmit,true);
  root.document.addEventListener('click',onClick,true);
  root.document.addEventListener('change',event=>{if(event.target?.matches?.('#animal-form [name="species"]'))queueMicrotask(()=>patchAnimalParentOptions(event.target.closest('form')));if(event.target?.matches?.('#breeding-form [name="femaleId"],#breeding-form [name="maleId"]'))queueMicrotask(()=>patchBreedingOptions(event.target.closest('form')))},true);
  if(typeof root.MutationObserver==='function'&&root.document.body){let queued=false;new root.MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;patchCurrentDom()})}).observe(root.document.body,{childList:true,subtree:true});}
  root.addEventListener?.('herdharbor:app-ready',patchCurrentDom);
  root.addEventListener?.('herdharbor:health-intelligence-changed',patchCurrentDom);
  const timer=root.setInterval?.(()=>{patchCurrentDom();if(root.HerdHarborApp&&root.HerdHarborSpreadsheet&&root.HerdHarborSpeciesContext)root.clearInterval?.(timer)},150);
  patchCurrentDom();
}

const API=Object.freeze({VERSION,currentAnimal,canonicalSpecies,activeAnimals,quarantineIds,validateParents,validateBreeding,snapshotGroupAnimalIds,deleteDependencies,combinedWeightGrams,healthRecordCount,legacyUrgency,displayUrgency,addHealthIntelligenceSheets,install});
if(root?.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',install,{once:true});else install()}
return API;
});