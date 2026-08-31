(function(root,factory){const Base=(typeof module==='object'&&module.exports)?require('./rabbit-genetics-engine-compat-v1.6.1.js'):root.HerdHarborBreedingIntelligenceCore;const api=factory(Base||{});if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.HerdHarborBreedingIntelligenceCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(Base){
'use strict';
const VERSION='2.1.1', RELEASE_VERSION='1.6.1';
const BASE_LOCI=['A','B','C','D','E','En'];
const clean=v=>String(v==null?'':v).trim(), norm=v=>clean(v).toLowerCase().replace(/[()]/g,' ').replace(/\s+/g,' ').trim();
const pk=(l,p)=>Base.normalizeGenetics({loci:{[l]:{alleles:p}}}).loci[l].alleles.join('/');
function explicit(animal,l){return Base.normalizeGenetics(animal?.genetics).loci[l].alleles;}
function vStatus(animal){return norm(animal?.genetics?.vienna?.status||animal?.viennaStatus||animal?.vienna);}
function whiteMask(color){const n=norm(color);return /\b(rew|red[- ]?eyed white|bew|blue[- ]?eyed white)\b/.test(n);}
function phenotypePairs(animal,locus){let list=Base.phenotypePairs?Base.phenotypePairs(animal,locus):Base.possiblePairsForLocus(animal,animal?.color||animal?.variety,locus);const c=norm(animal?.color||animal?.variety),e=explicit(animal,locus);
  if(locus==='A'&&(/\btort\b|sable point|siamese sable|smoke pearl/.test(c)||/^(?:solid\s+)?(?:black|blue|chocolate|lilac)$/.test(c))) list=list.filter(p=>pk('A',p)==='a/a');
  if(locus==='E'&&!e.includes('Ed')&&!e.includes('Es')){
    if(/magpie|harlequin|tricolor|tri color|tri-color/.test(c)) list=list.filter(p=>['ej/ej','ej/e'].includes(pk('E',p)));
    else if(!/tort|orange|red|fawn|cream|frosty|sable point|steel/.test(c)&&c) list=list.filter(p=>['E/E','E/ej','E/e'].includes(pk('E',p)));
  }
  if(locus==='En'){
    if(/^broken\b|tricolor|tri color|tri-color/.test(c)) list=list.filter(p=>pk('En',p)==='En/en');
    else if(/^charlie\b/.test(c)) list=list.filter(p=>pk('En',p)==='En/En');
    else if(c&&!whiteMask(c)) list=list.filter(p=>pk('En',p)==='en/en');
  }
  if(locus==='V'){
    const vs=vStatus(animal);
    if(/blue[- ]?eyed white|\bbew\b/.test(c)||vs==='blue-eyed white bew'||vs==='bew') list=list.filter(p=>pk('V',p)==='v/v');
    else if(/vienna marked|\bvm\b|vienna carrier|\bvc\b/.test(vs)) list=list.filter(p=>pk('V',p)==='V/v');
    else if(/clean/.test(vs)) list=list.filter(p=>pk('V',p)==='V/V');
    else if(c&&!whiteMask(c)) list=list.filter(p=>['V/V','V/v'].includes(pk('V',p)));
  }
  return list.length?list:(Base.phenotypePairs?Base.phenotypePairs(animal,locus):Base.possiblePairsForLocus(animal,animal?.color||animal?.variety,locus));
}
function childVisible(g){const base=Base.basePhenotypeFromGenotype(g);if(!base||base.name==='Unknown')return null;const en=pk('En',g.En||['en','en']);let name=base.name,family=base.family;if(en==='En/En'){name=`Charlie ${name}`;family=`Charlie / ${family}`;}else if(en==='En/en'){if(/ Harlequin$/.test(name))name=name.replace(/ Harlequin$/,' Tricolor');else name=`Broken ${name}`;family=`Broken / ${family}`;}return{name,family,underlyingName:base.name};}
function childDistribution(scenario){let rows=[{genotype:{},probability:1}];for(const item of scenario){const cross=Base.crossLocus(item.locus,item.p1,item.p2).outcomes,next=[];for(const row of rows)for(const o of cross)next.push({genotype:{...row.genotype,[item.locus]:o.alleles},probability:row.probability*o.probability});rows=next;}const m=new Map();for(const row of rows){const ph=childVisible(row.genotype);if(!ph)continue;const x=m.get(ph.name)||{...ph,probability:0};x.probability+=row.probability;m.set(ph.name,x);}return m;}
function scenarios(p1,p2,max=20000){const choices=BASE_LOCI.map(l=>{const out=[];for(const a of phenotypePairs(p1,l))for(const b of phenotypePairs(p2,l))out.push({locus:l,p1:a,p2:b});return out;}),total=choices.reduce((n,c)=>n*c.length,1);if(total>max)return{total,truncated:true,rows:[]};let rows=[[]];for(const cs of choices){const next=[];for(const r of rows)for(const c of cs)next.push(r.concat(c));rows=next;}return{total,truncated:false,rows};}
function vRange(p1,p2){const combos=[];for(const a of phenotypePairs(p1,'V'))for(const b of phenotypePairs(p2,'V'))combos.push(Base.crossLocus('V',a,b).outcomes);const probability=(target)=>{const vals=combos.map(rows=>rows.find(o=>pk('V',o.alleles)===target)?.probability||0);return{minProbability:Math.min(...vals),maxProbability:Math.max(...vals)};};return{bew:probability('v/v'),carrier:probability('V/v'),clean:probability('V/V')};}
function reason(name,p1,p2){const n=norm(name),needs=[];const add=(l,a,label)=>{const u=[];for(const p of [p1,p2]){const opts=phenotypePairs(p,l),some=opts.some(x=>x.includes(a)),all=opts.every(x=>x.includes(a));if(some&&!all)u.push(p.name||'one parent');}if(u.length)needs.push(`${u.join(' and ')} ${u.length>1?'have':'has'} unresolved ${label} (${a}) status`);};if(/chocolate|lilac/.test(n))add('B','b','chocolate-carrier');if(/blue|lilac|opal|squirrel|smoke pearl|cream/.test(n))add('D','d','dilute-carrier');if(/rew|red[- ]?eyed white/.test(n))add('C','c','REW-carrier');if(/harlequin|magpie|tricolor/.test(n))add('E','ej','Japanese');if(/magpie/.test(n))add('C','cchd','chinchilla');return needs.length?`Requires ${needs.join('; ')}.`:'';}
function colorRanges(p1,p2){const s=scenarios(p1,p2),v=vRange(p1,p2);if(s.truncated)return{outcomes:[],scenarioCount:s.total,truncated:true,vienna:v};const stats=new Map(),count=s.rows.length;for(const row of s.rows){const local=childDistribution(row);for(const [name,o] of local){let x=stats.get(name);if(!x){x={name,family:o.family,underlyingName:o.underlyingName,present:0,min:Infinity,max:0};stats.set(name,x);}x.present++;x.min=Math.min(x.min,o.probability);x.max=Math.max(x.max,o.probability);}}
  const nonBewMin=1-v.bew.maxProbability,nonBewMax=1-v.bew.minProbability;
  const outcomes=[...stats.values()].map(x=>{const baseMin=x.present===count?x.min:0,baseMax=x.max;const min=baseMin*nonBewMin,max=baseMax*nonBewMax;return{name:x.name,family:x.family,underlyingName:x.underlyingName,minProbability:min,maxProbability:max,exact:Math.abs(min-max)<1e-10,conditional:Math.abs(min-max)>=1e-10||x.present<count,reason:reason(x.name,p1,p2)};});
  if(v.bew.maxProbability>0)outcomes.push({name:'Blue-Eyed White (BEW)',family:'Vienna',underlyingName:'Hidden base color retained genetically',minProbability:v.bew.minProbability,maxProbability:v.bew.maxProbability,exact:Math.abs(v.bew.minProbability-v.bew.maxProbability)<1e-10,conditional:Math.abs(v.bew.minProbability-v.bew.maxProbability)>=1e-10,reason:v.bew.minProbability===v.bew.maxProbability?'':'Depends on unresolved Vienna-carrier (v) status.'});
  outcomes.sort((a,b)=>b.maxProbability-a.maxProbability||b.minProbability-a.minProbability||a.name.localeCompare(b.name));return{outcomes,scenarioCount:count,truncated:false,vienna:v};
}
function analyzePairing(p1,p2,ctx={}){const legacy=Base.analyzePairing(p1,p2,ctx),r=colorRanges(p1,p2),colors=r.outcomes,conditional=colors.filter(o=>o.conditional),exact=colors.length>0&&colors.every(o=>o.exact);return{...legacy,releaseVersion:RELEASE_VERSION,engineVersion:VERSION,possibleOffspringColors:colors,conditionalColors:conditional,scenarioCount:r.scenarioCount,scenarioTruncated:r.truncated,exact,exactOutcomes:exact?colors.map(o=>({name:o.name,family:o.family,scope:'v1.6.1 phenotype range',probability:o.minProbability})):[],possibleOutcomes:exact?[]:colors,explanation:r.truncated?'The remaining genetics still create too many valid phenotype combinations for safe on-device enumeration. Add phenotype, genotype, carrier, pedigree, or offspring evidence to narrow the result.':'Unknown alleles widen named offspring-color ranges instead of disabling the color calculation.',viennaRange:r.vienna,disclaimer:'HerdHarbor genetics predictions are breeding-planning estimates based on recorded information and deterministic inheritance rules. They are not DNA tests.'};}
return Object.freeze({...Base,VERSION,RELEASE_VERSION,phenotypePairs,colorRanges,analyzePairing});
});
