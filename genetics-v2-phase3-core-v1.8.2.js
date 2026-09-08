(function(root,factory){
  "use strict";
  let phase1=null,phase2=null;
  if(typeof module==="object"&&module.exports){
    phase1=require("./genetics-v2-phase1-core-v1.8.2.js");
    phase2=require("./genetics-v2-phase2-core-v1.8.2.js");
  }else{
    phase1=root?.HerdHarborGeneticsV2Phase1Core||null;
    phase2=root?.HerdHarborGeneticsV2Phase2Core||null;
  }
  const api=factory(phase1,phase2);
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.HerdHarborGeneticsV2Phase3Core=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(Phase1,Phase2){
  "use strict";
  const VERSION="2.0.0-phase3";
  const clean=v=>String(v==null?"":v).trim();
  const lower=v=>clean(v).toLowerCase();
  const arr=(v,k)=>Array.isArray(v?.[k])?v[k]:[];
  const rabbit=a=>lower(a?.species).startsWith("rabbit");
  const byId=(rows,id)=>arr({rows},"rows").find(row=>String(row?.id)===String(id))||null;
  const unique=values=>[...new Set(values.map(clean).filter(Boolean))];

  function offspringForLitter(state={},litter={}){
    const ids=new Set(arr(litter,"offspringIds").map(String));
    return arr(state,"animals").filter(animal=>ids.has(String(animal.id))||String(animal.sourceBirthId||"")===String(litter.id));
  }

  function breedingForLitter(state={},litter={}){
    const breedings=arr(state,"breedings");
    if(clean(litter.breedingId)){
      const direct=breedings.find(row=>String(row.id)===String(litter.breedingId));
      if(direct)return direct;
    }
    return breedings.find(row=>String(row.litterId||"")===String(litter.id))||null;
  }

  function litterForOffspring(state={},animal={}){
    const litters=arr(state,"litters");
    if(clean(animal.sourceBirthId)){
      const direct=litters.find(row=>String(row.id)===String(animal.sourceBirthId));
      if(direct)return direct;
    }
    return litters.find(litter=>arr(litter,"offspringIds").some(id=>String(id)===String(animal.id)))||null;
  }

  function currentGoalContext(dam,sire){
    const rows=[dam,sire].filter(Boolean).map(parent=>({
      animalId:String(parent.id),
      name:parent.name||"Rabbit",
      goalId:clean(parent?.genetics?.breedingGoal?.goalId)
    })).filter(row=>row.goalId);
    const ids=unique(rows.map(row=>row.goalId));
    if(ids.length===1)return{goalId:ids[0],goal:Phase2?.goalById?.(ids[0])||null,ambiguous:false,parents:rows};
    if(ids.length>1)return{goalId:"",goal:null,ambiguous:true,parents:rows};
    return{goalId:"",goal:null,ambiguous:false,parents:[]};
  }

  function litterContext(state={},litterId){
    const litter=arr(state,"litters").find(row=>String(row.id)===String(litterId))||null;
    if(!litter)return null;
    const animals=arr(state,"animals"),dam=animals.find(row=>String(row.id)===String(litter.damId))||null,sire=animals.find(row=>String(row.id)===String(litter.sireId))||null;
    const offspring=offspringForLitter(state,litter),breeding=breedingForLitter(state,litter),goalContext=currentGoalContext(dam,sire);
    return{litter,dam,sire,offspring,breeding,goalContext};
  }

  function proofRowsForLitter(state={},litterId){
    const ctx=litterContext(state,litterId);if(!ctx)return[];
    const rows=[];
    for(const child of ctx.offspring){
      if(!rabbit(child))continue;
      for(const locus of Phase1?.DISPLAY_LOCI||[]){
        const proof=Phase1?.childProofAllele?.(child,locus);if(!proof)continue;
        for(const parent of [ctx.dam,ctx.sire]){
          if(!parent||!rabbit(parent))continue;
          rows.push({
            id:["gv2p3",String(litterId),String(parent.id),String(child.id),locus,proof.allele].join(":"),
            litterId:String(ctx.litter.id),breedingId:clean(ctx.breeding?.id),birthDate:clean(ctx.litter.birthDate),
            parentId:String(parent.id),parentName:parent.name||"Parent",childId:String(child.id),childName:child.name||"Offspring",
            locus,allele:proof.allele,basis:proof.basis,
            note:`${child.name||"Recorded offspring"} proves ${parent.name||"this parent"} supplied ${proof.allele} at ${locus} (${proof.basis}).`
          });
        }
      }
    }
    return rows;
  }

  function requirementSatisfied(child,req,goal){
    const genetics=Phase1?.normalizeGenetics?.(child?.genetics)||{loci:{}};
    const record=genetics.loci?.[req.locus]||{alleles:["_","_"]};
    if(Phase1?.knownPair?.(record.alleles)&&Phase2?.targetMatches?.(req,record.alleles))return{matched:true,basis:"resolved-genotype",locus:req.locus};
    if(req.type==="exact"&&Array.isArray(req.alleles)&&req.alleles.length===2&&req.alleles[0]===req.alleles[1]){
      const proof=Phase1?.phenotypeHomozygousProof?.(child,req.locus);
      if(proof&&proof===req.alleles[0])return{matched:true,basis:"recorded-phenotype",locus:req.locus};
    }
    const color=lower(child?.color||child?.variety);
    if(goal?.id==="broken"&&req.locus==="En"&&/\bbroken\b/.test(color)&&!/^charlie\b/.test(color))return{matched:true,basis:"recorded-phenotype",locus:req.locus};
    if(goal?.id==="harlequin"&&req.locus==="E"&&/\bharlequin\b/.test(color))return{matched:true,basis:"recorded-phenotype",locus:req.locus};
    return{matched:false,basis:"",locus:req.locus};
  }

  function childGoalMatch(child,goal){
    if(!goal)return{matched:false,identified:false,requirements:[]};
    const requirements=(goal.requirements||[]).map(req=>requirementSatisfied(child,req,goal));
    const genetics=Phase1?.normalizeGenetics?.(child?.genetics)||{loci:{}};
    const relevantResolved=(goal.requirements||[]).some(req=>Phase1?.knownPair?.(genetics.loci?.[req.locus]?.alleles));
    const identified=Boolean(clean(child?.color||child?.variety)||relevantResolved);
    return{matched:requirements.length>0&&requirements.every(row=>row.matched),identified,requirements};
  }

  function resolveGoal(ctx,goalId){
    if(clean(goalId))return Phase2?.goalById?.(goalId)||null;
    return ctx?.goalContext?.goal||null;
  }

  function goalProgressForLitter(state={},litterId,goalId=""){
    const ctx=litterContext(state,litterId);if(!ctx)return null;
    const goal=resolveGoal(ctx,goalId),matches=goal?ctx.offspring.map(child=>({child,match:childGoalMatch(child,goal)})):[];
    const identified=matches.filter(row=>row.match.identified),targets=matches.filter(row=>row.match.matched);
    let status="no-goal",label="No single breeding goal is attached to this litter";
    if(goal){
      if(!identified.length){status="waiting-for-identification";label="Record offspring colors or resolved genetics to measure this goal";}
      else if(targets.length){status="achieved";label=`${targets.length} recorded offspring match the current ${goal.label} goal`;}
      else{status="evidence-building";label=`No recorded offspring match the current ${goal.label} goal yet`;}
    }else if(ctx.goalContext.ambiguous){status="multiple-goals";label="The parents currently have different breeding goals";}
    return{
      goal,goalId:goal?.id||"",status,label,totalOffspring:ctx.offspring.length,identifiedCount:identified.length,targetCount:targets.length,
      targetAnimalIds:targets.map(row=>String(row.child.id)),
      note:"Observed litter results are not a replacement for predicted probabilities. A litter without a recessive target does not prove either parent is a non-carrier."
    };
  }

  function evidenceRowsForParent(state={},parentId){
    const animals=arr(state,"animals"),parent=animals.find(row=>String(row.id)===String(parentId));if(!parent)return[];
    const genetics=Phase1?.normalizeGenetics?.(parent.genetics)||{evidence:[]};
    return arr(genetics,"evidence").filter(item=>lower(item?.source||item?.evidenceType)==="offspring"&&clean(item.relatedAnimalId)).map(item=>{
      const child=animals.find(row=>String(row.id)===String(item.relatedAnimalId))||null,litter=child?litterForOffspring(state,child):null,breeding=litter?breedingForLitter(state,litter):null;
      return{...item,parentId:String(parent.id),parentName:parent.name||"Parent",child,childId:String(item.relatedAnimalId),childName:child?.name||"Recorded offspring",litter,litterId:clean(litter?.id),breeding,breedingId:clean(breeding?.id)};
    });
  }

  function animalLearningHistory(state={},animalId){
    const rows=evidenceRowsForParent(state,animalId),groups=new Map();
    for(const row of rows){
      const key=`${row.locus||"?"}:${row.allele||"?"}`;
      if(!groups.has(key))groups.set(key,{key,locus:row.locus||"?",allele:row.allele||"?",rows:[],offspringIds:new Set(),litterIds:new Set()});
      const group=groups.get(key);group.rows.push(row);if(row.childId)group.offspringIds.add(row.childId);if(row.litterId)group.litterIds.add(row.litterId);
    }
    const conclusions=[...groups.values()].map(group=>({
      key:group.key,locus:group.locus,allele:group.allele,label:`${group.locus}: ${group.allele} proven by offspring`,
      supportingOffspring:group.offspringIds.size,supportingLitters:group.litterIds.size,
      rows:group.rows.sort((a,b)=>String(b.updatedAt||b.createdAt||"").localeCompare(String(a.updatedAt||a.createdAt||""))),
      latest:group.rows.slice().sort((a,b)=>String(b.updatedAt||b.createdAt||"").localeCompare(String(a.updatedAt||a.createdAt||"")))[0]||null
    })).sort((a,b)=>b.supportingLitters-a.supportingLitters||b.supportingOffspring-a.supportingOffspring||a.key.localeCompare(b.key));
    return{animalId:String(animalId),rows,conclusions,totalEvidence:rows.length,offspringCount:new Set(rows.map(row=>row.childId).filter(Boolean)).size,litterCount:new Set(rows.map(row=>row.litterId).filter(Boolean)).size};
  }

  function litterLearningSummary(state={},litterId,goalId=""){
    const ctx=litterContext(state,litterId);if(!ctx)return null;
    const proofs=proofRowsForLitter(state,litterId),progress=goalProgressForLitter(state,litterId,goalId);
    const parentIds=new Set(proofs.map(row=>row.parentId)),childIds=new Set(proofs.map(row=>row.childId));
    const headline=proofs.length?`This litter added ${proofs.length} parent genetics proof record${proofs.length===1?"":"s"}.`:
      (ctx.offspring.some(child=>clean(child.color||child.variety))?"No new hidden allele was proven by the recorded offspring yet.":"Record offspring colors or traits and HerdHarbor will learn from this litter automatically.");
    return{
      ...ctx,proofs,progress,headline,parentsLearned:parentIds.size,offspringTeaching:childIds.size,
      rule:"No target offspring is not negative proof. HerdHarbor never marks a rabbit as a non-carrier simply because a litter did not produce the recessive trait."
    };
  }

  function goalProgressForAnimal(state={},animalId,goalId=""){
    const animals=arr(state,"animals"),animal=animals.find(row=>String(row.id)===String(animalId));if(!animal)return null;
    const resolvedGoalId=clean(goalId||animal?.genetics?.breedingGoal?.goalId),goal=resolvedGoalId?Phase2?.goalById?.(resolvedGoalId):null;
    const litters=arr(state,"litters").filter(litter=>String(litter.damId)===String(animalId)||String(litter.sireId)===String(animalId));
    const rows=litters.map(litter=>goalProgressForLitter(state,litter.id,resolvedGoalId)).filter(Boolean),identified=rows.reduce((n,row)=>n+row.identifiedCount,0),targets=rows.reduce((n,row)=>n+row.targetCount,0);
    return{animal,goal,goalId:goal?.id||"",litters:rows,litterCount:rows.length,identifiedCount:identified,targetCount:targets,successfulLitters:rows.filter(row=>row.targetCount>0).length};
  }

  function processState(state={},now=new Date().toISOString()){
    if(!Phase1?.propagateState)return{state,changed:0,updatedAnimalIds:[],evidenceCreated:0};
    return Phase1.propagateState(state,now);
  }

  return Object.freeze({
    VERSION,offspringForLitter,breedingForLitter,litterForOffspring,currentGoalContext,litterContext,proofRowsForLitter,
    requirementSatisfied,childGoalMatch,goalProgressForLitter,evidenceRowsForParent,animalLearningHistory,litterLearningSummary,
    goalProgressForAnimal,processState
  });
});