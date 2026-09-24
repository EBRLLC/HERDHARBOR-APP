(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborBreedingLitterRuntime = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const VERSION = "1.8.3";

  const BREEDING_STATUS_OPTIONS = [
    "Planned", "Bred", "Pregnancy check due", "Confirmed pregnant",
    "Not pregnant", "Due soon", "Delivered", "Cancelled"
  ];
  const PREGNANCY_CHECK_OPTIONS = ["Not checked", "Positive", "Negative", "Inconclusive"];
  const BREEDING_METHOD_OPTIONS = ["Natural service", "Artificial insemination", "Embryo transfer", "Other"];
  const BIRTH_TYPE_OPTIONS = ["Unassisted", "Assisted", "Cesarean", "Induced", "Unknown"];
  const GESTATION_RULES = {
    Rabbit: { gestationDays: 31, checkDays: 14, prepareDaysBefore: 3, weanDays: 42, birthLabel: "kindling", prepareLabel: "Place nest box" },
    Cattle: { gestationDays: 283, checkDays: 30, prepareDaysBefore: 14, weanDays: 205, birthLabel: "calving", prepareLabel: "Prepare calving area" },
    Goat: { gestationDays: 150, checkDays: 30, prepareDaysBefore: 14, weanDays: 60, birthLabel: "kidding", prepareLabel: "Prepare kidding area" },
    Sheep: { gestationDays: 147, checkDays: 30, prepareDaysBefore: 14, weanDays: 60, birthLabel: "lambing", prepareLabel: "Prepare lambing area" },
    Pig: { gestationDays: 114, checkDays: 28, prepareDaysBefore: 7, weanDays: 56, birthLabel: "farrowing", prepareLabel: "Prepare farrowing area" },
    Horse: { gestationDays: 340, checkDays: 45, prepareDaysBefore: 21, weanDays: 180, birthLabel: "foaling", prepareLabel: "Prepare foaling area" },
    Dog: { gestationDays: 63, checkDays: 28, prepareDaysBefore: 7, weanDays: 56, birthLabel: "whelping", prepareLabel: "Prepare whelping area" }
  };
  

  function create(deps = {}) {
    const required = [
      "getState", "$", "$$", "esc", "headerHtml", "statCard", "emptyState", "animalName",
      "formatDate", "daysFromNow", "ensureSpreadsheetToolsReady", "openModal", "closeModal",
      "selectAnimalField", "field", "selectField", "textareaField", "todayISO", "toast",
      "navigate", "uid", "recordActivity", "saveState", "renderCurrentView", "addDays",
      "allowsAnimalTransition", "rememberBreed", "completeWorkflowTasks"
    ];
    for (const name of required) {
      if (typeof deps[name] !== "function") throw new Error(`Breeding/Litter runtime requires ${name}().`);
    }

    const {
      $, $$, esc, headerHtml, statCard, emptyState, animalName, formatDate, daysFromNow,
      ensureSpreadsheetToolsReady, openModal, closeModal, selectAnimalField, field,
      selectField, textareaField, todayISO, toast, navigate, uid, recordActivity,
      saveState, renderCurrentView, addDays, allowsAnimalTransition, rememberBreed,
      completeWorkflowTasks
    } = deps;
    const stateNow = () => deps.getState() || {};
    const confirm = typeof root?.confirm === "function" ? root.confirm.bind(root) : () => false;
    let breedingViewYear = "";

    function normalizeBreedingStatus(value = "") {
      const aliases = { Confirmed: "Confirmed pregnant", "Due Soon": "Due soon", Completed: "Delivered" };
      const normalized = aliases[value] || value || "Bred";
      return BREEDING_STATUS_OPTIONS.includes(normalized) ? normalized : "Bred";
    }
  
    function breedingSchedule(femaleId, breedingDate) {
      const female = stateNow().animals.find((animal) => animal.id === femaleId);
      const rule = GESTATION_RULES[female?.species];
      if (!rule || !/^\d{4}-\d{2}-\d{2}$/.test(String(breedingDate || ""))) {
        return { species: female?.species || "", rule: null, pregnancyCheckDate: "", preparationDate: "", dueDate: "" };
      }
      const dueDate = addDays(breedingDate, rule.gestationDays);
      return {
        species: female.species,
        rule,
        pregnancyCheckDate: addDays(breedingDate, rule.checkDays),
        preparationDate: addDays(dueDate, -rule.prepareDaysBefore),
        dueDate
      };
    }
  
    function workflowTaskId(prefix, recordId, type) {
      const safeId = String(recordId || prefix).replace(/[^a-zA-Z0-9_-]/g, "").slice(-72) || prefix;
      return `task_${prefix}_${safeId}_${type.replace(/[^a-z0-9]+/gi, "-")}`;
    }
  
    function offspringAnimalId(litterId, sequence) {
      const safeId = String(litterId || "birth").replace(/[^a-zA-Z0-9_-]/g, "").slice(-72) || "birth";
      return `animal_offspring_${safeId}_${String(sequence).padStart(3, "0")}`;
    }
  
    function birthRecordIdForBreeding(breedingId) {
      const safeId = String(breedingId || "breeding").replace(/[^a-zA-Z0-9_-]/g, "").slice(-72) || "breeding";
      return `litter_breeding_${safeId}`;
    }
  
    function birthLiveRemaining(litter = {}) {
      const count = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
      return count(litter.bornAlive) + count(litter.fosteredIn) - count(litter.fosteredOut) - count(litter.lostBeforeWeaning);
    }
  
    function upsertWorkflowTask(definition, completed, now) {
      const existing = stateNow().tasks.find((task) => task.id === definition.id);
      if (!definition.dueDate) {
        if (!existing || existing.completed) return false;
        existing.completed = true;
        existing.completedAt = now;
        existing.updatedAt = now;
        return true;
      }
      if (!existing) {
        if (completed) return false;
        stateNow().tasks.push({
          ...definition,
          recurrence: "None",
          recurrenceDays: "",
          completed: false,
          createdAt: now,
          updatedAt: now
        });
        return true;
      }
      let changed = false;
      ["title", "category", "dueDate", "animalId", "notes", "sourceType", "sourceRecordId", "reminderType"].forEach((fieldName) => {
        const nextValue = definition[fieldName] || "";
        if ((existing[fieldName] || "") === nextValue) return;
        existing[fieldName] = nextValue;
        changed = true;
      });
      if (completed && !existing.completed) {
        existing.completed = true;
        existing.completedAt = now;
        changed = true;
      }
      if (changed) existing.updatedAt = now;
      return changed;
    }
  
    function syncBreedingReminders(breeding, options = {}) {
      if (!breeding?.id) return false;
      const now = options.now || new Date().toISOString();
      const status = normalizeBreedingStatus(breeding.status);
      const female = stateNow().animals.find((animal) => animal.id === breeding.femaleId);
      const rule = GESTATION_RULES[female?.species];
      const inactive = ["Not pregnant", "Delivered", "Cancelled"].includes(status);
      const checkDone = inactive || (breeding.pregnancyCheckStatus && breeding.pregnancyCheckStatus !== "Not checked");
      const birthLabel = rule?.birthLabel || "birth";
      const definitions = [
        {
          id: workflowTaskId("breeding", breeding.id, "pregnancy-check"),
          title: `Pregnancy check: ${animalName(breeding.femaleId)}`,
          category: "Breeding",
          dueDate: breeding.pregnancyCheckDate || "",
          animalId: breeding.femaleId || "",
          notes: `Automatically maintained from the breeding record with ${animalName(breeding.maleId)}.`,
          sourceType: "breeding",
          sourceRecordId: breeding.id,
          reminderType: "pregnancy-check",
          completed: checkDone
        },
        {
          id: workflowTaskId("breeding", breeding.id, "prepare-birth"),
          title: `${rule?.prepareLabel || "Prepare birth area"}: ${animalName(breeding.femaleId)}`,
          category: female?.species === "Rabbit" ? "Nest box" : "Breeding",
          dueDate: breeding.nestBoxDate || breeding.preparationDate || "",
          animalId: breeding.femaleId || "",
          notes: `Automatically maintained for expected ${birthLabel} on ${formatDate(breeding.dueDate)}.`,
          sourceType: "breeding",
          sourceRecordId: breeding.id,
          reminderType: "prepare-birth",
          completed: inactive
        },
        {
          id: workflowTaskId("breeding", breeding.id, "expected-birth"),
          title: `Expected ${birthLabel}: ${animalName(breeding.femaleId)}`,
          category: "Breeding",
          dueDate: breeding.dueDate || "",
          animalId: breeding.femaleId || "",
          notes: `Automatically maintained from the breeding record with ${animalName(breeding.maleId)}.`,
          sourceType: "breeding",
          sourceRecordId: breeding.id,
          reminderType: "expected-birth",
          completed: inactive
        }
      ];
      let changed = false;
      definitions.forEach((definition) => {
        if (upsertWorkflowTask(definition, definition.completed, now)) changed = true;
      });
      return changed;
    }
  
    function syncBirthReminder(litter, options = {}) {
      if (!litter?.id) return false;
      const now = options.now || new Date().toISOString();
      const liveAvailable = Math.max(0, birthLiveRemaining(litter));
      const completed = liveAvailable === 0 || Number(litter.weaned || 0) >= liveAvailable;
      return upsertWorkflowTask({
        id: workflowTaskId("birth", litter.id, "weaning"),
        title: `Wean offspring: ${animalName(litter.damId)}`,
        category: "Weaning",
        dueDate: litter.expectedWeanDate,
        animalId: litter.damId || "",
        notes: "Automatically maintained from this birth or litter record.",
        sourceType: "birth",
        sourceRecordId: litter.id,
        reminderType: "weaning"
      }, completed, now);
    }
  
    function breedingReportSnapshot(breedings = stateNow().breedings, litters = stateNow().litters, animals = stateNow().animals) {
      const animalById = new Map(animals.map((animal) => [animal.id, animal]));
      const isPositive = (record) =>
        record.pregnancyCheckStatus === "Positive" || ["Confirmed pregnant", "Due soon", "Delivered"].includes(normalizeBreedingStatus(record.status));
      const isNegative = (record) =>
        record.pregnancyCheckStatus === "Negative" || normalizeBreedingStatus(record.status) === "Not pregnant";
      const delivered = breedings.filter((record) => normalizeBreedingStatus(record.status) === "Delivered").length;
      const positive = breedings.filter(isPositive).length;
      const negative = breedings.filter(isNegative).length;
      const bornAlive = litters.reduce((sum, litter) => sum + Number(litter.bornAlive || 0), 0);
      const weaned = litters.reduce((sum, litter) => sum + Number(litter.weaned || 0), 0);
      const stillborn = litters.reduce((sum, litter) => sum + Number(litter.stillborn || 0), 0);
      const lost = litters.reduce((sum, litter) => sum + Number(litter.lostBeforeWeaning || 0), 0);
      const fosteredIn = litters.reduce((sum, litter) => sum + Number(litter.fosteredIn || 0), 0);
      const fosteredOut = litters.reduce((sum, litter) => sum + Number(litter.fosteredOut || 0), 0);
      const survivalBase = Math.max(0, bornAlive + fosteredIn - fosteredOut);
      const performance = new Map();
      const ensurePerformance = (animalId) => {
        const key = animalId || "unknown";
        if (!performance.has(key)) performance.set(key, { animalId: key, attempts: 0, positive: 0, births: 0, bornAlive: 0, fosteredIn: 0, fosteredOut: 0, weaned: 0 });
        return performance.get(key);
      };
      breedings.forEach((record) => {
        const row = ensurePerformance(record.femaleId);
        row.attempts += 1;
        if (isPositive(record)) row.positive += 1;
      });
      litters.forEach((litter) => {
        const row = ensurePerformance(litter.damId);
        row.births += 1;
        row.bornAlive += Number(litter.bornAlive || 0);
        row.fosteredIn += Number(litter.fosteredIn || 0);
        row.fosteredOut += Number(litter.fosteredOut || 0);
        row.weaned += Number(litter.weaned || 0);
      });
      return {
        attempts: breedings.length,
        delivered,
        positive,
        negative,
        conceptionRate: positive + negative ? positive / (positive + negative) : 0,
        deliveryRate: delivered + negative ? delivered / (delivered + negative) : 0,
        bornAlive,
        stillborn,
        lost,
        weaned,
        survivalRate: survivalBase ? weaned / survivalBase : 0,
        performance: [...performance.values()]
          .map((row) => ({
            ...row,
            name: animalById.get(row.animalId)?.name || "Unknown dam",
            survivalRate: row.bornAlive + row.fosteredIn - row.fosteredOut > 0
              ? row.weaned / (row.bornAlive + row.fosteredIn - row.fosteredOut)
              : 0
          }))
          .sort((left, right) => right.weaned - left.weaned || right.bornAlive - left.bornAlive || left.name.localeCompare(right.name))
      };
    }
  
    function breedingYears() {
      return [...new Set([
        new Date().getFullYear(),
        ...stateNow().breedings.map((record) => Number(String(record.breedingDate || "").slice(0, 4))),
        ...stateNow().litters.map((record) => Number(String(record.birthDate || "").slice(0, 4)))
      ].filter((year) => Number.isInteger(year) && year >= 1900 && year <= 9999))].sort((left, right) => right - left);
    }
  
    function openRecordBirth(breedingId = "") {
      const id = String(breedingId || "").trim();
      if (!id) return false;
      const breeding = stateNow().breedings.find((record) => String(record.id) === id);
      if (!breeding) {
        toast("That breeding record is no longer available.", "error");
        return false;
      }
      openLitterForm("", breeding.id);
      return true;
    }

    function renderBreedings() {
      const rows = stateNow().breedings
        .filter((record) => !breedingViewYear || String(record.breedingDate || "").startsWith(`${breedingViewYear}-`))
        .sort((left, right) => (right.breedingDate || "").localeCompare(left.breedingDate || ""));
      const reportLitters = stateNow().litters.filter((litter) =>
        !breedingViewYear || String(litter.birthDate || "").startsWith(`${breedingViewYear}-`)
      );
      const report = breedingReportSnapshot(rows, reportLitters);
      const active = rows.filter((record) => !["Not pregnant", "Delivered", "Cancelled"].includes(normalizeBreedingStatus(record.status))).length;
      const dueSoon = rows.filter((record) => {
        const days = daysFromNow(record.dueDate);
        return !["Not pregnant", "Delivered", "Cancelled"].includes(normalizeBreedingStatus(record.status)) && days !== null && days >= 0 && days <= 14;
      }).length;
      $("#view-breeding").innerHTML = `
        ${headerHtml(
          "Breeding and pregnancy",
          "Track every attempt from pairing through pregnancy checks, expected birth, reminders, and results.",
          `<button class="button button-ghost" id="download-breeding-report">Download report</button><button class="button button-primary" id="add-breeding">+ Add breeding</button>`
        )}
        <div class="stats-grid">
          ${statCard("Breeding attempts", report.attempts, `${active} currently active`)}
          ${statCard("Confirmed", report.positive, `${Math.round(report.conceptionRate * 100)}% of completed checks`)}
          ${statCard("Expected soon", dueSoon, "Due within 14 days")}
          ${statCard("Births recorded", reportLitters.length, `${report.bornAlive} born alive`)}
        </div>
        <div class="panel breeding-toolbar-panel">
          <label>Report year<select id="breeding-year-filter"><option value="">All years</option>${breedingYears().map((year) => `<option value="${year}" ${String(year) === String(breedingViewYear) ? "selected" : ""}>${year}</option>`).join("")}</select></label>
          <span class="muted">Due dates and reminders use the selected dam’s species. Every date remains editable.</span>
        </div>
        ${rows.length ? `<div class="panel data-table-wrap">
          <table class="data-table">
            <thead><tr><th>Pairing</th><th>Method</th><th>Bred</th><th>Pregnancy check</th><th>Prepare</th><th>Due</th><th>Status</th><th></th></tr></thead>
            <tbody>${rows.map((record) => {
              const female = stateNow().animals.find((animal) => animal.id === record.femaleId);
              const status = normalizeBreedingStatus(record.status);
              const linkedBirth = stateNow().litters.find((litter) => litter.breedingId === record.id);
              return `<tr>
                <td><strong>${esc(animalName(record.femaleId))}</strong> × ${esc(animalName(record.maleId))}<br><small>${esc(female?.species || "")}</small></td>
                <td>${esc(record.method || "Natural service")}</td>
                <td>${formatDate(record.breedingDate)}</td>
                <td>${formatDate(record.pregnancyCheckDate)}<br><small>${esc(record.pregnancyCheckStatus || "Not checked")}</small></td>
                <td>${formatDate(record.nestBoxDate || record.preparationDate)}</td>
                <td>${formatDate(record.dueDate)}</td>
                <td><span class="badge ${["Delivered", "Cancelled", "Not pregnant"].includes(status) ? "gray" : status === "Due soon" ? "warning" : "green"}">${esc(status)}</span></td>
                <td><div class="table-actions"><button class="button button-ghost button-small" data-record-birth="${record.id}">${linkedBirth ? "Edit birth" : "Record birth"}</button><button class="button button-ghost button-small" data-edit-breeding="${record.id}">Edit</button></div></td>
              </tr>`;
            }).join("")}</tbody>
          </table>
        </div>` : emptyState("No breeding records for this period.", "Add a pairing to calculate dates and create reminders.")}
        <div class="panel breeding-report-panel">
          <div class="panel-header"><div><h3>Breeding and litter performance</h3><small>${breedingViewYear || "All recorded years"}</small></div></div>
          <div class="breeding-report-summary">
            <span><b>${Math.round(report.deliveryRate * 100)}%</b> successful completed attempts</span>
            <span><b>${report.bornAlive}</b> born alive</span>
            <span><b>${report.stillborn}</b> stillborn</span>
            <span><b>${report.lost}</b> lost before weaning</span>
            <span><b>${report.weaned}</b> weaned</span>
            <span><b>${Math.round(report.survivalRate * 100)}%</b> born-alive-to-weaned</span>
          </div>
          ${report.performance.length ? `<div class="data-table-wrap"><table class="data-table compact-table"><thead><tr><th>Dam</th><th>Attempts</th><th>Confirmed</th><th>Births</th><th>Born alive</th><th>Weaned</th><th>Survival</th></tr></thead><tbody>${report.performance.map((row) => `<tr><td><strong>${esc(row.name)}</strong></td><td>${row.attempts}</td><td>${row.positive}</td><td>${row.births}</td><td>${row.bornAlive}</td><td>${row.weaned}</td><td>${Math.round(row.survivalRate * 100)}%</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Performance totals will appear after breeding and birth records are added.</p>`}
        </div>`;
  
      $("#add-breeding").addEventListener("click", () => openBreedingForm());
      $("#download-breeding-report").addEventListener("click", async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        button.textContent = "Preparing…";
        try {
          const spreadsheet = await ensureSpreadsheetToolsReady();
          await spreadsheet.downloadBreedingReport({
            breedings: rows,
            litters: reportLitters,
            animals: stateNow().animals,
            report
          }, {
            operationName: stateNow().profile?.operationName || "HerdHarbor",
            year: breedingViewYear || "All years"
          });
          toast("Breeding and birth report downloaded.", "success");
        } catch (error) {
          toast(error.message || "The breeding report could not be created.", "error");
        } finally {
          button.disabled = false;
          button.textContent = "Download report";
        }
      });
      $("#breeding-year-filter").addEventListener("change", (event) => {
        breedingViewYear = event.currentTarget.value;
        renderBreedings();
      });
      $$('[data-edit-breeding]', $("#view-breeding")).forEach((button) =>
        button.addEventListener("click", () => openBreedingForm(button.dataset.editBreeding)));
      $('[data-record-birth]', $("#view-breeding")).forEach((button) =>
        button.addEventListener("click", () => openRecordBirth(button.dataset.recordBirth)));
    }
  
    function openBreedingForm(id = "", defaults = {}) {
      if (!stateNow().animals.length) {
        toast("Add animals before creating a breeding record.", "error");
        navigate("animals");
        return;
      }
      const breeding = id ? (stateNow().breedings.find((record) => record.id === id) || {}) : { ...defaults };
      openModal(id ? "Edit breeding" : "Add breeding", `
        <form id="breeding-form">
          <div class="form-grid two">
            ${selectAnimalField("Female / dam", "femaleId", breeding.femaleId, "Female", true)}
            ${selectAnimalField("Male / sire", "maleId", breeding.maleId, "Male", true)}
            ${field("Breeding date", "breedingDate", breeding.breedingDate || todayISO(), true, "date")}
            ${selectField("Breeding method", "method", BREEDING_METHOD_OPTIONS, breeding.method || "Natural service", true)}
            ${field("Pregnancy-check date", "pregnancyCheckDate", breeding.pregnancyCheckDate || "", false, "date")}
            ${selectField("Pregnancy-check result", "pregnancyCheckStatus", PREGNANCY_CHECK_OPTIONS, breeding.pregnancyCheckStatus || "Not checked", true)}
            ${field("Confirmation date", "confirmedDate", breeding.confirmedDate || "", false, "date")}
            ${field("Birth / nest preparation date", "nestBoxDate", breeding.nestBoxDate || breeding.preparationDate || "", false, "date")}
            ${field("Expected due date", "dueDate", breeding.dueDate || "", true, "date")}
            ${field("Additional follow-up date", "followUpDate", breeding.followUpDate || "", false, "date")}
            ${selectField("Status", "status", BREEDING_STATUS_OPTIONS, normalizeBreedingStatus(breeding.status), true)}
          </div>
          <p class="task-repeat-note" id="breeding-schedule-note">Choose a dam and breeding date to calculate the schedule.</p>
          ${textareaField("Notes", "notes", breeding.notes)}
          <div class="modal-actions">
            ${id ? `<button type="button" class="button button-danger" id="delete-breeding">Delete</button>` : ""}
            <button type="button" class="button button-ghost" id="cancel-modal">Cancel</button>
            <button type="submit" class="button button-primary">${id ? "Save changes" : "Add breeding"}</button>
          </div>
        </form>`, "Breeding and pregnancy record");
  
      const form = $("#breeding-form");
      const breedingDateInput = $('[name="breedingDate"]', form);
      const dueDateInput = $('[name="dueDate"]', form);
      const prepareInput = $('[name="nestBoxDate"]', form);
      const checkDateInput = $('[name="pregnancyCheckDate"]', form);
      const checkResultInput = $('[name="pregnancyCheckStatus"]', form);
      const confirmationInput = $('[name="confirmedDate"]', form);
      const femaleInput = $('[name="femaleId"]', form);
      const statusInput = $('[name="status"]', form);
      const note = $("#breeding-schedule-note");
      const calculateDates = (force = false) => {
        const schedule = breedingSchedule(femaleInput.value, breedingDateInput.value);
        if (!schedule.rule) {
          note.textContent = schedule.species
            ? `${schedule.species} does not have a built-in gestation schedule. Enter the dates supplied by your veterinarian or breeding plan.`
            : "Choose a dam and breeding date to calculate the schedule.";
          return;
        }
        if (force || !checkDateInput.value) checkDateInput.value = schedule.pregnancyCheckDate;
        if (force || !prepareInput.value) prepareInput.value = schedule.preparationDate;
        if (force || !dueDateInput.value) dueDateInput.value = schedule.dueDate;
        note.textContent = `${schedule.species}: ${schedule.rule.gestationDays}-day estimate · check ${formatDate(checkDateInput.value)} · ${schedule.rule.prepareLabel.toLowerCase()} ${formatDate(prepareInput.value)} · expected ${schedule.rule.birthLabel} ${formatDate(dueDateInput.value)}. Every date can be adjusted.`;
      };
      femaleInput.addEventListener("change", () => calculateDates(true));
      breedingDateInput.addEventListener("change", () => calculateDates(true));
      checkResultInput.addEventListener("change", () => {
        if (checkResultInput.value === "Positive") {
          if (!confirmationInput.value) confirmationInput.value = todayISO();
          if (["Planned", "Bred", "Pregnancy check due"].includes(statusInput.value)) statusInput.value = "Confirmed pregnant";
        }
        if (checkResultInput.value === "Negative") statusInput.value = "Not pregnant";
      });
      calculateDates(false);
  
      $("#cancel-modal").addEventListener("click", closeModal);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget));
        const female = stateNow().animals.find((animal) => animal.id === data.femaleId);
        const male = stateNow().animals.find((animal) => animal.id === data.maleId);
        if (data.femaleId === data.maleId) return toast("Select two different animals.", "error");
        if (female?.species && male?.species && female.species !== male.species) return toast("The sire and dam must be the same species.", "error");
        if (data.pregnancyCheckStatus === "Positive" && ["Planned", "Bred", "Pregnancy check due"].includes(data.status)) data.status = "Confirmed pregnant";
        if (data.pregnancyCheckStatus === "Negative") data.status = "Not pregnant";
        const now = new Date().toISOString();
        let saved = breeding;
        if (id) Object.assign(saved, data, { updatedAt: now });
        else {
          saved = { id: uid("breeding"), ...data, createdAt: now, updatedAt: now };
          stateNow().breedings.push(saved);
        }
        syncBreedingReminders(saved, { now });
        recordActivity(`${id ? "Updated" : "Added"} breeding: ${animalName(data.femaleId)} × ${animalName(data.maleId)}.`, "breeding");
        saveState(id ? "Breeding and reminders updated." : "Breeding and reminders added.");
        closeModal();
        renderCurrentView();
      });
  
      $("#delete-breeding")?.addEventListener("click", () => {
        if (!confirm("Delete this breeding record? Linked birth records and offspring will stay available, and its automatic reminders will be closed.")) return;
        const now = new Date().toISOString();
        completeWorkflowTasks("breeding", id, now);
        stateNow().litters.forEach((litter) => {
          if (litter.breedingId === id) {
            litter.breedingId = "";
            litter.updatedAt = now;
          }
        });
        stateNow().breedings = stateNow().breedings.filter((record) => record.id !== id);
        saveState("Breeding deleted; linked births and offspring were preserved.");
        closeModal();
        renderCurrentView();
      });
    }
  
    function selectBreedingField(selected = "") {
      const rows = stateNow().breedings.slice().sort((left, right) => String(right.breedingDate || "").localeCompare(String(left.breedingDate || "")));
      return `<label>Linked breeding<select name="breedingId"><option value="">None / not set</option>${rows.map((record) => `<option value="${record.id}" ${record.id === selected ? "selected" : ""}>${esc(animalName(record.femaleId))} × ${esc(animalName(record.maleId))} · ${formatDate(record.breedingDate)}</option>`).join("")}</select></label>`;
    }
  
    function offspringForLitter(litter) {
      const ids = new Set(Array.isArray(litter?.offspringIds) ? litter.offspringIds : []);
      return stateNow().animals.filter((animal) => ids.has(animal.id) || animal.sourceBirthId === litter?.id);
    }
  
    function renderLitters() {
      const rows = stateNow().litters.slice().sort((left, right) => (right.birthDate || "").localeCompare(left.birthDate || ""));
      const totals = breedingReportSnapshot([], rows);
      $("#view-litters").innerHTML = `
        ${headerHtml(
          "Births and litters",
          "Record delivery outcomes, fostered young, losses, weaning, and offspring kept on the farm.",
          `<button class="button button-primary" id="add-litter">+ Record birth</button>`
        )}
        <div class="stats-grid">
          ${statCard("Birth records", rows.length, `${totals.bornAlive + totals.stillborn} total born`)}
          ${statCard("Born alive", totals.bornAlive, `${totals.stillborn} stillborn`)}
          ${statCard("Weaned", totals.weaned, `${totals.lost} lost before weaning`)}
          ${statCard("Survival", `${Math.round(totals.survivalRate * 100)}%`, "Born alive to weaned")}
        </div>
        ${rows.length ? `<div class="cards-grid">${rows.map((litter) => {
          const offspring = offspringForLitter(litter);
          return `<article class="animal-card">
            <div class="animal-card-top"><div class="animal-avatar">◉</div><span class="badge green">${formatDate(litter.birthDate)}</span></div>
            <h3>${esc(animalName(litter.damId))} × ${esc(animalName(litter.sireId))}</h3>
            <div class="meta">${Number(litter.bornAlive || 0)} born alive · ${Number(litter.stillborn || 0)} stillborn · ${Number(litter.fosteredIn || 0)} fostered in</div>
            <div class="meta">${Number(litter.weaned || 0)} weaned · ${Number(litter.lostBeforeWeaning || 0)} lost · ${offspring.length} offspring record${offspring.length === 1 ? "" : "s"}</div>
            <div class="meta">Expected weaning: ${formatDate(litter.expectedWeanDate)}</div>
            <div class="animal-card-footer">
              <button class="button button-ghost button-small" data-create-offspring="${litter.id}">${offspring.length ? "Add offspring" : "Create offspring"}</button>
              <button class="button button-ghost button-small" data-edit-litter="${litter.id}">Edit</button>
            </div>
          </article>`;
        }).join("")}</div>` : emptyState("No births recorded.", "Record the result of a breeding when offspring arrive.")}`;
  
      $("#add-litter").addEventListener("click", () => openLitterForm());
      $$('[data-edit-litter]', $("#view-litters")).forEach((button) =>
        button.addEventListener("click", () => openLitterForm(button.dataset.editLitter)));
      $$('[data-create-offspring]', $("#view-litters")).forEach((button) =>
        button.addEventListener("click", () => openOffspringCreator(button.dataset.createOffspring)));
    }
  
    function openLitterForm(id = "", breedingId = "") {
      const existingLinkedBirth = !id && breedingId
        ? stateNow().litters.find((record) => record.breedingId === breedingId)
        : null;
      if (existingLinkedBirth) return openLitterForm(existingLinkedBirth.id);
      if (!stateNow().animals.length) {
        toast("Add animals before recording a birth.", "error");
        navigate("animals");
        return;
      }
      const linkedBreeding = stateNow().breedings.find((record) => record.id === breedingId);
      const litter = stateNow().litters.find((record) => record.id === id) || {
        breedingId: linkedBreeding?.id || "",
        damId: linkedBreeding?.femaleId || "",
        sireId: linkedBreeding?.maleId || ""
      };
      const dam = stateNow().animals.find((animal) => animal.id === litter.damId);
      const initialRule = GESTATION_RULES[dam?.species];
      openModal(id ? "Edit birth or litter" : "Record birth or litter", `
        <form id="litter-form">
          <div class="form-grid two">
            ${selectBreedingField(litter.breedingId)}
            ${selectField("Birth type", "birthType", BIRTH_TYPE_OPTIONS, litter.birthType || "Unknown", true)}
            ${selectAnimalField("Dam", "damId", litter.damId, "Female", true)}
            ${selectAnimalField("Sire", "sireId", litter.sireId, "Male", true)}
            ${field("Birth date", "birthDate", litter.birthDate || linkedBreeding?.dueDate || todayISO(), true, "date")}
            ${field("Expected weaning date", "expectedWeanDate", litter.expectedWeanDate || (initialRule ? addDays(litter.birthDate || linkedBreeding?.dueDate || todayISO(), initialRule.weanDays) : ""), false, "date")}
            ${field("Additional litter follow-up date", "followUpDate", litter.followUpDate || "", false, "date")}
            ${field("Born alive", "bornAlive", litter.bornAlive ?? 0, true, "number")}
            ${field("Stillborn", "stillborn", litter.stillborn ?? 0, false, "number")}
            ${field("Fostered in", "fosteredIn", litter.fosteredIn ?? 0, false, "number")}
            ${field("Fostered out", "fosteredOut", litter.fosteredOut ?? 0, false, "number")}
            ${field("Lost before weaning", "lostBeforeWeaning", litter.lostBeforeWeaning ?? 0, false, "number")}
            ${field("Weaned", "weaned", litter.weaned ?? 0, false, "number")}
            ${field("Offspring tag prefix", "offspringPrefix", litter.offspringPrefix || "", false)}
          </div>
          <p class="task-repeat-note">Linking a breeding marks it delivered, closes its expected-birth reminders, and creates a weaning reminder when a date is entered. An additional follow-up date creates a separate litter task. Existing offspring are never deleted when this record changes.</p>
          ${textareaField("Notes", "notes", litter.notes)}
          <div class="modal-actions">
            ${id ? `<button type="button" class="button button-danger" id="delete-litter">Delete</button>` : ""}
            <button type="button" class="button button-ghost" id="cancel-modal">Cancel</button>
            <button type="submit" class="button button-primary">${id ? "Save changes" : "Record birth"}</button>
          </div>
        </form>`, "Birth and offspring record");
  
      const form = $("#litter-form");
      const breedingInput = $('[name="breedingId"]', form);
      const damInput = $('[name="damId"]', form);
      const sireInput = $('[name="sireId"]', form);
      const birthDateInput = $('[name="birthDate"]', form);
      const weanDateInput = $('[name="expectedWeanDate"]', form);
      const updateWeanDate = (force = false) => {
        const selectedDam = stateNow().animals.find((animal) => animal.id === damInput.value);
        const rule = GESTATION_RULES[selectedDam?.species];
        if (rule && birthDateInput.value && (force || !weanDateInput.value)) weanDateInput.value = addDays(birthDateInput.value, rule.weanDays);
      };
      const updateFromBreeding = () => {
        const record = stateNow().breedings.find((item) => item.id === breedingInput.value);
        if (!record) return;
        damInput.value = record.femaleId || damInput.value;
        sireInput.value = record.maleId || sireInput.value;
        if (!id && record.dueDate) birthDateInput.value = record.dueDate;
        updateWeanDate(true);
      };
      breedingInput.addEventListener("change", updateFromBreeding);
      damInput.addEventListener("change", () => updateWeanDate(true));
      birthDateInput.addEventListener("change", () => updateWeanDate(true));
  
      $("#cancel-modal").addEventListener("click", closeModal);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget));
        const previousBreedingId = id ? litter.breedingId || "" : "";
        const countFields = ["bornAlive", "stillborn", "fosteredIn", "fosteredOut", "lostBeforeWeaning", "weaned"];
        for (const fieldName of countFields) {
          const count = Number(data[fieldName] || 0);
          if (!Number.isInteger(count) || count < 0) return toast("Birth and weaning counts must be whole numbers of zero or more.", "error");
          data[fieldName] = String(count);
        }
        if (data.damId === data.sireId) return toast("Select two different parent animals.", "error");
        const selectedDam = stateNow().animals.find((animal) => animal.id === data.damId);
        const selectedSire = stateNow().animals.find((animal) => animal.id === data.sireId);
        if (selectedDam?.species && selectedSire?.species && selectedDam.species !== selectedSire.species) return toast("The sire and dam must be the same species.", "error");
        const linkedRecord = stateNow().breedings.find((record) => record.id === data.breedingId);
        if (linkedRecord && (linkedRecord.femaleId !== data.damId || linkedRecord.maleId !== data.sireId)) return toast("The selected parents must match the linked breeding record.", "error");
        if (data.breedingId && stateNow().litters.some((record) => record.id !== id && record.breedingId === data.breedingId)) return toast("That breeding already has a linked birth record. Edit the existing birth instead.", "error");
        const maximumWeaned = birthLiveRemaining(data);
        if (maximumWeaned < 0) return toast("Fostered-out young and losses cannot exceed the live young available.", "error");
        if (Number(data.weaned) > Math.max(0, maximumWeaned)) return toast("Weaned cannot exceed the live young remaining after foster-outs and losses.", "error");
        const now = new Date().toISOString();
        let saved = litter;
        if (id) Object.assign(saved, data, { updatedAt: now, offspringIds: Array.isArray(saved.offspringIds) ? saved.offspringIds : [] });
        else {
          saved = {
            id: data.breedingId ? birthRecordIdForBreeding(data.breedingId) : uid("litter"),
            ...data,
            offspringIds: [],
            createdAt: now,
            updatedAt: now
          };
          stateNow().litters.push(saved);
        }
        if (previousBreedingId && previousBreedingId !== data.breedingId) {
          const previousBreeding = stateNow().breedings.find((record) => record.id === previousBreedingId);
          if (previousBreeding?.litterId === saved.id) {
            previousBreeding.litterId = "";
            previousBreeding.updatedAt = now;
          }
        }
        if (data.breedingId) {
          const breeding = stateNow().breedings.find((record) => record.id === data.breedingId);
          if (breeding) {
            breeding.status = "Delivered";
            breeding.litterId = saved.id;
            breeding.updatedAt = now;
            syncBreedingReminders(breeding, { now });
          }
        }
        syncBirthReminder(saved, { now });
        recordActivity(`${id ? "Updated" : "Recorded"} birth for ${animalName(data.damId)}.`, "litter");
        saveState(id ? "Birth, outcomes, and reminders updated." : "Birth recorded and reminders updated.");
        closeModal();
        renderCurrentView();
      });
      $("#delete-litter")?.addEventListener("click", () => {
        const existingOffspring = offspringForLitter(litter);
        if (!confirm(`Delete this birth record? ${existingOffspring.length ? `${existingOffspring.length} linked offspring record${existingOffspring.length === 1 ? "" : "s"} will stay in Animals.` : "Any linked offspring will stay in Animals."}`)) return;
        const now = new Date().toISOString();
        completeWorkflowTasks("birth", id, now);
        stateNow().breedings.forEach((record) => {
          if (record.litterId === id) {
            record.litterId = "";
            record.updatedAt = now;
          }
        });
        stateNow().animals.forEach((animal) => {
          if (animal.sourceBirthId !== id) return;
          animal.sourceBirthId = "";
          animal.updatedAt = now;
        });
        stateNow().litters = stateNow().litters.filter((record) => record.id !== id);
        saveState("Birth record deleted; offspring animal records were preserved.");
        closeModal();
        renderCurrentView();
      });
    }
  
    function openOffspringCreator(litterId) {
      const litter = stateNow().litters.find((record) => record.id === litterId);
      if (!litter) return;
      const dam = stateNow().animals.find((animal) => animal.id === litter.damId);
      const sire = stateNow().animals.find((animal) => animal.id === litter.sireId);
      const existing = offspringForLitter(litter);
      const available = Math.max(0, birthLiveRemaining(litter));
      const availableSlots = Math.max(0, available - existing.length);
      if (!availableSlots) return toast("All live offspring available from this birth already have animal records.", "info");
      const maxCount = Math.min(50, availableSlots);
      const existingSequences = existing.map((animal) => {
        const match = String(animal.id || "").match(/_(\d{3})$/);
        return match ? Number(match[1]) : 0;
      });
      const startSequence = Math.max(existing.length, ...existingSequences) + 1;
      const defaultCount = maxCount;
      openModal("Create offspring animal records", `
        <form id="offspring-form">
          <div class="offspring-creator-header">
            <label>Number to create<input id="offspring-count" type="number" min="1" max="${maxCount}" step="1" value="${defaultCount}" required></label>
            <p class="muted">Each new animal receives this dam, sire, birth date, species, and pedigree connection automatically. Review names, tags, and sex before saving.</p>
          </div>
          <div id="offspring-fields"></div>
          <div class="modal-actions">
            <button type="button" class="button button-ghost" id="cancel-modal">Cancel</button>
            <button type="submit" class="button button-primary">Create offspring records</button>
          </div>
        </form>`, "One-step offspring setup");
      $(".modal").classList.add("modal-wide");
  
      const countInput = $("#offspring-count");
      const fieldsRoot = $("#offspring-fields");
      const breed = dam?.breed && sire?.breed && dam.breed !== sire.breed
        ? `${dam.breed} × ${sire.breed}`
        : dam?.breed || sire?.breed || "";
      const renderRows = () => {
        const count = Math.min(maxCount, Math.max(1, Math.round(Number(countInput.value || 1))));
        countInput.value = String(count);
        fieldsRoot.innerHTML = `<div class="offspring-grid">${Array.from({ length: count }, (_, index) => {
          const sequence = startSequence + index;
          const prefix = String(litter.offspringPrefix || "").trim();
          return `<div class="offspring-row">
            <span class="offspring-number">${sequence}</span>
            <label>Name<input name="offspringName_${index}" value="${esc(`${dam?.name || "Offspring"} offspring ${sequence}`)}" required></label>
            <label>ID or tag<input name="offspringTag_${index}" value="${esc(prefix ? `${prefix}-${sequence}` : "")}"></label>
            <label>Sex<select name="offspringSex_${index}"><option>Unknown</option><option>Female</option><option>Male</option></select></label>
          </div>`;
        }).join("")}</div>`;
      };
      countInput.addEventListener("change", renderRows);
      renderRows();
  
      $("#cancel-modal").addEventListener("click", closeModal);
      $("#offspring-form").addEventListener("submit", (event) => {
        event.preventDefault();
        const count = Math.min(maxCount, Math.max(1, Math.round(Number(countInput.value || 1))));
        const data = new FormData(event.currentTarget);
        const now = new Date().toISOString();
        const created = [];
        for (let index = 0; index < count; index += 1) {
          const sequence = startSequence + index;
          const animalId = offspringAnimalId(litter.id, sequence);
          if (stateNow().animals.some((animal) => animal.id === animalId)) continue;
          const name = String(data.get(`offspringName_${index}`) || "").trim();
          if (!name) return toast("Every offspring record needs a name.", "error");
          const animal = {
            id: animalId,
            name,
            tag: String(data.get(`offspringTag_${index}`) || "").trim(),
            tattoo: "",
            registrationNumber: "",
            breeder: stateNow().profile?.operationName || "",
            species: dam?.species || sire?.species || "Other",
            breed,
            sex: String(data.get(`offspringSex_${index}`) || "Unknown"),
            dob: litter.birthDate || "",
            color: "",
            location: dam?.location || "",
            status: "Growing",
            sireId: litter.sireId || "",
            damId: litter.damId || "",
            sourceBirthId: litter.id,
            notes: `Created from the ${formatDate(litter.birthDate)} birth record.`,
            createdAt: now,
            updatedAt: now
          };
          created.push(animal);
        }
        if (!allowsAnimalTransition(stateNow().animals, [...stateNow().animals, ...created])) return;
        stateNow().animals.push(...created);
        litter.offspringIds = [...new Set([...(Array.isArray(litter.offspringIds) ? litter.offspringIds : []), ...created.map((animal) => animal.id)])];
        litter.updatedAt = now;
        rememberBreed(dam?.species || sire?.species || "", breed);
        recordActivity(`Created ${created.length} offspring animal record${created.length === 1 ? "" : "s"} from ${animalName(litter.damId)}'s birth record.`, "animal");
        saveState(`${created.length} offspring record${created.length === 1 ? "" : "s"} created with parent and pedigree links.`);
        closeModal();
        renderCurrentView();
      });
    }
  
  

    return Object.freeze({
      VERSION,
      normalizeBreedingStatus,
      breedingSchedule,
      offspringAnimalId,
      birthRecordIdForBreeding,
      syncBreedingReminders,
      syncBirthReminder,
      breedingReportSnapshot,
      renderBreedings,
      openBreedingForm,
      openRecordBirth,
      renderLitters,
      openLitterForm,
      openOffspringCreator,
      offspringForLitter,
      birthLiveRemaining,
      getReportYear: () => breedingViewYear
    });
  }

  return Object.freeze({
    VERSION,
    BREEDING_STATUS_OPTIONS,
    PREGNANCY_CHECK_OPTIONS,
    BREEDING_METHOD_OPTIONS,
    BIRTH_TYPE_OPTIONS,
    GESTATION_RULES,
    create
  });
});
