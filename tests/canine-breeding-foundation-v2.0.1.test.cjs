"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Runtime = require("../breeding-litter-runtime-v1.8.3.js");

function makeState(litterCount = 0) {
  return {
    animals: [
      { id: "dam", name: "Willow", species: "Rabbit", sex: "Female" },
      { id: "sire", name: "Atlas", species: "Rabbit", sex: "Male" }
    ],
    breedings: [],
    litters: Array.from({ length: litterCount }, (_, index) => ({
      id: `litter-${index + 1}`, damId: "dam", sireId: "sire", birthDate: `2026-09-${String(index + 1).padStart(2, "0")}`,
      bornAlive: 2, stillborn: 0, fosteredIn: 0, fosteredOut: 0, lostBeforeWeaning: 0, weaned: 0,
      offspringIds: []
    })),
    tasks: [],
    health: [],
    activity: []
  };
}

function baseDeps(state, overrides = {}) {
  const noop = () => {};
  const html = (title, description) => title ? `HEADER:${title}` : `EMPTY:${description || ""}`;
  return {
    getState: () => state,
    $: () => null,
    $$: () => [],
    esc: value => String(value ?? ""),
    headerHtml: html,
    statCard: html,
    emptyState: html,
    animalName: id => state.animals.find(animal => animal.id === id)?.name || "Unknown",
    formatDate: value => value || "—",
    daysFromNow: () => null,
    ensureSpreadsheetToolsReady: async () => ({}),
    openModal: noop,
    closeModal: noop,
    selectAnimalField: html,
    field: html,
    selectField: html,
    textareaField: html,
    todayISO: () => "2026-10-01",
    toast: noop,
    navigate: noop,
    uid: prefix => `${prefix}-new`,
    recordActivity: noop,
    saveState: () => true,
    renderCurrentView: noop,
    addDays: (date, days) => {
      const result = new Date(`${date}T12:00:00Z`);
      result.setUTCDate(result.getUTCDate() + Number(days));
      return result.toISOString().slice(0, 10);
    },
    allowsAnimalTransition: () => true,
    rememberBreed: noop,
    completeWorkflowTasks: noop,
    ...overrides
  };
}

for (const litterCount of [0, 1, 3]) {
  test(`Births/Litters renderer handles ${litterCount} litter record(s) using collection selectors`, () => {
    const state = makeState(litterCount);
    const view = { innerHTML: "" };
    const addButton = { addEventListener() {} };
    const selectors = [];
    const collections = [];
    const matches = (selector, count) => Array.from({ length: count }, (_, index) => ({
      dataset: selector.includes("edit") ? { editLitter: `litter-${index + 1}` } : { createOffspring: `litter-${index + 1}` },
      addEventListener() {}
    }));
    const api = Runtime.create(baseDeps(state, {
      $: selector => selector === "#view-litters" ? view : selector === "#add-litter" ? addButton : null,
      $$: (selector, parent) => {
        selectors.push(selector);
        assert.equal(parent, view);
        const result = matches(selector, state.litters.length);
        collections.push(result.length);
        return result;
      }
    }));

    assert.doesNotThrow(() => api.renderLitters());
    assert.match(view.innerHTML, /HEADER:Births and litters/);
    if (litterCount === 0) assert.match(view.innerHTML, /No births recorded/);
    else assert.equal((view.innerHTML.match(/class="animal-card"/g) || []).length, litterCount);
    assert.deepEqual(collections, [litterCount, litterCount]);
    assert.deepEqual(selectors, ["[data-edit-litter]", "[data-create-offspring]"]);
  });
}

test("failed local persistence restores breeding, litter, task, and activity mutations", () => {
  const state = makeState(1);
  const initial = JSON.stringify(state);
  const errors = [];
  const api = Runtime.create(baseDeps(state, {
    saveState: () => false,
    toast: (message, kind) => errors.push({ message, kind })
  }));

  const saved = api.persistMutation("Should not report success", () => {
    state.breedings.push({ id: "b-new" });
    state.litters[0].breedingId = "b-new";
    state.tasks.push({ id: "task-new" });
    state.activity.push({ id: "activity-new" });
  });

  assert.equal(saved, false);
  assert.equal(JSON.stringify(state), initial);
  assert.deepEqual(errors, [], "saveState owns the local durability error message; transaction emits no success toast");
});

test("failed mutation preparation restores state if a dependent helper throws", () => {
  const state = makeState(1);
  const initial = JSON.stringify(state);
  const errors = [];
  const api = Runtime.create(baseDeps(state, { toast: (message, kind) => errors.push({ message, kind }) }));

  const saved = api.persistMutation("Not saved", () => {
    state.litters[0].bornAlive = 99;
    throw new Error("injected mutation failure");
  });

  assert.equal(saved, false);
  assert.equal(JSON.stringify(state), initial);
  assert.equal(errors[0].kind, "error");
});

test("legacy generic workflow does not assign an exact canine due date from mating date alone", () => {
  const state = makeState();
  state.animals = [
    { id: "dam", name: "Willow", species: "Dog", sex: "Female" },
    { id: "sire", name: "Atlas", species: "Dog", sex: "Male" }
  ];
  const api = Runtime.create(baseDeps(state));
  assert.equal(api.breedingSchedule("dam", "2026-10-01").rule, null);
  assert.equal(api.breedingSchedule("dam", "2026-10-01").dueDate, "");
  assert.ok(Runtime.GESTATION_RULES.Rabbit, "established rabbit timing remains unchanged");
  const importer = fs.readFileSync(path.join(__dirname, "..", "spreadsheet-import.js"), "utf8");
  assert.doesNotMatch(importer, /gestationDays\s*=\s*\{[^}]*Dog\s*:/);
});

test("all breeding/litter CRUD and puppy generation paths use the transactional persistence boundary", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "breeding-litter-runtime-v1.8.3.js"), "utf8");
  assert.equal((source.match(/persistMutation\(/g) || []).length, 6);
  const start = source.indexOf("    function renderLitters() {");
  const end = source.indexOf("\n    function openLitterForm", start);
  const renderer = source.slice(start, end);
  assert.doesNotMatch(renderer, /(?<!\$)\$\s*\('\[data-(?:edit-litter|create-offspring)\]'/);
  assert.match(renderer, /\$\$\('\[data-edit-litter\]'/);
  assert.match(renderer, /\$\$\('\[data-create-offspring\]'/);
});
