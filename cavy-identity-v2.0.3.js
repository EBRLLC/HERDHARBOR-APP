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
 registrationNumber:clean(v.registrationNumber).slice(0,150),showResults:Array.isArray(v.showResults)?v.showResults.slice(0,30).map(row=>({...row,event:clean(row.event),date:clean(row.date),placement:clean(row.placement),judge:clean(row.judge),reference:clean(row.reference),status:"breeder-entered-unverified"})):[],
 veterinaryEvidence:Array.isArray(v.veterinaryEvidence)?v.veterinaryEvidence.slice(0,30).map(row=>({...row,name:clean(row.name),date:clean(row.date),result:clean(row.result),reference:clean(row.reference),status:"breeder-entered-unverified"})):[],
 verification:"breeder-entered-unverified"};};

// Cavy terminology follows ARBA's January 2026 breed ID guide. These are
// breeder-friendly catalog choices, not proof of show eligibility for every breed.
const COAT_COLORS=Object.freeze([
 "Beige","Black","Blue","Chocolate","Cream","Gold","Golden","Lilac",
 "Orange","Red","Red-Eyed Orange","Slate","White",
 "Golden Agouti","Silver Agouti","Dilute Agouti",
 "Golden Solid","Silver Solid","Dilute Solid",
 "Black Otter","Chocolate Otter","Slate Otter",
 "Black Tan","Chocolate Tan","Slate Tan",
 "Black Marten","Chocolate Marten","Slate Marten",
 "Custom / Other","Unknown"
]);
const COAT_PATTERNS=Object.freeze([
 "Self / Solid","Agouti","Solid Agouti","Brindle","Roan",
 "Broken Color","Dalmatian","Dutch","Himalayan",
 "Tortoiseshell","Tortoiseshell and White","Tan Pattern",
 "Otter","Marten","Cal Pattern","Ticked Solid",
 "Tricolor","Bicolor","Custom / Other","Unknown"
]);
const COAT_TYPES=Object.freeze([
 "Smooth / Short","Abyssinian / Rosetted","Longhair","Peruvian",
 "Silkie","Coronet","Texel","Teddy","Rex","Satin",
 "Crested","Skinny / Hairless","Baldwin / Hairless",
 "Custom / Other","Unknown"
]);
const choiceList=(field,values)=>'<datalist id="hh-cavy-'+field+'">'+values.map(x=>'<option value="'+esc(x)+'"></option>').join("")+'</datalist>';
const inputField=(key,value)=>{
 const choices=key==="coatColor"?COAT_COLORS:key==="coatPattern"?COAT_PATTERNS:key==="coatType"?COAT_TYPES:null;
 return '<label>'+esc(key.replace(/([A-Z])/g," $1"))+
 '<input data-cavy-field="'+key+'"'+(choices?' list="hh-cavy-'+key+'"':'')+
 ' maxlength="200" value="'+esc(value)+'"></label>'+(choices?choiceList(key,choices):'');
};
const validEvidenceDate=d=>{d=clean(d);if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return false;const x=new Date(d+"T00:00:00Z");return Number.isFinite(x.getTime())&&x.toISOString().slice(0,10)===d;};
function validate(value){
 const v=normalize(value),errors=[];
 if(Boolean(v.registry)!==Boolean(v.registrationNumber))errors.push("Cavy registration requires registry and number together.");
 if((value?.showResults||[]).length>30||(value?.veterinaryEvidence||[]).length>30)errors.push("Too many cavy evidence entries.");
 for(const item of v.showResults)if(!item.event||!item.reference||!validEvidenceDate(item.date))errors.push("Cavy show records require an event, real date and evidence reference.");
 for(const item of v.veterinaryEvidence)if(!item.name||!item.reference||!validEvidenceDate(item.date))errors.push("Cavy veterinary evidence requires a record name, real date and evidence reference.");
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
function evidenceRow(kind,item={}){
 const show=kind==="show",fields=show?["event","date","placement","judge","reference"]:["name","date","result","reference"];
 return '<div data-cavy-evidence-row="'+kind+'">'+fields.map(key=>
  '<label>'+esc(key.replace(/([A-Z])/g," $1"))+'<input data-cavy-evidence-field="'+key+'"'+(key==="date"?' type="date"':'')+' maxlength="250" value="'+esc(item[key])+'"></label>').join("")+
 '<button type="button" data-cavy-evidence-remove>Remove</button></div>';
}
function editorHtml(animal){const m=normalize(animal?.cavy);return '<section data-cavy-panel'+(isCavy(animal)?"":" hidden")+'><h3>Cavy breeding & show identity</h3><p class="muted">Cavy is the professional breeder name for guinea pigs. Breed, variety, coat, show and registry details are breeder-entered, unverified.</p>'+
 ["registeredName","breederId","breed","variety","coatColor","coatPattern","coatType","registry","registrationNumber"].map(k=>inputField(k,m[k])).join("")+
 '<h4>Show and registration history</h4><p class="muted">Evidence is breeder-entered, not independently verified.</p>'+
 '<div data-cavy-show-list>'+m.showResults.map(row=>evidenceRow("show",row)).join("")+'</div>'+
 '<button type="button" data-cavy-add="show">Add show record</button>'+
 '<h4>Veterinary and health evidence</h4>'+
 '<div data-cavy-vet-list>'+m.veterinaryEvidence.map(row=>evidenceRow("vet",row)).join("")+'</div>'+
 '<button type="button" data-cavy-add="vet">Add veterinary record</button></section>';} 
function bindEditor(form,speciesSelect){const panel=form?.querySelector?.('[data-cavy-panel]');if(!panel)return false;
 const sync=()=>{panel.hidden=!isCavy(speciesSelect?.value);panel.querySelectorAll("input").forEach(x=>x.disabled=panel.hidden);};
 panel.querySelectorAll('[data-cavy-add]').forEach(button=>button.addEventListener("click",()=>{
 const kind=button.dataset.cavyAdd;
 const list=panel.querySelector(kind==="show"?'[data-cavy-show-list]':'[data-cavy-vet-list]');
 if(!list||list.children.length>=30)return;
 const holder=panel.ownerDocument.createElement("div");holder.innerHTML=evidenceRow(kind,{});
 list.appendChild(holder.firstElementChild);
 }));
 panel.addEventListener("click",event=>{if(event.target?.closest?.('[data-cavy-evidence-remove]'))event.target.closest('[data-cavy-evidence-row]')?.remove();});
 speciesSelect?.addEventListener?.("change",sync);sync();return true;}
function readEditor(form,previous={}){
 const p=form?.querySelector?.('[data-cavy-panel]');if(!p||p.hidden)return validate(previous);
 const x={...normalize(previous)};p.querySelectorAll('[data-cavy-field]').forEach(node=>{x[node.dataset.cavyField]=node.value;});
 const collect=kind=>[...p.querySelectorAll('[data-cavy-evidence-row="'+kind+'"]')].map(row=>{
  const item={};row.querySelectorAll('[data-cavy-evidence-field]').forEach(node=>item[node.dataset.cavyEvidenceField]=node.value);
  return item;
 });
 x.showResults=collect("show");x.veterinaryEvidence=collect("vet");
 return validate(x);
}
return Object.freeze({VERSION:"2.0.3",isCavy,normalize,validate,pedigree,editorHtml,bindEditor,readEditor,COAT_COLORS,COAT_PATTERNS,COAT_TYPES});
});