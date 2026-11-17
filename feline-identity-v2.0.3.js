(function(root,factory){"use strict";const api=factory();
if(typeof module==="object"&&module.exports)module.exports=api;
if(root)root.HerdHarborFelineIdentity203=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){"use strict";
const clean=x=>String(x==null?"":x).trim(),isCat=a=>/^(cat|cats|feline)$/i.test(clean(typeof a==="string"?a:a?.species));
const esc=x=>clean(x).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const normalize=input=>{const v=input&&typeof input==="object"?input:{};return {
  registeredName:clean(v.registeredName).slice(0,200),callName:clean(v.callName).slice(0,120),
  breed:clean(v.breed).slice(0,160),coatColor:clean(v.coatColor).slice(0,160),
  pattern:clean(v.pattern).slice(0,160),registry:clean(v.registry).slice(0,100),
  registrationNumber:clean(v.registrationNumber).slice(0,120),
  microchip:clean(v.microchip).slice(0,120),
  healthTests:Array.isArray(v.healthTests)?v.healthTests.slice(0,30).map(row=>({...row,name:clean(row.name),date:clean(row.date),reference:clean(row.reference),result:clean(row.result),provider:clean(row.provider),status:"breeder-entered-unverified"})):[],
  verification:"breeder-entered-unverified"
};};
const validHealthDate=d=>{d=clean(d);if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return false;const p=new Date(d+"T00:00:00Z");return Number.isFinite(p.getTime())&&p.toISOString().slice(0,10)===d;};
function validate(input){const value=normalize(input),errors=[];
 if(Boolean(value.registry)!==Boolean(value.registrationNumber))errors.push("Feline registration requires registry and number together.");
 if((input?.healthTests||[]).length>30)errors.push("Too many cat health tests.");
 for(const t of value.healthTests)if(!t.name||!t.reference||!validHealthDate(t.date))errors.push("Cat health evidence requires a named test, real date and reference.");
 return {valid:errors.length===0,errors,value};}
function pedigree(subject,animals,maxGenerations=4){
 if(!isCat(subject))return {supported:false,rows:[]};
 const rows=[],counts=new Map();
 for(const a of animals||[])if(a?.id)counts.set(String(a.id),(counts.get(String(a.id))||0)+1);
 const byId=new Map((animals||[]).filter(a=>a?.id&&counts.get(String(a.id))===1).map(a=>[String(a.id),a]));
 const visit=(id,depth,role,path)=>{
  if(!id||depth>maxGenerations)return;
  const key=String(id);
  if(path.has(key)){rows.push({id:key,depth,role,status:"cycle-review"});return;}
  if(counts.get(key)>1){rows.push({id:key,depth,role,status:"duplicate-id-review"});return;}
  const animal=byId.get(key);
  if(!animal){rows.push({id:key,depth,role,status:"external-unresolved"});return;}
  if(!isCat(animal)){rows.push({id:key,depth,role,status:"cross-species-review"});return;}
  rows.push({id:key,depth,role,status:"recorded",name:animal.feline?.registeredName||animal.name||"",registration:animal.feline?.registrationNumber||""});
  const trail=new Set(path);trail.add(key);
  visit(animal.sireId,depth+1,"sire",trail);visit(animal.damId,depth+1,"dam",trail);
 };
 visit(subject.sireId,1,"sire",new Set([String(subject.id)]));
 visit(subject.damId,1,"dam",new Set([String(subject.id)]));
 return {supported:true,subjectId:String(subject.id),rows,unresolved:rows.filter(r=>r.status!=="recorded")};
}
function healthRow(item={}){
 return '<div data-feline-health-row class="canine-entry">'+
 '<label>Test or observation<input data-feline-health-field="name" value="'+esc(item.name)+'" maxlength="160"></label>'+
 '<label>Date<input type="date" data-feline-health-field="date" value="'+esc(item.date)+'"></label>'+
 '<label>Document reference<input data-feline-health-field="reference" value="'+esc(item.reference)+'" maxlength="250"></label>'+
 '<label>Result (owner recorded)<input data-feline-health-field="result" value="'+esc(item.result)+'" maxlength="180"></label>'+
 '<label>Provider<input data-feline-health-field="provider" value="'+esc(item.provider)+'" maxlength="180"></label>'+
 '<button type="button" data-feline-health-remove>Remove health record</button></div>';
}
function editorHtml(animal){
 const meta=normalize(animal?.feline);
 return '<section data-feline-panel'+(isCat(animal)?'':' hidden')+'><h3>Cat / cattery identity</h3><p class="muted">Registration is breeder-entered, not verified by a registry. Enter observed color and pattern without relying on dog or rabbit palettes.</p>'+
 ['registeredName','callName','breed','coatColor','pattern','registry','registrationNumber','microchip'].map(k=>
 '<label>'+esc(k.replace(/([A-Z])/g," $1"))+'<input data-feline-field="'+k+'" maxlength="200" value="'+esc(meta[k])+'"></label>').join("")+
 '<h4>Health and veterinary evidence</h4><p class="muted">Breeder entered; supporting record required. Not independently verified.</p>'+
 '<div data-feline-health-list>'+meta.healthTests.map(healthRow).join("")+'</div>'+
 '<button type="button" data-feline-health-add>Add health record</button></section>';
}
function bindEditor(form,speciesSelect){
 const panel=form?.querySelector?.('[data-feline-panel]');if(!panel)return false;
 const sync=()=>{panel.hidden=!isCat(speciesSelect?.value);
 panel.querySelectorAll("input").forEach(input=>input.disabled=panel.hidden);};
 panel.querySelector('[data-feline-health-add]')?.addEventListener("click",()=>{
  const list=panel.querySelector('[data-feline-health-list]');
  if(!list||list.children.length>=30)return;
  const container=panel.ownerDocument.createElement("div");
  container.innerHTML=healthRow({});
  list.appendChild(container.firstElementChild);
 });
 panel.addEventListener("click",event=>{if(event.target?.closest?.('[data-feline-health-remove]'))event.target.closest('[data-feline-health-row]')?.remove();});
 speciesSelect?.addEventListener?.("change",sync);sync();return true;
}
function readEditor(form,previous={}){
 const panel=form?.querySelector?.('[data-feline-panel]');if(!panel||panel.hidden)return validate(previous);
 const value={...normalize(previous)};
 panel.querySelectorAll('[data-feline-field]').forEach(node=>{value[node.dataset.felineField]=node.value;});
 value.healthTests=[...panel.querySelectorAll('[data-feline-health-row]')].map(row=>{
  const values={};
  row.querySelectorAll('[data-feline-health-field]').forEach(node=>values[node.dataset.felineHealthField]=node.value);
  return values;
 });
 return validate(value);
}
return Object.freeze({VERSION:"2.0.3",isCat,normalize,validate,pedigree,editorHtml,bindEditor,readEditor});
});