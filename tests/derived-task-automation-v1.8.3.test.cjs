"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const Automation = require("../task-automation-v1.8.3.js");
const TaskRuntime = require("../task-runtime-v1.8.3.js");

function addDays(dateString, days) {
  const date = new Date(dateString + "T12:00:00");
  date.setDate(date.getDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

function fixture() {
  return {
    animals: [
      { id: "d1", name: "Daisy", species: "Rabbit", sex: "Female" },
      { id: "s1", name: "Buckley", species: "Rabbit", sex: "Male" }
    ],
    breedings: [{
      id: "b1", femaleId: "d1", maleId: "s1", status: "Bred",
      pregnancyCheckDate: "2026-09-25", nestBoxDate: "2026-10-20", dueDate: "2026-10-23",
      followUpDate: "2026-09-28", pregnancyCheckStatus: "Not checked"
    }],
    litters: [{
      id: "l1", damId: "d1", sireId: "s1", birthDate: "2026-08-01",
      expectedWeanDate: "2026-08-29", followUpDate: "2026-09-30",
      bornAlive: "4", fosteredIn: "0", fosteredOut: "0", lostBeforeWeaning: "0", weaned: "2"
    }],
    health: [
      { id: "h-med", animalId: "d1", type: "Medication", date: "2026-09-20", followUpDate: "2026-09-27", followUpRecurrence: "Weekly", details: "Medication recorded." },
      { id: "h-vax", animalId: "d1", type: "Vaccination", date: "2026-09-21", followUpDate: "2026-10-21", followUpRecurrence: "None", details: "Vaccination recorded." },
      { id: "h-care", animalId: "d1", type: "Treatment", date: "2026-09-22", followUpDate: "2026-10-01", followUpRecurrence: "Custom", followUpRecurrenceDays: "10", details: "Routine care." }
    ],
    tasks: []
  };
}

function createApi(state, today = "2026-09-22") {
  let saves = 0;
  const noop = () => {};
  const html = () => "";
  const api = TaskRuntime.create({
    getState: () => state,
    getCurrentRoute: () => "tasks",
    $: () => null,
    $$: () => [],
    esc: (value) => String(value ?? ""),
    headerHtml: html,
    statCard: html,
    emptyState: html,
    animalName: (id) => state.animals?.find((a) => a.id === id)?.name || "Unknown",
    formatDate: (value) => String(value || ""),
    daysFromNow: (date) => Math.round((new Date(date + "T12:00:00") - new Date(today + "T12:00:00")) / 86400000),
    scheduleUiWork: (_key, work) => work?.(),
    openModal: noop,
    closeModal: noop,
    field: html,
    selectField: html,
    selectAnimalField: html,
    textareaField: html,
    todayISO: () => today,
    addDays,
    uid: (prefix) => prefix + "-test",
    recordActivity: noop,
    saveState: () => { saves += 1; return true; },
    renderCurrentView: noop
  });
  return { api, getSaves: () => saves };
}

test("Phase 9F preserves existing breeding/pregnancy/birth/weaning producer ownership", () => {
  const source = read("breeding-litter-runtime-v1.8.3.js");
  assert.match(source, /function syncBreedingReminders\(/);
  assert.match(source, /workflowTaskId\("breeding", breeding\.id, "pregnancy-check"\)/);
  assert.match(source, /workflowTaskId\("breeding", breeding\.id, "prepare-birth"\)/);
  assert.match(source, /workflowTaskId\("breeding", breeding\.id, "expected-birth"\)/);
  assert.match(source, /function syncBirthReminder\(/);
  assert.match(source, /workflowTaskId\("birth", litter\.id, "weaning"\)/);

  const definitions = Automation.deriveTaskDefinitions(fixture());
  assert.equal(definitions.some((row) => row.reminderType === "pregnancy-check"), false);
  assert.equal(definitions.some((row) => row.reminderType === "weaning"), false);
});

test("derived follow-up definitions use deterministic source IDs and canonical provenance", () => {
  const definitions = Automation.deriveTaskDefinitions(fixture());
  const ids = definitions.map((row) => row.id).sort();
  assert.deepEqual(ids, [
    "task_birth_l1_litter-follow-up",
    "task_breeding_b1_breeding-follow-up",
    "task_health_h-care_health-follow-up",
    "task_health_h-med_medication-follow-up",
    "task_health_h-vax_vaccination-follow-up"
  ].sort());

  const med = definitions.find((row) => row.sourceRecordId === "h-med");
  assert.equal(med.sourceType, "health");
  assert.equal(med.reminderType, "medication-follow-up");
  assert.equal(med.recurrence, "Weekly");
  assert.equal(med.recurrenceDays, "");
  assert.match(med.title, /Daisy/);

  const care = definitions.find((row) => row.sourceRecordId === "h-care");
  assert.equal(care.recurrence, "Custom");
  assert.equal(care.recurrenceDays, "10");
});

test("TaskRuntime reconciliation is idempotent and creates no duplicate derived tasks", () => {
  const state = fixture();
  const { api, getSaves } = createApi(state);
  const first = api.syncDerivedAutomation("2026-09-22T12:00:00.000Z");
  assert.equal(first.created, 5);
  assert.equal(state.tasks.length, 5);
  assert.equal(getSaves(), 1);

  const second = api.syncDerivedAutomation("2026-09-22T12:01:00.000Z");
  assert.deepEqual(second, { changed: false, created: 0, updated: 0, completed: 0, reopened: 0 });
  assert.equal(state.tasks.length, 5);
  assert.equal(new Set(state.tasks.map((row) => row.id)).size, 5);
  assert.equal(getSaves(), 1);
});

test("existing canonical breeding reminders are not duplicated or adopted by Phase 9F automation", () => {
  const state = fixture();
  state.tasks.push({
    id: "task_breeding_b1_pregnancy-check",
    title: "Pregnancy check: Daisy",
    category: "Breeding",
    dueDate: "2026-09-25",
    sourceType: "breeding",
    sourceRecordId: "b1",
    reminderType: "pregnancy-check",
    recurrence: "None",
    completed: false
  });
  const { api } = createApi(state);
  api.syncDerivedAutomation();
  assert.equal(state.tasks.filter((row) => row.id === "task_breeding_b1_pregnancy-check").length, 1);
  assert.equal(state.tasks.find((row) => row.id === "task_breeding_b1_pregnancy-check").automationManaged, undefined);
});

test("completed recurring Health task creates one next occurrence and automation does not reopen or duplicate it", () => {
  const state = fixture();
  const { api } = createApi(state);
  api.syncDerivedAutomation("2026-09-22T12:00:00.000Z");
  const task = state.tasks.find((row) => row.id === "task_health_h-med_medication-follow-up");
  assert.ok(task);
  assert.equal(task.recurrence, "Weekly");

  const next = api.setTaskCompleted(task, true, "2026-09-27T12:00:00.000Z");
  assert.equal(next.id, "task_occurrence_task_health_h-med_medication-follow-up_20261004");
  assert.equal(next.dueDate, "2026-10-04");
  assert.equal(state.tasks.length, 6);

  api.syncDerivedAutomation("2026-09-27T12:01:00.000Z");
  assert.equal(task.completed, true);
  assert.equal(state.tasks.filter((row) => row.id === next.id).length, 1);

  api.setTaskCompleted(task, true, "2026-09-27T12:02:00.000Z");
  assert.equal(state.tasks.filter((row) => row.id === next.id).length, 1);
});

test("a real canonical source date change may reopen a completed non-recurring automation task", () => {
  const state = fixture();
  const { api } = createApi(state);
  api.syncDerivedAutomation("2026-09-22T12:00:00.000Z");
  const task = state.tasks.find((row) => row.id === "task_health_h-vax_vaccination-follow-up");
  api.setTaskCompleted(task, true, "2026-10-21T12:00:00.000Z");
  assert.equal(task.completed, true);

  state.health.find((row) => row.id === "h-vax").followUpDate = "2026-11-21";
  const result = api.syncDerivedAutomation("2026-10-22T12:00:00.000Z");
  assert.equal(result.reopened, 1);
  assert.equal(task.completed, false);
  assert.equal(task.dueDate, "2026-11-21");
});

test("removing a source due date closes the existing automation task instead of inventing another date", () => {
  const state = fixture();
  const { api } = createApi(state);
  api.syncDerivedAutomation("2026-09-22T12:00:00.000Z");
  const task = state.tasks.find((row) => row.id === "task_health_h-care_health-follow-up");
  state.health.find((row) => row.id === "h-care").followUpDate = "";
  const result = api.syncDerivedAutomation("2026-09-23T12:00:00.000Z");
  assert.ok(result.completed >= 1);
  assert.equal(task.completed, true);
});

test("deleting a canonical source closes its automation-managed root task without touching manual or recurring occurrence tasks", () => {
  const state = fixture();
  const { api } = createApi(state);
  api.syncDerivedAutomation("2026-09-22T12:00:00.000Z");
  state.tasks.push({ id: "manual", title: "Manual task", completed: false });
  state.health = state.health.filter((row) => row.id !== "h-vax");
  api.syncDerivedAutomation("2026-09-23T12:00:00.000Z");
  assert.equal(state.tasks.find((row) => row.id === "task_health_h-vax_vaccination-follow-up").completed, true);
  assert.equal(state.tasks.find((row) => row.id === "manual").completed, false);
});

test("task synchronization and completion never mutate Health, breeding, litter or animal records", () => {
  const state = fixture();
  const canonicalBefore = JSON.stringify({
    animals: state.animals,
    breedings: state.breedings,
    litters: state.litters,
    health: state.health
  });
  const { api } = createApi(state);
  api.syncDerivedAutomation("2026-09-22T12:00:00.000Z");
  const task = state.tasks.find((row) => row.id === "task_health_h-med_medication-follow-up");
  api.setTaskCompleted(task, true, "2026-09-27T12:00:00.000Z");
  assert.equal(JSON.stringify({
    animals: state.animals,
    breedings: state.breedings,
    litters: state.litters,
    health: state.health
  }), canonicalBefore);
});

test("Health form validates recurring-care metadata and uses no separate reminder store", () => {
  const source = read("health-runtime-v1.8.3.js");
  assert.match(source, /Repeat follow-up/);
  assert.match(source, /followUpRecurrenceDays/);
  assert.match(source, /Custom follow-up repeat days must be between 1 and 365/);
  assert.doesNotMatch(source, /reminderStore|notificationStore|localStorage|indexedDB/);
});

test("Phase 9F shell loads Task automation before Health and Task runtimes and keeps it offline-safe", () => {
  const html = read("index.html");
  const worker = read("service-worker.js");
  const pkg = JSON.parse(read("package.json"));
  const automationIndex = html.indexOf("task-automation-v1.8.3.js?v=1");
  assert.ok(automationIndex >= 0);
  assert.ok(automationIndex < html.indexOf("health-runtime-v1.8.3.js?v=1"));
  assert.ok(automationIndex < html.indexOf("task-runtime-v1.8.3.js?v=1"));
  assert.match(worker, /\.\/task-automation-v1\.8\.3\.js\?v=1/);
  assert.match(worker, /"\/task-automation-v1\.8\.3\.js"/);
  assert.match(pkg.scripts["test:v1.8.3"], /derived-task-automation-v1\.8\.3\.test\.cjs/);
});

test("automation module is definition-only and TaskRuntime remains the state.tasks mutation owner", () => {
  const automationSource = read("task-automation-v1.8.3.js");
  const taskSource = read("task-runtime-v1.8.3.js");
  assert.doesNotMatch(automationSource, /\.tasks\.(?:push|splice)|state\.tasks\s*=|saveState|localStorage|indexedDB/);
  assert.match(taskSource, /function syncDerivedAutomation\(/);
  assert.match(taskSource, /state\.tasks\.push|stateNow\(\)\.tasks\.push/);
  assert.match(taskSource, /automationManaged/);
});
