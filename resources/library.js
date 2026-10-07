(() => {
  'use strict';
  const speciesLabels={rabbit:'Rabbits',cattle:'Cattle',goat:'Goats',sheep:'Sheep',poultry:'Poultry',swine:'Swine'};
  const topicSlugs={
    'Breeding & Reproduction':'breeding-reproduction',
    'Genetics':'genetics',
    'Pedigrees & Records':'pedigrees-records',
    'Health & Biosecurity':'health-biosecurity',
    'Newborn & Young Stock':'newborn-young-stock',
    'Selection & Herd Improvement':'selection-herd-improvement'
  };
  const allowedAnimals=new Set(['all',...Object.keys(speciesLabels)]);
  const allowedTopics=new Set(['all',...Object.values(topicSlugs)]);
  const allowedSorts=new Set(['newest','az','beginner']);
  const levelOrder={Beginner:0,Intermediate:1,Advanced:2};
  const state={animal:'all',topic:'all',q:'',sort:'newest'};
  let articles=[];
  const grid=document.getElementById('article-grid');
  const count=document.getElementById('result-count');
  const empty=document.getElementById('empty-state');
  const search=document.getElementById('article-search');
  const sort=document.getElementById('article-sort');
  const esc=(value)=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const normalize=(v)=>String(v||'').trim().toLowerCase();

  function readUrl(){
    const p=new URLSearchParams(location.search);
    const animal=normalize(p.get('animal'))||'all';
    const topic=normalize(p.get('topic'))||'all';
    const s=normalize(p.get('sort'))||'newest';
    state.animal=allowedAnimals.has(animal)?animal:'all';
    state.topic=allowedTopics.has(topic)?topic:'all';
    state.sort=allowedSorts.has(s)?s:'newest';
    state.q=(p.get('q')||'').trim();
  }
  function writeUrl(mode='push'){
    const p=new URLSearchParams();
    if(state.animal!=='all')p.set('animal',state.animal);
    if(state.topic!=='all')p.set('topic',state.topic);
    if(state.q)p.set('q',state.q);
    if(state.sort!=='newest')p.set('sort',state.sort);
    const url=location.pathname+(p.toString()?`?${p}`:'');
    history[mode==='replace'?'replaceState':'pushState']({...state},'',url);
  }
  function syncControls(){
    document.querySelectorAll('[data-animal]').forEach(btn=>{const on=btn.dataset.animal===state.animal;btn.classList.toggle('active',on);btn.setAttribute('aria-selected',String(on));});
    document.querySelectorAll('[data-topic]').forEach(btn=>{const on=btn.dataset.topic===state.topic;btn.classList.toggle('active',on);btn.setAttribute('aria-pressed',String(on));});
    search.value=state.q; sort.value=state.sort;
  }
  function searchable(a){return [a.title,a.summary,(a.species||[]).map(s=>speciesLabels[s]||s).join(' '),(a.topics||[]).join(' '),a.level].join(' ').toLowerCase();}
  function filtered(){
    const q=state.q.toLowerCase();
    const rows=articles.filter(a=>state.animal==='all'||(a.species||[]).includes(state.animal)).filter(a=>state.topic==='all'||(a.topics||[]).some(t=>topicSlugs[t]===state.topic)).filter(a=>!q||searchable(a).includes(q));
    rows.sort((a,b)=>{
      if(state.sort==='az')return a.title.localeCompare(b.title);
      if(state.sort==='beginner')return (levelOrder[a.level]??9)-(levelOrder[b.level]??9)||a.title.localeCompare(b.title);
      return String(b.published).localeCompare(String(a.published))||a.title.localeCompare(b.title);
    });
    return rows;
  }
  function animalBadge(a){return (a.species||[]).length>=6?'Multi-species':(a.species||[]).map(s=>speciesLabels[s]||s).join(' · ');}
  function card(a){
    const topic=(a.topics||[])[0]||'Education';
    return `<a class="card" href="${esc(a.url)}"><div class="card-badges"><span class="tag">${esc(animalBadge(a))}</span><span class="tag tag-topic">${esc(topic)}</span></div><h2>${esc(a.title)}</h2><p>${esc(a.summary)}</p><div class="card-meta"><span>${esc(a.level||'')}</span><span>${esc(a.readTime||'')} min read</span></div><span class="read-link">Read article →</span></a>`;
  }
  function render(){
    const rows=filtered();
    count.textContent=`${rows.length} article${rows.length===1?'':'s'}`;
    grid.innerHTML=rows.map(card).join('');
    grid.hidden=!rows.length; empty.hidden=Boolean(rows.length); grid.setAttribute('aria-busy','false');
  }
  function apply(mode='push'){writeUrl(mode);syncControls();render();}
  document.querySelectorAll('[data-animal]').forEach(btn=>btn.addEventListener('click',()=>{state.animal=btn.dataset.animal;apply('push');}));
  document.querySelectorAll('[data-topic]').forEach(btn=>btn.addEventListener('click',()=>{state.topic=btn.dataset.topic;apply('push');}));
  let searchTimer;
  search.addEventListener('input',()=>{state.q=search.value.trim();clearTimeout(searchTimer);searchTimer=setTimeout(()=>apply('replace'),180);});
  sort.addEventListener('change',()=>{state.sort=sort.value;apply('push');});
  document.getElementById('clear-filters').addEventListener('click',()=>{Object.assign(state,{animal:'all',topic:'all',q:'',sort:'newest'});apply('push');});
  addEventListener('popstate',()=>{readUrl();syncControls();render();});
  readUrl();syncControls();
  fetch('/resources/articles.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(`Article registry ${r.status}`);return r.json();}).then(data=>{articles=Array.isArray(data)?data:[];render();}).catch(()=>{count.textContent='Education library could not load.';grid.setAttribute('aria-busy','false');grid.innerHTML='<a class="card" href="/resources/line-breeding-rabbits.html"><span class="tag">Rabbits</span><h2>Line Breeding Rabbits: A Practical Genetics Guide</h2><p>Open the existing line-breeding guide.</p></a>';});
})();