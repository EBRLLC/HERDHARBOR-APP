(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborHealthRuntime = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const VERSION = "1.8.3";
  const RECORD_TYPES = Object.freeze(["Weight", "Treatment", "Medication", "Vaccination", "Observation", "Veterinary visit"]);
  const WEIGHT_UNITS = Object.freeze(["lb", "lb+oz", "oz", "kg", "g"]);

  function create(deps = {}) {
    const required = [
      "getState", "$", "$$", "esc", "headerHtml", "emptyState", "formatDate", "animalName",
      "openModal", "closeModal", "selectAnimalField", "field", "selectField", "textareaField",
      "todayISO", "toast", "navigate", "uid", "recordActivity", "saveState", "renderCurrentView",
      "setSymptomSearch"
    ];
    for (const name of required) {
      if (typeof deps[name] !== "function") throw new Error(`Health runtime requires ${name}().`);
    }

    const { $, $$, esc } = deps;
    const stateNow = () => deps.getState() || {};
    const confirm = typeof root?.confirm === "function" ? root.confirm.bind(root) : () => false;

    function healthRows(state = stateNow()) {
      return (Array.isArray(state.health) ? state.health : [])
        .slice()
        .sort((a, b) => String(b?.date || "").localeCompare(String(a?.date || "")));
    }

    function renderHealth() {
      const rows = healthRows();
      const view = $("#view-health");
      if (!view) return false;
      view.innerHTML = `
        ${deps.headerHtml(
          "Health and weights",
          "Keep weights, treatments, medications, observations, and follow-up dates together.",
          '<button class="button button-primary" id="add-health">+ Add health record</button>'
        )}
        <section class="panel symptom-lookup-panel" aria-labelledby="health-symptom-lookup-title">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Educational triage aid</p>
              <h3 id="health-symptom-lookup-title">Look up a symptom</h3>
              <small>Search common warning signs and possible concerns by animal or species.</small>
            </div>
            <button class="button button-ghost" type="button" id="open-symptom-guide">Open full guide</button>
          </div>
          <form class="symptom-lookup-form" id="health-symptom-search">
            <input id="health-symptom-query" type="search" autocomplete="off" placeholder="Try: not eating, diarrhea, coughing, limping, bloat…" aria-label="Symptom to look up">
            <button class="button button-primary" type="submit">Search symptoms</button>
          </form>
          <p class="symptom-reference-note"><strong>Important:</strong> HerdHarbor is not a veterinary provider. This guide is educational only and cannot diagnose or treat an animal. Contact a licensed veterinarian for any health concern.</p>
        </section>
        ${rows.length ? `<div class="panel data-table-wrap">
          <table class="data-table">
            <thead><tr><th>Date</th><th>Animal</th><th>Type</th><th>Details</th><th>Weight</th><th>Follow-up</th><th></th></tr></thead>
            <tbody>${rows.map((record) => `
              <tr>
                <td>${deps.formatDate(record.date)}</td>
                <td><strong>${esc(deps.animalName(record.animalId))}</strong></td>
                <td><span class="badge">${esc(record.type)}</span></td>
                <td>${esc(record.details)}</td>
                <td>${esc(record.weight ? `${record.weight} ${record.weightUnit || "lb"}` : "—")}</td>
                <td>${deps.formatDate(record.followUpDate)}</td>
                <td><button class="button button-ghost button-small" data-edit-health="${record.id}">Edit</button></td>
              </tr>`).join("")}</tbody>
          </table>
        </div>` : deps.emptyState("No health records yet.", "Add a weight, treatment, medication, or observation.")}`;

      $("#add-health")?.addEventListener("click", () => openHealthForm());
      $("#open-symptom-guide")?.addEventListener("click", () => deps.navigate("symptoms"));
      $("#health-symptom-search")?.addEventListener("submit", (event) => {
        event.preventDefault();
        deps.setSymptomSearch($("#health-symptom-query")?.value?.trim?.() || "");
        deps.navigate("symptoms");
      });
      $$("[data-edit-health]", view).forEach((button) =>
        button.addEventListener("click", () => openHealthForm(button.dataset.editHealth)));
      return true;
    }

    function normalizeHealthFormData(data) {
      const next = { ...data };
      const weight = next.weight === "" ? NaN : Number(next.weight);
      const ounces = next.weightOunces === "" ? 0 : Number(next.weightOunces);
      if (next.weight !== "" && (!Number.isFinite(weight) || weight < 0)) {
        return { ok: false, message: "Weight must be a valid amount of zero or more." };
      }
      if (next.weightUnit === "lb+oz" && (!Number.isFinite(ounces) || ounces < 0 || ounces >= 16)) {
        return { ok: false, message: "Weight ounces must be between 0 and less than 16." };
      }
      next.weightOunces = next.weight !== "" && next.weightUnit === "lb+oz" ? String(ounces) : "";
      return { ok: true, data: next };
    }

    function openHealthForm(id = "", defaults = {}) {
      const state = stateNow();
      if (!Array.isArray(state.animals) || !state.animals.length) {
        deps.toast("Add an animal before creating health records.", "error");
        deps.navigate("animals");
        return false;
      }

      const health = id
        ? ((Array.isArray(state.health) ? state.health : []).find((record) => record.id === id) || {})
        : { ...defaults };

      deps.openModal(id ? "Edit health record" : "Add health record", `
        <form id="health-form">
          <div class="form-grid two">
            ${deps.selectAnimalField("Animal", "animalId", health.animalId, "", true)}
            ${deps.field("Date", "date", health.date || deps.todayISO(), true, "date")}
            ${deps.selectField("Record type", "type", RECORD_TYPES, health.type || "Observation", true)}
            ${deps.field("Weight", "weight", health.weight, false, "number")}
            ${deps.selectField("Weight unit", "weightUnit", WEIGHT_UNITS, health.weightUnit || "lb")}
            <label id="health-weight-ounces-field" class="${health.weightUnit === "lb+oz" ? "" : "hidden"}">Weight ounces<input name="weightOunces" type="number" min="0" max="15.9" step="0.1" value="${esc(health.weightOunces || "")}" ${health.weightUnit === "lb+oz" ? "" : "disabled"}></label>
            ${deps.field("Follow-up date", "followUpDate", health.followUpDate, false, "date")}
          </div>
          ${deps.textareaField("Details", "details", health.details, true)}
          <div class="modal-actions">
            ${id ? '<button type="button" class="button button-danger" id="delete-health">Delete</button>' : ""}
            <button type="button" class="button button-ghost" id="cancel-modal">Cancel</button>
            <button type="submit" class="button button-primary">${id ? "Save changes" : "Add record"}</button>
          </div>
        </form>`, "Health record");

      $("#cancel-modal")?.addEventListener("click", deps.closeModal);
      const healthWeightUnit = $('[name="weightUnit"]', $("#health-form"));
      const healthWeightOuncesField = $("#health-weight-ounces-field");
      const refreshHealthWeightOunces = () => {
        const enabled = healthWeightUnit?.value === "lb+oz";
        healthWeightOuncesField?.classList.toggle("hidden", !enabled);
        const input = healthWeightOuncesField ? $("input", healthWeightOuncesField) : null;
        if (input) input.disabled = !enabled;
      };
      healthWeightUnit?.addEventListener("change", refreshHealthWeightOunces);
      refreshHealthWeightOunces();

      $("#health-form")?.addEventListener("submit", (event) => {
        event.preventDefault();
        const raw = Object.fromEntries(new FormData(event.currentTarget));
        const normalized = normalizeHealthFormData(raw);
        if (!normalized.ok) {
          deps.toast(normalized.message, "error");
          return;
        }
        const data = normalized.data;
        const liveState = stateNow();
        if (!Array.isArray(liveState.health)) liveState.health = [];
        const now = new Date().toISOString();
        if (id) {
          const current = liveState.health.find((record) => record.id === id);
          if (!current) return;
          Object.assign(current, data, { updatedAt: now });
        } else {
          liveState.health.push({ id: deps.uid("health"), ...data, createdAt: now });
        }
        deps.recordActivity(`${id ? "Updated" : "Added"} ${String(data.type || "health").toLowerCase()} record for ${deps.animalName(data.animalId)}.`, "health");
        deps.saveState(id ? "Health record updated." : "Health record added.");
        deps.closeModal();
        deps.renderCurrentView();
      });

      $("#delete-health")?.addEventListener("click", () => {
        if (!confirm("Delete this health record?")) return;
        const liveState = stateNow();
        liveState.health = (Array.isArray(liveState.health) ? liveState.health : []).filter((record) => record.id !== id);
        deps.saveState("Health record deleted.");
        deps.closeModal();
        deps.renderCurrentView();
      });
      return true;
    }

    return Object.freeze({
      VERSION,
      renderHealth,
      openHealthForm,
      healthRows,
      normalizeHealthFormData
    });
  }

  return Object.freeze({ VERSION, RECORD_TYPES, WEIGHT_UNITS, create });
});
