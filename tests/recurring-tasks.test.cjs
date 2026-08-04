const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const start = html.indexOf("  function normalizeTaskRecurrence(task = {})");
const end = html.indexOf("  function renderTasks()", start);
assert.ok(start >= 0 && end > start, "recurring task helpers are present");

const recurrenceOptions = ["None", "Daily", "Weekly", "Every 2 weeks", "Monthly", "Custom"];
const addDays = (dateString, days) => {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + Number(days));
  return date.toISOString().slice(0, 10);
};

function buildHelpers(state) {
  const source = html.slice(start, end);
  return new Function(
    "state",
    "TASK_RECURRENCE_OPTIONS",
    "addDays",
    "todayISO",
    "animalName",
    "daysFromNow",
    `${source}\nreturn {
      normalizeTaskRecurrence, taskRecurrenceDays, taskNextDueDate,
      taskRecurrenceLabel, recurringTaskId, ensureNextRecurringTask,
      setTaskCompleted, taskSort, filterTasks, taskStatusMeta
    };`
  )(
    state,
    recurrenceOptions,
    addDays,
    () => "2026-08-04",
    (id) => ({ "cow-1": "Bessie", "hen-1": "Layer flock" })[id] || "Unknown",
    (date) => Math.round((new Date(`${date}T12:00:00`) - new Date("2026-08-04T12:00:00")) / 86400000)
  );
}

{
  const helpers = buildHelpers({ tasks: [] });
  assert.equal(helpers.taskNextDueDate({ dueDate: "2026-08-04", recurrence: "Daily" }), "2026-08-05");
  assert.equal(helpers.taskNextDueDate({ dueDate: "2026-08-04", recurrence: "Weekly" }), "2026-08-11");
  assert.equal(helpers.taskNextDueDate({ dueDate: "2026-08-04", recurrence: "Every 2 weeks" }), "2026-08-18");
  assert.equal(helpers.taskNextDueDate({ dueDate: "2026-01-31", recurrence: "Monthly" }), "2026-02-28");
  assert.equal(
    helpers.taskNextDueDate({ dueDate: "2026-02-28", recurrence: "Monthly", recurrenceAnchorDay: 31 }),
    "2026-03-31",
    "a clamped February occurrence returns to its original day in March"
  );
  assert.equal(
    helpers.taskNextDueDate({ dueDate: "2026-03-01", recurrence: "Monthly", recurrenceAnchorDay: 31 }),
    "2026-03-31",
    "rescheduling a month-end occurrence into the next month does not skip that month's anchor date"
  );
  assert.equal(helpers.taskNextDueDate({ dueDate: "2028-01-31", recurrence: "Monthly" }), "2028-02-29");
  assert.equal(helpers.taskNextDueDate({ dueDate: "2026-12-31", recurrence: "Monthly" }), "2027-01-31");
  assert.equal(helpers.taskNextDueDate({ dueDate: "2026-08-04", recurrence: "Custom", recurrenceDays: "9" }), "2026-08-13");
  assert.equal(helpers.taskRecurrenceDays({ recurrence: "Custom", recurrenceDays: "0" }), 1);
  assert.equal(helpers.taskRecurrenceDays({ recurrence: "Custom", recurrenceDays: "800" }), 365);
  assert.equal(helpers.taskRecurrenceLabel({ recurrence: "Custom", recurrenceDays: "10" }), "Every 10 days");
}

{
  const overdue = {
    id: "task-overdue-daily",
    title: "Collect eggs",
    category: "Production",
    dueDate: "2026-08-01",
    recurrence: "Daily",
    completed: false
  };
  const state = { tasks: [overdue] };
  const helpers = buildHelpers(state);
  const next = helpers.setTaskCompleted(overdue, true, "2026-08-04T18:00:00.000Z");
  assert.equal(next.dueDate, "2026-08-05", "late completion skips missed occurrences instead of creating an overdue backlog");
}

{
  const task = {
    id: "task-milk",
    title: "Morning milking",
    category: "Milking",
    dueDate: "2026-08-04",
    animalId: "cow-1",
    notes: "Record waste after milking.",
    recurrence: "Daily",
    completed: false
  };
  const state = { tasks: [task] };
  const helpers = buildHelpers(state);
  const next = helpers.setTaskCompleted(task, true, "2026-08-04T12:00:00.000Z");
  assert.equal(next.dueDate, "2026-08-05");
  assert.equal(next.id, "task_occurrence_task-milk_20260805");
  assert.equal(next.generatedFromTaskId, "task-milk");
  assert.equal(next.seriesId, "task-milk");
  assert.equal(next.completed, false);
  assert.equal(state.tasks.length, 2);

  helpers.setTaskCompleted(task, true, "2026-08-04T12:01:00.000Z");
  assert.equal(state.tasks.length, 2, "repeated completion is idempotent");
  helpers.setTaskCompleted(task, false, "2026-08-04T12:02:00.000Z");
  helpers.setTaskCompleted(task, true, "2026-08-04T12:03:00.000Z");
  assert.equal(state.tasks.length, 2, "reopening and recompleting cannot duplicate the next occurrence");
}

{
  const january = {
    id: "task-month-end",
    title: "Month-end inventory",
    category: "Production",
    dueDate: "2026-01-31",
    recurrence: "Monthly",
    recurrenceAnchorDay: 31,
    completed: false
  };
  const state = { tasks: [january] };
  const helpers = buildHelpers(state);
  const february = helpers.setTaskCompleted(january, true, "2026-01-31T18:00:00.000Z");
  assert.equal(february.dueDate, "2026-02-28");
  assert.equal(february.recurrenceAnchorDay, 31);
  const march = helpers.setTaskCompleted(february, true, "2026-02-28T18:00:00.000Z");
  assert.equal(march.dueDate, "2026-03-31", "month-end recurrence keeps its original anchor day");
}

{
  const baseTask = {
    id: "task-feed",
    title: "Feed broilers",
    category: "Feeding",
    dueDate: "2026-08-04",
    recurrence: "Daily",
    completed: false
  };
  const leftState = { tasks: [structuredClone(baseTask)] };
  const rightState = { tasks: [structuredClone(baseTask)] };
  const left = buildHelpers(leftState).setTaskCompleted(leftState.tasks[0], true, "2026-08-04T12:00:00.000Z");
  const right = buildHelpers(rightState).setTaskCompleted(rightState.tasks[0], true, "2026-08-04T12:00:00.000Z");
  assert.equal(left.id, right.id, "two devices derive the same next-occurrence ID");
}

{
  const state = {
    tasks: [
      { id: "overdue", title: "Clean brooder", category: "Cleaning", dueDate: "2026-08-03", completed: false },
      { id: "today", title: "Milk Bessie", category: "Milking", dueDate: "2026-08-04", animalId: "cow-1", completed: false },
      { id: "upcoming", title: "Collect eggs", category: "Production", dueDate: "2026-08-05", animalId: "hen-1", completed: false },
      { id: "done", title: "Repair gate", category: "Maintenance", dueDate: "2026-08-02", completed: true }
    ]
  };
  const helpers = buildHelpers(state);
  assert.deepEqual(
    helpers.filterTasks(state.tasks, { status: "Today", category: "", animalId: "", search: "" }).map((task) => task.id),
    ["overdue", "today"],
    "Today keeps overdue work visible"
  );
  assert.deepEqual(
    helpers.filterTasks(state.tasks, { status: "Upcoming", category: "", animalId: "", search: "" }).map((task) => task.id),
    ["upcoming"]
  );
  assert.deepEqual(
    helpers.filterTasks(state.tasks, { status: "Completed", category: "", animalId: "", search: "" }).map((task) => task.id),
    ["done"]
  );
  assert.deepEqual(
    helpers.filterTasks(state.tasks, { status: "All open", category: "", animalId: "cow-1", search: "bessie" }).map((task) => task.id),
    ["today"]
  );
}

assert.match(html, /id="task-status-filter"/);
assert.match(html, /id="task-category-filter"/);
assert.match(html, /id="task-animal-filter"/);
assert.match(html, /data-dashboard-task/);
assert.match(html, /data-task-tomorrow/);

console.log("recurring tasks and daily workflow tests passed");
