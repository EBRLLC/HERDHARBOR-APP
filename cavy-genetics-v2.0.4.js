(function(root,factory){"use strict";const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root)root.HerdHarborCavyGenetics=api;})(typeof globalThis!=="undefined"?globalThis:this,function(){"use strict";
const VERSION="2.0.4";
const clean=v=>String(v==null?"":v).trim();
const isCavy=a=>/^(cavy|cavies|guinea pigs?|guinea-pigs?)$/i.test(clean(typeof a==="string"?a:a?.species));
const LOCI=Object.freeze({
  roan: Object.freeze({alleles:["Rn","rn"],note:"Conventional dominant roan/Dalmatian inheritance model; homozygous Rn/Rn is associated with lethal-white syndrome. Genotypes must be evidenced, not inferred from coat color alone."})
});
const PHENOTYPE_SAFETY=/\b(roan|dalmatian)\b/i;
function roanSafety(sire,dam){
  const a=clean(sire?.cavy?.coatPattern||sire?.coatPattern||sire?.variety);
  const b=clean(dam?.cavy?.coatPattern||dam?.coatPattern||dam?.variety);
  const genotype=r=>r?.genetics?.loci?.roan?.alleles||r?.cavy?.genetics?.loci?.roan?.alleles||[];
  const hasRisk=r=>Array.isArray(genotype(r))&&genotype(r).includes("Rn");
  const risks=[PHENOTYPE_SAFETY.test(a)||hasRisk(sire),PHENOTYPE_SAFETY.test(b)||hasRisk(dam)];
  return {flagged:risks.some(Boolean),highRisk:risks.every(Boolean),
   status:risks.every(Boolean)?"do-not-pair":risks.some(Boolean)?"requires-pedigree-review":"not-excluded",
   message:risks.every(Boolean)?"Both parents show or record the roan/Dalmatian factor. Avoid this mating due to lethal-white risk.":risks.some(Boolean)?"Roan/Dalmatian factor indicated. Review the other parent's family history and genotype; an unmarked animal is not proof of a safe pairing.":"No roan/Dalmatian factor recorded; absence of a record is not proof of genetic absence."};
}
function alleles(record,locus){
 const item=record?.genetics?.loci?.[locus]||record?.cavy?.genetics?.loci?.[locus];
 const arr=item?.alleles;
 return Array.isArray(arr)?arr.map(clean):[];
}
function exactCross(locus,sire,dam){
 const definition=LOCI[locus];
 if(!definition)return {locus,status:"unsupported",probabilities:false,outcomes:[]};
 const a=alleles(sire,locus),b=alleles(dam,locus);
 if(a.length!==2||b.length!==2||[...a,...b].some(v=>!definition.alleles.includes(v)))
   return {locus,status:"insufficient-genotypes",probabilities:false,outcomes:[],notice:"Two known alleles must be recorded for both parents; no percentages calculated."};
 const frequencies=new Map();
 for(const x of a)for(const y of b){
   const pair=[x,y].sort((x,y)=>definition.alleles.indexOf(x)-definition.alleles.indexOf(y));
   const name=pair.join("/");frequencies.set(name,(frequencies.get(name)||0)+0.25);
 }
 return {locus,status:"exact-mendelian-model",probabilities:true,outcomes:[...frequencies].map(([genotype,probability])=>({genotype,probability,risk:locus==="roan"&&genotype==="Rn/Rn"?"lethal-white-associated":null})),note:definition.note};
}
function predict(sire,dam){
 if(!isCavy(sire)||!isCavy(dam))return {supported:false,error:"Both animals must be cavies."};
 const safety=roanSafety(sire,dam);
 const outcomes=Object.keys(LOCI).map(locus=>exactCross(locus,sire,dam));
 return {supported:true,species:"cavy",safety,outcomes,coatColorPercentages:null,
   notice:"Independent locus probabilities are calculated only from recorded, complete genotypes. Coat color, pattern and hair texture are not reliably predictable from phenotype labels alone. No combined coat-color percentages are asserted."};
}
return Object.freeze({VERSION,LOCI,isCavy,roanSafety,exactCross,predict});
});
