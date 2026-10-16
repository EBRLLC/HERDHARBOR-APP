(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.HerdHarborCanineLineage=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const VERSION="2.0.1-k3";
  const id=(value)=>typeof value==="string"||typeof value==="number"?String(value).trim():"";
  const lower=(value)=>String(value||"").trim().toLowerCase();
  const isDog=(animal)=>lower(animal?.species)==="dog";
  const owner=(animal)=>id(animal?.userId||animal?.ownerId||animal?.accountId);
  function indexAnimals(animals){
    const index=new Map(),duplicates=new Set();
    for(const animal of Array.isArray(animals)?animals:[]){
      const key=id(animal?.id);if(!key)continue;
      if(index.has(key))duplicates.add(key);
      else index.set(key,animal);
    }
    return {index,duplicates};
  }
  function validate(animals,subject,options={}){
    if(!isDog(subject))return {valid:true,issues:[],warnings:[]};
    const problems=[],warnings=[];
    const data=indexAnimals(animals);
    const subjectId=id(subject?.id);
    const targetOwner=id(options.ownerId||owner(subject));
    if(subject?.id && !subjectId)problems.push("Invalid dog identifier.");
    if(subjectId&&data.duplicates.has(subjectId))problems.push("Duplicate subject animal ID.");
    const roles=[["sireId","Male"],["damId","Female"]];
    for(const [field,sex] of roles){
      const raw=subject?.[field],ref=id(raw);
      if(raw!=null&&raw!==""&&!ref){problems.push(field+" must be an animal ID.");continue;}
      if(!ref)continue;
      if(subjectId===ref){problems.push(field+" cannot reference the dog itself.");continue;}
      if(data.duplicates.has(ref)){problems.push(field+" references a duplicate animal ID.");continue;}
      const animal=data.index.get(ref);
      if(!animal){problems.push(field+" must refer to an animal in this farm.");continue;}
      if(!isDog(animal)){problems.push(field+" must reference a Dog, not "+(animal.species||"an unknown species")+".");continue;}
      if(lower(animal.sex)!==lower(sex)){
        problems.push(field+" must reference a recorded "+sex.toLowerCase()+" Dog.");continue;
      }
      if(targetOwner&&owner(animal)&&owner(animal)!==targetOwner){
        problems.push(field+" references another account.");continue;
      }
    }
    // Three-state iterative DFS visits each reachable ancestor once. Shared
    // ancestors are normal in pedigrees and must not cause exponential walks;
    // only an edge to an active (on-path) node indicates a true cycle.
    const visited=new Set(),active=new Set(subjectId?[subjectId]:[]);
    const frames=[];
    for(const [field] of roles)if(id(subject?.[field]))
      frames.push({ref:id(subject[field]),exit:false});
    while(frames.length){
      const {ref,exit}=frames.pop();
      if(exit){active.delete(ref);visited.add(ref);continue;}
      if(active.has(ref)){
        problems.push("Circular canine parentage involving "+ref+".");
        continue;
      }
      if(visited.has(ref)||data.duplicates.has(ref))continue;
      const ancestor=data.index.get(ref);
      if(!ancestor){warnings.push("An existing ancestor points to a missing animal.");continue;}
      if(!isDog(ancestor)){problems.push("An ancestor in this dog pedigree belongs to another species.");continue;}
      if(targetOwner&&owner(ancestor)&&owner(ancestor)!==targetOwner){
        problems.push("An ancestor in this dog pedigree belongs to another account.");
        continue;
      }
      active.add(ref);
      frames.push({ref,exit:true});
      for(const [field,sex] of roles){
        const parentRef=id(ancestor[field]);
        if(!parentRef)continue;
        const parent=data.index.get(parentRef);
        if(!parent){warnings.push("An existing ancestor points to a missing animal.");continue;}
        if(lower(parent.sex)!==lower(sex))
          problems.push("An ancestor has an incompatible "+field+" sex.");
        frames.push({ref:parentRef,exit:false});
      }
    }
    return {valid:problems.length===0,issues:[...new Set(problems)],warnings:[...new Set(warnings)]};
  }

  // Called before a canonical Animal edit, including species or sex changes.
  // Check children that depend on the subject as well as the subject's parents.
  // This prevents an edited sire/dam from silently invalidating existing litters.
  function validateMutation(animals, proposed) {
    const list=Array.isArray(animals)?animals:[];
    const proposedId=id(proposed?.id);
    const before=list.find(row=>id(row?.id)===proposedId);
    const problems=[];
    if(!proposedId)problems.push("Animal identifier is required.");
    const children=list.filter(row=>id(row?.id)!==proposedId &&
      (id(row?.sireId)===proposedId || id(row?.damId)===proposedId));
    const wasDog=isDog(before), willBeDog=isDog(proposed);
    const isTransition=before&&lower(before.species)!==lower(proposed?.species);
    if(isTransition && (wasDog||willBeDog)) {
      const meta=before?.canine || {};
      const hasIdentity=Boolean(String(meta.registeredName||"").trim() ||
        String(meta.callName||"").trim() ||
        (Array.isArray(meta.registrations)&&meta.registrations.length) ||
        (Array.isArray(meta.titles)&&meta.titles.length));
      if(wasDog && hasIdentity)
        problems.push("This dog has registration, title or identity records. Retain Dog species until those records are explicitly reconciled.");
      if(children.length)
        problems.push("This animal is a parent in existing pedigrees. Reconcile offspring references before changing its species.");
      if(id(before.sireId)||id(before.damId))
        problems.push("This animal has linked parents. Reconcile parentage before changing its species.");
    }
    // A pre-existing livestock record may have an unknown or incomplete sex.
    // An unrelated name/status edit must not retroactively enforce canine-only
    // parent semantics on rabbits, goats or other established species.
    const sexChanged=Boolean(before)&&lower(before.sex)!==lower(proposed?.sex);
    const lineageChanged=!before || ["species","sex","sireId","damId","userId","ownerId","accountId"]
      .some(field=>lower(before?.[field])!==lower(proposed?.[field]));
    const updated=lineageChanged
      ? (before ? list.map(row=>id(row?.id)===proposedId?proposed:row) : [...list,proposed])
      : list;
    for(const child of children) {
      const roles=[["sireId","male"],["damId","female"]]
        .filter(([field])=>id(child[field])===proposedId);
      for(const [field,requiredSex] of roles) {
        // Only a changed sex can introduce an invalid relationship. Historical
        // Unknown sex values are tolerated until the owner actually edits sex.
        if(sexChanged && lower(proposed?.sex)!==requiredSex)
          problems.push("Cannot change sex: existing "+field+" references require "+requiredSex+".");
        if(isDog(child) && isTransition && !willBeDog)
          problems.push("Cannot change species: existing dog pedigrees reference this Dog parent.");
      }
      if(isDog(child) && willBeDog && lineageChanged) {
        const childCheck=validate(updated,child);
        if(!childCheck.valid) problems.push(...childCheck.issues);
      }
    }
    // Existing invalid/incomplete dog ancestry is not silently corrected by
    // an unrelated edit. Check the graph when identity/links change or on create.
    if(willBeDog && lineageChanged) {
      const check=validate(updated,proposed);
      if(!check.valid) problems.push(...check.issues);
    }
    return {valid:problems.length===0,issues:[...new Set(problems)]};
  }
  // Deletion must be safe for all animal species, not only Dog pedigrees.
  // Existing records may be referenced by litter and pedigree snapshots even
  // when there are no live offspring Animal profiles.
  function validateDeletion(animals, animalId, state = {}) {
    const target=id(animalId), issues=[];
    if(!target)return {valid:false,issues:["Choose a saved animal before deleting."]};
    const list=Array.isArray(animals)?animals:[];
    const children=list.filter(row=>id(row?.id)!==target &&
      (id(row?.sireId)===target||id(row?.damId)===target));
    if(children.length)issues.push("This animal appears as a parent in "+children.length+" animal profile(s).");
    const relationKeys=["animalId","subjectAnimalId","damId","sireId","femaleId","maleId",
      "fatherId","motherId","parentId","subjectId"];
    const linked=(record)=>{
      if(!record||typeof record!=="object")return false;
      if(relationKeys.some(key=>id(record[key])===target))return true;
      if(Object.values(record.ancestorIds||{}).some(value=>id(value)===target))return true;
      if(["animalIds","offspringIds","kitIds","childIds","parentIds"].some(key=>
        Array.isArray(record[key])&&record[key].some(value=>id(value)===target)))return true;
      if(Array.isArray(record.items)&&record.items.some(item=>
        item&&typeof item==="object"&&relationKeys.some(key=>id(item[key])===target)))return true;
      return false;
    };
    const collections=[
      ["breedings","breeding"],["litters","litter"],["births","birth"],
      ["health","health"],["pedigrees","pedigree"],["pedigreeDrafts","pedigree draft"],
      ["tasks","task"],["sales","sale"],["ownershipTransfers","ownership transfer"],
      ["showEntries","show"],["showResults","show result"],["medical","medical"],
      ["weights","weight"]
    ];
    for(const [key,label] of collections) {
      const count=(Array.isArray(state?.[key])?state[key]:[]).filter(linked).length;
      if(count)issues.push("This animal is linked to "+count+" "+label+" record(s).");
    }
    if(issues.length)issues.push("Keep this animal as Archived or Ancestor Only, or reconcile the linked records before deletion.");
    return {valid:issues.length===0,issues};
  }
  function parentOptions(animals,subject,field){
    if(!isDog(subject))return [];
    const wanted=field==="sireId"?"male":field==="damId"?"female":"";
    if(!wanted)return [];
    return (Array.isArray(animals)?animals:[]).filter(animal=>
      isDog(animal)&&lower(animal.sex)===wanted&&id(animal.id)!==id(subject?.id)&&
      (!owner(subject)||!owner(animal)||owner(subject)===owner(animal)));
  }
  function filterParentSelectors(form,animals,subject){
    const dog=isDog(subject);
    for(const field of ["sireId","damId"]){
      const select=form?.querySelector('select[name="'+field+'"]');
      if(!select)continue;
      const allowed=new Set(parentOptions(animals,subject,field).map(a=>id(a.id)));
      for(const option of Array.from(select.options||[])){
        if(!option.value)continue;
        if(option.dataset.baseDisabled===undefined)option.dataset.baseDisabled=option.disabled?"1":"0";
        option.disabled=dog?(!allowed.has(option.value)&&!option.selected):option.dataset.baseDisabled==="1";
      }
    }
  }
  return Object.freeze({VERSION,validate,validateMutation,validateDeletion,parentOptions,filterParentSelectors});
});
