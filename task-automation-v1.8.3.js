(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborTaskAutomation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "1.8.3";
  const BUILD_ID = "derived-task-automation-1";
  const RECURRENCE_OPTIONS = Object.freeze(["None", "Daily", "Weekly", "Every 2 weeks", "Monthly", "Custom"]);
  const array = (source, key) => Array.isArray(source?.[key]) ? source[key] : [];
  const clean = (value) => String(value == null ? "" : value).trim();

  function normalizeRecurrence(value) {
    const normalized = clean(value) || "None";
    return RECURRENCE_OPTIONS.includes(normalized) ? normalized : "None";
  }

  function workflowTaskId(prefix, recordId, type) {
    const safeId = String(recordId || prefix).replace(/[^a-zA-Z0-9_-]/g, "").slice(-72) || prefix;
    return "task_" + prefix + "_" + safeId + "_" + String(type || "reminder").replace(/[^a-z0-9]+/gi, "-");
  }

  function animalName(state, animalId) {
    return array(state, "animals").find((animal) => String(animal.id) === String(animalId))?.name || "Unknown animal";
  }
  function dogFor(state, animalId) {
    const animal = array(state,"animals").find(record=>String(record.id)===String(animalId));
    return String(animal?.species || "").trim().toLowerCase()==="dog" ? animal : null;
  }
  function historicalDog(state, animalId) {
    const animal=dogFor(state,animalId);
    return Boolean(animal)&&["sold","deceased","archived","ancestor only"].includes(String(animal.status||"").trim().toLowerCase());
  }

  function birthLiveRemaining(litter = {}) {
    const count = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
    return count(litter.bornAlive) + count(litter.fosteredIn) - count(litter.fosteredOut) - count(litter.lostBeforeWeaning);
  }

  function recurrenceFor(source = {}) {
    const recurrence = normalizeRecurrence(source.followUpRecurrence);
    return {
      recurrence,
      recurrenceDays: recurrence === "Custom" ? clean(source.followUpRecurrenceDays) : ""
    };
  }

  function taskFingerprint(definition = {}) {
    // Stable scheduling identity, not UI copy. Changing an animal name, Dog
    // label or notes must never reopen a previously completed reminder.
    return JSON.stringify([
      clean(definition.dueDate),
      clean(definition.animalId),
      clean(definition.sourceType),
      clean(definition.sourceRecordId),
      clean(definition.reminderType),
      normalizeRecurrence(definition.recurrence),
      clean(definition.recurrenceDays)
    ]);
  }

  function breedingDefinitions(state, breeding = {}) {
    // Existing breeding records are authoritative regardless of species. Suppressing
    // a formerly valid Dog definition would silently mark its task as completed.
    if (!breeding.id) return [];
    return [{
      id: workflowTaskId("breeding", breeding.id, "breeding-follow-up"),
      title: "Breeding follow-up: " + animalName(state, breeding.femaleId),
      category: "Breeding",
      dueDate: clean(breeding.followUpDate),
      animalId: clean(breeding.femaleId),
      notes: "Follow-up date recorded on the breeding record with " + animalName(state, breeding.maleId) + ".",
      sourceType: "breeding",
      sourceRecordId: String(breeding.id),
      reminderType: "breeding-follow-up",
      recurrence: "None",
      recurrenceDays: "",
      completed: clean(breeding.status) === "Cancelled"
    }];
  }

  function litterDefinitions(state, litter = {}) {
    // Keep historical task fingerprints and IDs stable across release upgrades.
    if (!litter.id) return [];
    return [{
      id: workflowTaskId("birth", litter.id, "litter-follow-up"),
      title: "Litter follow-up: " + animalName(state, litter.damId),
      category: "Weaning",
      dueDate: clean(litter.followUpDate),
      animalId: clean(litter.damId),
      notes: "Follow-up date recorded on this birth or litter record.",
      sourceType: "birth",
      sourceRecordId: String(litter.id),
      reminderType: "litter-follow-up",
      recurrence: "None",
      recurrenceDays: "",
      completed: false
    }];
  }

  function healthDefinition(state, record = {}) {
    if (!record.id) return null;
    // Do not introduce new work for archived dog ancestors, but do not mark
    // an *existing* tracked reminder complete merely because a status changed.
    if (historicalDog(state,record.animalId) &&
        !array(state,"tasks").some(task=>task.automationManaged &&
          task.sourceType==="health" && String(task.sourceRecordId)===String(record.id))) return null;
    const type = clean(record.type);
    const reminderType = type === "Medication"
      ? "medication-follow-up"
      : type === "Vaccination"
        ? "vaccination-follow-up"
        : "health-follow-up";
    const label = type === "Medication"
      ? "Medication follow-up"
      : type === "Vaccination"
        ? "Vaccination follow-up"
        : "Health follow-up";
    const recurrence = recurrenceFor(record);
    return {
      id: workflowTaskId("health", record.id, reminderType),
      title: label + ": " + animalName(state, record.animalId) + (dogFor(state,record.animalId) ? " (Dog)" : ""),
      category: "Health",
      dueDate: clean(record.followUpDate),
      animalId: clean(record.animalId),
      notes: "Automatically maintained from the " + (type ? type.toLowerCase() : "health") + " record.",
      sourceType: "health",
      sourceRecordId: String(record.id),
      reminderType,
      recurrence: recurrence.recurrence,
      recurrenceDays: recurrence.recurrenceDays,
      completed: false
    };
  }

  function reproductiveDefinitions(state = {}) {
    const definitions = [];
    const historical = new Set(["sold", "deceased", "archived", "ancestor only"]);
    for (const animal of array(state, "animals")) {
      const species = clean(animal?.species).toLowerCase();
      const feline = ["cat", "cats", "feline"].includes(species);
      const cavy = ["cavy", "cavies", "guinea pig", "guinea pigs"].includes(species);
      if (!feline && !cavy) continue;
      const rows = feline ? animal.felineReproduction?.events : animal.cavyReproduction?.records;
      const sourceType = feline ? "feline-reproduction" : "cavy-reproduction";
      const reminderType = feline ? "feline-reproductive-follow-up" : "cavy-reproductive-follow-up";
      for (const row of Array.isArray(rows) ? rows : []) {
        if (!clean(row?.id)) continue;
        const sourceRecordId = clean(animal.id) + ":" + clean(row.id);
        const id = workflowTaskId("repro", sourceRecordId, reminderType);
        const existing = array(state, "tasks").some(task => task.automationManaged && task.id === id);
        // Historical animals cannot acquire new proactive tasks, but existing
        // managed tasks are retained for safe completion/reschedule reconciliation.
        if (historical.has(clean(animal.status).toLowerCase()) && !existing) continue;
        const kind = clean(row.kind || row.type) || "record";
        definitions.push({
          id, title: (feline ? "Cat" : "Cavy") + " breeding follow-up: " + clean(animal.name || "Animal"),
          category: "Breeding", dueDate: clean(row.followUpDate),
          animalId: clean(animal.id),
          notes: "Breeder-entered follow-up for " + kind + "; no pregnancy confirmation inferred.",
          sourceType, sourceRecordId, reminderType,
          recurrence: "None", recurrenceDays: "",
          completed: clean(row.status).toLowerCase() === "cancelled" ||
            clean(row.status).toLowerCase() === "completed"
        });
      }
    }
    return definitions;
  }

  function deriveTaskDefinitions(state = {}) {
    const definitions = [];
    array(state, "breedings").forEach((record) => definitions.push(...breedingDefinitions(state, record)));
    array(state, "litters").forEach((record) => definitions.push(...litterDefinitions(state, record)));
    definitions.push(...reproductiveDefinitions(state));
    array(state, "health").forEach((record) => {
      const definition = healthDefinition(state, record);
      if (definition) definitions.push(definition);
    });
    return definitions.map((definition) => ({
      ...definition,
      automationFingerprint: taskFingerprint(definition)
    }));
  }

  return Object.freeze({
    VERSION,
    BUILD_ID,
    RECURRENCE_OPTIONS,
    normalizeRecurrence,
    workflowTaskId,
    birthLiveRemaining,
    taskFingerprint,
    breedingDefinitions,
    litterDefinitions,
    healthDefinition,
    reproductiveDefinitions,
    deriveTaskDefinitions
  });
});
