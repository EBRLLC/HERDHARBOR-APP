(() => {
  "use strict";

  const Core = window.HerdHarborBreedingIntelligenceCore;
  const STORAGE_KEY = "herdharbor_pre_alpha_v1";
  const ROOT_KEY = "breedingIntelligence";
  const STATUS_RANK = { unknown: 0, possible: 1, inferred: 2, confirmed: 3 };
  let modal = null;

  if (!Core) {
    console.error("HerdHarbor Breeding Intelligence tools could not start: core module missing.");
    return;
  }

  const esc = (value) => String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  function readState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const state = raw ? JSON.parse(raw) : {};
      if (!Array.isArray(state.animals)) state.animals = [];
      if (!Array.isArray(state.breedings)) state.breedings = [];
      if (!Array.isArray(state.births)) state.births = [];
      if (!state[ROOT_KEY] || typeof state[ROOT_KEY] !== "object") {
        state[ROOT_KEY] = { version: 1, predictions: [], conflicts: [], updatedAt: null };
      }
      if (!Array.isArray(state[ROOT_KEY].predictions)) state[ROOT_KEY].predictions = [];
      return state;
    } catch (error) {
      console.error("Breeding Intelligence tools could not read farm state:", error);
      return { animals: [], breedings: [], births: [], [ROOT_KEY]: { version: 1, predictions: [], conflicts: [] } };
    }
  }

  async function writeState(state) {
    state[ROOT_KEY] = Object.assign({ version: 1, predictions: [], conflicts: [] }, state[ROOT_KEY], {
      updatedAt: new Date().toISOString()
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    try {
      if (window.HerdHarborCloud?.syncNow) await window.HerdHarborCloud.syncNow();
    } catch (error) {
      console.warn("Breeding Intelligence changes are saved locally and can sync again normally.", error);
    }
    window.HerdHarborBreedingIntelligence?.refresh?.();
  }

  function rabbits(state) {
    return state.animals.filter((animal) => Core.canonicalSpecies(animal.species) === "Rabbit");
  }

  function animalLabel(animal) {
    const name = animal.name || animal.tag || animal.earTagNumber || animal.id || "Unnamed rabbit";
    const color = animal.color || animal.variety || "";
    return color ? `${name} — ${color}` : name;
  }

  function options(animals, selectedId) {
    return ['<option value="">Select a rabbit…</option>']
      .concat(animals.map((animal) => `<option value="${esc(animal.id)}" ${String(animal.id) === String(selectedId || "") ? "selected" : ""}>${esc(animalLabel(animal))}</option>`))
      .join("");
  }

  function closeModal() {
    if (modal) modal.remove();
    modal = null;
  }

  function openModal(title, html) {
    closeModal();
    modal = document.createElement("div");
    modal.className = "hh-bi-modal-backdrop";
    modal.innerHTML = `<section class="hh-bi-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header><div><span class="hh-bi-kicker">HerdHarbor Breeding Intelligence</span><h2>${esc(title)}</h2></div><button type="button" class="hh-bi-close" data-bi-tools-close aria-label="Close">×</button></header>
      <div class="hh-bi-modal-body">${html}</div>
    </section>`;
    const target = document.body || document.documentElement || document.head;
    if (!target) { modal = null; return; }
    target.appendChild(modal);
    modal.querySelector("[data-bi-tools-close]")?.focus();
  }

  function addButtons() {
    const card = document.querySelector("#hh-breeding-intelligence");
    const actions = card?.querySelector(".hh-bi-actions");
    if (!actions || actions.querySelector("[data-bi-tools-action]")) return;
    [
      ["tests", "Genetic tests"],
      ["outcomes", "Predicted vs actual"],
      ["exchange", "Genetics data"]
    ].forEach(([action, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.biToolsAction = action;
      button.textContent = label;
      actions.appendChild(button);
    });
  }

  function renderTests(selectedId) {
    const state = readState();
    const list = rabbits(state);
    const animal = list.find((a) => String(a.id) === String(selectedId)) || list[0];
    if (!animal) {
      openModal("Genetic Test Records", "<p>Add a rabbit before recording genetic test results.</p>");
      return;
    }
    const genetics = Core.normalizeGenetics(animal.genetics);
    const tests = genetics.tests || [];
    const rows = tests.length ? tests.map((test) => `<article class="hh-bi-history-item">
      <strong>${esc(test.testName || "Genetic test")}</strong>
      <span>${esc(test.laboratory || "Lab not recorded")}${test.testDate ? ` · ${esc(test.testDate)}` : ""}${test.locus ? ` · ${esc(test.locus)} locus` : ""}</span>
      <p><strong>Result:</strong> ${esc(test.result || "—")}</p>
      ${test.reference ? `<small>Reference: ${esc(test.reference)}</small>` : ""}
      ${test.notes ? `<small>${esc(test.notes)}</small>` : ""}
      <button type="button" data-delete-genetic-test="${esc(test.id)}">Remove</button>
    </article>`).join("") : "<p>No genetic test results have been recorded for this rabbit.</p>";

    openModal("Genetic Test Records", `
      <div class="hh-bi-form-row"><label>Rabbit<select id="bi-test-animal">${options(list, animal.id)}</select></label></div>
      <div class="hh-bi-two-col">
        <div class="panel-like">
          <h3>Add test result</h3>
          <div class="hh-bi-loci">
            <label>Test name<input id="bi-test-name" type="text" placeholder="Example: Coat color panel"></label>
            <label>Laboratory<input id="bi-test-lab" type="text" placeholder="Laboratory name"></label>
            <label>Test date<input id="bi-test-date" type="date"></label>
            <label>Gene / locus<select id="bi-test-locus"><option value="">Other / not mapped</option>${Object.keys(Core.RABBIT_LOCI).map((l) => `<option>${l}</option>`).join("")}</select></label>
            <label>Result<input id="bi-test-result" type="text" placeholder="Record the laboratory result exactly"></label>
            <label>Source document / reference<input id="bi-test-reference" type="text" placeholder="Report number, file name, URL, etc."></label>
            <label>Notes<input id="bi-test-notes" type="text" placeholder="Optional notes"></label>
          </div>
          <p class="hh-bi-note">A test record is treated as high-quality evidence, but HerdHarbor does not automatically translate free-text laboratory results into alleles. Enter confirmed alleles in the rabbit’s Genetic Profile after reviewing the report.</p>
          <div class="hh-bi-modal-actions"><button type="button" class="primary" id="bi-add-test">Save test record</button></div>
        </div>
        <div><h3>Recorded tests</h3><div class="hh-bi-history">${rows}</div></div>
      </div>
    `);

    modal.querySelector("#bi-test-animal")?.addEventListener("change", (event) => renderTests(event.target.value));
    modal.querySelector("#bi-add-test")?.addEventListener("click", async () => {
      const testName = modal.querySelector("#bi-test-name").value.trim();
      const result = modal.querySelector("#bi-test-result").value.trim();
      if (!testName || !result) {
        window.alert("Enter a test name and result.");
        return;
      }
      const fresh = readState();
      const target = fresh.animals.find((a) => String(a.id) === String(animal.id));
      if (!target) return;
      const next = Core.normalizeGenetics(target.genetics);
      next.tests.push({
        id: `genetic_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        testName,
        laboratory: modal.querySelector("#bi-test-lab").value.trim(),
        testDate: modal.querySelector("#bi-test-date").value,
        locus: modal.querySelector("#bi-test-locus").value,
        result,
        reference: modal.querySelector("#bi-test-reference").value.trim(),
        notes: modal.querySelector("#bi-test-notes").value.trim(),
        evidenceStatus: "confirmed",
        source: "genetic-test",
        createdAt: new Date().toISOString()
      });
      next.updatedAt = new Date().toISOString();
      target.genetics = next;
      await writeState(fresh);
      renderTests(animal.id);
    });
    modal.querySelectorAll("[data-delete-genetic-test]").forEach((button) => button.addEventListener("click", async () => {
      const fresh = readState();
      const target = fresh.animals.find((a) => String(a.id) === String(animal.id));
      if (!target) return;
      const next = Core.normalizeGenetics(target.genetics);
      next.tests = next.tests.filter((test) => String(test.id) !== String(button.dataset.deleteGeneticTest));
      target.genetics = next;
      await writeState(fresh);
      renderTests(animal.id);
    }));
  }

  function predictionLabel(snapshot, byId) {
    const buck = byId.get(String(snapshot.metadata?.buckId || ""));
    const doe = byId.get(String(snapshot.metadata?.doeId || ""));
    const when = snapshot.createdAt ? new Date(snapshot.createdAt).toLocaleDateString() : "Saved analysis";
    return `${snapshot.metadata?.buckName || snapshot.analysis?.parent1?.name || buck?.name || "Buck"} × ${snapshot.metadata?.doeName || snapshot.analysis?.parent2?.name || doe?.name || "Doe"} — ${when}`;
  }

  function savedProbabilityDetail(outcome) {
    if (outcome?.probability != null) {
      const value = Number(outcome.probability) * 100;
      return `${value.toFixed(value % 1 ? 1 : 0)}%`;
    }
    if (outcome?.minProbability != null && outcome?.maxProbability != null) {
      const min = Number(outcome.minProbability) * 100;
      const max = Number(outcome.maxProbability) * 100;
      const format = (value) => `${value.toFixed(value % 1 ? 1 : 0)}%`;
      return Math.abs(min - max) < 1e-9 ? format(min) : `${format(min)}–${format(max)}`;
    }
    return "Possible";
  }

  function renderOutcomeReview(snapshotId) {
    const state = readState();
    const predictions = state[ROOT_KEY]?.predictions || [];
    const byId = new Map(state.animals.map((a) => [String(a.id), a]));
    const snapshot = predictions.find((p) => String(p.id) === String(snapshotId)) || predictions[predictions.length - 1];
    if (!snapshot) {
      openModal("Predicted vs Actual", "<p>Save a Pair Analysis prediction first. HerdHarbor preserves that snapshot so it can later be compared with the recorded litter.</p>");
      return;
    }
    const buckId = snapshot.metadata?.buckId;
    const doeId = snapshot.metadata?.doeId;
    const buck = byId.get(String(buckId || ""));
    const doe = byId.get(String(doeId || ""));
    const offspring = buck && doe ? Core.previousOffspring(buck, doe, state.animals, state.births) : [];
    const actual = new Map();
    offspring.forEach((child) => {
      const color = String(child.color || child.variety || "Unrecorded").trim() || "Unrecorded";
      actual.set(color, (actual.get(color) || 0) + 1);
    });
    const analysis = snapshot.analysis || {};
    const savedOutcomes = Array.isArray(analysis.possibleOffspringColors) && analysis.possibleOffspringColors.length
      ? analysis.possibleOffspringColors
      : analysis.exact
        ? (analysis.exactOutcomes || [])
        : (analysis.possibleOutcomes || []);
    const predicted = savedOutcomes.map((o) => ({ name: o.name, detail: savedProbabilityDetail(o) }));
    const predictedNames = new Set(predicted.map((p) => p.name.toLowerCase()));
    const predictedHtml = predicted.length ? predicted.map((p) => `<div class="hh-bi-result-row"><div><strong>${esc(p.name)}</strong><span>Saved prediction</span></div><b>${esc(p.detail)}</b></div>`).join("") : "<p>No supported predicted color was saved.</p>";
    const actualHtml = actual.size ? Array.from(actual.entries()).map(([color, count]) => {
      const directMatch = predictedNames.has(color.toLowerCase());
      return `<div class="hh-bi-result-row"><div><strong>${esc(color)}</strong><span>${directMatch ? "Directly matches a saved supported outcome" : "Not a direct name match — review modifiers, incomplete genetics, or color identification"}</span></div><b>× ${count}</b></div>`;
    }).join("") : "<p>No individually recorded offspring colors are linked to this pairing yet.</p>";

    openModal("Predicted vs Actual", `
      <div class="hh-bi-form-row"><label>Saved prediction<select id="bi-outcome-snapshot">${predictions.slice().reverse().map((p) => `<option value="${esc(p.id)}" ${p.id === snapshot.id ? "selected" : ""}>${esc(predictionLabel(p, byId))}</option>`).join("")}</select></label></div>
      <div class="hh-bi-profile-summary"><strong>${esc(predictionLabel(snapshot, byId))}</strong><span>Engine v${esc(snapshot.engineVersion || "1")}</span><span>The saved prediction is immutable; this comparison never rewrites the original analysis.</span></div>
      <div class="hh-bi-two-col"><div><h3>Predicted</h3><div class="hh-bi-results">${predictedHtml}</div></div><div><h3>Actual recorded offspring</h3><div class="hh-bi-results">${actualHtml}</div></div></div>
      <p class="hh-bi-note">A non-match does not automatically mean the breeding engine was wrong. Rabbit phenotype can depend on modifier genes outside the supported core model, incomplete/incorrect ancestry records, or a color being recorded under a different variety name.</p>
    `);
    modal.querySelector("#bi-outcome-snapshot")?.addEventListener("change", (event) => renderOutcomeReview(event.target.value));
  }

  function workbookCell(row, index) {
    const value = row.getCell(index).value;
    if (value && typeof value === "object" && "text" in value) return String(value.text || "");
    return value == null ? "" : String(value);
  }

  async function exportGeneticsWorkbook() {
    if (!window.ExcelJS) {
      window.alert("Spreadsheet support is not available on this device yet.");
      return;
    }
    const state = readState();
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "HerdHarbor";
    workbook.created = new Date();
    const geneticsSheet = workbook.addWorksheet("Genetics");
    geneticsSheet.addRow(["Animal ID", "Animal Name", "Species", "Color / Variety", "Locus", "Allele 1", "Allele 2", "Status", "Source", "Evidence / Note"]);
    const testsSheet = workbook.addWorksheet("Genetic Tests");
    testsSheet.addRow(["Animal ID", "Animal Name", "Test ID", "Test Name", "Laboratory", "Test Date", "Locus", "Result", "Reference", "Notes"]);
    rabbits(state).forEach((animal) => {
      const genetics = Core.normalizeGenetics(animal.genetics);
      Object.keys(Core.RABBIT_LOCI).forEach((locus) => {
        const record = genetics.loci[locus];
        geneticsSheet.addRow([animal.id, animal.name || "", animal.species || "Rabbit", animal.color || animal.variety || "", locus, record.alleles[0], record.alleles[1], record.status, record.source, record.note]);
      });
      genetics.tests.forEach((test) => testsSheet.addRow([animal.id, animal.name || "", test.id || "", test.testName || "", test.laboratory || "", test.testDate || "", test.locus || "", test.result || "", test.reference || "", test.notes || ""]));
    });
    [geneticsSheet, testsSheet].forEach((sheet) => {
      sheet.getRow(1).font = { bold: true };
      sheet.columns.forEach((column) => { column.width = Math.min(34, Math.max(12, ...column.values.slice(1).map((v) => String(v || "").length + 2))); });
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
    });
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `HerdHarbor-Genetics-${new Date().toISOString().slice(0, 10)}.xlsx`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function headerIndex(sheet) {
    const map = new Map();
    sheet.getRow(1).eachCell((cell, index) => map.set(String(cell.value || "").trim().toLowerCase(), index));
    return map;
  }

  async function importGeneticsWorkbook(file) {
    if (!window.ExcelJS || !file) return;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const state = readState();
    const byId = new Map(state.animals.map((animal) => [String(animal.id), animal]));
    let importedLoci = 0, importedTests = 0, skipped = 0, conflicts = 0;
    const geneticsSheet = workbook.getWorksheet("Genetics");
    if (geneticsSheet) {
      const h = headerIndex(geneticsSheet);
      const col = (name) => h.get(name.toLowerCase());
      geneticsSheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const animal = byId.get(workbookCell(row, col("Animal ID")));
        const locus = workbookCell(row, col("Locus")).trim();
        const allele1 = workbookCell(row, col("Allele 1")).trim() || "_";
        const allele2 = workbookCell(row, col("Allele 2")).trim() || "_";
        const statusRaw = workbookCell(row, col("Status")).trim().toLowerCase();
        const status = STATUS_RANK[statusRaw] == null ? "unknown" : statusRaw;
        if (!animal || Core.canonicalSpecies(animal.species) !== "Rabbit" || !Core.RABBIT_LOCI[locus]) { skipped += 1; return; }
        const genetics = Core.normalizeGenetics(animal.genetics);
        const existing = genetics.loci[locus];
        const normalizedIncoming = Core.normalizeGenetics({ loci: { [locus]: { alleles: [allele1, allele2], status } } }).loci[locus].alleles;
        const existingKnown = existing.alleles.every((a) => a !== "_");
        const incomingKnown = normalizedIncoming.every((a) => a !== "_");
        const differs = existing.alleles.join("/") !== normalizedIncoming.join("/");
        if (existing.status === "confirmed" && differs && incomingKnown) {
          genetics.conflicts.push({ locus, existing: existing.alleles.slice(), incoming: normalizedIncoming.slice(), source: "spreadsheet-import", createdAt: new Date().toISOString() });
          animal.genetics = genetics;
          conflicts += 1;
          return;
        }
        if ((STATUS_RANK[status] || 0) < (STATUS_RANK[existing.status] || 0) && existingKnown) { skipped += 1; return; }
        if (incomingKnown || !existingKnown) existing.alleles = normalizedIncoming;
        existing.status = status;
        existing.source = workbookCell(row, col("Source")).trim() || "spreadsheet-import";
        existing.note = workbookCell(row, col("Evidence / Note")).trim();
        genetics.updatedAt = new Date().toISOString();
        animal.genetics = genetics;
        importedLoci += 1;
      });
    }
    const testsSheet = workbook.getWorksheet("Genetic Tests");
    if (testsSheet) {
      const h = headerIndex(testsSheet);
      const col = (name) => h.get(name.toLowerCase());
      testsSheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const animal = byId.get(workbookCell(row, col("Animal ID")));
        if (!animal || Core.canonicalSpecies(animal.species) !== "Rabbit") { skipped += 1; return; }
        const genetics = Core.normalizeGenetics(animal.genetics);
        const test = {
          id: workbookCell(row, col("Test ID")).trim() || `genetic_test_import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          testName: workbookCell(row, col("Test Name")).trim(),
          laboratory: workbookCell(row, col("Laboratory")).trim(),
          testDate: workbookCell(row, col("Test Date")).trim(),
          locus: workbookCell(row, col("Locus")).trim(),
          result: workbookCell(row, col("Result")).trim(),
          reference: workbookCell(row, col("Reference")).trim(),
          notes: workbookCell(row, col("Notes")).trim(),
          evidenceStatus: "confirmed",
          source: "genetic-test",
          createdAt: new Date().toISOString()
        };
        if (!test.testName || !test.result) { skipped += 1; return; }
        const duplicate = genetics.tests.some((existing) => String(existing.id) === String(test.id) || (existing.testName === test.testName && existing.testDate === test.testDate && existing.result === test.result));
        if (!duplicate) { genetics.tests.push(test); importedTests += 1; }
        animal.genetics = genetics;
      });
    }
    await writeState(state);
    openModal("Genetics Import Complete", `<div class="hh-bi-profile-summary"><strong>${importedLoci} locus record(s) imported</strong><span>${importedTests} genetic test record(s) imported</span><span>${skipped} row(s) skipped or lower confidence</span><span>${conflicts} confirmed-data conflict(s) retained for breeder review</span></div><p class="hh-bi-note">Imported lower-confidence information never silently replaces a conflicting confirmed genotype.</p>`);
  }

  function renderExchange() {
    openModal("Genetics Data Exchange", `
      <div class="hh-bi-profile-summary"><strong>Excel round-trip for Breeding Intelligence</strong><span>Exports rabbit A/B/C/D/E profiles and genetic test records.</span><span>Imports are additive and confidence-aware.</span></div>
      <div class="hh-bi-two-col">
        <div><h3>Export</h3><p>Download a workbook with <strong>Genetics</strong> and <strong>Genetic Tests</strong> sheets.</p><button type="button" class="primary" id="bi-export-genetics">Download genetics workbook</button></div>
        <div><h3>Import</h3><p>Use a HerdHarbor genetics workbook. Animals are matched by stable Animal ID.</p><input type="file" id="bi-import-genetics" accept=".xlsx,.xlsm"><button type="button" class="primary" id="bi-run-import">Review and import</button></div>
      </div>
      <p class="hh-bi-note">Confirmed genotype conflicts are not overwritten. They are preserved as conflicts for breeder review. This genetics workbook complements the existing full HerdHarbor farm import/export system.</p>
    `);
    modal.querySelector("#bi-export-genetics")?.addEventListener("click", exportGeneticsWorkbook);
    modal.querySelector("#bi-run-import")?.addEventListener("click", async () => {
      const file = modal.querySelector("#bi-import-genetics")?.files?.[0];
      if (!file) { window.alert("Choose a HerdHarbor genetics workbook first."); return; }
      try { await importGeneticsWorkbook(file); }
      catch (error) { console.error(error); window.alert(`Could not import the genetics workbook: ${error.message || error}`); }
    });
  }

  function handleAction(action) {
    if (action === "tests") renderTests("");
    if (action === "outcomes") renderOutcomeReview("");
    if (action === "exchange") renderExchange();
  }

  document.addEventListener("click", (event) => {
    const action = event.target.closest("[data-bi-tools-action]")?.dataset.biToolsAction;
    if (action) handleAction(action);
    if (event.target.closest("[data-bi-tools-close]") || event.target === modal) closeModal();
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && modal) closeModal(); });

  const observer = new MutationObserver(addButtons);
  function boot() {
    addButtons();
    const target = document.body;
    if (!target) {
      if (!window.__hhBreedingToolsDomWait) {
        window.__hhBreedingToolsDomWait = true;
        document.addEventListener("DOMContentLoaded", () => { window.__hhBreedingToolsDomWait = false; boot(); }, { once: true });
      }
      return;
    }
    observer.observe(target, { childList: true, subtree: true });
    window.HerdHarborBreedingIntelligenceTools = Object.freeze({
      version: "1.6.1",
      openGeneticTests: () => renderTests(""),
      openPredictedVsActual: () => renderOutcomeReview(""),
      openDataExchange: renderExchange,
      exportGeneticsWorkbook,
      importGeneticsWorkbook
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
