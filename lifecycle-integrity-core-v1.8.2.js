(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.HerdHarborLifecycleIntegrityCore=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";

  const VERSION="1.8.2";
  const clean=value=>String(value==null?"":value).trim();
  const array=(value,key)=>Array.isArray(value?.[key])?value[key]:[];
  const dateOnly=value=>clean(value).slice(0,10);

  function isOrphanLinkedLitter(state,litter){
    const breedingId=clean(litter?.breedingId);
    if(!breedingId)return false;
    return !array(state,"breedings").some(record=>String(record?.id||"")===breedingId);
  }

  function reconcile(state={},now=new Date().toISOString(),asOfDate=String(now).slice(0,10)){
    const litters=array(state,"litters");
    const orphanIds=new Set(litters.filter(litter=>isOrphanLinkedLitter(state,litter)).map(litter=>String(litter.id)));
    const nextLitters=orphanIds.size?litters.filter(litter=>!orphanIds.has(String(litter.id))):litters;
    const validLitterIds=new Set(nextLitters.map(litter=>String(litter.id)));
    const today=dateOnly(asOfDate)||String(now).slice(0,10);
    const unlinkedAnimalIds=[];
    const clearedFutureWeaningIds=[];
    const unlinkedSaleIds=[];

    let animals=array(state,"animals");
    let animalsChanged=false;
    animals=animals.map(animal=>{
      const sourceId=clean(animal?.sourceBirthId);
      if(!sourceId||validLitterIds.has(sourceId))return animal;
      animalsChanged=true;
      unlinkedAnimalIds.push(String(animal.id));
      const patch={sourceBirthId:"",updatedAt:now};
      const weaned=dateOnly(animal?.weanedDate);
      if(weaned&&today&&weaned>today){
        patch.weanedDate="";
        clearedFutureWeaningIds.push(String(animal.id));
      }
      return{...animal,...patch};
    });

    let sales=array(state,"sales");
    let salesChanged=false;
    sales=sales.map(sale=>{
      const sourceId=clean(sale?.sourceLitterId);
      if(!sourceId||validLitterIds.has(sourceId))return sale;
      salesChanged=true;
      unlinkedSaleIds.push(String(sale.id));
      return{...sale,sourceLitterId:"",updatedAt:now};
    });

    const changed=orphanIds.size>0||animalsChanged||salesChanged;
    if(!changed)return{state,changed:false,removedLitterIds:[],unlinkedAnimalIds:[],unlinkedSaleIds:[],clearedFutureWeaningIds:[]};

    return{
      state:{
        ...state,
        litters:nextLitters,
        ...(animalsChanged?{animals}:{}),
        ...(salesChanged?{sales}:{})
      },
      changed:true,
      removedLitterIds:[...orphanIds],
      unlinkedAnimalIds,
      unlinkedSaleIds,
      clearedFutureWeaningIds
    };
  }

  return Object.freeze({VERSION,isOrphanLinkedLitter,reconcile});
});
