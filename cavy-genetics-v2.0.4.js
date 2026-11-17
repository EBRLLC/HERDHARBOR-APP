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

const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const familySource="cavy-family-inferred";
function familyRoan(sire,dam){
 const result=exactCross("roan",sire,dam);
 if(!result.probabilities)return null;
 const candidates=result.outcomes.map(row=>({genotype:row.genotype,probability:row.probability,risk:row.risk}));
 const deterministic=candidates.length===1?candidates[0].genotype.split("/"):null;
 return {source:familySource,status:deterministic?"strongly-inferred":"possible",
   alleles:deterministic||[],possibleGenotypes:candidates,
   relatedAnimalIds:[String(sire.id),String(dam.id)],
   note:"Recalculated from recorded parental roan genotypes; not DNA-confirmed."};
}
function reconcile(state){
 if(!state||!Array.isArray(state.animals))return {state,changed:0,skipped:true};
 const counts=new Map();
 for(const a of state.animals){const id=clean(a?.id);if(id)counts.set(id,(counts.get(id)||0)+1);}
 const unique=id=>!!id&&counts.get(id)===1;
 const byId=new Map(state.animals.filter(a=>unique(clean(a?.id))).map(a=>[clean(a.id),a]));
 let changed=0;
 const animals=state.animals.map(animal=>{
   if(!isCavy(animal)||!unique(clean(animal.id)))return animal;
   const previous=animal.genetics?.loci?.roan;
   const ownAutomatic=previous?.source===familySource;
   const isPup=!!clean(animal.sourceBirthId);
   if(!isPup&&!ownAutomatic)return animal;
   const sire=byId.get(clean(animal.sireId)),dam=byId.get(clean(animal.damId));
   const multiple=(animal.paternityStatus==="unresolved"||(!clean(animal.sireId)&&Array.isArray(animal.potentialSireIds)&&animal.potentialSireIds.length>0));
   const parentsSafe=sire&&dam&&sire!==dam&&sire!==animal&&dam!==animal&&isCavy(sire)&&isCavy(dam)&&
     !multiple&&clean(sire.sex).toLowerCase()==="male"&&clean(dam.sex).toLowerCase()==="female"&&
     (!clean(sire.ownerId)||!clean(dam.ownerId)||clean(sire.ownerId)===clean(dam.ownerId))&&
     (!clean(animal.ownerId)||!clean(sire.ownerId)||clean(animal.ownerId)===clean(sire.ownerId))&&
     (!clean(animal.ownerId)||!clean(dam.ownerId)||clean(animal.ownerId)===clean(dam.ownerId));
   const derived=parentsSafe?familyRoan(sire,dam):null;
   if(!ownAutomatic&&previous)return animal; // Preserve breeder and DNA entries
   if(!derived&&!ownAutomatic)return animal;
   if(same(previous,derived||undefined))return animal;
   const genetics=clone(animal.genetics||{}),loci={...(genetics.loci||{})};
   if(derived)loci.roan=derived;else delete loci.roan;
   genetics.loci=loci;
   changed++;
   return {...animal,genetics};
 });
 return {state:changed?{...state,animals}:state,changed,skipped:false};
}
const escapeHtml=x=>clean(x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function openForAnimal(animalId){
 const app=typeof globalThis!=="undefined"?globalThis.HerdHarborApp:null,doc=globalThis.document;
 const initial=app?.getState?.(),animal=initial?.animals?.filter(a=>clean(a?.id)===clean(animalId));
 if(!doc||!app?.commitState||!animal||animal.length!==1||!isCavy(animal[0]))return false;
 const target=animal[0],sessionId=clean(globalThis.HerdHarborCloud?.getSession?.()?.user?.id);
 if(clean(target.ownerId)&&clean(target.ownerId)!==sessionId)return false;
 const base=JSON.stringify(target);
 doc.getElementById("hh-cavy-genetics")?.remove();
 const overlay=doc.createElement("div");overlay.id="hh-cavy-genetics";
 overlay.style.cssText="position:fixed;inset:0;z-index:100003;background:rgba(0,0,0,.7);display:grid;place-items:center;padding:16px";
 const box=doc.createElement("section");
 box.style.cssText="background:var(--card,#fff);color:var(--text,#222);border-radius:12px;padding:20px;width:min(680px,100%);max-height:90vh;overflow:auto";
 const candidates=(initial.animals||[]).filter(x=>isCavy(x)&&clean(x.id)!==clean(target.id)&&
   clean(x.sex).toLowerCase()!==clean(target.sex).toLowerCase()&&
   ["male","female"].includes(clean(x.sex).toLowerCase())&&
   (!clean(target.ownerId)||!clean(x.ownerId)||clean(target.ownerId)===clean(x.ownerId))&&
   initial.animals.filter(y=>clean(y.id)===clean(x.id)).length===1&&
   !["sold","archived","deceased","ancestor only"].includes(clean(x.status).toLowerCase()));
 const roan=alleles(target,"roan").join("/");
 const values=["","Rn/rn","rn/rn","Rn/Rn"];
 box.innerHTML='<h2>Cavy genetics · '+escapeHtml(target.name)+'</h2>'+
 '<p>Breeder-reported genotype is not a DNA confirmation. Leave unknown alleles blank. Roan/Dalmatian pairings may produce lethal-white pups.</p>'+
 '<label>Roan locus genotype<select id="hh-cavy-genotype">'+values.map(v=>'<option value="'+escapeHtml(v)+'"'+(v===roan?' selected':'')+'>'+(v||"Unknown / not recorded")+'</option>').join("")+'</select></label>'+
 '<label>Genotype evidence/reference<input id="hh-cavy-genotype-evidence" maxlength="200" placeholder="Pedigree, test, or breeder observation" value="'+escapeHtml(target.genetics?.loci?.roan?.evidenceRef||"")+'"></label>'+
 '<button type="button" id="hh-cavy-genotype-save">Save genetic evidence</button>'+
 '<h3>Pairing predictor</h3><label>Other cavy<select id="hh-cavy-partner"><option value="">Choose other parent</option>'+
 candidates.map(x=>'<option value="'+escapeHtml(x.id)+'">'+escapeHtml(x.name||x.id)+'</option>').join("")+'</select></label>'+
 '<div id="hh-cavy-prediction" aria-live="polite"></div><p id="hh-cavy-genetic-error" role="alert"></p>'+
 '<button type="button" id="hh-cavy-genetics-close">Close</button>';
 overlay.appendChild(box);doc.body.appendChild(overlay);
 box.querySelector("#hh-cavy-genetics-close").addEventListener("click",()=>overlay.remove());
 const error=box.querySelector("#hh-cavy-genetic-error"),out=box.querySelector("#hh-cavy-prediction");
 const check=()=>{
   const live=app.getState?.(),a=(live?.animals||[]).filter(x=>clean(x.id)===clean(animalId));
   return sessionId===clean(globalThis.HerdHarborCloud?.getSession?.()?.user?.id)&&a.length===1&&JSON.stringify(a[0])===base?live:null;
 };
 const render=()=>{
   const id=box.querySelector("#hh-cavy-partner").value,p=candidates.find(x=>clean(x.id)===id);
   if(!p){out.textContent="Select an eligible cavy to compare.";return;}
   const result=predict(clean(target.sex).toLowerCase()==="male"?target:p,clean(target.sex).toLowerCase()==="female"?target:p);
   out.textContent=result.safety.message+" "+result.outcomes.map(row=>row.probabilities?
      row.outcomes.map(x=>x.genotype+": "+Math.round(x.probability*100)+"%").join("; "):
      "Exact roan-locus probabilities unavailable until both genotypes are recorded.").join(" ");
 };
 box.querySelector("#hh-cavy-partner").addEventListener("change",render);
 box.querySelector("#hh-cavy-genotype-save").addEventListener("click",()=>{
   const live=check();
   if(!live){error.textContent="Account or animal record changed; reopen genetics.";return;}
   const choice=box.querySelector("#hh-cavy-genotype").value;
   const evidence=clean(box.querySelector("#hh-cavy-genotype-evidence").value);
   if(choice&&!evidence){error.textContent="Provide an evidence reference for a recorded genotype.";return;}
   const profile=clone(target.genetics||{}),loci={...(profile.loci||{})};
   if(choice)loci.roan={alleles:choice.split("/"),status:"breeder-reported",source:"breeder-reported",evidenceRef:evidence};
   else delete loci.roan;
   profile.loci=loci;
   const edited={...target,genetics:profile,updatedAt:new Date().toISOString()};
   const changed={...live,animals:live.animals.map(x=>x===target?edited:x)};
   const computed=reconcile(changed);
   if(!app.commitState(computed.state)){error.textContent="Save failed; no genetics records changed.";return;}
   overlay.remove();
 });
 render();return true;
}

return Object.freeze({VERSION,LOCI,isCavy,roanSafety,exactCross,predict,familyRoan,reconcile,openForAnimal});
});
