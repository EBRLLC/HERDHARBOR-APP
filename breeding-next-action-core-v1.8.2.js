(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.HerdHarborBreedingNextActionCore=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";

  const VERSION="1.8.2";
  const TERMINAL_BREEDING=new Set(["not pregnant","cancelled","canceled"]);
  const TERMINAL_ANIMAL=new Set(["sold","deceased","archived","ancestor only"]);
  const ACTIVE_SALE_STATUSES=new Set(["Draft","Reserved","Pending","Completed"]);
  const RABBIT_DEFAULTS=Object.freeze({pregnancyCheckDay:12,gestationDay:31});

  const clean=value=>String(value==null?"":value).trim();
  const lower=value=>clean(value).toLowerCase();
  const array=(value,key)=>Array.isArray(value?.[key])?value[key]:[];
  const unique=values=>[...new Set((Array.isArray(values)?values:[]).map(String).filter(Boolean))];
  const dateOnly=value=>clean(value).slice(0,10);

  function parseDate(value){
    const raw=dateOnly(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return null;
    const date=new Date(`${raw}T12:00:00Z`);return Number.isNaN(date.getTime())?null:date;
  }
  function addDays(value,days){const date=parseDate(value);if(!date)return"";date.setUTCDate(date.getUTCDate()+Number(days||0));return date.toISOString().slice(0,10);}
  function dayDelta(from,to){const a=parseDate(from),b=parseDate(to);if(!a||!b)return null;return Math.round((b-a)/86400000);}
  function todayValue(value){return dateOnly(value)||new Date().toISOString().slice(0,10);}

  function animalById(state,id){return array(state,"animals").find(row=>String(row.id)===String(id))||null;}
  function animalName(state,id){return animalById(state,id)?.name||"Animal";}
  function breedingById(state,id){return array(state,"breedings").find(row=>String(row.id)===String(id))||null;}
  function linkedLitter(state,breeding){return array(state,"litters").find(row=>String(row.breedingId||"")===String(breeding?.id||""))||null;}
  function offspringForLitter(state,litterOrId){
    const litter=typeof litterOrId==="object"?litterOrId:array(state,"litters").find(row=>String(row.id)===String(litterOrId));
    if(!litter)return[];const ids=new Set(array(litter,"offspringIds").map(String));
    return array(state,"animals").filter(animal=>ids.has(String(animal.id))||String(animal.sourceBirthId||"")===String(litter.id));
  }
  function liveAvailable(litter={}){return Math.max(0,Number(litter.bornAlive||0)+Number(litter.fosteredIn||0)-Number(litter.fosteredOut||0)-Number(litter.lostBeforeWeaning||0));}
  function speciesForBreeding(state,breeding){return lower(animalById(state,breeding?.femaleId)?.species||animalById(state,breeding?.maleId)?.species);}
  function speciesDefaults(species){return lower(species)==="rabbit"?RABBIT_DEFAULTS:null;}

  function derivedPregnancyCheckDate(state,breeding){
    const explicit=dateOnly(breeding?.pregnancyCheckDate);if(explicit)return explicit;
    const defaults=speciesDefaults(speciesForBreeding(state,breeding));
    return defaults&&breeding?.breedingDate?addDays(breeding.breedingDate,defaults.pregnancyCheckDay):"";
  }
  function derivedDueDate(state,breeding){
    const explicit=dateOnly(breeding?.dueDate);if(explicit)return explicit;
    const defaults=speciesDefaults(speciesForBreeding(state,breeding));
    return defaults&&breeding?.breedingDate?addDays(breeding.breedingDate,defaults.gestationDay):"";
  }

  function saleContainsAnimal(sale,animalId){return array(sale,"items").some(item=>String(item.animalId)===String(animalId));}
  function activeSaleForAnimal(state,animalId){return array(state,"sales").find(sale=>ACTIVE_SALE_STATUSES.has(clean(sale.status))&&saleContainsAnimal(sale,animalId))||null;}
  function transferForSale(state,sale){
    const saleNumber=clean(sale?.saleNumber),ids=new Set(array(sale,"items").map(item=>String(item.animalId)));
    return array(state,"transfers").find(row=>{
      if(saleNumber&&clean(row.sourceSaleNumber)===saleNumber)return true;
      const transferred=new Set(array(row,"animalIds").map(String));
      return ids.size>0&&[...ids].every(id=>transferred.has(id));
    })||null;
  }
  function salesForLitter(state,litter){
    const offspringIds=new Set(offspringForLitter(state,litter).map(animal=>String(animal.id)));
    return array(state,"sales").filter(sale=>String(sale.sourceLitterId||"")===String(litter?.id||"")||array(sale,"items").some(item=>offspringIds.has(String(item.animalId))));
  }

  function urgencyForDelta(delta){if(delta==null)return"normal";if(delta<0)return"overdue";if(delta===0)return"today";if(delta<=3)return"soon";return"upcoming";}
  function deltaLabel(noun,delta){
    if(delta==null)return noun;
    if(delta<0)return`${noun} ${Math.abs(delta)} day${Math.abs(delta)===1?"":"s"} overdue`;
    if(delta===0)return`${noun} today`;
    if(delta===1)return`${noun} tomorrow`;
    return`${noun} in ${delta} days`;
  }
  function action(base){return Object.freeze({urgency:"normal",dueDate:"",actionable:true,...base});}

  function evaluationComplete(state,litter){
    const living=offspringForLitter(state,litter).filter(animal=>lower(animal.status)!=="deceased");
    if(!living.length)return true;
    const evaluated=new Set(array(litter,"nextActionEvaluatedIds").map(String));
    return living.every(animal=>TERMINAL_ANIMAL.has(lower(animal.status))||evaluated.has(String(animal.id)));
  }

  function litterNextAction(state,litter,today=todayValue()){
    if(!litter)return null;
    const offspring=offspringForLitter(state,litter),available=liveAvailable(litter),weaned=Math.max(0,Number(litter.weaned||0));
    const subjectAnimalId=clean(litter.damId)||clean(litter.sireId);
    if(available>0&&weaned<available){
      const expected=dateOnly(litter.expectedWeanDate);const delta=expected?dayDelta(today,expected):null;
      if(expected&&delta<=0)return action({kind:"wean-litter",label:deltaLabel("Weaning due",delta),shortLabel:"Wean litter",urgency:urgencyForDelta(delta),dueDate:expected,litterId:litter.id,breedingId:litter.breedingId,animalId:subjectAnimalId,tab:"weaning",reason:`${weaned} of ${available} living offspring are weaned.`});
      const unidentified=offspring.filter(animal=>lower(animal.status)!=="deceased"&&(lower(animal.sex)==="unknown"||(!clean(animal.tag)&&!clean(animal.tattoo))));
      if(unidentified.length)return action({kind:"update-offspring",label:`Update offspring details (${unidentified.length})`,shortLabel:"Update offspring",litterId:litter.id,breedingId:litter.breedingId,animalId:subjectAnimalId,tab:"offspring",reason:"Sex and permanent ID can be entered for the litter from one screen."});
      return action({kind:"manage-litter",label:expected?deltaLabel("Weaning",delta):"Manage litter",shortLabel:"Manage litter",urgency:urgencyForDelta(delta),dueDate:expected,litterId:litter.id,breedingId:litter.breedingId,animalId:subjectAnimalId,tab:"offspring",reason:`${available} living offspring remain in the litter workflow.`});
    }

    if(!evaluationComplete(state,litter))return action({kind:"evaluate-litter",label:"Evaluate offspring",shortLabel:"Evaluate offspring",litterId:litter.id,breedingId:litter.breedingId,animalId:subjectAnimalId,tab:"decisions",reason:"Weaning is complete. Decide which offspring are retained, for sale, or reserved."});

    const sales=salesForLitter(state,litter);
    const completedReady=sales.find(sale=>clean(sale.status)==="Completed"&&!transferForSale(state,sale));
    if(completedReady)return action({kind:"transfer-buyer",label:"Transfer sold offspring",shortLabel:"Send to buyer",litterId:litter.id,breedingId:litter.breedingId,animalId:subjectAnimalId,saleId:completedReady.id,tab:"sale",reason:"The sale is complete and is ready for HerdHarbor member transfer."});

    const saleReady=offspring.filter(animal=>["for sale","reserved"].includes(lower(animal.status))&&!activeSaleForAnimal(state,animal.id));
    if(saleReady.length)return action({kind:"create-sale",label:`Create buyer sale (${saleReady.length})`,shortLabel:"Create buyer sale",litterId:litter.id,breedingId:litter.breedingId,animalId:subjectAnimalId,tab:"sale",reason:"Sale-ready offspring can be assigned to a buyer without re-entering their records."});

    return action({kind:"lifecycle-complete",label:"Litter workflow complete",shortLabel:"View litter",actionable:false,litterId:litter.id,breedingId:litter.breedingId,animalId:subjectAnimalId,tab:"offspring",reason:"No outstanding litter workflow action is detected."});
  }

  function breedingNextAction(state,breeding,today=todayValue()){
    if(!breeding)return null;
    const litter=linkedLitter(state,breeding);if(litter)return litterNextAction(state,litter,today);
    const status=lower(breeding.status||"Bred"),check=lower(breeding.pregnancyCheckStatus||"Not checked"),animalId=clean(breeding.femaleId)||clean(breeding.maleId);
    if(TERMINAL_BREEDING.has(status)||check==="negative")return action({kind:"plan-rebreed",label:"Plan rebreed",shortLabel:"Plan rebreed",animalId,breedingId:breeding.id,reason:"This breeding is closed without a pregnancy."});
    if(status==="planned")return action({kind:"open-breeding",label:"Record breeding",shortLabel:"Record breeding",animalId,breedingId:breeding.id,reason:"The pairing is planned but has not been recorded as bred."});
    if(status==="delivered")return action({kind:"record-birth",label:"Record birth",shortLabel:"Record birth",urgency:"today",animalId,breedingId:breeding.id,reason:"The breeding is marked delivered but no birth/litter record is linked yet."});

    const dueDate=derivedDueDate(state,breeding),dueDelta=dueDate?dayDelta(today,dueDate):null;
    if(status==="confirmed pregnant"||check==="positive"){
      if(dueDate&&dueDelta<=0)return action({kind:"record-birth",label:deltaLabel("Birth due",dueDelta),shortLabel:"Record birth",urgency:urgencyForDelta(dueDelta),dueDate,animalId,breedingId:breeding.id,reason:"Pregnancy is confirmed and the expected due date has arrived."});
      if(dueDate&&dueDelta<=3)return action({kind:"prepare-birth",label:deltaLabel("Birth expected",dueDelta),shortLabel:"Prepare for birth",urgency:urgencyForDelta(dueDelta),dueDate,animalId,breedingId:breeding.id,reason:"Pregnancy is confirmed and birth is approaching."});
      return action({kind:"open-breeding",label:dueDate?deltaLabel("Birth expected",dueDelta):"Pregnancy confirmed",shortLabel:"View breeding",urgency:urgencyForDelta(dueDelta),dueDate,animalId,breedingId:breeding.id,reason:"Pregnancy is confirmed. HerdHarbor is tracking the birth timeline."});
    }

    const checkDate=derivedPregnancyCheckDate(state,breeding),checkDelta=checkDate?dayDelta(today,checkDate):null;
    if(checkDate){
      if(checkDelta<=0)return action({kind:"pregnancy-check",label:deltaLabel("Pregnancy check",checkDelta),shortLabel:"Record pregnancy check",urgency:urgencyForDelta(checkDelta),dueDate:checkDate,animalId,breedingId:breeding.id,reason:speciesForBreeding(state,breeding)==="rabbit"&&!breeding.pregnancyCheckDate?"Rabbit check date derived as day 12 after breeding.":"Pregnancy check is due."});
      return action({kind:"open-breeding",label:deltaLabel("Pregnancy check",checkDelta),shortLabel:"View breeding",urgency:urgencyForDelta(checkDelta),dueDate:checkDate,animalId,breedingId:breeding.id,reason:"The next breeding milestone is the pregnancy check."});
    }
    return action({kind:"open-breeding",label:"Update breeding",shortLabel:"Update breeding",animalId,breedingId:breeding.id,reason:"Open the breeding record to continue the lifecycle."});
  }

  function latestBreedingForAnimal(state,animalId){
    return array(state,"breedings").filter(record=>String(record.femaleId)===String(animalId)||String(record.maleId)===String(animalId)).sort((a,b)=>String(b.breedingDate||b.createdAt||"").localeCompare(String(a.breedingDate||a.createdAt||"")))[0]||null;
  }
  function animalNextAction(state,animalId,today=todayValue()){
    const animal=animalById(state,animalId);if(!animal||TERMINAL_ANIMAL.has(lower(animal.status)))return null;
    const breeding=latestBreedingForAnimal(state,animalId);
    if(breeding){const next=breedingNextAction(state,breeding,today);if(next)return next;}
    if(["active","breeding","growing","retired"].includes(lower(animal.status)))return action({kind:"start-breeding",label:"Plan breeding",shortLabel:"Plan breeding",animalId:animal.id,reason:"No current breeding lifecycle is linked to this animal."});
    return null;
  }

  function dashboardActions(state={},today=todayValue(),horizonDays=14){
    const actions=[];const seen=new Set();
    array(state,"breedings").slice().sort((a,b)=>String(b.breedingDate||"").localeCompare(String(a.breedingDate||""))).forEach(breeding=>{
      const next=breedingNextAction(state,breeding,today);if(!next||!next.actionable)return;
      const key=next.litterId?`l:${next.litterId}`:`b:${breeding.id}`;if(seen.has(key))return;
      const delta=next.dueDate?dayDelta(today,next.dueDate):null;
      const immediate=new Set(["pregnancy-check","record-birth","wean-litter","evaluate-litter","create-sale","transfer-buyer","update-offspring"]);
      if(delta!=null&&delta>horizonDays&&!immediate.has(next.kind))return;
      if(delta==null&&!immediate.has(next.kind))return;
      seen.add(key);actions.push({...next,animalName:animalName(state,next.animalId),sortDelta:delta==null?999:delta});
    });
    return actions.sort((a,b)=>a.sortDelta-b.sortDelta||String(a.label).localeCompare(String(b.label)));
  }

  function markEvaluated(state={},litterId,animalIds=[]){
    const selected=unique(animalIds);if(!selected.length)return state;
    return{...state,litters:array(state,"litters").map(litter=>String(litter.id)!==String(litterId)?litter:{...litter,nextActionEvaluatedIds:unique([...array(litter,"nextActionEvaluatedIds"),...selected])})};
  }

  return Object.freeze({VERSION,RABBIT_DEFAULTS,addDays,dayDelta,derivedPregnancyCheckDate,derivedDueDate,linkedLitter,offspringForLitter,liveAvailable,evaluationComplete,litterNextAction,breedingNextAction,latestBreedingForAnimal,animalNextAction,dashboardActions,markEvaluated});
});