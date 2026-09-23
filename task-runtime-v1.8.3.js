(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborTaskRuntime = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const VERSION = "1.8.3";

  const TASK_CATEGORIES = [
    "Feeding", "Cleaning", "Milking", "Production", "Breeding",
    "Nest box", "Weaning", "Health", "Maintenance", "Other"
  ];
  const TASK_RECURRENCE_OPTIONS = [
    "None", "Daily", "Weekly", "Every 2 weeks", "Monthly", "Custom"
  ];
  

  function create(deps = {}) {
    const required = [
      "getState", "getCurrentRoute", "$", "$$", "esc", "headerHtml", "statCard", "emptyState",
      "animalName", "formatDate", "daysFromNow", "scheduleUiWork", "openModal", "closeModal",
      "field", "selectField", "selectAnimalField", "textareaField", "todayISO", "addDays",
      "uid", "recordActivity", "saveState", "renderCurrentView"
    ];
    for (const name of required) {
      if (typeof deps[name] !== "function") throw new Error(`Task runtime requires ${name}().`);
    }

    const {
      getCurrentRoute, $, $$, esc, headerHtml, statCard, emptyState, animalName, formatDate,
      daysFromNow, scheduleUiWork, openModal, closeModal, field, selectField, selectAnimalField,
      textareaField, todayISO, addDays, uid, recordActivity, saveState, renderCurrentView
    } = deps;
    const stateNow = () => deps.getState() || {};
    const confirm = typeof root?.confirm === "function" ? root.confirm.bind(root) : () => false;
    let taskView = {
      status: "Today",
      category: "",
      animalId: "",
      search: ""
    };

    function normalizeTaskRecurrence(task = {}) {
      const value = String(task.recurrence || "None");
      return TASK_RECURRENCE_OPTIONS.includes(value) ? value : "None";
    }
  
    function taskRecurrenceDays(task = {}) {
      const recurrence = normalizeTaskRecurrence(task);
      if (recurrence === "Daily") return 1;
      if (recurrence === "Weekly") return 7;
      if (recurrence === "Every 2 weeks") return 14;
      if (recurrence === "Custom") {
        const interval = Math.round(Number(task.recurrenceDays || 0));
        return Math.min(365, Math.max(1, Number.isFinite(interval) ? interval : 1));
      }
      return 0;
    }
  
    function taskNextDueDate(task = {}) {
      const dueDate = String(task.dueDate || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return "";
      const recurrence = normalizeTaskRecurrence(task);
      if (recurrence === "None") return "";
      if (recurrence !== "Monthly") return addDays(dueDate, taskRecurrenceDays(task));
  
      const [year, month, day] = dueDate.split("-").map(Number);
      const anchorDay = Math.min(31, Math.max(1, Math.round(Number(task.recurrenceAnchorDay || day))));
      const currentLastDay = new Date(year, month, 0, 12).getDate();
      const isClampedOccurrence = day === currentLastDay && anchorDay > currentLastDay;
      const stayInCurrentMonth = day < anchorDay && !isClampedOccurrence;
      const targetMonth = new Date(year, month - (stayInCurrentMonth ? 1 : 0), 1, 12);
      const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0, 12).getDate();
      const clamped = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), Math.min(anchorDay, lastDay), 12);
      const yyyy = clamped.getFullYear();
      const mm = String(clamped.getMonth() + 1).padStart(2, "0");
      const dd = String(clamped.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
  
    function taskRecurrenceLabel(task = {}) {
      const recurrence = normalizeTaskRecurrence(task);
      if (recurrence === "None") return "";
      if (recurrence === "Custom") {
        const days = taskRecurrenceDays(task);
        return `Every ${days} day${days === 1 ? "" : "s"}`;
      }
      return recurrence;
    }
  
    function recurringTaskId(seriesId, dueDate) {
      const safeSeries = String(seriesId || "series").replace(/[^a-zA-Z0-9_-]/g, "").slice(-64) || "series";
      return `task_occurrence_${safeSeries}_${String(dueDate).replace(/-/g, "")}`;
    }
  
    function ensureNextRecurringTask(task, now = new Date().toISOString()) {
      if (!task?.completed || normalizeTaskRecurrence(task) === "None") return null;
      const completedDate = /^\d{4}-\d{2}-\d{2}/.test(String(now))
        ? String(now).slice(0, 10)
        : todayISO();
      let nextDueDate = taskNextDueDate(task);
      if (normalizeTaskRecurrence(task) === "Monthly") {
        let recurrenceSteps = 0;
        while (nextDueDate && nextDueDate <= completedDate && recurrenceSteps < 1200) {
          nextDueDate = taskNextDueDate({ ...task, dueDate: nextDueDate });
          recurrenceSteps += 1;
        }
      } else if (nextDueDate && nextDueDate <= completedDate) {
        const interval = taskRecurrenceDays(task);
        const dueTime = new Date(`${task.dueDate}T12:00:00`).getTime();
        const completedTime = new Date(`${completedDate}T12:00:00`).getTime();
        const elapsedDays = Math.max(0, Math.round((completedTime - dueTime) / 86400000));
        const intervals = Math.floor(elapsedDays / interval) + 1;
        nextDueDate = addDays(task.dueDate, intervals * interval);
      }
      if (!nextDueDate) return null;
  
      const seriesId = task.seriesId || task.id;
      task.seriesId = seriesId;
      const nextId = recurringTaskId(seriesId, nextDueDate);
      const existing = stateNow().tasks.find((item) =>
        item.id === nextId || item.generatedFromTaskId === task.id
      );
      if (existing) {
        task.nextTaskId = existing.id;
        return existing;
      }
  
      const next = {
        id: nextId,
        title: task.title,
        category: task.category || "Other",
        dueDate: nextDueDate,
        animalId: task.animalId || "",
        notes: task.notes || "",
        recurrence: normalizeTaskRecurrence(task),
        recurrenceDays: normalizeTaskRecurrence(task) === "Custom" ? String(taskRecurrenceDays(task)) : "",
        ...(normalizeTaskRecurrence(task) === "Monthly" ? {
          recurrenceAnchorDay: Number(task.recurrenceAnchorDay || String(task.dueDate).slice(-2))
        } : {}),
        completed: false,
        seriesId,
        generatedFromTaskId: task.id,
        createdAt: now,
        updatedAt: now
      };
      stateNow().tasks.push(next);
      task.nextTaskId = next.id;
      return next;
    }
  
    function setTaskCompleted(task, completed, now = new Date().toISOString()) {
      if (!task) return null;
      const wasCompleted = Boolean(task.completed);
      task.completed = Boolean(completed);
      task.updatedAt = now;
      if (task.completed) {
        if (!wasCompleted || !task.completedAt) task.completedAt = now;
        return ensureNextRecurringTask(task, now);
      }
      if (wasCompleted) delete task.completedAt;
      return null;
    }
  
    function taskSort(left, right) {
      return Number(Boolean(left.completed)) - Number(Boolean(right.completed))
        || String(left.dueDate || "9999-12-31").localeCompare(String(right.dueDate || "9999-12-31"))
        || String(left.title || "").localeCompare(String(right.title || ""));
    }
  
    function filterTasks(tasks = stateNow().tasks, filters = taskView) {
      const today = todayISO();
      const query = String(filters.search || "").trim().toLowerCase();
      return tasks.filter((task) => {
        const statusMatch = filters.status === "Completed"
          ? Boolean(task.completed)
          : filters.status === "All open"
            ? !task.completed
            : filters.status === "Overdue"
              ? !task.completed && task.dueDate && task.dueDate < today
              : filters.status === "Upcoming"
                ? !task.completed && task.dueDate && task.dueDate > today
                : !task.completed && task.dueDate && task.dueDate <= today;
        const haystack = [
          task.title, task.notes, task.category,
          task.animalId ? animalName(task.animalId) : "",
          taskRecurrenceLabel(task)
        ].join(" ").toLowerCase();
        return statusMatch
          && (!filters.category || task.category === filters.category)
          && (!filters.animalId || task.animalId === filters.animalId)
          && (!query || haystack.includes(query));
      }).sort(taskSort);
    }
  
    function taskStatusMeta(task) {
      if (task.completed) return { label: "Done", tone: "gray" };
      const days = daysFromNow(task.dueDate);
      if (days < 0) return { label: "Overdue", tone: "danger" };
      if (days === 0) return { label: "Today", tone: "green" };
      return { label: "Upcoming", tone: "" };
    }
  
    function renderTasks() {
      const today = todayISO();
      const allRows = stateNow().tasks.slice().sort(taskSort);
      const open = allRows.filter((task) => !task.completed).length;
      const todayCount = allRows.filter((task) => !task.completed && task.dueDate === today).length;
      const overdue = allRows.filter((task) => !task.completed && task.dueDate && task.dueDate < today).length;
      const recurring = allRows.filter((task) => !task.completed && normalizeTaskRecurrence(task) !== "None").length;
      const categories = [...new Set([...TASK_CATEGORIES, ...allRows.map((task) => task.category).filter(Boolean)])];
  
      $("#view-tasks").innerHTML = `
        ${headerHtml(
          "Tasks and reminders",
          "Run today’s chores, reschedule work, and let recurring tasks create their next occurrence safely.",
          `<button class="button button-primary" id="add-task">+ Add task</button>`
        )}
        <div class="stats-grid task-stats-grid">
          ${statCard("Due today", todayCount, "Open work due today")}
          ${statCard("Overdue", overdue, overdue ? "Needs attention" : "Nothing overdue")}
          ${statCard("All open", open, `${recurring} recurring`)}
          ${statCard("Completed", allRows.length - open, `${allRows.length} total task records`)}
        </div>
        <div class="panel task-workspace">
          <div class="task-toolbar">
            <input id="task-search" type="search" value="${esc(taskView.search)}" placeholder="Search tasks, notes, animals, or repeat schedule">
            <select id="task-status-filter">
              ${["Today", "Upcoming", "Overdue", "All open", "Completed"].map((status) => `<option ${status === taskView.status ? "selected" : ""}>${status}</option>`).join("")}
            </select>
            <select id="task-category-filter"><option value="">All categories</option>${categories.map((category) => `<option value="${esc(category)}" ${category === taskView.category ? "selected" : ""}>${esc(category)}</option>`).join("")}</select>
            <select id="task-animal-filter"><option value="">All animals</option>${stateNow().animals.map((animal) => `<option value="${animal.id}" ${animal.id === taskView.animalId ? "selected" : ""}>${esc(animal.name)}${animal.earTagNumber || animal.tag ? ` · ${esc(animal.earTagNumber || animal.tag)}` : ""}</option>`).join("")}</select>
          </div>
          <div class="task-filter-summary"><strong id="task-filter-count"></strong><span>Today includes overdue work so nothing silently disappears.</span></div>
          <div id="task-results"></div>
        </div>`;
  
      $("#add-task").addEventListener("click", () => openTaskForm());
      $("#task-search").addEventListener("input", (event) => {
        taskView.search = event.currentTarget.value;
        scheduleUiWork("task-search", () => {
          if (getCurrentRoute() === "tasks") renderTaskResults();
        });
      });
      $("#task-status-filter").addEventListener("change", (event) => {
        taskView.status = event.currentTarget.value;
        renderTaskResults();
      });
      $("#task-category-filter").addEventListener("change", (event) => {
        taskView.category = event.currentTarget.value;
        renderTaskResults();
      });
      $("#task-animal-filter").addEventListener("change", (event) => {
        taskView.animalId = event.currentTarget.value;
        renderTaskResults();
      });
      renderTaskResults();
    }
  
    function renderTaskResults() {
      const root = $("#task-results");
      if (!root) return;
      const rows = filterTasks();
      const count = $("#task-filter-count");
      if (count) count.textContent = `${rows.length} matching task${rows.length === 1 ? "" : "s"}`;
      root.innerHTML = rows.length ? `<div class="list">${rows.map((task) => {
        const status = taskStatusMeta(task);
        return `<div class="list-item task-list-item">
          <input class="task-check" type="checkbox" data-toggle-task="${task.id}" ${task.completed ? "checked" : ""} aria-label="${task.completed ? "Reopen" : "Complete"} ${esc(task.title)}">
          <div class="list-item-main">
            <strong style="${task.completed ? "text-decoration:line-through;opacity:.65" : ""}">${esc(task.title)}</strong>
            <span>${esc(task.category || "Task")} · ${formatDate(task.dueDate)}${task.animalId ? ` · ${esc(animalName(task.animalId))}` : ""}${taskRecurrenceLabel(task) ? ` · ${esc(taskRecurrenceLabel(task))}` : ""}</span>
          </div>
          <span class="badge ${status.tone}">${status.label}</span>
          <div class="list-item-actions">
            ${task.completed ? "" : `<button class="button button-ghost button-small" data-task-tomorrow="${task.id}">Tomorrow</button>`}
            <button class="button button-ghost button-small" data-edit-task="${task.id}">Edit</button>
          </div>
        </div>`;
      }).join("")}</div>` : emptyState("No matching tasks.", "Change the filters or add a new chore or reminder.");
  
      $$("[data-toggle-task]", root).forEach((box) => box.addEventListener("change", () => {
        const task = stateNow().tasks.find((item) => item.id === box.dataset.toggleTask);
        if (!task) return;
        const next = setTaskCompleted(task, box.checked);
        recordActivity(`${box.checked ? "Completed" : "Reopened"} task: ${task.title}.`, "task");
        const message = next
          ? `Task completed. Next task scheduled for ${formatDate(next.dueDate)}.`
          : box.checked ? "Task completed." : "Task reopened.";
        saveState(message);
        renderTasks();
      }));
      $$("[data-task-tomorrow]", root).forEach((button) => button.addEventListener("click", () => {
        const task = stateNow().tasks.find((item) => item.id === button.dataset.taskTomorrow);
        if (!task) return;
        task.dueDate = addDays(todayISO(), 1);
        task.updatedAt = new Date().toISOString();
        recordActivity(`Moved task to tomorrow: ${task.title}.`, "task");
        saveState("Task moved to tomorrow.");
        renderTasks();
      }));
      $$("[data-edit-task]", root).forEach((button) =>
        button.addEventListener("click", () => openTaskForm(button.dataset.editTask)));
    }
  
    function openTaskForm(id = "") {
      const task = stateNow().tasks.find((item) => item.id === id) || {};
      const recurrence = normalizeTaskRecurrence(task);
      const originalDueDate = task.dueDate || "";
      const originalRecurrence = recurrence;
      openModal(id ? "Edit task" : "Add task", `
        <form id="task-form">
          <div class="form-grid two">
            ${field("Task title", "title", task.title, true)}
            ${selectField("Category", "category", TASK_CATEGORIES, task.category || "Other", true)}
            ${field("Due date", "dueDate", task.dueDate || todayISO(), true, "date")}
            ${selectAnimalField("Linked animal", "animalId", task.animalId)}
            ${selectField("Repeat", "recurrence", TASK_RECURRENCE_OPTIONS, recurrence, true)}
            <label id="task-custom-interval" class="${recurrence === "Custom" ? "" : "hidden"}">Repeat every (days)
              <input type="number" name="recurrenceDays" min="1" max="365" step="1" value="${esc(task.recurrenceDays || "7")}">
            </label>
          </div>
          <p class="task-repeat-note">When a recurring task is completed, HerdHarbor creates exactly one next occurrence. Reopening it will not create a duplicate.</p>
          ${textareaField("Notes", "notes", task.notes)}
          <label style="margin-top:14px"><span><input type="checkbox" name="completed" value="true" ${task.completed ? "checked" : ""}> Mark complete</span></label>
          <div class="modal-actions">
            ${id ? `<button type="button" class="button button-danger" id="delete-task">Delete</button>` : ""}
            <button type="button" class="button button-ghost" id="cancel-modal">Cancel</button>
            <button type="submit" class="button button-primary">${id ? "Save changes" : "Add task"}</button>
          </div>
        </form>`, "Task record");
  
      const recurrenceSelect = $('[name="recurrence"]', $("#task-form"));
      const customInterval = $("#task-custom-interval");
      const updateCustomInterval = () => {
        const custom = recurrenceSelect.value === "Custom";
        customInterval.classList.toggle("hidden", !custom);
        $('[name="recurrenceDays"]', customInterval).required = custom;
      };
      recurrenceSelect.addEventListener("change", updateCustomInterval);
      updateCustomInterval();
  
      $("#cancel-modal").addEventListener("click", closeModal);
      $("#task-form").addEventListener("submit", (event) => {
        event.preventDefault();
        const fd = new FormData(event.currentTarget);
        const data = Object.fromEntries(fd);
        const completed = fd.get("completed") === "true";
        data.recurrence = TASK_RECURRENCE_OPTIONS.includes(data.recurrence) ? data.recurrence : "None";
        data.recurrenceDays = data.recurrence === "Custom"
          ? String(Math.min(365, Math.max(1, Math.round(Number(data.recurrenceDays || 1)))))
          : "";
        delete data.completed;
  
        const now = new Date().toISOString();
        let savedTask = task;
        if (id) {
          Object.assign(savedTask, data, { updatedAt: now });
        } else {
          const taskId = uid("task");
          savedTask = { id: taskId, ...data, completed: false, createdAt: now, updatedAt: now };
          stateNow().tasks.push(savedTask);
        }
        if (data.recurrence === "Monthly") {
          if (!id || originalRecurrence !== "Monthly" || data.dueDate !== originalDueDate) {
            savedTask.recurrenceAnchorDay = Number(String(data.dueDate).slice(-2));
          }
        } else {
          delete savedTask.recurrenceAnchorDay;
        }
        if (normalizeTaskRecurrence(savedTask) !== "None" && !savedTask.seriesId) {
          savedTask.seriesId = savedTask.id;
        }
        const next = setTaskCompleted(savedTask, completed, now);
        recordActivity(`${id ? "Updated" : "Added"} task: ${data.title}.`, "task");
        saveState(next ? `Task saved. Next task scheduled for ${formatDate(next.dueDate)}.` : id ? "Task updated." : "Task added.");
        closeModal();
        renderCurrentView();
      });
      $("#delete-task")?.addEventListener("click", () => {
        if (!confirm("Delete this task? Future recurring tasks already created will remain available.")) return;
        stateNow().tasks = stateNow().tasks.filter((item) => item.id !== id);
        saveState("Task deleted.");
        closeModal();
        renderCurrentView();
      });
    }
  
  
  

    function setFilterStatus(status = "Today") {
      taskView.status = ["Today", "Upcoming", "Overdue", "All open", "Completed"].includes(status)
        ? status
        : "Today";
      return taskView.status;
    }

    return Object.freeze({
      VERSION,
      normalizeTaskRecurrence,
      taskRecurrenceDays,
      taskNextDueDate,
      taskRecurrenceLabel,
      recurringTaskId,
      ensureNextRecurringTask,
      setTaskCompleted,
      taskSort,
      filterTasks,
      taskStatusMeta,
      renderTasks,
      renderTaskResults,
      openTaskForm,
      setFilterStatus,
      getFilterState: () => ({ ...taskView })
    });
  }

  return Object.freeze({
    VERSION,
    TASK_CATEGORIES,
    TASK_RECURRENCE_OPTIONS,
    create
  });
});
