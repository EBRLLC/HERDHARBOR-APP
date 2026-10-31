"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../herdharbor-app-runtime.js"), "utf8");
const begin = source.indexOf("  function renderDashboard() {");
const end = source.indexOf("  function greeting() {", begin);
assert.ok(begin >= 0 && end > begin, "dashboard renderer is available");

// Evaluate the actual runtime renderer with a deterministic fake DOM. This
// catches querySelector/querySelectorAll mistakes which static checks miss.
const renderer = source.slice(begin, end);

function renderFixture(tasks, ownerName) {
  const state = {
    profile: { operationName: "Test farm", ownerName },
    animals: [],
    breedings: [],
    litters: [],
    tasks,
    activity: [],
    transactions: [],
    budgetMonthSettings: {}
  };
  const dashboard = { innerHTML: "" };
  const checkboxNodes = new Map();
  const saved = [];
  const node = () => ({ addEventListener() {} });
  const context = {
    state,
    $: (selector) => selector === "#view-dashboard" ? dashboard
      : selector === "#dashboard-view-tasks" || selector === "#dashboard-budget-snapshot" ? node()
      : null,
    $$: (selector) => {
      if (selector !== "[data-dashboard-task]") return [];
      // Simulate DOM querySelectorAll against the newly rendered task markup.
      return tasks.filter((task) => dashboard.innerHTML.includes(`data-dashboard-task="${task.id}"`))
        .map((task) => {
          if (!checkboxNodes.has(task.id)) {
            const events = {};
            checkboxNodes.set(task.id, {
              dataset: { dashboardTask: task.id },
              checked: false,
              addEventListener(type, callback) { events[type] = callback; },
              triggerChange() { events.change(); }
            });
          }
          return checkboxNodes.get(task.id);
        });
    },
    taskRuntime: () => ({ syncDerivedAutomation() {}, setFilterStatus() {} }),
    activeAnimals: () => [],
    todayISO: () => "2026-10-30",
    currentMonthKey: () => "2026-10",
    monthLabel: () => "October 2026",
    budgetSummary: () => ({ income: 0, operating: 0, net: 0 }),
    operationCostPerHead: () => 0,
    headerHtml: (title) => title,
    statCard: () => "",
    emptyState: () => "",
    taskSort: () => 0,
    taskRecurrenceLabel: () => "",
    formatDate: (date) => date || "",
    normalizeBreedingStatus: () => "Delivered",
    animalName: () => "",
    daysFromNow: () => null,
    greeting: () => "evening",
    listItemHtml: () => "",
    formatMoney: () => "$0.00",
    esc: (x) => String(x ?? ""),
    recordActivity() {},
    setTaskCompleted(task, checked) { task.completed = checked; return null; },
    saveState(message) { saved.push(message); },
    openAnimalForm() {},
    openTaskForm() {},
    navigate() {}
  };
  vm.runInNewContext(`${renderer}\nrenderDashboard();`, context, {
    filename: "herdharbor-dashboard-renderer.js"
  });
  return { dashboard, checkboxNodes, saved, state };
}

test("dashboard renders after cloud hydration with an empty task collection", () => {
  const fixture = renderFixture([], "Owner Example");
  assert.match(fixture.dashboard.innerHTML, /Good evening, Owner\./);
  assert.equal(fixture.checkboxNodes.size, 0);
});

test("partial verified cloud profile without ownerName cannot crash dashboard", () => {
  const fixture = renderFixture([], undefined);
  assert.match(fixture.dashboard.innerHTML, /Good evening, breeder\./);
});

test("dashboard registers handlers for multiple due tasks and persists completion", () => {
  const tasks = [
    { id: "t1", title: "Feed rabbits", dueDate: "2026-10-30", completed: false },
    { id: "t2", title: "Check dogs", dueDate: "2026-10-29", completed: false }
  ];
  const fixture = renderFixture(tasks, "Owner Example");
  assert.equal(fixture.checkboxNodes.size, 2);
  assert.match(fixture.dashboard.innerHTML, /Feed rabbits/);
  assert.match(fixture.dashboard.innerHTML, /Check dogs/);
  const box = fixture.checkboxNodes.get("t1");
  box.checked = true;
  box.triggerChange();
  assert.equal(tasks[0].completed, true);
  assert.equal(fixture.saved.length, 1);
  assert.match(fixture.saved[0], /Task completed/);
});
