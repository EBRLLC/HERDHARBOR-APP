(function(root,factory){
  const api=factory(root||{});
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.HerdHarborWorkflowEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';

const VERSION='1.7.5';
const STORAGE_KEY='herdharbor_pre_alpha_v1';
const CONTRACT=Object.freeze({
  id:'HH-WORKFLOW-ENGINE-001',
  version:VERSION,
  hardlocked:true,
  principles:Object.freeze([
    'animal-first-operational-context',
    'active-species-context',
    'canonical-records-are-source-of-truth',
    'event-driven-not-duplicate-data',
    'smart-defaults-never-silent-assumptions',
    'deterministic-derived-identifiers'
  ])
});
const INACTIVE=new Set(['sold','deceased','archived','ancestor only','ancestor-only','ancestor_only']);
const BREEDABLE_SPECIES=new Set(['rabbit','cattle','goat','sheep','swine','horse','dog','chicken','duck','turkey','poultry']);
const PRODUCTION_SPECIES=new Set(['rabbit','cattle','goat','sheep','swine','chicken','duck','turkey','poultry']);
const REVIEWED_RULES=Object.freeze({
  rabbit:Object.freeze({gestationDays:31,checkDays:14,prepareDaysBefore:3,weanDays:42,birthLabel:'kindling',prepareLabel:'Place nest box',source:'reviewed-existing-rule'}),
  cattle:Object.freeze({gestationDays:283,checkDays:30,prepareDaysBefore:14,weanDays:205,birthLabel:'calving',prepareLabel:'Prepare calving area',source:'reviewed-existing-rule'})
});
const STAGES=Object.freeze(['planned','bred','pregnancy-check','pregnant','not-pregnant','due','birth','weaning','complete','cancelled']);
const TRANSITIONS=Object.freeze({
  planned:Object.freeze(['bred','cancelled']),
  bred:Object.freeze(['pregnancy-check','pregnant','not-pregnant','due','birth','cancelled']),
  'pregnancy-check':Object.freeze(['pregnant','not-pregnant','due','birth','cancelled']),
  pregnant:Object.freeze(['due','birth','cancelled']),
  'not-pregnant':Object.freeze(['complete','cancelled']),
  due:Object.freeze(['birth','cancelled']),
  birth:Object.freeze(['weaning','complete']),
  weaning:Object.freeze(['complete']),
  complete:Object.freeze([]),
  cancelled:Object.freeze([])
});
const LEGACY_TO_STAGE=Object.freeze({
  planned:'planned',bred:'bred','pregnancy check due':'pregnancy-check','confirmed pregnant':'pregnant',confirmed:'pregnant','not pregnant':'not-pregnant','due soon':'due',delivered:'birth',completed:'complete',cancelled:'cancelled',canceled:'cancelled'
});
const STAGE_TO_LEGACY=Object.freeze({
  planned:'Planned',bred:'Bred','pregnancy-check':'Pregnancy check due',pregnant:'Confirmed pregnant','not-pregnant':'Not pregnant',due:'Due soon',birth:'Delivered',weaning:'Delivered',complete:'Delivered',cancelled:'Cancelled'
});

const clean=v=>String(v==null?'':v).trim();
const lower=v=>clean(v).toLowerCase();
const clone=value=>{if(value==null)return value;try{return typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value))}catch{return value}};
const isoDate=value=>{const s=clean(value);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:''};
const today=()=>new Date().toISOString().slice(0,10);
const dateKey=v=>clean(v).replace(/-/g,'');
const safeId=v=>clean(v).replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,'')||'record';
function addDays(dateString,days){const s=isoDate(dateString);if(!s)return'';const d=new Date(`${s}T12:00:00Z`);if(Number.isNaN(d.getTime()))return'';d.setUTCDate(d.getUTCDate()+Number(days||0));return d.toISOString().slice(0,10)}
function daysBetween(a,b){const x=isoDate(a),y=isoDate(b);if(!x||!y)return null;return Math.round((new Date(`${y}T12:00:00Z`)-new Date(`${x}T12:00:00Z`))/86400000)}
function readState(){try{const live=root.HerdHarborApp?.getState?.();if(live&&typeof live==='object')return live}catch{}try{return JSON.parse(root.localStorage?.getItem(STORAGE_KEY)||'{}')||{}}catch{return{}}}
function commitState(next,message='Workflow updated.'){const app=root.HerdHarborApp;if(typeof app?.commitState==='function'){const ok=app.commitState(next,message);if(ok===false)throw new Error('HerdHarbor could not save the workflow update.');return next}try{root.localStorage?.setItem(STORAGE_KEY,JSON.stringify(next))}catch{}return next}
function canonicalSpecies(value){const genetics=root.HerdHarborGeneticsPlatform;if(typeof genetics?.canonicalSpecies==='function'){try{const result=genetics.canonicalSpecies(value);if(result)return lower(result)}catch{}}const health=root.HerdHarborHealthIntelligence;if(typeof health?.canonicalSpecies==='function'){try{const result=health.canonicalSpecies(value);if(result)return lower(result)}catch{}}const s=lower(value);return({rabbits:'rabbit',bunny:'rabbit',bunnies:'rabbit',cow:'cattle',cows:'cattle',bovine:'cattle',goats:'goat',pigs:'swine',pig:'swine',hogs:'swine',hog:'swine',horses:'horse',dogs:'dog',chickens:'chicken',hens:'chicken',roosters:'chicken',rooster:'chicken',ducks:'duck',turkeys:'turkey'}[s]||s.replace(/s$/,''))}
function isActiveAnimal(animal){const context=root.HerdHarborSpeciesContext;if(typeof context?.isCurrentAnimal==='function'){try{return !!context.isCurrentAnimal(animal)}catch{}}if(typeof context?.isActiveAnimal==='function'){try{return !!context.isActiveAnimal(animal)}catch{}}return !!animal&&!INACTIVE.has(lower(animal.status))}
function animals(state=readState()){return Array.isArray(state.animals)?state.animals:[]}
function currentAnimals(state=readState()){return animals(state).filter(isActiveAnimal)}
function activeSpecies(state=readState()){const context=root.HerdHarborSpeciesContext;if(typeof context?.currentSpecies==='function'){try{return [...new Set(context.currentSpecies(state,{canonicalize:canonicalSpecies}).map(canonicalSpecies).filter(Boolean))].sort()}catch{}}return [...new Set(currentAnimals(state).map(a=>canonicalSpecies(a.species)).filter(Boolean))].sort()}
function animalById(state,id){return animals(state).find(a=>String(a.id)===String(id))||null}
function animalName(state,id){const a=animalById(state,id);return a?.name||a?.tag||a?.tattoo||'Unknown animal'}
function collections(state,names){const out=[];for(const name of names){if(Array.isArray(state?.[name]))out.push(...state[name].map(row=>({row,collection:name})))}return out}
function healthState(state=readState()){const h=state.healthIntelligence&&typeof state.healthIntelligence==='object'?state.healthIntelligence:{};return{episodes:Array.isArray(h.episodes)?h.episodes:[],careRecords:Array.isArray(h.careRecords)?h.careRecords:[],groupRecords:Array.isArray(h.groupRecords)?h.groupRecords:[]}}
function openHealthEpisodes(state,animalId){return healthState(state).episodes.filter(e=>String(e.animalId)===String(animalId)&&!e.resolved)}
function quarantined(state,animalId){return openHealthEpisodes(state,animalId).some(e=>!!e.quarantined)}
function breedingRecords(state){return collections(state,['breedings','breedingRecords']).map(x=>x.row)}
function birthRecords(state){const rows=collections(state,['litters','births','birthRecords']).map(x=>x.row);const seen=new Set();return rows.filter(r=>{const id=String(r?.id||'');if(id&&seen.has(id))return false;if(id)seen.add(id);return true})}
function breedingInvolves(record,animalId){return [record?.femaleId,record?.maleId,record?.damId,record?.sireId].some(id=>String(id||'')===String(animalId))}
function activeBreedingForAnimal(state,animalId){return breedingRecords(state).find(r=>breedingInvolves(r,animalId)&&!['complete','cancelled','not-pregnant'].includes(normalizeStage(r)))||null}
function geneticsAvailable(animal){if(!animal)return false;const platform=root.HerdHarborGeneticsPlatform;if(typeof platform?.getAdapter==='function'){try{return !!platform.getAdapter(canonicalSpecies(animal.species))||!!platform.getAdapter(animal.species)}catch{}}return ['rabbit','cattle','goat','sheep','swine','poultry','chicken','duck','turkey'].includes(canonicalSpecies(animal.species))}
function hasShowHistory(state,animalId){return (state.showEntries||[]).some(e=>String(e.animalId)===String(animalId))||(state.showAwards||[]).some(e=>String(e.animalId)===String(animalId))}
function hasProductionHistory(state,animalId){return collections(state,['production','productionRecords','milkRecords','eggRecords']).some(({row})=>String(row?.animalId)===String(animalId))}
function hasPedigree(animal){return !!(animal?.sireId||animal?.damId||animal?.sireName||animal?.damName)}
function animalContext(animalId,state=readState()){
  const animal=animalById(state,animalId);if(!animal)return null;
  const species=canonicalSpecies(animal.species),episodes=openHealthEpisodes(state,animalId),breeding=activeBreedingForAnimal(state,animalId);
  return Object.freeze({animal,species,active:isActiveAnimal(animal),quarantined:episodes.some(e=>e.quarantined),openHealthEpisodes:episodes,activeBreeding:breeding,breedingStage:breeding?normalizeStage(breeding):'',geneticsAvailable:geneticsAvailable(animal),hasPedigree:hasPedigree(animal),hasShowHistory:hasShowHistory(state,animalId),hasProductionHistory:hasProductionHistory(state,animalId)});
}
function profileTabs(animalId,state=readState()){
  const c=animalContext(animalId,state);if(!c)return[];
  const tabs=[{id:'overview',label:'Overview',visible:true},{id:'health',label:'Health',visible:true},{id:'breeding',label:'Breeding',visible:BREEDABLE_SPECIES.has(c.species)||breedingRecords(state).some(r=>breedingInvolves(r,animalId))},{id:'genetics',label:'Genetics',visible:c.geneticsAvailable},{id:'pedigree',label:'Pedigree',visible:c.hasPedigree||BREEDABLE_SPECIES.has(c.species)},{id:'shows',label:'Shows',visible:c.hasShowHistory||c.species==='rabbit'},{id:'production',label:'Production',visible:c.hasProductionHistory||PRODUCTION_SPECIES.has(c.species)},{id:'history',label:'History',visible:true}];
  return tabs.filter(t=>t.visible).map(({visible,...t})=>t);
}
function sexRole(animal){const s=lower(animal?.sex);if(/female|doe|cow|heifer|ewe|sow|gilt|mare|hen|dam/.test(s))return'female';if(/male|buck|bull|ram|boar|stallion|rooster|cock|sire/.test(s))return'male';return''}
function action(id,label,enabled,reason,route,defaults={}){return{id,label,enabled:enabled!==false,reason:enabled===false?reason||'Unavailable':'',route,defaults}}
function animalActions(animalId,state=readState()){
  const c=animalContext(animalId,state);if(!c)return[];const a=c.animal,role=sexRole(a);
  const canBreed=c.active&&BREEDABLE_SPECIES.has(c.species)&&!c.quarantined;
  return[
    action('add-weight','Add Weight',c.active,'Historical animals are read-only for daily operations.','health',{animalId:a.id,species:a.species,type:'Weight'}),
    action('add-health','Add Health Record',c.active,'Historical animals are read-only for daily operations.','health',{animalId:a.id,species:a.species}),
    action('start-health-episode','Start Health Episode',c.active,'Historical animals are read-only for daily operations.','health',{animalId:a.id,species:a.species}),
    action('breed','Breed',canBreed,c.quarantined?'Breeding is blocked while this animal is quarantined.':!c.active?'Historical animals cannot start a new breeding.':!BREEDABLE_SPECIES.has(c.species)?'Breeding workflow is not enabled for this species.':'','breeding',{animalId:a.id,species:a.species,...(role==='female'?{femaleId:a.id}:role==='male'?{maleId:a.id}:{})}),
    action('view-genetics','View Genetics',c.geneticsAvailable,'No genetics adapter is available for this species.','genetics',{animalId:a.id,species:a.species}),
    action('view-pedigree','View Pedigree',true,'','pedigree',{animalId:a.id}),
    action('add-show-result','Add Show Result',c.active,'Historical animals cannot receive a new operational show entry.','shows',{animalId:a.id,species:a.species}),
    action('record-production','Record Production',c.active&&PRODUCTION_SPECIES.has(c.species),'Production recording is not enabled for this animal/species.','production',{animalId:a.id,species:a.species}),
    action('mark-sold-transferred',c.active?'Mark Sold / Transferred':'View Disposition',c.active,'Animal is already historical/inactive.','animals',{animalId:a.id})
  ];
}
function animalProfileModel(animalId,state=readState()){const context=animalContext(animalId,state);if(!context)return null;return{version:VERSION,context,tabs:profileTabs(animalId,state),actions:animalActions(animalId,state),timeline:animalTimeline(animalId,state)}}

function normalizeStage(record={}){const explicit=lower(record.lifecycleStage||record.stage);if(STAGES.includes(explicit))return explicit;const legacy=lower(record.status);if(LEGACY_TO_STAGE[legacy]){if(LEGACY_TO_STAGE[legacy]==='birth'&&record.weaningCompleted)return'complete';return LEGACY_TO_STAGE[legacy]}if(record.birthDate||record.deliveryDate)return'birth';return'planned'}
function speciesRule(species){return REVIEWED_RULES[canonicalSpecies(species)]||null}
function breedingSpecies(record,state=readState()){const dam=animalById(state,record?.femaleId||record?.damId),sire=animalById(state,record?.maleId||record?.sireId);return canonicalSpecies(record?.species||dam?.species||sire?.species)}
function breedingSchedule(record,state=readState()){
  const species=breedingSpecies(record,state),rule=speciesRule(species),breedingDate=isoDate(record?.breedingDate||record?.bredDate);
  const explicit={pregnancyCheckDate:isoDate(record?.pregnancyCheckDate),preparationDate:isoDate(record?.preparationDate||record?.nestBoxDate),dueDate:isoDate(record?.dueDate||record?.expectedBirthDate),expectedWeanDate:isoDate(record?.expectedWeanDate)};
  if(!rule||!breedingDate)return{species,rule:null,...explicit,sources:Object.fromEntries(Object.entries(explicit).filter(([,v])=>v).map(([k])=>[k,'entered']))};
  const pregnancyCheckDate=explicit.pregnancyCheckDate||addDays(breedingDate,rule.checkDays),dueDate=explicit.dueDate||addDays(breedingDate,rule.gestationDays),preparationDate=explicit.preparationDate||(dueDate?addDays(dueDate,-rule.prepareDaysBefore):''),expectedWeanDate=explicit.expectedWeanDate;
  return{species,rule,pregnancyCheckDate,preparationDate,dueDate,expectedWeanDate,sources:{pregnancyCheckDate:explicit.pregnancyCheckDate?'entered':rule.source,preparationDate:explicit.preparationDate?'entered':rule.source,dueDate:explicit.dueDate?'entered':rule.source,...(expectedWeanDate?{expectedWeanDate:'entered'}:{})}};
}
function normalizeBreedingLifecycle(record,state=readState()){const schedule=breedingSchedule(record,state);return{...clone(record),lifecycleStage:normalizeStage(record),species:schedule.species,schedule,allowedTransitions:[...(TRANSITIONS[normalizeStage(record)]||[])]}}
function transitionBreeding(state,breedingId,target,payload={}){
  const next=clone(state)||{},rows=Array.isArray(next.breedings)?next.breedings:Array.isArray(next.breedingRecords)?next.breedingRecords:null;if(!rows)throw new Error('No breeding collection exists in this farm state.');
  const record=rows.find(r=>String(r.id)===String(breedingId));if(!record)throw new Error('Breeding record not found.');const from=normalizeStage(record),to=lower(target);if(!STAGES.includes(to))throw new Error(`Unknown breeding lifecycle stage: ${target}`);if(from!==to&&!TRANSITIONS[from]?.includes(to))throw new Error(`Breeding cannot move from ${from} to ${to}.`);
  Object.assign(record,clone(payload)||{}, {lifecycleStage:to,status:STAGE_TO_LEGACY[to]||record.status,updatedAt:new Date().toISOString()});
  if(to==='pregnant'&&!record.pregnancyCheckStatus)record.pregnancyCheckStatus='Positive';if(to==='not-pregnant'&&!record.pregnancyCheckStatus)record.pregnancyCheckStatus='Negative';if(to==='birth'&&!record.deliveryDate&&payload.birthDate)record.deliveryDate=payload.birthDate;
  return{state:next,record:normalizeBreedingLifecycle(record,next),from,to};
}
function birthRecordIdForBreeding(id){return`litter_breeding_${safeId(id)}`}
function birthDefaultsFromBreeding(breeding,state=readState(),overrides={}){
  if(!breeding)return{};const schedule=breedingSchedule(breeding,state),damId=breeding.femaleId||breeding.damId||'',sireId=breeding.maleId||breeding.sireId||'',birthDate=isoDate(overrides.birthDate||breeding.birthDate||breeding.deliveryDate),rule=schedule.rule;
  const inherited={id:birthRecordIdForBreeding(breeding.id),breedingId:breeding.id,sourceBreedingId:breeding.id,damId,sireId,species:schedule.species,breedingDate:breeding.breedingDate||breeding.bredDate||'',expectedBirthDate:schedule.dueDate||'',birthDate,expectedWeanDate:isoDate(breeding.expectedWeanDate)||(birthDate&&rule?addDays(birthDate,rule.weanDays):'')};
  for(const key of ['predictionSnapshot','geneticsSnapshot','expectedGenetics','pairingSnapshot'])if(breeding[key]!=null)inherited[key]=clone(breeding[key]);
  return{...inherited,...clone(overrides)};
}
function offspringDefaultsFromBirth(birth,state=readState(),index=1,overrides={}){if(!birth)return{};const breedingId=birth.breedingId||birth.sourceBreedingId||'',species=canonicalSpecies(birth.species||animalById(state,birth.damId)?.species||animalById(state,birth.sireId)?.species);return{id:`animal_offspring_${safeId(birth.id)}_${String(Math.max(1,Number(index)||1)).padStart(3,'0')}`,species,damId:birth.damId||'',sireId:birth.sireId||'',sourceBirthId:birth.id||'',sourceBreedingId:breedingId,birthDate:birth.birthDate||'',...clone(overrides)}}
function birthLiveRemaining(record){const alive=Number(record?.bornAlive||0)+Number(record?.fosteredIn||0)-Number(record?.fosteredOut||0)-Number(record?.lostBeforeWeaning||0);return Math.max(0,alive-Number(record?.weaned||0))}

function eventId(sourceType,sourceId,kind,date=''){return`workflow_${safeId(sourceType)}_${safeId(sourceId)}_${safeId(kind)}${date?`_${dateKey(date)}`:''}`}
function taskDedupKeys(state){const set=new Set();for(const task of state.tasks||[]){if(task.sourceType&&task.sourceRecordId&&task.reminderType)set.add(`${task.sourceType}|${task.sourceRecordId}|${task.reminderType}`)}return set}
function makeEvent({sourceType,sourceId,kind,date,title,category='General',animalId='',priority='normal',status='open',metadata={}}){return{id:eventId(sourceType,sourceId,kind,date),sourceType,sourceId:String(sourceId||''),kind,date:isoDate(date),title:clean(title)||kind,category,animalId:String(animalId||''),priority,status,metadata}}
function deriveEvents(state=readState(),options={}){
  const onDate=isoDate(options.onDate)||today(),events=[],dedup=new Set(),taskKeys=taskDedupKeys(state);
  const push=e=>{if(!e||!e.id||dedup.has(e.id))return;dedup.add(e.id);events.push(e)};
  for(const task of state.tasks||[]){if(task.completed)continue;const date=isoDate(task.dueDate);if(!date)continue;push(makeEvent({sourceType:'task',sourceId:task.id,kind:'task',date,title:task.title||'Farm task',category:task.category||'Task',animalId:task.animalId,priority:date<onDate?'high':'normal',metadata:{taskId:task.id,recurrence:task.recurrence||'None'}}))}
  const h=healthState(state);
  for(const ep of h.episodes){if(ep.resolved)continue;if(ep.recheckDate)push(makeEvent({sourceType:'health-episode',sourceId:ep.id,kind:'health-recheck',date:ep.recheckDate,title:`${animalName(state,ep.animalId)} health recheck`,category:'Health',animalId:ep.animalId,priority:'high'}));if(ep.quarantined)push(makeEvent({sourceType:'health-episode',sourceId:ep.id,kind:'quarantine-active',date:onDate,title:`${animalName(state,ep.animalId)} is in quarantine`,category:'Health',animalId:ep.animalId,priority:'high',metadata:{ongoing:true}}))}
  for(const care of h.careRecords){if(care.boosterDueDate)push(makeEvent({sourceType:'health-care',sourceId:care.id,kind:'booster',date:care.boosterDueDate,title:`${animalName(state,care.animalId)} booster / follow-up`,category:'Health',animalId:care.animalId,priority:'normal'}));for(const [label,key] of [['meat','meatWithdrawalEnd'],['milk','milkWithdrawalEnd'],['egg','eggWithdrawalEnd']]){const end=isoDate(care[key]);if(!end)continue;if(end>=onDate)push(makeEvent({sourceType:'health-care',sourceId:care.id,kind:`${label}-withdrawal-active`,date:onDate,title:`${animalName(state,care.animalId)} ${label} withdrawal active through ${end}`,category:'Health',animalId:care.animalId,priority:'high',metadata:{withdrawalEnd:end,ongoing:true}}));push(makeEvent({sourceType:'health-care',sourceId:care.id,kind:`${label}-withdrawal-end`,date:end,title:`${animalName(state,care.animalId)} ${label} withdrawal period ends`,category:'Health',animalId:care.animalId,priority:'normal'}))}}
  for(const group of h.groupRecords){if(group.followUpDate)push(makeEvent({sourceType:'health-group',sourceId:group.id,kind:'group-health-followup',date:group.followUpDate,title:`${clean(group.description)||canonicalSpecies(group.species)||'Group'} health follow-up`,category:'Health',priority:'normal',metadata:{animalIds:clone(group.animalIds||[])}}))}
  for(const breeding of breedingRecords(state)){
    const stage=normalizeStage(breeding);if(['birth','weaning','complete','cancelled','not-pregnant'].includes(stage))continue;const schedule=breedingSchedule(breeding,state),damId=breeding.femaleId||breeding.damId||'',name=animalName(state,damId),items=[['pregnancy-check',schedule.pregnancyCheckDate,`${name} pregnancy / breeding check`],['preparation',schedule.preparationDate,`${schedule.rule?.prepareLabel||'Birth preparation'} — ${name}`],['expected-birth',schedule.dueDate,`${name} expected ${schedule.rule?.birthLabel||'birth'}`]];for(const[kind,date,title]of items){if(!date||taskKeys.has(`breeding|${breeding.id}|${kind}`))continue;push(makeEvent({sourceType:'breeding',sourceId:breeding.id,kind,date,title,category:'Breeding',animalId:damId,priority:kind==='expected-birth'?'high':'normal',metadata:{dateSource:schedule.sources?.[kind==='pregnancy-check'?'pregnancyCheckDate':kind==='preparation'?'preparationDate':'dueDate']||'entered'}}))}}
  for(const birth of birthRecords(state)){const remain=birthLiveRemaining(birth),date=isoDate(birth.expectedWeanDate||birth.weanDate);if(remain>0&&date&&!taskKeys.has(`birth|${birth.id}|weaning`))push(makeEvent({sourceType:'birth',sourceId:birth.id,kind:'weaning',date,title:`${animalName(state,birth.damId)} offspring ready for weaning review`,category:'Breeding',animalId:birth.damId,priority:'normal',metadata:{remaining:remain}}))}
  for(const show of state.shows||[]){if(/archived|cancelled|canceled|complete/i.test(clean(show.status)))continue;const deadline=isoDate(show.entryDeadline||show.registrationDeadline||show.entriesDueDate);if(deadline)push(makeEvent({sourceType:'show',sourceId:show.id,kind:'show-deadline',date:deadline,title:`${show.name||'Show'} entry deadline`,category:'Shows',priority:'normal'}));const start=isoDate(show.startDate);if(start)push(makeEvent({sourceType:'show',sourceId:show.id,kind:'show-start',date:start,title:`${show.name||'Show'} starts`,category:'Shows',priority:'normal'}))}
  for(const goal of state.projectGoals||[]){if(lower(goal.status)==='completed')continue;const date=isoDate(goal.targetDate);if(date)push(makeEvent({sourceType:'project-goal',sourceId:goal.id,kind:'project-goal',date,title:goal.goal||'Project goal due',category:'Shows',priority:'normal'}))}
  return events.sort((a,b)=>a.date.localeCompare(b.date)||priorityRank(b.priority)-priorityRank(a.priority)||a.title.localeCompare(b.title));
}
function priorityRank(p){return({low:0,normal:1,high:2,critical:3}[p]||1)}
function todayQueue(state=readState(),options={}){const onDate=isoDate(options.onDate)||today(),upcomingDays=Math.max(0,Number(options.upcomingDays??7)),end=addDays(onDate,upcomingDays),events=deriveEvents(state,{...options,onDate});return{onDate,overdue:events.filter(e=>e.date<onDate),today:events.filter(e=>e.date===onDate),upcoming:events.filter(e=>e.date>onDate&&(!end||e.date<=end)),all:events}}

function suggestion({sourceType,sourceId,kind,date,title,category='General',animalId='',source='entered'}){return{id:eventId(sourceType,sourceId,`reminder-${kind}`,date),sourceType,sourceId:String(sourceId||''),kind,date:isoDate(date),title,category,animalId:String(animalId||''),source,requiresConfirmation:true,silent:false}}
function reminderSuggestions(recordType,record,state=readState()){
  const type=lower(recordType),out=[];if(!record)return out;
  if(type==='breeding'){
    const s=breedingSchedule(record,state),damId=record.femaleId||record.damId||'',name=animalName(state,damId);if(s.pregnancyCheckDate)out.push(suggestion({sourceType:'breeding',sourceId:record.id,kind:'pregnancy-check',date:s.pregnancyCheckDate,title:`${name} pregnancy / breeding check`,category:'Breeding',animalId:damId,source:s.sources?.pregnancyCheckDate}));if(s.preparationDate)out.push(suggestion({sourceType:'breeding',sourceId:record.id,kind:'preparation',date:s.preparationDate,title:`${s.rule?.prepareLabel||'Birth preparation'} — ${name}`,category:'Breeding',animalId:damId,source:s.sources?.preparationDate}));if(s.dueDate)out.push(suggestion({sourceType:'breeding',sourceId:record.id,kind:'expected-birth',date:s.dueDate,title:`${name} expected ${s.rule?.birthLabel||'birth'}`,category:'Breeding',animalId:damId,source:s.sources?.dueDate}));
  }else if(type==='health-episode'||type==='episode'){
    if(record.recheckDate)out.push(suggestion({sourceType:'health-episode',sourceId:record.id,kind:'health-recheck',date:record.recheckDate,title:`${animalName(state,record.animalId)} health recheck`,category:'Health',animalId:record.animalId,source:'entered'}));
  }else if(type==='health-care'||type==='care'||type==='vaccination'){
    if(record.boosterDueDate)out.push(suggestion({sourceType:'health-care',sourceId:record.id,kind:'booster',date:record.boosterDueDate,title:`${animalName(state,record.animalId)} booster / follow-up`,category:'Health',animalId:record.animalId,source:'entered'}));
  }else if(type==='health-group'||type==='group-health'){
    if(record.followUpDate)out.push(suggestion({sourceType:'health-group',sourceId:record.id,kind:'group-health-followup',date:record.followUpDate,title:`${clean(record.description)||'Group health'} follow-up`,category:'Health',source:'entered'}));
  }else if(type==='birth'||type==='litter'){
    if(record.expectedWeanDate&&birthLiveRemaining(record)>0)out.push(suggestion({sourceType:'birth',sourceId:record.id,kind:'weaning',date:record.expectedWeanDate,title:`${animalName(state,record.damId)} offspring weaning review`,category:'Breeding',animalId:record.damId,source:'entered'}));
  }
  return out.filter(x=>x.date);
}
function reminderTaskId(s){return`task_workflow_${safeId(s.sourceType)}_${safeId(s.sourceId)}_${safeId(s.kind)}_${dateKey(s.date)}`}
function acceptReminder(state,s){if(!s?.requiresConfirmation||s.silent!==false)throw new Error('Only explicit workflow reminder suggestions can be accepted.');const next=clone(state)||{};if(!Array.isArray(next.tasks))next.tasks=[];const id=reminderTaskId(s),existing=next.tasks.find(t=>t.id===id||(t.sourceType===s.sourceType&&String(t.sourceRecordId)===String(s.sourceId)&&t.reminderType===s.kind));if(existing)return{state:next,task:existing,created:false};const task={id,title:s.title||'HerdHarbor reminder',category:s.category||'General',dueDate:s.date,animalId:s.animalId||'',notes:'Created from a HerdHarbor workflow suggestion.',recurrence:'None',completed:false,sourceType:s.sourceType,sourceRecordId:s.sourceId,reminderType:s.kind,generatedBy:`workflow-engine-v${VERSION}`,createdAt:new Date().toISOString()};next.tasks.push(task);return{state:next,task,created:true}}
function saveReminder(s,state=readState()){const result=acceptReminder(state,s);if(result.created)commitState(result.state,'Reminder added.');return result}

function latestWeightUnit(state,animalId){const rows=(state.health||[]).filter(r=>String(r.animalId)===String(animalId)&&lower(r.type)==='weight'&&r.date).sort((a,b)=>String(b.date).localeCompare(String(a.date)));return clean(rows[0]?.weightUnit)}
function smartDefaults(context={},state=readState()){
  const c=typeof context==='string'?{surface:context}:context||{},animal=animalById(state,c.animalId),defaults={};if(animal){defaults.animalId=animal.id;defaults.species=animal.species;const unit=latestWeightUnit(state,animal.id);if(lower(c.kind||c.type).includes('weight')&&unit)defaults.weightUnit=unit;const role=sexRole(animal);if(lower(c.kind||c.type).includes('breed')){if(role==='female')defaults.femaleId=animal.id;if(role==='male')defaults.maleId=animal.id}}
  if(c.breedingId){const b=breedingRecords(state).find(x=>String(x.id)===String(c.breedingId));if(b)Object.assign(defaults,birthDefaultsFromBreeding(b,state))}
  if(c.birthId||c.litterId){const id=c.birthId||c.litterId,b=birthRecords(state).find(x=>String(x.id)===String(id));if(b)Object.assign(defaults,offspringDefaultsFromBirth(b,state,c.offspringIndex||1))}
  return defaults;
}
function quickAdd(context={},state=readState()){
  const c=typeof context==='string'?{surface:context}:context||{},surface=lower(c.surface||c.context||'');
  if(surface==='animal'||c.animalId){const acts=animalActions(c.animalId,state);return acts.filter(a=>['add-weight','add-health','start-health-episode','breed','add-show-result','record-production'].includes(a.id)).map(a=>({...a,defaults:{...a.defaults,...smartDefaults({animalId:c.animalId,kind:a.id},state)}}))}
  if(surface==='litter'||surface==='birth')return[{id:'add-offspring',label:'Add Offspring',enabled:true,route:'animals',defaults:smartDefaults({birthId:c.birthId||c.litterId,offspringIndex:c.offspringIndex||1},state)},{id:'record-weaning',label:'Record Weaning',enabled:true,route:'breeding',defaults:{birthId:c.birthId||c.litterId}},{id:'record-loss',label:'Record Loss',enabled:true,route:'breeding',defaults:{birthId:c.birthId||c.litterId}}];
  if(surface==='health')return[{id:'start-health-episode',label:'Start Episode',enabled:true,route:'health',defaults:{}},{id:'treatment',label:'Treatment',enabled:true,route:'health',defaults:{type:'Treatment'}},{id:'vaccination',label:'Vaccination',enabled:true,route:'health',defaults:{type:'Vaccination'}},{id:'group-treatment',label:'Group Treatment',enabled:true,route:'health',defaults:{type:'Treatment'}}];
  if(surface==='location')return[{id:'move-animals',label:'Move Animals',enabled:true,route:'locations',defaults:{locationId:c.locationId||''}},{id:'group-health',label:'Group Health Record',enabled:true,route:'health',defaults:{locationId:c.locationId||''}}];return[];
}

function searchableText(...values){return values.flat(Infinity).filter(v=>v!=null&&typeof v!=='object').map(lower).join(' ')}
function universalSearch(state=readState(),query='',options={}){
  const q=lower(query);if(!q)return[];const limit=Math.max(1,Math.min(100,Number(options.limit||20))),results=[],add=(type,id,label,subtitle,route,haystack,score=1)=>{if(!id||!searchableText(label,subtitle,haystack).includes(q))return;const labelText=lower(label),rank=labelText===q?100:labelText.startsWith(q)?50:score;results.push({type,id:String(id),label:clean(label)||String(id),subtitle:clean(subtitle),route,score:rank})};
  for(const a of animals(state))add('animal',a.id,a.name||a.tag||a.tattoo||'Animal',[a.species,a.breed,a.status].filter(Boolean).join(' · '),'animals',searchableText(a.tag,a.tattoo,a.earTag,a.registrationNumber,a.microchip),20);
  for(const c of state.customers||[])add('customer',c.id,c.name||[c.firstName,c.lastName].filter(Boolean).join(' ')||'Customer',c.email||c.phone||'','customers',searchableText(c.email,c.phone,c.address),10);
  for(const b of breedingRecords(state))add('breeding',b.id,`${animalName(state,b.femaleId||b.damId)} × ${animalName(state,b.maleId||b.sireId)}`,b.status||normalizeStage(b),'breeding',searchableText(b.id,b.notes,b.species),10);
  for(const b of birthRecords(state))add('litter',b.id,b.name||`${animalName(state,b.damId)} offspring`,b.birthDate||b.expectedBirthDate||'','breeding',searchableText(b.id,b.species,b.notes),10);
  const h=healthState(state);for(const r of h.careRecords)add('health-care',r.id,r.product||r.type||'Health care',`${animalName(state,r.animalId)} · ${r.date||''}`,'health',searchableText(r.reason,r.lotNumber,r.notes),8);for(const e of h.episodes)add('health-episode',e.id,e.concern||'Health episode',`${animalName(state,e.animalId)} · ${e.startedDate||''}`,'health',searchableText(e.notes,e.species),8);
  for(const show of state.shows||[])add('show',show.id,show.name||'Show',[show.organization,show.startDate].filter(Boolean).join(' · '),'shows',searchableText(show.showType,show.location),8);
  for(const t of state.transactions||[])add('transaction',t.id,t.invoiceNumber||t.description||t.category||'Transaction',[t.date,t.amount].filter(Boolean).join(' · '),'finance',searchableText(t.customerName,t.vendor,t.notes,t.type),5);
  for(const loc of state.locations||[])add('location',loc.id,loc.name||'Location',loc.type||'','locations',searchableText(loc.parentId,loc.notes),8);
  return results.sort((a,b)=>b.score-a.score||a.label.localeCompare(b.label)).slice(0,limit).map(({score,...r})=>r);
}
function timelinePush(out,event){if(!event?.date)return;out.push({...event,date:isoDate(event.date)||event.date})}
function animalTimeline(animalId,state=readState()){
  const out=[],a=animalById(state,animalId);if(!a)return out;if(a.birthDate)timelinePush(out,{id:`animal-${a.id}-born`,type:'Birth',date:a.birthDate,title:'Born',sourceType:'animal',sourceId:a.id});
  for(const r of state.health||[]){if(String(r.animalId)!==String(animalId)||!r.date)continue;timelinePush(out,{id:`health-${r.id}`,type:lower(r.type)==='weight'?'Weight':'Health',date:r.date,title:lower(r.type)==='weight'?`Weight ${r.weight??''} ${r.weightUnit||''}`.trim():r.type||'Health record',sourceType:'health',sourceId:r.id})}
  const h=healthState(state);for(const e of h.episodes){if(String(e.animalId)!==String(animalId))continue;timelinePush(out,{id:`episode-${e.id}`,type:'Health',date:e.startedDate,title:e.concern||'Health episode',sourceType:'health-episode',sourceId:e.id})}for(const r of h.careRecords){if(String(r.animalId)!==String(animalId))continue;timelinePush(out,{id:`care-${r.id}`,type:'Health',date:r.date,title:[r.type,r.product].filter(Boolean).join(' · ')||'Care record',sourceType:'health-care',sourceId:r.id})}
  for(const b of breedingRecords(state)){if(!breedingInvolves(b,animalId))continue;timelinePush(out,{id:`breeding-${b.id}`,type:'Breeding',date:b.breedingDate||b.createdAt?.slice(0,10),title:`Breeding · ${b.status||normalizeStage(b)}`,sourceType:'breeding',sourceId:b.id})}
  for(const birth of birthRecords(state)){const involved=[birth.damId,birth.sireId,...(birth.offspringIds||[])].some(id=>String(id||'')===String(animalId));if(!involved)continue;timelinePush(out,{id:`birth-${birth.id}`,type:'Birth',date:birth.birthDate||birth.expectedBirthDate,title:'Birth / litter record',sourceType:'birth',sourceId:birth.id})}
  const entries=(state.showEntries||[]).filter(e=>String(e.animalId)===String(animalId));for(const entry of entries){const show=(state.shows||[]).find(s=>String(s.id)===String(entry.showId)),result=(state.showResults||[]).find(r=>String(r.entryId)===String(entry.id));timelinePush(out,{id:`show-${entry.id}`,type:'Show',date:show?.startDate,title:[show?.name,entry.className,result?.customPlacement||result?.placement].filter(Boolean).join(' · ')||'Show entry',sourceType:'show-entry',sourceId:entry.id})}
  for(const {row} of collections(state,['production','productionRecords','milkRecords','eggRecords'])){if(String(row.animalId)!==String(animalId))continue;timelinePush(out,{id:`production-${row.id}`,type:'Production',date:row.date,title:row.type||row.category||'Production record',sourceType:'production',sourceId:row.id})}
  for(const log of state.workflowEngine?.activityLog||[]){if(String(log.animalId)!==String(animalId))continue;timelinePush(out,{id:`workflow-${log.id}`,type:log.type||'History',date:log.date,title:log.title||log.type||'Activity',sourceType:'workflow-activity',sourceId:log.id})}
  const dispositionDate=a.soldDate||a.transferDate||a.dispositionDate;if(dispositionDate)timelinePush(out,{id:`animal-${a.id}-disposition`,type:'Disposition',date:dispositionDate,title:a.status||'Sold / transferred',sourceType:'animal',sourceId:a.id});return out.sort((x,y)=>String(y.date).localeCompare(String(x.date))||x.title.localeCompare(y.title));
}

function normalizeLocation(input={}){return{id:clean(input.id)||`location_${Date.now().toString(36)}`,name:clean(input.name)||'Unnamed location',type:clean(input.type)||'Area',parentId:clean(input.parentId),notes:clean(input.notes),active:input.active!==false,createdAt:input.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()}}
function locationTree(state=readState()){const list=(state.locations||[]).map(normalizeLocation),byParent=new Map();for(const loc of list){const key=loc.parentId||'';if(!byParent.has(key))byParent.set(key,[]);byParent.get(key).push(loc)}const build=parent=>(byParent.get(parent)||[]).sort((a,b)=>a.name.localeCompare(b.name)).map(loc=>({...loc,children:build(loc.id)}));return build('')}
function animalsAtLocation(state=readState(),locationId,options={}){const ids=new Set([String(locationId)]);if(options.includeDescendants){const visit=parent=>{for(const loc of state.locations||[]){if(String(loc.parentId||'')===String(parent)&&!ids.has(String(loc.id))){ids.add(String(loc.id));visit(loc.id)}}};visit(locationId)}return (options.includeHistorical?animals(state):currentAnimals(state)).filter(a=>ids.has(String(a.locationId||'')))}
function moveAnimals(state,animalIds,locationId,options={}){const next=clone(state)||{},ids=new Set((animalIds||[]).map(String)),loc=(next.locations||[]).find(l=>String(l.id)===String(locationId));if(!loc)throw new Error('Destination location not found.');if(!next.workflowEngine||typeof next.workflowEngine!=='object')next.workflowEngine={schemaVersion:1,activityLog:[]};if(!Array.isArray(next.workflowEngine.activityLog))next.workflowEngine.activityLog=[];const date=isoDate(options.date)||today(),moved=[];for(const a of next.animals||[]){if(!ids.has(String(a.id))||!isActiveAnimal(a))continue;const from=a.locationId||'';a.locationId=loc.id;a.updatedAt=new Date().toISOString();moved.push(a.id);const id=`move_${safeId(a.id)}_${safeId(loc.id)}_${dateKey(date)}`;if(!next.workflowEngine.activityLog.some(x=>x.id===id))next.workflowEngine.activityLog.push({id,type:'Location',animalId:a.id,date,title:`Moved to ${loc.name}`,fromLocationId:from,toLocationId:loc.id,note:clean(options.note),createdAt:new Date().toISOString()})}return{state:next,moved}}

function install(){try{root.dispatchEvent?.(new CustomEvent('herdharbor:workflow-engine-ready',{detail:{version:VERSION,contract:CONTRACT.id}}))}catch{}return API}
const API=Object.freeze({VERSION,CONTRACT,STAGES,REVIEWED_RULES,readState,commitState,canonicalSpecies,isActiveAnimal,currentAnimals,activeSpecies,animalContext,profileTabs,animalActions,animalProfileModel,normalizeStage,normalizeBreedingLifecycle,breedingSchedule,transitionBreeding,birthRecordIdForBreeding,birthDefaultsFromBreeding,offspringDefaultsFromBirth,birthLiveRemaining,deriveEvents,todayQueue,reminderSuggestions,acceptReminder,saveReminder,smartDefaults,quickAdd,universalSearch,animalTimeline,normalizeLocation,locationTree,animalsAtLocation,moveAnimals,install});
if(root?.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',install,{once:true});else install()}
return API;
});
