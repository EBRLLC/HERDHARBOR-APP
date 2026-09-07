(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.HerdHarborLitterSaleTransferCore=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";

  const VERSION="1.8.2";
  const SALE_STATUSES=new Set(["Draft","Reserved","Pending","Completed","Cancelled"]);
  const BLOCKED_ANIMAL_STATUSES=new Set(["sold","deceased","archived","ancestor only"]);
  const ACTIVE_SALE_STATUSES=new Set(["Draft","Reserved","Pending","Completed"]);

  const clean=value=>String(value==null?"":value).trim();
  const lower=value=>clean(value).toLowerCase();
  const array=(value,key)=>Array.isArray(value?.[key])?value[key]:[];
  const unique=values=>[...new Set((Array.isArray(values)?values:[]).map(String).filter(Boolean))];

  function cloneState(state={}){
    return{
      ...state,
      animals:[...array(state,"animals")],
      litters:[...array(state,"litters")],
      customers:[...array(state,"customers")],
      sales:[...array(state,"sales")],
      transfers:[...array(state,"transfers")]
    };
  }

  function litterById(state,litterId){
    return array(state,"litters").find(row=>String(row.id)===String(litterId))||null;
  }

  function animalById(state,animalId){
    return array(state,"animals").find(row=>String(row.id)===String(animalId))||null;
  }

  function offspringForLitter(state,litterOrId){
    const litter=typeof litterOrId==="object"?litterOrId:litterById(state,litterOrId);
    if(!litter)return[];
    const ids=new Set(array(litter,"offspringIds").map(String));
    return array(state,"animals").filter(animal=>ids.has(String(animal.id))||String(animal.sourceBirthId||"")===String(litter.id));
  }

  function saleContainsAnimal(sale,animalId){
    return array(sale,"items").some(item=>String(item.animalId)===String(animalId));
  }

  function activeSaleForAnimal(state,animalId){
    return array(state,"sales")
      .filter(sale=>ACTIVE_SALE_STATUSES.has(clean(sale.status))&&saleContainsAnimal(sale,animalId))
      .sort((a,b)=>String(b.updatedAt||b.createdAt||b.saleDate||"").localeCompare(String(a.updatedAt||a.createdAt||a.saleDate||"")))[0]||null;
  }

  function saleCandidateOffspring(state={},litterId){
    return offspringForLitter(state,litterId).filter(animal=>{
      if(lower(animal.status)!=="for sale")return false;
      if(BLOCKED_ANIMAL_STATUSES.has(lower(animal.status)))return false;
      return !activeSaleForAnimal(state,animal.id);
    });
  }

  function litterSales(state={},litterId){
    const offspringIds=new Set(offspringForLitter(state,litterId).map(animal=>String(animal.id)));
    return array(state,"sales")
      .filter(sale=>String(sale.sourceLitterId||"")===String(litterId)||array(sale,"items").some(item=>offspringIds.has(String(item.animalId))))
      .sort((a,b)=>String(b.updatedAt||b.createdAt||b.saleDate||"").localeCompare(String(a.updatedAt||a.createdAt||a.saleDate||"")));
  }

  function transferForSale(state={},sale={}){
    const saleNumber=clean(sale.saleNumber);
    const ids=new Set(array(sale,"items").map(item=>String(item.animalId)));
    return array(state,"transfers")
      .filter(row=>{
        if(saleNumber&&clean(row.sourceSaleNumber)===saleNumber)return true;
        const animalIds=new Set(array(row,"animalIds").map(String));
        return ids.size>0&&[...ids].every(id=>animalIds.has(id));
      })
      .sort((a,b)=>String(b.createdAt||b.updatedAt||"").localeCompare(String(a.createdAt||a.updatedAt||"")))[0]||null;
  }

  function suffixForId(id){
    const text=String(id||"").replace(/[^a-z0-9]/gi,"").slice(-6).toUpperCase();
    return(text||"000000").padStart(6,"0");
  }

  function saleNumberForId(id,date){
    const day=clean(date)||new Date().toISOString().slice(0,10);
    return`HH-${day.slice(0,4)}-${suffixForId(id)}`;
  }

  function customerMatch(state,input={}){
    const customerId=clean(input.customerId);
    if(customerId)return array(state,"customers").find(row=>String(row.id)===customerId)||null;
    const email=lower(input.email);
    if(email){
      const match=array(state,"customers").find(row=>lower(row.email)===email);
      if(match)return match;
    }
    return null;
  }

  function normalizeMoney(value,fallback=0){
    if(value===""||value==null)return fallback;
    const amount=Number(value);
    if(!Number.isFinite(amount)||amount<0)return null;
    return amount;
  }

  function applySaleAnimalStatuses(state,sale,previousSale=null,now=new Date().toISOString()){
    const nextIds=new Set(array(sale,"items").map(item=>String(item.animalId)));
    const previousIds=new Set(array(previousSale,"items").map(item=>String(item.animalId)));
    const next={...state,animals:[...array(state,"animals")]};

    next.animals=array(state,"animals").map(animal=>{
      const id=String(animal.id);
      let updated=animal;
      if(previousIds.has(id)&&!nextIds.has(id)&&String(animal.saleRecordId||"")===String(sale.id)){
        updated={...updated,status:"For Sale",saleRecordId:"",updatedAt:now};
      }
      if(nextIds.has(id)){
        if(sale.status==="Reserved")updated={...updated,status:"Reserved",saleRecordId:sale.id,updatedAt:now};
        else if(sale.status==="Completed")updated={...updated,status:"Sold",saleRecordId:sale.id,updatedAt:now};
        else if(String(updated.saleRecordId||"")===String(sale.id))updated={...updated,status:"For Sale",saleRecordId:"",updatedAt:now};
      }
      return updated;
    });
    return next;
  }

  function createSaleFromLitter(state={},litterId,input={},now=new Date().toISOString()){
    const litter=litterById(state,litterId);
    if(!litter)return{state,error:"Litter not found.",sale:null,customer:null};
    const selectedIds=unique(input.animalIds);
    if(!selectedIds.length)return{state,error:"Select at least one offspring for the sale.",sale:null,customer:null};

    const candidates=new Map(saleCandidateOffspring(state,litterId).map(animal=>[String(animal.id),animal]));
    const selected=selectedIds.map(id=>candidates.get(id)).filter(Boolean);
    if(selected.length!==selectedIds.length)return{state,error:"One or more selected offspring are no longer available for sale.",sale:null,customer:null};

    let customer=customerMatch(state,input);
    const next=cloneState(state);
    if(!customer){
      const name=clean(input.customerName);
      if(!name)return{state,error:"Buyer name is required.",sale:null,customer:null};
      const stamp=String(now).replace(/\D/g,"").slice(-14)||String(Date.now());
      customer={id:`customer_litter_${stamp}`,name,phone:clean(input.phone),email:clean(input.email),address:clean(input.address),notes:"Created from the litter sale workflow.",createdAt:now,updatedAt:now};
      next.customers=[...array(state,"customers"),customer];
    }

    const prices=input.prices&&typeof input.prices==="object"?input.prices:{};
    const saleId=`sale_litter_${String(litter.id).replace(/[^a-zA-Z0-9_-]/g,"").slice(-40)}_${String(now).replace(/\D/g,"").slice(-14)||Date.now()}`;
    const saleDate=clean(input.saleDate)||String(now).slice(0,10);
    const status=SALE_STATUSES.has(clean(input.status))?clean(input.status):"Reserved";
    if(status==="Cancelled")return{state,error:"A new sale cannot start as Cancelled.",sale:null,customer:null};

    const items=[];
    for(const animal of selected){
      const fallback=normalizeMoney(animal.askingPrice,0);
      const amount=normalizeMoney(prices[animal.id],fallback==null?0:fallback);
      if(amount==null)return{state,error:`Enter a valid price for ${animal.name||"the selected offspring"}.`,sale:null,customer:null};
      items.push({id:`saleitem_${saleId}_${String(animal.id).replace(/[^a-zA-Z0-9_-]/g,"").slice(-48)}`,animalId:animal.id,quantity:"1",unitPrice:amount.toFixed(2)});
    }

    const saleNumber=saleNumberForId(saleId,saleDate);
    const sale={
      id:saleId,saleNumber,transferNumber:`TR-${saleNumber.replace(/^HH-/,"")}`,
      customerId:customer.id,saleDate,dueDate:clean(input.dueDate)||saleDate,status,items,
      discount:(normalizeMoney(input.discount,0)??0).toFixed(2),tax:(normalizeMoney(input.tax,0)??0).toFixed(2),
      terms:clean(input.terms)||"Payment due upon pickup unless otherwise agreed.",notes:clean(input.notes)||"Created from the litter sale workflow.",
      sourceLitterId:litter.id,sourceBreedingId:clean(litter.breedingId),sourceWorkflow:"litter-sale-transfer",
      completedAt:status==="Completed"?now:"",createdAt:now,updatedAt:now
    };
    next.sales=[...array(state,"sales"),sale];
    const withStatuses=applySaleAnimalStatuses(next,sale,null,now);
    return{state:withStatuses,error:"",sale,customer};
  }

  function updateSaleStatus(state={},saleId,status,now=new Date().toISOString()){
    const nextStatus=clean(status);
    if(!SALE_STATUSES.has(nextStatus))return{state,error:"Invalid sale status.",sale:null};
    const existing=array(state,"sales").find(row=>String(row.id)===String(saleId));
    if(!existing)return{state,error:"Sale not found.",sale:null};
    if(existing.status==="Completed"&&nextStatus!=="Completed")return{state,error:"Completed litter sales must be changed from the full Sales screen.",sale:existing};
    const sale={...existing,status:nextStatus,completedAt:nextStatus==="Completed"?(existing.completedAt||now):(nextStatus==="Cancelled"?"":existing.completedAt||""),updatedAt:now};
    const next=cloneState(state);
    next.sales=array(state,"sales").map(row=>String(row.id)===String(saleId)?sale:row);
    const withStatuses=applySaleAnimalStatuses(next,sale,existing,now);
    return{state:withStatuses,error:"",sale};
  }

  function saleTotal(sale={}){
    const subtotal=array(sale,"items").reduce((sum,item)=>sum+Math.max(0,Number(item.quantity||1))*Math.max(0,Number(item.unitPrice||0)),0);
    const discount=Math.max(0,Number(sale.discount||0));
    const tax=Math.max(0,Number(sale.tax||0));
    return Math.max(0,subtotal-discount+tax);
  }

  function saleStage(state={},sale={}){
    const transfer=transferForSale(state,sale);
    if(transfer)return{stage:"transfer",label:`Transfer ${clean(transfer.status)||"sent"}`,transfer};
    if(clean(sale.status)==="Completed")return{stage:"completed",label:"Ready to transfer",transfer:null};
    if(clean(sale.status)==="Reserved")return{stage:"reserved",label:"Reserved for buyer",transfer:null};
    if(clean(sale.status)==="Cancelled")return{stage:"cancelled",label:"Cancelled",transfer:null};
    return{stage:"sale",label:clean(sale.status)||"Sale",transfer:null};
  }

  return Object.freeze({VERSION,SALE_STATUSES,litterById,animalById,offspringForLitter,saleContainsAnimal,activeSaleForAnimal,saleCandidateOffspring,litterSales,transferForSale,saleNumberForId,applySaleAnimalStatuses,createSaleFromLitter,updateSaleStatus,saleTotal,saleStage});
});