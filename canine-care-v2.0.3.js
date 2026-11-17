(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module==="object" && module.exports)module.exports=api;
  if(root)root.HerdHarborCanineCare203=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const tidy=x=>String(x==null?"":x).trim();
  const arr=x=>Array.isArray(x)?x:[];
  const validDate=value=>{
    const date=tidy(value);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
    const parsed=new Date(date+"T00:00:00Z");
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10)===date;
  };
  const ownerOf=record=>tidy(record?.userId||record?.accountId||record?.ownerId);
  const isDog=record=>tidy(record?.species).toLowerCase()==="dog";
  function addPuppyObservation(state,puppyId,input,options={}){
    const issues=[],ownerId=tidy(options.ownerId);
    const original=arr(state?.animals).find(row=>tidy(row.id)===tidy(puppyId));
    if(!original||!isDog(original)||!tidy(original.sourceBirthId))issues.push("A birth-linked Dog puppy record is required.");
    if(original&&ownerOf(original)&&ownerOf(original)!==ownerId)issues.push("Puppy is outside the current account.");
    const kind=tidy(input?.kind).toLowerCase(),date=tidy(input?.date),notes=tidy(input?.notes);
    if(!["weight","health","development","veterinary-test"].includes(kind))issues.push("Select an allowed observation type.");
    if(!validDate(date))issues.push("Observation date is invalid.");
    if(!notes&&kind!=="weight")issues.push("Observation evidence or notes are required.");
    const grams=Number(input?.grams);
    if(kind==="weight"&&(!Number.isFinite(grams)||grams<=0||grams>150000))issues.push("Enter a valid puppy weight in grams.");
    const result={valid:issues.length===0,issues,state};
    if(!result.valid)return result;
    const next={...state,animals:arr(state.animals).map(a=>a===original?{...a,puppyObservations:arr(a.puppyObservations).map(x=>({...x}))}:a)};
    const puppy=next.animals.find(a=>a.id===original.id);
    const id=tidy(input?.id)||["puppy-obs",puppy.id,kind,date].join(":");
    const current=puppy.puppyObservations.find(row=>row.id===id);
    const entry={id,kind,date,notes,source:tidy(input?.source)||"breeder-recorded",
      ...(kind==="weight"?{grams}:{}),
      ...(kind==="veterinary-test"?{testName:tidy(input?.testName),result:tidy(input?.result),provider:tidy(input?.provider),evidenceRef:tidy(input?.evidenceRef)}:{})};
    if(kind==="veterinary-test"&&(!entry.testName||!entry.evidenceRef))
      return {valid:false,issues:["Veterinary tests require a named test and a reference to supporting evidence."],state};
    if(current){
      if(current.kind!==kind||current.date!==date)return {valid:false,issues:["Observation identity conflicts with existing evidence."],state};
      Object.assign(current,entry);
    } else puppy.puppyObservations.push(entry);
    puppy.puppyObservations.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
    return {valid:true,issues:[],state:next,record:entry};
  }
  function puppySummary(puppy){
    if(!isDog(puppy))return null;
    const items=arr(puppy.puppyObservations);
    const weights=items.filter(x=>x.kind==="weight"&&Number.isFinite(Number(x.grams))).sort((a,b)=>a.date.localeCompare(b.date));
    return {puppyId:tidy(puppy.id),lastWeight:weights.at(-1)||null,weightHistory:weights,
      veterinaryRecords:items.filter(x=>x.kind==="veterinary-test"||x.kind==="health"),
      developmentRecords:items.filter(x=>x.kind==="development"),
      needsSireReview:!tidy(puppy.sireId) && arr(puppy.potentialSires).length>0};
  }
  function whelpingPerformance(state,ownerId=""){
    const dogs=arr(state?.animals).filter(x=>isDog(x)&&(!ownerOf(x)||ownerOf(x)===tidy(ownerId)));
    const byDam=new Map();
    for(const w of arr(state?.canineWhelpings)){
      const dam=dogs.find(a=>a.id===w.damId||a.id===w.femaleId);
      if(!dam)continue;
      const s=byDam.get(dam.id)||{damId:dam.id,whelpings:0,puppies:0};
      s.whelpings++;
      s.puppies+=dogs.filter(a=>tidy(a.sourceBirthId)===tidy(w.id)).length;
      byDam.set(dam.id,s);
    }
    return [...byDam.values()];
  }
  return Object.freeze({VERSION:"2.0.3",addPuppyObservation,puppySummary,whelpingPerformance});
});
