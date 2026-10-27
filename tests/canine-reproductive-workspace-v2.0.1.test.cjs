"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
require("../canine-reproductive-core-v2.0.1.js");

class FakeOverlay {
  constructor() { this.id = ""; this.dataset = {}; this.listeners = {}; this.forms = []; this.className = ""; }
  setAttribute() {}
  addEventListener(name, fn) { this.listeners[name] = fn; }
  appendChild(node) { if (this.owner) this.owner.overlay = node; else this.overlay = node; }
  remove() { this.removed = true; }
  querySelectorAll(selector) { return selector === "form" ? this.forms : []; }
}

class FakeDocument {
  constructor() { this.body = new FakeOverlay(); this.body.owner = this; this.overlay = null; }
  createElement() { return new FakeOverlay(); }
  getElementById(id) { return id === "hh-canine-repro-workspace" && !this.overlay?.removed ? this.overlay : null; }
  addOverlay(node) { this.overlay = node; }
}

class FakeFormData {
  constructor(form) { this.form = form; }
  [Symbol.iterator]() { return Object.entries(this.form.values)[Symbol.iterator](); }
}

function setup({ commit = true } = {}) {
  const document = new FakeDocument();
  const messages = [];
  let state = {
    animals: [
      { id: "dam", name: "Mabel", species: "Dog", sex: "Female", breed: "Labrador", userId: "acct-a" },
      { id: "owned-sire", name: "Rex", species: "Dog", sex: "Male", breed: "Poodle", userId: "acct-a" },
      { id: "rabbit", name: "Bun", species: "Rabbit", sex: "Female", userId: "acct-a" }
    ], breedings: [{ id: "rabbit-breeding", femaleId: "rabbit", dueDate: "2026-06-01" }], tasks: []
  };
  let saves = 0;
  global.document = document;
  global.FormData = FakeFormData;
  global.HerdHarborCloud = { getSession: () => ({ user: { id: "acct-a" } }) };
  global.HerdHarborApp = {
    getState: () => state,
    commitState(next) { saves += 1; if (!commit) return false; state = next; return true; },
    toast(message, type) { messages.push({ message, type }); }
  };
  const workspace = require("../canine-reproductive-workspace-v2.0.1.js");
  function form(type, values = {}, dataset = {}) {
    return { dataset: { form: type, ...dataset }, values, listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; } };
  }
  function submit(type, values, dataset = {}) {
    const row = form(type, values, dataset);
    document.overlay.forms = [row];
    workspace.openForAnimal("dam");
    document.overlay.forms = [row];
    let prevented = false;
    row.listeners.submit({ preventDefault() { prevented = true; } });
    return { row, prevented, get state() { return state; }, saves, messages };
  }
  return { workspace, document, messages, get state() { return state; }, set state(value) { state = value; }, get saves() { return saves; }, form, submit };
}

function boundSubmit(env, row) {
  let prevented = false;
  row.listeners.submit({ preventDefault() { prevented = true; } });
  return prevented;
}

test("female dog record opens the workspace and cycle records survive close and reopen", () => {
  const env = setup();
  assert.equal(env.workspace.openForAnimal("dam"), true);
  assert.match(env.document.overlay.innerHTML, /Heat cycles/);
  const cycle = env.form("cycle", { observedHeatStartDate: "2026-03-07", observedStage: "unknown", observation: "First observed" });
  env.document.overlay.forms = [cycle];
  env.workspace.openForAnimal("dam");
  env.document.overlay.forms = [cycle];
  assert.equal(boundSubmit(env, cycle), true);
  assert.equal(env.state.canineReproductiveCycles.length, 1);
  assert.equal(env.state.canineReproductiveCycles[0].observedStage, "unknown");
  env.workspace.close();
  assert.equal(env.workspace.openForAnimal("dam"), true);
  assert.match(env.document.overlay.innerHTML, /2026-03-07/);
  assert.equal(env.workspace.openForAnimal("rabbit"), false);
  assert.equal(env.state.breedings[0].dueDate, "2026-06-01");
});

test("external stud plan and mating event keep sire references explicit and pregnancy unconfirmed", () => {
  const env = setup();
  env.workspace.openForAnimal("dam");
  const planForm = env.form("plan", {
    sireRef: "", externalDisplayName: "Scout", externalRegisteredName: "North Scout", externalBreed: "Poodle",
    externalRegistry: "UKC", externalRegistrationNumber: "UKC-42", plannedDates: "2026-04-01, 2026-04-03", plannedMethod: "natural_service",
    registrationDetails: "UKC", healthTesting: "Breeder entered", notes: ""
  });
  env.document.overlay.forms = [planForm];
  env.workspace.openForAnimal("dam");
  env.document.overlay.forms = [planForm];
  boundSubmit(env, planForm);
  assert.equal(env.state.canineExternalStuds.length, 1);
  assert.equal(env.state.canineExternalStuds[0].ownerScope, "external_reference");
  assert.equal(env.state.animals.some(row => row.id === env.state.canineExternalStuds[0].id), false);
  assert.equal(env.state.canineBreedingPlans.length, 1);
  const plan = env.state.canineBreedingPlans[0];
  assert.equal(plan.sireRef.type, "external_stud");
  assert.deepEqual(plan.plannedDates, ["2026-04-01", "2026-04-03"]);
  const event = env.form("event", {
    date: "2026-04-02", time: "09:15", sireRef: "unknown", method: "artificial_insemination", outcome: "Recorded",
    veterinaryInvolvement: "Clinic collected sample", notes: ""
  }, { plan: plan.id });
  env.document.overlay.forms = [event];
  env.workspace.openForAnimal("dam");
  env.document.overlay.forms = [event];
  boundSubmit(env, event);
  assert.equal(env.state.canineBreedingPlans[0].events.length, 1);
  assert.deepEqual(env.state.canineBreedingPlans[0].events[0].sireRef, { type: "unknown" });
  assert.equal(env.state.canineBreedingPlans[0].pregnancy.status, "not_evaluated");
  assert.equal(env.state.canineBreedingPlans[0].pregnancy.estimate, null);
});

test("failed local save preserves state and does not report success", () => {
  const env = setup({ commit: false });
  const before = JSON.stringify(env.state);
  env.workspace.openForAnimal("dam");
  const cycle = env.form("cycle", { observedHeatStartDate: "2026-03-07", observedStage: "unknown", observation: "" });
  env.document.overlay.forms = [cycle];
  env.workspace.openForAnimal("dam");
  env.document.overlay.forms = [cycle];
  boundSubmit(env, cycle);
  assert.equal(JSON.stringify(env.state), before);
  assert.equal(env.messages.at(-1).type, "error");
  assert.match(env.messages.at(-1).message, /local save failed/);
});

test("stale concurrent canine edits and account changes are rejected before commit", () => {
  const env = setup();
  env.workspace.openForAnimal("dam");
  const cycle = env.form("cycle", { observedHeatStartDate: "2026-03-07", observedStage: "unknown", observation: "" });
  env.document.overlay.forms = [cycle];
  env.workspace.openForAnimal("dam");
  env.document.overlay.forms = [cycle];
  env.state.canineReproductiveCycles = [{ id: "newer", femaleId: "dam", observedHeatStartDate: "2026-03-08", status: "open" }];
  boundSubmit(env, cycle);
  assert.equal(env.saves, 0);
  assert.match(env.messages.at(-1).message, /changed elsewhere/);
  env.workspace.openForAnimal("dam");
  const another = env.form("cycle", { observedHeatStartDate: "2026-03-09", observedStage: "unknown", observation: "" });
  env.document.overlay.forms = [another];
  env.workspace.openForAnimal("dam");
  env.document.overlay.forms = [another];
  global.HerdHarborCloud = { getSession: () => ({ user: { id: "acct-b" } }) };
  boundSubmit(env, another);
  assert.equal(env.saves, 0);
  assert.match(env.messages.at(-1).message, /account changed/);
});

test("custom cycle reminders create stable linked tasks and cycle cancellation closes only those tasks", () => {
  const env = setup();
  env.state.canineReproductiveCycles = [{ id: "cycle-1", femaleId: "dam", observedHeatStartDate: "2026-03-01", observedStage: "unknown", status: "open", eventHistory: [] }];
  env.state.tasks = [{ id: "unrelated", title: "Rabbit task", animalId: "rabbit", completed: false }];
  env.workspace.openForAnimal("dam");
  const reminder = env.form("cycle-reminder", { title: "Call reproductive vet", date: "2026-03-08", notes: "Owner scheduled" }, { id: "cycle-1" });
  env.document.overlay.forms = [reminder];
  env.workspace.openForAnimal("dam");
  env.document.overlay.forms = [reminder];
  boundSubmit(env, reminder);
  const task = env.state.tasks.find(row => row.sourceRecordId === "cycle-1");
  assert.ok(task);
  assert.match(task.id, /^task_canine_cycle_cycle-1_reminder_/);
  assert.equal(task.sourceType, "canine_reproductive_cycle");
  assert.equal(env.state.canineReproductiveCycles[0].customReminders[0].taskId, task.id);
  const close = env.form("cycle-update", { observedStage: "unknown", status: "cancelled", notes: "Cycle ended" }, { id: "cycle-1" });
  env.document.overlay.forms = [close];
  env.workspace.openForAnimal("dam");
  env.document.overlay.forms = [close];
  boundSubmit(env, close);
  assert.equal(env.state.tasks.find(row => row.id === task.id).completed, true);
  assert.equal(env.state.tasks.find(row => row.id === "unrelated").completed, false);
});

test("cancelling a plan closes its own stable reminders and retains unrelated tasks", () => {
  const env = setup();
  env.state.canineBreedingPlans = [{ id: "plan-1", damId: "dam", sireRef: { type: "unknown" }, status: "planned", plannedDates: [], events: [], pregnancy: { status: "awaiting_assessment" } }];
  env.state.tasks = [
    { id: "task_canine_plan-1_planned-breeding", sourceType: "canine_breeding_plan", sourceRecordId: "plan-1", completed: false },
    { id: "task_canine_plan-1_whelping-window", sourceType: "canine_breeding_plan", sourceRecordId: "plan-1", completed: false },
    { id: "other-task", sourceType: "rabbit_breeding", sourceRecordId: "other", completed: false }
  ];
  env.workspace.openForAnimal("dam");
  const cancel = env.form("plan-cancel", {}, { plan: "plan-1" });
  env.document.overlay.forms = [cancel];
  env.workspace.openForAnimal("dam");
  env.document.overlay.forms = [cancel];
  boundSubmit(env, cancel);
  assert.equal(env.state.canineBreedingPlans[0].status, "cancelled");
  assert.equal(env.state.tasks[0].completed, true);
  assert.equal(env.state.tasks[1].completed, true);
  assert.equal(env.state.tasks[2].completed, false);
});


test("saved manual and veterinarian whelping estimates display their actual source, not a mating-date replacement", () => {
  const env = setup();
  const base = { id: "plan-dating", damId: "dam", sireRef: { type: "owned_dog", id: "owned-sire" },
    status: "mated", plannedDates: [], plannedMethod: "natural_service",
    events: [{ id: "event-one", date: "2026-04-01", sireRef: { type: "owned_dog", id: "owned-sire" }, method: "natural_service" }] };
  env.state.canineBreedingPlans = [{
    ...base, pregnancy: { status: "awaiting_assessment",
      estimate: { method: "manual", startDate: "2026-06-18", endDate: "2026-06-21" } }
  }];
  assert.equal(env.workspace.openForAnimal("dam"), true);
  let html = env.document.overlay.innerHTML;
  assert.match(html, /2026-06-18/);
  assert.match(html, /2026-06-21/);
  assert.match(html, /Manually entered expected dates/);
  assert.doesNotMatch(html, /Broad estimate from recorded mating dates/);
  env.state.canineBreedingPlans[0].pregnancy.estimate = {
    method: "vet_expected", startDate: "2026-06-16", endDate: "2026-06-19", veterinarian: "Dr. Smith"
  };
  env.workspace.openForAnimal("dam");
  html = env.document.overlay.innerHTML;
  assert.match(html, /2026-06-16/);
  assert.match(html, /Veterinarian-provided expected dates/);
  assert.doesNotMatch(html, /Manually entered expected dates/);
});

test("closing then reopening a heat cycle restores only reminders automatically closed by that cycle", () => {
  const env = setup();
  const linked = "task_canine_cycle_cycle-1_reminder-1";
  const manuallyDone = "task_canine_cycle_cycle-1_manual-done";
  env.state.canineReproductiveCycles = [{
    id: "cycle-1", femaleId: "dam", observedHeatStartDate: "2026-03-01",
    observedStage: "unknown", status: "open", customReminders: [
      { id: "reminder-1", taskId: linked, title: "Call clinic", date: "2026-03-10" },
      { id: "manually-done", taskId: manuallyDone, title: "Done appointment", date: "2026-03-02" }
    ], eventHistory: []
  }];
  env.state.tasks = [
    { id: linked, sourceType: "canine_reproductive_cycle", sourceRecordId: "cycle-1", completed: false },
    { id: manuallyDone, sourceType: "canine_reproductive_cycle", sourceRecordId: "cycle-1", completed: true, completedAt: "2026-03-02" },
    { id: "rabbit-task", sourceType: "rabbit_breeding", sourceRecordId: "rabbit", completed: false }
  ];
  env.workspace.openForAnimal("dam");
  const close = env.form("cycle-update", { observedStage: "unknown", status: "cancelled", notes: "" }, { id: "cycle-1" });
  env.document.overlay.forms = [close];
  env.workspace.openForAnimal("dam");
  env.document.overlay.forms = [close];
  assert.equal(boundSubmit(env, close), true);
  assert.equal(env.state.tasks.find(row => row.id === linked).completed, true);
  assert.equal(env.state.tasks.find(row => row.id === linked).completionReason, "canine_cycle_closed");
  const reopen = env.form("cycle-update", { observedStage: "unknown", status: "open", notes: "" }, { id: "cycle-1" });
  env.document.overlay.forms = [reopen];
  env.workspace.openForAnimal("dam");
  env.document.overlay.forms = [reopen];
  assert.equal(boundSubmit(env, reopen), true);
  assert.equal(env.state.tasks.find(row => row.id === linked).completed, false);
  assert.equal(env.state.tasks.find(row => row.id === linked).completionReason, undefined);
  assert.equal(env.state.tasks.find(row => row.id === manuallyDone).completed, true,
    "a reminder manually completed before cycle closure must remain done");
  assert.equal(env.state.tasks.find(row => row.id === "rabbit-task").completed, false);
});

test("closed heat cycles cannot create new active custom reminders", () => {
  const env = setup();
  env.state.canineReproductiveCycles = [{
    id: "closed-cycle", femaleId: "dam", observedHeatStartDate: "2026-03-01", status: "closed"
  }];
  env.workspace.openForAnimal("dam");
  const form = env.form("cycle-reminder", { date: "2026-03-12", title: "Call vet" }, { id: "closed-cycle" });
  env.document.overlay.forms = [form];
  env.workspace.openForAnimal("dam");
  env.document.overlay.forms = [form];
  boundSubmit(env, form);
  assert.equal(env.saves, 0);
  assert.equal((env.state.tasks || []).length, 0);
  assert.match(env.messages.at(-1).message, /Reopen this heat cycle/);
});
