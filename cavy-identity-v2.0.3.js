(function(root,factory){"use strict";const api=factory();
if(typeof module==="object"&&module.exports)module.exports=api;
if(root)root.HerdHarborCavyIdentity203=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){"use strict";
const clean=x=>String(x==null?"":x).trim(),isCavy=a=>/^(cavy|cavies|guinea pigs?|guinea-pigs?)$/i.test(clean(typeof a==="string"?a:a?.species));
const esc=x=>clean(x).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const normalize=x=>{const v=x&&typeof x==="object"?x:{};return {
 registeredName:clean(v.registeredName).slice(0,200),breederId:clean(v.breederId).slice(0,100),
 breed:clean(v.breed).slice(0,140),variety:clean(v.variety).slice(0,140),
 coatColor:clean(v.coatColor).slice(0,140),coatPattern:clean(v.coatPattern).slice(0,140),
 coatType:clean(v.coatType).slice(0,140),registry:clean(v.registry).slice(0,130),
 registrationNumber:clean(v.registrationNumber).slice(0,150),showResults:Array.isArray(v.showResults)?v.showResults.slice(0,30):[],
 veterinaryEvidence:Array.isArray(v.veterinaryEvidence)?v.veterinaryEvidence.slice(0,30):[],
 verification:"breeder-entered-unverified"};};
function validate(value){
 const v=normalize(value),errors=[];
 if(Boolean(v.registry)!==Boolean(v.registrationNumber))errors.push("Cavy registration requires registry and number together.");
 if((value?.showResults||[]).length>30||(value?.veterinaryEvidence||[]).length>30)errors.push("Too many cavy evidence entries.");
 return {valid:errors.length===0,errors,value:v};
}
function pedigree(subject,animals,maxDepth=4){
 if(!isCavy(subject))return {supported:false,ancestors:[]};
 const grouped=new Map();
 for(const a of animals||[])if(clean(a?.id)){const key=clean(a.id);grouped.set(key,[...(grouped.get(key)||[]),a]);}
 const ancestors=[];
 const walk=(id,depth,role,trail)=>{
  id=clean(id);if(!id||depth>maxDepth)return;
  if(trail.has(id)){ancestors.push({id,depth,role,status:"ancestry-cycle"});return;}
  const candidates=grouped.get(id)||[];
  if(candidates.length!==1){ancestors.push({id,depth,role,status:candidates.length?"ambiguous-identity":"external-ancestor"});return;}
  const record=candidates[0];
  if(!isCavy(record)){ancestors.push({id,depth,role,status:"cross-species-reference"});return;}
  ancestors.push({id,depth,role,status:"recorded",name:record.cavy?.registeredName||record.name||"",registry:record.cavy?.registry||""});
  const next=new Set(trail);next.add(id);walk(record.sireId,depth+1,"boar",next);walk(record.damId,depth+1,"sow",next);
 };
 walk(subject.sireId,1,"boar",new Set([clean(subject.id)]));
 walk(subject.damId,1,"sow",new Set([clean(subject.id)]));
 return {supported:true,subjectId:subject.id,ancestors,requiresReview:ancestors.some(a=>a.status!=="recorded")};
}
function editorHtml(animal){const m=normalize(animal?.cavy);return '<section data-cavy-panel'+(isCavy(animal)?"":" hidden")+'><h3>Cavy breeding & show identity</h3><p class="muted">Cavy is the professional breeder name for guinea pigs. Breed, variety, coat, show and registry details are breeder-entered, unverified.</p>'+
 ["registeredName","breederId","breed","variety","coatColor","coatPattern","coatType","registry","registrationNumber"].map(k=>'<label>'+esc(k.replace(/([A-Z])/g," $1"))+'<input data-cavy-field="'+k+'" maxlength="200" value="'+esc(m[k])+'"></label>').join("")+'</section>';}
function bindEditor(form,speciesSelect){const panel=form?.querySelector?.('[data-cavy-panel]');if(!panel)return false;
 const sync=()=>{panel.hidden=!isCavy(speciesSelect?.value);panel.querySelectorAll("input").forEach(x=>x.disabled=panel.hidden);};
 speciesSelect?.addEventListener?.("change",sync);sync();return true;}
function readEditor(form,previous={}){
 const p=form?.querySelector?.('[data-cavy-panel]');if(!p||p.hidden)return validate(previous);
 const x={...normalize(previous)};p.querySelectorAll('[data-cavy-field]').forEach(node=>{x[node.dataset.cavyField]=node.value;});
 return validate(x);
}
return Object.freeze({VERSION:"2.0.3",isCavy,normalize,validate,pedigree,editorHtml,bindEditor,readEditor});
});