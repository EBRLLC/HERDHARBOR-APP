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
    return JSON.stringify([
      clean(definition.title),
      clean(definition.category),
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
    if (!breeding.id) return [];
    const status = clean(breeding.status);
    const inactive = ["Not pregnant", "Delivered", "Cancelled"].includes(status);
    const checkDone = inactive || (breeding.pregnancyCheckStatus && breeding.pregnancyCheckStatus !== "Not checked");
    const female = array(state, "animals").find((animal) => String(animal.id) === String(breeding.femaleId));
    const isRabbit = female?.species === "Rabbit";
    const damName = animalName(state, breeding.femaleId);
    const sireName = animalName(state, breeding.maleId);
    return [
      {
        id: workflowTaskId("breeding", breeding.id, "pregnancy-check"),
        title: "Pregnancy check: " + damName,
        category: "Breeding",
        dueDate: clean(breeding.pregnancyCheckDate),
        animalId: clean(breeding.femaleId),
        notes: "Automatically maintained from the breeding record with " + sireName + ".",
        sourceType: "breeding",
        sourceRecordId: String(breeding.id),
        reminderType: "pregnancy-check",
        recurrence: "None",
        recurrenceDays: "",
        completed: Boolean(checkDone)
      },
      {
        id: workflowTaskId("breeding", breeding.id, "prepare-birth"),
        title: (isRabbit ? "Place nest box" : "Prepare birth area") + ": " + damName,
        category: isRabbit ? "Nest box" : "Breeding",
        dueDate: clean(breeding.nestBoxDate || breeding.preparationDate),
        animalId: clean(breeding.femaleId),
        notes: "Automatically maintained from the expected birth schedule.",
        sourceType: "breeding",
        sourceRecordId: String(breeding.id),
        reminderType: "prepare-birth",
        recurrence: "None",
        recurrenceDays: "",
        completed: Boolean(inactive)
      },
      {
        id: workflowTaskId("breeding", breeding.id, "expected-birth"),
        title: "Expected birth: " + damName,
        category: "Breeding",
        dueDate: clean(breeding.dueDate),
        animalId: clean(breeding.femaleId),
        notes: "Automatically maintained from the breeding record with " + sireName + ".",
        sourceType: "breeding",
        sourceRecordId: String(breeding.id),
        reminderType: "expected-birth",
        recurrence: "None",
        recurrenceDays: "",
        completed: Boolean(inactive)
      },
      {
        id: workflowTaskId("breeding", breeding.id, "breeding-follow-up"),
        title: "Breeding follow-up: " + damName,
        category: "Breeding",
        dueDate: clean(breeding.followUpDate),
        animalId: clean(breeding.femaleId),
        notes: "Follow-up date recorded on the breeding record with " + sireName + ".",
        sourceType: "breeding",
        sourceRecordId: String(breeding.id),
        reminderType: "breeding-follow-up",
        recurrence: "None",
        recurrenceDays: "",
        completed: status === "Cancelled"
      }
    ];
  }

  function litterDefinitions(state, litter = {}) {
    if (!litter.id) return [];
    const damName = animalName(state, litter.damId);
    const liveAvailable = Math.max(0, birthLiveRemaining(litter));
    const weaningComplete = liveAvailable === 0 || Number(litter.weaned || 0) >= liveAvailable;
    return [
      {
        id: workflowTaskId("birth", litter.id, "weaning"),
        title: "Wean offspring: " + damName,
        category: "Weaning",
        dueDate: clean(litter.expectedWeanDate),
        animalId: clean(litter.damId),
        notes: "Automatically maintained from this birth or litter record.",
        sourceType: "birth",
        sourceRecordId: String(litter.id),
        reminderType: "weaning",
        recurrence: "None",
        recurrenceDays: "",
        completed: Boolean(weaningComplete)
      },
      {
        id: workflowTaskId("birth", litter.id, "litter-follow-up"),
        title: "Litter follow-up: " + damName,
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
      }
    ];
  }

  function healthDefinition(state, record = {}) {
    if (!record.id) return null;
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
      title: label + ": " + animalName(state, record.animalId),
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

  function deriveTaskDefinitions(state = {}) {
    const definitions = [];
    array(state, "breedings").forEach((record) => definitions.push(...breedingDefinitions(state, record)));
    array(state, "litters").forEach((record) => definitions.push(...litterDefinitions(state, record)));
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
    deriveTaskDefinitions
  });
});
