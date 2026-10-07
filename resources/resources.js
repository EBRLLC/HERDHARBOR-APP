(() => {
  'use strict';
  const animals = [
    ['all','All'],['rabbit','Rabbits'],['cattle','Cattle'],['goat','Goats'],['sheep','Sheep'],['poultry','Poultry'],['swine','Swine']
  ];
  const topics = [
    ['all','All Topics'],['breeding','Breeding'],['genetics','Genetics'],['pedigrees-records','Pedigrees & Records'],
    ['reproduction','Reproduction'],['newborn-young','Newborn & Young'],['health-biosecurity','Health & Biosecurity'],['selection-performance','Selection & Performance']
  ];
  const speciesLabels = Object.fromEntries(animals);
  const topicLabels = Object.fromEntries(topics);
  const levelRank = {'Beginner':1,'Intermediate':2,'Advanced':3};
  const els = {
    tabs: document.getElementById('animal-tabs'), topics: document.getElementById('topic-filters'),
    search: document.getElementById('article-search'), sort: document.getElementById('article-sort'),
    grid: document.getElementById('article-grid'), count: document.getElementById('result-count'),
    empty: document.getElementById('empty-state'), clear: document.getElementById('clear-filters')
  };
  let items = [];
  let state = {animal:'all',topic:'all',q:'',sort:'newest'};

  function valid(value, rows, fallback) { return rows.some(([key]) => key === value) ? value : fallback; }
  function readState() {
    const p = new URLSearchParams(location.search);
    state = {
      animal: valid(p.get('animal') || 'all', animals, 'all'),
      topic: valid(p.get('topic') || 'all', topics, 'all'),
      q: (p.get('q') || '').trim(),
      sort: ['newest','az','beginner'].includes(p.get('sort')) ? p.get('sort') : 'newest'
    };
    els.search.value = state.q; els.sort.value = state.sort;
  }
  function writeState() {
    const p = new URLSearchParams();
    if (state.animal !== 'all') p.set('animal', state.animal);
    if (state.topic !== 'all') p.set('topic', state.topic);
    if (state.q) p.set('q', state.q);
    if (state.sort !== 'newest') p.set('sort', state.sort);
    const next = location.pathname + (p.toString() ? '?' + p.toString() : '');
    history.replaceState(null, '', next);
  }
  function buildFilters() {
    els.tabs.replaceChildren(...animals.map(([key,label]) => {
      const b=document.createElement('button'); b.type='button'; b.className='filter-tab'; b.dataset.value=key;
      b.textContent=label; b.setAttribute('role','tab'); b.addEventListener('click',()=>{state.animal=key;writeState();render();}); return b;
    }));
    els.topics.replaceChildren(...topics.map(([key,label]) => {
      const b=document.createElement('button'); b.type='button'; b.className='filter-chip'; b.dataset.value=key;
      b.textContent=label; b.addEventListener('click',()=>{state.topic=key;writeState();render();}); return b;
    }));
  }
  function matches(a) {
    if (state.animal !== 'all' && !(a.species || []).includes(state.animal)) return false;
    if (state.topic !== 'all' && !(a.topics || []).includes(state.topic)) return false;
    if (state.q) {
      const haystack=[a.title,a.summary,(a.species||[]).map(x=>speciesLabels[x]||x).join(' '),(a.topics||[]).map(x=>topicLabels[x]||x).join(' ')].join(' ').toLowerCase();
      if (!haystack.includes(state.q.toLowerCase())) return false;
    }
    return true;
  }
  function sorted(rows) {
    return [...rows].sort((a,b) => {
      if (state.sort === 'az') return a.title.localeCompare(b.title);
      if (state.sort === 'beginner') {
        const d=(levelRank[a.level]||9)-(levelRank[b.level]||9); return d || a.title.localeCompare(b.title);
      }
      return String(b.published).localeCompare(String(a.published)) || a.title.localeCompare(b.title);
    });
  }
  function badge(text, className='tag') { const s=document.createElement('span'); s.className=className; s.textContent=text; return s; }
  function card(a) {
    const link=document.createElement('a'); link.className='card'; link.href=a.url;
    const badges=document.createElement('div'); badges.className='card-badges';
    const species=(a.species||[]); badges.appendChild(badge(species.length >= 6 ? 'Multi-species' : species.map(s=>speciesLabels[s]||s).join(' · ')));
    if ((a.topics||[]).length) badges.appendChild(badge(topicLabels[a.topics[0]]||a.topics[0], 'tag tag-secondary'));
    const h=document.createElement('h2'); h.textContent=a.title;
    const p=document.createElement('p'); p.textContent=a.summary;
    const meta=document.createElement('div'); meta.className='card-meta'; meta.textContent=`${a.level || 'General'} · ${a.readTime || 5} min read`;
    link.append(badges,h,p,meta); return link;
  }
  function render() {
    els.tabs.querySelectorAll('.filter-tab').forEach(b=>{const on=b.dataset.value===state.animal;b.classList.toggle('active',on);b.setAttribute('aria-selected',on?'true':'false');});
    els.topics.querySelectorAll('.filter-chip').forEach(b=>{const on=b.dataset.value===state.topic;b.classList.toggle('active',on);b.setAttribute('aria-pressed',on?'true':'false');});
    const rows=sorted(items.filter(matches));
    els.grid.replaceChildren(...rows.map(card));
    els.count.textContent=`${rows.length} article${rows.length===1?'':'s'}`;
    els.empty.hidden=rows.length!==0; els.grid.hidden=rows.length===0;
  }
  let debounce;
  els.search.addEventListener('input',()=>{clearTimeout(debounce);debounce=setTimeout(()=>{state.q=els.search.value.trim();writeState();render();},120);});
  els.sort.addEventListener('change',()=>{state.sort=els.sort.value;writeState();render();});
  els.clear.addEventListener('click',()=>{state={animal:'all',topic:'all',q:'',sort:'newest'};els.search.value='';els.sort.value='newest';writeState();render();});
  addEventListener('popstate',()=>{readState();render();});
  buildFilters(); readState();
  fetch('/resources/articles.json',{cache:'no-store'}).then(r=>{if(!r.ok) throw new Error('Article index unavailable');return r.json();}).then(data=>{items=Array.isArray(data)?data:[];render();}).catch(()=>{els.count.textContent='Education library could not be loaded.';els.empty.hidden=false;els.grid.hidden=true;});
})();
