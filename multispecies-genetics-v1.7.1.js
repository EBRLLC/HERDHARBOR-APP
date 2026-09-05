(function(root,factory){
  const rabbit=typeof module==='object'&&module.exports?require('./rabbit-genetics-v1.6.1.js'):root.HerdHarborRabbitGenetics;
  const api=factory(rabbit);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.HerdHarborGeneticsPlatform=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Rabbit){
'use strict';

const VERSION='1.7.1';
const CONTRACT_VERSION='1.7.1';
const SCHEMA_VERSION=4;
const UNKNOWN='_';
const TRAIT_TYPES=Object.freeze({MENDELIAN:'mendelian',SEX_LINKED:'sex-linked',COMPLEX:'complex',POLYGENIC:'polygenic',QUANTITATIVE:'quantitative',GENOMIC:'genomic-marker',INFORMATIONAL:'informational'});
const INHERITANCE_MODELS=Object.freeze({AUTOSOMAL_DOMINANT:'autosomal-dominant',AUTOSOMAL_RECESSIVE:'autosomal-recessive',CODOMINANT:'codominant',INCOMPLETE_DOMINANCE:'incomplete-dominance',X_LINKED:'x-linked',Z_LINKED:'z-linked',COMPLEX:'complex',POLYGENIC:'polygenic',QUANTITATIVE:'quantitative',INFORMATIONAL:'informational'});
const ADAPTER_STATUS=Object.freeze({PRODUCTION:'production',FOUNDATION:'foundation',EXPERIMENTAL:'experimental'});
const EVIDENCE_PRIORITY=Object.freeze({unknown:0,possible:1,'phenotype-inferred':2,'pedigree-inferred':3,'breeder-confirmed':4,'parent-confirmed':5,'offspring-confirmed':6,'dna-confirmed':7});
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const clean=v=>String(v==null?'':v).trim();
const key=v=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const canonicalSpecies=v=>({rabbit:'rabbit',rabbits:'rabbit',cattle:'cattle',cow:'cattle',cows:'cattle',goat:'goat',goats:'goat',sheep:'sheep',poultry:'poultry',chicken:'poultry',chickens:'poultry',swine:'swine',pig:'swine',pigs:'swine'}[clean(v).toLowerCase()]||key(v));
const normalizeSex=v=>{const n=clean(v).toLowerCase();if(['male','m','buck','bull','boar','ram','rooster','cock'].includes(n))return'male';if(['female','f','doe','cow','sow','ewe','hen'].includes(n))return'female';return'unknown';};

function createPlatform(options={}){
  const rabbitEngine=options.rabbitEngine===undefined?Rabbit:options.rabbitEngine;
  const adapters=new Map(),lociBySpecies=new Map(),traitsBySpecies=new Map();
  const ensure=(map,species)=>{const s=canonicalSpecies(species);if(!map.has(s))map.set(s,new Map());return map.get(s);};

  function registerAdapter(adapter){
    if(!adapter?.species)throw new Error('Genetics adapter requires a species.');
    const species=canonicalSpecies(adapter.species);
    if(!species)throw new Error('Genetics adapter species is invalid.');
    const chromosomeSystem=adapter.chromosomeSystem||'autosomal';
    const normalized=Object.freeze({
      species,
      label:clean(adapter.label)||species[0].toUpperCase()+species.slice(1),
      status:adapter.status||ADAPTER_STATUS.FOUNDATION,
      version:adapter.version||CONTRACT_VERSION,
      chromosomeSystem,
      nextRelease:clean(adapter.nextRelease),
      description:clean(adapter.description),
      capabilities:Object.freeze({mendelian:true,dominant:true,recessive:true,codominant:true,incompleteDominance:true,carrierStatus:true,unknownPartial:true,pedigreeEvidence:true,pairingCompatibility:true,offspringPrediction:true,sexLinked:chromosomeSystem==='XY'||chromosomeSystem==='ZW',...(adapter.capabilities||{})}),
      normalize:typeof adapter.normalize==='function'?adapter.normalize:null,
      analyzePairing:typeof adapter.analyzePairing==='function'?adapter.analyzePairing:null,
      explain:typeof adapter.explain==='function'?adapter.explain:null,
      metadata:Object.freeze(clone(adapter.metadata||{}))
    });
    adapters.set(species,normalized);ensure(lociBySpecies,species);ensure(traitsBySpecies,species);return normalized;
  }

  function registerLocus(species,input){
    const s=canonicalSpecies(species),adapter=adapters.get(s);if(!adapter)throw new Error(`Register ${s} adapter before loci.`);
    if(!input?.id)throw new Error('Locus requires id.');
    const id=key(input.id),alleles=Array.isArray(input.alleles)?input.alleles.map(clean).filter(Boolean):[];
    const locus=Object.freeze({id,species:s,name:clean(input.name)||input.id,alleles:Object.freeze(alleles),chromosome:clean(input.chromosome)||'autosomal',scientificStatus:clean(input.scientificStatus)||'not-specified',description:clean(input.description),metadata:Object.freeze(clone(input.metadata||{}))});
    ensure(lociBySpecies,s).set(id,locus);return locus;
  }

  function registerTrait(species,input){
    const s=canonicalSpecies(species),adapter=adapters.get(s);if(!adapter)throw new Error(`Register ${s} adapter before traits.`);
    if(!input?.id)throw new Error('Trait requires id.');
    const id=key(input.id),type=input.traitType||TRAIT_TYPES.INFORMATIONAL,inheritance=input.inheritanceModel||INHERITANCE_MODELS.INFORMATIONAL;
    const trait=Object.freeze({
      id,species:s,name:clean(input.name)||input.id,traitType:type,inheritanceModel:inheritance,
      locusId:input.locusId?key(input.locusId):null,
      alleles:Object.freeze((input.alleles||[]).map(clean).filter(Boolean)),
      phenotypeRules:Object.freeze(clone(input.phenotypeRules||{})),
      breedApplicability:Object.freeze((input.breedApplicability||['*']).map(v=>v==='*'?'*':key(v))),
      riskAllele:clean(input.riskAllele),condition:Boolean(input.condition),unit:clean(input.unit),
      scientificStatus:clean(input.scientificStatus)||'not-specified',
      chromosomeSystem:input.chromosomeSystem||adapter.chromosomeSystem,
      explanation:clean(input.explanation),metadata:Object.freeze(clone(input.metadata||{}))
    });
    ensure(traitsBySpecies,s).set(id,trait);return trait;
  }

  function registerSpecies(value){
    const adapter=registerAdapter({species:value.species,label:value.label,status:value.status||ADAPTER_STATUS.EXPERIMENTAL,version:value.version,chromosomeSystem:value.sexChromosomes?'ZW':value.chromosomeSystem,description:value.description});
    (value.loci||[]).forEach(l=>registerLocus(adapter.species,l));
    (value.traits||[]).forEach(t=>registerTrait(adapter.species,t));return getSpeciesModule(adapter.species);
  }

  function getAdapter(species){return adapters.get(canonicalSpecies(species))||null;}
  function listAdapters(){return [...adapters.values()].map(a=>({...a,capabilities:{...a.capabilities},metadata:clone(a.metadata)}));}
  function listLoci(species){return [...(lociBySpecies.get(canonicalSpecies(species))||new Map()).values()].map(clone);}
  function listTraits(species,{breed}={}){const rows=[...(traitsBySpecies.get(canonicalSpecies(species))||new Map()).values()];if(!breed)return rows.map(clone);const b=key(breed);return rows.filter(t=>t.breedApplicability.includes('*')||t.breedApplicability.includes(b)).map(clone);}
  function getSpeciesModule(species){const a=getAdapter(species);if(!a)return null;const s=a.species;return{species:s,version:a.version,status:a.status,chromosomeSystem:a.chromosomeSystem,traits:new Map([...(traitsBySpecies.get(s)||new Map()).entries()].map(([k,v])=>[k,clone(v)])),loci:new Map([...(lociBySpecies.get(s)||new Map()).entries()].map(([k,v])=>[k,clone(v)])),capabilities:{...a.capabilities},description:a.description,nextRelease:a.nextRelease};}
  const applicableTraits=(species,breed)=>listTraits(species,{breed});

  const blankRecord=()=>({status:'unknown',alleles:[],value:null,unit:'',source:'',confidence:null,provenance:[]});
  function normalizeProfile(input={},species=input?.species){
    const s=canonicalSpecies(species),adapter=getAdapter(s);if(!adapter)return{schemaVersion:SCHEMA_VERSION,geneticsContractVersion:CONTRACT_VERSION,species:s||'',traits:{},unmappedTraits:clone(input?.traits||{}),unmappedLoci:clone(input?.loci||{}),genomicTests:clone(input?.genomicTests||input?.tests||[]),evidence:clone(input?.evidence||[]),history:clone(input?.history||[]),conflicts:clone(input?.conflicts||[])};
    if(s==='rabbit'&&adapter.normalize){
      const normalized=adapter.normalize(input||{}),traits={};
      Object.entries(normalized?.loci||{}).forEach(([locusId,record])=>{traits[key(locusId)]={...blankRecord(),...clone(record),alleles:clone(record?.alleles||[])};});
      return{schemaVersion:SCHEMA_VERSION,geneticsContractVersion:CONTRACT_VERSION,species:s,adapterVersion:adapter.version,delegateVersion:normalized?.engineVersion||rabbitEngine?.VERSION||null,breedId:key(input?.breedId||input?.breed||normalized?.breedProfileId||''),traits,unmappedTraits:{},unmappedLoci:{},genomicTests:clone(normalized?.tests||[]),evidence:clone(normalized?.evidence||[]),history:clone(normalized?.history||[]),conflicts:clone(normalized?.conflicts||[]),delegate:normalized};
    }
    const definitions=traitsBySpecies.get(s)||new Map(),records={};
    for(const [id] of definitions){const old=input?.traits?.[id]||input?.loci?.[id]||{};records[id]={...blankRecord(),...clone(old),alleles:Array.isArray(old?.alleles)?old.alleles.map(a=>clean(a)||UNKNOWN):[]};}
    const unmappedTraits={};Object.entries(input?.traits||{}).forEach(([id,row])=>{if(!definitions.has(key(id)))unmappedTraits[id]=clone(row);});
    const unmappedLoci={};Object.entries(input?.loci||{}).forEach(([id,row])=>{if(!definitions.has(key(id)))unmappedLoci[id]=clone(row);});
    return{schemaVersion:SCHEMA_VERSION,geneticsContractVersion:CONTRACT_VERSION,species:s,adapterVersion:adapter.version,breedId:key(input?.breedId||input?.breed||''),traits:records,unmappedTraits,unmappedLoci,genomicTests:clone(input?.genomicTests||input?.tests||[]),quantitativeValues:clone(input?.quantitativeValues||[]),evidence:clone(input?.evidence||[]),history:clone(input?.history||[]),conflicts:clone(input?.conflicts||[])};
  }

  const genotypeKey=alleles=>alleles.map(clean).join('/');
  function phenotypeFor(def,alleles,sex=''){
    const rules=def.phenotypeRules||{},direct=genotypeKey(alleles),reverse=genotypeKey([...alleles].reverse());
    return rules[`${sex}:${direct}`]||rules[`${sex}:${reverse}`]||rules[direct]||rules[reverse]||'Genotype recorded';
  }
  function crossAutosomal(def,a,b){
    const x=Array.isArray(a)?a:[],y=Array.isArray(b)?b:[];
    if(x.length!==2||y.length!==2||[...x,...y].some(v=>!clean(v)||v===UNKNOWN))return{mode:'partial',probabilities:false,outcomes:[],missing:['Both parents need two known alleles for an exact probability calculation.']};
    const map=new Map();x.forEach(ax=>y.forEach(by=>{const pair=[ax,by].map(clean).sort();const k=pair.join('/');map.set(k,(map.get(k)||0)+.25);}));
    return{mode:'exact',probabilities:true,outcomes:[...map].map(([g,p])=>{const alleles=g.split('/');return{genotype:alleles,probability:p,phenotype:phenotypeFor(def,alleles),carrier:carrierStatus(def,alleles)};})};
  }
  function crossSexLinked(def,sire,dam,options={}){
    const system=options.system||def.chromosomeSystem||'ZW',s=Array.isArray(sire)?sire:[],d=Array.isArray(dam)?dam:[];
    if(s.length!==2||d.length!==2||[...s,...d].some(v=>!clean(v)||v===UNKNOWN))return{mode:'partial',probabilities:false,outcomes:[],missing:['Known sex-chromosome genotypes are required for exact sex-linked probabilities.']};
    const rows=[];
    if(system==='ZW'){
      const damZ=d.find(a=>a!=='W');if(!dam.includes('W')||!damZ)return{mode:'invalid',probabilities:false,outcomes:[],notice:'ZW analysis expects sire ZZ and dam ZW records.'};
      if(s.includes('W'))return{mode:'invalid',probabilities:false,outcomes:[],notice:'ZW analysis expects sire ZZ and dam ZW records.'};
      s.forEach(z=>{rows.push({sex:'male',chromosomes:[z,damZ],probability:.25});rows.push({sex:'female',chromosomes:[z,'W'],probability:.25});});
    }else if(system==='XY'){
      const sireX=s.find(a=>a!=='Y');if(!s.includes('Y')||!sireX||d.includes('Y'))return{mode:'invalid',probabilities:false,outcomes:[],notice:'XY analysis expects sire XY and dam XX records.'};
      d.forEach(x=>{rows.push({sex:'female',chromosomes:[sireX,x],probability:.25});rows.push({sex:'male',chromosomes:[x,'Y'],probability:.25});});
    }else return{mode:'invalid',probabilities:false,outcomes:[],notice:'The adapter does not define an XY or ZW chromosome system.'};
    return{mode:'exact-sex-linked',probabilities:true,chromosomeSystem:system,outcomes:rows.map(r=>({...r,phenotype:phenotypeFor(def,r.chromosomes,r.sex)}))};
  }

  function carrierStatus(def,alleles){
    if(!Array.isArray(alleles)||alleles.length!==2||alleles.some(a=>!clean(a)||a===UNKNOWN))return'unknown';
    const risk=clean(def.riskAllele);if(!risk||!(def.condition||def.inheritanceModel===INHERITANCE_MODELS.AUTOSOMAL_RECESSIVE))return'not-applicable';
    const count=alleles.filter(a=>a===risk).length;return count===2?'affected':count===1?'carrier':'clear';
  }
  function analyzeTrait(def,a=blankRecord(),b=blankRecord(),adapter){
    if(def.traitType===TRAIT_TYPES.QUANTITATIVE)return{mode:'quantitative',probabilities:false,parentValues:[a.value??null,b.value??null],unit:a.unit||b.unit||def.unit||'',notice:'Quantitative breeding values are recorded as evidence, not converted into Mendelian percentages.'};
    if([TRAIT_TYPES.COMPLEX,TRAIT_TYPES.POLYGENIC,TRAIT_TYPES.GENOMIC,TRAIT_TYPES.INFORMATIONAL].includes(def.traitType))return{mode:def.traitType,probabilities:false,parentRecords:[clone(a),clone(b)],notice:'This trait is recorded without unsupported Mendelian probabilities.'};
    if(def.traitType===TRAIT_TYPES.SEX_LINKED||[INHERITANCE_MODELS.X_LINKED,INHERITANCE_MODELS.Z_LINKED].includes(def.inheritanceModel))return crossSexLinked(def,a.alleles,b.alleles,{system:def.chromosomeSystem||adapter?.chromosomeSystem});
    return crossAutosomal(def,a.alleles,b.alleles);
  }

  function adapterExplanation(adapter,context={}){
    if(adapter?.explain){try{return clean(adapter.explain(context));}catch{}}
    if(adapter?.status===ADAPTER_STATUS.FOUNDATION)return `${adapter.label} is registered on the v1.7.1 shared genetics contract. Species-specific trait definitions are intentionally deferred${adapter.nextRelease?` to ${adapter.nextRelease}`:''}; HerdHarbor will not invent genotype claims before those rules are reviewed.`;
    return `${adapter?.label||'This species'} uses the HerdHarbor shared genetics contract.`;
  }
  function analyzePairing(parent1,parent2,context={}){
    const s1=canonicalSpecies(parent1?.species),s2=canonicalSpecies(parent2?.species);
    if(!s1||s1!==s2)return{supported:false,mode:'incompatible-species',reason:'Both animals must be the same registered species.',compatibility:{sameSpecies:false}};
    const adapter=getAdapter(s1);if(!adapter)return{supported:false,mode:'unsupported-species',reason:`No genetics adapter is registered for ${s1}.`,compatibility:{sameSpecies:true,adapterReady:false}};
    if(s1==='rabbit'&&adapter.analyzePairing){const delegated=adapter.analyzePairing(parent1,parent2,context);return{...delegated,platformVersion:VERSION,adapter:{species:'rabbit',status:adapter.status,version:adapter.version},delegatedTo:'rabbit-genetics-v1.6.1'};}
    const traits=listTraits(s1,{breed:parent1?.breed||parent2?.breed}),p1=normalizeProfile(parent1?.genetics||{},s1),p2=normalizeProfile(parent2?.genetics||{},s1);
    if(!traits.length)return{supported:true,mode:'foundation',platformVersion:VERSION,geneticsContractVersion:CONTRACT_VERSION,species:s1,adapter:{species:s1,status:adapter.status,version:adapter.version,nextRelease:adapter.nextRelease},analyses:[],notices:[],unknowns:[],compatibility:{sameSpecies:true,adapterReady:true,traitDefinitionsAvailable:false,exactPredictionsAvailable:false},explanation:adapterExplanation(adapter,{parent1,parent2,context})};
    const analyses=[],notices=[],unknowns=[];
    traits.forEach(def=>{const result=analyzeTrait(def,p1.traits[def.id],p2.traits[def.id],adapter);if(result.mode==='partial')unknowns.push(def.id);if(def.condition&&result.probabilities){const affected=result.outcomes.find(o=>o.carrier==='affected'||o.phenotype==='Affected');if(affected)notices.push({severity:'warning',traitId:def.id,title:'Recorded recessive risk',message:`This pairing can produce offspring with the recorded affected genotype for ${def.name}.`,probability:affected.probability});}analyses.push({traitId:def.id,traitName:def.name,traitType:def.traitType,inheritanceModel:def.inheritanceModel,scientificStatus:def.scientificStatus,result});});
    return{supported:true,mode:'analysis',platformVersion:VERSION,geneticsContractVersion:CONTRACT_VERSION,species:s1,adapter:{species:s1,status:adapter.status,version:adapter.version},analyses,notices,unknowns,compatibility:{sameSpecies:true,adapterReady:true,traitDefinitionsAvailable:true,exactPredictionsAvailable:analyses.some(x=>x.result.probabilities)},explanation:adapterExplanation(adapter,{parent1,parent2,context,analyses})};
  }
  const predictOffspring=(parent1,parent2,context={})=>analyzePairing(parent1,parent2,{...context,purpose:'offspring-prediction'});

  function applyEvidence(profile,item){
    const out=normalizeProfile(profile,profile?.species),id=key(item?.traitId),record=out.traits[id];if(!record)return out;
    const oldRank=EVIDENCE_PRIORITY[record.status]||0,newRank=EVIDENCE_PRIORITY[item.status]||0,old=clone(record);
    if(newRank<oldRank&&JSON.stringify(item.alleles??item.value)!==JSON.stringify(record.alleles?.length?record.alleles:record.value))out.conflicts.push({traitId:id,existing:old,incoming:clone(item),resolution:'review-required',createdAt:new Date().toISOString()});
    else if(newRank>=oldRank){if(Array.isArray(item.alleles))record.alleles=clone(item.alleles);if(item.value!==undefined)record.value=item.value;record.status=item.status||record.status;record.source=item.source||record.source;record.confidence=item.confidence??record.confidence;out.history.push({at:new Date().toISOString(),traitId:id,oldState:old,newState:clone(record),reason:item.reason||'evidence-applied'});}
    record.provenance.push({at:new Date().toISOString(),...clone(item)});out.evidence.push({at:new Date().toISOString(),...clone(item)});return out;
  }
  function pedigreeEvidence(animal,animals=[],traitId,maxDepth=5){
    const s=canonicalSpecies(animal?.species),byId=new Map(animals.map(a=>[String(a.id),a])),rows=[],id=key(traitId);
    function walk(parentId,depth,relationship){if(!parentId||depth>maxDepth)return;const relative=byId.get(String(parentId));if(!relative||canonicalSpecies(relative.species)!==s)return;const record=normalizeProfile(relative.genetics||{},s).traits[id];if(record&&(record.status!=='unknown'||record.alleles?.length||record.value!=null))rows.push({traitId:id,relatedAnimalId:relative.id,relationship,depth,status:'pedigree-inferred',record:clone(record)});walk(relative.sireId,depth+1,`${relationship} sire`);walk(relative.damId,depth+1,`${relationship} dam`);}
    walk(animal?.sireId,1,'sire');walk(animal?.damId,1,'dam');return rows;
  }
  function offspringEvidenceForParents(parent1,parent2,offspring=[],traitId){
    const s=canonicalSpecies(parent1?.species);if(s!==canonicalSpecies(parent2?.species))return[];const def=(traitsBySpecies.get(s)||new Map()).get(key(traitId));if(!def?.condition||!def.riskAllele)return[];
    const affected=(offspring||[]).filter(child=>{if(canonicalSpecies(child?.species)!==s)return false;const r=normalizeProfile(child.genetics||{},s).traits[def.id];return carrierStatus(def,r?.alleles)==='affected';});
    if(!affected.length)return[];return[parent1,parent2].map(parent=>({traitId:def.id,allele:def.riskAllele,status:'offspring-confirmed',source:'offspring',relatedAnimalIds:affected.map(x=>x.id),reason:`Affected offspring establish that ${parent?.name||'this parent'} contributed the recorded risk allele.`}));
  }

  registerAdapter({species:'Rabbit',label:'Rabbit',status:ADAPTER_STATUS.PRODUCTION,version:rabbitEngine?.VERSION||'1.6.1',description:'Complete domestic rabbit genetics engine preserved and delegated unchanged.',capabilities:{sexLinked:false},normalize:input=>rabbitEngine?.normalizeGenetics?.(input)||input,analyzePairing:(a,b,c)=>rabbitEngine?.analyzePairing?.(a,b,c)||{supported:false,reason:'Rabbit genetics engine unavailable.'},explain:()=>`Rabbit genetics is delegated to the completed v${rabbitEngine?.VERSION||'1.6.1'} rabbit engine; v1.7.1 does not replace or reinterpret it.`});
  if(rabbitEngine?.LOCI)Object.entries(rabbitEngine.LOCI).forEach(([id,def])=>{registerLocus('rabbit',{id,name:def.name,alleles:def.dominance||[],scientificStatus:def.scientificStatus,metadata:{rabbitLocus:id,predictionModel:def.predictionModel}});registerTrait('rabbit',{id,name:def.name,traitType:def.predictionModel==='mendelian'?TRAIT_TYPES.MENDELIAN:TRAIT_TYPES.INFORMATIONAL,inheritanceModel:def.predictionModel||INHERITANCE_MODELS.INFORMATIONAL,locusId:id,alleles:def.dominance||[],scientificStatus:def.scientificStatus,metadata:{delegateOnly:true,rabbitLocus:id}});});
  registerAdapter({species:'Cattle',label:'Cattle',status:ADAPTER_STATUS.FOUNDATION,nextRelease:'v1.7.2',description:'Cattle adapter contract only; reviewed cattle trait definitions are intentionally deferred.'});
  registerAdapter({species:'Goat',label:'Goat',status:ADAPTER_STATUS.FOUNDATION,nextRelease:'v1.7.3',description:'Goat adapter contract only; reviewed goat trait definitions are intentionally deferred.'});
  registerAdapter({species:'Sheep',label:'Sheep',status:ADAPTER_STATUS.FOUNDATION,nextRelease:'v1.7.3',description:'Sheep adapter contract only; reviewed sheep trait definitions are intentionally deferred.'});
  registerAdapter({species:'Poultry',label:'Poultry',status:ADAPTER_STATUS.FOUNDATION,nextRelease:'v1.7.4',chromosomeSystem:'ZW',description:'Poultry adapter includes ZW inheritance capability but no poultry gene library in v1.7.1.'});
  registerAdapter({species:'Swine',label:'Swine',status:ADAPTER_STATUS.FOUNDATION,nextRelease:'v1.7.5',description:'Swine adapter contract only; reviewed swine trait definitions are intentionally deferred.'});

  return Object.freeze({VERSION,CONTRACT_VERSION,SCHEMA_VERSION,UNKNOWN,TRAIT_TYPES,INHERITANCE_MODELS,ADAPTER_STATUS,EVIDENCE_PRIORITY,canonicalSpecies,normalizeSex,registerAdapter,registerLocus,registerTrait,registerSpecies,getAdapter,listAdapters,listLoci,listTraits,getSpeciesModule,applicableTraits,normalizeProfile,crossAutosomal,crossSexLinked,carrierStatus,analyzePairing,predictOffspring,applyEvidence,pedigreeEvidence,offspringEvidenceForParents,adapterExplanation,createPlatform:(opts={})=>createPlatform({rabbitEngine:opts.rabbitEngine===undefined?rabbitEngine:opts.rabbitEngine})});
}

return createPlatform({rabbitEngine:Rabbit});
});
