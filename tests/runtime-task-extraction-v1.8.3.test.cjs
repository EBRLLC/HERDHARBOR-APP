"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const taskSource = read("task-runtime-v1.8.3.js");
const appSource = read("herdharbor-app-runtime.js");
const packageJson = JSON.parse(read("package.json"));
const TaskRuntime = require(path.join(root, "task-runtime-v1.8.3.js"));

function addDays(dateString, days) {
  const date = new Date(dateString + "T12:00:00");
  date.setDate(date.getDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

function createApi(state, today = "2026-09-21") {
  const noop = () => {};
  const html = () => "";
  return TaskRuntime.create({
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
    saveState: () => true,
    renderCurrentView: noop
  });
}

test("Task domain has one extracted runtime owner", () => {
  assert.equal(TaskRuntime.VERSION, "1.8.3");
  assert.deepEqual(TaskRuntime.TASK_RECURRENCE_OPTIONS, ["None", "Daily", "Weekly", "Every 2 weeks", "Monthly", "Custom"]);
  assert.match(taskSource, /root\.HerdHarborTaskRuntime = api/);
  assert.match(taskSource, /function ensureNextRecurringTask\(/);
  assert.match(taskSource, /function setTaskCompleted\(/);
  assert.match(taskSource, /function renderTasks\(/);
  assert.match(taskSource, /function openTaskForm\(/);
});

test("composition runtime delegates task behavior while preserving dashboard callers", () => {
  assert.match(appSource, /HerdHarborTaskRuntime\?\.create/);
  assert.match(appSource, /function setTaskCompleted\(task, completed, now = new Date\(\)\.toISOString\(\)\) \{\s*return taskRuntime\(\)\.setTaskCompleted/);
  assert.match(appSource, /function taskSort\(left, right\) \{\s*return taskRuntime\(\)\.taskSort/);
  assert.match(appSource, /function taskRecurrenceLabel\(task = \{\}\) \{\s*return taskRuntime\(\)\.taskRecurrenceLabel/);
  assert.match(appSource, /function renderTasks\(\) \{\s*return taskRuntime\(\)\.renderTasks\(\)/);
  assert.match(appSource, /function openTaskForm\(id = ""\) \{\s*return taskRuntime\(\)\.openTaskForm\(id\)/);
  assert.match(appSource, /taskRuntime\(\)\.setFilterStatus\("Today"\)/);
  assert.doesNotMatch(appSource, /let taskView =/);
  assert.doesNotMatch(appSource, /id="task-status-filter"/);
  assert.doesNotMatch(appSource, /function renderTaskResults\(\)[\s\S]{0,300}matching task/);
});

test("canonical task state remains the only task state owner", () => {
  assert.match(taskSource, /const stateNow = \(\) => deps\.getState\(\) \|\| \{\}/);
  assert.match(taskSource, /stateNow\(\)\.tasks\.push\(next\)/);
  assert.match(taskSource, /stateNow\(\)\.tasks\.push\(savedTask\)/);
  assert.match(taskSource, /stateNow\(\)\.tasks = stateNow\(\)\.tasks\.filter/);
  assert.doesNotMatch(taskSource, /localStorage|sessionStorage|indexedDB|STORAGE_KEY/);
  assert.doesNotMatch(taskSource, /HerdHarborCloud|cloud-sync-|Supabase|supabase/);
});

test("recurring completion creates exactly one deterministic next occurrence", () => {
  const task = {
    id: "task-feed",
    title: "Feed rabbits",
    category: "Feeding",
    dueDate: "2026-09-21",
    recurrence: "Daily",
    completed: false
  };
  const state = { tasks: [task], animals: [] };
  const api = createApi(state);
  const next = api.setTaskCompleted(task, true, "2026-09-21T15:00:00.000Z");
  assert.equal(next.id, "task_occurrence_task-feed_20260922");
  assert.equal(next.dueDate, "2026-09-22");
  assert.equal(next.generatedFromTaskId, "task-feed");
  assert.equal(next.seriesId, "task-feed");
  assert.equal(state.tasks.length, 2);
  api.setTaskCompleted(task, true, "2026-09-21T15:01:00.000Z");
  assert.equal(state.tasks.length, 2);
});

test("monthly recurrence preserves month-end anchor including leap years", () => {
  const api = createApi({ tasks: [], animals: [] });
  assert.equal(api.taskNextDueDate({ dueDate: "2026-01-31", recurrence: "Monthly" }), "2026-02-28");
  assert.equal(api.taskNextDueDate({ dueDate: "2026-02-28", recurrence: "Monthly", recurrenceAnchorDay: 31 }), "2026-03-31");
  assert.equal(api.taskNextDueDate({ dueDate: "2028-01-31", recurrence: "Monthly" }), "2028-02-29");
});

test("Today filter keeps overdue work visible and supports animal/search filtering", () => {
  const state = {
    animals: [{ id: "a1", name: "Daisy" }],
    tasks: [
      { id: "late", title: "Clean pen", category: "Cleaning", dueDate: "2026-09-20", completed: false },
      { id: "today", title: "Weigh Daisy", category: "Health", dueDate: "2026-09-21", animalId: "a1", completed: false },
      { id: "future", title: "Trim nails", category: "Health", dueDate: "2026-09-22", animalId: "a1", completed: false },
      { id: "done", title: "Feed", category: "Feeding", dueDate: "2026-09-21", completed: true }
    ]
  };
  const api = createApi(state);
  assert.deepEqual(api.filterTasks(state.tasks, { status: "Today", category: "", animalId: "", search: "" }).map(t => t.id), ["late", "today"]);
  assert.deepEqual(api.filterTasks(state.tasks, { status: "Upcoming", category: "", animalId: "a1", search: "daisy" }).map(t => t.id), ["future"]);
  assert.deepEqual(api.filterTasks(state.tasks, { status: "Completed", category: "", animalId: "", search: "" }).map(t => t.id), ["done"]);
});

test("existing breeding and birth reminder producers remain outside Task runtime", () => {
  const breeding = read("breeding-litter-runtime-v1.8.3.js");
  assert.match(breeding, /function syncBreedingReminders\(/);
  assert.match(breeding, /function syncBirthReminder\(/);
  assert.match(breeding, /stateNow\(\)\.tasks/);
  assert.doesNotMatch(taskSource, /function syncBreedingReminders\(|function syncBirthReminder\(/);
});

test("shell loads and caches Task runtime before application composition", () => {
  const html = read("index.html");
  const worker = read("service-worker.js");
  const health = html.indexOf("health-runtime-v1.8.3.js?v=1");
  const task = html.indexOf("task-runtime-v1.8.3.js?v=1");
  const composition = html.indexOf("herdharbor-app-runtime.js?v=2");
  assert.ok(health >= 0 && task > health && composition > task);
  assert.match(worker, /\.\/task-runtime-v1\.8\.3\.js\?v=1/);
  assert.match(worker, /"\/task-runtime-v1\.8\.3\.js"/);
});

test("Phase 6E extraction remains compatible with formal v1.8.4 and changes no normalized-sync authority", () => {
  assert.equal(packageJson.version, "1.8.4");
  assert.match(read("herdharbor-build.js"), /version:\s*"1\.8\.4"/);
  assert.match(packageJson.scripts["test:v1.8.3"], /runtime-task-extraction-v1\.8\.3\.test\.cjs/);
  for (const asset of [
    "cloud-sync-cohort-gate-v1.8.3.js",
    "cloud-sync-reconciliation-v1.8.3.js",
    "cloud-sync-rollout-control-v1.8.3.js"
  ]) assert.doesNotMatch(read("index.html"), new RegExp(asset.replace(/[.]/g, "\\.")));
});
