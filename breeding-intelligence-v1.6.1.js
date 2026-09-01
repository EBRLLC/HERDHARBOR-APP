(() => {
  "use strict";
  const Core = window.HerdHarborBreedingIntelligenceCore;
  if (!Core) { console.error("HerdHarbor Breeding Intelligence could not start: core module missing."); return; }
  const STORAGE_KEY = "herdharbor_pre_alpha_v1", RELEASE_VERSION = "1.6.1", ROOT_KEY = "breedingIntelligence";
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
  const deepClone = (value) => Core.deepClone ? Core.deepClone(value) : JSON.parse(JSON.stringify(value));
  const rabbitAnimals = (state) => (state.animals || []).filter((animal) => Core.canonicalSpecies(animal.species) === "Rabbit");
  const sexIs = (animal, wanted) => wanted === "male" ? /male|buck/i.test(String(animal?.sex || "")) : /female|doe/i.test(String(animal?.sex || ""));
  function animalLabel(animal) { const identity = animal.name || animal.tag || animal.earTagNumber || animal.id || "Unnamed rabbit", color = animal.color || animal.variety; return color ? `${identity} — ${color}` : identity; }
  function selectOptions(animals, selectedId) { return ['<option value="">Select a rabbit…</option>'].concat(animals.map((animal) => `<option value="${esc(animal.id)}" ${String(animal.id) === String(selectedId || "") ? "selected" : ""}>${esc(animalLabel(animal))}</option>`)).join(""); }
  function performanceSummary(state, animal) { const p = Core.performanceForAnimal(animal, state.breedings, state.births), survival = p.survivalRate == null ? "—" : `${Math.round(p.survivalRate * 100)}%`, avg = p.averageLitterSize == null ? "—" : p.averageLitterSize.toFixed(1); return `${p.breedings} breedings · ${p.births} litters · ${p.bornAlive} live born · ${p.weaned} weaned · ${survival} survival · ${avg} avg litter`; }
  function geneticsSnapshotForAnimal(animal,state){try{return deepClone(Core.refineAnimalGenetics(animal,state.animals||[],state.births||state.litters||[]).genetics);}catch(_){return deepClone(Core.normalizeGenetics(animal.genetics));}}

  function ensureStylesheet() {
    if (document.getElementById("hh-breeding-intelligence-style")) return;
    const target = document.head || document.body || document.documentElement;
    if (!target) return;
    const link = document.createElement("link");
    link.id = "hh-breeding-intelligence-style";
    link.rel = "stylesheet";
    link.href = "breeding-intelligence-v1.6.1.css?v=1.6.1";
    target.appendChild(link);
  }
  function updateVisibleVersion() { document.querySelectorAll("[data-app-version], .app-version, .version-label").forEach((el) => { const text = String(el.textContent || ""); if (/1\.3\.0|alpha/i.test(text)) el.textContent = text.replace(/1\.3\.0/g, RELEASE_VERSION); }); document.documentElement.dataset.herdharborRelease = RELEASE_VERSION; }

  function renderCard() {
    const host = document.querySelector("#view-breeding"); if (!host) return;
    let card = host.querySelector("#hh-breeding-intelligence"); if (!card) { card = document.createElement("section"); card.id = "hh-breeding-intelligence"; card.className = "hh-bi-card"; host.prepend(card); }
    const state = readState(), rabbits = rabbitAnimals(state), bucks = rabbits.filter((a) => sexIs(a,"male")), does = rabbits.filter((a) => sexIs(a,"female")), profiles = rabbits.filter((a) => a.genetics).length, predictions = state[ROOT_KEY]?.predictions?.length || 0;
    card.innerHTML = `<div class="hh-bi-heading"><div><span class="hh-bi-kicker">Alpha v${RELEASE_VERSION}</span><h2>Breeding Intelligence</h2><p>Plan rabbit pairings with pedigree evidence, recorded genetics, previous offspring and honest uncertainty handling.</p></div><span class="hh-bi-badge">Rabbit genetics v1</span></div><div class="hh-bi-metrics"><div><strong>${rabbits.length}</strong><span>Rabbits</span></div><div><strong>${profiles}</strong><span>Genetic profiles</span></div><div><strong>${predictions}</strong><span>Saved analyses</span></div></div><div class="hh-bi-actions"><button type="button" class="primary" data-bi-action="pair">Analyze pairing</button><button type="button" data-bi-action="profile">Rabbit genetic profile</button><button type="button" data-bi-action="learn">Learn from recorded offspring</button><button type="button" data-bi-action="history">Prediction history</button></div>${(!bucks.length || !does.length) ? '<p class="hh-bi-note">Add at least one male and one female rabbit to run Pair Analysis.</p>' : ''}<p class="hh-bi-footnote">Predictions use the supported A/B/C/D/E model. Additional modifier genes, breed-specific expression and incomplete records can change visible color.</p>`;
  }

  function openModal(title, bodyHtml) {
    closeModal();
    const target = document.body || document.documentElement || document.head;
    if (!target) return;
    modal = document.createElement("div");
    modal.className = "hh-bi-modal-backdrop";
    modal.innerHTML = `<section class="hh-bi-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><div><span class="hh-bi-kicker">HerdHarbor Breeding Intelligence</span><h2>${esc(title)}</h2></div><button type="button" class="hh-bi-close" data-bi-close aria-label="Close">×</button></header><div class="hh-bi-modal-body">${bodyHtml}</div></section>`;
    target.appendChild(modal);
    modal.querySelector("[data-bi-close]")?.focus();
  }
  function closeModal() { if (modal) modal.remove(); modal = null; lastAnalysis = null; lastPair = null; }

  function renderProfileModal(selectedId) {
    const state = readState(), rabbits = rabbitAnimals(state), animal = rabbits.find((a) => String(a.id) === String(selectedId)) || rabbits[0];
    if (!animal) { openModal("Rabbit Genetic Profile", '<p>No rabbit records are available yet.</p>'); return; }
    const genetics = Core.normalizeGenetics(animal.genetics);
    const locusRows = Object.entries(Core.RABBIT_LOCI).map(([locus, config]) => {
      const record = genetics.loci[locus], alleles = config.dominance.concat(["_"]), alleleOptions = (selected) => alleles.map((a) => `<option value="${esc(a)}" ${a === selected ? "selected" : ""}>${esc(a === "_" ? "Unknown" : a)}</option>`).join("");
      return `<div class="hh-bi-locus" data-locus="${locus}"><div><strong>${locus} locus</strong><span>${esc(config.name)}${config.group?` · ${esc(config.group)}`:""}</span></div><div class="hh-bi-alleles"><select data-allele="0">${alleleOptions(record.alleles[0])}</select><select data-allele="1">${alleleOptions(record.alleles[1])}</select></div><select data-status>${["tested","confirmed","inferred","possible","unknown"].map((status) => `<option value="${status}" ${record.status === status ? "selected" : ""}>${status[0].toUpperCase()+status.slice(1)}</option>`).join("")}</select><input type="text" data-note value="${esc(record.note || "")}" placeholder="Evidence or note (recommended for confirmed/inferred)"></div>`;
    }).join("");
    const pedigree = Core.pedigreeEvidence(animal, state.animals, 3);
    openModal("Rabbit Genetic Profile", `<div class="hh-bi-form-row"><label>Rabbit<select id="bi-profile-animal">${selectOptions(rabbits,animal.id)}</select></label></div><div class="hh-bi-profile-summary"><strong>${esc(animalLabel(animal))}</strong><span>Color-derived starting pattern: ${esc(Core.patternLabelForColor(animal.color || animal.variety))}</span><span>${esc(performanceSummary(state,animal))}</span></div><p class="hh-bi-note">Unknown alleles stay unknown. A recorded color can constrain what is possible, but HerdHarbor will not invent a hidden carrier allele.</p><div class="hh-bi-loci">${locusRows}</div><div class="hh-bi-evidence-panel"><h3>Pedigree evidence</h3>${pedigree.length ? `<ul>${pedigree.map((e) => `<li><strong>${esc(e.status)}</strong> — ${esc(e.note)}</li>`).join("")}</ul>` : '<p>No pedigree evidence currently establishes a core recessive allele.</p>'}</div>${genetics.conflicts.length ? `<div class="hh-bi-warning"><strong>${genetics.conflicts.length} genetics conflict(s) need review.</strong> Confirmed data is never silently overwritten by lower-confidence evidence.</div>` : ""}<div class="hh-bi-modal-actions"><button type="button" class="primary" id="bi-save-profile">Save genetic profile</button></div>`);
    modal.querySelector("#bi-profile-animal").addEventListener("change", (e) => renderProfileModal(e.target.value));
    modal.querySelector("#bi-save-profile").addEventListener("click", async () => { const fresh = readState(), target = fresh.animals.find((a) => String(a.id) === String(animal.id)); if (!target) return; const next = Core.normalizeGenetics(target.genetics); modal.querySelectorAll(".hh-bi-locus").forEach((row) => { const locus = row.dataset.locus; next.loci[locus].alleles=[row.querySelector('[data-allele="0"]').value,row.querySelector('[data-allele="1"]').value]; next.loci[locus].status=row.querySelector("[data-status]").value; next.loci[locus].note=row.querySelector("[data-note]").value.trim(); next.loci[locus].source = next.loci[locus].status === "confirmed" ? "breeder" : (next.loci[locus].source || "breeder"); }); next.updatedAt=new Date().toISOString(); target.genetics=next; await writeState(fresh); renderProfileModal(animal.id); renderCard(); });
  }

  function resultRows(analysis) { if (analysis.exact) return analysis.exactOutcomes.map((o) => `<div class="hh-bi-result-row"><div><strong>${esc(o.name)}</strong><span>${esc(o.family)} · ${esc(o.scope)}</span></div><b>${(o.probability*100).toFixed((o.probability*100)%1?1:0)}%</b></div>`).join(""); return analysis.possibleOutcomes.map((o) => `<div class="hh-bi-result-row"><div><strong>${esc(o.name)}</strong><span>${esc(o.family)} · ${esc(o.scope)}</span></div><b>Possible</b></div>`).join(""); }
  function modifierRows(analysis){return Object.entries(analysis.modifierCrosses||{}).map(([locus,cross])=>`<details class="hh-bi-trait-result"><summary><strong>${esc(locus)} · ${esc(cross.name)}</strong><span>${cross.exact?"Calculated":"Unknown alleles"}</span></summary>${cross.exact?cross.outcomes.map(row=>`<div class="hh-bi-result-row"><div><strong>${esc(row.expression.label)}</strong><span>${esc(row.alleles.join("/"))}</span></div><b>${(row.probability*100).toFixed((row.probability*100)%1?1:0)}%</b></div>`).join(""):'<p class="hh-bi-note">Add both parental genotypes to calculate percentages. Unknown alleles were not guessed.</p>'}</details>`).join("");}
  function renderPairModal(buckId, doeId) {
    lastAnalysis=null; lastPair=null;
    const state=readState(), rabbits=rabbitAnimals(state), bucks=rabbits.filter((a)=>sexIs(a,"male")), does=rabbits.filter((a)=>sexIs(a,"female")), buck=bucks.find((a)=>String(a.id)===String(buckId))||bucks[0], doe=does.find((a)=>String(a.id)===String(doeId))||does[0];
    let analysisHtml='<div class="hh-bi-empty">Choose a buck and doe, then run Pair Analysis.</div>';
    if (buck && doe && buckId && doeId) {
      lastAnalysis=Core.analyzePairing(buck,doe,state); lastPair={buckId:buck.id,doeId:doe.id};
      const shared=lastAnalysis.sharedAncestors.length?`<ul>${lastAnalysis.sharedAncestors.map((a)=>`<li>${esc(a.name)} — generation ${a.parent1Depth} from ${esc(buck.name||"buck")} / generation ${a.parent2Depth} from ${esc(doe.name||"doe")}</li>`).join("")}</ul>`:"<p>No shared ancestors found within three recorded generations.</p>", previous=lastAnalysis.previousOffspring.length?lastAnalysis.previousOffspring.map((r)=>`${esc(r.color)} × ${r.count}`).join(" · "):"No recorded offspring colors for this pairing yet.";
      const health=(lastAnalysis.healthNotices||[]).length?`<div class="hh-bi-warning"><h3>Breeding health notices</h3><ul>${lastAnalysis.healthNotices.map(n=>`<li><strong>${esc(n.locus)} · ${n.probability==null?"Possible":`${(n.probability*100).toFixed(0)}%`}</strong> — ${esc(n.message)}</li>`).join("")}</ul><p>Informational only; consult a rabbit-savvy veterinarian for health decisions.</p></div>`:"";
      analysisHtml=`<div class="hh-bi-analysis-header"><div><span class="hh-bi-kicker">Possible offspring colors</span><h3>${lastAnalysis.exact?"Exact core-locus probabilities":"Possible outcomes with current evidence"}</h3></div><span class="hh-bi-confidence ${lastAnalysis.exact?"exact":"conditional"}">${lastAnalysis.exact?"Complete A/B/C/D/E":`${lastAnalysis.incompleteLoci.length} unknown locus entries`}</span></div><div class="hh-bi-results">${resultRows(lastAnalysis)||'<p>No supported core-color outcome could be resolved from the current records.</p>'}</div>${lastAnalysis.modifierCrosses?`<div class="hh-bi-evidence-panel"><h3>Pattern, coat & conformation traits</h3><p class="hh-bi-note">Each tracked locus is calculated independently. Registry recognition is not implied.</p>${modifierRows(lastAnalysis)}</div>`:""}${health}<div class="hh-bi-explain"><h3>Why these results?</h3><p>${esc(lastAnalysis.explanation)}</p><p>${esc(lastAnalysis.disclaimer)}</p></div><div class="hh-bi-two-col"><div><h3>Pedigree comparison</h3>${shared}</div><div><h3>Previous offspring</h3><p>${previous}</p></div></div><div class="hh-bi-two-col"><div><h3>${esc(buck.name||"Buck")} performance</h3><p>${esc(performanceSummary(state,buck))}</p></div><div><h3>${esc(doe.name||"Doe")} performance</h3><p>${esc(performanceSummary(state,doe))}</p></div></div><div class="hh-bi-modal-actions"><button type="button" class="primary" id="bi-save-analysis">Save Prediction Snapshot</button></div><p class="hh-bi-save-confirmation" id="bi-save-confirmation" role="status" aria-live="polite" hidden></p>`;
    }
    const generatedAnalysis=lastAnalysis, generatedPair=lastPair;
    openModal("Breeding Pair Analysis", `<div class="hh-bi-pair-selectors"><label>Buck<select id="bi-pair-buck">${selectOptions(bucks,buck?.id)}</select></label><label>Doe<select id="bi-pair-doe">${selectOptions(does,doe?.id)}</select></label><button type="button" class="primary" id="bi-run-analysis">Analyze pairing</button></div>${analysisHtml}`);
    lastAnalysis=generatedAnalysis; lastPair=generatedPair;
    modal.querySelector("#bi-run-analysis")?.addEventListener("click",()=>renderPairModal(modal.querySelector("#bi-pair-buck").value,modal.querySelector("#bi-pair-doe").value));
    modal.querySelector("#bi-save-analysis")?.addEventListener("click", async(event)=>{const button=event.currentTarget,confirmation=modal.querySelector("#bi-save-confirmation");if(button.disabled||!lastAnalysis||!lastPair)return;const prediction={analysis:deepClone(lastAnalysis),generatedAt:new Date().toISOString(),buck:{id:buck.id,name:buck.name||"Buck",color:buck.color||buck.variety||"",genetics:geneticsSnapshotForAnimal(buck,state)},doe:{id:doe.id,name:doe.name||"Doe",color:doe.color||doe.variety||"",genetics:geneticsSnapshotForAnimal(doe,state)}};button.disabled=true;button.textContent="Saving…";try{await savePredictionSnapshot(prediction);button.textContent="Prediction Saved";confirmation.hidden=false;confirmation.textContent="Prediction saved to history.";lastAnalysis=null;lastPair=null;}catch(error){console.error("Prediction snapshot could not be saved:",error);button.disabled=false;button.textContent="Save Prediction Snapshot";confirmation.hidden=false;confirmation.textContent="Prediction could not be saved. Try again.";confirmation.classList.add("error");}});
  }

  async function learnFromOffspring() {
    const state=readState(), rabbits=rabbitAnimals(state); let changed=0;
    rabbits.forEach((parent)=>{const children=rabbits.filter((child)=>String(child.sireId||"")===String(parent.id)||String(child.damId||"")===String(parent.id));if(!children.length)return;const mates=new Map();children.forEach((child)=>{const mateId=String(child.sireId||"")===String(parent.id)?child.damId:child.sireId;if(!mates.has(String(mateId||"")))mates.set(String(mateId||""),[]);mates.get(String(mateId||"")).push(child);});let genetics=Core.normalizeGenetics(parent.genetics);mates.forEach((offspring,mateId)=>{const mate=rabbits.find((a)=>String(a.id)===mateId),evidence=Core.offspringEvidenceForParent(parent,mate,offspring);if(evidence.length){const before=JSON.stringify(genetics);genetics=Core.applyEvidenceToGenetics(genetics,evidence);if(JSON.stringify(genetics)!==before)changed+=1;}});if(genetics.evidence.length)parent.genetics=genetics;});
    await writeState(state); renderCard(); openModal("Offspring Evidence Updated",`<p>HerdHarbor reviewed recorded rabbit offspring and updated <strong>${changed}</strong> parental genetic profile${changed===1?"":"s"} with inheritance evidence.</p><p class="hh-bi-note">Lower-confidence evidence never silently replaces conflicting confirmed genetics. Any conflict remains flagged for breeder review.</p>`);
  }

  function snapshotParents(snapshot) {
    const metadata=snapshot?.metadata||{}, analysis=snapshot?.analysis||{};
    return {
      buckName:metadata.buckName||analysis.parent1?.name||"Buck",
      doeName:metadata.doeName||analysis.parent2?.name||"Doe"
    };
  }

  function probabilityText(outcome) {
    if (outcome?.probability!=null&&Number.isFinite(Number(outcome.probability))) {
      const value=Number(outcome.probability)*100;
      return `${value.toFixed(value%1?1:0)}%`;
    }
    if (outcome?.minProbability!=null&&outcome?.maxProbability!=null&&Number.isFinite(Number(outcome.minProbability))&&Number.isFinite(Number(outcome.maxProbability))) {
      const min=Number(outcome.minProbability)*100, max=Number(outcome.maxProbability)*100;
      const format=(value)=>`${value.toFixed(value%1?1:0)}%`;
      return Math.abs(min-max)<1e-9?format(min):`${format(min)}–${format(max)}`;
    }
    return "Possible";
  }

  function savedColorOutcomes(analysis) {
    if (Array.isArray(analysis?.possibleOffspringColors)&&analysis.possibleOffspringColors.length) return analysis.possibleOffspringColors;
    if (analysis?.exact&&Array.isArray(analysis.exactOutcomes)&&analysis.exactOutcomes.length) return analysis.exactOutcomes;
    if (analysis?.exactBase&&Array.isArray(analysis.baseOutcomes)&&analysis.baseOutcomes.length) return analysis.baseOutcomes;
    return Array.isArray(analysis?.possibleOutcomes)?analysis.possibleOutcomes:[];
  }

  function savedOutcomeRows(outcomes, emptyText="No supported outcome was saved.") {
    return outcomes?.length?outcomes.map((outcome)=>`<div class="hh-bi-result-row"><div><strong>${esc(outcome.name||"Recorded outcome")}</strong><span>${esc(outcome.family||outcome.requires||outcome.reason||"Saved prediction")}</span>${outcome.reason&&outcome.family?`<small>${esc(outcome.reason)}</small>`:""}</div><b>${esc(probabilityText(outcome))}</b></div>`).join(""):`<p>${esc(emptyText)}</p>`;
  }

  async function savePredictionSnapshot(input) {
    const analysis=deepClone(input?.analysis||{}), buck=deepClone(input?.buck||{}), doe=deepClone(input?.doe||{});
    if (!buck.id||!doe.id||!analysis.supported||typeof Core.createPredictionSnapshot!=="function") throw new Error("A completed rabbit genetics prediction is required before saving.");
    const appVersion=window.HerdHarborPWA?.version||document.documentElement.dataset.herdharborRelease||window.HerdHarborRelease?.version||RELEASE_VERSION;
    const appBuild=window.HerdHarborPWA?.build||null;
    const metadata={
      schemaVersion:2,
      buckId:buck.id,
      buckName:buck.name||analysis.parent1?.name||"Buck",
      buckColor:buck.color||"",
      buckGenetics:deepClone(buck.genetics||{}),
      doeId:doe.id,
      doeName:doe.name||analysis.parent2?.name||"Doe",
      doeColor:doe.color||"",
      doeGenetics:deepClone(doe.genetics||{}),
      generatedAt:input.generatedAt||new Date().toISOString(),
      predictionType:analysis.exact?"exact":(analysis.scenarioTruncated?"unresolved":"conditional"),
      predictionConfidence:analysis.exact?"deterministic":(analysis.scenarioTruncated?"insufficient-evidence":"probability-range"),
      appVersion,
      appBuild,
      geneticsEngineVersion:analysis.engineVersion||Core.VERSION||"unknown"
    };
    const created=Core.createPredictionSnapshot(analysis,metadata);
    const snapshot=Object.freeze({...deepClone(created),schemaVersion:2,engineVersion:analysis.engineVersion||created.engineVersion||Core.VERSION||"unknown",appVersion,appBuild});
    const fresh=readState();
    fresh[ROOT_KEY].predictions.push(snapshot);
    const active=(fresh.breedings||[]).find((breeding)=>{
      const ids=[String(breeding.maleId||breeding.sireId||""),String(breeding.femaleId||breeding.damId||"")];
      return ids.includes(String(buck.id))&&ids.includes(String(doe.id))&&!/delivered|cancelled/i.test(String(breeding.status||""));
    });
    if (active&&!active.geneticsPredictionSnapshot) active.geneticsPredictionSnapshot=deepClone(snapshot);
    await writeState(fresh);
    renderCard();
    return snapshot;
  }

  function renderSavedSnapshot(snapshotId) {
    const state=readState(), snapshot=(state[ROOT_KEY]?.predictions||[]).find((item)=>String(item.id)===String(snapshotId));
    if (!snapshot) { renderHistory(); return; }
    const analysis=snapshot.analysis||{}, parents=snapshotParents(snapshot), colors=savedColorOutcomes(analysis);
    const conditional=(analysis.conditionalColors||analysis.conditionalOutcomes||[]).filter((outcome)=>Number(outcome.maxProbability??1)>0);
    const excluded=analysis.currentlyExcluded||analysis.excludedOutcomes||[];
    const unknown=analysis.incompleteLoci||[];
    const vienna=analysis.viennaRange||analysis.viennaInheritance;
    const viennaHtml=vienna?`<div class="hh-bi-evidence-panel"><h3>Vienna Inheritance</h3><div class="hh-bi-results">${[["Vienna clean (VV)",vienna.clean],["Vienna carrier (Vv)",vienna.carrier],["Blue-Eyed White (vv)",vienna.bew]].map(([name,result])=>`<div class="hh-bi-result-row"><strong>${esc(name)}</strong><b>${esc(probabilityText(result||{}))}</b></div>`).join("")}</div>${vienna.note?`<p>${esc(vienna.note)}</p>`:""}</div>`:"";
    openModal("Saved Prediction Snapshot",`<div class="hh-bi-profile-summary"><strong>${esc(parents.buckName)} × ${esc(parents.doeName)}</strong><span>Saved ${esc(new Date(snapshot.createdAt).toLocaleString())}</span><span>HerdHarbor v${esc(snapshot.appVersion||snapshot.metadata?.appVersion||"unknown")} · Genetics engine v${esc(snapshot.engineVersion||analysis.engineVersion||"unknown")}</span><span>This view uses only the saved snapshot. It does not recalculate from current animal records.</span></div><div class="hh-bi-analysis-header"><div><span class="hh-bi-kicker">Predicted Offspring</span><h3>${analysis.exact?"Exact saved probabilities":"Saved probability ranges"}</h3></div><span class="hh-bi-confidence ${analysis.exact?"exact":"conditional"}">${analysis.exact?"Deterministic":"Unknown alleles preserved"}</span></div><div class="hh-bi-results">${savedOutcomeRows(colors)}</div>${viennaHtml}<div class="hh-bi-evidence-panel"><h3>Known Genetics</h3><p><strong>${esc(parents.doeName)}:</strong> ${esc(analysis.parent2?.genotype||"Saved in snapshot metadata")}</p><p><strong>${esc(parents.buckName)}:</strong> ${esc(analysis.parent1?.genotype||"Saved in snapshot metadata")}</p></div><div class="hh-bi-two-col"><div><h3>Possible if carrier / unresolved</h3><div class="hh-bi-results">${savedOutcomeRows(conditional,"No tracked conditional result was saved.")}</div></div><div><h3>Currently excluded</h3>${excluded.length?`<ul>${excluded.map((item)=>`<li><strong>${esc(item.name||"Outcome")} — Excluded.</strong>${item.reason?` ${esc(item.reason)}`:""}</li>`).join("")}</ul>`:"<p>None.</p>"}</div></div><div class="hh-bi-evidence-panel"><h3>Unknown Variables</h3>${unknown.length?`<ul>${unknown.map((item)=>`<li><strong>${esc(item.animalName||item.parent||"Parent")} · ${esc(item.locus||"Unknown locus")}</strong> — ${esc((item.options||item.alleles||[]).join(", ")||"Unresolved")}</li>`).join("")}</ul>`:"<p>All tracked loci were resolved.</p>"}</div><div class="hh-bi-explain"><h3>How HerdHarbor calculated this</h3><p>${esc(analysis.explanation||"No explanation was saved.")}</p><p>${esc(analysis.disclaimer||"No disclaimer was saved.")}</p></div><div class="hh-bi-modal-actions"><button type="button" data-bi-history-back>Back to Prediction History</button></div>`);
  }

  function renderHistory(){const state=readState(),predictions=(state[ROOT_KEY]?.predictions||[]).slice().reverse();const rows=predictions.length?predictions.map((snapshot)=>{const parents=snapshotParents(snapshot),outcomes=savedColorOutcomes(snapshot.analysis||{}).slice(0,8).map((outcome)=>`${outcome.name||"Outcome"} ${probabilityText(outcome)}`).join(" · ");return `<article class="hh-bi-history-item"><strong>${esc(parents.buckName)} × ${esc(parents.doeName)}</strong><span>${esc(new Date(snapshot.createdAt).toLocaleString())}</span><p>${esc(outcomes||"No supported outcome recorded")}</p><small>Snapshot preserved with engine v${esc(snapshot.engineVersion||snapshot.analysis?.engineVersion||"1")}; later evidence does not rewrite this result.</small><button type="button" class="primary" data-bi-open-snapshot="${esc(snapshot.id)}">Open saved prediction</button></article>`;}).join(""):'<p>No prediction snapshots have been saved yet.</p>';openModal("Prediction History",`<div class="hh-bi-history">${rows}</div>`);}
  function handleAction(action){if(action==="pair")return renderPairModal("","");if(action==="profile")return renderProfileModal("");if(action==="learn")return learnFromOffspring();if(action==="history")return renderHistory();}
  function installEvents(){document.addEventListener("click",(event)=>{const action=event.target.closest("[data-bi-action]")?.dataset.biAction;if(action)handleAction(action);const snapshotId=event.target.closest("[data-bi-open-snapshot]")?.dataset.biOpenSnapshot;if(snapshotId)renderSavedSnapshot(snapshotId);if(event.target.closest("[data-bi-history-back]"))renderHistory();if(event.target.closest("[data-bi-close]")||event.target===modal)closeModal();});document.addEventListener("keydown",(event)=>{if(event.key==="Escape"&&modal)closeModal();});}
  function monitorBreedingView(){
    if(observer)return;
    const target=document.body;
    if(!target){
      if(!window.__hhBreedingDomWait){
        window.__hhBreedingDomWait=true;
        document.addEventListener("DOMContentLoaded",()=>{window.__hhBreedingDomWait=false;monitorBreedingView();},{once:true});
      }
      return;
    }
    observer=new MutationObserver(()=>{if(!document.querySelector("#hh-breeding-intelligence"))renderCard();updateVisibleVersion();});
    observer.observe(target,{childList:true,subtree:true});
  }
  function boot(){installStorageProtection();ensureStylesheet();installEvents();renderCard();updateVisibleVersion();monitorBreedingView();window.HerdHarborBreedingIntelligence=Object.freeze({version:RELEASE_VERSION,analyzePairing:Core.analyzePairing,readState,savePredictionSnapshot,openPairAnalysis:()=>renderPairModal("",""),openGeneticProfile:(animalId)=>renderProfileModal(animalId||""),openPredictionHistory:renderHistory,openSavedPrediction:renderSavedSnapshot,refresh:renderCard});}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
