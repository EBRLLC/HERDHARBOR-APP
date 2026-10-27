(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborCanineReproductiveCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "2.0.1-cycle-foundation-1";
  const STAGES = new Set(["unknown", "proestrus", "estrus", "diestrus", "anestrus"]);
  const CYCLE_STATUSES = new Set(["open", "closed", "cancelled"]);
  const PREGNANCY_STATUSES = new Set([
    "not_evaluated", "awaiting_assessment", "confirmed_pregnant", "not_pregnant",
    "pregnancy_loss", "whelped", "closed", "cancelled"
  ]);
  const METHODS = new Set(["natural_service", "artificial_insemination", "other"]);
  const tidy = value => String(value == null ? "" : value).trim();
  const canonical = value => tidy(value).toLocaleLowerCase("en-US").replace(/\s+/g, " ");
  const recordArray = value => Array.isArray(value) ? value : [];

  function parseDateOnly(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tidy(value));
    if (!match) return null;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return date;
  }

  function isDateOnly(value) { return Boolean(parseDateOnly(value)); }

  function addDays(dateOnly, days) {
    const date = parseDateOnly(dateOnly);
    const amount = Number(days);
    if (!date || !Number.isInteger(amount)) return "";
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
  }

  function makeId(prefix = "canine", randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto)) {
    const suffix = typeof randomUUID === "function"
      ? randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    return `${prefix}_${suffix}`;
  }

  function normalizeCycle(input = {}) {
    const cycle = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const ovulation = cycle.ovulation && typeof cycle.ovulation === "object" ? cycle.ovulation : null;
    return {
      id: tidy(cycle.id),
      femaleId: tidy(cycle.femaleId),
      observedHeatStartDate: isDateOnly(cycle.observedHeatStartDate) ? cycle.observedHeatStartDate : "",
      observedStage: STAGES.has(cycle.observedStage) ? cycle.observedStage : "unknown",
      status: CYCLE_STATUSES.has(cycle.status) ? cycle.status : "open",
      observations: recordArray(cycle.observations).map(row => ({
        id: tidy(row?.id), date: isDateOnly(row?.date) ? row.date : "", time: validTime(row?.time) ? row.time : "",
        text: tidy(row?.text).slice(0, 4000), category: "breeder_observation"
      })).filter(row => row.id && row.date && row.text),
      veterinaryAppointments: recordArray(cycle.veterinaryAppointments).map(row => ({
        id: tidy(row?.id), date: isDateOnly(row?.date) ? row.date : "", time: validTime(row?.time) ? row.time : "",
        veterinarian: tidy(row?.veterinarian).slice(0, 200), purpose: tidy(row?.purpose).slice(0, 1000),
        notes: tidy(row?.notes).slice(0, 4000)
      })).filter(row => row.id && row.date),
      progesteroneTests: recordArray(cycle.progesteroneTests).map(row => normalizeProgesteroneTest(row)),
      clinicalInterpretations: recordArray(cycle.clinicalInterpretations).map(row => ({
        id: tidy(row?.id), date: isDateOnly(row?.date) ? row.date : "", time: validTime(row?.time) ? row.time : "",
        veterinarian: tidy(row?.veterinarian).slice(0, 200), interpretation: tidy(row?.interpretation).slice(0, 4000),
        relatedTestIds: [...new Set(recordArray(row?.relatedTestIds).map(tidy).filter(Boolean))]
      })).filter(row => row.id && row.date && row.interpretation),
      ovulation: ovulation && ovulation.confirmed === true && isDateOnly(ovulation.date) ? {
        date: ovulation.date, confirmed: true, source: "veterinarian",
        veterinarian: tidy(ovulation.veterinarian).slice(0, 200),
        note: tidy(ovulation.note).slice(0, 2000)
      } : null,
      fertileEstimate: normalizeEstimate(cycle.fertileEstimate),
      notes: tidy(cycle.notes).slice(0, 12000),
      eventHistory: recordArray(cycle.eventHistory).map(row => ({
        id: tidy(row?.id), type: tidy(row?.type).slice(0, 80), date: isDateOnly(row?.date) ? row.date : "",
        time: validTime(row?.time) ? row.time : "", source: tidy(row?.source).slice(0, 80),
        text: tidy(row?.text).slice(0, 4000)
      })).filter(row => row.id && row.type && row.date),
      breedingAttemptIds: [...new Set(recordArray(cycle.breedingAttemptIds).map(tidy).filter(Boolean))],
      createdAt: tidy(cycle.createdAt), updatedAt: tidy(cycle.updatedAt)
    };
  }

  function validTime(value) { return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(tidy(value)); }

  function normalizeProgesteroneTest(row = {}) {
    const value = row?.value === "" || row?.value == null ? null : Number(row.value);
    return {
      id: tidy(row?.id), date: isDateOnly(row?.date) ? row.date : "", time: validTime(row?.time) ? row.time : "",
      value: Number.isFinite(value) && value >= 0 ? value : null,
      units: tidy(row?.units).slice(0, 80), laboratory: tidy(row?.laboratory).slice(0, 200),
      veterinarian: tidy(row?.veterinarian).slice(0, 200), resultNotes: tidy(row?.resultNotes).slice(0, 2000),
      interpretation: "uninterpreted_observation"
    };
  }

  function normalizeEstimate(value) {
    if (!value || typeof value !== "object") return null;
    const method = value.method;
    if (!new Set(["breeding_range", "vet_confirmed_ovulation", "vet_expected", "manual"]).has(method)) return null;
    const startDate = isDateOnly(value.startDate) ? value.startDate : "";
    const endDate = isDateOnly(value.endDate) ? value.endDate : startDate;
    if (!startDate || !endDate || startDate > endDate) return null;
    const sourceDate = isDateOnly(value.sourceDate) ? value.sourceDate : "";
    if (method !== "manual" && !sourceDate) return null;
    return {
      method, sourceDate, startDate, endDate,
      calculated: value.calculated === true,
      userAdjusted: value.userAdjusted === true,
      calculatedAt: value.calculated === true ? tidy(value.calculatedAt) : "",
      veterinarian: method === "vet_expected" || method === "vet_confirmed_ovulation" ? tidy(value.veterinarian).slice(0, 200) : "",
      note: tidy(value.note).slice(0, 2000)
    };
  }

  function validateCycle(input, animals, options = {}) {
    const cycle = normalizeCycle(input);
    const issues = [];
    const byId = new Map();
    for (const animal of recordArray(animals)) {
      const animalId = tidy(animal?.id);
      if (animalId && !byId.has(animalId)) byId.set(animalId, animal);
    }
    const female = byId.get(cycle.femaleId);
    if (!cycle.id) issues.push("Cycle ID is required.");
    if (!female) issues.push("The female dog must exist in this account.");
    else {
      if (canonical(female.species) !== "dog") issues.push("A canine reproductive cycle must reference a Dog.");
      if (canonical(female.sex) !== "female") issues.push("A canine reproductive cycle must reference a recorded female Dog.");
      const ownerId = tidy(options.ownerId);
      const recordOwner = tidy(female.userId || female.ownerId || female.accountId);
      if (ownerId && recordOwner && recordOwner !== ownerId) issues.push("The female Dog belongs to another account.");
    }
    if (!isDateOnly(cycle.observedHeatStartDate)) issues.push("Observed heat start must be a real calendar date.");
    if (!STAGES.has(input?.observedStage || "unknown")) issues.push("Observed reproductive stage is not supported.");
    if (!CYCLE_STATUSES.has(input?.status || "open")) issues.push("Cycle status is not supported.");
    const testIds = new Set();
    for (const test of cycle.progesteroneTests) {
      if (!test.id || testIds.has(test.id)) issues.push("Progesterone test IDs must be present and unique within the cycle.");
      testIds.add(test.id);
      if (!test.date || test.value == null || !test.units || !test.laboratory)
        issues.push("Each progesterone result needs a date, numeric result, units, and laboratory.");
    }
    if (cycle.ovulation && cycle.ovulation.date < cycle.observedHeatStartDate)
      issues.push("Veterinarian-confirmed ovulation cannot precede the observed heat start date.");
    return { valid: issues.length === 0, issues: [...new Set(issues)], value: cycle };
  }

  function createCycle(femaleId, input = {}, options = {}) {
    const id = tidy(input.id) || (options.idFactory || makeId)("cycle");
    return normalizeCycle({ ...input, id, femaleId: tidy(femaleId), createdAt: input.createdAt || options.now || "", updatedAt: options.now || input.updatedAt || "" });
  }

  function normalizeExternalStud(input = {}, accountId = "") {
    const row = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    return {
      id: tidy(row.id), accountId: tidy(accountId), ownerScope: "external_reference",
      displayName: tidy(row.displayName).slice(0, 200), breed: tidy(row.breed).slice(0, 160),
      registry: tidy(row.registry).slice(0, 120), registrationNumber: tidy(row.registrationNumber).slice(0, 160),
      registeredName: tidy(row.registeredName).slice(0, 200), titles: recordArray(row.titles).map(tidy).filter(Boolean).slice(0, 40),
      linkedAnimalId: tidy(row.linkedAnimalId), notes: tidy(row.notes).slice(0, 4000),
      createdAt: tidy(row.createdAt), updatedAt: tidy(row.updatedAt)
    };
  }

  function externalStudDeduplicationKey(stud) {
    const registration = canonical(stud?.registry) + "|" + canonical(stud?.registrationNumber);
    if (registration !== "|") return `registration:${registration}`;
    const name = canonical(stud?.registeredName || stud?.displayName);
    const breed = canonical(stud?.breed);
    return name && breed ? `name-breed:${name}|${breed}` : "";
  }

  function validateExternalStud(input, accountId, animals = []) {
    const value = normalizeExternalStud(input, accountId);
    const issues = [];
    if (!value.id) issues.push("External stud ID is required.");
    if (!value.accountId) issues.push("External stud must be scoped to the active account.");
    if (!value.displayName && !value.registeredName) issues.push("Enter a name for the external stud.");
    const key = externalStudDeduplicationKey(value);
    if (!key) issues.push("Enter a registry and number, or a registered name and breed, to identify this stud safely.");
    if (value.linkedAnimalId) {
      const linked = recordArray(animals).find(animal => tidy(animal?.id) === value.linkedAnimalId);
      if (!linked) issues.push("The linked dog must be present in this account.");
      else if (canonical(linked.species) !== "dog" || canonical(linked.sex) !== "male")
        issues.push("Only a male Dog can be linked as an external sire reference.");
      else {
        const linkedOwner = tidy(linked.userId || linked.ownerId || linked.accountId);
        if (linkedOwner && linkedOwner !== value.accountId) issues.push("The linked Dog belongs to another account.");
      }
    }
    return { valid: issues.length === 0, issues: [...new Set(issues)], value, deduplicationKey: key };
  }

  function validateExternalStudCollection(studs, candidate, accountId, animals = []) {
    const checked = validateExternalStud(candidate, accountId, animals);
    if (!checked.valid) return checked;
    const duplicate = recordArray(studs).some(row => tidy(row?.id) !== checked.value.id &&
      tidy(row?.accountId) === tidy(accountId) && externalStudDeduplicationKey(row) === checked.deduplicationKey);
    if (duplicate) return { ...checked, valid: false, issues: [...checked.issues, "This external stud already exists in this account."] };
    return checked;
  }

  function validateSireReference(reference, { animals = [], externalStuds = [], accountId = "" } = {}) {
    const issues = [];
    if (!reference || typeof reference !== "object") return { valid: false, issues: ["Choose a sire reference."] };
    if (reference.type === "owned_dog") {
      const animal = recordArray(animals).find(row => tidy(row?.id) === tidy(reference.id));
      if (!animal) issues.push("The sire must exist in this account.");
      else {
        if (canonical(animal.species) !== "dog") issues.push("The sire must be a Dog.");
        if (canonical(animal.sex) !== "male") issues.push("The sire must be a recorded male Dog.");
        const ownerId = tidy(animal.userId || animal.ownerId || animal.accountId);
        if (accountId && ownerId && ownerId !== accountId) issues.push("The sire belongs to another account.");
      }
    } else if (reference.type === "external_stud") {
      const stud = recordArray(externalStuds).find(row => tidy(row?.id) === tidy(reference.id));
      if (!stud || tidy(stud.accountId) !== tidy(accountId) || stud.ownerScope !== "external_reference")
        issues.push("The external stud reference must belong to this account.");
    } else if (reference.type !== "unknown") issues.push("Sire reference type is not supported.");
    return { valid: issues.length === 0, issues };
  }

  function estimateWhelpingWindow({ method, breedingDates = [], ovulationDate = "", veterinarianExpected = null, manual = null, now = "" } = {}) {
    if (method === "breeding_range") {
      const dates = [...new Set(recordArray(breedingDates).filter(isDateOnly))].sort();
      if (!dates.length) return null;
      // Merck Veterinary Manual: approximately 58–72 days from a mating date
      // when the ovulation stage is unknown. Multiple matings widen the union.
      return normalizeEstimate({ method, sourceDate: dates[0], startDate: addDays(dates[0], 58), endDate: addDays(dates[dates.length - 1], 72), calculated: true, userAdjusted: false, calculatedAt: now, note: "Broad estimate from recorded mating dates; not a guaranteed delivery date." });
    }
    if (method === "vet_confirmed_ovulation") {
      if (!isDateOnly(ovulationDate)) return null;
      // Cornell and Merck describe expected parturition at about 63 (62–64) days from ovulation.
      return normalizeEstimate({ method, sourceDate: ovulationDate, startDate: addDays(ovulationDate, 62), endDate: addDays(ovulationDate, 64), calculated: true, userAdjusted: false, calculatedAt: now, note: "Estimate based on veterinarian-confirmed ovulation; confirm timing with the veterinarian." });
    }
    if (method === "vet_expected") {
      const dates = [veterinarianExpected?.startDate, veterinarianExpected?.endDate || veterinarianExpected?.startDate];
      if (!isDateOnly(dates[0]) || !isDateOnly(dates[1]) || dates[0] > dates[1]) return null;
      return normalizeEstimate({ method, sourceDate: isDateOnly(veterinarianExpected.sourceDate) ? veterinarianExpected.sourceDate : dates[0], startDate: dates[0], endDate: dates[1], calculated: false, userAdjusted: false, veterinarian: veterinarianExpected.veterinarian, note: veterinarianExpected.note });
    }
    if (method === "manual") {
      if (!manual?.startDate || !isDateOnly(manual.startDate)) return null;
      return normalizeEstimate({ method, sourceDate: isDateOnly(manual.sourceDate) ? manual.sourceDate : "", startDate: manual.startDate, endDate: manual.endDate || manual.startDate, calculated: false, userAdjusted: true, note: manual.note });
    }
    return null;
  }

  function mayConfirmPregnancy(status, evidence = {}) {
    const next = PREGNANCY_STATUSES.has(status) ? status : "";
    if (next !== "confirmed_pregnant") return { valid: Boolean(next), status: next, issues: next ? [] : ["Pregnancy status is not supported."] };
    if (evidence.veterinarianConfirmed !== true && evidence.veterinaryEvidenceId == null)
      return { valid: false, status: next, issues: ["Pregnancy confirmation requires recorded veterinary confirmation or linked veterinary evidence."] };
    return { valid: true, status: next, issues: [] };
  }

  return Object.freeze({
    VERSION, STAGES: [...STAGES], CYCLE_STATUSES: [...CYCLE_STATUSES], PREGNANCY_STATUSES: [...PREGNANCY_STATUSES], METHODS: [...METHODS],
    makeId, parseDateOnly, isDateOnly, addDays, normalizeCycle, validateCycle, createCycle,
    normalizeExternalStud, externalStudDeduplicationKey, validateExternalStud, validateExternalStudCollection,
    validateSireReference, estimateWhelpingWindow, mayConfirmPregnancy
  });
});
