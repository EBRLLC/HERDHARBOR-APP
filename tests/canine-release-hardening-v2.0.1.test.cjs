"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const normalizer = require("../cloud-state-normalizer-v1.8.3.js");
const TaskRuntime = require("../task-runtime-v1.8.3.js");

const repo = path.join(__dirname, "..");
const read = name => fs.readFileSync(path.join(repo, name), "utf8");

test("legacy state normalization preserves optional canine cycles, plans, whelpings, puppies, and rabbit litters", () => {
  const state = {
    animals: [
      { id: "dam-a", species: "Dog", sex: "Female", userId: "acct-a" },
      { id: "pup-a", species: "Dog", sex: "Unknown", damId: "dam-a", sireId: "", sourceBirthId: "canine_whelping_plan-a", litterId: "canine_whelping_plan-a", birthOrder: 1, canineParentage: { status: "pending_or_unknown" } },
      { id: "rabbit-a", species: "Rabbit", sex: "Female", userId: "acct-a" }
    ],
    canineReproductiveCycles: [{ id: "cycle-a", femaleId: "dam-a", observedHeatStartDate: "2026-03-01", observedStage: "unknown" }],
    canineExternalStuds: [{ id: "stud-a", accountId: "acct-a", ownerScope: "external_reference", displayName: "Scout" }],
    canineBreedingPlans: [{ id: "plan-a", damId: "dam-a", cycleId: "cycle-a", sireRef: { type: "external_stud", id: "stud-a" }, events: [{ id: "event-a", sireRef: { type: "unknown" } }], pregnancy: { status: "awaiting_assessment" } }],
    canineWhelpings: [{ id: "canine_whelping_plan-a", planId: "plan-a", cycleId: "cycle-a", damId: "dam-a", sireRef: { type: "unknown" }, litterId: "canine_whelping_plan-a", birthDate: "2026-11-01" }],
    litters: [
      { id: "canine_whelping_plan-a", species: "Dog", canineWhelping: true, canineWhelpingId: "canine_whelping_plan-a", damId: "dam-a", offspringIds: ["pup-a"] },
      { id: "rabbit-litter-a", species: "Rabbit", damId: "rabbit-a", offspringIds: ["kit-a"] }
    ],
    tasks: [
      { id: "task_canine_plan-a_assessment", category: "Canine reproduction", animalId: "dam-a", dueDate: "2026-03-02" },
      { id: "rabbit-task-a", category: "Nest box", animalId: "rabbit-a", dueDate: "2026-03-02" }
    ]
  };
  const mapped = normalizer.mapLegacySnapshot(state);
  const roundTripped = normalizer.reassembleLegacySnapshot(mapped.records);
  assert.deepEqual(roundTripped, state);
  assert.equal(roundTripped.animals[1].canineParentage.status, "pending_or_unknown");
  assert.equal(roundTripped.canineBreedingPlans[0].events[0].sireRef.type, "unknown");
  assert.equal(roundTripped.litters[1].species, "Rabbit");
});

test("shared task list and Today filtering keep canine reminders available beside rabbit tasks", () => {
  const state = {
    animals: [
      { id: "dam", name: "Mabel", species: "Dog" },
      { id: "rabbit", name: "Clover", species: "Rabbit" }
    ],
    tasks: [
      { id: "assessment", title: "Schedule pregnancy assessment", category: "Canine reproduction", animalId: "dam", dueDate: "2026-10-27", sourceType: "canine_breeding_plan", completed: false },
      { id: "rabbit-check", title: "Check nest box", category: "Nest box", animalId: "rabbit", dueDate: "2026-10-27", sourceType: "rabbit_breeding", completed: false },
      { id: "later", title: "Prepare whelping area", category: "Canine reproduction", animalId: "dam", dueDate: "2026-11-01", completed: false }
    ]
  };
  const noop = () => {};
  const deps = Object.fromEntries([
    "getCurrentRoute", "$", "$$", "esc", "headerHtml", "statCard", "emptyState", "animalName", "formatDate", "daysFromNow",
    "scheduleUiWork", "openModal", "closeModal", "field", "selectField", "selectAnimalField", "textareaField", "addDays",
    "uid", "recordActivity", "saveState", "renderCurrentView"
  ].map(name => [name, noop]));
  deps.getState = () => state;
  deps.todayISO = () => "2026-10-27";
  deps.animalName = id => state.animals.find(animal => animal.id === id)?.name || "";
  const runtime = TaskRuntime.create(deps);
  const today = runtime.filterTasks(state.tasks, { status: "Today", category: "Canine reproduction", animalId: "dam", search: "" });
  assert.deepEqual(today.map(row => row.id), ["assessment"]);
  assert.ok(TaskRuntime.taskCategoryOptions(state.tasks[0]).includes("Canine reproduction"));
  assert.ok(TaskRuntime.taskCategoryOptions(state.tasks[1]).includes("Nest box"));
});

test("editing preserves an existing canine task category and cache-busted task runtime is installed", () => {
  const taskSource = read("task-runtime-v1.8.3.js");
  const html = read("index.html");
  const worker = read("service-worker.js");
  assert.match(taskSource, /taskCategoryOptions\(task\), task\.category \|\| "Other"/);
  assert.match(html, /task-runtime-v1\.8\.3\.js\?v=2/);
  assert.match(worker, /\.\/task-runtime-v1\.8\.3\.js\?v=2/);
  assert.match(worker, /canine-reproduction-4/);
});

test("shared dashboard considers canine breeder reminders through the existing task array", () => {
  const app = read("herdharbor-app-runtime.js");
  const start = app.indexOf("  function renderDashboard()");
  const end = app.indexOf("\n  function ", start + 30);
  const source = app.slice(start, end);
  assert.match(source, /for \(const task of state\.tasks\)/);
  assert.match(source, /task\.dueDate && task\.dueDate <= today/);
  assert.doesNotMatch(source, /task\.sourceType\s*===\s*"rabbit_breeding"/);
});
