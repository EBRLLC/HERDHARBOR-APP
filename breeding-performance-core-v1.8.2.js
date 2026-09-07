(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.HerdHarborBreedingPerformanceCore=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";

  const VERSION="1.8.2";
  const DAY_MS=86400000;
  const clean=value=>String(value==null?"":value).trim();
  const lower=value=>clean(value).toLowerCase();
  const array=(source,key)=>Array.isArray(source?.[key])?source[key]:[];
  const num=value=>value!==""&&value!==null&&value!==undefined&&Number.isFinite(Number(value))?Number(value):null;
  const sum=values=>values.reduce((total,value)=>total+(num(value)||0),0);
  const mean=values=>{const valid=values.map(num).filter(value=>value!==null);return valid.length?sum(valid)/valid.length:null;};
  const pct=(part,total)=>total>0?part/total*100:null;
  const dateOnly=value=>/^\d{4}-\d{2}-\d{2}/.test(clean(value))?clean(value).slice(0,10):"";

  function parseDate(value){const raw=dateOnly(value);if(!raw)return null;const date=new Date(`${raw}T12:00:00Z`);return Number.isNaN(date.getTime())?null:date;}
  function rangeBounds(range="all",start="",end="",today=new Date().toISOString().slice(0,10)){
    if(!range||range==="all")return{start:"",end:""};
    if(range==="custom")return{start:dateOnly(start),end:dateOnly(end)};
    const days={"30d":30,"3m":91,"6m":183,"12m":365}[range];const finish=parseDate(today);
    if(!days||!finish)return{start:"",end:""};
    return{start:new Date(finish.getTime()-(days-1)*DAY_MS).toISOString().slice(0,10),end:dateOnly(today)};
  }
  function inRange(value,options={}){const date=dateOnly(value);if(!date)return false;const bounds=rangeBounds(options.range,options.start,options.end,options.today);return(!bounds.start||date>=bounds.start)&&(!bounds.end||date<=bounds.end);}

  function animalById(state,id){return array(state,"animals").find(row=>String(row.id)===String(id))||null;}
  function animalName(state,id){return animalById(state,id)?.name||"Unknown animal";}
  function breedingById(state,id){return array(state,"breedings").find(row=>String(row.id)===String(id))||null;}
  function breedingSpecies(state,record){return clean(record?.species)||animalById(state,record?.femaleId)?.species||animalById(state,record?.maleId)?.species||"";}
  function litterParents(state,litter){const breeding=breedingById(state,litter?.breedingId);return{damId:clean(litter?.damId)||clean(breeding?.femaleId),sireId:clean(litter?.sireId)||clean(breeding?.maleId)};}
  function litterSpecies(state,litter){const parents=litterParents(state,litter);return clean(litter?.species)||animalById(state,parents.damId)?.species||animalById(state,parents.sireId)?.species||breedingSpecies(state,breedingById(state,litter?.breedingId))||"";}
  function linkedLitter(state,breeding){return array(state,"litters").find(row=>String(row.breedingId||"")===String(breeding?.id||""))||null;}

  function breedingOutcome(state,record){
    const status=lower(record?.status),check=lower(record?.pregnancyCheckStatus),litter=linkedLitter(state,record);
    if(litter||status==="delivered")return"conceived";
    if(["cancelled","canceled"].includes(status))return"cancelled";
    if(check==="negative"||status==="not pregnant")return"not-conceived";
    if(check==="positive"||["confirmed pregnant","due soon"].includes(status))return"conceived";
    return"pending";
  }

  function eligibleAtBirth(litter={}){return Math.max(0,(num(litter.bornAlive)||0)+(num(litter.fosteredIn)||0)-(num(litter.fosteredOut)||0));}
  function litterResolvedForWeaning(litter={}){
    const eligible=eligibleAtBirth(litter);if(eligible<=0)return false;
    const weaned=Math.max(0,num(litter.weaned)||0),lost=Math.max(0,num(litter.lostBeforeWeaning)||0);
    return weaned+lost>=eligible;
  }
  function litterStats(litters=[]){
    const rows=Array.isArray(litters)?litters:[];
    const totalBornAlive=sum(rows.map(row=>row.bornAlive));
    const totalStillborn=sum(rows.map(row=>row.stillborn));
    const totalBirths=totalBornAlive+totalStillborn;
    const totalLosses=sum(rows.map(row=>row.lostBeforeWeaning));
    const resolved=rows.filter(litterResolvedForWeaning);
    const resolvedEligible=sum(resolved.map(eligibleAtBirth));
    const resolvedWeaned=sum(resolved.map(row=>row.weaned));
    return{
      litters:rows.length,
      bornAlive:totalBornAlive,
      stillborn:totalStillborn,
      totalBirths,
      liveBirthRate:pct(totalBornAlive,totalBirths),
      averageBornAlive:mean(rows.map(row=>row.bornAlive)),
      largestBornAlive:rows.length?Math.max(...rows.map(row=>num(row.bornAlive)||0)):null,
      totalWeaned:sum(rows.map(row=>row.weaned)),
      averageWeaned:mean(resolved.map(row=>row.weaned)),
      recordedPreWeaningLosses:totalLosses,
      resolvedWeaningLitters:resolved.length,
      weaningEligibleLitters:rows.filter(row=>eligibleAtBirth(row)>0).length,
      survivalToWeaning:pct(resolvedWeaned,resolvedEligible),
      resolvedEligible,
      resolvedWeaned
    };
  }

  function filteredRecords(state={},options={}){
    const species=clean(options.species);
    const breedings=array(state,"breedings").filter(record=>(!species||breedingSpecies(state,record)===species)&&inRange(record.breedingDate||record.date,options));
    const litters=array(state,"litters").filter(record=>(!species||litterSpecies(state,record)===species)&&inRange(record.birthDate||record.date,options));
    return{breedings,litters};
  }

  function conceptionStats(state,breedings=[]){
    const outcomes={conceived:0,"not-conceived":0,pending:0,cancelled:0};
    breedings.forEach(record=>{outcomes[breedingOutcome(state,record)]+=1;});
    const resolved=outcomes.conceived+outcomes["not-conceived"];
    return{...outcomes,total:breedings.length,resolved,rate:pct(outcomes.conceived,resolved),coverage:pct(resolved,Math.max(0,breedings.length-outcomes.cancelled))};
  }

  function parentPerformance(state,role,records){
    const parentKey=role==="dam"?"femaleId":"maleId";
    const litterKey=role==="dam"?"damId":"sireId";
    const ids=new Set();
    records.breedings.forEach(record=>{if(record[parentKey])ids.add(String(record[parentKey]));});
    records.litters.forEach(litter=>{const parents=litterParents(state,litter);const id=role==="dam"?parents.damId:parents.sireId;if(id)ids.add(String(id));});
    return[...ids].map(id=>{
      const breedings=records.breedings.filter(record=>String(record[parentKey]||"")===id);
      const litters=records.litters.filter(litter=>String(litterParents(state,litter)[litterKey]||"")===id);
      const conception=conceptionStats(state,breedings),litter=litterStats(litters),animal=animalById(state,id)||{};
      const latest=[...breedings.map(row=>dateOnly(row.breedingDate||row.date)),...litters.map(row=>dateOnly(row.birthDate||row.date))].filter(Boolean).sort().at(-1)||"";
      return{id,name:animal.name||"Unknown animal",species:animal.species||"",breed:animal.breed||"",role,breedings:breedings.length,litters:litters.length,conceptionRate:conception.rate,conceptionResolved:conception.resolved,averageBornAlive:litter.averageBornAlive,bornAlive:litter.bornAlive,survivalToWeaning:litter.survivalToWeaning,totalWeaned:litter.totalWeaned,averageWeaned:litter.averageWeaned,latestDate:latest};
    }).sort((a,b)=>b.litters-a.litters||b.bornAlive-a.bornAlive||(b.conceptionRate||0)-(a.conceptionRate||0)||a.name.localeCompare(b.name));
  }

  function pairingPerformance(state,records){
    const map=new Map();
    const ensure=(damId,sireId)=>{const d=clean(damId),s=clean(sireId);if(!d&&!s)return null;const key=`${d}|${s}`;if(!map.has(key))map.set(key,{key,damId:d,sireId:s,breedings:[],litters:[]});return map.get(key);};
    records.breedings.forEach(record=>ensure(record.femaleId,record.maleId)?.breedings.push(record));
    records.litters.forEach(litter=>{const parents=litterParents(state,litter);ensure(parents.damId,parents.sireId)?.litters.push(litter);});
    return[...map.values()].map(row=>{
      const conception=conceptionStats(state,row.breedings),litter=litterStats(row.litters);
      const latest=[...row.breedings.map(item=>dateOnly(item.breedingDate||item.date)),...row.litters.map(item=>dateOnly(item.birthDate||item.date))].filter(Boolean).sort().at(-1)||"";
      return{key:row.key,damId:row.damId,sireId:row.sireId,damName:animalName(state,row.damId),sireName:animalName(state,row.sireId),breedings:row.breedings.length,litters:row.litters.length,conceptionRate:conception.rate,averageBornAlive:litter.averageBornAlive,bornAlive:litter.bornAlive,survivalToWeaning:litter.survivalToWeaning,totalWeaned:litter.totalWeaned,latestDate:latest};
    }).sort((a,b)=>b.litters-a.litters||b.bornAlive-a.bornAlive||a.damName.localeCompare(b.damName));
  }

  function dashboard(state={},options={}){
    const records=filteredRecords(state,options),conception=conceptionStats(state,records.breedings),litter=litterStats(records.litters);
    const weaningCoverage=pct(litter.resolvedWeaningLitters,litter.weaningEligibleLitters);
    const recentLitters=records.litters.slice().sort((a,b)=>dateOnly(b.birthDate||b.date).localeCompare(dateOnly(a.birthDate||a.date))).slice(0,12).map(record=>{
      const parents=litterParents(state,record),eligible=eligibleAtBirth(record),weaned=num(record.weaned)||0;
      return{id:record.id,date:dateOnly(record.birthDate||record.date),damId:parents.damId,sireId:parents.sireId,damName:animalName(state,parents.damId),sireName:animalName(state,parents.sireId),bornAlive:num(record.bornAlive)||0,stillborn:num(record.stillborn)||0,weaned,losses:num(record.lostBeforeWeaning)||0,resolved:litterResolvedForWeaning(record),survival:litterResolvedForWeaning(record)?pct(weaned,eligible):null};
    });
    return{
      filters:{species:clean(options.species),...rangeBounds(options.range,options.start,options.end,options.today)},
      conception,litter,
      coverage:{pregnancyOutcome:conception.coverage,weaningOutcome:weaningCoverage},
      dams:parentPerformance(state,"dam",records),
      sires:parentPerformance(state,"sire",records),
      pairings:pairingPerformance(state,records),
      recentLitters,
      recordCounts:{breedings:records.breedings.length,litters:records.litters.length}
    };
  }

  return Object.freeze({VERSION,rangeBounds,inRange,breedingOutcome,eligibleAtBirth,litterResolvedForWeaning,litterStats,filteredRecords,conceptionStats,parentPerformance,pairingPerformance,dashboard});
});
