(function(root,factory){
  "use strict";
  const api=factory(root);
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.HerdHarborCaninePedigreePrint=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(root){
  "use strict";
  const VERSION="2.0.1-k4";
  const clean=value=>String(value==null?"":value).trim();
  const esc=value=>clean(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  const DISCLAIMER="HerdHarbor breeder-maintained pedigree — not an official AKC-certified document. Registration and titles are owner-entered and have not been independently verified.";

  function dependencies(options={}){
    return {
      engine:options.engine||root?.HerdHarborPedigreeEngine,
      standard:options.standard||root?.HerdHarborStandardPedigreePrint,
      canine:options.canine||root?.HerdHarborCanineIdentity,
      lineage:options.lineage||root?.HerdHarborCanineLineage
    };
  }
  function projectAnimal(animal,canine,registryPreference=""){
    if(!animal)return null;
    const meta=canine.normalize(animal.canine);
    const desired=clean(registryPreference).toLowerCase();
    const registration=meta.registrations.find(r=>desired&&r.registry.toLowerCase()===desired)
      ||canine.preferredRegistration(animal);
    return {
      ...animal,
      name:canine.displayName(animal),
      // The rabbit-specific breeder prefix/Grand Champion fields have no
      // equivalent meaning in a canine title. Do not repurpose them.
      registrationNumber:registration?[registration.registry,registration.number].filter(Boolean).join(" "):
        clean(animal.registrationNumber),
      prefix:"",rabbitry:"",rabbitryName:"",gcNumber:"",grandChampionNumber:""
    };
  }
  function completeRecords(graph,canine){
    return graph.nodes.filter(node=>node.animal).map(node=>{
      const a=node.animal,reg=canine.preferredRegistration(a);
      return '<li><strong>'+esc(node.relation||"Dog")+'</strong> — '+esc(canine.displayName(a))+
        (reg?' · '+esc(reg.registry)+' '+esc(reg.number):' · No registration recorded')+
        ' · '+esc(a.breed||"Breed not recorded")+'</li>';
    }).join("");
  }
  function buildDocument(options={}){
    const {engine,standard,canine,lineage}=dependencies(options);
    if(!engine?.buildGraph||!standard?.buildHtml||!canine?.normalize||!lineage?.validate)
      throw new Error("Canonical pedigree and canine verification tools are unavailable.");
    const animals=Array.isArray(options.animals)?options.animals:[];
    const subject=animals.find(a=>String(a.id)===String(options.subjectId));
    if(!subject||!canine.isDog(subject))throw new Error("Select a Dog from your current animal account.");
    const generations=Number(options.generations||4);
    if(![3,4].includes(generations))throw new Error("Dog pedigrees currently support 3 or 4 generations.");
    const checked=lineage.validate(animals,subject);
    if(!checked.valid)throw new Error("Fix dog parentage before printing: "+checked.issues.join(" "));
    const graph=engine.buildGraph({animals,subject,subjectId:subject.id,generations});
    if(graph.issues?.some(x=>["cycle","duplicate-id","malformed-reference"].includes(x.type)))
      throw new Error("The linked pedigree has unresolved conflicts and cannot be printed.");
    const registryPreference=clean(options.registry);
    const nodes=graph.nodes.map(node=>({...node,animal:node.animal?projectAnimal(node.animal,canine,registryPreference):null}));
    const projectedGraph={...graph,nodes,root:nodes[0]};
    const projectedSubject=nodes[0]?.animal;
    const config={
      generations,
      rootFields:["name","sex","dob","breed","color","registrationNumber"],
      ancestorFields:["name","sex","breed","color","registrationNumber"],
      photos:options.photos===true,
      unknownDisplay:"label",
      density:"comfortable",
      layout:"balanced",
      style:"professional"
    };
    let html=standard.buildHtml({
      graph:projectedGraph,subject:projectedSubject,config,branding:options.branding||{},
      operationName:clean(options.operationName)||"HerdHarbor breeder",
      generatedDate:clean(options.generatedDate)||new Date().toISOString().slice(0,10),
      speciesIcon:()=> "🐕",formatDate:value=>clean(value),
      mobilePrint:false
    });
    const paper=String(options.paperSize||"letter").toLowerCase()==="a4"?"A4":"letter";
    const extraStyle='<style id="hh-canine-print-style">' +
      '@page {size:'+paper+' landscape; margin:0.28in}' +
      '.sheet {height:auto!important;max-height:none!important;min-height:0!important;overflow:visible!important}' +
      '.pedigree-tree {flex:0 0 auto!important;min-height:0!important;grid-template-rows:repeat('+(2**(generations-1))+',minmax(min-content,1fr))!important;break-inside:auto!important;page-break-inside:auto!important}' +
      '.node-title strong,.node-details span,.print-subject strong,.print-subject small {white-space:normal!important;overflow:visible!important;text-overflow:clip!important;overflow-wrap:anywhere!important;word-break:normal!important}' +
      '.pedigree-node-card {overflow:visible!important;break-inside:avoid;page-break-inside:avoid}' +
      '.node-title > div,.node-details div {min-width:0}' +
      '.hh-canine-disclaimer {padding:8px 0;font-size:10px;font-weight:700;line-height:1.4;color:#253b46;border-top:1px solid #8b969d}' +
      '.hh-canine-appendix {padding:14px 2px 8px;break-before:page;page-break-before:always}' +
      '.hh-canine-appendix h2 {font-size:18px}.hh-canine-appendix li {margin:7px 0;font-size:11px;line-height:1.4;overflow-wrap:anywhere}' +
      '@media print {.sheet,.pedigree-tree {break-inside:auto!important;page-break-inside:auto!important}}' +
      '</style>';
    html=html.replace('</head>',extraStyle+'</head>');
    const disclosure='<aside class="hh-canine-disclaimer">'+esc(DISCLAIMER)+'</aside>';
    html=html.replace(/<section class="sale-strip">[\s\S]*?<\/section>/,disclosure);
    html=html.replace(/<section class="certification">[\s\S]*?<\/section>/,"");
    const appendix='<section class="hh-canine-appendix"><h2>Complete canine pedigree details</h2>'+
      '<p>'+esc(DISCLAIMER)+'</p><ol>'+completeRecords(graph,canine)+'</ol></section>';
    html=html.replace('</div></body></html>',appendix+'</div></body></html>');
    html=html.replace('<body>','<body data-hh-canine-pedigree="true">');
    return {html,generations,paperSize:paper,subjectId:String(subject.id),nodeCount:graph.nodes.length};
  }
  function openForAnimal(animalId,options={}){
    const state=root?.HerdHarborApp?.getState?.()||{};
    const document=root?.document;
    const parent=document?.querySelector("#view-animal-profile");
    const gen=Number(parent?.querySelector("[data-hh-canine-generations]")?.value||4);
    const paper=parent?.querySelector("[data-hh-canine-paper]")?.value||"letter";
    const registry=parent?.querySelector("[data-hh-canine-registry]")?.value||"";
    try{
      const output=buildDocument({animals:state.animals||[],subjectId:animalId,generations:gen,
        paperSize:paper,registry,...options});
      const opened=root?.HerdHarborDocumentExport?.openPrintWindow?.(output.html);
      if(!opened)throw new Error("Allow the print window and retry.");
      return true;
    }catch(error){root?.HerdHarborApp?.toast?.(error.message||"Cannot create canine pedigree.","error");return false;}
  }
  return Object.freeze({VERSION,DISCLAIMER,projectAnimal,buildDocument,openForAnimal});
});
