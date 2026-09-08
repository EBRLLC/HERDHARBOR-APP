(function(root,factory){
  "use strict";
  let phase1=null;
  if(typeof module==="object"&&module.exports){phase1=require("./genetics-v2-phase1-core-v1.8.2.js");}
  else phase1=root?.HerdHarborGeneticsV2Phase1Core||null;
  const api=factory(phase1);
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.HerdHarborGeneticsV2Phase2Core=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(Core){
  "use strict";
  const VERSION="2.0.0-phase2";
  const clean=v=>String(v==null?"":v).trim();
  const lower=v=>clean(v).toLowerCase();
  const arr=(v,k)=>Array.isArray(v?.[k])?v[k]:[];
  const rabbit=a=>lower(a?.species).startsWith("rabbit");
  const currentStatus=a=>!["sold","deceased","archived","ancestor only","transferred"].includes(lower(a?.status));
  const sexClass=a=>{const s=lower(a?.sex);if(["female","doe","f"].includes(s))return"female";if(["male","buck","m"].includes(s))return"male";return"";};
  const compatibleSex=(a,b)=>{const x=sexClass(a),y=sexClass(b);return Boolean(x&&y&&x!==y);};
  const exact=(locus,alleles)=>({type:"exact",locus,alleles});
  const expressive=(locus,predicate,label)=>({type:"predicate",locus,predicate,label});
  const GOALS=Object.freeze([
    {id:"dilute",label:"Dilute / blue-family genetics",short:"d/d",note:"Targets d/d at the D locus. The exact visible color still depends on the rabbit's other color loci.",requirements:[exact("D",["d","d"])],recessiveAlleles:{D:"d"}},
    {id:"chocolate",label:"Chocolate-family genetics",short:"b/b",note:"Targets b/b at the B locus. Other loci still determine the exact visible variety.",requirements:[exact("B",["b","b"])],recessiveAlleles:{B:"b"}},
    {id:"lilac",label:"Lilac-family genetics",short:"b/b + d/d",note:"Targets both chocolate and dilute. Other loci can still modify or mask the final phenotype.",requirements:[exact("B",["b","b"]),exact("D",["d","d"])],recessiveAlleles:{B:"b",D:"d"}},
    {id:"bew",label:"Blue-eyed white / Vienna",short:"v/v",note:"Targets v/v at the Vienna locus. HerdHarbor treats this as a genetic target, not a guarantee of show suitability.",requirements:[exact("V",["v","v"])],recessiveAlleles:{V:"v"}},
    {id:"rew",label:"Red-eyed white genetics",short:"c/c",note:"Targets c/c at the C locus. This can mask other color genetics underneath.",requirements:[exact("C",["c","c"])],recessiveAlleles:{C:"c"}},
    {id:"broken",label:"Broken pattern genetics",short:"En/en",note:"Targets En/en while also tracking the chance of En/En (Charlie-pattern) offspring.",requirements:[exact("En",["En","en"])],avoid:[exact("En",["En","En"])],recessiveAlleles:{}},
    {id:"harlequin",label:"Harlequin-pattern genetics",short:"eʲ/eʲ or eʲ/e",note:"Targets an E-locus combination capable of expressing harlequin pattern. A, C and other loci can still change the visible result.",requirements:[expressive("E",pair=>pair.includes("ej")&&pair.every(a=>a==="ej"||a==="e"),"ej without a more-dominant E allele")],recessiveAlleles:{E:"ej"}},
    {id:"self",label:"Self-pattern genetics",short:"a/a",note:"Targets a/a at the A locus. Other color loci determine the actual self color.",requirements:[exact("A",["a","a"])],recessiveAlleles:{A:"a"}}
  ]);
  const GOAL_MAP=Object.freeze(Object.fromEntries(GOALS.map(g=>[g.id,g])));
  function goalById(id){return GOAL_MAP[clean(id)]||GOALS[0];}
  function genetics(animal){return Core?.normalizeGenetics?Core.normalizeGenetics(animal?.genetics):{loci:{}};}
  function record(animal,locus){return genetics(animal).loci?.[locus]||{alleles:["_","_"],status:"unknown"};}
  function knownRecord(animal,locus){const r=record(animal,locus);return Boolean(Core?.knownPair?.(r.alleles));}
  function targetMatches(req,pair){
    if(req.type==="exact")return Core?.pairKey?.(req.locus,pair)===Core?.pairKey?.(req.locus,req.alleles);
    if(req.type==="predicate")return Boolean(req.predicate?.(Core?.sortPair?.(req.locus,pair)||pair));
    return false;
  }
  function locusProbability(a,b,req){
    const ar=record(a,req.locus),br=record(b,req.locus);
    if(!Core?.knownPair?.(ar.alleles)||!Core?.knownPair?.(br.alleles))return{known:false,locus:req.locus,probability:null,outcomes:[],confidence:0};
    const outcomes=Core.crossLocus(req.locus,ar.alleles,br.alleles);
    const probability=outcomes.reduce((sum,row)=>sum+(targetMatches(req,row.alleles)?Number(row.probability||0):0),0);
    const confidence=Math.min(Core.evidenceStrength(ar),Core.evidenceStrength(br));
    return{known:true,locus:req.locus,probability,outcomes,confidence,parentEvidence:[Core.evidenceTier(ar),Core.evidenceTier(br)]};
  }
  function avoidProbability(a,b,goal){
    const rows=(goal.avoid||[]).map(req=>locusProbability(a,b,req));
    if(!rows.length)return{known:true,probability:0,rows:[]};
    if(rows.some(r=>!r.known))return{known:false,probability:null,rows};
    return{known:true,probability:1-rows.reduce((safe,r)=>safe*(1-r.probability),1),rows};
  }
  function proofBreedingOpportunities(a,b,goal){
    const out=[];
    for(const req of goal.requirements||[]){
      const allele=goal.recessiveAlleles?.[req.locus];if(!allele)continue;
      const ar=record(a,req.locus),br=record(b,req.locus),ak=Core?.knownPair?.(ar.alleles),bk=Core?.knownPair?.(br.alleles);
      const aTester=ak&&ar.alleles[0]===allele&&ar.alleles[1]===allele;
      const bTester=bk&&br.alleles[0]===allele&&br.alleles[1]===allele;
      if(aTester&&!bk)out.push({locus:req.locus,allele,unknownAnimalId:String(b.id),testerAnimalId:String(a.id),unknownName:b.name||"mate",testerName:a.name||"rabbit"});
      if(bTester&&!ak)out.push({locus:req.locus,allele,unknownAnimalId:String(a.id),testerAnimalId:String(b.id),unknownName:a.name||"rabbit",testerName:b.name||"mate"});
    }
    return out;
  }
  function pairGoalProbability(a,b,goalInput){
    const goal=typeof goalInput==="string"?goalById(goalInput):goalInput||GOALS[0];
    const loci=(goal.requirements||[]).map(req=>locusProbability(a,b,req));
    const fullyKnown=loci.length>0&&loci.every(r=>r.known);
    const probability=fullyKnown?loci.reduce((p,r)=>p*r.probability,1):null;
    const confidence=fullyKnown?Math.min(...loci.map(r=>r.confidence)):0;
    const avoid=avoidProbability(a,b,goal);
    return{goal,loci,fullyKnown,probability,confidence,avoid,proofOpportunities:proofBreedingOpportunities(a,b,goal)};
  }
  function evidenceRoute(a,b,result){
    if(result.fullyKnown&&result.confidence>=70){
      if(result.probability>0)return{key:"no-test",label:"No test needed",tone:"good",text:`The required loci are already resolved strongly enough to calculate this mating. Use the recorded genetics, then let the litter add more evidence.`};
      return{key:"known-zero",label:"No test needed to rule this pairing out",tone:"neutral",text:"The recorded genotypes are already strong enough to show this pairing is not expected to produce the selected target."};
    }
    if(result.fullyKnown){return{key:"record-strength",label:"Use records first",tone:"info",text:"HerdHarbor can calculate this cross, but some parent evidence is still weak. Pedigree, phenotype or offspring evidence can strengthen it; DNA testing is optional."};}
    if(result.proofOpportunities.length){
      const loci=[...new Set(result.proofOpportunities.map(x=>x.locus))].join(", ");
      return{key:"proof-breed",label:"Proof breeding can answer this",tone:"good",text:`This pairing can expose unresolved ${loci} genetics without a blood test. A target/recessive offspring can prove the hidden allele. A litter without one does not prove the parent lacks it.`};
    }
    return{key:"more-evidence",label:"More evidence needed",tone:"info",text:"HerdHarbor cannot responsibly give an exact percentage yet. Record phenotype, pedigree and real offspring first. A genetic test is only an optional shortcut if you want immediate resolution."};
  }
  function candidateScore(subject,mate,result){
    let score=0;
    if(result.fullyKnown){score=30+(Number(result.probability||0)*60)+(Number(result.confidence||0)/10);}
    else if(result.proofOpportunities.length){score=35+Math.min(30,result.proofOpportunities.length*12);}
    else score=15;
    if(clean(subject?.breed)&&lower(subject.breed)===lower(mate?.breed))score+=5;
    if(result.avoid?.known&&result.avoid.probability)score-=result.avoid.probability*35;
    return Math.max(0,Math.min(100,Math.round(score)));
  }
  function candidateSummary(subject,mate,goal){
    const result=pairGoalProbability(subject,mate,goal),route=evidenceRoute(subject,mate,result),score=candidateScore(subject,mate,result);
    const unknownLoci=result.loci.filter(r=>!r.known).map(r=>r.locus);
    return{mateId:String(mate.id),mateName:mate.name||"Unnamed rabbit",breed:mate.breed||"",sex:mate.sex||"",score,probability:result.probability,probabilityKnown:result.fullyKnown,confidence:result.confidence,avoidProbability:result.avoid.probability,avoidKnown:result.avoid.known,unknownLoci,proofOpportunities:result.proofOpportunities,route,result};
  }
  function rankCandidates(state,animalId,goalId){
    const animals=arr(state,"animals"),subject=animals.find(a=>String(a.id)===String(animalId));
    if(!subject||!rabbit(subject))return{subject:null,goal:goalById(goalId),candidates:[]};
    const goal=goalById(goalId||subject?.genetics?.breedingGoal?.goalId);
    const candidates=animals.filter(a=>String(a.id)!==String(subject.id)&&rabbit(a)&&currentStatus(a)&&compatibleSex(subject,a)).map(m=>candidateSummary(subject,m,goal)).sort((a,b)=>b.score-a.score||(b.probability||0)-(a.probability||0)||a.mateName.localeCompare(b.mateName));
    return{subject,goal,candidates};
  }
  function planForAnimal(state,animalId,goalId){
    const ranked=rankCandidates(state,animalId,goalId),best=ranked.candidates[0]||null;
    const next=best?best.route:{key:"no-mates",label:"Add a compatible mate",tone:"neutral",text:"HerdHarbor needs at least one current opposite-sex rabbit in the herd to compare breeding paths."};
    return{...ranked,best,next,disclaimer:"Genetic goals describe the tracked loci only. Other loci, modifiers, health, type, pedigree and breed standards still matter when choosing a real mating."};
  }
  return Object.freeze({VERSION,GOALS,goalById,sexClass,compatibleSex,targetMatches,locusProbability,pairGoalProbability,proofBreedingOpportunities,evidenceRoute,candidateSummary,rankCandidates,planForAnimal});
});