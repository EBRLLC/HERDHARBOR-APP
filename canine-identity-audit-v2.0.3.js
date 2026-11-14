(function(root,factory){
 "use strict";const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 if(root)root.HerdHarborCanineIdentity203=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const text=x=>String(x==null?"":x).trim();
 const dateOnly=x=>{const v=text(x);if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+"T00:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;};
 const isDog=a=>text(a?.species).toLowerCase()==="dog";
 function breedCatalogCoverage(catalog){
   const entries=catalog?.list?.()||[];
   return entries.map(entry=>{
     const colors=catalog.coatColorChoices(entry.name);
     const markings=catalog.markingChoices(entry.name);
     const url=catalog.AKC_COAT_SOURCES?.[entry.name]||null;
     return {breedId:entry.id,breed:entry.name,
       colors:colors.length,markings:markings.length,sourceUrl:url,
       colorStatus:colors.length&&url?"reviewed-list-requires-code-audit":"missing-verified-color-table",
       markingsStatus:markings.length?"reviewed-list-requires-code-audit":"missing-verified-marking-table",
       registrationColorCodesStatus:"not-verified",
       conformationStatus:"not-assessed",
       reviewDate:colors.length||markings.length?"2026-10-26":null};
   });
 }
 function validateRegistrationColor(animal,catalog){
   if(!isDog(animal))return {supported:false,reason:"Not a Dog"};
   const recognized=catalog?.resolve?.(animal.breed);
   if(!recognized)return {supported:true,recognized:false,status:"manual-observed",color:text(animal.color),markings:text(animal.canine?.coatMarkings)};
   const colors=catalog.coatColorChoices(animal.breed)||[];
   const markingOptions=catalog.markingChoices(animal.breed)||[];
   const color=text(animal.color),markings=text(animal.canine?.coatMarkings);
   return {supported:true,recognized:true,breedId:recognized.id,
     color,colorListed:Boolean(color)&&colors.some(x=>x.toLowerCase()===color.toLowerCase()),
     markings,markingsListed:Boolean(markings)&&markingOptions.some(x=>x.toLowerCase()===markings.toLowerCase()),
     colorTableVerified:colors.length>0,markingTableVerified:markingOptions.length>0,
     registrationColorCode:null,conformationEligible:null,
     sourceUrl:catalog.AKC_COAT_SOURCES?.[recognized.name]||null,
     note:"AKC registration descriptors and conformation eligibility are separate; manual observations do not imply registry certification."};
 }
 function addHealthEvidence(animal,item){
   if(!isDog(animal))return {valid:false,error:"Dog-only evidence."};
   const type=text(item?.type),name=text(item?.name),date=text(item?.date),reference=text(item?.reference);
   if(!["screening","dna-test","veterinary-exam","vaccination"].includes(type)||!name||!dateOnly(date)||!reference)
     return {valid:false,error:"Type, test/health record name, valid date, and evidence reference are required."};
   const id=text(item?.id)||["canine-health",type,name,date].join(":");
   const entries=Array.isArray(animal.canineHealthEvidence)?animal.canineHealthEvidence.map(x=>({...x})):[];
   const existing=entries.find(x=>x.id===id);
   const record={id,type,name,date,reference,result:text(item.result),issuer:text(item.issuer),
     status:"breeder-entered-unverified",notes:text(item.notes)};
   if(existing&&existing.type!==type)return {valid:false,error:"Evidence ID collides with another record."};
   if(existing)Object.assign(existing,record);else entries.push(record);
   entries.sort((a,b)=>a.date.localeCompare(b.date));
   return {valid:true,animal:{...animal,canineHealthEvidence:entries},record};
 }
 return Object.freeze({VERSION:"2.0.3",breedCatalogCoverage,validateRegistrationColor,addHealthEvidence});
});