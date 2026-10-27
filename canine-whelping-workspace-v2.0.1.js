(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborCanineWhelpingWorkspace = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const VERSION = "2.0.1-whelping-1";
  const clean = value => String(value == null ? "" : value).trim();
  const esc = value => clean(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const arr = value => Array.isArray(value) ? value : [];
  const clone = value => JSON.parse(JSON.stringify(value));
  const safe = value => clean(value).replace(/[^a-zA-Z0-9_-]/g, "_").slice(-96) || "record";
  const Core = () => root?.HerdHarborCanineReproductiveCore;
  const Lineage = () => root?.HerdHarborCanineLineage;
  const Identity = () => root?.HerdHarborCanineIdentity;
  const stateNow = () => root?.HerdHarborApp?.getState?.() || null;
  const accountId = () => clean(root?.HerdHarborCloud?.getSession?.()?.user?.id);
  const toast = (message, type = "info") => root?.HerdHarborApp?.toast?.(message, type);
  const isDog = row => clean(row?.species).toLowerCase() === "dog";
  const belongs = (row, ownerId) => {
    const owner = clean(row?.userId || row?.ownerId || row?.accountId);
    return !owner || (Boolean(ownerId) && owner === ownerId);
  };
  const whelpingIdForPlan = planId => `canine_whelping_${safe(planId)}`;
  const puppyIdForOrder = (whelpingId, order) => `canine_puppy_${safe(whelpingId)}_${Number(order)}`;
  const externalAnimalId = studId => `canine_external_stud_${safe(studId)}`;

  function potentialSireRefs(plan) {
    const events = arr(plan?.events);
    if (!events.length) return [];
    const byKey = new Map();
    for (const event of events) {
      const ref = event?.sireRef?.type === "owned_dog" || event?.sireRef?.type === "external_stud"
        ? { type: event.sireRef.type, id: clean(event.sireRef.id) }
        : { type: "unknown" };
      const key = ref.type === "unknown" ? "unknown" : `${ref.type}:${ref.id}`;
      byKey.set(key, ref);
    }
    return [...byKey.values()];
  }

  function singleRecordedSire(plan) {
    const refs = potentialSireRefs(plan);
    return refs.length === 1 && refs[0].type !== "unknown" ? refs[0] : { type: "unknown" };
  }

  function validateWhelping(state, plan, input, options = {}) {
    const issues = [];
    if (!plan || !arr(state?.canineBreedingPlans).some(row => row.id === plan.id && row.damId === plan.damId)) issues.push("Choose a saved canine breeding plan.");
    const dam = arr(state?.animals).find(row => row.id === plan?.damId);
    if (!dam || !isDog(dam) || clean(dam.sex).toLowerCase() !== "female" || !belongs(dam, options.ownerId)) issues.push("The dam must be a female Dog in the active account.");
    if (plan && (!arr(plan.events).length || plan.status === "cancelled")) issues.push("Record a completed mating event before recording a whelping; cancelled plans cannot be whelped.");
    if (!Core()?.isDateOnly(input?.birthDate)) issues.push("Whelping date must be a real calendar date.");
    if (input?.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(clean(input.time))) issues.push("Whelping time must use a valid 24-hour time.");
    if (!new Set(["unassisted", "assisted", "cesarean", "unknown"]).has(input?.method)) issues.push("Choose a supported whelping method.");
    for (const field of ["bornAlive", "stillborn", "neonatalLosses"]) {
      const value = Number(input?.[field]);
      if (!Number.isInteger(value) || value < 0) issues.push(`${field} must be a whole number of zero or more.`);
    }
    if (Number(input?.neonatalLosses) > Number(input?.bornAlive)) issues.push("Neonatal losses cannot exceed puppies born alive.");
    if (input?.expectedWeanDate && !Core()?.isDateOnly(input.expectedWeanDate)) issues.push("Expected weaning date must be a real calendar date.");
    if (input?.followUpDate && !Core()?.isDateOnly(input.followUpDate)) issues.push("Custom follow-up date must be a real calendar date.");
    const whelpingId = whelpingIdForPlan(plan?.id);
    const existing = arr(state?.canineWhelpings).find(row => row.id === whelpingId);
    if (existing?.planId && existing.planId !== plan?.id) issues.push("This stable whelping ID is already attached to another plan.");
    const litter = arr(state?.litters).find(row => row.id === whelpingId || row.canineWhelpingId === whelpingId);
    if (litter && (litter.species !== "Dog" || litter.canineWhelpingId !== whelpingId)) issues.push("The stable whelping ID collides with a non-canine litter record.");
    if (existing && input?.birthDate !== existing.birthDate && arr(state?.animals).some(row => row.sourceBirthId === whelpingId)) issues.push("Whelping date is locked after puppy profiles are generated; update individual birth records separately.");
    return { valid: issues.length === 0, issues: [...new Set(issues)], whelpingId, sireRef: singleRecordedSire(plan) };
  }

  function recordWhelping(state, planId, input, options = {}) {
    const plan = arr(state?.canineBreedingPlans).find(row => row.id === planId);
    const checked = validateWhelping(state, plan, input, options);
    if (!checked.valid) return { valid: false, issues: checked.issues, state };
    const next = clone(state);
    next.litters = arr(next.litters);
    next.canineWhelpings = arr(next.canineWhelpings);
    next.tasks = arr(next.tasks);
    const livePlan = next.canineBreedingPlans.find(row => row.id === planId);
    const dam = next.animals.find(row => row.id === livePlan.damId);
    const now = options.now || new Date().toISOString();
    const id = checked.whelpingId;
    const existingWhelping = next.canineWhelpings.find(row => row.id === id);
    const litter = next.litters.find(row => row.id === id || row.canineWhelpingId === id);
    const litterId = litter?.id || id;
    const offspringIds = [...new Set(arr(litter?.offspringIds).map(String))];
    const genericLitter = {
      ...(litter || {}), id: litterId, species: "Dog", canineWhelping: true, canineWhelpingId: id,
      damId: livePlan.damId, sireId: checked.sireRef.type === "owned_dog" ? checked.sireRef.id : "",
      birthDate: input.birthDate, birthTime: clean(input.time), birthType: input.method,
      bornAlive: String(Number(input.bornAlive)), stillborn: String(Number(input.stillborn)),
      lostBeforeWeaning: String(Number(input.neonatalLosses)), weaned: String(litter?.weaned || 0),
      expectedWeanDate: Object.hasOwn(input, "expectedWeanDate") ? clean(input.expectedWeanDate) : (litter?.expectedWeanDate || ""), followUpDate: "",
      litterName: clean(input.litterName), notes: clean(input.notes), offspringIds,
      createdAt: litter?.createdAt || now, updatedAt: now
    };
    if (litter) Object.assign(litter, genericLitter);
    else next.litters.push(genericLitter);
    const whelping = {
      ...(existingWhelping || {}), id, litterId, planId, cycleId: livePlan.cycleId || "", damId: livePlan.damId,
      sireRef: checked.sireRef, birthDate: input.birthDate, time: clean(input.time), method: input.method,
      veterinaryInvolvement: clean(input.veterinaryInvolvement), litterName: clean(input.litterName), notes: clean(input.notes),
      puppyIds: [...new Set([...(existingWhelping?.puppyIds || []), ...offspringIds])],
      generationOperationId: existingWhelping?.generationOperationId || `generate_${id}`,
      createdAt: existingWhelping?.createdAt || now, updatedAt: now
    };
    if (existingWhelping) Object.assign(existingWhelping, whelping);
    else next.canineWhelpings.push(whelping);
    livePlan.status = "whelped";
    livePlan.updatedAt = now;
    livePlan.pregnancy = { ...(livePlan.pregnancy || {}), status: "whelped", whelpedAt: input.birthDate, updatedAt: now };
    next.tasks.filter(task => task.sourceType === "canine_breeding_plan" && task.sourceRecordId === planId && !task.completed)
      .forEach(task => Object.assign(task, { completed: true, completedAt: now, updatedAt: now }));
    if (input.followUpDate && clean(input.followUpTitle)) {
      const taskId = `task_canine_whelping_${safe(id)}_custom`;
      const task = next.tasks.find(row => row.id === taskId);
      const values = { id: taskId, title: clean(input.followUpTitle), category: "Canine puppy care", dueDate: input.followUpDate,
        animalId: livePlan.damId, sourceType: "canine_whelping", sourceRecordId: id, reminderType: "custom_breeder_reminder" };
      if (task) Object.assign(task, values, { completed: false, updatedAt: now });
      else next.tasks.push({ ...values, recurrence: "None", recurrenceDays: "", completed: false, createdAt: now, updatedAt: now });
    } else {
      next.tasks.filter(task => task.id === `task_canine_whelping_${safe(id)}_custom` && !task.completed)
        .forEach(task => Object.assign(task, { completed: true, completedAt: now, updatedAt: now }));
    }
    if (input.expectedWeanDate) {
      const taskId = `task_canine_whelping_${safe(id)}_weaning`;
      const task = next.tasks.find(row => row.id === taskId);
      const values = { id: taskId, title: "Owner-scheduled puppy weaning follow-up", category: "Canine puppy care", dueDate: input.expectedWeanDate,
        animalId: livePlan.damId, sourceType: "canine_whelping", sourceRecordId: id, reminderType: "owner_scheduled_weaning" };
      if (task) Object.assign(task, values, { completed: false, updatedAt: now });
      else next.tasks.push({ ...values, recurrence: "None", recurrenceDays: "", completed: false, createdAt: now, updatedAt: now });
    } else {
      next.tasks.filter(task => task.id === `task_canine_whelping_${safe(id)}_weaning` && !task.completed)
        .forEach(task => Object.assign(task, { completed: true, completedAt: now, updatedAt: now }));
    }
    return { valid: true, issues: [], state: next, whelping, litter: genericLitter };
  }

  function ensureReferenceSire(state, sireRef, ownerId, now) {
    if (sireRef?.type === "owned_dog") {
      const animal = arr(state.animals).find(row => row.id === sireRef.id && isDog(row) && clean(row.sex).toLowerCase() === "male" && belongs(row, ownerId));
      return animal ? { valid: true, id: animal.id } : { valid: false, issues: ["The recorded sire is not available in this account."] };
    }
    if (sireRef?.type !== "external_stud") return { valid: true, id: "" };
    const stud = arr(state.canineExternalStuds).find(row => row.id === sireRef.id && row.accountId === ownerId && row.ownerScope === "external_reference");
    if (!stud) return { valid: false, issues: ["The external sire reference is not available in this account."] };
    if (stud.linkedAnimalId) {
      const linked = arr(state.animals).find(row => row.id === stud.linkedAnimalId && isDog(row) && clean(row.sex).toLowerCase() === "male" && belongs(row, ownerId));
      return linked ? { valid: true, id: linked.id } : { valid: false, issues: ["The linked external sire is no longer a compatible Dog in this account."] };
    }
    const id = externalAnimalId(stud.id);
    const existing = arr(state.animals).find(row => row.id === id);
    if (existing) {
      if (!isDog(existing) || clean(existing.sex).toLowerCase() !== "male" || existing.ownershipScope !== "external_reference" || existing.externalStudId !== stud.id || !belongs(existing, ownerId))
        return { valid: false, issues: ["The stable external sire identity is already used by another animal record."] };
      return { valid: true, id };
    }
    const registrations = stud.registry && stud.registrationNumber ? [{ id: `external-reg-${safe(stud.id)}`, registry: stud.registry, number: stud.registrationNumber, source: "External stud reference", status: "Owner-entered" }] : [];
    const titles = arr(stud.titles).map((abbreviation, index) => ({ id: `external-title-${safe(stud.id)}-${index + 1}`, organization: stud.registry || "Breeder-entered", abbreviation, fullLabel: abbreviation, source: "External stud reference" }));
    state.animals.push({ id, species: "Dog", sex: "Male", name: stud.registeredName || stud.displayName || "External stud reference", breed: stud.breed || "", status: "Ancestor Only", ownershipScope: "external_reference", externalStudId: stud.id, userId: ownerId, canine: Identity()?.normalize?.({ registeredName: stud.registeredName, registrations, titles }) || { registeredName: stud.registeredName || "", registrations, titles }, createdAt: now, updatedAt: now });
    return { valid: true, id };
  }

  function generatePuppies(state, whelpingId, options = {}) {
    const whelping = arr(state?.canineWhelpings).find(row => row.id === whelpingId);
    const litter = arr(state?.litters).find(row => row.canineWhelpingId === whelpingId || row.id === whelping?.litterId);
    const plan = arr(state?.canineBreedingPlans).find(row => row.id === whelping?.planId && row.damId === whelping?.damId);
    const ownerId = options.ownerId || accountId();
    const dam = arr(state?.animals).find(row => row.id === whelping?.damId);
    if (!whelping || !litter || !plan || !dam || !isDog(dam) || clean(dam.sex).toLowerCase() !== "female" || !belongs(dam, ownerId))
      return { valid: false, issues: ["A saved canine whelping with a same-account female Dog is required."], state };
    const bornAlive = Number(litter.bornAlive);
    if (!Number.isInteger(bornAlive) || bornAlive < 0) return { valid: false, issues: ["Born-alive count must be a whole number before puppy generation."], state };
    const next = clone(state);
    next.animals = arr(next.animals);
    next.litters = arr(next.litters);
    next.canineWhelpings = arr(next.canineWhelpings);
    const nextWhelping = next.canineWhelpings.find(row => row.id === whelpingId);
    const nextLitter = next.litters.find(row => row.canineWhelpingId === whelpingId || row.id === nextWhelping.litterId);
    const now = options.now || new Date().toISOString();
    const sireRef = whelping.sireRef || singleRecordedSire(plan);
    const sire = ensureReferenceSire(next, sireRef, ownerId, now);
    if (!sire.valid) return { valid: false, issues: sire.issues, state };
    const ids = new Set(arr(nextLitter.offspringIds).map(String));
    const created = [], reconciled = [];
    for (let order = 1; order <= bornAlive; order += 1) {
      const id = puppyIdForOrder(whelpingId, order);
      const existing = next.animals.find(row => row.id === id);
      if (existing) {
        if (!isDog(existing) || existing.sourceBirthId !== whelpingId || existing.birthOrder !== order || !belongs(existing, ownerId))
          return { valid: false, issues: [`Stable puppy ID ${id} is already used by an unrelated record; no changes were saved.`], state };
        ids.add(id);
        reconciled.push(id);
        continue;
      }
      const puppy = { id, name: `Puppy ${order}`, species: "Dog", breed: dam.breed || "", sex: "Unknown", color: "", dob: nextLitter.birthDate,
        status: "Growing", damId: dam.id, sireId: sire.id || "", sourceBirthId: whelpingId, litterId: nextLitter.id,
        birthOrder: order, caninePuppyId: `${whelpingId}:${order}`, canineParentage: { damId: dam.id, sireRef, status: sireRef.type === "unknown" ? "pending_or_multiple_potential_sires" : "breeder_recorded_from_all_mating_events", evidenceNote: "" },
        canine: Identity()?.normalize?.({}) || {}, createdAt: now, updatedAt: now };
      next.animals.push(puppy);
      const pedigree = Lineage()?.validate?.(next.animals, puppy, { ownerId });
      if (pedigree && !pedigree.valid) return { valid: false, issues: pedigree.issues, state };
      ids.add(id);
      created.push(id);
    }
    nextLitter.offspringIds = [...ids];
    nextLitter.updatedAt = now;
    nextWhelping.puppyIds = [...new Set([...arr(nextWhelping.puppyIds).map(String), ...ids])];
    nextWhelping.generationOperationId ||= `generate_${whelpingId}`;
    nextWhelping.generationUpdatedAt = now;
    nextWhelping.updatedAt = now;
    return { valid: true, issues: [], state: next, created, reconciled, expectedCount: bornAlive, actualCount: ids.size, operationId: nextWhelping.generationOperationId };
  }

  function updatePuppyParentage(state, puppyId, sireRef, evidenceNote, options = {}) {
    const puppy = arr(state?.animals).find(row => row.id === puppyId && isDog(row) && row.sourceBirthId);
    const ownerId = options.ownerId || accountId();
    if (!puppy || !belongs(puppy, ownerId)) return { valid: false, issues: ["Choose a puppy record in the active account."], state };
    if (!sireRef || !new Set(["unknown", "owned_dog", "external_stud"]).has(sireRef.type) || (sireRef.type !== "unknown" && !clean(sireRef.id))) return { valid: false, issues: ["Choose an available sire reference or leave parentage unresolved."], state };
    if (sireRef.type !== "unknown" && !clean(evidenceNote)) return { valid: false, issues: ["Enter the breeder's parentage evidence note before assigning a sire."], state };
    const next = clone(state);
    next.animals = arr(next.animals);
    const sire = ensureReferenceSire(next, sireRef, ownerId, options.now || new Date().toISOString());
    if (!sire.valid) return { valid: false, issues: sire.issues, state };
    const current = next.animals.find(row => row.id === puppyId);
    const proposed = { ...current, sireId: sire.id || "", canineParentage: { ...(current.canineParentage || {}), damId: current.damId, sireRef, status: sireRef.type === "unknown" ? "pending_or_unknown" : "breeder_confirmed", evidenceNote: clean(evidenceNote).slice(0, 2000) }, updatedAt: options.now || new Date().toISOString() };
    const lineage = Lineage()?.validateMutation?.(next.animals, proposed);
    if (lineage && !lineage.valid) return { valid: false, issues: lineage.issues, state };
    next.animals = next.animals.map(row => row.id === puppyId ? proposed : row);
    return { valid: true, issues: [], state: next, animal: proposed };
  }

  let active = null;
  function openForAnimal(animalId) {
    const state = stateNow();
    const ownerId = accountId();
    const dam = arr(state?.animals).find(row => row.id === animalId && isDog(row) && clean(row.sex).toLowerCase() === "female" && belongs(row, ownerId));
    if (!dam || !root?.document?.body) { toast("Open a female Dog in the active account to manage whelpings.", "error"); return false; }
    active = { animalId, ownerId, opened: stateSignature(state, animalId, ownerId) };
    render();
    return true;
  }
  function stateSignature(state, damId, ownerId) {
    return JSON.stringify({ plans: arr(state?.canineBreedingPlans).filter(row => row.damId === damId), whelpings: arr(state?.canineWhelpings).filter(row => row.damId === damId),
      litters: arr(state?.litters).filter(row => row.damId === damId && row.canineWhelping), pups: arr(state?.animals).filter(row => row.sourceBirthId && arr(state?.canineWhelpings).some(w => w.id === row.sourceBirthId && w.damId === damId)), ownerId });
  }
  function close() { root?.document?.getElementById("hh-canine-whelping-workspace")?.remove(); active = null; }
  function render() {
    if (!active) return false;
    const state = stateNow();
    const dam = arr(state?.animals).find(row => row.id === active.animalId);
    if (!dam || accountId() !== active.ownerId) { close(); return false; }
    let overlay = root.document.getElementById("hh-canine-whelping-workspace");
    if (!overlay) { overlay = root.document.createElement("div"); overlay.id = "hh-canine-whelping-workspace"; overlay.className = "hh-canine-repro-overlay"; overlay.setAttribute("role", "dialog"); overlay.setAttribute("aria-modal", "true"); root.document.body.appendChild(overlay); }
    const plans = arr(state.canineBreedingPlans).filter(plan => plan.damId === dam.id && arr(plan.events).length && plan.status !== "cancelled");
    const whelpings = arr(state.canineWhelpings).filter(row => row.damId === dam.id);
    overlay.innerHTML = `<section class="hh-canine-repro-panel" aria-labelledby="hh-canine-whelping-title"><header><div><p class="eyebrow">Canine birth records</p><h2 id="hh-canine-whelping-title">${esc(dam.name)} · Whelpings & puppies</h2><p class="muted">Counts and parentage are breeder-entered. Puppies are individual canonical animal records; parentage stays unresolved where evidence is incomplete.</p></div><button type="button" class="button button-ghost" data-close aria-label="Close">Close</button></header>
      <section class="hh-canine-repro-card"><h3>Record or update a whelping</h3><form data-form="whelping"><label>Breeding plan<select name="planId" required><option value="">Choose a plan with completed mating</option>${plans.map(plan=>`<option value="${esc(plan.id)}">${esc(plan.id)} · ${arr(plan.events).length} mating events</option>`).join("")}</select></label><div class="hh-canine-repro-inline"><label>Whelping date<input type="date" name="birthDate" required></label><label>Time<input type="time" name="time"></label><label>Method<select name="method"><option value="unknown">Unknown</option><option value="unassisted">Unassisted</option><option value="assisted">Assisted</option><option value="cesarean">Cesarean section</option></select></label><label>Born alive<input type="number" min="0" step="1" name="bornAlive" required value="0"></label><label>Stillborn<input type="number" min="0" step="1" name="stillborn" required value="0"></label><label>Neonatal losses<input type="number" min="0" step="1" name="neonatalLosses" required value="0"></label><label>Litter name / identifier<input name="litterName" maxlength="200"></label><label>Expected weaning date (optional)<input type="date" name="expectedWeanDate"></label><label>Veterinary involvement<input name="veterinaryInvolvement" maxlength="1000"></label><label>Custom follow-up title<input name="followUpTitle" maxlength="200"></label><label>Custom follow-up date<input type="date" name="followUpDate"></label><label>Notes<textarea name="notes" maxlength="8000"></textarea></label></div><button type="submit" class="button button-primary">Save whelping record</button><p class="muted">No universal care or treatment dates are added. Set only reminders appropriate to this litter.</p></form></section>
      <section class="hh-canine-repro-card"><h3>Whelping history · ${whelpings.length}</h3>${whelpings.map(row=>renderWhelping(state,row)).join("")||`<p class="muted">No whelpings recorded.</p>`}</section><footer><span class="muted">Saved to this device first. Cloud synchronization may still be pending.</span></footer></section>`;
    bind(overlay); return true;
  }
  function renderWhelping(state, whelping) {
    const litter = arr(state.litters).find(row => row.id === whelping.litterId);
    const puppies = arr(state.animals).filter(row => row.sourceBirthId === whelping.id).sort((a,b)=>Number(a.birthOrder)-Number(b.birthOrder));
    const plan = arr(state.canineBreedingPlans).find(row => row.id === whelping.planId);
    const candidates = potentialSireRefs(plan);
    const sireName = ref => ref?.type === "owned_dog" ? arr(state.animals).find(row=>row.id===ref.id)?.name || "Missing Dog" : ref?.type === "external_stud" ? arr(state.canineExternalStuds).find(row=>row.id===ref.id)?.registeredName || arr(state.canineExternalStuds).find(row=>row.id===ref.id)?.displayName || "External stud" : "Unknown / unresolved";
    const options = `<option value="unknown">Unknown / unresolved</option>${candidates.filter(ref=>ref.type!=="unknown").map(ref=>`<option value="${esc(ref.type+":"+ref.id)}">${esc(sireName(ref))}</option>`).join("")}`;
    return `<article class="hh-canine-repro-plan"><h4>${esc(whelping.litterName || litter?.litterName || "Whelping")} · ${esc(whelping.birthDate)}</h4><p>${Number(litter?.bornAlive||0)} born alive · ${Number(litter?.stillborn||0)} stillborn · ${Number(litter?.lostBeforeWeaning||0)} neonatal losses. ${candidates.length>1?"Multiple potential sires; no sire was assigned automatically.":`Recorded sire: ${esc(sireName(whelping.sireRef))}.`}</p><p>${puppies.length} individual puppy record${puppies.length===1?"":"s"} · recorded total ${Number(litter?.bornAlive||0)}. Correcting totals does not delete existing puppy profiles.</p><div class="modal-actions"><button type="button" class="button button-primary" data-generate="${esc(whelping.id)}">Generate / reconcile puppy records</button><button type="button" class="button button-ghost" data-manage-litter="${esc(whelping.litterId)}">Manage puppy development</button></div>${puppies.map(puppy=>`<form data-form="parentage" data-puppy="${esc(puppy.id)}" class="hh-canine-repro-inline"><strong>${esc(puppy.name)} · ${esc(puppy.sex)} · ${esc(puppy.status)}</strong><label>Confirmed individual sire<select name="sireRef">${options}</select></label><label>Evidence / breeder note<input name="evidenceNote" maxlength="2000" placeholder="Required when assigning a sire"></label><button type="submit" class="button button-ghost">Save individual parentage</button></form>`).join("")}</article>`;
  }
  function bind(overlay) {
    overlay.querySelectorAll("[data-close]").forEach(button=>button.addEventListener("click",close));
    overlay.querySelectorAll("[data-generate]").forEach(button=>button.addEventListener("click",()=>mutate("generate",button.dataset.generate)));
    overlay.querySelectorAll("[data-manage-litter]").forEach(button=>button.addEventListener("click",()=>{const id=button.dataset.manageLitter;close();root.HerdHarborBreedingWorkspace?.open?.(id);}));
    overlay.querySelectorAll('select[name="planId"]').forEach(select=>select.addEventListener("change",()=>{
      const planId=select.value;const whelp=arr(stateNow()?.canineWhelpings).find(row=>row.planId===planId);const litter=arr(stateNow()?.litters).find(row=>row.id===whelp?.litterId);
      if(!whelp||!litter)return;
      const form=select.closest("form");
      for(const [name,value] of Object.entries({birthDate:whelp.birthDate,time:whelp.time,method:whelp.method,bornAlive:litter.bornAlive,stillborn:litter.stillborn,neonatalLosses:litter.lostBeforeWeaning,litterName:whelp.litterName,expectedWeanDate:litter.expectedWeanDate,veterinaryInvolvement:whelp.veterinaryInvolvement,notes:whelp.notes}))if(form.elements[name])form.elements[name].value=value||"";
    }));
    overlay.querySelectorAll("form").forEach(form=>form.addEventListener("submit",event=>{event.preventDefault();const values=Object.fromEntries(new FormData(form));mutate(form.dataset.form,form.dataset.planId||form.dataset.puppy||values.planId,values);}));
  }
  function mutate(kind, key, values = {}) {
    const live = stateNow();
    if (!active || !live || accountId() !== active.ownerId) { toast("Your account changed. Reopen the whelping record before saving.", "error"); return false; }
    if (stateSignature(live,active.animalId,active.ownerId)!==active.opened) { active.opened=stateSignature(live,active.animalId,active.ownerId);render();toast("Canine whelping records changed elsewhere. Review the current version and retry.","error");return false; }
    let result;
    if (kind === "whelping") result=recordWhelping(live,key,values,{ownerId:active.ownerId});
    else if (kind === "generate") result=generatePuppies(live,key,{ownerId:active.ownerId});
    else if (kind === "parentage") result=updatePuppyParentage(live,key,values.sireRef?parseSireRef(values.sireRef):{type:"unknown"},values.evidenceNote,{ownerId:active.ownerId});
    else return false;
    if (!result.valid) { toast(result.issues.join(" "),"error");return false; }
    if (!root.HerdHarborApp?.commitState?.(result.state, kind==="generate"?"Puppy records saved on this device; cloud synchronization may still be pending.":"Canine whelping record saved on this device; cloud synchronization may still be pending.")) { toast("The local save failed. Existing whelping and puppy records were retained; retry when this device can save.","error");return false; }
    active.opened=stateSignature(result.state,active.animalId,active.ownerId);render();return true;
  }
  function parseSireRef(value) { const [type,...rest]=clean(value).split(":");return type==="owned_dog"||type==="external_stud"?{type,id:rest.join(":")}:{type:"unknown"}; }

  return Object.freeze({ VERSION, whelpingIdForPlan, puppyIdForOrder, potentialSireRefs, singleRecordedSire, validateWhelping, recordWhelping, generatePuppies, updatePuppyParentage, ensureReferenceSire, openForAnimal, close });
});
