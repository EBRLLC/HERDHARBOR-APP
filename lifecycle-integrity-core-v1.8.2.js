(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.HerdHarborLifecycleIntegrityCore=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";

  const VERSION="1.8.2";
  const clean=value=>String(value==null?"":value).trim();
  const lower=value=>clean(value).toLowerCase();
  const array=(value,key)=>Array.isArray(value?.[key])?value[key]:[];
  const dateOnly=value=>clean(value).slice(0,10);
  const validDate=value=>{const parsed=Date.parse(value);return Number.isFinite(parsed)?parsed:null;};
  const unique=values=>[...new Set((Array.isArray(values)?values:[]).map(String).filter(Boolean))];

  function tombstoneId(kind,recordId){return`${kind}:${recordId}`;}
  function lifecycleTombstones(state){return array(state,"lifecycleTombstones");}
  function tombstonedIds(state,kind){
    return new Set(lifecycleTombstones(state).filter(row=>clean(row.kind)===kind).map(row=>clean(row.recordId)).filter(Boolean));
  }

  function recordDeletionTombstones(before={},after={},now=new Date().toISOString()){
    const beforeBreeding=new Set(array(before,"breedings").map(row=>String(row.id)));
    const afterBreeding=new Set(array(after,"breedings").map(row=>String(row.id)));
    const beforeLitter=new Set(array(before,"litters").map(row=>String(row.id)));
    const afterLitter=new Set(array(after,"litters").map(row=>String(row.id)));
    const removedBreedings=[...beforeBreeding].filter(id=>!afterBreeding.has(id));
    const removedLitters=[...beforeLitter].filter(id=>!afterLitter.has(id));
    if(!removedBreedings.length&&!removedLitters.length)return{state:after,changed:false,added:[]};

    const existing=new Map(lifecycleTombstones(after).map(row=>[String(row.id),row]));
    const added=[];
    const add=(kind,recordId)=>{
      const id=tombstoneId(kind,recordId);
      if(existing.has(id))return;
      const row={id,kind,recordId:String(recordId),deletedAt:now};
      existing.set(id,row);added.push(row);
    };
    removedBreedings.forEach(id=>add("breeding",id));
    removedLitters.forEach(id=>add("litter",id));
    return{state:{...after,lifecycleTombstones:[...existing.values()]},changed:Boolean(added.length),added};
  }

  function staleResurrectedLitterIds(state={}){
    const breedingIds=new Set(array(state,"breedings").map(row=>String(row.id)));
    const animals=array(state,"animals");
    const byId=new Map(animals.map(row=>[String(row.id),row]));
    const stale=[];
    array(state,"litters").forEach(litter=>{
      const ids=unique(array(litter,"offspringIds"));
      if(!ids.length)return;
      const linked=ids.map(id=>byId.get(id)).filter(Boolean);
      if(!linked.length)return;
      if(linked.some(animal=>clean(animal.sourceBirthId)===String(litter.id)))return;
      const breedingId=clean(litter.breedingId);
      if(breedingId&&breedingIds.has(breedingId))return;
      const litterUpdated=validDate(litter.updatedAt||litter.createdAt);
      if(litterUpdated==null)return;
      const childrenWereUpdatedAfter=linked.every(animal=>{
        const childUpdated=validDate(animal.updatedAt||animal.createdAt);
        return childUpdated!=null&&childUpdated>=litterUpdated;
      });
      if(childrenWereUpdatedAfter)stale.push(String(litter.id));
    });
    return stale;
  }

  function linkedOffspring(animals,litter){
    const ids=new Set(unique(array(litter,"offspringIds")));
    return animals.filter(animal=>ids.has(String(animal.id))||clean(animal.sourceBirthId)===String(litter.id));
  }

  function reconcile(state={},now=new Date().toISOString(),asOfDate=String(now).slice(0,10)){
    const today=dateOnly(asOfDate)||String(now).slice(0,10);
    const tombstoneRows=[...lifecycleTombstones(state)];
    const breedingDeleted=tombstonedIds(state,"breeding");
    const litterDeleted=tombstonedIds(state,"litter");
    const detected=staleResurrectedLitterIds(state);
    detected.forEach(recordId=>{
      litterDeleted.add(recordId);
      const id=tombstoneId("litter",recordId);
      if(!tombstoneRows.some(row=>String(row.id)===id))tombstoneRows.push({id,kind:"litter",recordId,deletedAt:now,recoveredFromStaleLink:true});
    });

    let changed=detected.length>0;
    const removedBreedingIds=[];
    const breedings=array(state,"breedings").filter(record=>{
      if(!breedingDeleted.has(String(record.id)))return true;
      removedBreedingIds.push(String(record.id));changed=true;return false;
    });
    const liveBreedingIds=new Set(breedings.map(row=>String(row.id)));

    const removedLitterIds=[];
    const unlinkedLitterIds=[];
    let litters=[];
    array(state,"litters").forEach(litter=>{
      const id=String(litter.id);
      if(litterDeleted.has(id)){
        removedLitterIds.push(id);changed=true;return;
      }
      const breedingId=clean(litter.breedingId);
      if(breedingId&&!liveBreedingIds.has(breedingId)){
        litters.push({...litter,breedingId:"",updatedAt:now});
        unlinkedLitterIds.push(id);changed=true;return;
      }
      litters.push(litter);
    });

    const removedLitterSet=new Set([...litterDeleted,...removedLitterIds]);
    const unlinkedAnimalIds=[];
    const clearedFutureWeaningIds=[];
    const animals=array(state,"animals").map(animal=>{
      const sourceId=clean(animal.sourceBirthId);
      const removeBirthLink=removedLitterSet.has(sourceId);
      const weaned=dateOnly(animal.weanedDate);
      const clearFutureWeaning=Boolean(weaned&&today&&weaned>today);
      if(!removeBirthLink&&!clearFutureWeaning)return animal;
      const patch={updatedAt:now};
      if(removeBirthLink){patch.sourceBirthId="";unlinkedAnimalIds.push(String(animal.id));}
      if(clearFutureWeaning){patch.weanedDate="";clearedFutureWeaningIds.push(String(animal.id));}
      changed=true;
      return{...animal,...patch};
    });

    if(clearedFutureWeaningIds.length){
      const cleared=new Set(clearedFutureWeaningIds);
      litters=litters.map(litter=>{
        const offspring=linkedOffspring(animals,litter);
        if(!offspring.some(animal=>cleared.has(String(animal.id))))return litter;
        const marked=offspring.filter(animal=>lower(animal.status)!=="deceased"&&Boolean(dateOnly(animal.weanedDate))).length;
        if(String(litter.weaned||"0")===String(marked))return litter;
        return{...litter,weaned:String(marked),updatedAt:now};
      });
    }

    const unlinkedSaleIds=[];
    const sales=array(state,"sales").map(sale=>{
      const sourceId=clean(sale.sourceLitterId);
      if(!removedLitterSet.has(sourceId))return sale;
      unlinkedSaleIds.push(String(sale.id));changed=true;
      return{...sale,sourceLitterId:"",updatedAt:now};
    });

    if(!changed)return{state,changed:false,removedBreedingIds:[],removedLitterIds:[],unlinkedLitterIds:[],unlinkedAnimalIds:[],unlinkedSaleIds:[],clearedFutureWeaningIds:[],detectedStaleLitterIds:[]};
    return{
      state:{...state,breedings,litters,animals,sales,lifecycleTombstones:tombstoneRows},
      changed:true,
      removedBreedingIds,
      removedLitterIds:unique([...removedLitterIds,...detected]),
      unlinkedLitterIds,
      unlinkedAnimalIds,
      unlinkedSaleIds,
      clearedFutureWeaningIds,
      detectedStaleLitterIds:detected
    };
  }

  return Object.freeze({VERSION,tombstoneId,lifecycleTombstones,tombstonedIds,recordDeletionTombstones,staleResurrectedLitterIds,linkedOffspring,reconcile});
});
