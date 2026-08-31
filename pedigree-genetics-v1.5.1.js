(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.HerdHarborPedigreeGenetics=api;
  if(root&&root.document)api.start(root);
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION='1.5.1';
  const PREF_KEY='herdharbor_pedigree_genetics_v1';
  const STATE_KEY='herdharbor_pre_alpha_v1';
  const LOCI=['A','B','C','D','E','En','V'];
  const DEFAULTS=Object.freeze({mode:'full',printGenetics:true});
  const KNOWN_SOURCES=new Set(['dna','genetic-test','user','breeder','phenotype','offspring']);
  let pending=false,observer=null,lastStateSignature='';

  const clean=v=>String(v==null?'':v).trim();
  const norm=v=>clean(v).toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const knownCount=p=>(p||[]).filter(a=>a&&a!=='_').length;
  const pairText=p=>(Array.isArray(p)?p:['_','_']).map(a=>a||'_').join('');
  const knownSource=s=>KNOWN_SOURCES.has(norm(s).replace('genetic test','genetic-test'));

  function loadPreferences(storage){
    try{
      const saved=JSON.parse((storage||globalThis.localStorage)?.getItem(PREF_KEY)||'{}');
      return{mode:['off','known','full'].includes(saved.mode)?saved.mode:DEFAULTS.mode,printGenetics:saved.printGenetics!==false};
    }catch{return{...DEFAULTS};}
  }
  function savePreferences(storage,next){(storage||globalThis.localStorage)?.setItem(PREF_KEY,JSON.stringify(next));}
  function unwrapState(raw){
    if(!raw||typeof raw!=='object')return{animals:[],births:[]};
    const source=Array.isArray(raw.animals)?raw:Array.isArray(raw.data?.animals)?raw.data:Array.isArray(raw.state?.animals)?raw.state:raw;
    return{animals:Array.isArray(source.animals)?source.animals:[],births:Array.isArray(source.births)?source.births:Array.isArray(source.litters)?source.litters:[]};
  }
  function readState(storage){try{return unwrapState(JSON.parse((storage||globalThis.localStorage)?.getItem(STATE_KEY)||'null'));}catch{return{animals:[],births:[]};}}
  function isRabbit(animal){return /^rabbit\b/.test(norm(animal?.species||''));}
  function sourceKind(source,status){
    const s=norm(source),st=norm(status);
    if(['dna','genetic test','user','breeder','phenotype','offspring'].includes(s))return'proven';
    if(s==='pedigree'&&(st==='confirmed'||st==='strongly inferred'))return'inferred';
    if(s==='pedigree'||s==='possible')return'possible';
    return'unknown';
  }
  function sourceLabel(engine,source,status){
    const s=norm(source);
    if(s==='user'||s==='breeder')return'Entered Genetics';
    if(s==='phenotype')return'Proven by Phenotype';
    if(s==='offspring')return'Proven by Offspring';
    if(s==='pedigree')return norm(status)==='confirmed'?'Strongly Inferred from Pedigree':'Possible from Pedigree';
    if(s==='dna'||s==='genetic test')return'Confirmed by DNA';
    if(s==='possible')return'Possible';
    return engine?.evidenceLabel?.(source)||'Unknown';
  }
  function normalizePair(engine,locus,pair){
    const input=Array.isArray(pair)?pair:['_','_'];
    try{return engine.normalizeGenetics({loci:{[locus]:{alleles:input}}}).loci[locus].alleles;}catch{return[input[0]||'_',input[1]||'_'];}
  }
  function mergeDirect(engine,locus,inferred,entered){
    const direct=normalizePair(engine,locus,entered),calc=normalizePair(engine,locus,inferred);
    if(knownCount(direct)===2)return direct;
    if(knownCount(direct)===0)return calc;
    const knownAllele=direct.find(a=>a!=='_');
    if(calc.includes(knownAllele))return calc;
    return direct;
  }
  function commonPattern(engine,locus,options){
    if(!Array.isArray(options)||!options.length)return['_','_'];
    const normalized=options.map(p=>normalizePair(engine,locus,p));
    if(normalized.length===1)return normalized[0];
    const first=normalized[0][0],second=normalized[0][1],out=['_','_'];
    if(normalized.every(p=>p[0]===first))out[0]=first;
    if(normalized.every(p=>p[1]===second))out[1]=second;
    if(out[0]==='_'&&out[1]==='_'){
      const alleles=[...new Set(normalized.flat())];
      for(const a of alleles){if(a!=='_'&&normalized.every(p=>p.includes(a))){out[0]=a;break;}}
    }
    return normalizePair(engine,locus,out);
  }
  function profileForAnimal(animal,state,engine,mode='full'){
    if(!animal||!isRabbit(animal)||!engine?.normalizeGenetics||!engine?.refineAnimalGenetics)return null;
    if(mode==='off')return{animal,mode,rows:[],genotypeText:'',evidence:[],conflicts:[]};
    const animals=state?.animals||[],births=state?.births||[];
    const entered=engine.normalizeGenetics(clone(animal.genetics));
    const refinedResult=engine.refineAnimalGenetics({...animal,genetics:clone(animal.genetics)},animals,births);
    const refined=engine.normalizeGenetics(clone(refinedResult?.genetics));
    const pedigreeItems=engine.pedigreeEvidence?engine.pedigreeEvidence({...animal,genetics:refined},animals,3):[];
    let calculated=engine.normalizeGenetics(clone(refined));
    if(mode==='full'&&engine.applyEvidenceToGenetics)calculated=engine.applyEvidenceToGenetics(calculated,pedigreeItems);
    if(mode==='known'&&engine.applyEvidenceToGenetics){
      const provenItems=(refined.evidence||[]).filter(e=>knownSource(e.source));
      calculated=engine.applyEvidenceToGenetics(engine.normalizeGenetics(clone(entered)),provenItems);
    }

    const rows=LOCI.map(locus=>{
      const direct=entered.loci[locus]?.alleles||['_','_'];
      const calcRecord=calculated.loci[locus]||{alleles:['_','_'],source:'',status:'unknown',note:''};
      let pair=mergeDirect(engine,locus,calcRecord.alleles,direct);
      let source=knownCount(direct)>0?(entered.loci[locus]?.source||'breeder'):(calcRecord.source||'unknown');
      let status=knownCount(direct)>0?(entered.loci[locus]?.status||'confirmed'):(calcRecord.status||'unknown');
      let note=knownCount(direct)>0?(entered.loci[locus]?.note||'Entered directly by the breeder.'):(calcRecord.note||'');
      if(mode==='full'&&knownCount(pair)<2&&engine.possiblePairsForLocus){
        const options=engine.possiblePairsForLocus({...animal,genetics:calculated},animal.color||animal.variety,locus);
        const common=commonPattern(engine,locus,options);
        if(knownCount(common)>knownCount(pair)){
          if(knownCount(pair)===0)pair=common;
          else if(common.includes(pair.find(a=>a!=='_')))pair=common;
          if(norm(source)==='unknown'||!source){source='possible';status='possible';note=note||'Common allele retained across the genetics engine’s currently valid genotype options.';}
        }
      }
      pair=normalizePair(engine,locus,pair);
      const kind=pair.every(a=>a==='_')?'unknown':sourceKind(source,status);
      const evidence=(calculated.evidence||[]).filter(e=>e.locus===locus).map(e=>({source:e.source||'',status:e.status||'',note:e.note||'',label:e.label||sourceLabel(engine,e.source,e.status)}));
      if(mode==='full')pedigreeItems.filter(e=>e.locus===locus).forEach(e=>{if(!evidence.some(x=>x.note===e.note))evidence.push({source:e.source||'',status:e.status||'',note:e.note||'',label:sourceLabel(engine,e.source,e.status)});});
      return{locus,pair,text:pairText(pair),source,status,kind,label:sourceLabel(engine,source,status),note,evidence};
    });
    const conflicts=[...(refined.conflicts||[])];
    if(engine.directConflict)conflicts.push(...engine.directConflict({...animal,genetics:calculated}));
    const genotypeText=rows.map(r=>`${r.locus}:${r.text}`).join(' ');
    return{animal,mode,rows,genotypeText,evidence:rows.flatMap(r=>r.evidence.map(e=>({...e,locus:r.locus}))),conflicts,entered,calculated};
  }

  function cardText(el){return clean(el?.innerText||el?.textContent).replace(/\s+/g,' ').trim();}
  function looksLikeCard(el){const text=cardText(el);return /\bCOLOR\s*:/i.test(text)&&/\bBREEDER\s*:/i.test(text)&&/(?:♀|♂|\bDOE\b|\bBUCK\b|\bFEMALE\b|\bMALE\b)/i.test(text)&&((text.match(/\bCOLOR\s*:/gi)||[]).length===1);}
  function findCards(doc){const all=[...doc.querySelectorAll('article,section,div,td,li')].filter(looksLikeCard);return all.filter(c=>![...c.children].some(looksLikeCard));}
  function smallestContaining(card,label){const rx=new RegExp(`\\b${label}\\s*:`,`i`);return[card,...card.querySelectorAll('div,span,p,small,li,td,dd')].filter(el=>rx.test(cardText(el))).sort((a,b)=>cardText(a).length-cardText(b).length)[0]||null;}
  function nameFromCard(card){
    const excluded=/^(?:ANIMAL|SIRE|DAM|SIRE'S SIRE|SIRE'S DAM|DAM'S SIRE|DAM'S DAM|BUCK|DOE|MALE|FEMALE)$/i;
    const tagged=[...card.querySelectorAll('h1,h2,h3,h4,h5,h6,strong,b')].map(cardText).filter(t=>t&&t.length<=80&&!excluded.test(t)&&!/:/.test(t)&&!/[♀♂]/.test(t));
    if(tagged.length)return tagged[0];
    return clean(card.innerText).split(/\n+/).map(s=>s.trim()).find(t=>t&&t.length<=80&&!excluded.test(t)&&!/:/.test(t)&&!/(?:♀|♂|\bBUCK\b|\bDOE\b|\bMALE\b|\bFEMALE\b)/i.test(t))||'';
  }
  function colorFromCard(card){const m=cardText(card).match(/\bCOLOR\s*:\s*([^|•]+?)(?=\s+(?:BREEDER|ID|DOB|REG)\s*:|$)/i);return clean(m?.[1]);}
  function animalForCard(card,state){
    const rabbits=(state.animals||[]).filter(isRabbit),dataId=card.dataset?.animalId||card.getAttribute?.('data-animal-id')||'';
    if(dataId){const hit=rabbits.find(a=>String(a.id)===String(dataId));if(hit)return hit;}
    const name=norm(nameFromCard(card));if(!name)return null;
    const matches=rabbits.filter(a=>norm(a.name||a.animalName||a.registeredName)===name);
    if(matches.length===1)return matches[0];
    const color=norm(colorFromCard(card));if(color){const narrowed=matches.filter(a=>norm(a.color||a.variety)===color);if(narrowed.length===1)return narrowed[0];}
    return null;
  }
  function compactKnown(profile){return profile.rows.filter(r=>r.kind!=='unknown'&&knownCount(r.pair)>0).map(r=>`${r.locus}:${r.text}`).join(' • ');}
  function ensureStyles(doc){if(!doc?.head||doc.getElementById('hh-pedigree-genetics-style'))return;const link=doc.createElement('link');link.id='hh-pedigree-genetics-style';link.rel='stylesheet';link.href='pedigree-genetics-v1.5.1.css?v=1.5.1';doc.head.appendChild(link);}
  function renderBlock(doc,card,profile,printContext){
    card.querySelectorAll('.hh-pedigree-genetics').forEach(el=>el.remove());
    if(!profile||!profile.rows.length)return;
    const block=doc.createElement('div');block.className='hh-pedigree-genetics';block.dataset.hhGeneticsMode=profile.mode;
    if(!printContext){block.tabIndex=0;block.setAttribute('role','button');block.setAttribute('aria-label',`View genetic evidence for ${profile.animal.name||'this rabbit'}`);}
    const line=doc.createElement('div');line.className='hh-genotype-line';line.setAttribute('aria-label',`Genotype ${profile.genotypeText}`);
    profile.rows.forEach(row=>{const span=doc.createElement('span');span.className=`hh-genetics-locus hh-genetics-${row.kind}`;span.dataset.locus=row.locus;span.textContent=`${row.locus}:${row.text}`;span.title=`${row.label}${row.note?` — ${row.note}`:''}`;line.appendChild(span);});
    block.appendChild(line);
    const known=compactKnown(profile);if(known){const ev=doc.createElement('div');ev.className='hh-genetics-evidence-summary';ev.textContent=`Known Genetics: ${known}`;block.appendChild(ev);}
    const anchor=smallestContaining(card,'COLOR')||card.querySelector('.node-title')||card.firstElementChild;
    if(anchor&&anchor.parentNode===card)anchor.insertAdjacentElement('afterend',block);else card.appendChild(block);
    if(!printContext){const open=()=>openEvidencePanel(doc,profile);block.addEventListener('click',open);block.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});}
  }
  function escapeHtml(v){return clean(v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  function openEvidencePanel(doc,profile){
    let panel=doc.getElementById('hh-pedigree-genetics-dialog');if(!panel){panel=doc.createElement('dialog');panel.id='hh-pedigree-genetics-dialog';panel.className='hh-genetics-dialog';(doc.body || doc.documentElement)?.appendChild(panel);}
    const rows=profile.rows.map(r=>`<tr><th>${escapeHtml(r.locus)}</th><td><code>${escapeHtml(r.text)}</code></td><td><span class="hh-genetics-badge hh-genetics-${escapeHtml(r.kind)}">${escapeHtml(r.label)}</span></td><td>${escapeHtml(r.note||'No additional note recorded.')}</td></tr>`).join('');
    const evidence=profile.evidence.length?`<ul>${profile.evidence.map(e=>`<li><strong>${escapeHtml(e.locus)}:</strong> ${escapeHtml(e.note||e.label||'Recorded genetics evidence')}</li>`).join('')}</ul>`:'<p>No additional pedigree or offspring evidence is currently recorded.</p>';
    const conflicts=profile.conflicts.length?`<div class="hh-genetics-conflicts"><h4>Genetic conflicts</h4><ul>${profile.conflicts.map(c=>`<li>${escapeHtml(c.message||c.note||`${c.locus||''} genetics conflict`)}</li>`).join('')}</ul></div>`:'';
    panel.innerHTML=`<form method="dialog" class="hh-genetics-dialog-card"><div class="hh-genetics-dialog-head"><div><p class="eyebrow">Rabbit genetics</p><h3>${escapeHtml(profile.animal.name||'Rabbit')}</h3><code>${escapeHtml(profile.genotypeText)}</code></div><button type="submit" aria-label="Close genetic evidence">×</button></div><div class="hh-genetics-table-wrap"><table><thead><tr><th>Locus</th><th>Genotype</th><th>Evidence</th><th>Why</th></tr></thead><tbody>${rows}</tbody></table></div><h4>Evidence used</h4>${evidence}${conflicts}<p class="hh-genetics-dialog-note">Entered Genetics remains separate from Inferred Genetics. This display is recalculated from the current HerdHarbor genetics engine and does not overwrite breeder-entered genotype data.</p></form>`;
    if(typeof panel.showModal==='function')panel.showModal();else panel.setAttribute('open','');
  }
  function enhanceDocument(doc,printContext=false,rootWindow=globalThis){
    if(!doc?.querySelectorAll)return;ensureStyles(doc);
    const prefs=loadPreferences(rootWindow.localStorage),state=readState(rootWindow.localStorage),engine=rootWindow.HerdHarborBreedingIntelligenceCore,cards=findCards(doc);
    for(const card of cards){card.querySelectorAll('.hh-pedigree-genetics').forEach(el=>el.remove());const animal=animalForCard(card,state);if(!animal)continue;if(prefs.mode==='off'||(printContext&&!prefs.printGenetics))continue;renderBlock(doc,card,profileForAnimal(animal,state,engine,prefs.mode),printContext);}
  }
  function ensureSettingsUI(rootWindow){
    const doc=rootWindow.document,settings=doc.querySelector('#view-settings');if(!settings)return;
    const state=readState(rootWindow.localStorage),existing=doc.getElementById('hh-pedigree-genetics-settings');
    if(!(state.animals||[]).some(isRabbit)){existing?.remove();return;}if(existing)return;
    const host=doc.querySelector('#hh-pedigree-settings')||settings.querySelector('.settings-grid')||settings,prefs=loadPreferences(rootWindow.localStorage),wrap=doc.createElement('div');
    wrap.id='hh-pedigree-genetics-settings';wrap.className='hh-pedigree-genetics-settings';wrap.innerHTML=`<div class="hh-setting-row"><label for="hh-pedigree-genetics-mode">Show Genetics on Pedigree</label><select id="hh-pedigree-genetics-mode"><option value="off" ${prefs.mode==='off'?'selected':''}>Off</option><option value="known" ${prefs.mode==='known'?'selected':''}>Known Only</option><option value="full" ${prefs.mode==='full'?'selected':''}>Full Inferred</option></select><p class="hh-setting-help">Rabbit pedigrees use the same genetics engine and evidence model as Pair Analysis. Full Inferred shows unresolved alleles with underscores.</p></div><div class="hh-setting-row"><label class="hh-setting-check"><input type="checkbox" id="hh-pedigree-print-genetics" ${prefs.printGenetics?'checked':''}><span>Include Genetics on Printed Pedigree</span></label><p class="hh-setting-help">On by default for rabbits and respects the genetics display mode above.</p></div>`;
    host.appendChild(wrap);
    const save=()=>{savePreferences(rootWindow.localStorage,{mode:wrap.querySelector('#hh-pedigree-genetics-mode').value,printGenetics:wrap.querySelector('#hh-pedigree-print-genetics').checked});schedule(rootWindow);};
    wrap.querySelectorAll('input,select').forEach(c=>c.addEventListener('change',save));
  }
  function watchFrames(rootWindow){rootWindow.document.querySelectorAll('iframe').forEach(frame=>{if(frame.dataset.hhPedigreeGeneticsWatch==='1')return;const id=frame.id||'',title=frame.title||'';if(!/pedigree/i.test(id)&&!/pedigree/i.test(title))return;frame.dataset.hhPedigreeGeneticsWatch='1';const apply=()=>{try{enhanceDocument(frame.contentDocument,true,rootWindow);}catch{}};frame.addEventListener('load',apply);apply();});}
  function patchPrintWindows(rootWindow){if(rootWindow.__hhPedigreeGeneticsPrintPatched)return;rootWindow.__hhPedigreeGeneticsPrintPatched=true;const nativeOpen=rootWindow.open.bind(rootWindow);rootWindow.open=function(...args){const child=nativeOpen(...args);if(!child)return child;try{const priorPrint=child.print.bind(child);child.print=function(){try{enhanceDocument(child.document,true,rootWindow);}catch{}rootWindow.setTimeout(()=>priorPrint(),30);};}catch{}return child;};}
  function run(rootWindow){pending=false;ensureSettingsUI(rootWindow);enhanceDocument(rootWindow.document,false,rootWindow);watchFrames(rootWindow);}
  function schedule(rootWindow){if(pending)return;pending=true;rootWindow.requestAnimationFrame(()=>run(rootWindow));}
  function start(rootWindow){
    if(!rootWindow?.document?.body){
      if(!rootWindow.__hhPedigreeGeneticsDomWait){
        rootWindow.__hhPedigreeGeneticsDomWait=true;
        rootWindow.document?.addEventListener?.('DOMContentLoaded',()=>{rootWindow.__hhPedigreeGeneticsDomWait=false;start(rootWindow);},{once:true});
      }
      return;
    }
    ensureStyles(rootWindow.document);patchPrintWindows(rootWindow);run(rootWindow);
    if(!observer){
      observer=new rootWindow.MutationObserver(()=>schedule(rootWindow));
      observer.observe(rootWindow.document.body,{childList:true,subtree:true});
    }
    rootWindow.addEventListener('storage',e=>{if(e.key===STATE_KEY||e.key===PREF_KEY)schedule(rootWindow);});
    rootWindow.addEventListener('herdharbor:genetics-ready',()=>schedule(rootWindow));
    lastStateSignature=rootWindow.localStorage?.getItem(STATE_KEY)||'';
    rootWindow.setInterval(()=>{if(!findCards(rootWindow.document).length)return;const sig=rootWindow.localStorage?.getItem(STATE_KEY)||'';if(sig!==lastStateSignature){lastStateSignature=sig;schedule(rootWindow);}},2000);
  }
  return Object.freeze({VERSION,LOCI,DEFAULTS,loadPreferences,readState,profileForAnimal,sourceKind,sourceLabel,pairText,enhanceDocument,start});
});