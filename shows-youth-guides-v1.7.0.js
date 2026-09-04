(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.HerdHarborYouthShowGuidesV170=api;
  if(root&&root.document) api.start();
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';

const VERSION='1.7.0';
const VERIFIED_AT='2026-09-04';
const STORAGE_KEY='herdharbor_pre_alpha_v1';
const SOURCES=Object.freeze({
  kentucky4hRabbit:'https://4-h.ca.uky.edu/sites/4-h.ca.uky.edu/files/6009Rabbits_Clean_2025_0.pdf',
  kentucky4hProject:'https://4-h.ca.uky.edu/sites/4-h.ca.uky.edu/files/KY%204-H%20Project%20Overview_rabbit.pdf',
  kentuckyFfaStateFair:'https://kyffa.org/state-fair-exhibits/',
  arbaShowRules:'https://arba.net/official-arba-show-rules-2/',
  arbaShowmanship:'https://arba.net/showmanship/'
});

const GUIDES=Object.freeze({
  kentucky4h:Object.freeze({
    id:'kentucky-4h-rabbit',
    title:'Kentucky 4-H Rabbit Show Guide',
    sourceYear:2025,
    scope:'Kentucky State Fair 4-H Rabbit Division reference',
    officialSource:SOURCES.kentucky4hRabbit,
    showmanshipClasses:['401 A Junior Showmanship','401 B Senior Showmanship'],
    entryChecks:[
      'Enter the rabbit and showmanship class through the official State Fair entry system by the published deadline.',
      'Record the breed and permanent left-ear tattoo with the electronic entry and bring a copy of registration information to check-in.',
      'Confirm entries with the county 4-H agent before the event; day-of-show entries are not accepted under the referenced State Fair guide.',
      'Check the rabbit for visible signs of illness before travel. Animals showing illness can be quarantined and withheld from showing.',
      'Use a travel cage that safely confines the rabbit, provides substantial ventilation, contains waste, and keeps the rabbit from sitting in waste.',
      'Verify that the entered rabbit, tattoo, breed/variety, sex, and class match the submitted entry; substitutions are not allowed under the referenced State Fair guide.'
    ],
    showDay:[
      'The 4-H exhibitor is responsible for getting the rabbit to and from the show table and for following the posted show order.',
      'Only 4-H members are permitted at the show tables; parents and volunteers must remain outside the designated show area and may not coach during judging.',
      'The referenced guide recognizes ARBA-approved varieties and also provides a mixed-breed class; mixed-breed champions do not advance to Best of Show.',
      'Breed-level awards include Best of Breed and Best Opposite of Breed, with Best 4-Class, Best 6-Class, Best in Show, and Reserve Best in Show selected at the event.'
    ]
  }),
  ffa:Object.freeze({
    id:'ffa-youth-show',
    title:'FFA / Youth Livestock Show Guide',
    scope:'Configurable local/state fair profile',
    officialSource:SOURCES.kentuckyFfaStateFair,
    notes:[
      'FFA does not use one universal national rabbit-show rulebook for every fair. Eligibility, classes, deadlines, health requirements, and showmanship rules are normally set by the event, fair, state association, or local program.',
      'Kentucky FFA publishes State Fair exhibit and livestock rule links; HerdHarbor should point exhibitors to the applicable current fair rules instead of inventing a single FFA rabbit standard.',
      'ARBA fair-show rules allow county/state fairs to limit entries by 4-H, FFA, Grange, residence, or similar eligibility requirements and to combine recognized breeds or varieties for fair judging.'
    ]
  })
});

const SHOWMANSHIP_PRACTICE=Object.freeze([
  'Practice safe transport to and from the table and calm, controlled handling.',
  'Practice posing the rabbit correctly and returning it to a secure position after each examination step.',
  'Know the rabbit’s breed, sex, age/class, variety or color, tattoo, and basic breed purpose.',
  'Practice identifying major body parts, coat/fur type, condition, feet, teeth, eyes, ears, and general health concerns.',
  'Use correct rabbit terminology and explain what you are checking rather than silently moving through the animal.',
  'Practice answering questions about daily care, grooming, feed/water, housing, health observation, and project records.',
  'Treat practice as exhibitor evaluation: showmanship judges evaluate the contestant’s handling and knowledge, not which rabbit is the best specimen.'
]);

const clean=v=>String(v==null?'':v).trim();
const esc=v=>clean(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>`youth_guide_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
function readState(){try{const s=JSON.parse(root?.localStorage?.getItem?.(STORAGE_KEY)||'{}');return s&&typeof s==='object'?s:{}}catch{return{}}}
function writeState(s){try{root.localStorage.setItem(STORAGE_KEY,JSON.stringify(s));root.document?.dispatchEvent?.(new CustomEvent('herdharbor:youth-guides-changed',{detail:{version:VERSION}}));return true}catch{return false}}
function profiles(){const s=readState();return Array.isArray(s.youthShowGuideProfiles)?s.youthShowGuideProfiles.slice():[];}
function saveProfile(input){
  const profile={id:clean(input?.id)||uid(),name:clean(input?.name)||'Youth Show Profile',organization:clean(input?.organization),state:clean(input?.state),officialRulesUrl:clean(input?.officialRulesUrl),eligibilityNotes:clean(input?.eligibilityNotes),classNotes:clean(input?.classNotes),showmanshipNotes:clean(input?.showmanshipNotes),verifiedDate:clean(input?.verifiedDate)||new Date().toISOString().slice(0,10),updatedAt:new Date().toISOString()};
  if(profile.officialRulesUrl&&!/^https?:\/\//i.test(profile.officialRulesUrl))throw new Error('Official rules link must begin with http:// or https://');
  const s=readState();if(!Array.isArray(s.youthShowGuideProfiles))s.youthShowGuideProfiles=[];const i=s.youthShowGuideProfiles.findIndex(x=>x.id===profile.id);if(i>=0)s.youthShowGuideProfiles[i]=profile;else s.youthShowGuideProfiles.push(profile);if(!writeState(s))throw new Error('Could not save the youth-show profile.');return profile;
}
function removeProfile(id){const s=readState();if(!Array.isArray(s.youthShowGuideProfiles))return false;s.youthShowGuideProfiles=s.youthShowGuideProfiles.filter(x=>x.id!==id);return writeState(s);}
function sourceLink(label,url){return `<a class="button button-ghost button-small" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;}
function checklist(items){return `<ul class="hh-youth-checklist">${items.map(x=>`<li><span class="hh-youth-check">✓</span><span>${esc(x)}</span></li>`).join('')}</ul>`;}
function fourHView(){const g=GUIDES.kentucky4h;return `<div class="hh-youth-guide-grid"><section class="panel"><div class="panel-header"><div><span class="eyebrow">Kentucky 4-H</span><h3>${esc(g.title)}</h3><small>${esc(g.scope)} · public source last checked ${esc(VERIFIED_AT)}</small></div><span class="badge">${g.sourceYear} guide</span></div><div class="hh-youth-source-note"><strong>Usefulness first.</strong><p>This is a HerdHarbor summary of publicly posted Kentucky 4-H requirements. The official fair guide controls dates, entry limits, and event-specific requirements.</p></div><h4>Before the show</h4>${checklist(g.entryChecks)}<h4>Show day</h4>${checklist(g.showDay)}<h4>Showmanship classes in the referenced guide</h4><div class="hh-arba-chip-list">${g.showmanshipClasses.map(x=>`<span>${esc(x)}</span>`).join('')}</div><div class="action-row">${sourceLink('Official Kentucky 4-H rabbit guide',g.officialSource)}${sourceLink('Kentucky 4-H rabbit project overview',SOURCES.kentucky4hProject)}</div></section><section class="panel"><div class="panel-header"><div><h3>HerdHarbor pre-show checklist</h3><small>Practical preparation — not a replacement for the premium book or county agent instructions.</small></div></div>${checklist(['Confirm the exact event deadline and entry confirmation.','Match every entered rabbit to its permanent tattoo and class.','Review breed, variety, sex, age class, and any fair-specific eligibility rules.','Check carrier ventilation, sanitation, water plan, and weather/heat precautions.','Pack entry confirmation, grooming supplies, feed/water, waste supplies, and any required project paperwork.','Practice showmanship handling and terminology before event day.'])}</section></div>`;}
function profileCards(){const rows=profiles();if(!rows.length)return'<p class="muted">No local FFA/youth-show profiles saved yet.</p>';return `<div class="hh-youth-profile-list">${rows.map(x=>`<article class="hh-youth-profile"><div><strong>${esc(x.name)}</strong><span>${esc([x.organization,x.state].filter(Boolean).join(' · ')||'Local/custom rules')}</span><small>Verified ${esc(x.verifiedDate||'not set')}</small></div><div class="action-row">${x.officialRulesUrl?sourceLink('Open rules',x.officialRulesUrl):''}<button class="button button-ghost button-small" type="button" data-youth-profile-delete="${esc(x.id)}">Delete</button></div></article>`).join('')}</div>`;}
function ffaView(){const g=GUIDES.ffa;return `<div class="hh-youth-guide-grid"><section class="panel"><div class="panel-header"><div><span class="eyebrow">FFA / Youth Shows</span><h3>Use the actual event rules</h3><small>HerdHarbor stores a local rule profile instead of pretending every FFA rabbit show uses one standard.</small></div></div>${checklist(g.notes)}<div class="action-row">${sourceLink('Kentucky FFA State Fair exhibits',g.officialSource)}${sourceLink('ARBA fair-show rules',SOURCES.arbaShowRules)}</div><h4>Saved show-rule profiles</h4><div data-youth-profile-list>${profileCards()}</div></section><section class="panel"><div class="panel-header"><div><h3>Add an FFA / local youth-show profile</h3><small>Keep the official rule link and your local eligibility/class notes beside HerdHarbor Shows.</small></div></div><form data-youth-profile-form><div class="form-grid two"><label>Profile name<input name="name" required placeholder="2026 County Fair FFA Rabbits"></label><label>Organization<input name="organization" placeholder="FFA chapter, fair, or sponsor"></label><label>State<input name="state" placeholder="Kentucky"></label><label>Verified date<input name="verifiedDate" type="date" value="${new Date().toISOString().slice(0,10)}"></label></div><label>Official rules link<input name="officialRulesUrl" type="url" placeholder="https://..."></label><label>Eligibility notes<textarea name="eligibilityNotes" rows="2" placeholder="Membership, age, residency, ownership dates…"></textarea></label><label>Class notes<textarea name="classNotes" rows="2" placeholder="Breed/variety classes, combined classes, entry limits…"></textarea></label><label>Showmanship notes<textarea name="showmanshipNotes" rows="2" placeholder="Local showmanship divisions, scorecard, dress requirements…"></textarea></label><div class="form-actions"><button class="button button-primary" type="submit">Save show guide</button></div></form></section></div>`;}
function showmanshipView(){return `<div class="hh-youth-guide-grid"><section class="panel"><div class="panel-header"><div><span class="eyebrow">Practice</span><h3>Rabbit showmanship practice</h3><small>Built from public ARBA showmanship objectives plus general 4-H project preparation.</small></div></div>${checklist(SHOWMANSHIP_PRACTICE)}<div class="action-row">${sourceLink('ARBA showmanship reference',SOURCES.arbaShowmanship)}${sourceLink('Kentucky 4-H rabbit project',SOURCES.kentucky4hProject)}</div></section><section class="panel"><div class="panel-header"><div><h3>Quick practice questions</h3><small>Use these to prepare the exhibitor, not to score the rabbit.</small></div></div>${checklist(['What breed, variety/color, sex, and age class is this rabbit?','Where is the permanent identification tattoo and what does it say?','What body type and fur type does this breed have?','What health or condition concerns would make you stop and ask an adult, agent, or veterinarian for help?','What are this rabbit’s normal feed, water, grooming, and housing routines?','What records have you kept for weight, health care, expenses, shows, and project work?'])}</section></div>`;}
function renderPanel(mode='4h'){
  const body=mode==='ffa'?ffaView():mode==='showmanship'?showmanshipView():fourHView();
  return `<section class="hh-youth-guides-view" data-youth-guides-view><div class="hh-youth-guide-head"><div><p class="eyebrow">Shows · Youth Guides</p><h2>4-H, FFA & Showmanship</h2><p>Use official public guidance where it exists, and save the exact local rules when the event controls its own requirements.</p></div><span class="badge">v${VERSION}</span></div><div class="hh-youth-guide-tabs"><button type="button" class="button ${mode==='4h'?'button-primary':'button-ghost'}" data-youth-mode="4h">Kentucky 4-H</button><button type="button" class="button ${mode==='ffa'?'button-primary':'button-ghost'}" data-youth-mode="ffa">FFA / Local Shows</button><button type="button" class="button ${mode==='showmanship'?'button-primary':'button-ghost'}" data-youth-mode="showmanship">Showmanship Practice</button></div>${body}</section>`;
}
function bindGuidePanel(panel){
  panel.querySelectorAll('[data-youth-mode]').forEach(b=>b.addEventListener('click',()=>openGuides(b.dataset.youthMode)));
  panel.querySelector('[data-youth-profile-form]')?.addEventListener('submit',e=>{e.preventDefault();try{saveProfile(Object.fromEntries(new FormData(e.currentTarget)));openGuides('ffa')}catch(err){alert(err.message)}});
  panel.querySelectorAll('[data-youth-profile-delete]').forEach(b=>b.addEventListener('click',()=>{removeProfile(b.dataset.youthProfileDelete);openGuides('ffa')}));
}
function openGuides(mode='4h'){
  const host=root.document?.querySelector?.('#view-shows'),tabs=host?.querySelector?.('.hh-shows-tabs');if(!host||!tabs)return false;
  host.querySelector('[data-youth-guides-view]')?.remove();
  let node=tabs.nextElementSibling;while(node){if(!node.matches('[data-youth-guides-view]')){node.hidden=true;node.dataset.youthGuideHidden='1'}node=node.nextElementSibling;}
  tabs.querySelectorAll('button').forEach(b=>{b.classList.remove('button-primary');b.classList.add('button-ghost')});
  const youth=tabs.querySelector('[data-youth-guides-tab]');youth?.classList.remove('button-ghost');youth?.classList.add('button-primary');
  tabs.insertAdjacentHTML('afterend',renderPanel(mode));bindGuidePanel(host.querySelector('[data-youth-guides-view]'));return true;
}
function ensureTab(){
  const host=root.document?.querySelector?.('#view-shows');if(!host||!host.classList.contains('active'))return;
  const tabs=host.querySelector('.hh-shows-tabs');if(!tabs||tabs.querySelector('[data-youth-guides-tab]'))return;
  const b=document.createElement('button');b.type='button';b.className='button button-ghost';b.dataset.youthGuidesTab='1';b.textContent='Youth Guides';b.addEventListener('click',()=>openGuides('4h'));tabs.appendChild(b);
}
function start(){
  if(!root?.document)return;
  let queued=false;const run=()=>{if(queued)return;queued=true;setTimeout(()=>{queued=false;ensureTab()},0)};
  new MutationObserver(run).observe(document.documentElement,{subtree:true,childList:true});
  document.addEventListener('herdharbor:app-ready',run);document.addEventListener('herdharbor:youth-guides-changed',run);run();
}

return Object.freeze({VERSION,VERIFIED_AT,SOURCES,GUIDES,SHOWMANSHIP_PRACTICE,profiles,saveProfile,removeProfile,start});
});
