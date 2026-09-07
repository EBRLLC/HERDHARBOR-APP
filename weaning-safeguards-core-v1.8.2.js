(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.HerdHarborWeaningSafeguardsCore=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";

  const VERSION="1.8.2";
  const DAY_MS=86400000;
  const DEFAULT_MINIMUM_DAYS=Object.freeze({
    rabbit:28
  });

  const clean=v=>String(v==null?"":v).trim();
  const lower=v=>clean(v).toLowerCase();
  const array=(value,key)=>Array.isArray(value?.[key])?value[key]:[];

  function dateOnly(value){
    const raw=clean(value).slice(0,10);
    return /^\d{4}-\d{2}-\d{2}$/.test(raw)?raw:"";
  }

  function parseDate(value){
    const raw=dateOnly(value);
    if(!raw)return null;
    const d=new Date(`${raw}T12:00:00Z`);
    return Number.isNaN(d.getTime())?null:d;
  }

  function addDays(value,days){
    const d=parseDate(value);
    if(!d)return"";
    d.setUTCDate(d.getUTCDate()+Number(days||0));
    return d.toISOString().slice(0,10);
  }

  function daysOld(dob,onDate){
    const start=parseDate(dob);
    const end=parseDate(onDate);
    if(!start||!end)return null;
    return Math.floor((end-start)/DAY_MS);
  }

  function defaultMinimumDays(species){
    return DEFAULT_MINIMUM_DAYS[lower(species)]||0;
  }

  function litterById(state,litterId){
    return array(state,"litters").find(row=>String(row.id)===String(litterId))||null;
  }

  function offspringForLitter(state,litterOrId){
    const litter=typeof litterOrId==="object"?litterOrId:litterById(state,litterOrId);
    if(!litter)return[];
    const ids=new Set(array(litter,"offspringIds").map(String));
    return array(state,"animals").filter(animal=>ids.has(String(animal.id))||String(animal.sourceBirthId||"")===String(litter.id));
  }

  function speciesForAnimal(state,litter,animal){
    if(clean(animal?.species))return clean(animal.species);
    const dam=array(state,"animals").find(row=>String(row.id)===String(litter?.damId));
    if(clean(dam?.species))return clean(dam.species);
    const sire=array(state,"animals").find(row=>String(row.id)===String(litter?.sireId));
    return clean(sire?.species);
  }

  function defaultUnlockDate(state,litter,animal){
    const species=speciesForAnimal(state,litter,animal);
    const days=defaultMinimumDays(species);
    if(!days)return"";
    const dob=dateOnly(animal?.dob)||dateOnly(litter?.birthDate);
    return dob?addDays(dob,days):"";
  }

  function effectiveUnlockDate(state,litter,animal){
    const custom=dateOnly(litter?.weanNotBeforeDate);
    const automatic=defaultUnlockDate(state,litter,animal);
    if(custom&&automatic)return custom>automatic?custom:automatic;
    return custom||automatic||"";
  }

  function weanEligibility(state,litterId,animalId,weanDate){
    const litter=litterById(state,litterId);
    const animal=offspringForLitter(state,litter).find(row=>String(row.id)===String(animalId));
    const date=dateOnly(weanDate);
    if(!litter||!animal)return{allowed:false,reason:"Offspring record not found.",unlockDate:"",ageDays:null};
    if(lower(animal.status)==="deceased")return{allowed:false,reason:"Deceased offspring cannot be marked weaned.",unlockDate:"",ageDays:null};
    if(clean(animal.weanedDate))return{allowed:false,reason:"This offspring is already marked weaned.",unlockDate:"",ageDays:null};
    if(!date)return{allowed:false,reason:"Choose a valid weaning date.",unlockDate:"",ageDays:null};

    const dob=dateOnly(animal.dob)||dateOnly(litter.birthDate);
    const age=dob?daysOld(dob,date):null;
    const unlock=effectiveUnlockDate(state,litter,animal);
    if(unlock&&date<unlock){
      const species=speciesForAnimal(state,litter,animal);
      const minimum=defaultMinimumDays(species);
      const label=minimum?`${minimum}-day ${species||"offspring"} safety lock`:"litter weaning lock";
      return{
        allowed:false,
        reason:`Too early to wean. ${label} ends ${unlock}.`,
        unlockDate:unlock,
        ageDays:age
      };
    }
    return{allowed:true,reason:"",unlockDate:unlock,ageDays:age};
  }

  function eligibleForDate(state,litterId,animalIds,weanDate){
    const ids=[...new Set((Array.isArray(animalIds)?animalIds:[]).map(String).filter(Boolean))];
    const allowed=[];
    const blocked=[];
    ids.forEach(id=>{
      const result=weanEligibility(state,litterId,id,weanDate);
      (result.allowed?allowed:blocked).push({animalId:id,...result});
    });
    return{allowed,blocked};
  }

  function setWeanNotBefore(state,litterId,value,now=new Date().toISOString()){
    const litter=litterById(state,litterId);
    if(!litter)return{state,changed:false,litter:null};
    const date=dateOnly(value);
    const current=dateOnly(litter.weanNotBeforeDate);
    if(date===current)return{state,changed:false,litter};
    const nextLitter={...litter,weanNotBeforeDate:date,updatedAt:now};
    const next={...state,litters:array(state,"litters").map(row=>String(row.id)===String(litterId)?nextLitter:row)};
    return{state:next,changed:true,litter:nextLitter};
  }

  function liveAvailable(litter={}){
    return Math.max(0,Number(litter.bornAlive||0)+Number(litter.fosteredIn||0)-Number(litter.fosteredOut||0)-Number(litter.lostBeforeWeaning||0));
  }

  function unweanSelected(state,litterId,animalIds,now=new Date().toISOString()){
    const litter=litterById(state,litterId);
    if(!litter)return{state,updated:[],litter:null};
    const linked=offspringForLitter(state,litter);
    const linkedIds=new Set(linked.map(row=>String(row.id)));
    const selected=new Set((Array.isArray(animalIds)?animalIds:[]).map(String).filter(id=>linkedIds.has(id)));
    const updated=[];
    const animals=array(state,"animals").map(animal=>{
      const id=String(animal.id);
      if(!selected.has(id)||!clean(animal.weanedDate))return animal;
      updated.push(id);
      const next={...animal,weanedDate:"",updatedAt:now};
      return next;
    });
    if(!updated.length)return{state,updated:[],litter};

    const marked=animals.filter(animal=>linkedIds.has(String(animal.id))&&clean(animal.weanedDate)&&lower(animal.status)!=="deceased").length;
    const nextLitter={...litter,weaned:String(Math.min(liveAvailable(litter),marked)),updatedAt:now};
    const next={
      ...state,
      animals,
      litters:array(state,"litters").map(row=>String(row.id)===String(litterId)?nextLitter:row)
    };
    return{state:next,updated,litter:nextLitter};
  }

  return Object.freeze({
    VERSION,
    DEFAULT_MINIMUM_DAYS,
    dateOnly,
    addDays,
    daysOld,
    defaultMinimumDays,
    litterById,
    offspringForLitter,
    speciesForAnimal,
    defaultUnlockDate,
    effectiveUnlockDate,
    weanEligibility,
    eligibleForDate,
    setWeanNotBefore,
    unweanSelected
  });
});
