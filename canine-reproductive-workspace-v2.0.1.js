(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborCanineReproductiveWorkspace = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const VERSION = "2.0.1-workspace-1";
  const Core = () => root?.HerdHarborCanineReproductiveCore;
  const clean = value => String(value == null ? "" : value).trim();
  const text = value => clean(value).slice(0, 4000);
  const esc = value => clean(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const accountId = () => clean(root?.HerdHarborCloud?.getSession?.()?.user?.id);
  const dateToday = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  };
  const clone = value => JSON.parse(JSON.stringify(value));

  function currentState() { return root?.HerdHarborApp?.getState?.() || null; }
  function toast(message, type = "info") { root?.HerdHarborApp?.toast?.(message, type); }
  function isDog(animal) { return clean(animal?.species).toLowerCase() === "dog"; }
  function belongsToAccount(record, ownerId) {
    const recordOwner = clean(record?.userId || record?.ownerId || record?.accountId);
    return recordOwner ? Boolean(ownerId) && recordOwner === ownerId : true;
  }
  function femaleDog(state, id, ownerId) { return (state?.animals || []).find(row => row.id === id && isDog(row) && clean(row.sex).toLowerCase() === "female" && belongsToAccount(row, ownerId)) || null; }

  function openForAnimal(animalId) {
    const state = currentState();
    const sessionOwner = accountId();
    const dam = femaleDog(state, animalId, sessionOwner);
    if (!dam) { toast("Open a recorded female Dog to manage canine reproduction.", "error"); return false; }
    if (!root?.document?.body) return false;
    active = { animalId: dam.id, sessionOwner, tab: "cycles", selectedCycle: "", selectedPlan: "", openState: clone(state) };
    render();
    return true;
  }

  let active = null;
  function close() {
    root?.document?.getElementById("hh-canine-repro-workspace")?.remove();
    active = null;
  }

  function currentDam(state) { return femaleDog(state, active?.animalId, active?.sessionOwner); }
  function cycles(state, damId = active?.animalId) {
    return (Array.isArray(state?.canineReproductiveCycles) ? state.canineReproductiveCycles : []).filter(row => row.femaleId === damId).sort((a,b) => String(b.observedHeatStartDate).localeCompare(String(a.observedHeatStartDate)));
  }
  function plans(state, damId = active?.animalId) {
    return (Array.isArray(state?.canineBreedingPlans) ? state.canineBreedingPlans : []).filter(row => row.damId === damId).sort((a,b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
  }
  function sireLabel(state, ref) {
    if (!ref) return "Unknown / unresolved";
    if (ref.type === "owned_dog") return state.animals?.find(row => row.id === ref.id)?.name || "Missing dog";
    if (ref.type === "external_stud") return state.canineExternalStuds?.find(row => row.id === ref.id)?.registeredName || state.canineExternalStuds?.find(row => row.id === ref.id)?.displayName || "External stud";
    return "Unknown / unresolved";
  }
  function htmlOptions(rows, selected, label) {
    return rows.map(row => `<option value="${esc(row.value)}" ${row.value === selected ? "selected" : ""}>${esc(row.label)}</option>`).join("");
  }
  function sireChoices(state, selected = "") {
    const owned = (state.animals || []).filter(row => isDog(row) && clean(row.sex).toLowerCase() === "male" && belongsToAccount(row, active.sessionOwner))
      .map(row => ({ value: `owned_dog:${row.id}`, label: `${row.name || "Unnamed dog"} · ${row.breed || "Breed not entered"}` }));
    const external = (state.canineExternalStuds || []).filter(row => row.accountId === active.sessionOwner && row.ownerScope === "external_reference")
      .map(row => ({ value: `external_stud:${row.id}`, label: `${row.registeredName || row.displayName} · External stud` }));
    return `<option value="unknown" ${selected === "unknown" ? "selected" : ""}>Unknown / unresolved</option>${htmlOptions([...owned,...external], selected, "")}`;
  }
  function parseSireRef(value) {
    const [type, ...rest] = clean(value).split(":");
    return type === "owned_dog" || type === "external_stud" ? { type, id: rest.join(":") } : { type: "unknown" };
  }

  function reproductiveSnapshot(state, damId, ownerId) {
    const cycleRows = Array.isArray(state?.canineReproductiveCycles) ? state.canineReproductiveCycles : [];
    const planRows = Array.isArray(state?.canineBreedingPlans) ? state.canineBreedingPlans : [];
    const studRows = Array.isArray(state?.canineExternalStuds) ? state.canineExternalStuds : [];
    const taskRows = Array.isArray(state?.tasks) ? state.tasks : [];
    return JSON.stringify({
      cycles: cycleRows.filter(row => row.femaleId === damId),
      plans: planRows.filter(row => row.damId === damId),
      externalStuds: studRows.filter(row => row.accountId === ownerId && row.ownerScope === "external_reference"),
      tasks: taskRows.filter(row => row.sourceType === "canine_breeding_plan" &&
        planRows.some(plan => plan.damId === damId && plan.id === row.sourceRecordId))
    });
  }

  function render() {
    if (!active) return;
    const state = currentState();
    const dam = currentDam(state);
    if (!state || !dam || (active.sessionOwner && accountId() !== active.sessionOwner)) { close(); return; }
    let overlay = root.document.getElementById("hh-canine-repro-workspace");
    if (!overlay) {
      overlay = root.document.createElement("div");
      overlay.id = "hh-canine-repro-workspace";
      overlay.className = "hh-canine-repro-overlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      root.document.body.appendChild(overlay);
    }
    overlay.innerHTML = `<section class="hh-canine-repro-panel" aria-labelledby="hh-canine-repro-title">
      <header><div><p class="eyebrow">Canine reproduction</p><h2 id="hh-canine-repro-title">${esc(dam.name)} · ${active.tab === "cycles" ? "Heat cycles" : "Breeding plans"}</h2><p class="muted">Breeder records and veterinarian-entered information. Dates are estimates unless identified as veterinarian-provided.</p></div><button type="button" class="button button-ghost" data-close aria-label="Close">Close</button></header>
      <nav class="hh-canine-repro-tabs"><button type="button" data-tab="cycles" class="${active.tab === "cycles" ? "active" : ""}">Heat cycles</button><button type="button" data-tab="plans" class="${active.tab === "plans" ? "active" : ""}">Breeding plans</button><button type="button" data-open-whelping>Whelpings & puppies</button></nav>
      <main>${active.tab === "cycles" ? renderCycles(state, dam) : renderPlans(state, dam)}</main>
      <footer><span class="muted">Saved to this device first. Cloud synchronization may still be pending.</span></footer>
    </section>`;
    bind(overlay);
  }

  function renderCycles(state, dam) {
    const list = cycles(state);
    const selected = list.find(row => row.id === active.selectedCycle);
    return `<div class="hh-canine-repro-grid"><section class="hh-canine-repro-card"><h3>Record a heat cycle</h3><form data-form="cycle">
      <label>Observed heat start date<input type="date" name="observedHeatStartDate" required max="${dateToday()}"></label>
      <label>Observed stage<select name="observedStage"><option value="unknown">Not known</option><option value="proestrus">Proestrus (observed)</option><option value="estrus">Estrus (observed)</option><option value="diestrus">Diestrus (observed)</option><option value="anestrus">Anestrus (observed)</option></select></label>
      <label>Initial observation<textarea name="observation" maxlength="4000"></textarea></label><button type="submit" class="button button-primary">Save cycle</button>
    </form><p class="muted">A new cycle creates a new history record. No stage, ovulation date, or fertile period is inferred from elapsed time.</p></section>
    <section class="hh-canine-repro-card"><h3>Cycle history · ${list.length}</h3>${list.length ? list.map(row => `<button type="button" class="hh-canine-repro-row ${row.id === active.selectedCycle ? "active" : ""}" data-cycle="${esc(row.id)}"><strong>${esc(row.observedHeatStartDate)}</strong><span>${esc(row.observedStage || "unknown")} · ${esc(row.status || "open")}</span></button>`).join("") : `<p class="muted">No cycles recorded.</p>`}</section></div>${selected ? renderCycleDetail(selected) : ""}`;
  }

  function renderCycleDetail(cycle) {
    return `<section class="hh-canine-repro-card"><div class="hh-canine-repro-card-head"><div><h3>Cycle details · ${esc(cycle.observedHeatStartDate)}</h3><p class="muted">Clinical interpretations are kept separate from observations and lab results.</p></div></div>
      <form data-form="cycle-update" data-id="${esc(cycle.id)}" class="hh-canine-repro-inline"><label>Stage<select name="observedStage"><option value="unknown" ${cycle.observedStage === "unknown" ? "selected" : ""}>Not known</option><option value="proestrus" ${cycle.observedStage === "proestrus" ? "selected" : ""}>Proestrus</option><option value="estrus" ${cycle.observedStage === "estrus" ? "selected" : ""}>Estrus</option><option value="diestrus" ${cycle.observedStage === "diestrus" ? "selected" : ""}>Diestrus</option><option value="anestrus" ${cycle.observedStage === "anestrus" ? "selected" : ""}>Anestrus</option></select></label><label>Status<select name="status"><option value="open" ${cycle.status === "open" ? "selected" : ""}>Open</option><option value="closed" ${cycle.status === "closed" ? "selected" : ""}>Closed</option><option value="cancelled" ${cycle.status === "cancelled" ? "selected" : ""}>Cancelled</option></select></label><label>Cycle notes<textarea name="notes" maxlength="12000">${esc(cycle.notes)}</textarea></label><button type="submit" class="button button-primary">Save cycle details</button></form>
      <div class="hh-canine-repro-grid"><form data-form="observation" data-id="${esc(cycle.id)}"><h4>Breeder observation</h4><label>Date<input type="date" name="date" required value="${dateToday()}"></label><label>Time (optional)<input type="time" name="time"></label><label>Observation<textarea name="text" required maxlength="4000"></textarea></label><button type="submit" class="button button-ghost">Add observation</button></form>
      <form data-form="test" data-id="${esc(cycle.id)}"><h4>Progesterone laboratory result</h4><label>Test date<input type="date" name="date" required></label><label>Time<input type="time" name="time"></label><label>Result<input type="number" min="0" step="any" name="value" required></label><label>Units<input name="units" maxlength="80" required placeholder="Use lab units"></label><label>Laboratory<input name="laboratory" maxlength="200" required></label><label>Result note<textarea name="resultNotes" maxlength="2000"></textarea></label><button type="submit" class="button button-ghost">Add result</button><p class="muted">A single result is stored as a lab observation and is not treated as an ovulation diagnosis.</p></form>
      <form data-form="appointment" data-id="${esc(cycle.id)}"><h4>Veterinary appointment</h4><label>Date<input type="date" name="date" required></label><label>Time<input type="time" name="time"></label><label>Veterinarian<input name="veterinarian" maxlength="200"></label><label>Purpose<input name="purpose" maxlength="1000"></label><label>Notes<textarea name="notes" maxlength="4000"></textarea></label><button type="submit" class="button button-ghost">Add appointment</button></form>
      <form data-form="interpretation" data-id="${esc(cycle.id)}"><h4>Veterinary clinical interpretation</h4><label>Date<input type="date" name="date" required></label><label>Time<input type="time" name="time"></label><label>Veterinarian<input name="veterinarian" maxlength="200" required></label><label>Interpretation<textarea name="interpretation" maxlength="4000" required></textarea></label><button type="submit" class="button button-ghost">Add interpretation</button></form>
      <form data-form="ovulation" data-id="${esc(cycle.id)}"><h4>Veterinarian-confirmed ovulation</h4><label>Confirmed date<input type="date" name="date" required value="${esc(cycle.ovulation?.date || "")}"></label><label>Veterinarian<input name="veterinarian" maxlength="200" required value="${esc(cycle.ovulation?.veterinarian || "")}"></label><label>Clinical note<textarea name="note" maxlength="2000">${esc(cycle.ovulation?.note || "")}</textarea></label><button type="submit" class="button button-ghost">Save clinical information</button></form></div>
      <form data-form="cycle-reminder" data-id="${esc(cycle.id)}"><h4>Custom breeder reminder</h4><label>Title<input name="title" maxlength="200" required placeholder="e.g. Call reproductive veterinarian"></label><label>Due date<input type="date" name="date" required></label><label>Notes<textarea name="notes" maxlength="2000"></textarea></label><button type="submit" class="button button-ghost">Add reminder</button></form>
      <div class="hh-canine-repro-history"><h4>Recorded history</h4>${renderCycleHistory(cycle)}</div></section>`;
  }

  function renderCycleHistory(cycle) {
    const rows = [
      ...(cycle.observations || []).map(row => ({ date: row.date, type: "Breeder observation", text: row.text })),
      ...(cycle.progesteroneTests || []).map(row => ({ date: `${row.date}${row.time ? ` ${row.time}` : ""}`, type: "Lab result", text: `${row.value} ${row.units} · ${row.laboratory}${row.resultNotes ? ` · ${row.resultNotes}` : ""}` })),
      ...(cycle.veterinaryAppointments || []).map(row => ({ date: `${row.date}${row.time ? ` ${row.time}` : ""}`, type: "Veterinary appointment", text: `${row.veterinarian || "Veterinarian not entered"} · ${row.purpose || row.notes || "No details"}` })),
      ...(cycle.clinicalInterpretations || []).map(row => ({ date: `${row.date}${row.time ? ` ${row.time}` : ""}`, type: "Veterinary interpretation", text: `${row.veterinarian ? `${row.veterinarian} · ` : ""}${row.interpretation}` })),
      ...(cycle.customReminders || []).map(row => ({ date: row.date, type: "Custom breeder reminder", text: row.title }))
    ].sort((a,b) => String(b.date).localeCompare(String(a.date)));
    return `<ol>${rows.map(row => `<li><strong>${esc(row.date)} · ${esc(row.type)}</strong><span>${esc(row.text)}</span></li>`).join("") || `<li class="muted">No dated entries yet.</li>`}${cycle.ovulation ? `<li><strong>${esc(cycle.ovulation.date)} · Veterinarian-confirmed ovulation</strong><span>${esc(cycle.ovulation.veterinarian)}${cycle.ovulation.note ? ` · ${esc(cycle.ovulation.note)}` : ""}</span></li>` : ""}</ol>`;
  }

  function renderPlans(state, dam) {
    const ownedSires = (state.animals || []).filter(row => isDog(row) && clean(row.sex).toLowerCase() === "male");
    const cycleOptions = cycles(state).map(row => ({ value: row.id, label: `${row.observedHeatStartDate} · ${row.observedStage || "unknown"}` }));
    const list = plans(state);
    return `<div class="hh-canine-repro-grid"><section class="hh-canine-repro-card"><h3>Plan a breeding</h3><form data-form="plan">
      <label>Sire<select name="sireRef"><option value="">Choose a sire or enter an external stud</option>${sireChoices(state)}</select></label>
      <details><summary>Add an external stud reference</summary><label>Stud name<input name="externalDisplayName" maxlength="200"></label><label>Registered name<input name="externalRegisteredName" maxlength="200"></label><label>Breed<input name="externalBreed" maxlength="160"></label><label>Registry<input name="externalRegistry" maxlength="120"></label><label>Registration number<input name="externalRegistrationNumber" maxlength="160"></label><p class="muted">External stud data is stored in this account only; it does not expose or copy another member’s private animal records.</p></details>
      <label>Associated heat cycle<select name="cycleId"><option value="">Not linked</option>${htmlOptions(cycleOptions, "", "")}</select></label>
      <label>Planned dates (comma-separated)<input name="plannedDates" placeholder="YYYY-MM-DD, YYYY-MM-DD"></label>
      <label>Planned method<select name="plannedMethod"><option value="natural_service">Natural service</option><option value="artificial_insemination">Artificial insemination</option><option value="other">Other</option></select></label>
      <label>Registration details<textarea name="registrationDetails" maxlength="4000"></textarea></label><label>Health-testing information<textarea name="healthTesting" maxlength="4000"></textarea></label><label>Notes<textarea name="notes" maxlength="8000"></textarea></label><button type="submit" class="button button-primary">Save breeding plan</button>
      </form><form data-form="link-stud"><h4>Link an external stud to an imported Dog</h4><label>External stud<select name="externalStudId" required><option value="">Choose external stud</option>${(state.canineExternalStuds||[]).filter(row=>row.accountId===active.sessionOwner&&row.ownerScope==="external_reference").map(row=>`<option value="${esc(row.id)}">${esc(row.registeredName||row.displayName||row.id)}</option>`).join("")}</select></label><label>Imported same-account male Dog<select name="linkedAnimalId" required><option value="">Choose imported Dog</option>${ownedSires.filter(row=>belongsToAccount(row,active.sessionOwner)).map(row=>`<option value="${esc(row.id)}">${esc(row.name||row.id)} · ${esc(row.breed||"Breed not entered")}</option>`).join("")}</select></label><p class="muted">Linking reuses this account's imported record and does not grant access to another member's private animal.</p><button type="submit" class="button button-ghost">Link stud reference</button></form></section><section class="hh-canine-repro-card"><h3>Plans · ${list.length}</h3>${list.map(plan => renderPlanCard(state, plan)).join("") || `<p class="muted">No plans yet.</p>`}</section></div>`;
  }

  function estimateForPlan(state, plan) {
    const cycle = cycles(state).find(row => row.id === plan.cycleId);
    if (cycle?.ovulation?.confirmed) return Core()?.estimateWhelpingWindow({ method: "vet_confirmed_ovulation", ovulationDate: cycle.ovulation.date, now: new Date().toISOString() });
    return Core()?.estimateWhelpingWindow({ method: "breeding_range", breedingDates: (plan.events || []).map(row => row.date), now: new Date().toISOString() });
  }
  function renderPlanCard(state, plan) {
    const estimate = estimateForPlan(state, plan);
    const eventRows = plan.events || [];
    const pregnancy = plan.pregnancy || { status: "not_evaluated" };
    const sourceSires = [...new Set(eventRows.map(row => row.sireRef?.type === "unknown" || !row.sireRef ? "unknown" : `${row.sireRef.type}:${row.sireRef.id}`))];
    const paternity = sourceSires.length > 1 ? "Multiple potential sires recorded; puppy parentage remains unresolved until individually established." : `Plan sire: ${sireLabel(state, plan.sireRef)}.`;
    return `<article class="hh-canine-repro-plan"><div class="hh-canine-repro-card-head"><div><h4>${esc(sireLabel(state, plan.sireRef))}</h4><span class="muted">${esc(plan.status || "planned")} · ${eventRows.length} completed mating event${eventRows.length === 1 ? "" : "s"}</span></div></div>
      <p>${esc(paternity)}</p><p class="muted">Planned: ${(plan.plannedDates || []).map(esc).join(", ") || "No date set"} · ${esc(plan.plannedMethod || "")}</p>
      ${estimate ? `<p class="hh-canine-repro-estimate"><strong>Estimated whelping window:</strong> ${estimate.startDate}–${estimate.endDate}<br><span class="muted">${estimate.method === "vet_confirmed_ovulation" ? "Based on veterinarian-confirmed ovulation" : "Broad range from recorded mating dates"}. Estimate only.</span></p>` : ""}
      <form data-form="plan-cancel" data-plan="${esc(plan.id)}" class="hh-canine-repro-inline"><h5>Plan status</h5><p class="muted">Cancellation retains this plan and its recorded events for the history.</p><button type="submit" class="button button-ghost" ${plan.status === "cancelled" ? "disabled" : ""}>Cancel this breeding plan</button></form>
      <form data-form="event" data-plan="${esc(plan.id)}" class="hh-canine-repro-inline"><h5>Record a completed mating</h5><label>Date<input type="date" name="date" required></label><label>Time<input type="time" name="time"></label><label>Sire for this event<select name="sireRef">${sireChoices(state, `${plan.sireRef.type}:${plan.sireRef.id}`)}</select></label><label>Actual method<select name="method"><option value="natural_service">Natural service</option><option value="artificial_insemination">Artificial insemination</option><option value="other">Other</option></select></label><label>Outcome<input name="outcome" maxlength="300"></label><label>Veterinary involvement<input name="veterinaryInvolvement" maxlength="500"></label><label>Event notes<textarea name="notes" maxlength="2000"></textarea></label><button type="submit" class="button button-ghost">Add mating event</button></form>
      <form data-form="pregnancy" data-plan="${esc(plan.id)}" class="hh-canine-repro-inline"><h5>Pregnancy assessment and dating</h5><label>Status<select name="status">${Core().PREGNANCY_STATUSES.map(status => `<option value="${status}" ${status === pregnancy.status ? "selected" : ""}>${status.replace(/_/g, " ")}</option>`).join("")}</select></label><label>Assessment date<input type="date" name="assessmentDate" value="${esc(pregnancy.assessmentDate || "")}"></label><label>Veterinarian<input name="veterinarian" maxlength="200" value="${esc(pregnancy.veterinarian || "")}"></label><label><input type="checkbox" name="veterinarianConfirmed" ${pregnancy.veterinarianConfirmed ? "checked" : ""}>Veterinarian confirmed pregnancy</label><label>Veterinarian expected start<input type="date" name="vetStart" value="${esc(pregnancy.estimate?.method === "vet_expected" ? pregnancy.estimate.startDate : "")}"></label><label>Veterinarian expected end<input type="date" name="vetEnd" value="${esc(pregnancy.estimate?.method === "vet_expected" ? pregnancy.estimate.endDate : "")}"></label><label>Manual estimate start<input type="date" name="manualStart" value="${esc(pregnancy.estimate?.method === "manual" ? pregnancy.estimate.startDate : "")}"></label><label>Manual estimate end<input type="date" name="manualEnd" value="${esc(pregnancy.estimate?.method === "manual" ? pregnancy.estimate.endDate : "")}"></label><label>Pregnancy notes<textarea name="notes" maxlength="3000">${esc(pregnancy.notes || "")}</textarea></label><button type="submit" class="button button-ghost">Save assessment and estimate</button></form>
      <ol class="hh-canine-repro-event-list">${eventRows.map(event => `<li><strong>${esc(event.date)}${event.time ? ` ${esc(event.time)}` : ""}</strong> · ${esc(sireLabel(state, event.sireRef))} · ${esc(event.method)}${event.outcome ? ` · ${esc(event.outcome)}` : ""}${event.notes ? `<span>${esc(event.notes)}</span>` : ""}</li>`).join("")}</ol></article>`;
  }

  function bind(overlay) {
    overlay.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", close));
    overlay.querySelectorAll("[data-open-whelping]").forEach(button => button.addEventListener("click", () => { const id=active?.animalId; close(); root.HerdHarborCanineWhelpingWorkspace?.openForAnimal?.(id); }));
    overlay.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click", () => { active.tab = button.dataset.tab; active.selectedCycle = ""; render(); }));
    overlay.querySelectorAll("[data-cycle]").forEach(button => button.addEventListener("click", () => { active.selectedCycle = button.dataset.cycle; render(); }));
    overlay.querySelectorAll("form").forEach(form => form.addEventListener("submit", event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      const type = form.dataset.form;
      const result = transact(type, values, form.dataset);
      if (result) render();
    }));
  }

  function transact(kind, values, dataset = {}) {
    const app = root?.HerdHarborApp;
    const live = currentState();
    if (!active || !live || accountId() !== active.sessionOwner || !femaleDog(live, active.animalId, active.sessionOwner)) { toast("Your account changed or the female Dog is no longer available. Reopen this record before saving.", "error"); return false; }
    if (reproductiveSnapshot(live, active.animalId, active.sessionOwner) !== reproductiveSnapshot(active.openState, active.animalId, active.sessionOwner)) {
      active.openState = clone(live);
      render();
      toast("This canine record changed elsewhere. Review the latest version and retry your edit.", "error");
      return false;
    }
    const next = clone(live);
    for (const key of ["canineReproductiveCycles", "canineBreedingPlans", "canineExternalStuds", "tasks"]) {
      if (next[key] == null) next[key] = [];
      else if (!Array.isArray(next[key])) { toast(`The ${key} data is unreadable. No changes were saved.`, "error"); return false; }
    }
    const now = new Date().toISOString();
    const id = prefix => Core().makeId(prefix);
    if (kind === "cycle") {
      const cycle = Core().createCycle(active.animalId, { observedHeatStartDate: values.observedHeatStartDate, observedStage: values.observedStage, status: "open", notes: "", observations: values.observation ? [{ id: id("obs"), date: values.observedHeatStartDate, text: values.observation }] : [], createdAt: now }, { now });
      const checked = Core().validateCycle(cycle, next.animals, { ownerId: active.sessionOwner });
      if (!checked.valid) { toast(checked.issues.join(" "), "error"); return false; }
      next.canineReproductiveCycles.push(checked.value);
      active.selectedCycle = cycle.id;
    } else if (kind === "cycle-update") {
      const row = next.canineReproductiveCycles.find(item => item.id === dataset.id && item.femaleId === active.animalId);
      if (!row) return false;
      const checked = Core().validateCycle({ ...row, observedStage: values.observedStage, status: values.status, notes: values.notes, updatedAt: now }, next.animals, { ownerId: active.sessionOwner });
      if (!checked.valid) { toast(checked.issues.join(" "), "error"); return false; }
      Object.assign(row, checked.value, { updatedAt: now });
      if (["closed", "cancelled"].includes(values.status)) closeCycleTasks(next, row.id, now);
    } else if (["observation", "test", "appointment", "ovulation", "interpretation", "cycle-reminder"].includes(kind)) {
      const cycle = next.canineReproductiveCycles.find(row => row.id === dataset.id && row.femaleId === active.animalId);
      if (!cycle) return false;
      const normalized = Core().normalizeCycle(cycle);
      if (!Core().isDateOnly(values.date) || (values.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(values.time))) { toast("Enter a valid calendar date and optional time.", "error"); return false; }
      if (kind === "observation") {
        if (!clean(values.text)) { toast("Enter an observation before saving.", "error"); return false; }
        normalized.observations.push({ id: id("obs"), date: values.date, time: values.time, text: values.text });
      }
      if (kind === "test") {
        if (!Number.isFinite(Number(values.value)) || Number(values.value) < 0 || !clean(values.units) || !clean(values.laboratory)) { toast("Enter the numeric result, units, and laboratory from the report.", "error"); return false; }
        normalized.progesteroneTests.push({ id: id("prog"), date: values.date, time: values.time, value: values.value, units: values.units, laboratory: values.laboratory, resultNotes: values.resultNotes });
      }
      if (kind === "appointment") normalized.veterinaryAppointments.push({ id: id("vet"), date: values.date, time: values.time, veterinarian: values.veterinarian, purpose: values.purpose, notes: values.notes });
      if (kind === "interpretation") {
        if (!clean(values.veterinarian) || !clean(values.interpretation)) { toast("Enter the veterinarian and clinical interpretation.", "error"); return false; }
        normalized.clinicalInterpretations.push({ id: id("clinical"), date: values.date, time: values.time, veterinarian: values.veterinarian, interpretation: values.interpretation });
      }
      if (kind === "cycle-reminder") {
        if (!Core().isDateOnly(values.date) || !clean(values.title)) { toast("Enter a reminder title and valid due date.", "error"); return false; }
        const reminderId = id("reminder");
        const taskId = `task_canine_cycle_${cycle.id}_${reminderId}`;
        normalized.customReminders.push({ id: reminderId, taskId, date: values.date, title: text(values.title), notes: text(values.notes) });
        upsertCycleTask(next, cycle.id, reminderId, values.date, values.title, active.animalId, now, taskId);
      }
      if (kind === "ovulation") {
        if (values.date < cycle.observedHeatStartDate || !clean(values.veterinarian)) { toast("Enter a valid ovulation date and veterinarian.", "error"); return false; }
        normalized.ovulation = { date: values.date, confirmed: true, source: "veterinarian", veterinarian: values.veterinarian, note: values.note };
        normalized.eventHistory.push({ id: id("event"), type: "veterinarian_confirmed_ovulation", date: values.date, source: "veterinarian", text: values.note || "Veterinarian-confirmed ovulation recorded." });
      }
      const checked = Core().validateCycle(normalized, next.animals, { ownerId: active.sessionOwner });
      if (!checked.valid) { toast(checked.issues.join(" "), "error"); return false; }
      Object.assign(cycle, checked.value, { updatedAt: now });
    } else if (kind === "link-stud") {
      const stud = next.canineExternalStuds.find(row => row.id === values.externalStudId && row.accountId === active.sessionOwner && row.ownerScope === "external_reference");
      if (!stud) { toast("Choose an external stud saved in this account.", "error"); return false; }
      const checked = Core().validateExternalStudCollection(next.canineExternalStuds, { ...stud, linkedAnimalId: values.linkedAnimalId, updatedAt: now }, active.sessionOwner, next.animals);
      if (!checked.valid) { toast(checked.issues.join(" "), "error"); return false; }
      Object.assign(stud, checked.value, { updatedAt: now });
    } else if (kind === "plan") {
      const plannedDates = clean(values.plannedDates).split(",").map(value => value.trim()).filter(Boolean);
      if (plannedDates.some(date => !Core().isDateOnly(date)) || new Set(plannedDates).size !== plannedDates.length || !Core().METHODS.includes(values.plannedMethod)) { toast("Enter unique, valid planned calendar dates and a breeding method.", "error"); return false; }
      let ref;
      if (values.externalDisplayName || values.externalRegisteredName) {
        const external = Core().normalizeExternalStud({ id: id("stud"), displayName: values.externalDisplayName, registeredName: values.externalRegisteredName, breed: values.externalBreed, registry: values.externalRegistry, registrationNumber: values.externalRegistrationNumber }, active.sessionOwner);
        const checkedExternal = Core().validateExternalStudCollection(next.canineExternalStuds, external, active.sessionOwner, next.animals);
        if (!checkedExternal.valid) { toast(checkedExternal.issues.join(" "), "error"); return false; }
        next.canineExternalStuds.push(checkedExternal.value);
        ref = { type: "external_stud", id: external.id };
      } else if (values.sireRef) ref = parseSireRef(values.sireRef);
      else {
        toast("Choose a sire or enter an external stud reference.", "error");
        return false;
      }
      const checkedRef = Core().validateSireReference(ref, { animals: next.animals, externalStuds: next.canineExternalStuds, accountId: active.sessionOwner });
      if (!checkedRef.valid) { toast(checkedRef.issues.join(" "), "error"); return false; }
      const plan = { id: id("plan"), damId: active.animalId, sireRef: ref, cycleId: values.cycleId || "", plannedDates, plannedMethod: values.plannedMethod, registrationDetails: text(values.registrationDetails), healthTesting: text(values.healthTesting), notes: text(values.notes), status: "planned", events: [], pregnancy: { status: "not_evaluated", estimate: null }, createdAt: now, updatedAt: now };
      if (plan.cycleId && !next.canineReproductiveCycles.some(row => row.id === plan.cycleId && row.femaleId === plan.damId)) { toast("The selected cycle is not available for this female Dog.", "error"); return false; }
      next.canineBreedingPlans.push(plan);
      if (plan.cycleId) next.canineReproductiveCycles.find(row => row.id === plan.cycleId).breedingAttemptIds = [...new Set([...(next.canineReproductiveCycles.find(row => row.id === plan.cycleId).breedingAttemptIds || []), plan.id])];
      upsertTask(next, plan.id, "planned-breeding", plan.plannedDates.slice().sort()[0] || "", "Planned canine breeding", active.animalId, now);
    } else if (kind === "event") {
      const plan = next.canineBreedingPlans.find(row => row.id === dataset.plan && row.damId === active.animalId);
      if (!plan || plan.status === "cancelled") return false;
      if (!Core().isDateOnly(values.date) || (values.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(values.time)) || !Core().METHODS.includes(values.method)) { toast("Enter a valid mating date, optional time, and method.", "error"); return false; }
      const ref = parseSireRef(values.sireRef);
      const checkedRef = Core().validateSireReference(ref, { animals: next.animals, externalStuds: next.canineExternalStuds, accountId: active.sessionOwner });
      if (!checkedRef.valid) { toast(checkedRef.issues.join(" "), "error"); return false; }
      plan.events ||= [];
      plan.events.push({ id: id("mating"), planId: plan.id, cycleId: plan.cycleId || "", date: values.date, time: values.time || "", method: values.method, sireRef: ref, outcome: text(values.outcome), notes: text(values.notes), veterinaryInvolvement: text(values.veterinaryInvolvement), createdAt: now });
      plan.status = "in_progress";
      plan.updatedAt = now;
      if (plan.cycleId) {
        const cycle = next.canineReproductiveCycles.find(row => row.id === plan.cycleId);
        if (cycle && !cycle.eventHistory.some(row => row.type === "mating_event" && row.text === plan.events.at(-1).id)) cycle.eventHistory.push({ id: id("event"), type: "mating_event", date: values.date, source: "breeder_recorded", text: plan.events.at(-1).id });
      }
    } else if (kind === "pregnancy") {
      const plan = next.canineBreedingPlans.find(row => row.id === dataset.plan && row.damId === active.animalId);
      if (!plan || plan.status === "cancelled") return false;
      const status = Core().mayConfirmPregnancy(values.status, { veterinarianConfirmed: values.veterinarianConfirmed === "on" });
      if (!status.valid) { toast(status.issues.join(" "), "error"); return false; }
      if (values.assessmentDate && !Core().isDateOnly(values.assessmentDate)) { toast("Enter a valid pregnancy assessment date.", "error"); return false; }
      if (status.status === "confirmed_pregnant" && (!Core().isDateOnly(values.assessmentDate) || !clean(values.veterinarian))) { toast("Record the veterinarian and assessment date before confirming pregnancy.", "error"); return false; }
      let estimate = estimateForPlan(next, plan);
      if (values.vetStart || values.vetEnd) {
        estimate = Core().estimateWhelpingWindow({ method: "vet_expected", veterinarianExpected: { startDate: values.vetStart, endDate: values.vetEnd || values.vetStart, sourceDate: values.assessmentDate, veterinarian: values.veterinarian, note: values.notes } });
        if (!estimate) { toast("Enter a valid veterinarian-provided expected date or date range.", "error"); return false; }
      } else if (values.manualStart || values.manualEnd) {
        estimate = Core().estimateWhelpingWindow({ method: "manual", manual: { startDate: values.manualStart, endDate: values.manualEnd || values.manualStart, note: values.notes } });
        if (!estimate) { toast("Enter a valid manual estimate date or range.", "error"); return false; }
      }
      const prior = plan.pregnancy?.estimate;
      if (prior?.method === "manual" && !values.manualStart && !values.manualEnd) estimate = prior;
      plan.pregnancy = { status: status.status, assessmentDate: values.assessmentDate || "", veterinarian: text(values.veterinarian), veterinarianConfirmed: values.veterinarianConfirmed === "on", estimate, notes: text(values.notes), updatedAt: now };
      plan.updatedAt = now;
      upsertTask(next, plan.id, "pregnancy-assessment", values.assessmentDate || "", "Canine pregnancy assessment", active.animalId, now);
      if (estimate && !["not_pregnant", "pregnancy_loss", "whelped", "closed", "cancelled"].includes(status.status)) upsertTask(next, plan.id, "whelping-window", estimate.startDate, "Prepare for expected whelping window", active.animalId, now);
      else upsertTask(next, plan.id, "whelping-window", "", "Prepare for expected whelping window", active.animalId, now);
    } else if (kind === "plan-cancel") {
      const plan = next.canineBreedingPlans.find(row => row.id === dataset.plan && row.damId === active.animalId);
      if (!plan || plan.status === "cancelled") return false;
      plan.status = "cancelled";
      plan.updatedAt = now;
      next.tasks.filter(task => task.sourceType === "canine_breeding_plan" && task.sourceRecordId === plan.id && !task.completed)
        .forEach(task => Object.assign(task, { completed: true, completedAt: now, updatedAt: now }));
    } else return false;

    if (!app?.commitState?.(next, "Canine reproductive record saved on this device; cloud synchronization may still be pending.")) {
      toast("The local save failed. The prior records were retained; retry when this device can save.", "error");
      return false;
    }
    active.openState = clone(next);
    return true;
  }

  function upsertTask(state, planId, kind, dueDate, title, animalId, now) {
    const taskId = `task_canine_${planId}_${kind}`;
    const row = state.tasks.find(task => task.id === taskId);
    if (!dueDate) {
      if (row && !row.completed) Object.assign(row, { completed: true, completedAt: now, updatedAt: now });
      return;
    }
    const values = { id: taskId, title, category: "Canine breeding", dueDate, animalId, sourceType: "canine_breeding_plan", sourceRecordId: planId, reminderType: kind };
    if (row) Object.assign(row, values, { completed: false, updatedAt: now });
    else state.tasks.push({ ...values, recurrence: "None", recurrenceDays: "", completed: false, createdAt: now, updatedAt: now });
  }

  function upsertCycleTask(state, cycleId, reminderId, dueDate, title, animalId, now, stableTaskId) {
    const taskId = stableTaskId || `task_canine_cycle_${cycleId}_${reminderId}`;
    if (state.tasks.some(task => task.id === taskId)) return;
    state.tasks.push({ id: taskId, title: text(title), category: "Canine reproduction", dueDate, animalId,
      sourceType: "canine_reproductive_cycle", sourceRecordId: cycleId, reminderType: "custom_breeder_reminder",
      recurrence: "None", recurrenceDays: "", completed: false, createdAt: now, updatedAt: now });
  }

  function closeCycleTasks(state, cycleId, now) {
    state.tasks.filter(task => task.sourceType === "canine_reproductive_cycle" && task.sourceRecordId === cycleId && !task.completed)
      .forEach(task => Object.assign(task, { completed: true, completedAt: now, updatedAt: now }));
  }

  return Object.freeze({ VERSION, openForAnimal, close });
});
