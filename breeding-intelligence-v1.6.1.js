(() => {
  "use strict";
  const Core = window.HerdHarborBreedingIntelligenceCore;
  const Pedigree = window.HerdHarborPedigreeEngine;
  const PedigreeRenderer = window.HerdHarborPedigreeRenderer;
  if (!Core) { console.error("HerdHarbor Breeding Intelligence could not start: core module missing."); return; }
  if (!Pedigree?.sharedAncestorAnalysis) { console.error("HerdHarbor Breeding Intelligence could not start: canonical pedigree analysis missing."); return; }
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
  const sexIs = (animal, wanted) => wanted === "male" ? /\b(?:male|buck)\b/i.test(String(animal?.sex || "")) : /\b(?:female|doe)\b/i.test(String(animal?.sex || ""));
  const isAncestorOnly = (animal) => Boolean(animal?.isAncestorOnly) || String(animal?.status || "").trim().toLowerCase() === "ancestor only";
  function isActiveAnimalRecord(animal) {
    const membershipResult = window.HerdHarborMembership?.isActiveAnimal?.(animal);
    if (typeof membershipResult === "boolean") return membershipResult;
    return !["sold", "deceased", "archived", "ancestor only"].includes(String(animal?.status || "Active").trim().toLowerCase());
  }
  function linebreedingCandidateRabbits(state, includeAncestors = false) {
    return rabbitAnimals(state).filter((animal) =>
      animal?.id && (isActiveAnimalRecord(animal) || (includeAncestors && isAncestorOnly(animal)))
    );
  }
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
    card.innerHTML = `<div class="hh-bi-heading"><div><span class="hh-bi-kicker">Breeding Genetics</span><h2>Breeding Intelligence</h2><p>Plan rabbit pairings with pedigree evidence, recorded genetics, previous offspring and honest uncertainty handling.</p></div><span class="hh-bi-badge">Rabbit genetics</span></div><div class="hh-bi-metrics"><div><strong>${rabbits.length}</strong><span>Rabbits</span></div><div><strong>${profiles}</strong><span>Genetic profiles</span></div><div><strong>${predictions}</strong><span>Saved analyses</span></div></div><div class="hh-bi-actions"><button type="button" class="primary" data-bi-action="pair">Analyze Pairing</button><button type="button" data-bi-action="compare">Linebreeding Coefficient</button><button type="button" data-bi-action="profile">Rabbit genetic profile</button><button type="button" data-bi-action="learn">Learn from recorded offspring</button><button type="button" data-bi-action="history">Prediction history</button></div>${(!bucks.length || !does.length) ? '<p class="hh-bi-note">Add at least one male and one female rabbit to run Pair Analysis.</p>' : ''}<p class="hh-bi-footnote">Predictions use the supported A/B/C/D/E model. Additional modifier genes, breed-specific expression and incomplete records can change visible color.</p>`;
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
  function percentage(value) {
    const number = Number(value);
    return Number.isFinite(number) ? `${(number * 100).toFixed(1).replace(/\.0$/, "")}%` : "—";
  }

  function relationshipAnalysis(animalA, animalB, state, generations = 4) {
    return Pedigree.pedigreeRelationshipAnalysis({
      animals: state.animals || [],
      animalA,
      animalB,
      generations
    });
  }

  function relationshipSummaryHtml(analysis, labelA = "Animal A", labelB = "Animal B") {
    if (!analysis) return '<p class="hh-bi-note">Pedigree analysis is unavailable.</p>';
    const shared = analysis.sharedAncestors.length
      ? `<ul>${analysis.sharedAncestors.map((row) => {
          const closest = row.closestPathPairs[0];
          const pathText = closest
            ? `${closest.animalA.relation} (${closest.animalA.depth}) ↔ ${closest.animalB.relation} (${closest.animalB.depth})`
            : "Recorded on both pedigrees";
          const repeats = row.animalARepeated || row.animalBRepeated
            ? ` · repeated occurrence${row.pathPairCount === 1 ? "" : "s"}: ${row.pathPairCount} path pair${row.pathPairCount === 1 ? "" : "s"}`
            : "";
          const ancestorCoi = row.animalId
            ? analysis.sharedAncestryUsed.find((item) => item.animalId === row.animalId)?.ancestorPedigreeCoi
            : null;
          return `<li><strong>${esc(row.name || "Shared ancestor")}</strong> — ${esc(pathText)}${esc(repeats)}${ancestorCoi ? ` · ancestor Pedigree COI ${percentage(ancestorCoi)}` : ""}</li>`;
        }).join("")}</ul>`
      : `<p>No shared ancestors are recorded within ${analysis.ancestorGenerationsAnalyzed} analyzed ancestor generation${analysis.ancestorGenerationsAnalyzed === 1 ? "" : "s"}.</p>`;

    const direct = analysis.directAncestryUsed?.length
      ? `<div class="hh-bi-evidence-panel"><h4>Direct ancestry</h4><ul>${analysis.directAncestryUsed.map((row) =>
          `<li><strong>${esc(row.name || "Recorded ancestor")}</strong> — direct ancestor of ${row.ancestorOf === "animalA" ? esc(labelA) : esc(labelB)} at generation ${row.closestDepth}</li>`
        ).join("")}</ul></div>`
      : "";

    return `<div class="hh-bi-pedigree-summary">
      <div class="hh-bi-metrics">
        <div><strong>${percentage(analysis.relationshipCoefficient)}</strong><span>Relationship coefficient</span></div>
        <div><strong>${percentage(analysis.projectedOffspringPedigreeCoi)}</strong><span>Projected offspring Pedigree COI</span></div>
        <div><strong>${analysis.sharedAncestorCount}</strong><span>Shared ancestors</span></div>
      </div>
      <div class="hh-bi-two-col">
        <div><h4>${esc(labelA)}</h4><p>${percentage(analysis.pedigreeCompleteness.animalA.coverage)} pedigree coverage · ${analysis.pedigreeCompleteness.animalA.knownAncestorSlots}/${analysis.pedigreeCompleteness.animalA.expectedAncestorSlots} recorded slots</p></div>
        <div><h4>${esc(labelB)}</h4><p>${percentage(analysis.pedigreeCompleteness.animalB.coverage)} pedigree coverage · ${analysis.pedigreeCompleteness.animalB.knownAncestorSlots}/${analysis.pedigreeCompleteness.animalB.expectedAncestorSlots} recorded slots</p></div>
      </div>
      <p class="hh-bi-note">Analyzed through ${analysis.ancestorGenerationsAnalyzed} ancestor generation${analysis.ancestorGenerationsAnalyzed === 1 ? "" : "s"} using recorded pedigree parentage. Relationship coefficient and projected offspring Pedigree COI are separate values. This is pedigree-based, not genomic COI.</p>
      ${direct}
      <h4>Shared ancestors (${analysis.sharedAncestorCount})</h4>
      ${shared}
      <p class="hh-bi-note">${esc(analysis.assumptions.missingAncestry)}</p>
    </div>`;
  }

  function relationshipRendererAnnotations(analysis, side) {
    const isA = side === "animalA";
    const sharedIdentities = analysis.sharedAncestors.map((row) => row.identity);
    const occurrenceCounts = {};
    const closestKeys = [];
    for (const row of analysis.sharedAncestors) {
      occurrenceCounts[row.identity] = isA ? row.animalAOccurrences.length : row.animalBOccurrences.length;
      for (const pair of row.closestPathPairs) {
        const occurrence = isA ? pair.animalA : pair.animalB;
        if (occurrence?.key) closestKeys.push(occurrence.key);
      }
    }
    return { sharedIdentities, occurrenceCounts, closestKeys };
  }

  function closestPathsHtml(analysis) {
    const rows = (analysis.closestRelationshipPaths || []).slice(0, 12);
    if (!rows.length) return '<p>No shared-ancestor path is recorded within the analyzed pedigree depth.</p>';
    return `<ul class="hh-bi-closest-paths">${rows.map((row) =>
      `<li><strong>${esc(row.ancestorName || "Shared ancestor")}</strong><span>${esc(row.animalA.relation)} ↔ ${esc(row.animalB.relation)} · combined depth ${row.totalDepth}</span></li>`
    ).join("")}</ul>`;
  }

  function linebreedingViewHtml(first, second, analysis, state) {
    if (!PedigreeRenderer?.render || !Pedigree?.buildGraph) {
      return `<div class="hh-bi-warning">Interactive pedigree rendering is unavailable. ${relationshipSummaryHtml(analysis, first.name || "Animal A", second.name || "Animal B")}</div>`;
    }

    const generations = analysis.generationsAnalyzed || 4;
    const graphA = Pedigree.buildGraph({ animals: state.animals || [], subject: first, subjectId: first.id, generations });
    const graphB = Pedigree.buildGraph({ animals: state.animals || [], subject: second, subjectId: second.id, generations });
    const fields = ["name", "sex", "breed", "color", "registrationNumber"];
    const pedigreeA = PedigreeRenderer.render({
      graph: graphA,
      mode: "relationship-analysis",
      interactive: true,
      fields,
      relationship: relationshipRendererAnnotations(analysis, "animalA")
    });
    const pedigreeB = PedigreeRenderer.render({
      graph: graphB,
      mode: "relationship-analysis",
      interactive: true,
      fields,
      relationship: relationshipRendererAnnotations(analysis, "animalB")
    });

    return `<div class="hh-bi-linebreeding-view" data-hh-relationship-view>
      ${plannerPedigreeMetrics(analysis)}
      <div class="hh-bi-relationship-legend" aria-label="Relationship analysis markers">
        <span><b>↔</b> Shared ancestor — click to identify every appearance in both pedigrees</span>
        <span><b>◎</b> Closest path — occurrence used in one of the closest recorded relationship paths</span>
        <span><b>Repeated occurrence</b> — the same ancestor appears more than once in that pedigree</span>
      </div>
      <p class="hh-bi-note" id="bi-shared-selection-status" role="status" aria-live="polite">Select a shared ancestor marker to highlight every recorded appearance.</p>
      <div class="hh-bi-linebreeding-pedigrees">
        <section><header><span class="hh-bi-kicker">BUCK</span><h3>${esc(first.name || animalLabel(first))}</h3></header>${pedigreeA}</section>
        <section><header><span class="hh-bi-kicker">DOE</span><h3>${esc(second.name || animalLabel(second))}</h3></header>${pedigreeB}</section>
      </div>
      <section class="hh-bi-closest-path-panel"><h3>Closest recorded relationship paths</h3>${closestPathsHtml(analysis)}</section>
      <p class="hh-bi-note">Analysis depth: ${analysis.ancestorGenerationsAnalyzed} ancestor generation${analysis.ancestorGenerationsAnalyzed === 1 ? "" : "s"} · pedigree coverage ${percentage(analysis.pedigreeCompleteness.animalA.coverage)} / ${percentage(analysis.pedigreeCompleteness.animalB.coverage)}. Unknown ancestry is reflected in those coverage values.</p>
    </div>`;
  }

  function renderRelationshipComparison(firstId = "", secondId = "", includeAncestors = false) {
    const state = readState();
    const rabbits = linebreedingCandidateRabbits(state, includeAncestors);
    const bucks = rabbits.filter((animal) => sexIs(animal, "male"));
    const does = rabbits.filter((animal) => sexIs(animal, "female"));
    const requested = [firstId, secondId]
      .map((id) => rabbits.find((animal) => String(animal.id) === String(id)))
      .filter(Boolean);
    const buck = requested.find((animal) => sexIs(animal, "male")) || null;
    const doe = requested.find((animal) => sexIs(animal, "female")) || null;
    const validPair = Boolean(buck && doe && sexIs(buck, "male") && sexIs(doe, "female"));
    const analysis = validPair ? relationshipAnalysis(buck, doe, state, 4) : null;
    const results = analysis
      ? linebreedingViewHtml(buck, doe, analysis, state)
      : '<div class="hh-bi-empty">Choose one buck and one doe to calculate the linebreeding relationship and projected offspring Pedigree COI.</div>';
    const availability = !bucks.length || !does.length
      ? '<div class="hh-bi-warning"><strong>A buck and doe are required.</strong> Add or correctly sex at least one active rabbit of each sex, or turn on Include ancestors if you need an ancestor-only record.</div>'
      : "";

    openModal("Linebreeding Coefficient", `<div class="hh-bi-linebreeding-filter">
      <label><input type="checkbox" id="bi-linebreeding-include-ancestors" ${includeAncestors ? "checked" : ""}> <span>Include ancestors</span></label>
      <small>Off by default. Active rabbits are shown first; turning this on also includes records marked Ancestor Only.</small>
    </div>
    <div class="hh-bi-pair-selectors">
      <label>Buck<select id="bi-linebreeding-buck">${selectOptions(bucks, buck?.id)}</select></label>
      <label>Doe<select id="bi-linebreeding-doe">${selectOptions(does, doe?.id)}</select></label>
      <button type="button" class="primary" id="bi-run-pedigree-compare" ${!bucks.length || !does.length ? "disabled" : ""}>Calculate Linebreeding Coefficient</button>
    </div>${availability}${results}`);

    modal.querySelector("#bi-linebreeding-include-ancestors")?.addEventListener("change", (event) => {
      const buckId = modal.querySelector("#bi-linebreeding-buck")?.value || "";
      const doeId = modal.querySelector("#bi-linebreeding-doe")?.value || "";
      renderRelationshipComparison(buckId, doeId, event.currentTarget.checked === true);
    });

    modal.querySelector("#bi-run-pedigree-compare")?.addEventListener("click", () => {
      const buckId = modal.querySelector("#bi-linebreeding-buck")?.value || "";
      const doeId = modal.querySelector("#bi-linebreeding-doe")?.value || "";
      const selectedBuck = bucks.find((animal) => String(animal.id) === String(buckId)) || null;
      const selectedDoe = does.find((animal) => String(animal.id) === String(doeId)) || null;
      if (!selectedBuck || !selectedDoe || !sexIs(selectedBuck, "male") || !sexIs(selectedDoe, "female")) {
        const empty = modal.querySelector(".hh-bi-empty");
        if (empty) empty.textContent = "Select one buck and one doe before calculating the linebreeding coefficient.";
        return;
      }
      renderRelationshipComparison(selectedBuck.id, selectedDoe.id, includeAncestors);
    });

    modal.addEventListener("herdharbor:relationship-ancestor-selected", (event) => {
      const status = modal.querySelector("#bi-shared-selection-status");
      if (!status) return;
      const count = Number(event.detail?.selectedCount || 0);
      status.textContent = count
        ? `Highlighted ${count} recorded appearance${count === 1 ? "" : "s"} of the selected shared ancestor across both pedigrees.`
        : "No recorded appearance was found for that shared ancestor.";
    });
  }

  function modifierRows(analysis){return Object.entries(analysis.modifierCrosses||{}).map(([locus,cross])=>`<details class="hh-bi-trait-result"><summary><strong>${esc(locus)} · ${esc(cross.name)}</strong><span>${cross.exact?"Calculated":"Unknown alleles"}</span></summary>${cross.exact?cross.outcomes.map(row=>`<div class="hh-bi-result-row"><div><strong>${esc(row.expression.label)}</strong><span>${esc(row.alleles.join("/"))}</span></div><b>${(row.probability*100).toFixed((row.probability*100)%1?1:0)}%</b></div>`).join(""):'<p class="hh-bi-note">Add both parental genotypes to calculate percentages. Unknown alleles were not guessed.</p>'}</details>`).join("");}
  function plannerPedigreeMetrics(analysis) {
    if (!analysis) return "";
    const coverageA = percentage(analysis.pedigreeCompleteness?.animalA?.coverage);
    const coverageB = percentage(analysis.pedigreeCompleteness?.animalB?.coverage);
    return `<div class="hh-bi-planner-metrics">
      <div><span>Relationship coefficient</span><strong>${percentage(analysis.relationshipCoefficient)}</strong></div>
      <div><span>Projected offspring Pedigree COI</span><strong>${percentage(analysis.projectedOffspringPedigreeCoi)}</strong></div>
      <div><span>Shared ancestors</span><strong>${analysis.sharedAncestorCount}</strong></div>
      <div><span>Pedigree completeness</span><strong>${coverageA} / ${coverageB}</strong></div>
      <div><span>Generations analyzed</span><strong>${analysis.ancestorGenerationsAnalyzed}</strong></div>
    </div>`;
  }

  function renderPairModal(buckId, doeId) {
    lastAnalysis=null; lastPair=null;
    const state=readState(), rabbits=rabbitAnimals(state), bucks=rabbits.filter((a)=>sexIs(a,"male")), does=rabbits.filter((a)=>sexIs(a,"female")), buck=bucks.find((a)=>String(a.id)===String(buckId))||bucks[0], doe=does.find((a)=>String(a.id)===String(doeId))||does[0];
    let analysisHtml='<div class="hh-bi-empty">Choose a buck and doe, then run Analyze Pairing.</div>';
    if (buck && doe && buckId && doeId) {
      const geneticsAnalysis=Core.analyzePairing(buck,doe,state);
      const pedigreeAnalysis=relationshipAnalysis(buck,doe,state,4);
      lastAnalysis=geneticsAnalysis; lastPair={buckId:buck.id,doeId:doe.id};

      const previous=geneticsAnalysis.previousOffspring.length
        ? geneticsAnalysis.previousOffspring.map((r)=>`${esc(r.color)} × ${r.count}`).join(" · ")
        : "No recorded offspring colors for this pairing yet.";
      const health=(geneticsAnalysis.healthNotices||[]).length
        ? `<div class="hh-bi-warning"><h3>Breeding health notices</h3><ul>${geneticsAnalysis.healthNotices.map(n=>`<li><strong>${esc(n.locus)} · ${n.probability==null?"Possible":`${(n.probability*100).toFixed(0)}%`}</strong> — ${esc(n.message)}</li>`).join("")}</ul><p>Informational only; consult a rabbit-savvy veterinarian for health decisions.</p></div>`
        : "";

      const geneticsSection=`<section class="hh-bi-planner-section" data-bi-planner-section="genetics">
        <header class="hh-bi-planner-section-header"><div><span class="hh-bi-kicker">GENETICS</span><h3>What could this pairing produce?</h3></div><span class="hh-bi-confidence ${geneticsAnalysis.exact?"exact":"conditional"}">${geneticsAnalysis.exact?"Complete A/B/C/D/E":`${geneticsAnalysis.incompleteLoci.length} unknown locus entries`}</span></header>
        <div class="hh-bi-results">${resultRows(geneticsAnalysis)||'<p>No supported core-color outcome could be resolved from the current records.</p>'}</div>
        ${geneticsAnalysis.modifierCrosses?`<div class="hh-bi-evidence-panel"><h3>Pattern, coat & conformation traits</h3><p class="hh-bi-note">Each tracked locus is calculated independently. Registry recognition is not implied.</p>${modifierRows(geneticsAnalysis)}</div>`:""}
        ${health}
        <div class="hh-bi-explain"><h3>How the genetics result was calculated</h3><p>${esc(geneticsAnalysis.explanation)}</p><p>${esc(geneticsAnalysis.disclaimer)}</p></div>
      </section>`;

      const pedigreeSection=`<section class="hh-bi-planner-section" data-bi-planner-section="pedigree">
        <header class="hh-bi-planner-section-header"><div><span class="hh-bi-kicker">PEDIGREE</span><h3>How closely related are these animals?</h3></div></header>
        ${plannerPedigreeMetrics(pedigreeAnalysis)}
        <p class="hh-bi-note">Relationship coefficient and projected offspring Pedigree COI are different values. This analysis uses recorded pedigree parentage and is not genomic COI.</p>
        <div class="hh-bi-two-col">
          <div><h4>${esc(buck.name||"Buck")} pedigree coverage</h4><p>${percentage(pedigreeAnalysis.pedigreeCompleteness.animalA.coverage)} · ${pedigreeAnalysis.pedigreeCompleteness.animalA.knownAncestorSlots}/${pedigreeAnalysis.pedigreeCompleteness.animalA.expectedAncestorSlots} recorded ancestor slots</p></div>
          <div><h4>${esc(doe.name||"Doe")} pedigree coverage</h4><p>${percentage(pedigreeAnalysis.pedigreeCompleteness.animalB.coverage)} · ${pedigreeAnalysis.pedigreeCompleteness.animalB.knownAncestorSlots}/${pedigreeAnalysis.pedigreeCompleteness.animalB.expectedAncestorSlots} recorded ancestor slots</p></div>
        </div>
        <div class="hh-bi-pedigree-actions"><button type="button" class="primary" id="bi-view-linebreeding">View Linebreeding Analysis</button></div>
      </section>`;

      analysisHtml=`${geneticsSection}${pedigreeSection}<section class="hh-bi-planner-section" data-bi-planner-section="history">
        <div class="hh-bi-two-col"><div><h3>Previous offspring</h3><p>${previous}</p></div><div><h3>Recorded performance</h3><p><strong>${esc(buck.name||"Buck")}:</strong> ${esc(performanceSummary(state,buck))}</p><p><strong>${esc(doe.name||"Doe")}:</strong> ${esc(performanceSummary(state,doe))}</p></div></div>
      </section>
      <div class="hh-bi-modal-actions"><button type="button" class="primary" id="bi-save-analysis">Save Prediction Snapshot</button></div><p class="hh-bi-save-confirmation" id="bi-save-confirmation" role="status" aria-live="polite" hidden></p>`;
    }

    const generatedAnalysis=lastAnalysis, generatedPair=lastPair;
    openModal("Breeding Planner", `<div class="hh-bi-pair-selectors"><label>Buck<select id="bi-pair-buck">${selectOptions(bucks,buck?.id)}</select></label><label>Doe<select id="bi-pair-doe">${selectOptions(does,doe?.id)}</select></label><button type="button" class="primary" id="bi-run-analysis">Analyze Pairing</button></div>${analysisHtml}`);
    lastAnalysis=generatedAnalysis; lastPair=generatedPair;

    modal.querySelector("#bi-run-analysis")?.addEventListener("click",()=>renderPairModal(modal.querySelector("#bi-pair-buck").value,modal.querySelector("#bi-pair-doe").value));
    modal.querySelector("#bi-view-linebreeding")?.addEventListener("click",()=>renderRelationshipComparison(buck?.id||"",doe?.id||""));
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
    openModal("Saved Prediction Snapshot",`<div class="hh-bi-profile-summary"><strong>${esc(parents.buckName)} × ${esc(parents.doeName)}</strong><span>Saved ${esc(new Date(snapshot.createdAt).toLocaleString())}</span><span>This view uses only the saved snapshot. It does not recalculate from current animal records.</span></div><div class="hh-bi-analysis-header"><div><span class="hh-bi-kicker">Predicted Offspring</span><h3>${analysis.exact?"Exact saved probabilities":"Saved probability ranges"}</h3></div><span class="hh-bi-confidence ${analysis.exact?"exact":"conditional"}">${analysis.exact?"Deterministic":"Unknown alleles preserved"}</span></div><div class="hh-bi-results">${savedOutcomeRows(colors)}</div>${viennaHtml}<div class="hh-bi-evidence-panel"><h3>Known Genetics</h3><p><strong>${esc(parents.doeName)}:</strong> ${esc(analysis.parent2?.genotype||"Saved in snapshot metadata")}</p><p><strong>${esc(parents.buckName)}:</strong> ${esc(analysis.parent1?.genotype||"Saved in snapshot metadata")}</p></div><div class="hh-bi-two-col"><div><h3>Possible if carrier / unresolved</h3><div class="hh-bi-results">${savedOutcomeRows(conditional,"No tracked conditional result was saved.")}</div></div><div><h3>Currently excluded</h3>${excluded.length?`<ul>${excluded.map((item)=>`<li><strong>${esc(item.name||"Outcome")} — Excluded.</strong>${item.reason?` ${esc(item.reason)}`:""}</li>`).join("")}</ul>`:"<p>None.</p>"}</div></div><div class="hh-bi-evidence-panel"><h3>Unknown Variables</h3>${unknown.length?`<ul>${unknown.map((item)=>`<li><strong>${esc(item.animalName||item.parent||"Parent")} · ${esc(item.locus||"Unknown locus")}</strong> — ${esc((item.options||item.alleles||[]).join(", ")||"Unresolved")}</li>`).join("")}</ul>`:"<p>All tracked loci were resolved.</p>"}</div><div class="hh-bi-explain"><h3>How HerdHarbor calculated this</h3><p>${esc(analysis.explanation||"No explanation was saved.")}</p><p>${esc(analysis.disclaimer||"No disclaimer was saved.")}</p></div><div class="hh-bi-modal-actions"><button type="button" data-bi-history-back>Back to Prediction History</button></div>`);
  }

  function renderHistory(){const state=readState(),predictions=(state[ROOT_KEY]?.predictions||[]).slice().reverse();const rows=predictions.length?predictions.map((snapshot)=>{const parents=snapshotParents(snapshot),outcomes=savedColorOutcomes(snapshot.analysis||{}).slice(0,8).map((outcome)=>`${outcome.name||"Outcome"} ${probabilityText(outcome)}`).join(" · ");return `<article class="hh-bi-history-item"><strong>${esc(parents.buckName)} × ${esc(parents.doeName)}</strong><span>${esc(new Date(snapshot.createdAt).toLocaleString())}</span><p>${esc(outcomes||"No supported outcome recorded")}</p><small>Snapshot preserved with its original calculation context; later evidence does not rewrite this result.</small><button type="button" class="primary" data-bi-open-snapshot="${esc(snapshot.id)}">Open saved prediction</button></article>`;}).join(""):'<p>No prediction snapshots have been saved yet.</p>';openModal("Prediction History",`<div class="hh-bi-history">${rows}</div>`);}
  function handleAction(action){if(action==="pair")return renderPairModal("","");if(action==="compare")return renderRelationshipComparison("","");if(action==="profile")return renderProfileModal("");if(action==="learn")return learnFromOffspring();if(action==="history")return renderHistory();}
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
  function boot(){installStorageProtection();ensureStylesheet();installEvents();renderCard();updateVisibleVersion();monitorBreedingView();window.HerdHarborBreedingIntelligence=Object.freeze({version:RELEASE_VERSION,analyzePairing:Core.analyzePairing,analyzeRelationship:(animalA,animalB,state,generations=4)=>relationshipAnalysis(animalA,animalB,state||readState(),generations),readState,savePredictionSnapshot,openPairAnalysis:()=>renderPairModal("",""),openLinebreedingCoefficient:(animalId="")=>renderRelationshipComparison(animalId,""),openRelationshipComparison:(animalId="")=>renderRelationshipComparison(animalId,""),openGeneticProfile:(animalId)=>renderProfileModal(animalId||""),openPredictionHistory:renderHistory,openSavedPrediction:renderSavedSnapshot,refresh:renderCard});}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
