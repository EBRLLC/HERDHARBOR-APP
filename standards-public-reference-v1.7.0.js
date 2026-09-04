(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.HerdHarborStandardsPublicV170=api;
  if(root&&root.document) api.start();
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';

const VERSION='1.7.0';
const VERIFIED_AT='2026-09-04';
const SOURCES=Object.freeze({
  recognizedBreeds:'https://arba.net/recognized-breeds/',
  standardsCommittee:'https://arba.net/arba-standards-committee/',
  showRules:'https://arba.net/official-arba-show-rules-2/',
  corrections:'https://arba.net/wp-content/uploads/2026/04/2026-2030CorrectionsSOP.pdf',
  showmanship:'https://arba.net/showmanship/',
  standardOfPerfection:'https://arba.net/product/standard-of-perfection/'
});

const PUBLIC_SHOW_RULE_SUMMARIES=Object.freeze([
  'ARBA-sanctioned rabbit entries require a legible identifying ear mark; fair or local rules can add their own entry requirements.',
  'Official working standards may be exhibited under ARBA show rules, but they do not compete as fully recognized varieties for normal sweepstakes or breed-level awards.',
  'County and state fair shows may limit eligibility by 4-H, FFA, Grange, residence, or other fair requirements and may combine recognized breeds or varieties for fair judging.',
  'ARBA show rules require Best in Show selection at sanctioned shows; championship-leg eligibility depends on the applicable exhibitor and animal minimums.'
]);

const CORRECTIONS=Object.freeze([
  Object.freeze({breedId:'english-angora',summary:'2026–2030 correction: Broken English Angora is not yet a recognized group.',source:SOURCES.corrections}),
  Object.freeze({breedId:'argente-brun',summary:'2026–2030 correction: Argente Brun is included among breeds eligible for Commercial Normal Fur competition.',source:SOURCES.corrections})
]);

const clean=v=>String(v==null?'':v).trim();
const esc=v=>clean(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const standards=()=>root?.HerdHarborStandardsV170||null;
const key=v=>clean(v).toLowerCase().replace(/['’]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

function resolveBreed(input){
  const api=standards();
  if(input&&typeof input==='object'&&input.breedId)return input;
  if(!api)return null;
  return api.resolve({breedName:clean(input),breedId:key(input)});
}
function correctionsFor(input){const b=resolveBreed(input);return b?CORRECTIONS.filter(x=>x.breedId===b.breedId).map(x=>({...x})):[];}
function coverageFor(input){
  const api=standards(),b=resolveBreed(input);if(!api||!b)return null;
  const working=api.working({breedName:b.breedName})||[];
  return {
    breedId:b.breedId,
    breedName:b.breedName,
    edition:b.edition,
    verifiedAt:VERIFIED_AT,
    status:b.status,
    classModel:b.classModel||'',
    publicMaxWeightLb:b.publicMaxWeightLb==null?null:Number(b.publicMaxWeightLb),
    recognizedVarietyCount:(b.recognizedVarieties||[]).length,
    workingStandardCount:working.length,
    exactWeightRuleCount:(b.exactWeightRules||[]).length,
    corrections:correctionsFor(b),
    sources:[SOURCES.recognizedBreeds,SOURCES.standardsCommittee,SOURCES.showRules,SOURCES.corrections]
  };
}
function sourceButtons(){
  return [
    ['Recognized breeds',SOURCES.recognizedBreeds],
    ['Standards committee',SOURCES.standardsCommittee],
    ['Official show rules',SOURCES.showRules],
    ['2026–2030 corrections',SOURCES.corrections],
    ['Showmanship',SOURCES.showmanship]
  ].map(([label,url])=>`<a class="button button-ghost button-small" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`).join('');
}
function coveragePanel(b){
  const c=coverageFor(b);if(!c)return'';
  const working=c.workingStandardCount?`${c.workingStandardCount} current working standard${c.workingStandardCount===1?'':'s'}`:'None listed in the current public committee reference';
  const varieties=c.recognizedVarietyCount?`${c.recognizedVarietyCount} listed public variety/group reference${c.recognizedVarietyCount===1?'':'s'}`:'Public variety list incomplete — use the official source for controlling class detail';
  return `<section class="hh-public-reference" data-arba-public-coverage="${esc(c.breedId)}"><div class="hh-public-reference-head"><div><span class="eyebrow">HerdHarbor public reference</span><h4>Publicly verified breed information</h4></div><span class="hh-arba-badge ok">verified</span></div><div class="hh-public-reference-grid"><div><small>Classification</small><strong>${esc(c.classModel||'Public source incomplete')}</strong></div><div><small>Public maximum</small><strong>${c.publicMaxWeightLb==null?'Official source needed':`${esc(c.publicMaxWeightLb)} lb`}</strong></div><div><small>Varieties / groups</small><strong>${esc(varieties)}</strong></div><div><small>Working standards</small><strong>${esc(working)}</strong></div></div>${c.corrections.length?`<div class="hh-arba-callout warn"><strong>Current ARBA correction affecting this breed</strong>${c.corrections.map(x=>`<p>${esc(x.summary)}</p>`).join('')}</div>`:''}<div class="hh-public-reference-rules"><h4>What HerdHarbor can verify from public ARBA material</h4><ul>${PUBLIC_SHOW_RULE_SUMMARIES.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div><div class="action-row hh-public-source-actions">${sourceButtons()}</div><p class="muted">Public-reference data last checked ${esc(VERIFIED_AT)}. Detailed copyrighted judging prose and complete point schedules are not reproduced; use the linked official ARBA source when exact controlling language is needed.</p></section>`;
}
function topSourceStrip(){return `<section class="hh-public-source-strip" data-arba-public-sources><div><strong>Official public ARBA sources</strong><span>HerdHarbor now surfaces the public facts it can verify instead of stopping at a purchase warning.</span></div><div class="action-row">${sourceButtons()}</div></section>`;}
function enhance(){
  if(!root?.document)return;
  const host=document.querySelector('#view-standards');if(!host||!host.classList.contains('active'))return;
  if(!host.querySelector('[data-arba-public-sources]')){
    const first=host.querySelector('.hh-arba-callout');
    if(first)first.insertAdjacentHTML('afterend',topSourceStrip());
  }
  const detail=host.querySelector('[data-arba-standard-detail]');if(!detail)return;
  const breedName=clean(detail.querySelector('.hh-arba-standard-head h3')?.textContent);if(!breedName)return;
  const b=resolveBreed(breedName);if(!b)return;
  const existing=detail.querySelector('[data-arba-public-coverage]');
  if(!existing||existing.getAttribute('data-arba-public-coverage')!==b.breedId){existing?.remove();const facts=detail.querySelector('.hh-arba-facts')||detail.querySelector('.hh-arba-standard-head');facts?.insertAdjacentHTML('afterend',coveragePanel(b));}
  detail.querySelectorAll('p.muted').forEach(p=>{
    if(p.dataset.hhPublicNotice)return;
    if(/No licensed SOP prose|Consult or purchase the current ARBA Standard of Perfection/i.test(p.textContent||'')){
      p.dataset.hhPublicNotice='1';
      p.textContent='Detailed copyrighted ARBA judging text is not reproduced. Use the official-source buttons above for controlling language.';
    }
  });
}
function start(){
  if(!root?.document)return;
  let queued=false;const run=()=>{if(queued)return;queued=true;setTimeout(()=>{queued=false;enhance();},0)};
  const observer=new MutationObserver(run);observer.observe(document.documentElement,{subtree:true,childList:true});
  document.addEventListener('herdharbor:app-ready',run);
  document.addEventListener('herdharbor:standards-changed',run);
  run();
}

return Object.freeze({VERSION,VERIFIED_AT,SOURCES,PUBLIC_SHOW_RULE_SUMMARIES,CORRECTIONS,coverageFor,correctionsFor,start});
});
