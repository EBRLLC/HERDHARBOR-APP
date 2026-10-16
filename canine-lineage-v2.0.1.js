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
    // Check all known lineage branches, not just immediate sire/dam; a repeated
    // ancestor is legal, but a repeated ID on the *same path* is a cycle.
    const stack=[];
    for(const [field] of roles)if(id(subject?.[field]))stack.push({ref:id(subject[field]),seen:new Set(subjectId?[subjectId]:[])});
    const visitedEdges=new Set();
    while(stack.length){
      const {ref,seen}=stack.pop();
      if(seen.has(ref)){problems.push("Circular canine parentage involving "+ref+".");continue;}
      if(data.duplicates.has(ref))continue;
      const ancestor=data.index.get(ref);
      if(!ancestor)continue;
      if(!isDog(ancestor)){problems.push("An ancestor in this dog pedigree belongs to another species.");continue;}
      if(targetOwner&&owner(ancestor)&&owner(ancestor)!==targetOwner){problems.push("An ancestor in this dog pedigree belongs to another account.");continue;}
      const next=new Set(seen);next.add(ref);
      for(const [field,sex] of roles){
        const parentRef=id(ancestor[field]);if(!parentRef)continue;
        const parent=data.index.get(parentRef);
        if(!parent){warnings.push("An existing ancestor points to a missing animal.");continue;}
        if(lower(parent.sex)!==lower(sex))problems.push("An ancestor has an incompatible "+field+" sex.");
        const edge=ref+"|"+field+"|"+parentRef;
        // Keep per-path cycle checks; edge cache is only advisory, never skips
        // distinct branches that can expose circular lineage.
        visitedEdges.add(edge);
        stack.push({ref:parentRef,seen:next});
      }
    }
    return {valid:problems.length===0,issues:[...new Set(problems)],warnings:[...new Set(warnings)]};
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
        option.disabled=dog?!allowed.has(option.value):option.dataset.baseDisabled==="1";
      }
    }
  }
  return Object.freeze({VERSION,validate,parentOptions,filterParentSelectors});
});
