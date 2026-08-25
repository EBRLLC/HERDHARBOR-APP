(() => {
  "use strict";
  const Core = window.HerdHarborBreedingIntelligenceCore;
  if (!Core) { console.error("HerdHarbor Breeding Intelligence could not start: core module missing."); return; }
  const STORAGE_KEY = "herdharbor_pre_alpha_v1", RELEASE_VERSION = "1.4.0", ROOT_KEY = "breedingIntelligence";
  let lastAnalysis = null, lastPair = null, modal = null, observer = null;

  function readState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY), parsed = raw ? JSON.parse(raw) : {};
      if (!Array.isArray(parsed.animals)) parsed.animals = [];
      if (!Array.isArray(parsed.breedings)) parsed.breedings = [];
      if (!Array.isArray(parsed.births)) parsed.births = [];
      if (!parsed[ROOT_KEY] || typeof parsed[ROOT_KEY] !== "object") parsed[ROOT_KEY] = { version: 1, predictions: [], conflicts: [], updatedAt: null };
      if (!Array.isArray(parsed[ROOT_KEY].predictions)) parsed[ROOT_KEY].predictions = [];
      return parsed;
    } catch (error) {
      console.error("Breeding Intelligence could not read farm state:", error);
      return { animals: [], breedings: [], births: [], [ROOT_KEY]: { version: 1, predictions: [], conflicts: [] } };
    }
  }

  function preserveIntelligenceFields(current, outgoing) {
    if (!current || !outgoing || typeof outgoing !== "object") return outgoing;
    const currentAnimals = new Map((current.animals || []).map((a) => [String(a.id), a]));
    if (Array.isArray(outgoing.animals)) outgoing.animals.forEach((animal) => { const prior = currentAnimals.get(String(animal.id)); if (prior?.genetics && !animal.genetics) animal.genetics = prior.genetics; });
    const currentBreedings = new Map((current.breedings || []).map((b) => [String(b.id), b]));
    if (Array.isArray(outgoing.breedings)) outgoing.breedings.forEach((breeding) => { const prior = currentBreedings.get(String(breeding.id)); if (prior?.geneticsPredictionSnapshot && !breeding.geneticsPredictionSnapshot) breeding.geneticsPredictionSnapshot = prior.geneticsPredictionSnapshot; });
    if (current[ROOT_KEY] && !outgoing[ROOT_KEY]) outgoing[ROOT_KEY] = current[ROOT_KEY];
    return outgoing;
  }

  function installStorageProtection() {
    if (window.__hhBreedingIntelligenceStorageBridge) return;
    const previousSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (String(key) !== STORAGE_KEY || typeof value !== "string") return previousSetItem.call(this, key, value);
      try {
        const currentRaw = this.getItem(key), current = currentRaw ? JSON.parse(currentRaw) : null, outgoing = JSON.parse(value);
        preserveIntelligenceFields(current, outgoing);
        return previousSetItem.call(this, key, JSON.stringify(outgoing));
      } catch (_) { return previousSetItem.call(this, key, value); }
    };
    window.__hhBreedingIntelligenceStorageBridge = true;
  }

  async function writeState(state) {
    state[ROOT_KEY] = Object.assign({ version: 1, predictions: [], conflicts: [] }, state[ROOT_KEY], { updatedAt: new Date().toISOString() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    try { if (window.HerdHarborCloud?.syncNow) await window.HerdHarborCloud.syncNow(); }
    catch (error) { console.warn("Breeding Intelligence saved locally; cloud sync can retry normally.", error); }
  }

  const esc = (value) => String(value == null ? "" : value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  const rabbitAnimals = (state) => (state.animals || []).filter((animal) => Core.canonicalSpecies(animal.species) === "Rabbit");
  const sexIs = (animal, wanted) => wanted === "male" ? /male|buck/i.test(String(animal?.sex || "")) : /female|doe/i.test(String(animal?.sex || ""));
  function animalLabel(animal) { const identity = animal.name || animal.tag || animal.earTagNumber || animal.id || "Unnamed rabbit", color = animal.color || animal.variety; return color ? `${identity} — ${color}` : identity; }
  function selectOptions(animals, selectedId) { return ['<option value="">Select a rabbit…</option>'].concat(animals.map((animal) => `<option value="${esc(animal.id)}" ${String(animal.id) === String(selectedId || "") ? "selected" : ""}>${esc(animalLabel(animal))}</option>`)).join(""); }
  function performanceSummary(state, animal) { const p = Core.performanceForAnimal(animal, state.breedings, state.births), survival = p.survivalRate == null ? "—" : `${Math.round(p.survivalRate * 100)}%`, avg = p.averageLitterSize == null ? "—" : p.averageLitterSize.toFixed(1); return `${p.breedings} breedings · ${p.births} litters · ${p.bornAlive} live born · ${p.weaned} weaned · ${survival} survival · ${avg} avg litter`; }

  function ensureStylesheet() { if (document.getElementById("hh-breeding-intelligence-style")) return; const link = document.createElement("link"); link.id = "hh-breeding-intelligence-style"; link.rel = "stylesheet"; link.href = "breeding-intelligence.css?v=1.4.0"; document.head.appendChild(link); }
  function updateVisibleVersion() { document.querySelectorAll("[data-app-version], .app-version, .version-label").forEach((el) => { const text = String(el.textContent || ""); if (/1\.3\.0|alpha/i.test(text)) el.textContent = text.replace(/1\.3\.0/g, RELEASE_VERSION); }); document.documentElement.dataset.herdharborRelease = RELEASE_VERSION; }

  function renderCard() {
    const host = document.querySelector("#view-breeding"); if (!host) return;
    let card = host.querySelector("#hh-breeding-intelligence"); if (!card) { card = document.createElement("section"); card.id = "hh-breeding-intelligence"; card.className = "hh-bi-card"; host.prepend(card); }
    const state = readState(), rabbits = rabbitAnimals(state), bucks = rabbits.filter((a) => sexIs(a,"male")), does = rabbits.filter((a) => sexIs(a,"female")), profiles = rabbits.filter((a) => a.genetics).length, predictions = state[ROOT_KEY]?.predictions?.length || 0;
    card.innerHTML = `<div class="hh-bi-heading"><div><span class="hh-bi-kicker">Alpha v${RELEASE_VERSION}</span><h2>Breeding Intelligence</h2><p>Plan rabbit pairings with pedigree evidence, recorded genetics, previous offspring and honest uncertainty handling.</p></div><span class="hh-bi-badge">Rabbit genetics v1</span></div><div class="hh-bi-metrics"><div><strong>${rabbits.length}</strong><span>Rabbits</span></div><div><strong>${profiles}</strong><span>Genetic profiles</span></div><div><strong>${predictions}</strong><span>Saved analyses</span></div></div><div class="hh-bi-actions"><button type="button" class="primary" data-bi-action="pair">Analyze pairing</button><button type="button" data-bi-action="profile">Rabbit genetic profile</button><button type="button" data-bi-action="learn">Learn from recorded offspring</button><button type="button" data-bi-action="history">Prediction history</button></div>${(!bucks.length || !does.length) ? '<p class="hh-bi-note">Add at least one male and one female rabbit to run Pair Analysis.</p>' : ''}<p class="hh-bi-footnote">Predictions use the supported A/B/C/D/E model. Additional modifier genes, breed-specific expression and incomplete records can change visible color.</p>`;
  }

  function openModal(title, bodyHtml) { closeModal(); modal = document.createElement("div"); modal.className = "hh-bi-modal-backdrop"; modal.innerHTML = `<section class="hh-bi-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><div><span class="hh-bi-kicker">HerdHarbor Breeding Intelligence</span><h2>${esc(title)}</h2></div><button type="button" class="hh-bi-close" data-bi-close aria-label="Close">×</button></header><div class="hh-bi-modal-body">${bodyHtml}</div></section>`; document.body.appendChild(modal); modal.querySelector("[data-bi-close]").focus(); }
  function closeModal() { if (modal) modal.remove(); modal = null; lastAnalysis = null; lastPair = null; }

  function renderProfileModal(selectedId) {
    const state = readState(), rabbits = rabbitAnimals(state), animal = rabbits.find((a) => String(a.id) === String(selectedId)) || rabbits[0];
    if (!animal) { openModal("Rabbit Genetic Profile", '<p>No rabbit records are available yet.</p>'); return; }
    const genetics = Core.normalizeGenetics(animal.genetics);
    const locusRows = Object.entries(Core.RABBIT_LOCI).map(([locus, config]) => {
      const record = genetics.loci[locus], alleles = config.dominance.concat(["_"]), alleleOptions = (selected) => alleles.map((a) => `<option value="${esc(a)}" ${a === selected ? "selected" : ""}>${esc(a === "_" ? "Unknown" : a)}</option>`).join("");
      return `<div class="hh-bi-locus" data-locus="${locus}"><div><strong>${locus} locus</strong><span>${esc(config.name)}</span></div><div class="hh-bi-alleles"><select data-allele="0">${alleleOptions(record.alleles[0])}</select><select data-allele="1">${alleleOptions(record.alleles[1])}</select></div><select data-status>${["confirmed","inferred","possible","unknown"].map((status) => `<option value="${status}" ${record.status === status ? "selected" : ""}>${status[0].toUpperCase()+status.slice(1)}</option>`).join("")}</select><input type="text" data-note value="${esc(record.note || "")}" placeholder="Evidence or note (recommended for confirmed/inferred)"></div>`;
    }).join("");
    const pedigree = Core.pedigreeEvidence(animal, state.animals, 3);
    openModal("Rabbit Genetic Profile", `<div class="hh-bi-form-row"><label>Rabbit<select id="bi-profile-animal">${selectOptions(rabbits,animal.id)}</select></label></div><div class="hh-bi-profile-summary"><strong>${esc(animalLabel(animal))}</strong><span>Color-derived starting pattern: ${esc(Core.patternLabelForColor(animal.color || animal.variety))}</span><span>${esc(performanceSummary(state,animal))}</span></div><p class="hh-bi-note">Unknown alleles stay unknown. A recorded color can constrain what is possible, but HerdHarbor will not invent a hidden carrier allele.</p><div class="hh-bi-loci">${locusRows}</div><div class="hh-bi-evidence-panel"><h3>Pedigree evidence</h3>${pedigree.length ? `<ul>${pedigree.map((e) => `<li><strong>${esc(e.status)}</strong> — ${esc(e.note)}</li>`).join("")}</ul>` : '<p>No pedigree evidence currently establishes a core recessive allele.</p>'}</div>${genetics.conflicts.length ? `<div class="hh-bi-warning"><strong>${genetics.conflicts.length} genetics conflict(s) need review.</strong> Confirmed data is never silently overwritten by lower-confidence evidence.</div>` : ""}<div class="hh-bi-modal-actions"><button type="button" class="primary" id="bi-save-profile">Save genetic profile</button></div>`);
    modal.querySelector("#bi-profile-animal").addEventListener("change", (e) => renderProfileModal(e.target.value));
    modal.querySelector("#bi-save-profile").addEventListener("click", async () => { const fresh = readState(), target = fresh.animals.find((a) => String(a.id) === String(animal.id)); if (!target) return; const next = Core.normalizeGenetics(target.genetics); modal.querySelectorAll(".hh-bi-locus").forEach((row) => { const locus = row.dataset.locus; next.loci[locus].alleles=[row.querySelector('[data-allele="0"]').value,row.querySelector('[data-allele="1"]').value]; next.loci[locus].status=row.querySelector("[data-status]").value; next.loci[locus].note=row.querySelector("[data-note]").value.trim(); next.loci[locus].source = next.loci[locus].status === "confirmed" ? "breeder" : (next.loci[locus].source || "breeder"); }); next.updatedAt=new Date().toISOString(); target.genetics=next; await writeState(fresh); renderProfileModal(animal.id); renderCard(); });
  }

  function resultRows(analysis) { if (analysis.exact) return analysis.exactOutcomes.map((o) => `<div class="hh-bi-result-row"><div><strong>${esc(o.name)}</strong><span>${esc(o.family)} · ${esc(o.scope)}</span></div><b>${(o.probability*100).toFixed((o.probability*100)%1?1:0)}%</b></div>`).join(""); return analysis.possibleOutcomes.map((o) => `<div class="hh-bi-result-row"><div><strong>${esc(o.name)}</strong><span>${esc(o.family)} · ${esc(o.scope)}</span></div><b>Possible</b></div>`).join(""); }
  function renderPairModal(buckId, doeId) {
    const state=readState(), rabbits=rabbitAnimals(state), bucks=rabbits.filter((a)=>sexIs(a,"male")), does=rabbits.filter((a)=>sexIs(a,"female")), buck=bucks.find((a)=>String(a.id)===String(buckId))||bucks[0], doe=does.find((a)=>String(a.id)===String(doeId))||does[0];
    let analysisHtml='<div class="hh-bi-empty">Choose a buck and doe, then run Pair Analysis.</div>';
    if (buck && doe && buckId && doeId) {
      lastAnalysis=Core.analyzePairing(buck,doe,state); lastPair={buckId:buck.id,doeId:doe.id};
      const shared=lastAnalysis.sharedAncestors.length?`<ul>${lastAnalysis.sharedAncestors.map((a)=>`<li>${esc(a.name)} — generation ${a.parent1Depth} from ${esc(buck.name||"buck")} / generation ${a.parent2Depth} from ${esc(doe.name||"doe")}</li>`).join("")}</ul>`:"<p>No shared ancestors found within three recorded generations.</p>", previous=lastAnalysis.previousOffspring.length?lastAnalysis.previousOffspring.map((r)=>`${esc(r.color)} × ${r.count}`).join(" · "):"No recorded offspring colors for this pairing yet.";
      analysisHtml=`<div class="hh-bi-analysis-header"><div><span class="hh-bi-kicker">Possible offspring colors</span><h3>${lastAnalysis.exact?"Exact core-locus probabilities":"Possible outcomes with current evidence"}</h3></div><span class="hh-bi-confidence ${lastAnalysis.exact?"exact":"conditional"}">${lastAnalysis.exact?"Complete A/B/C/D/E":`${lastAnalysis.incompleteLoci.length} unknown locus entries`}</span></div><div class="hh-bi-results">${resultRows(lastAnalysis)||'<p>No supported core-color outcome could be resolved from the current records.</p>'}</div><div class="hh-bi-explain"><h3>Why these results?</h3><p>${esc(lastAnalysis.explanation)}</p><p>${esc(lastAnalysis.disclaimer)}</p></div><div class="hh-bi-two-col"><div><h3>Pedigree comparison</h3>${shared}</div><div><h3>Previous offspring</h3><p>${previous}</p></div></div><div class="hh-bi-two-col"><div><h3>${esc(buck.name||"Buck")} performance</h3><p>${esc(performanceSummary(state,buck))}</p></div><div><h3>${esc(doe.name||"Doe")} performance</h3><p>${esc(performanceSummary(state,doe))}</p></div></div><div class="hh-bi-modal-actions"><button type="button" class="primary" id="bi-save-analysis">Save prediction snapshot</button></div>`;
    }
    openModal("Breeding Pair Analysis", `<div class="hh-bi-pair-selectors"><label>Buck<select id="bi-pair-buck">${selectOptions(bucks,buck?.id)}</select></label><label>Doe<select id="bi-pair-doe">${selectOptions(does,doe?.id)}</select></label><button type="button" class="primary" id="bi-run-analysis">Analyze pairing</button></div>${analysisHtml}`);
    modal.querySelector("#bi-run-analysis")?.addEventListener("click",()=>renderPairModal(modal.querySelector("#bi-pair-buck").value,modal.querySelector("#bi-pair-doe").value));
    modal.querySelector("#bi-save-analysis")?.addEventListener("click", async()=>{ if(!lastAnalysis||!lastPair)return; const fresh=readState(), snapshot=Core.createPredictionSnapshot(lastAnalysis,{buckId:lastPair.buckId,doeId:lastPair.doeId}); fresh[ROOT_KEY].predictions.push(snapshot); const active=fresh.breedings.find((b)=>{const ids=[String(b.maleId||b.sireId||""),String(b.femaleId||b.damId||"")];return ids.includes(String(lastPair.buckId))&&ids.includes(String(lastPair.doeId))&&!/delivered|cancelled/i.test(String(b.status||""));}); if(active&&!active.geneticsPredictionSnapshot)active.geneticsPredictionSnapshot=snapshot; await writeState(fresh); renderCard(); renderPairModal(lastPair.buckId,lastPair.doeId); });
  }

  async function learnFromOffspring() {
    const state=readState(), rabbits=rabbitAnimals(state); let changed=0;
    rabbits.forEach((parent)=>{const children=rabbits.filter((child)=>String(child.sireId||"")===String(parent.id)||String(child.damId||"")===String(parent.id));if(!children.length)return;const mates=new Map();children.forEach((child)=>{const mateId=String(child.sireId||"")===String(parent.id)?child.damId:child.sireId;if(!mates.has(String(mateId||"")))mates.set(String(mateId||""),[]);mates.get(String(mateId||"")).push(child);});let genetics=Core.normalizeGenetics(parent.genetics);mates.forEach((offspring,mateId)=>{const mate=rabbits.find((a)=>String(a.id)===mateId),evidence=Core.offspringEvidenceForParent(parent,mate,offspring);if(evidence.length){const before=JSON.stringify(genetics);genetics=Core.applyEvidenceToGenetics(genetics,evidence);if(JSON.stringify(genetics)!==before)changed+=1;}});if(genetics.evidence.length)parent.genetics=genetics;});
    await writeState(state); renderCard(); openModal("Offspring Evidence Updated",`<p>HerdHarbor reviewed recorded rabbit offspring and updated <strong>${changed}</strong> parental genetic profile${changed===1?"":"s"} with inheritance evidence.</p><p class="hh-bi-note">Lower-confidence evidence never silently replaces conflicting confirmed genetics. Any conflict remains flagged for breeder review.</p>`);
  }

  function renderHistory(){const state=readState(),predictions=(state[ROOT_KEY]?.predictions||[]).slice().reverse(),byId=new Map(state.animals.map((a)=>[String(a.id),a]));const rows=predictions.length?predictions.map((snapshot)=>{const buck=byId.get(String(snapshot.metadata?.buckId)),doe=byId.get(String(snapshot.metadata?.doeId)),outcomes=snapshot.analysis?.exact?(snapshot.analysis.exactOutcomes||[]).map((o)=>`${o.name} ${(o.probability*100).toFixed(0)}%`).join(" · "):(snapshot.analysis?.possibleOutcomes||[]).map((o)=>o.name).slice(0,8).join(" · ");return `<article class="hh-bi-history-item"><strong>${esc(buck?.name||snapshot.analysis?.parent1?.name||"Buck")} × ${esc(doe?.name||snapshot.analysis?.parent2?.name||"Doe")}</strong><span>${esc(new Date(snapshot.createdAt).toLocaleString())}</span><p>${esc(outcomes||"No supported outcome recorded")}</p><small>Snapshot preserved with engine v${esc(snapshot.engineVersion||"1")}; later evidence does not rewrite this result.</small></article>`;}).join(""):'<p>No prediction snapshots have been saved yet.</p>';openModal("Prediction History",`<div class="hh-bi-history">${rows}</div>`);}
  function handleAction(action){if(action==="pair")return renderPairModal("","");if(action==="profile")return renderProfileModal("");if(action==="learn")return learnFromOffspring();if(action==="history")return renderHistory();}
  function installEvents(){document.addEventListener("click",(event)=>{const action=event.target.closest("[data-bi-action]")?.dataset.biAction;if(action)handleAction(action);if(event.target.closest("[data-bi-close]")||event.target===modal)closeModal();});document.addEventListener("keydown",(event)=>{if(event.key==="Escape"&&modal)closeModal();});}
  function monitorBreedingView(){if(observer)return;observer=new MutationObserver(()=>{if(!document.querySelector("#hh-breeding-intelligence"))renderCard();updateVisibleVersion();});observer.observe(document.body,{childList:true,subtree:true});}
  function boot(){installStorageProtection();ensureStylesheet();installEvents();renderCard();updateVisibleVersion();monitorBreedingView();window.HerdHarborBreedingIntelligence=Object.freeze({version:RELEASE_VERSION,analyzePairing:Core.analyzePairing,readState,openPairAnalysis:()=>renderPairModal("",""),openGeneticProfile:(animalId)=>renderProfileModal(animalId||""),refresh:renderCard});}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
