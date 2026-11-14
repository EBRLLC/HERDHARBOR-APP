(function(root,factory) {
  "use strict";
  const api=factory();
  if(typeof module==="object" && module.exports) module.exports=api;
  if(root) root.HerdHarborRabbitBreeder203=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const text=value=>String(value==null?"":value).trim();
  const isRabbit=animal=>/^(rabbit|rabbits)$/i.test(text(animal?.species));
  const knownDate=value=>{
    const literal=text(value);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(literal))return false;
    const parsed=new Date(literal+"T00:00:00Z");
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10)===literal;
  };
  const byUniqueId=animals=>{
    const result=new Map(),duplicates=new Set();
    for(const animal of animals||[]){
      const id=text(animal?.id);
      if(!id)continue;
      if(result.has(id))duplicates.add(id);
      else result.set(id,animal);
    }
    for(const id of duplicates)result.delete(id);
    return {animals:result,duplicates};
  };
  function ancestryIds(animal,all,maxDepth=4){
    const {animals,duplicates}=byUniqueId(all),seen=new Set(),warnings=[];
    const visit=(id,depth,trail)=>{
      id=text(id);
      if(!id||depth>maxDepth)return;
      if(duplicates.has(id)){warnings.push({code:"ambiguous-ancestor",animalId:id});return;}
      if(trail.has(id)){warnings.push({code:"ancestry-cycle",animalId:id});return;}
      const target=animals.get(id);
      if(!target)return;
      if(!isRabbit(target)){warnings.push({code:"cross-species-ancestor",animalId:id});return;}
      seen.add(id);
      const next=new Set(trail);next.add(id);
      visit(target.sireId,depth+1,next);
      visit(target.damId,depth+1,next);
    };
    visit(animal?.sireId,1,new Set([text(animal?.id)]));
    visit(animal?.damId,1,new Set([text(animal?.id)]));
    return {ids:seen,warnings};
  }
  function pairingReview(sire,dam,animals,engine){
    if(!isRabbit(sire)||!isRabbit(dam)) return {supported:false,reason:"Rabbit pairing records only."};
    if(text(sire.id)===text(dam.id)) return {supported:false,reason:"An animal cannot be paired with itself."};
    const s=ancestryIds(sire,animals),d=ancestryIds(dam,animals);
    const common=[...s.ids].filter(id=>d.ids.has(id));
    const direct=s.ids.has(text(dam.id))||d.ids.has(text(sire.id));
    const warnings=[...s.warnings,...d.warnings];
    if(direct) warnings.push({code:"direct-ancestry",animalIds:[sire.id,dam.id]});
    if(common.length) warnings.push({code:"shared-ancestry",animalIds:common});
    // Relationship warnings are evidence-based. This is not a coefficient of inbreeding.
    let genetics=null;
    if(engine?.analyzePairing){
      try{genetics=engine.analyzePairing(sire,dam,{animals});}
      catch(error){warnings.push({code:"genetics-analysis-unavailable",detail:text(error.message)});}
    }
    return {supported:true,commonAncestors:common,directAncestry:direct,warnings,
      genetics,hasRelationshipRisk:direct||common.length>0};
  }
  function geneticsHistory(animal){
    if(!isRabbit(animal))return [];
    const g=animal.genetics||{},history=[];
    for(const item of Array.isArray(g.evidence)?g.evidence:[])history.push({
      kind:"evidence",locus:item.locus||"",source:item.source||"unknown",
      status:item.status||"unverified",note:item.note||"",createdAt:item.createdAt||item.updatedAt||null,
      relatedAnimalIds:Array.isArray(item.relatedAnimalIds)?item.relatedAnimalIds.slice():[]
    });
    for(const item of Array.isArray(g.conflicts)?g.conflicts:[])history.push({
      kind:"review-required",locus:item.locus||"",source:item.source||"unknown",
      status:"unresolved",note:item.note||"",createdAt:item.createdAt||null,
      relatedAnimalIds:[item.sireId,item.damId].filter(Boolean)
    });
    return history;
  }
  function addKitWeight(kit,date,grams,notes=""){
    if(!isRabbit(kit))throw Error("Growth records are restricted to rabbit kits.");
    if(!knownDate(date))throw Error("Choose a valid measurement date.");
    const weight=Number(grams);
    if(!Number.isFinite(weight)||weight<=0||weight>25000)throw Error("Weight must be a positive number of grams.");
    if(!Array.isArray(kit.growthRecords))kit.growthRecords=[];
    // Stable record key prevents duplicate form retries and permits corrections without
    // discarding previously recorded measurements at other dates.
    const id="growth:"+text(kit.id)+":"+date;
    const existing=kit.growthRecords.find(item=>item.id===id);
    const record={id,date,grams:weight,notes:text(notes),unit:"g"};
    if(existing)Object.assign(existing,record);
    else kit.growthRecords.push(record);
    kit.growthRecords.sort((a,b)=>text(a.date).localeCompare(text(b.date)));
    return record;
  }
  function recordFoster(litter,event){
    if(!litter?.id)throw Error("A saved litter is required.");
    const id=text(event?.id), direction=text(event?.direction),count=Number(event?.count);
    if(!id)throw Error("A stable foster event ID is required.");
    if(!["in","out"].includes(direction)||!Number.isSafeInteger(count)||count<=0)throw Error("Invalid foster direction or count.");
    const list=Array.isArray(litter.fosterEvents)?litter.fosterEvents:[];
    const existing=list.find(item=>text(item.id)===id);
    if(existing) {
      if(existing.direction!==direction || existing.count!==count)throw Error("Foster event conflict; correction must be reviewed.");
      return {created:false,event:existing};
    }
    const entry={id,direction,count,date:text(event.date),notes:text(event.notes),sourceLitterId:text(event.sourceLitterId),destinationLitterId:text(event.destinationLitterId)};
    list.push(entry);litter.fosterEvents=list;
    const field=direction==="in"?"fosteredIn":"fosteredOut";
    litter[field]=Math.max(0,Number(litter[field])||0)+count;
    return {created:true,event:entry};
  }
  function litterSummary(litter,animals){
    const kits=(animals||[]).filter(a=>isRabbit(a)&&(text(a.sourceBirthId)===text(litter?.id) ||
       (Array.isArray(litter?.offspringIds)&&litter.offspringIds.includes(a.id))));
    const bornAlive=Math.max(0,Number(litter?.bornAlive)||0);
    const fosteredIn=Math.max(0,Number(litter?.fosteredIn)||0);
    const fosteredOut=Math.max(0,Number(litter?.fosteredOut)||0);
    const lost=Math.max(0,Number(litter?.lostBeforeWeaning)||0);
    const weaned=Math.max(0,Number(litter?.weaned)||0);
    return {litterId:text(litter?.id),bornAlive,fosteredIn,fosteredOut,lost,weaned,individualKits:kits.length,
      growthMeasurements:kits.reduce((sum,a)=>sum+(a.growthRecords||[]).length,0),
      liveRemaining:Math.max(0,bornAlive+fosteredIn-fosteredOut-lost),
      countWarning:weaned>bornAlive+fosteredIn-fosteredOut-lost};
  }
  return Object.freeze({VERSION:"2.0.3",isRabbit,ancestryIds,pairingReview,geneticsHistory,addKitWeight,recordFoster,litterSummary});
});
