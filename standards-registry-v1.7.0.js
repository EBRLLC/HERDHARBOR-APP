(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.HerdHarborStandardsV170=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

const VERSION='1.7.0';
const EDITION='2026–2030';
const VERIFIED_AT='2026-09-02';
const STATUS=Object.freeze({RECOGNIZED:'recognized',WORKING:'working',UNKNOWN:'unknown'});
const SOURCES=Object.freeze({
  recognizedBreeds:'https://arba.net/recognized-breeds/',
  standardsCommittee:'https://arba.net/arba-standards-committee/',
  showRules:'https://arba.net/official-arba-show-rules-2/',
  standardOfPerfection:'https://arba.net/product/standard-of-perfection/',
  classReference:'https://www.kansas4-h.org/projects/animal-science/docs/rabbits/ARBA%20Recognized%20Breeds%20and%20Varieties%20Updated%20February%207%202024.pdf'
});
const DISCLAIMER='HerdHarbor is an informational breeder reference. It does not replace the current ARBA Standard of Perfection, show rules, registrar guidance, or a licensed judge. Possible faults or disqualifications require human verification.';

const clean=v=>String(v==null?'':v).trim();
const key=v=>clean(v).toLowerCase().replace(/['’]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const clone=v=>JSON.parse(JSON.stringify(v));
const sexKey=v=>/doe|female/i.test(clean(v))?'doe':/buck|male/i.test(clean(v))?'buck':'unknown';

const recognized = [
  ['American',12,['Blue','White'],'6-class','A large heritage breed; public ARBA material identifies Blue and White varieties.'],
  ['American Chinchilla',12,['Standard'],'6-class','Large chinchilla breed with a dense rollback coat and commercial body.'],
  ['American Fuzzy Lop',4,['Solid Pattern','Broken Pattern'],'4-class','Small lop breed distinguished by a wool coat and compact type.'],
  ['American Sable',9,['Standard'],'4-class','Medium breed known for sepia shading and commercial utility.'],
  ['Argente Brun',null,[],'unknown','Argente breed characterized by a silvered brown appearance; exact showroom class limits require the current SOP.'],
  ['Belgian Hare',9.5,[],'4-class','Racy, fully arched breed intended to present a lithe hare-like outline.'],
  ['Beveren',12,['Black','Blue','White'],'6-class','Large breed with a mandolin-style body and dense coat.'],
  ['Blanc de Hotot',11,['White'],'6-class','White breed recognized for contrasting dark eye bands.'],
  ['Blue Holicer',7.25,['Blue'],'4-class','Medium upright cylindrical breed with dense steel-blue fur.'],
  ['Britannia Petite',2.5,[],'4-class','Very small fully arched breed with an active, refined presentation.'],
  ['Californian',10.5,['Standard'],'6-class','Commercial breed with white body and dark points.'],
  ['Champagne d’Argent',12,['Standard'],'6-class','Large silvered breed with commercial type.'],
  ['Checkered Giant',null,['Black','Blue'],'6-class','Large running breed recognized for bold markings and full arch.'],
  ['Cinnamon',11,['Standard'],'6-class','Commercial breed recognized for a rust/cinnamon ground color with gray ticking.'],
  ['Creme d’Argent',11,['Standard'],'6-class','Large silvered breed with creamy surface color and orange undercolor.'],
  ['Czech Frosty',null,['Standard'],'4-class','Medium upright cylindrical breed with frosty coloration.'],
  ['Dutch',5.5,[],'4-class','Compact marked breed evaluated heavily for distinctive Dutch pattern and balance.'],
  ['Dwarf Hotot',3,['White'],'4-class','Dwarf breed recognized for a white coat and dark eye bands.'],
  ['Dwarf Papillon',null,[],'4-class','Small marked breed; use the current SOP for current recognized showroom varieties.'],
  ['English Angora',7.5,['Colored','White'],'4-class','Compact wool breed with extensive wool furnishings.'],
  ['English Lop',null,[],'6-class','Large lop breed known for exceptional ear length and a mandolin-style body.'],
  ['English Spot',8,[],'4-class','Running marked breed with butterfly, eye circles, cheek spots, spine marking, and side pattern.'],
  ['Flemish Giant',null,['Black','Blue','Fawn','Light Gray','Sandy','Steel Gray','White'],'6-class','Very large semi-arch breed evaluated for massive, balanced type.'],
  ['Florida White',6,['Standard'],'4-class','Compact white breed used for exhibition and commercial purposes.'],
  ['French Angora',10.5,['Colored','White'],'4-class','Commercial-type wool breed with clean facial furnishings compared with English Angora.'],
  ['French Lop',null,[],'6-class','Massive lop breed with heavy bone, broad head, and substantial body.'],
  ['Giant Angora',null,['White'],'6-class','Largest ARBA Angora breed, developed for wool production.'],
  ['Giant Chinchilla',16,['Standard'],'6-class','Large commercial chinchilla breed.'],
  ['Harlequin',9.5,['Japanese','Magpie'],'4-class','Marked/color-pattern breed shown in Japanese and Magpie groups.'],
  ['Havana',6.5,['Black','Blue','Broken','Chocolate','Lilac'],'4-class','Compact breed valued for rich color and mink-like fur.'],
  ['Himalayan',4.5,['Black','Blue','Chocolate','Lilac'],'4-class','Cylindrical breed with a white body and colored points.'],
  ['Holland Lop',4,['Solid Pattern','Broken Pattern'],'4-class','Compact dwarf lop breed emphasizing balance, head/crown, ear carriage, bone, and type.'],
  ['Jersey Wooly',3.5,['Agouti','AOV','Broken','Self','Shaded'],'4-class','Small wool breed with compact type and a bold head.'],
  ['Lilac',8,['Standard'],'4-class','Medium breed recognized in a single lilac/dove-gray color.'],
  ['Lionhead',3.75,[],'4-class','Small breed distinguished by a mane and compact type.'],
  ['Mini Californian',6,['Standard'],'4-class','Compact Californian-type breed recognized by ARBA effective December 1, 2025.'],
  ['Mini Lop',6.5,['Solid Pattern','Broken Pattern'],'4-class','Compact lop breed with a broad head, substantial bone, and balanced body.'],
  ['Mini Rex',4.5,['Black','Blue','Broken','Castor','Chinchilla','Chocolate','Himalayan','Lilac','Lynx','Opal','Otter','Red','Sable','Sable Point','Seal','Silver Marten','Smoke Pearl','Smoke Pearl Marten','Tortoise','White'],'4-class','Compact breed distinguished by dense, upright Rex fur.'],
  ['Mini Satin',4.75,['Black','Blue','Broken','Chinchilla','Chocolate','Chocolate Agouti','Copper','Himalayan'],'4-class','Small satinized breed with compact type and characteristic sheen.'],
  ['Netherland Dwarf',2.5,['Siamese Sable','Siamese Smoke Pearl','Tortoise Shell','Chestnut Agouti','Chinchilla','Chocolate Agouti','Lynx','Opal','Sable Point','Squirrel','Otter','Sable Marten','Silver Marten','Smoke Pearl Marten','Tan','Broken','Fawn','Himalayan','Lutino','Orange','Steel'],'4-class','Very small compact dwarf breed with a bold head and short ears.'],
  ['New Zealand',12,['Black','Blue','Broken','Red','White'],'6-class','Large commercial breed emphasizing depth, width, and meat-producing type.'],
  ['Palomino',11,['Golden','Lynx'],'6-class','Commercial breed shown in Golden and Lynx varieties.'],
  ['Polish',3.5,[],'4-class','Small compact breed with a refined head and erect ears; not a dwarf breed.'],
  ['Rex',10.5,['Black','Blue','Broken','Californian','Castor','Chinchilla','Chocolate','Lilac','Lynx','Opal','Otter','Red','Sable','Seal','White'],'4-class','Medium-large breed distinguished by dense, plush Rex fur.'],
  ['Rhinelander',10,['Black','Blue'],'4-class','Running marked breed with full arch and two-color markings.'],
  ['Satin',11,['Black','Blue','Broken','Chinchilla','Chocolate','Copper','Himalayan','Lilac','Otter','Red','Siamese','White'],'6-class','Commercial breed distinguished by a satin sheen to the coat.'],
  ['Satin Angora',9.5,['Colored','White'],'4-class','Commercial-type Angora with satinized wool.'],
  ['Silver',7,['Black','Brown','Fawn'],'4-class','Compact/medium heritage breed distinguished by silvering.'],
  ['Silver Fox',12,['Black','Chocolate'],'6-class','Commercial breed with standing fur and characteristic silvering.'],
  ['Silver Marten',9.5,['Black','Blue','Chocolate','Lilac','Sable'],'4-class','Medium breed with tan-pattern distribution expressed as silver-white markings.'],
  ['Standard Chinchilla',7.5,['Standard'],'4-class','Medium chinchilla breed with compact type.'],
  ['Tan',5.5,['Black','Blue','Chocolate','Lilac'],'4-class','Fully arched breed with tan-pattern markings and an athletic outline.'],
  ['Thrianta',6,['Standard'],'4-class','Compact breed recognized for a uniform intense orange-red color.']
];

const sectionTemplates={
  'American':['Commercial type','Fur and condition'],'American Chinchilla':['Commercial type','Chinchilla color and fur'],'American Fuzzy Lop':['Type, head and ears','Wool and condition'],'American Sable':['Commercial type','Shading and color'],'Argente Brun':['Type and balance','Silvering and color'],'Belgian Hare':['Full arch and type','Color and condition'],'Beveren':['Mandolin body','Fur and color'],'Blanc de Hotot':['Commercial type','Eye bands and color'],'Blue Holicer':['Upright cylindrical type','Blue fur and condition'],'Britannia Petite':['Full arch and type','Head, ears and condition'],'Californian':['Commercial type','Points, color and condition'],'Champagne d’Argent':['Commercial type','Silvering and coat'],'Checkered Giant':['Running type','Markings and color'],'Cinnamon':['Commercial type','Color, ticking and condition'],'Creme d’Argent':['Commercial type','Silvering and undercolor'],'Czech Frosty':['Upright cylindrical type','Frosty color and condition'],'Dutch':['Compact type','Dutch markings and color'],'Dwarf Hotot':['Compact dwarf type','Eye bands and color'],'Dwarf Papillon':['Compact type','Papillon markings'],'English Angora':['Compact type','Wool, furnishings and condition'],'English Lop':['Mandolin type','Head and ears'],'English Spot':['Running type','Markings and pattern'],'Flemish Giant':['Semi-arch and mass','Bone, fur and condition'],'Florida White':['Compact type','White color and condition'],'French Angora':['Commercial type','Wool and condition'],'French Lop':['Massive type','Head, ears and bone'],'Giant Angora':['Commercial type','Wool density and production'],'Giant Chinchilla':['Commercial type','Chinchilla color and fur'],'Harlequin':['Type and balance','Alternating color pattern'],'Havana':['Compact type','Fur and rich color'],'Himalayan':['Cylindrical type','Points and color'],'Holland Lop':['Compact type and balance','Head, crown and ears'],'Jersey Wooly':['Compact type','Head, wool and condition'],'Lilac':['Type and balance','Lilac color and fur'],'Lionhead':['Compact type','Mane and wool'],'Mini Californian':['Compact commercial type','Points, color and condition'],'Mini Lop':['Compact type','Head, ears and bone'],'Mini Rex':['Compact type','Rex fur and condition'],'Mini Satin':['Compact type','Satin sheen and color'],'Netherland Dwarf':['Compact dwarf type','Head and ears'],'New Zealand':['Commercial type','Fur and condition'],'Palomino':['Commercial type','Color and condition'],'Polish':['Compact type','Head, ears and condition'],'Rex':['Commercial type','Rex fur and condition'],'Rhinelander':['Running type','Markings and color'],'Satin':['Commercial type','Satin sheen and condition'],'Satin Angora':['Commercial type','Satin wool and condition'],'Silver':['Type and balance','Silvering and fur'],'Silver Fox':['Commercial type','Standing fur and silvering'],'Silver Marten':['Type and balance','Marten markings and color'],'Standard Chinchilla':['Compact type','Chinchilla color and fur'],'Tan':['Full arch and type','Tan pattern and color'],'Thrianta':['Compact type','Orange-red color and condition']
};

const breedSpecificRules={
  'mini-rex':{
    exactWeightRules:[
      {className:'Senior',sex:'buck',minAgeMonths:6,minLb:3,maxLb:4.25,idealLb:4},
      {className:'Senior',sex:'doe',minAgeMonths:6,minLb:3.25,maxLb:4.5,idealLb:4.25},
      {className:'Junior',sex:'buck',maxAgeMonths:5.999,minLb:2,maxLb:3.75},
      {className:'Junior',sex:'doe',maxAgeMonths:5.999,minLb:2,maxLb:3.75}
    ],
    measurements:[{id:'earLengthIn',label:'Ear length',unit:'in',max:3.5,possibleDisqualificationWhenOver:true}],
    dataCoverage:'verified-public-secondary'
  },
  'holland-lop':{measurements:[],dataCoverage:'public-breed-max-and-showroom-groups'}
};

const recognizedBreeds=recognized.map(([name,maxWeightLb,varieties,classModel,description])=>{
  const breedId=key(name);
  const sections=(sectionTemplates[name]||['Type and balance','Fur and condition']).map((title,index)=>({id:`${breedId}:section-${index+1}`,type:index===0?'physical-characteristics':'judging-considerations',title,summary:`Breeder reference for ${title.toLowerCase()}. Use the current ARBA Standard of Perfection for controlling point allocations, exact faults, and disqualifications.`,keywords:[...title.toLowerCase().split(/[^a-z]+/).filter(Boolean),'fault','disqualification']}));
  return Object.freeze({id:`arba:${EDITION}:${breedId}`,registry:'arba',edition:EDITION,species:'rabbit',breedId,breedName:name,status:STATUS.RECOGNIZED,recognized:true,classModel,classAgeReference:classModel==='4-class'?{junior:{maxAgeMonths:5.999},senior:{minAgeMonths:6}}:classModel==='6-class'?{junior:{maxAgeMonths:5.999},intermediate:{minAgeMonths:6,maxAgeMonths:7.999},senior:{minAgeMonths:8}}:null,publicMaxWeightLb:maxWeightLb,recognizedVarieties:varieties,varietyCoverage:varieties.length?'public-reference-partial-or-complete':'consult-current-sop',showroomGroups:varieties,sections,physicalCharacteristics:sections.filter(x=>x.type==='physical-characteristics').map(x=>x.summary),faults:[`Breed-specific faults are not reproduced verbatim. Record observed concerns and verify them against the current ${EDITION} SOP.`],disqualifications:[`Potential disqualifications must be verified against the current ${EDITION} SOP and show rules.`],measurements:(breedSpecificRules[breedId]?.measurements||[]),exactWeightRules:(breedSpecificRules[breedId]?.exactWeightRules||[]),dataCoverage:breedSpecificRules[breedId]?.dataCoverage||'official-public-summary',licensing:{contentMode:'structured-summary-and-factual-index',verbatimLicensed:false,notice:'No licensed SOP prose is reproduced. Consult or purchase the current ARBA Standard of Perfection for controlling language.'},source:{sourceType:'official-public-reference',urls:[SOURCES.recognizedBreeds,SOURCES.standardOfPerfection,SOURCES.classReference],lastVerified:VERIFIED_AT,effectiveDate:'2026-01-01',citationRequired:true}});
});

const workingStandards=[
  ['English Angora','Broken'],['Giant Angora','Chocolate Agouti'],['Argente St Hubert','Working Breed'],['Britannia Petite','Chinchilla'],['Britannia Petite','Silver Marten'],['Beveren','Chocolate'],['Cinnimini','Working Breed'],['Dwarf Papillon','Tri Color'],['French Lop','Otter'],['French Lop','Silver Marten'],['Holland Lop','Fox'],['Holland Lop','Silver Marten'],['Lionhead','Sable Point'],['Mini Rex','Brindle'],['Mini Satin','Sable Marten'],['Mini Satin','Smoke Marten'],['Mini Satin','Steel'],['Netherland Dwarf','Champagne'],['Netherland Dwarf','Frosty'],['Polish','Otter'],['Rex','Brindle'],['Rex','Fawn'],['Rex','Smoke Pearl'],['Silver Fox','Blue'],['Satin','Silver Marten'],['Velveteen Lop','Working Breed']
].map(([breedName,variety])=>Object.freeze({id:`working:${key(breedName)}:${key(variety)}`,breedName,variety,status:STATUS.WORKING,exhibitionEligible:true,eligibleForBOB:false,eligibleForBIS:false,source:{url:SOURCES.standardsCommittee,lastVerified:VERIFIED_AT},note:'Working standard: exhibition eligibility is informational and subject to current ARBA committee/show guidance.'}));

const JUDGING_REFERENCES=Object.freeze([
  {term:'Fault',summary:'A characteristic that reduces merit under the applicable standard but is not automatically a disqualification.'},
  {term:'Disqualification (DQ)',summary:'A condition that can make an entry ineligible for placement under the applicable standard or show rule. HerdHarbor only flags possibilities.'},
  {term:'4 Class',summary:'Showroom structure using Junior and Senior classes, split by sex.'},
  {term:'6 Class',summary:'Showroom structure using Junior, Intermediate, and Senior classes, split by sex.'},
  {term:'BOV',summary:'Best of Variety.'},{term:'BOSV',summary:'Best Opposite Sex of Variety.'},{term:'BOB',summary:'Best of Breed.'},{term:'BOSB',summary:'Best Opposite Sex of Breed.'},{term:'BIS',summary:'Best in Show.'},{term:'RIS',summary:'Reserve in Show.'},
  {term:'Leg',summary:'A recorded Grand Champion leg or other qualifying ARBA leg. Eligibility depends on current show rules and competition requirements.'},
  {term:'Schedule of Points',summary:'Breed-specific point allocations are controlled by the current SOP and are not reproduced by HerdHarbor. HerdHarbor can store a breeder’s observations by section.'},
  {term:'Display points',summary:'ARBA show rules use placement multipliers for display awards; consult the current show rules for the controlling calculation and eligibility.'}
]);

function list({species='Rabbit',status=''}={}){if(key(species)!=='rabbit')return[];return recognizedBreeds.filter(x=>!status||x.status===status).map(clone);}
function resolve({species='Rabbit',breedId='',breedName=''}={}){if(key(species)!=='rabbit')return null;const target=key(breedId||breedName);return clone(recognizedBreeds.find(x=>x.breedId===target||key(x.breedName)===target)||null);}
function organization(id){return key(id)==='arba'?clone({id:'arba',name:'American Rabbit Breeders Association',species:'rabbit',optional:true,edition:EDITION,recognizedBreedCount:recognizedBreeds.length}):null;}
function working({breedName='',breedId=''}={}){const target=key(breedName||breedId);return workingStandards.filter(x=>!target||key(x.breedName)===target).map(clone);}
function varietyStatus(breed,variety){const name=clean(variety);if(!breed||!name)return{status:'missing',label:'Variety not entered'};if((breed.recognizedVarieties||[]).some(v=>key(v)===key(name)))return{status:'recognized',label:'Recognized/public showroom reference'};const w=working({breedName:breed.breedName}).find(x=>key(x.variety)===key(name));if(w)return{status:'working',label:'Working standard / exhibition only',working:w};if(!breed.recognizedVarieties?.length||breed.varietyCoverage!=='complete')return{status:'unverified',label:'Not verified by the bundled public reference; consult current SOP'};return{status:'not-recognized',label:'Not listed in bundled recognized varieties; verify current SOP before treating as non-showable'};}
function monthsOld(dob,onDate=new Date().toISOString().slice(0,10)){if(!dob)return null;const birth=new Date(`${String(dob).slice(0,10)}T12:00:00Z`),at=new Date(`${String(onDate).slice(0,10)}T12:00:00Z`);if(Number.isNaN(birth.getTime())||Number.isNaN(at.getTime())||at<birth)return null;return(at-birth)/(86400000*30.436875);}
function ageClassFor(breed,ageMonths){if(!breed||ageMonths==null||!Number.isFinite(Number(ageMonths)))return{status:'unknown',className:null};const age=Number(ageMonths);if(breed.classModel==='4-class')return{status:'eligible-by-age',className:age<6?'Junior':'Senior'};if(breed.classModel==='6-class')return{status:'eligible-by-age',className:age<6?'Junior':age<8?'Intermediate':'Senior'};return{status:'unknown',className:null};}
function weightRuleFor(breed,className,sex){const s=sexKey(sex),c=key(className);return(breed?.exactWeightRules||[]).find(r=>r.sex===s&&key(r.className)===c)||null;}
function evaluate(input={}){
  const breed=resolve({breedName:input.breedName||input.breed,breedId:input.breedId});
  const result={available:Boolean(breed),registry:'arba',edition:EDITION,verifiedAt:VERIFIED_AT,breed:breed?{breedId:breed.breedId,breedName:breed.breedName,classModel:breed.classModel}:null,variety:null,ageClass:null,weight:null,measurements:[],possibleDisqualifications:[],possibleFaults:[],missingMeasurements:[],informational:true,disclaimer:DISCLAIMER};
  if(!breed)return result;
  const ageMonths=input.ageMonths!=null?Number(input.ageMonths):monthsOld(input.dob,input.onDate);result.ageClass=ageClassFor(breed,ageMonths);result.variety=varietyStatus(breed,input.variety||input.color);
  const weight=input.weightLb==null||input.weightLb===''?null:Number(input.weightLb);
  if(weight==null||!Number.isFinite(weight)){result.weight={status:'missing',weightLb:null};result.missingMeasurements.push('Current weight');}
  else{const rule=weightRuleFor(breed,result.ageClass.className,input.sex);if(rule){const status=weight<rule.minLb?'underweight':weight>rule.maxLb?'overweight':'within-standard-weight';result.weight={status,weightLb:weight,minLb:rule.minLb,maxLb:rule.maxLb,idealLb:rule.idealLb??null,source:'verified-class-sex-rule'};if(status!=='within-standard-weight')result.possibleDisqualifications.push(`Weight is ${status} for the bundled ${result.ageClass.className} ${sexKey(input.sex)} reference.`);}else if(Number.isFinite(breed.publicMaxWeightLb)){const status=weight>breed.publicMaxWeightLb?'over-public-breed-maximum':'within-public-breed-maximum-only';result.weight={status,weightLb:weight,minLb:null,maxLb:breed.publicMaxWeightLb,source:'official-public-breed-maximum'};if(status==='over-public-breed-maximum')result.possibleDisqualifications.push(`Weight exceeds the public ARBA breed maximum of ${breed.publicMaxWeightLb} lb.`);}else result.weight={status:'no-bundled-weight-rule',weightLb:weight,minLb:null,maxLb:null,source:'consult-current-sop'};}
  for(const metric of breed.measurements||[]){const value=input[metric.id]==null||input[metric.id]===''?null:Number(input[metric.id]);if(value==null||!Number.isFinite(value)){result.missingMeasurements.push(metric.label);continue;}const row={id:metric.id,label:metric.label,value,unit:metric.unit,min:metric.min??null,max:metric.max??null,status:'recorded'};if(metric.max!=null&&value>metric.max){row.status='over-reference-maximum';(metric.possibleDisqualificationWhenOver?result.possibleDisqualifications:result.possibleFaults).push(`${metric.label} exceeds the bundled public reference maximum.`);}if(metric.min!=null&&value<metric.min){row.status='under-reference-minimum';(metric.possibleDisqualificationWhenUnder?result.possibleDisqualifications:result.possibleFaults).push(`${metric.label} is below the bundled public reference minimum.`);}result.measurements.push(row);}
  const recordedFaults=Array.isArray(input.recordedFaults)?input.recordedFaults:String(input.recordedFaults||'').split(/\n|,/).map(clean).filter(Boolean),recordedDqs=Array.isArray(input.recordedDisqualifications)?input.recordedDisqualifications:String(input.recordedDisqualifications||'').split(/\n|,/).map(clean).filter(Boolean);result.possibleFaults.push(...recordedFaults.map(x=>`User-recorded fault: ${x}`));result.possibleDisqualifications.push(...recordedDqs.map(x=>`User-recorded possible DQ: ${x}`));if(result.variety.status==='working')result.possibleFaults.push('Working-standard variety: exhibition eligibility does not include BOB/BIS competition.');return result;
}
function latestAnimalWeight(state,animalId,onDate=''){const rows=(state?.health||[]).filter(x=>String(x.animalId)===String(animalId)&&/weight/i.test(clean(x.type||x.category))&&Number(x.weight)>0).filter(x=>!onDate||!x.date||String(x.date).slice(0,10)<=String(onDate).slice(0,10)).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));if(!rows.length)return null;const row=rows[0],unit=clean(row.unit||row.weightUnit||'lb').toLowerCase(),n=Number(row.weight),weightLb=unit==='kg'?n*2.2046226218:unit==='g'?n*0.0022046226218:unit==='oz'?n/16:n;return{weightLb,date:row.date||'',sourceId:row.id||''};}
function animalEvaluationInput(state,animalId,onDate=''){const animal=(state?.animals||[]).find(x=>String(x.id)===String(animalId));if(!animal)return null;const weight=latestAnimalWeight(state,animalId,onDate);return{animalId,breedName:animal.breed||'',sex:animal.sex||'',dob:animal.dob||animal.dateOfBirth||'',variety:animal.variety||animal.color||'',weightLb:weight?.weightLb??null,onDate:onDate||new Date().toISOString().slice(0,10)};}
function pairingInsights(state,sireId,damId){const ids=[sireId,damId].filter(Boolean).map(String),evaluations=(state?.standardsEvaluations||[]).filter(x=>ids.includes(String(x.animalId))).sort((a,b)=>String(b.evaluatedAt||'').localeCompare(String(a.evaluatedAt||''))),messages=[];ids.forEach(id=>{const animal=(state?.animals||[]).find(a=>String(a.id)===id),own=evaluations.filter(x=>String(x.animalId)===id),weightIssues=own.filter(x=>/overweight|underweight|over-public/.test(x.result?.weight?.status||''));if(weightIssues.length>=2)messages.push(`${animal?.name||'This animal'} has repeated standards-evaluation weight flags (${weightIssues.length} recorded evaluations).`);const dqs=own.flatMap(x=>x.result?.possibleDisqualifications||[]);if(dqs.length)messages.push(`${animal?.name||'This animal'} has ${dqs.length} recorded possible standards disqualification flag${dqs.length===1?'':'s'} to review before pairing.`);const entries=(state?.showEntries||[]).filter(e=>String(e.animalId)===id),resultIds=new Set((state?.showResults||[]).filter(r=>entries.some(e=>e.id===r.entryId)).map(r=>r.id)),awards=(state?.showAwards||[]).filter(a=>String(a.animalId)===id||resultIds.has(a.resultId));if(awards.length>=2)messages.push(`${animal?.name||'This animal'} has ${awards.length} recorded show awards; use those observations alongside genetics and pedigree data.`);});const offspring=(state?.animals||[]).filter(a=>ids.includes(String(a.sireId))&&ids.includes(String(a.damId))),offspringIds=new Set(offspring.map(a=>String(a.id))),offspringEvals=(state?.standardsEvaluations||[]).filter(x=>offspringIds.has(String(x.animalId))),within=offspringEvals.filter(x=>/within-standard-weight|within-public-breed-maximum-only/.test(x.result?.weight?.status||'')).length;if(offspringEvals.length>=3)messages.push(`${within} of ${offspringEvals.length} recorded offspring evaluations were within the bundled weight reference at evaluation time.`);if(!messages.length)messages.push('No repeated standards-conformity pattern is established yet. Continue recording evaluations and show observations; genetics and pedigree predictions remain separate evidence.');return{messages,evaluationCount:evaluations.length,offspringEvaluationCount:offspringEvals.length,informational:true,disclaimer:DISCLAIMER};}
function search(query,{breedId='',limit=50}={}){const terms=clean(query).toLowerCase().split(/\s+/).filter(Boolean);if(!terms.length)return[];const context=key(breedId),rows=[];recognizedBreeds.forEach(breed=>{const pieces=[{type:'breed',title:breed.breedName,summary:breed.sections[0]?.summary||'',keywords:[breed.breedName,...breed.recognizedVarieties]},...breed.sections.map(s=>({type:s.type,title:s.title,summary:s.summary,keywords:s.keywords}))];pieces.forEach(piece=>{const text=[breed.breedName,piece.title,piece.summary,...(piece.keywords||[])].join(' ').toLowerCase();if(!terms.every(t=>text.includes(t)))return;const score=terms.length+(breed.breedId===context?10:0);rows.push({score,breedId:breed.breedId,breedName:breed.breedName,edition:breed.edition,status:breed.status,section:clone(piece),source:clone(breed.source),licensing:clone(breed.licensing)});});});return rows.sort((a,b)=>b.score-a.score||a.breedName.localeCompare(b.breedName)).slice(0,limit);}
function judgingReferences(){return clone(JUDGING_REFERENCES);}function applyCorrections(standard){return standard?clone({...standard,appliedCorrections:[]}):null;}function unavailableState(error){return{available:false,title:'ARBA reference temporarily unavailable',message:'Core HerdHarbor animal, breeding, genetics, and show records remain available.',errorCode:error?'module-error':'no-data'};}
return Object.freeze({VERSION,EDITION,STATUS,SOURCES,DISCLAIMER,organization,list,resolve,working,search,varietyStatus,monthsOld,ageClassFor,evaluate,latestAnimalWeight,animalEvaluationInput,pairingInsights,judgingReferences,applyCorrections,unavailableState,key});
});
