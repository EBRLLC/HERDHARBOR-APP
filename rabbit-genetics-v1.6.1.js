(function(root,factory){
  const base=typeof module==='object'&&module.exports?require('./breeding-intelligence-core-v1.5.1.js'):root.HerdHarborBreedingIntelligenceCore;
  const api=factory(base);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root){root.HerdHarborRabbitGenetics=api;root.HerdHarborBreedingIntelligenceCore=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(Base){
'use strict';
if(!Base)throw new Error('HerdHarbor breeding intelligence core is required.');
const VERSION='1.6.1';
const UNKNOWN='_';
const EVIDENCE_PRIORITY=Object.freeze({unknown:0,possible:1,inferred:2,confirmed:3,tested:4});
const LOCI=Object.freeze({
  ...Base.RABBIT_LOCI,
  V:{name:'Vienna / blue-eyed white',group:'color-pattern',dominance:['V','v']},
  En:{name:'English spotting / broken',group:'color-pattern',dominance:['En','en']},
  Du:{name:'Dutch pattern',group:'color-pattern',dominance:['Du','du']},
  W:{name:'Wideband',group:'color-modifier',dominance:['W','w']},
  Rf:{name:'Rufus intensity',group:'color-modifier',dominance:['Rf','rf'],polygenic:true},
  Si:{name:'Silvering',group:'color-modifier',dominance:['Si','si'],variableExpression:true},
  Lu:{name:'Lutino',group:'color-modifier',dominance:['Lu','lu'],rare:true},
  Rex1:{name:'Rex coat (r1)',group:'coat',dominance:['R1','r1']},
  Rex2:{name:'Rex coat (r2)',group:'coat',dominance:['R2','r2']},
  Rex3:{name:'Rex coat (r3)',group:'coat',dominance:['R3','r3']},
  FGF5:{name:'Longhair',group:'coat',dominance:['L','l']},
  Sa:{name:'Satin',group:'coat',dominance:['Sa','sa']},
  M:{name:'Lionhead mane',group:'coat',dominance:['M','m']},
  Hr:{name:'Rare hairless',group:'coat',dominance:['Hr','hr'],rare:true},
  Dw:{name:'HMGA2 dwarf',group:'conformation-health',dominance:['Dw','dw']},
  Lop:{name:'Lop ear',group:'conformation',dominance:['Lop','lop'],complex:true}
});
const REGISTRIES=Object.freeze({
  canonical:{version:'2026.1',label:'Canonical domestic rabbit terminology'},
  arba:{version:'foundation-2026.1',label:'ARBA terminology foundation',scope:'Names and breed aliases only; not a judging or recognition engine.'},
  bcu:{version:'foundation-2026.1',label:'Breed-club terminology foundation',scope:'Breed terminology is isolated from biological predictions.'}
});
const BREED_PROFILES=Object.freeze({
  'netherland dwarf':{aliases:['ND'],terms:{dwarf:'true dwarf'},notes:['Breed label does not establish Dw genotype.']},
  'holland lop':{aliases:['HL'],terms:{lop:'lopped ear'},notes:['Lop expression is complex and not treated as a single fully predictive locus.']},
  lionhead:{aliases:['Lionhead'],terms:{mane:'single or double mane'}},
  rex:{aliases:['Standard Rex'],terms:{coat:'rex'}},
  'mini rex':{aliases:['Mini Rex'],terms:{coat:'rex'}}
});
const clone=v=>JSON.parse(JSON.stringify(v));
const pair=(config,value)=>{const p=Array.isArray(value)?value.slice(0,2):Array.isArray(value?.alleles)?value.alleles.slice(0,2):[UNKNOWN,UNKNOWN];while(p.length<2)p.push(UNKNOWN);const rank=a=>a===UNKNOWN?999:(config.dominance.indexOf(a)<0?998:config.dominance.indexOf(a));return p.map(a=>config.dominance.includes(a)?a:UNKNOWN).sort((a,b)=>rank(a)-rank(b));};
const known=p=>Array.isArray(p)&&p.length===2&&p.every(a=>a!==UNKNOWN);
function normalizeRecord(value,locus){const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};return{alleles:pair(LOCI[locus],value),status:EVIDENCE_PRIORITY[source.status]==null?'unknown':source.status,confidence:Number.isFinite(source.confidence)?Math.max(0,Math.min(1,source.confidence)):null,source:source.source||'',note:source.note||'',provenance:Array.isArray(source.provenance)?clone(source.provenance):[]};}
function normalizeGenetics(input){const source=input&&typeof input==='object'?input:{},loci={};Object.keys(LOCI).forEach(locus=>{loci[locus]=normalizeRecord(source.loci?.[locus],locus);});return{schemaVersion:2,engineVersion:VERSION,species:'Rabbit',phenotype:{recorded:source.phenotype?.recorded||source.recordedPhenotype||'',canonical:source.phenotype?.canonical||'',confidence:source.phenotype?.confidence??null},loci,evidence:Array.isArray(source.evidence)?clone(source.evidence):[],tests:Array.isArray(source.tests)?clone(source.tests):[],history:Array.isArray(source.history)?clone(source.history):[],conflicts:Array.isArray(source.conflicts)?clone(source.conflicts):[],registry:source.registry?clone(source.registry):{authority:'canonical',version:REGISTRIES.canonical.version},updatedAt:source.updatedAt||null};}
function migrateGenetics(input){const next=normalizeGenetics(input);next.history.push({at:new Date().toISOString(),type:'schema-migration',fromVersion:input?.schemaVersion||input?.version||0,toVersion:2});return next;}
function crossLocus(locus,a,b){const config=LOCI[locus];if(!config)return{exact:false,outcomes:[]};const x=pair(config,a),y=pair(config,b);if(!known(x)||!known(y))return{exact:false,outcomes:[]};const map=new Map();x.forEach(ax=>y.forEach(by=>{const p=pair(config,[ax,by]),key=p.join('/');map.set(key,(map.get(key)||0)+.25);}));return{exact:true,outcomes:[...map].map(([key,probability])=>({alleles:key.split('/'),probability}))};}
function traitExpression(locus,alleles){const p=pair(LOCI[locus],alleles),h=a=>p.includes(a),hom=a=>p[0]===a&&p[1]===a;if(!known(p))return{state:'unknown',label:'Unknown',healthNotice:null};switch(locus){
  case'V':return hom('v')?{state:'expressed',label:'Blue-eyed white / Vienna expressed',healthNotice:null}:h('v')?{state:'carrier',label:'Vienna carrier / possible Vienna-marked',healthNotice:null}:{state:'clear',label:'No tracked Vienna allele',healthNotice:null};
  case'En':return hom('En')?{state:'expressed',label:'Charlie-pattern genotype',healthNotice:'En/En is associated with elevated risk of megacolon syndrome; this is a breeding-health notice, not a diagnosis.'}:h('En')?{state:'expressed',label:'Broken pattern',healthNotice:null}:{state:'solid',label:'Solid pattern',healthNotice:null};
  case'Du':return hom('du')?{state:'expressed',label:'Dutch pattern',healthNotice:null}:h('du')?{state:'carrier',label:'Dutch carrier / partially resolved',healthNotice:null}:{state:'clear',label:'No tracked Dutch allele',healthNotice:null};
  case'Rex1':case'Rex2':case'Rex3':return hom(LOCI[locus].dominance[1])?{state:'expressed',label:`${LOCI[locus].name} expressed`,healthNotice:null}:h(LOCI[locus].dominance[1])?{state:'carrier',label:`${LOCI[locus].name} carrier`,healthNotice:null}:{state:'clear',label:'Normal coat at this rex locus',healthNotice:null};
  case'FGF5':return hom('l')?{state:'expressed',label:'Longhair',healthNotice:null}:h('l')?{state:'carrier',label:'Longhair carrier',healthNotice:null}:{state:'clear',label:'Short coat at tracked FGF5 locus',healthNotice:null};
  case'Sa':return hom('sa')?{state:'expressed',label:'Satin coat',healthNotice:null}:h('sa')?{state:'carrier',label:'Satin carrier',healthNotice:null}:{state:'clear',label:'Non-satin coat',healthNotice:null};
  case'M':return hom('M')?{state:'expressed',label:'Double mane',healthNotice:null}:h('M')?{state:'expressed',label:'Single mane',healthNotice:null}:{state:'clear',label:'No mane',healthNotice:null};
  case'Hr':return hom('hr')?{state:'expressed',label:'Hairless phenotype',healthNotice:'Hairlessness can require additional husbandry and veterinary review.'}:h('hr')?{state:'carrier',label:'Hairless carrier',healthNotice:null}:{state:'clear',label:'Coated',healthNotice:null};
  case'Dw':return hom('Dw')?{state:'lethal-risk',label:'Dw/Dw',healthNotice:'Dw/Dw is considered a nonviable or severe-risk combination (peanut phenotype). Avoid presenting it as a viable predicted kit.'}:h('Dw')?{state:'expressed',label:'True dwarf',healthNotice:null}:{state:'clear',label:'False dwarf / normal-size genotype at HMGA2',healthNotice:null};
  case'Lop':return{state:hom('lop')?'associated':'unresolved',label:hom('lop')?'Lop-associated genotype':'Lop ear expression unresolved',healthNotice:'Lop ear carriage is complex; this marker is informational and not determinative.'};
  default:return{state:'recorded',label:`${locus} ${p.join('/')}`,healthNotice:null};
}}
function evaluateTraits(genetics){const g=normalizeGenetics(genetics),traits=[],healthNotices=[];Object.keys(LOCI).filter(l=>!['A','B','C','D','E'].includes(l)).forEach(l=>{const result=traitExpression(l,g.loci[l].alleles);traits.push({locus:l,group:LOCI[l].group,...result});if(result.healthNotice)healthNotices.push({locus:l,severity:l==='Dw'&&result.state==='lethal-risk'?'critical':'warning',message:result.healthNotice});});return{traits,healthNotices};}
function canonicalPhenotype(genetics,recorded=''){const g=normalizeGenetics(genetics),core={};['A','B','C','D','E'].forEach(l=>core[l]=g.loci[l].alleles);const base=Base.phenotypeFromGenotype(core),evaluated=evaluateTraits(g),expressed=evaluated.traits.filter(t=>['expressed','associated','lethal-risk'].includes(t.state));return{recorded:recorded||g.phenotype.recorded||'',canonical:base.name,baseFamily:base.family,modifiers:expressed.map(t=>t.label),scope:expressed.length?'core-plus-tracked-modifiers':base.scope,healthNotices:evaluated.healthNotices};}
function applyEvidenceToGenetics(input,items){const out=normalizeGenetics(input);(items||[]).forEach(item=>{const locus=item.locus,config=LOCI[locus];if(!config||!item.allele)return;const record=out.loci[locus],incomingRank=EVIDENCE_PRIORITY[item.status]||0,currentRank=EVIDENCE_PRIORITY[record.status]||0,existing=record.alleles.slice(),has=existing.includes(item.allele);if(!has&&known(existing)&&currentRank>=incomingRank){out.conflicts.push({locus,existing,incomingAllele:item.allele,evidence:clone(item),createdAt:new Date().toISOString(),resolution:'review-required'});}else if(!has){const slot=existing.indexOf(UNKNOWN);if(slot>=0)existing[slot]=item.allele;else existing[1]=item.allele;record.alleles=pair(config,existing);}if(incomingRank>currentRank){record.status=item.status;record.source=item.source||record.source;record.confidence=item.confidence??record.confidence;}const event={createdAt:new Date().toISOString(),...clone(item)};record.provenance.push(event);out.evidence.push(event);out.history.push({at:event.createdAt,type:'evidence-applied',locus,status:item.status,source:item.source||''});});out.updatedAt=new Date().toISOString();return out;}
function analyzePairing(parent1,parent2,context={}){const legacy1={...parent1,genetics:normalizeGenetics(parent1?.genetics)},legacy2={...parent2,genetics:normalizeGenetics(parent2?.genetics)};const base=Base.analyzePairing(legacy1,legacy2,context);if(!base.supported)return base;const crosses={},incomplete=base.incompleteLoci?base.incompleteLoci.slice():[],healthNotices=[];Object.keys(LOCI).filter(l=>!['A','B','C','D','E'].includes(l)).forEach(locus=>{const a=legacy1.genetics.loci[locus].alleles,b=legacy2.genetics.loci[locus].alleles,cross=crossLocus(locus,a,b);crosses[locus]={name:LOCI[locus].name,group:LOCI[locus].group,exact:cross.exact,outcomes:cross.outcomes.map(row=>{const expression=traitExpression(locus,row.alleles);if(expression.healthNotice)healthNotices.push({locus,probability:row.probability,severity:locus==='Dw'&&expression.state==='lethal-risk'?'critical':'warning',message:expression.healthNotice});return{...row,expression};})};if(!cross.exact)incomplete.push({locus,animalName:`${parent1?.name||'Parent 1'} / ${parent2?.name||'Parent 2'}`,alleles:[a,b]});});return{...base,engineVersion:VERSION,schemaVersion:2,modifierCrosses:crosses,healthNotices,incompleteLoci:incomplete,registry:{authority:context.registry?.authority||'canonical',version:context.registry?.version||REGISTRIES.canonical.version,recognitionEvaluated:false},explanation:`${base.explanation} Tracked modifier, coat, conformation, and health-linked loci are calculated separately so unknown alleles remain unknown.`,disclaimer:'Genetic possibility is separate from registry recognition. Complex and polygenic traits are informational; health notices are not veterinary diagnoses.'};}
const RabbitGeneticsModule=Object.freeze({version:2,name:'Complete domestic rabbit genetics foundation',loci:LOCI,analyzePairing,canonicalPhenotype,registries:REGISTRIES,breedProfiles:BREED_PROFILES});
return Object.freeze({...Base,VERSION,RABBIT_LOCI:LOCI,LOCI,REGISTRIES,BREED_PROFILES,EVIDENCE_PRIORITY,RabbitGeneticsModule,normalizeGenetics,migrateGenetics,crossLocus,traitExpression,evaluateTraits,canonicalPhenotype,applyEvidenceToGenetics,analyzePairing});
});
