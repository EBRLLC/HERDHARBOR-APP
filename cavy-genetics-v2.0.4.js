(function(root,factory){"use strict";const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root)root.HerdHarborCavyGenetics=api;})(typeof globalThis!=="undefined"?globalThis:this,function(){"use strict";
const VERSION="2.0.4";
const clean=v=>String(v==null?"":v).trim();
const isCavy=a=>/^(cavy|cavies|guinea pigs?|guinea-pigs?)$/i.test(clean(typeof a==="string"?a:a?.species));
const LOCI=Object.freeze({
  roan: Object.freeze({label:"Roan / Dalmatian factor (conventional model)",alleles:["Rn","rn"],scientificStatus:"historical-breeding-model",molecularMarker:false,sourceUrl:"https://www.britishcavycouncil.org.uk/Resources/Cavy%20Genetics%20Article%20October%202008%20rev%20A.pdf",note:"Conventional two-allele breeding model only, not a laboratory-validated molecular Rn marker. Roan/Dalmatian inheritance may involve a broader allelic series; the homozygous risk class is associated with lethal-white syndrome."}),
  "asip-del4": Object.freeze({label:"ASIP recessive-black variant (c.181_184delTTCA)",alleles:["N","del4"],gene:"ASIP",variant:"c.181_184delTTCA",scientificStatus:"published-variant",molecularMarker:true,sourceUrl:"https://omia.org/OMIA000201/10141/",note:"Published recessive black associated variant. The named deletion does not establish full visible coat phenotype."}),
  "fgf5-c403t": Object.freeze({label:"FGF5 long-hair variant (c.403C>T)",alleles:["C","T"],gene:"FGF5",variant:"c.403C>T",scientificStatus:"published-variant",molecularMarker:true,sourceUrl:"https://omia.org/OMIA000439/10141/",note:"Yu et al. (2018) found a recessive long-hair association: all 70 long-haired cavies in the sample were T/T, while 141 short-haired cavies were C/C or C/T. Transmission of this specific variant does not determine every coat texture or all long-hair genetic causes."})
});
const PHENOTYPE_SAFETY=/\b(roan|dalmatian|dalmation)\b/i;
function roanSafety(sire,dam){
  const phenotype=a=>[a?.cavy?.coatPattern,a?.cavy?.variety,a?.cavy?.coatColor,a?.coatPattern,a?.variety,a?.color].map(clean).filter(Boolean).join(" ");
  const a=phenotype(sire),b=phenotype(dam);
  const record=r=>r?.genetics?.loci?.roan||r?.cavy?.genetics?.loci?.roan||{};
  const observed=(r,coat)=>PHENOTYPE_SAFETY.test(coat)||(Array.isArray(record(r).alleles)&&record(r).alleles.includes("Rn"));
  const possible=r=>Array.isArray(record(r).possibleGenotypes)&&record(r).possibleGenotypes.some(row=>
    (row.probability==null||Number(row.probability)>0)&&String(row.genotype).split("/").includes("Rn"));
  const riskKnown=[observed(sire,a),observed(dam,b)],riskPossible=[possible(sire),possible(dam)];
  const highRisk=riskKnown.every(Boolean),uncertainRisk=!highRisk&&
    (riskKnown.some(Boolean)||riskPossible.some(Boolean));
  return {flagged:highRisk||uncertainRisk,highRisk,possibleRisk:riskPossible.some(Boolean),
   status:highRisk?"do-not-pair":uncertainRisk?"requires-pedigree-review":"not-excluded",
   message:highRisk?"Both parents show or record the roan/Dalmatian factor. Avoid this mating due to lethal-white risk.":
     uncertainRisk?"Roan/Dalmatian factor indicated or possible by parentage. Treat untested partners as uncertain; do not assume a mating is safe without pedigree and genotype review.":
     "No roan/Dalmatian factor recorded; absence of a record is not proof of genetic absence."};
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
 return {locus,status:"conditional-mendelian-model",probabilities:true,evidenceLevel:definition.scientificStatus,conditionalOn:"Recorded parental genotype calls and the stated inheritance model; not verified phenotype or DNA confirmation.",outcomes:[...frequencies].map(([genotype,probability])=>({genotype,probability,risk:locus==="roan"&&genotype==="Rn/Rn"?"lethal-white-associated":null,interpretation:locus==="asip-del4"?(genotype==="del4/del4"?"two deletion copies; associated with recessive black":genotype==="N/del4"?"carrier of the named deletion":"no copy of the named deletion"):locus==="fgf5-c403t"?(genotype==="T/T"?"homozygous variant; associated with recessive long hair":genotype==="C/T"?"heterozygous variant carrier":"two reference allele copies at this variant"):"roan-locus genotype only"})),note:definition.note};
}
function predict(sire,dam){
 if(!isCavy(sire)||!isCavy(dam))return {supported:false,error:"Both animals must be cavies."};
 const safety=roanSafety(sire,dam);
 const outcomes=Object.keys(LOCI).map(locus=>exactCross(locus,sire,dam));
 return {supported:true,species:"cavy",safety,outcomes,coatColorPercentages:null,
   notice:"Conditional per-locus Mendelian probabilities assume both parental genotypes were correctly identified. Roan uses historical breeder notation, not an established DNA marker. ASIP and FGF5 each track only their specified molecular variant. None establishes full coat-color or texture probabilities."};
}

const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const familySource="cavy-family-inferred";
// A pedigree, even an imported one, is not a trusted source if a parent path cycles.
// Return "unsafe" for abnormally deep chains rather than silently using a truncated tree.
function ancestryCycle(id,byId){
 const visiting=new Set(),visited=new Set();
 const visit=(animalId,depth)=>{
   if(!animalId||!byId.has(animalId))return false;
   if(depth>128||visiting.has(animalId))return true;
   if(visited.has(animalId))return false;
   visiting.add(animalId);
   const animal=byId.get(animalId);
   const cyclic=[clean(animal.sireId),clean(animal.damId)].some(parentId=>visit(parentId,depth+1));
   visiting.delete(animalId);visited.add(animalId);
   return cyclic;
 };
 return visit(id,0);
}
function sharedAccount(animal,sire,dam){
 const ids=[animal,sire,dam].map(a=>clean(a?.ownerId));
 return ids.every(v=>!v)||ids.every(v=>!!v&&v===ids[0]);
}
function parentageSupported(animal){
 const status=clean(animal?.paternityStatus).toLowerCase();
 if(["unresolved","unknown","recorded-unverified"].includes(status))return false;
 const potential=Array.isArray(animal?.potentialSireIds)?animal.potentialSireIds.filter(Boolean):[];
 if(!clean(animal?.sireId)&&potential.length)return false;
 // A birth-linked pup must have explicit, traceable paternity to inherit
 // a specific model genotype; old records without evidence remain unverified.
 if(clean(animal?.sourceBirthId))return status==="breeder-attributed"&&
   !!clean(animal?.paternityEvidence?.reference||animal?.parentageEvidenceRef);
 return true;
}
function familyLocus(locus,sire,dam){
 const definition=LOCI[locus];
 if(!definition)return null;
 const valid=pair=>Array.isArray(pair)&&pair.length===2&&pair.every(a=>definition.alleles.includes(a));
 const name=pair=>pair.slice().sort((a,b)=>definition.alleles.indexOf(a)-definition.alleles.indexOf(b)).join("/");
 const options=record=>{
   const fixed=alleles(record,locus);
   if(valid(fixed))return [fixed];
   const inferred=record?.genetics?.loci?.[locus]||record?.cavy?.genetics?.loci?.[locus];
   if(inferred?.source!==familySource||!Array.isArray(inferred.possibleGenotypes))return [];
   return inferred.possibleGenotypes.filter(row=>row.probability==null||Number(row.probability)>0)
     .map(row=>clean(row.genotype).split("/")).filter(valid);
 };
 const a=options(sire),b=options(dam);
 if(!a.length||!b.length)return null;
 const exact=a.length===1&&b.length===1;
 const genotypeWeights=new Map();
 if(exact){
   for(const x of a[0])for(const y of b[0]){
     const genotype=name([x,y]);genotypeWeights.set(genotype,(genotypeWeights.get(genotype)||0)+0.25);
   }
 }else{
   // Ancestral genotypes are ambiguous. Do NOT multiply marginal probabilities:
   // linked pedigree branches may be genetically correlated. Keep a possible set.
   for(const left of a)for(const right of b)for(const x of left)for(const y of right)
     genotypeWeights.set(name([x,y]),null);
 }
 const candidates=[...genotypeWeights].map(([genotype,probability])=>({
   genotype,probability,risk:locus==="roan"&&genotype==="Rn/Rn"?"lethal-white-associated":null
 }));
 const deterministic=exact&&candidates.length===1?candidates[0].genotype.split("/"):null;
 return {source:familySource,status:deterministic?"model-inferred":"possible",
   alleles:deterministic||[],possibleGenotypes:candidates,
   relatedAnimalIds:[clean(sire.id),clean(dam.id)],
   note:exact?"Conditional Mendelian model from recorded parental genotypes; not independently DNA-confirmed.":
     "Only possible genotypes are shown: inferred ancestor genotypes or linked pedigree branches are uncertain, so no exact probabilities can be justified."};
}
function reconcile(state){
 if(!state||!Array.isArray(state.animals))return {state,changed:0,skipped:true};
 const counts=new Map();
 for(const a of state.animals){const id=clean(a?.id);if(id)counts.set(id,(counts.get(id)||0)+1);}
 const unique=id=>!!id&&counts.get(id)===1;
 const byId=new Map(state.animals.filter(a=>unique(clean(a?.id))).map(a=>[clean(a.id),a]));
 const resolved=new Map(),visiting=new Set();
 let changed=0;
 const resolve=id=>{
   if(!byId.has(id))return null;
   if(resolved.has(id))return resolved.get(id);
   if(visiting.has(id))return byId.get(id); // no inferred use from a cyclic pedigree
   visiting.add(id);
   const animal=byId.get(id);
   for(const parentId of [clean(animal.sireId),clean(animal.damId)]){
     if(parentId&&unique(parentId))resolve(parentId);
   }
   visiting.delete(id);
   if(!isCavy(animal)){resolved.set(id,animal);return animal;}
   const sire=resolved.get(clean(animal.sireId)),dam=resolved.get(clean(animal.damId));
   const birthLinked=!!clean(animal.sourceBirthId);
   const eligible=birthLinked||(!!clean(animal.sireId)&&!!clean(animal.damId));
   const safe=sire&&dam&&sire!==dam&&sire!==animal&&dam!==animal&&
     isCavy(sire)&&isCavy(dam)&&parentageSupported(animal)&&
     clean(sire.sex).toLowerCase()==="male"&&clean(dam.sex).toLowerCase()==="female"&&
     sharedAccount(animal,sire,dam)&&!ancestryCycle(id,byId);
   const oldLoci=animal.genetics?.loci||{};
   let loci=null;
   for(const locus of Object.keys(LOCI)){
     const previous=oldLoci[locus],automatic=previous?.source===familySource;
     if((!eligible&&!automatic)||(previous&&!automatic))continue;
     const derived=safe?familyLocus(locus,sire,dam):null;
     if(!derived&&!automatic)continue;
     if(same(previous,derived||undefined))continue;
     if(!loci)loci={...oldLoci};
     if(derived)loci[locus]=derived;else delete loci[locus];
   }
   const next=loci?{...animal,genetics:{...(animal.genetics||{}),loci}}:animal;
   if(loci)changed++;
   resolved.set(id,next);
   return next;
 };
 for(const id of byId.keys())resolve(id);
 if(!changed)return {state,changed:0,skipped:false};
 const animals=state.animals.map(a=>unique(clean(a?.id))?resolved.get(clean(a.id))||a:a);
 return {state:{...state,animals},changed,skipped:false};
}
const familyRoan=(sire,dam)=>familyLocus("roan",sire,dam);

function pedigreeConflicts(state){
 const animals=Array.isArray(state?.animals)?state.animals:[];
 const counts=new Map();
 for(const a of animals){const id=clean(a?.id);if(id)counts.set(id,(counts.get(id)||0)+1);}
 const byId=new Map(animals.filter(a=>clean(a?.id)&&counts.get(clean(a.id))===1).map(a=>[clean(a.id),a]));
 const conflicts=[];
 for(const animal of animals){
  if(!isCavy(animal)||counts.get(clean(animal.id))!==1)continue;
  if(!parentageSupported(animal)||ancestryCycle(clean(animal.id),byId))continue;
  const sire=byId.get(clean(animal.sireId)),dam=byId.get(clean(animal.damId));
  if(!sire||!dam||!isCavy(sire)||!isCavy(dam)||sire===animal||dam===animal||sire===dam)continue;
  if(clean(sire.sex).toLowerCase()!=="male"||clean(dam.sex).toLowerCase()!=="female")continue;
  if(!sharedAccount(animal,sire,dam))continue;
  for(const locus of Object.keys(LOCI)){
    const observed=alleles(animal,locus);
    if(observed.length!==2||observed.some(a=>!LOCI[locus].alleles.includes(a)))continue;
    const predicted=exactCross(locus,sire,dam);
    if(!predicted.probabilities)continue;
    const sameGenotype=(a,b)=>a.length===2&&b.length===2&&a.slice().sort().join("|")===b.slice().sort().join("|");
    if(predicted.outcomes.some(row=>sameGenotype(row.genotype.split("/"),observed)))continue;
    conflicts.push({source:"cavy-family-review",status:"review-required",animalId:clean(animal.id),
      sireId:clean(sire.id),damId:clean(dam.id),locus,genotype:observed.slice(),
      reason:"Recorded genotype is incompatible with the listed parental genotypes under the stated model. Review evidence and parentage; no records were changed."});
  }
 }
 return conflicts;
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
 const candidates=(initial.animals||[]).filter(x=>isCavy(x)&&["male","female"].includes(clean(target.sex).toLowerCase())&&clean(x.id)!==clean(target.id)&&
   clean(x.sex).toLowerCase()!==clean(target.sex).toLowerCase()&&
   ["male","female"].includes(clean(x.sex).toLowerCase())&&
   (!clean(x.ownerId)||clean(x.ownerId)===sessionId)&&
   (!clean(target.ownerId)||!clean(x.ownerId)||clean(target.ownerId)===clean(x.ownerId))&&
   initial.animals.filter(y=>clean(y.id)===clean(x.id)).length===1&&
   !["sold","archived","deceased","ancestor only"].includes(clean(x.status).toLowerCase()));
 const genotypeFields=Object.entries(LOCI).map(([locus,def])=>{
  const values=locus==="roan"?["","Rn/rn","rn/rn","Rn/Rn"]:locus==="asip-del4"?["","N/N","N/del4","del4/del4"]:["","C/C","C/T","T/T"];
  const current=alleles(target,locus).join("/");
  const existing=target.genetics?.loci?.[locus]||{};
  const reference=existing.evidenceRef||"";
  const locked=existing.source==="dna-confirmed"||existing.status==="dna-confirmed";
  return '<div><label>'+escapeHtml(def.label)+'<select data-cavy-genotype="'+escapeHtml(locus)+'"'+(locked?' disabled':'')+'>'+values.map(v=>'<option value="'+escapeHtml(v)+'"'+(v===current?' selected':'')+'>'+(v||"Unknown / not recorded")+'</option>').join("")+'</select></label>'+
   '<label>Evidence reference<input maxlength="200" data-cavy-evidence="'+escapeHtml(locus)+'" value="'+escapeHtml(reference)+'" placeholder="Genetic test or breeder record"'+(locked?' disabled':'')+'></label>'+
   (locked?'<p>DNA-confirmed evidence is read-only here; use the dedicated evidence-correction workflow to change it.</p>':
    '<label><input type="checkbox" data-cavy-clear="'+escapeHtml(locus)+'"> Clear this locus record</label>')+'</div>';
 }).join("");
 box.innerHTML='<h2>Cavy genetics · '+escapeHtml(target.name)+'</h2>'+
 '<p>Breeder-reported genotype is not a DNA confirmation. Leave unknown alleles blank. Roan/Dalmatian pairings may produce lethal-white pups.</p>'+
 genotypeFields+
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
   const live=app.getState?.(),match=(live?.animals||[]).filter(x=>clean(x?.id)===id);
   if(!check()||match.length!==1||JSON.stringify(match[0])!==JSON.stringify(p)){
      out.textContent="Record changed; reopen genetics to compare current records.";return;
   }
   const result=predict(clean(target.sex).toLowerCase()==="male"?target:p,clean(target.sex).toLowerCase()==="female"?target:p);
   const contradictions=pedigreeConflicts(live).filter(x=>[clean(target.id),clean(p.id)].includes(x.animalId));
   out.textContent=(contradictions.length?"GENETIC RECORD CONFLICT: "+contradictions.map(x=>x.animalId+" / "+x.locus).join(", ")+". Review ancestry and genotype evidence before relying on a prediction. ":"")+
     result.safety.message+" "+result.outcomes.map(row=>row.probabilities?
     LOCI[row.locus].label+" ("+LOCI[row.locus].scientificStatus+"): "+row.outcomes.map(x=>x.genotype+": "+Math.round(x.probability*100)+"%").join("; "):
     LOCI[row.locus].label+": parental allele records incomplete (no percentages).").join(" ")+
     " These probabilities are conditional on the recorded genotypes and the inheritance model, not full coat-color predictions.";
 };
 box.querySelector("#hh-cavy-partner").addEventListener("change",render);
 box.querySelector("#hh-cavy-genotype-save").addEventListener("click",()=>{
   const live=check();
   if(!live){error.textContent="Account or animal record changed; reopen genetics.";return;}
   const profile=clone(target.genetics||{}),loci={...(profile.loci||{})};
   for(const [locus,definition] of Object.entries(LOCI)){
      const previous=loci[locus];
      if(previous?.source==="dna-confirmed"||previous?.status==="dna-confirmed")continue;
      const choice=box.querySelector('[data-cavy-genotype="'+locus+'"]').value;
      const evidence=clean(box.querySelector('[data-cavy-evidence="'+locus+'"]').value);
      const clear=box.querySelector('[data-cavy-clear="'+locus+'"]')?.checked===true;
      if(clear){delete loci[locus];continue;}
      if(!choice)continue; // Blank is not an instruction to delete historical or inferred evidence.
      if(!evidence){error.textContent="Evidence reference required for "+definition.label;return;}
      if(choice.split("/").some(a=>!definition.alleles.includes(a))){error.textContent="Invalid alleles.";return;}
      const proposed=choice.split("/");
      if(previous&&proposed.join("/")===alleles(target,locus).join("/")&&evidence===clean(previous.evidenceRef))continue;
      loci[locus]={alleles:proposed,status:"breeder-reported",source:"breeder-reported",evidenceRef:evidence};
   }
   profile.loci=loci;
   const edited={...target,genetics:profile,updatedAt:new Date().toISOString()};
   const changed={...live,animals:live.animals.map(x=>x===target?edited:x)};
   const computed=reconcile(changed);
   if(!app.commitState(computed.state)){error.textContent="Save failed; no genetics records changed.";return;}
   overlay.remove();
 });
 render();return true;
}

return Object.freeze({VERSION,LOCI,isCavy,roanSafety,exactCross,predict,familyRoan,familyLocus,reconcile,pedigreeConflicts,openForAnimal});
});
