(function(root){
'use strict';

const Genetics=root.HerdHarborGeneticsPlatform;
const STORAGE_KEY='herdharbor_pre_alpha_v1';
const BREEDING_PANEL_ID='hh-breeding-genetics';
if(!Genetics)return;

const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=()=>{try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}catch{return{}}};
const label=s=>Genetics.getAdapter(s)?.label||String(s||'Unknown species');

function statusBadge(adapter){
  return `<span class="hh-msg-badge ${adapter.status==='production'?'is-production':'is-foundation'}">${adapter.status==='production'?'Production engine':'Foundation ready'}</span>`;
}

function capabilities(adapter){
  const labels={mendelian:'Mendelian',dominant:'Dominant',recessive:'Recessive',codominant:'Co-dominant',incompleteDominance:'Incomplete dominance',sexLinked:'Sex-linked',carrierStatus:'Carrier status',unknownPartial:'Partial genotype safety',pedigreeEvidence:'Pedigree evidence',pairingCompatibility:'Pairing compatibility',offspringPrediction:'Offspring predictions'};
  return Object.entries(adapter.capabilities||{})
    .filter(([,on])=>on)
    .map(([id])=>`<span>${esc(labels[id]||id)}</span>`)
    .join('');
}

function rawEvidence(profile){
  const traits=Object.entries(profile.unmappedTraits||{});
  const loci=Object.entries(profile.unmappedLoci||{});
  const tests=profile.genomicTests||[];
  if(!traits.length&&!loci.length&&!tests.length)return'<p class="muted">No additional genetics records are stored for this animal yet.</p>';
  return `<div class="hh-msg-evidence">${traits.length?`<p><strong>${traits.length}</strong> unclassified trait record${traits.length===1?'':'s'} preserved without interpretation.</p>`:''}${loci.length?`<p><strong>${loci.length}</strong> unclassified locus record${loci.length===1?'':'s'} preserved without interpretation.</p>`:''}${tests.length?`<p><strong>${tests.length}</strong> DNA/genomic test record${tests.length===1?'':'s'} preserved.</p>`:''}</div>`;
}

function foundationHtml(animal){
  const species=Genetics.canonicalSpecies(animal?.species);
  const adapter=Genetics.getAdapter(species);
  if(!adapter)return'<p>No genetics adapter is registered for this species.</p>';
  const profile=Genetics.normalizeProfile(animal.genetics||{},species);
  const traits=Genetics.listTraits(species,{breed:animal.breed});
  const loci=Genetics.listLoci(species);
  return `<div class="hh-msg-head"><div><span class="eyebrow">Alpha v1.7.1 · Shared genetics API</span><h2>${esc(label(species))} Genetics</h2><p>${esc(animal.breed||'Breed not recorded')}</p></div>${statusBadge(adapter)}</div><div class="hh-msg-callout"><strong>Architecture first.</strong><p>${esc(Genetics.adapterExplanation(adapter,{animal}))}</p></div><div class="hh-msg-facts"><div><small>Adapter</small><strong>${esc(adapter.version)}</strong></div><div><small>Reviewed loci</small><strong>${loci.length}</strong></div><div><small>Reviewed traits</small><strong>${traits.length}</strong></div><div><small>Chromosomes</small><strong>${esc(adapter.chromosomeSystem||'autosomal')}</strong></div></div><h3>Shared engine capabilities</h3><div class="hh-msg-chips">${capabilities(adapter)}</div>${traits.length?`<h3>Registered traits</h3><div class="hh-msg-traits">${traits.map(t=>`<details><summary>${esc(t.name)}</summary><p>${esc(t.traitType)} · ${esc(t.inheritanceModel)}</p><small>${esc(t.scientificStatus)}</small></details>`).join('')}</div>`:`<div class="hh-msg-callout"><strong>No species-specific gene library bundled yet.</strong><p>This is intentional for v1.7.1. The adapter, registries, inheritance contract, evidence model, and prediction plumbing are ready; reviewed ${esc(label(species).toLowerCase())} genetics content comes in ${esc(adapter.nextRelease||'a later release')}.</p></div>`}<h3>Existing records</h3>${rawEvidence(profile)}<p class="muted">Unknown and partial genetics stay unknown. HerdHarbor does not manufacture inheritance percentages from missing data.</p>`;
}

function dialog(title,html){
  document.querySelector('#hh-multispecies-genetics-dialog')?.remove();
  const d=document.createElement('div');
  d.id='hh-multispecies-genetics-dialog';
  d.className='modal-overlay active hh-msg-overlay';
  d.innerHTML=`<section class="modal hh-msg-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-header"><strong>${esc(title)}</strong><button class="icon-button" type="button" data-msg-close aria-label="Close">×</button></div><div class="modal-content">${html}</div></section>`;
  (document.body||document.documentElement).appendChild(d);
  d.querySelector('[data-msg-close]')?.addEventListener('click',()=>d.remove());
  d.addEventListener('click',e=>{if(e.target===d)d.remove()});
  return d;
}

function open(animalId){
  const state=read();
  const animal=(state.animals||[]).find(a=>String(a.id)===String(animalId));
  if(!animal)return null;
  const species=Genetics.canonicalSpecies(animal.species);
  if(species==='rabbit'){
    const openers=[
      ()=>root.HerdHarborRabbitGeneticsV2?.openProfile?.(animal.id),
      ()=>root.HerdHarborBreedingIntelligence?.openGeneticProfile?.(animal.id)
    ];
    for(const fn of openers){
      try{
        const result=fn();
        if(result!==undefined||document.querySelector('.hh-bi-modal-backdrop'))return result??true;
      }catch{}
    }
  }
  return dialog(`${animal.name||'Animal'} Genetics`,foundationHtml(animal));
}

function isActiveAnimal(animal){
  const membership=root.HerdHarborMembership;
  if(typeof membership?.isActiveAnimal==='function'){
    try{return Boolean(membership.isActiveAnimal(animal));}catch{}
  }
  return !['Sold','Deceased','Archived','Ancestor Only'].includes(String(animal?.status||''));
}

function activeGeneticsAnimals(state=read()){
  return (state.animals||[]).filter(animal=>{
    if(!isActiveAnimal(animal))return false;
    const species=Genetics.canonicalSpecies(animal.species);
    return Boolean(species&&Genetics.getAdapter(species));
  });
}

function breedingSpecies(state=read()){
  const groups=new Map();
  for(const animal of activeGeneticsAnimals(state)){
    const species=Genetics.canonicalSpecies(animal.species);
    if(!groups.has(species))groups.set(species,[]);
    groups.get(species).push(animal);
  }
  return [...groups.entries()]
    .map(([species,animals])=>({species,label:label(species),animals:[...animals].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')))}))
    .sort((a,b)=>a.label.localeCompare(b.label));
}

function speciesPanel(group){
  const adapter=Genetics.getAdapter(group.species);
  const animalCards=group.animals.map(animal=>`<article class="hh-breeding-genetics-animal"><div><strong>${esc(animal.name||'Unnamed animal')}</strong><span>${esc(animal.breed||'Breed not recorded')}${animal.sex?` · ${esc(animal.sex)}`:''}</span></div><button type="button" class="button button-ghost" data-hh-genetics-animal="${esc(animal.id)}">Open genetics</button></article>`).join('');
  return `<div class="hh-breeding-genetics-pane" data-hh-genetics-pane="${esc(group.species)}"><div class="hh-breeding-genetics-summary"><div><strong>${esc(group.label)} genetics</strong><p>${group.animals.length} active ${group.animals.length===1?'animal':'animals'} in HerdHarbor.</p></div>${statusBadge(adapter)}</div><div class="hh-breeding-genetics-animals">${animalCards}</div></div>`;
}

function breedingPanelHtml(state=read(),selectedSpecies=''){
  const groups=breedingSpecies(state);
  if(!groups.length)return'';
  const selected=groups.some(group=>group.species===selectedSpecies)?selectedSpecies:groups[0].species;
  const tabs=groups.map(group=>`<button type="button" class="hh-breeding-genetics-tab ${group.species===selected?'is-active':''}" data-hh-genetics-species="${esc(group.species)}" aria-selected="${group.species===selected?'true':'false'}">${esc(group.label)} <span>${group.animals.length}</span></button>`).join('');
  const panes=groups.map(group=>speciesPanel(group).replace('class="hh-breeding-genetics-pane"',`class="hh-breeding-genetics-pane ${group.species===selected?'is-active':''}"`)).join('');
  const signature=groups.map(group=>`${group.species}:${group.animals.map(animal=>String(animal.id)).join(',')}`).join('|');
  return `<section id="${BREEDING_PANEL_ID}" class="card hh-breeding-genetics" data-hh-genetics-signature="${esc(signature)}" data-hh-selected-species="${esc(selected)}"><div class="hh-breeding-genetics-head"><div><span class="eyebrow">Genetics</span><h2>Your active breeding species</h2><p>HerdHarbor only shows genetics for species you currently have active. Sold, deceased, archived, and ancestor-only animals do not create genetics tabs.</p></div></div><div class="hh-breeding-genetics-tabs" role="tablist" aria-label="Genetics species">${tabs}</div><div class="hh-breeding-genetics-panes">${panes}</div></section>`;
}

function renderBreedingPanel(view,state=read()){
  if(!view)return null;
  const previous=view.querySelector(`#${BREEDING_PANEL_ID}`);
  const selected=previous?.dataset?.hhSelectedSpecies||'';
  const html=breedingPanelHtml(state,selected);
  if(!html){previous?.remove();return null;}
  const nextGroups=breedingSpecies(state);
  const nextSignature=nextGroups.map(group=>`${group.species}:${group.animals.map(animal=>String(animal.id)).join(',')}`).join('|');
  if(previous?.dataset?.hhGeneticsSignature===nextSignature)return previous;
  previous?.remove();
  const holder=document.createElement('div');
  holder.innerHTML=html;
  const panel=holder.firstElementChild;
  const header=view.querySelector('.page-header');
  if(header?.nextSibling)view.insertBefore(panel,header.nextSibling);
  else if(header)view.appendChild(panel);
  else view.prepend(panel);
  return panel;
}

function selectBreedingSpecies(view,species){
  const panel=view?.querySelector(`#${BREEDING_PANEL_ID}`);
  if(!panel)return;
  panel.dataset.hhSelectedSpecies=species;
  panel.querySelectorAll('[data-hh-genetics-species]').forEach(tab=>{
    const active=tab.dataset.hhGeneticsSpecies===species;
    tab.classList.toggle('is-active',active);
    tab.setAttribute('aria-selected',active?'true':'false');
  });
  panel.querySelectorAll('[data-hh-genetics-pane]').forEach(pane=>pane.classList.toggle('is-active',pane.dataset.hhGeneticsPane===species));
}

function installBreedingIntegration(){
  const view=document.querySelector('#view-breeding');
  if(!view||view.dataset.hhGeneticsInstalled==='true')return;
  view.dataset.hhGeneticsInstalled='true';
  renderBreedingPanel(view);
  view.addEventListener('click',event=>{
    const tab=event.target.closest?.('[data-hh-genetics-species]');
    if(tab){selectBreedingSpecies(view,tab.dataset.hhGeneticsSpecies);return;}
    const animalButton=event.target.closest?.('[data-hh-genetics-animal]');
    if(animalButton)open(animalButton.dataset.hhGeneticsAnimal);
  });
  if(typeof MutationObserver==='function'){
    const observer=new MutationObserver(()=>renderBreedingPanel(view));
    observer.observe(view,{childList:true,subtree:false});
  }
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installBreedingIntegration,{once:true});
else installBreedingIntegration();

root.HerdHarborMultiSpeciesGeneticsUI=Object.freeze({
  version:'1.7.1',
  open,
  render:foundationHtml,
  activeAnimals:activeGeneticsAnimals,
  breedingSpecies,
  renderBreeding:breedingPanelHtml,
  installBreedingIntegration
});
})(window);
