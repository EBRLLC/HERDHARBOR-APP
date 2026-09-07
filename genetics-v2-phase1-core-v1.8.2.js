(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.HerdHarborGeneticsV2Phase1Core=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";

  const VERSION="2.0.0-phase1";
  const LOCI=Object.freeze({
    A:{name:"Agouti / tan-otter / self",dominance:["A","at","a"]},
    B:{name:"Black / chocolate pigment",dominance:["B","b"]},
    C:{name:"Full color / chinchilla / shaded / Himalayan / REW",dominance:["C","cchd","cchl","ch","c"]},
    D:{name:"Dense / dilute",dominance:["D","d"]},
    E:{name:"Extension / steel / harlequin / non-extension",dominance:["Ed","Es","E","ej","e"]},
    En:{name:"Broken spotting",dominance:["En","en"]},
    V:{name:"Vienna",dominance:["V","v"]}
  });
  const DISPLAY_LOCI=Object.freeze(["A","B","C","D","E","En","V"]);
  const SOURCE_STRENGTH=Object.freeze({
    "genetic-test":100,dna:100,offspring:95,pedigree:85,"parent-inheritance":75,
    breeder:75,user:75,phenotype:60,"strongly-inferred":55,inferred:50,
    possible:35,predicted:30,unknown:0,"":0
  });
  const CANONICAL_INHERITANCE_MIN=70;

  const clean=value=>String(value==null?"":value).trim();
  const lower=value=>clean(value).toLowerCase();
  const array=(value,key)=>Array.isArray(value?.[key])?value[key]:[];
  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const isRabbit=animal=>lower(animal?.species).startsWith("rabbit");
  const dateNow=()=>new Date().toISOString();

  function rankAllele(locus,allele){
    const index=LOCI[locus]?.dominance?.indexOf(allele);
    return index==null||index<0?999:index;
  }
  function sortPair(locus,pair){
    const values=Array.isArray(pair)?pair.slice(0,2):[];
    while(values.length<2)values.push("_");
    return values.map(value=>clean(value)||"_").sort((a,b)=>{
      if(a==="_")return b==="_"?0:1;
      if(b==="_")return -1;
      return rankAllele(locus,a)-rankAllele(locus,b);
    });
  }
  function pairKey(locus,pair){return sortPair(locus,pair).join("/");}
  function knownPair(pair){return Array.isArray(pair)&&pair.length===2&&pair.every(value=>clean(value)&&value!=="_");}
  function samePair(locus,left,right){return pairKey(locus,left)===pairKey(locus,right);}

  function normalizeRecord(locus,record){
    const raw=Array.isArray(record)?{alleles:record}:record&&typeof record==="object"?record:{};
    return{
      ...raw,
      alleles:sortPair(locus,raw.alleles),
      status:clean(raw.status)||"unknown",
      source:clean(raw.source||raw.evidenceType),
      evidenceType:clean(raw.evidenceType||raw.source),
      note:clean(raw.note),
      evidenceStrength:Number.isFinite(Number(raw.evidenceStrength))?Number(raw.evidenceStrength):undefined,
      updatedAt:raw.updatedAt||null
    };
  }
  function normalizeGenetics(genetics){
    const raw=genetics&&typeof genetics==="object"?clone(genetics):{};
    const loci={...(raw.loci&&typeof raw.loci==="object"?raw.loci:{})};
    DISPLAY_LOCI.forEach(locus=>{loci[locus]=normalizeRecord(locus,loci[locus]);});
    return{
      ...raw,
      version:Math.max(2,Number(raw.version)||0),
      species:"Rabbit",
      loci,
      evidence:Array.isArray(raw.evidence)?raw.evidence.slice():[],
      conflicts:Array.isArray(raw.conflicts)?raw.conflicts.slice():[],
      tests:Array.isArray(raw.tests)?raw.tests.slice():[]
    };
  }

  function evidenceStrength(record={}){
    const explicit=Number(record.evidenceStrength);
    if(Number.isFinite(explicit))return Math.max(0,Math.min(100,explicit));
    const source=lower(record.source||record.evidenceType);
    let score=SOURCE_STRENGTH[source]??0;
    const status=lower(record.status);
    if(!score){
      if(status==="confirmed")score=70;
      else if(status==="strongly-inferred"||status==="strongly inferred")score=55;
      else if(status==="inferred")score=50;
      else if(status==="possible")score=35;
      else if(status==="predicted")score=30;
    }
    return score;
  }

  function evidenceTier(record={}){
    const score=evidenceStrength(record);
    const source=lower(record.source||record.evidenceType);
    if(source==="genetic-test"||source==="dna")return{key:"dna",label:"Confirmed by DNA",score,tone:"proven"};
    if(source==="offspring")return{key:"offspring",label:"Proven by offspring",score,tone:"proven"};
    if(source==="pedigree")return{key:"pedigree",label:"Supported by pedigree",score,tone:"strong"};
    if(source==="parent-inheritance")return{key:"parent-inheritance",label:"Derived from parents",score,tone:score>=CANONICAL_INHERITANCE_MIN?"strong":"predicted"};
    if(source==="breeder"||source==="user")return{key:"breeder",label:"Breeder recorded",score,tone:"strong"};
    if(source==="phenotype")return{key:"phenotype",label:"Inferred from phenotype",score,tone:"inferred"};
    if(score>=90)return{key:"proven",label:"Proven evidence",score,tone:"proven"};
    if(score>=70)return{key:"strong",label:"Strong evidence",score,tone:"strong"};
    if(score>=45)return{key:"inferred",label:"Inferred",score,tone:"inferred"};
    if(score>0)return{key:"predicted",label:"Predicted / possible",score,tone:"predicted"};
    return{key:"unknown",label:"Unknown",score:0,tone:"unknown"};
  }

  function gametes(pair){return pair[0]===pair[1]?[[pair[0],1]]:[[pair[0],.5],[pair[1],.5]];}
  function crossLocus(locus,parent1,parent2){
    const a=sortPair(locus,parent1),b=sortPair(locus,parent2);
    if(!knownPair(a)||!knownPair(b))return[];
    const result=new Map();
    for(const [x,px] of gametes(a))for(const [y,py] of gametes(b)){
      const alleles=sortPair(locus,[x,y]);
      const key=pairKey(locus,alleles);
      const row=result.get(key)||{alleles,probability:0};
      row.probability+=px*py;result.set(key,row);
    }
    return[...result.values()].sort((x,y)=>y.probability-x.probability||pairKey(locus,x.alleles).localeCompare(pairKey(locus,y.alleles)));
  }
  function formatOutcomes(locus,outcomes=[]){return outcomes.map(row=>({genotype:pairKey(locus,row.alleles),probability:Number(row.probability)}));}

  function evidenceId(kind,parts){return["gv2p1",kind,...parts.map(value=>clean(value).replace(/[^a-zA-Z0-9_-]/g,"_"))].join(":");}
  function stableComparable(record={}){const copy={...record};delete copy.createdAt;delete copy.updatedAt;return JSON.stringify(copy);}
  function upsertEvidence(genetics,item,now){
    const list=genetics.evidence,index=list.findIndex(row=>String(row?.id||"")===String(item.id));
    if(index<0){list.push({...item,createdAt:now,updatedAt:now});return true;}
    const existing=list[index];if(stableComparable(existing)===stableComparable(item))return false;
    list[index]={...existing,...item,createdAt:existing.createdAt||now,updatedAt:now};return true;
  }
  function upsertConflict(genetics,item,now){
    const list=genetics.conflicts,index=list.findIndex(row=>String(row?.id||"")===String(item.id));
    if(index<0){list.push({...item,createdAt:now,updatedAt:now});return true;}
    const existing=list[index];if(stableComparable(existing)===stableComparable(item))return false;
    list[index]={...existing,...item,createdAt:existing.createdAt||now,updatedAt:now};return true;
  }

  function inheritanceEvidence(child,parent1,parent2,locus){
    const g1=normalizeGenetics(parent1.genetics),g2=normalizeGenetics(parent2.genetics);
    const r1=g1.loci[locus],r2=g2.loci[locus];
    if(!knownPair(r1.alleles)||!knownPair(r2.alleles))return null;
    const outcomes=crossLocus(locus,r1.alleles,r2.alleles);
    const parentStrength=Math.min(evidenceStrength(r1),evidenceStrength(r2));
    const exact=outcomes.length===1,supported=exact&&parentStrength>=CANONICAL_INHERITANCE_MIN;
    const note=exact
      ?`${child.name||"Offspring"} can only inherit ${pairKey(locus,outcomes[0].alleles)} at ${locus} from ${parent1.name||"parent"} ${pairKey(locus,r1.alleles)} × ${parent2.name||"parent"} ${pairKey(locus,r2.alleles)}.`
      :`${parent1.name||"Parent"} ${pairKey(locus,r1.alleles)} × ${parent2.name||"parent"} ${pairKey(locus,r2.alleles)} gives multiple possible ${locus} genotypes; HerdHarbor keeps these as predictions until evidence resolves the offspring.`;
    return{
      id:evidenceId("inherit",[child.id,locus]),kind:"parent-inheritance",locus,source:"parent-inheritance",
      status:supported?"strongly-inferred":"predicted",evidenceStrength:parentStrength,
      parentIds:[String(parent1.id),String(parent2.id)],parentGenotypes:{[String(parent1.id)]:pairKey(locus,r1.alleles),[String(parent2.id)]:pairKey(locus,r2.alleles)},
      possibleGenotypes:formatOutcomes(locus,outcomes),exact,supported,genotype:exact?sortPair(locus,outcomes[0].alleles):null,note
    };
  }

  function applyExactInheritance(genetics,locus,evidence,now){
    if(!evidence?.supported||!evidence?.genotype)return false;
    const record=genetics.loci[locus],incoming=sortPair(locus,evidence.genotype),existing=sortPair(locus,record.alleles);
    const incomingStrength=Number(evidence.evidenceStrength)||0,existingStrength=evidenceStrength(record);
    if(knownPair(existing)&&!samePair(locus,existing,incoming)){
      return upsertConflict(genetics,{id:evidenceId("conflict-inherit",[evidence.id]),kind:"evidence-conflict",locus,
        existingGenotype:pairKey(locus,existing),incomingGenotype:pairKey(locus,incoming),existingSource:record.source||record.evidenceType||"",incomingSource:"parent-inheritance",
        note:`Recorded ${locus} genotype conflicts with the exact genotype derived from the recorded parent genotypes. HerdHarbor did not silently overwrite the stronger/current record.`},now);
    }
    const canWrite=!knownPair(existing)||lower(record.source||record.evidenceType)==="parent-inheritance"||existingStrength<incomingStrength;
    if(!canWrite)return false;
    const equivalent=samePair(locus,record.alleles,incoming)&&lower(record.status)==="strongly-inferred"
      &&lower(record.source||record.evidenceType)==="parent-inheritance"&&Number(record.evidenceStrength||0)===incomingStrength&&clean(record.note)===clean(evidence.note);
    if(equivalent)return false;
    genetics.loci[locus]={...record,alleles:incoming,status:"strongly-inferred",source:"parent-inheritance",evidenceType:"parent-inheritance",evidenceStrength:incomingStrength,note:evidence.note,updatedAt:now};
    return true;
  }

  function phenotypeHomozygousProof(animal,locus){
    const color=lower(animal?.color||animal?.variety);if(!color)return null;
    if(locus==="V"&&(/\bblue[- ]?eyed white\b/.test(color)||/\bbew\b/.test(color)))return"v";
    if(locus==="B"&&(/\bchocolate\b/.test(color)||/\blilac\b/.test(color)))return"b";
    if(locus==="D"&&(/\bblue\b|\blilac\b|\bopal\b|\blynx\b|\bsquirrel\b|smoke pearl|\bcream\b/.test(color)))return"d";
    if(locus==="En"&&/^charlie\b/.test(color))return"En";
    if(locus==="C"&&(/\brew\b|red[- ]?eyed white|ruby[- ]?eyed white/.test(color)))return"c";
    return null;
  }
  function childProofAllele(child,locus){
    const genetics=normalizeGenetics(child.genetics),record=genetics.loci[locus];
    if(knownPair(record.alleles)&&record.alleles[0]===record.alleles[1])return{allele:record.alleles[0],source:record.source||"offspring",strength:Math.max(70,evidenceStrength(record)),basis:`recorded ${pairKey(locus,record.alleles)} genotype`};
    const allele=phenotypeHomozygousProof(child,locus);
    return allele?{allele,source:"phenotype",strength:60,basis:`recorded phenotype ${child.color||child.variety}`}:null;
  }
  function dominantAlleleProvenByPhenotype(parent,locus){
    const color=lower(parent?.color||parent?.variety);
    if(!color||/\brew\b|red[- ]?eyed white|ruby[- ]?eyed white|\bbew\b|blue[- ]?eyed white/.test(color))return null;
    if(locus==="B"){
      if(/\bchocolate\b|\blilac\b/.test(color))return null;
      if(/\bblack\b|\bblue\b|chestnut|\bopal\b|\btort\b|agouti|otter|harlequin|magpie|steel/.test(color))return"B";
    }
    if(locus==="D"){
      if(/\bblue\b|\blilac\b|\bopal\b|\blynx\b|\bsquirrel\b|smoke pearl|\bcream\b/.test(color))return null;
      if(/\bblack\b|\bchocolate\b|chestnut|agouti|otter|harlequin|magpie|steel/.test(color))return"D";
    }
    if(locus==="V")return"V";
    return null;
  }

  function applyOffspringProofToParent(parent,child,locus,proof,now){
    const genetics=normalizeGenetics(parent.genetics),record=genetics.loci[locus],allele=proof.allele;
    const evidence={id:evidenceId("offspring",[parent.id,child.id,locus,allele]),kind:"offspring-proof",locus,source:"offspring",status:"confirmed",evidenceStrength:95,relatedAnimalId:String(child.id),allele,
      note:`${child.name||"Recorded offspring"} provides evidence that ${parent.name||"this parent"} supplied ${allele} at ${locus} (${proof.basis}).`};
    let changed=upsertEvidence(genetics,evidence,now);const pair=sortPair(locus,record.alleles);
    if(knownPair(pair)){
      if(!pair.includes(allele))changed=upsertConflict(genetics,{id:evidenceId("conflict-offspring",[parent.id,child.id,locus,allele]),kind:"evidence-conflict",locus,
        existingGenotype:pairKey(locus,pair),incomingAllele:allele,existingSource:record.source||record.evidenceType||"",incomingSource:"offspring",
        note:`${child.name||"Offspring"} requires ${parent.name||"this parent"} to have supplied ${allele}, which conflicts with the recorded ${locus} genotype. The existing genotype was not silently changed.`},now)||changed;
      return{genetics,changed};
    }
    let nextPair=pair.slice();const dominant=dominantAlleleProvenByPhenotype(parent,locus);
    if(dominant&&dominant!==allele)nextPair=sortPair(locus,[dominant,allele]);
    else if(!nextPair.includes(allele)){
      const unknownIndex=nextPair.indexOf("_");if(unknownIndex>=0)nextPair[unknownIndex]=allele;else return{genetics,changed};
      nextPair=sortPair(locus,nextPair);
    }
    if(samePair(locus,pair,nextPair))return{genetics,changed};
    genetics.loci[locus]={...record,alleles:nextPair,source:"offspring",evidenceType:"offspring",status:knownPair(nextPair)?"confirmed":"strongly-inferred",evidenceStrength:95,note:evidence.note,updatedAt:now};
    return{genetics,changed:true};
  }

  function updateChildFromParents(child,parent1,parent2,now){
    let genetics=normalizeGenetics(child.genetics),changed=false;const inheritance=[];
    for(const locus of DISPLAY_LOCI){const evidence=inheritanceEvidence(child,parent1,parent2,locus);if(!evidence)continue;inheritance.push(evidence);changed=upsertEvidence(genetics,evidence,now)||changed;changed=applyExactInheritance(genetics,locus,evidence,now)||changed;}
    if(changed){genetics.updatedAt=now;return{animal:{...child,genetics,updatedAt:now},changed:true,inheritance};}
    return{animal:child,changed:false,inheritance};
  }

  function propagateState(state={},now=dateNow()){
    if(!state||!Array.isArray(state.animals))return{state,changed:0,updatedAnimalIds:[],evidenceCreated:0};
    const animals=state.animals.slice(),indexById=new Map(animals.map((animal,index)=>[String(animal.id),index]));
    const updatedIds=new Set();let evidenceCreated=0;
    for(let index=0;index<animals.length;index++){
      const child=animals[index];if(!isRabbit(child)||!clean(child.damId)||!clean(child.sireId))continue;
      const damIndex=indexById.get(String(child.damId)),sireIndex=indexById.get(String(child.sireId));if(damIndex==null||sireIndex==null)continue;
      const dam=animals[damIndex],sire=animals[sireIndex];if(!isRabbit(dam)||!isRabbit(sire))continue;
      const beforeEvidence=normalizeGenetics(child.genetics).evidence.length,result=updateChildFromParents(child,dam,sire,now);
      if(result.changed){animals[index]=result.animal;updatedIds.add(String(child.id));evidenceCreated+=Math.max(0,normalizeGenetics(result.animal.genetics).evidence.length-beforeEvidence);}
    }
    for(let childIndex=0;childIndex<animals.length;childIndex++){
      const child=animals[childIndex];if(!isRabbit(child))continue;
      const parentIds=[clean(child.damId),clean(child.sireId)].filter(Boolean);if(!parentIds.length)continue;
      for(const locus of DISPLAY_LOCI){const proof=childProofAllele(child,locus);if(!proof)continue;
        for(const parentId of parentIds){const parentIndex=indexById.get(String(parentId));if(parentIndex==null)continue;const parent=animals[parentIndex];if(!isRabbit(parent))continue;
          const beforeEvidence=normalizeGenetics(parent.genetics).evidence.length,result=applyOffspringProofToParent(parent,child,locus,proof,now);
          if(result.changed){const next={...parent,genetics:{...result.genetics,updatedAt:now},updatedAt:now};animals[parentIndex]=next;updatedIds.add(String(parent.id));evidenceCreated+=Math.max(0,normalizeGenetics(next.genetics).evidence.length-beforeEvidence);}
        }
      }
    }
    if(!updatedIds.size)return{state,changed:0,updatedAnimalIds:[],evidenceCreated:0};
    return{state:{...state,animals},changed:updatedIds.size,updatedAnimalIds:[...updatedIds],evidenceCreated};
  }

  function inheritanceForAnimal(state={},animalId){
    const animal=array(state,"animals").find(row=>String(row.id)===String(animalId));
    if(!animal||!isRabbit(animal))return{animal,parent1:null,parent2:null,rows:[]};
    const dam=array(state,"animals").find(row=>String(row.id)===String(animal.damId))||null,sire=array(state,"animals").find(row=>String(row.id)===String(animal.sireId))||null;
    if(!dam||!sire)return{animal,parent1:dam,parent2:sire,rows:[]};
    const rows=DISPLAY_LOCI.map(locus=>{const evidence=inheritanceEvidence(animal,dam,sire,locus);return evidence?{...evidence,locusName:LOCI[locus].name}:null;}).filter(Boolean);
    return{animal,parent1:dam,parent2:sire,rows};
  }

  function animalEvidenceSummary(animal={}){
    if(!isRabbit(animal))return{supported:false,loci:[],counts:{}};
    const genetics=normalizeGenetics(animal.genetics);
    const loci=DISPLAY_LOCI.map(locus=>{
      const record=genetics.loci[locus],tier=evidenceTier(record),evidence=genetics.evidence.filter(row=>String(row?.locus||"")===locus),conflicts=genetics.conflicts.filter(row=>String(row?.locus||"")===locus);
      return{locus,name:LOCI[locus].name,genotype:record.alleles.some(value=>value!=="_")?pairKey(locus,record.alleles):"Unknown",resolved:knownPair(record.alleles),source:record.source||record.evidenceType||"",status:record.status||"unknown",note:record.note||"",tier,evidenceCount:evidence.length,conflictCount:conflicts.length,evidence};
    });
    const counts={resolved:loci.filter(row=>row.resolved).length,evidenceBacked:loci.filter(row=>row.tier.score>0).length,proven:loci.filter(row=>row.tier.tone==="proven").length,conflicts:loci.reduce((sum,row)=>sum+row.conflictCount,0),predicted:loci.filter(row=>row.tier.tone==="predicted").length};
    return{supported:true,loci,counts,evidence:genetics.evidence,conflicts:genetics.conflicts};
  }

  return Object.freeze({VERSION,LOCI,DISPLAY_LOCI,SOURCE_STRENGTH,CANONICAL_INHERITANCE_MIN,sortPair,pairKey,knownPair,normalizeGenetics,evidenceStrength,evidenceTier,crossLocus,inheritanceEvidence,phenotypeHomozygousProof,childProofAllele,dominantAlleleProvenByPhenotype,applyOffspringProofToParent,updateChildFromParents,propagateState,inheritanceForAnimal,animalEvidenceSummary});
});