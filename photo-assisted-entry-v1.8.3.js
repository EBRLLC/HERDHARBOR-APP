(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborPhotoAssistedEntry = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const VERSION = "1.8.3";
  const CLASSES = Object.freeze(["registration_document", "vet_document", "weight_sheet", "medication_label"]);
  const clean = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  const lower = (value) => clean(value).toLowerCase();

  function exactAnimalMatches(hints = {}, animals = []) {
    const records = Array.isArray(animals) ? animals : [];
    const fields = ["registrationNumber", "tattoo", "tag", "name"];
    for (const field of fields) {
      const value = lower(hints[field]);
      if (!value) continue;
      const matches = records.filter((animal) => lower(animal?.[field]) === value);
      if (matches.length) return matches;
    }
    return [];
  }

  function canonicalDraft(providerDraft = {}, animals = []) {
    const classification = CLASSES.includes(providerDraft.classification) ? providerDraft.classification : "unsupported";
    const warnings = Array.isArray(providerDraft.warnings) ? providerDraft.warnings.map(clean).filter(Boolean) : [];
    const matches = classification === "registration_document" ? [] : exactAnimalMatches(providerDraft.animalHints || {}, animals);
    if (classification !== "registration_document" && matches.length !== 1) {
      warnings.push(matches.length > 1 ? "More than one existing animal matches the extracted identity. Choose the correct animal." : "No existing animal matched the extracted identity. Choose the animal.");
    }

    if (classification === "registration_document") {
      const registration = providerDraft.registration || {};
      return {
        classification,
        classificationConfidence: Number(providerDraft.classificationConfidence || 0),
        warnings: [...new Set(warnings)],
        defaults: {
          name: clean(registration.name),
          registrationNumber: clean(registration.registrationNumber),
          tattoo: clean(registration.tattoo),
          tag: clean(registration.tag),
          breeder: clean(registration.breeder),
          species: clean(registration.species) || "Rabbit",
          breed: clean(registration.breed),
          sex: ["Male","Female","Unknown"].includes(registration.sex) ? registration.sex : "Unknown",
          dob: clean(registration.dob),
          color: clean(registration.color),
          status: "Active"
        }
      };
    }

    const health = providerDraft.health || {};
    return {
      classification,
      classificationConfidence: Number(providerDraft.classificationConfidence || 0),
      warnings: [...new Set(warnings)],
      defaults: {
        animalId: matches.length === 1 ? String(matches[0].id) : "",
        date: clean(health.date),
        type: ["Weight","Medication","Veterinary visit","Observation"].includes(health.type) ? health.type : "Observation",
        details: clean(health.details),
        weight: clean(health.weight),
        weightUnit: ["lb","lb+oz","oz","kg","g"].includes(health.weightUnit) ? health.weightUnit : "lb",
        weightOunces: clean(health.weightOunces),
        followUpDate: clean(health.followUpDate)
      }
    };
  }

  function validateReview(draft, animals = []) {
    const issues = [];
    if (!draft || !CLASSES.includes(draft.classification)) return { ok: false, issues: ["This image is not a supported record class."] };
    const values = draft.defaults || {};
    if (draft.classification === "registration_document") {
      if (!clean(values.name)) issues.push("Animal name is required.");
      if (!clean(values.species)) issues.push("Species is required.");
      if (!["Male","Female","Unknown"].includes(values.sex)) issues.push("Choose a valid sex.");
    } else {
      const animal = (Array.isArray(animals) ? animals : []).find((row) => String(row.id) === String(values.animalId));
      if (!animal) issues.push("Choose an existing animal.");
      if (!clean(values.date)) issues.push("Record date is required.");
      if (!["Weight","Medication","Veterinary visit","Observation"].includes(values.type)) issues.push("Choose a valid Health record type.");
      if (values.type === "Weight" && !clean(values.weight)) issues.push("Weight is required.");
      if (values.type !== "Weight" && !clean(values.details)) issues.push("Record details are required.");
    }
    return { ok: issues.length === 0, issues };
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("The image could not be read."));
      reader.readAsDataURL(file);
    });
  }

  function create(deps = {}) {
    const required = ["getState","openModal","closeModal","openAnimalForm","openHealthForm","esc","toast"];
    for (const name of required) {
      if (typeof deps[name] !== "function") throw new Error("Photo-assisted entry requires " + name + "().");
    }

    let selectedFile = null;
    let reviewed = null;
    const byId = (id) => root.document?.getElementById(id);
    const animals = () => {
      const state = deps.getState() || {};
      return Array.isArray(state.animals) ? state.animals : [];
    };
    const cloud = () => root.HerdHarborCloud || null;

    function telemetry(action, result, classification = "") {
      try {
        root.HerdHarborMonitoring?.addBreadcrumb?.({
          module: classification === "registration_document" ? "animals" : "health",
          action,
          result,
          metadata: classification ? { record_class: classification } : {}
        });
      } catch {}
    }

    function animalOptions(selected = "") {
      return animals().map((animal) =>
        '<option value="' + deps.esc(animal.id) + '"' + (String(animal.id) === String(selected) ? " selected" : "") + '>' +
        deps.esc(animal.name || "Unnamed animal") + '</option>'
      ).join("");
    }

    function registrationFields(values) {
      const field = (label, id, value, type = "text") =>
        '<label>' + label + '<input id="' + id + '" type="' + type + '" value="' + deps.esc(value || "") + '"></label>';
      return [
        field("Name", "photo-review-name", values.name),
        field("Registration #", "photo-review-registration", values.registrationNumber),
        field("Tattoo / ear number", "photo-review-tattoo", values.tattoo),
        field("ID or tag", "photo-review-tag", values.tag),
        field("Breeder", "photo-review-breeder", values.breeder),
        field("Species", "photo-review-species", values.species),
        field("Breed", "photo-review-breed", values.breed),
        '<label>Sex<select id="photo-review-sex">' + ["Male","Female","Unknown"].map((sex) => '<option value="' + sex + '"' + (sex === values.sex ? " selected" : "") + '>' + sex + '</option>').join("") + '</select></label>',
        field("Date of birth", "photo-review-dob", values.dob, "date"),
        field("Color / variety", "photo-review-color", values.color)
      ].join("");
    }

    function healthFields(values) {
      const types = ["Weight","Medication","Veterinary visit","Observation"];
      const units = ["lb","lb+oz","oz","kg","g"];
      return '<label>Animal<select id="photo-review-animal"><option value="">Choose an animal</option>' + animalOptions(values.animalId) + '</select></label>' +
        '<label>Date<input id="photo-review-date" type="date" value="' + deps.esc(values.date || "") + '"></label>' +
        '<label>Type<select id="photo-review-type">' + types.map((type) => '<option value="' + type + '"' + (type === values.type ? " selected" : "") + '>' + type + '</option>').join("") + '</select></label>' +
        '<label>Weight<input id="photo-review-weight" type="number" min="0" step="0.01" value="' + deps.esc(values.weight || "") + '"></label>' +
        '<label>Weight unit<select id="photo-review-weight-unit">' + units.map((unit) => '<option value="' + unit + '"' + (unit === values.weightUnit ? " selected" : "") + '>' + unit + '</option>').join("") + '</select></label>' +
        '<label>Ounces<input id="photo-review-ounces" type="number" min="0" max="15.9" step="0.1" value="' + deps.esc(values.weightOunces || "") + '"></label>' +
        '<label>Follow-up date<input id="photo-review-follow-up" type="date" value="' + deps.esc(values.followUpDate || "") + '"></label>' +
        '<label style="grid-column:1/-1">Details<textarea id="photo-review-details" rows="4">' + deps.esc(values.details || "") + '</textarea></label>';
    }

    function renderReview() {
      const host = byId("photo-entry-review");
      if (!host || !reviewed) return;
      const warningHtml = reviewed.warnings.length
        ? '<div class="notice"><strong>Needs review</strong><ul>' + reviewed.warnings.map((warning) => '<li>' + deps.esc(warning) + '</li>').join("") + '</ul></div>'
        : '<div class="notice"><strong>Draft ready.</strong> Verify every field against the image.</div>';
      const supported = CLASSES.includes(reviewed.classification);
      const label = {
        registration_document: "Registration document",
        vet_document: "Veterinary document",
        weight_sheet: "Weight sheet",
        medication_label: "Medication label"
      }[reviewed.classification] || "Unsupported image";
      const fields = reviewed.classification === "registration_document" ? registrationFields(reviewed.defaults) :
        (supported ? healthFields(reviewed.defaults) : "");
      host.innerHTML =
        '<div class="panel" style="margin-top:14px"><div class="panel-header"><div><h3>Review photo draft</h3><small>' +
        deps.esc(label) + ' · ' + Math.round(Number(reviewed.classificationConfidence || 0) * 100) + '% classification confidence</small></div></div>' +
        warningHtml + (fields ? '<div class="form-grid two">' + fields + '</div>' : '') +
        '<p class="muted">Nothing has been saved. Continue only after checking the draft against the source image.</p>' +
        '<div class="modal-actions"><button type="button" class="button button-ghost" id="photo-review-cancel">Cancel</button>' +
        '<button type="button" class="button button-primary" id="photo-review-confirm"' + (supported ? "" : " disabled") + '>Use reviewed draft</button></div></div>';
      byId("photo-review-cancel")?.addEventListener("click", () => {
        telemetry("photo_draft_cancelled", "cancelled", reviewed.classification);
        deps.closeModal();
      });
      byId("photo-review-confirm")?.addEventListener("click", confirmReview);
    }

    function collectReview() {
      if (!reviewed) return null;
      const next = JSON.parse(JSON.stringify(reviewed));
      if (next.classification === "registration_document") {
        next.defaults = {
          ...next.defaults,
          name: clean(byId("photo-review-name")?.value),
          registrationNumber: clean(byId("photo-review-registration")?.value),
          tattoo: clean(byId("photo-review-tattoo")?.value),
          tag: clean(byId("photo-review-tag")?.value),
          breeder: clean(byId("photo-review-breeder")?.value),
          species: clean(byId("photo-review-species")?.value),
          breed: clean(byId("photo-review-breed")?.value),
          sex: clean(byId("photo-review-sex")?.value),
          dob: clean(byId("photo-review-dob")?.value),
          color: clean(byId("photo-review-color")?.value)
        };
      } else {
        next.defaults = {
          ...next.defaults,
          animalId: clean(byId("photo-review-animal")?.value),
          date: clean(byId("photo-review-date")?.value),
          type: clean(byId("photo-review-type")?.value),
          weight: clean(byId("photo-review-weight")?.value),
          weightUnit: clean(byId("photo-review-weight-unit")?.value),
          weightOunces: clean(byId("photo-review-ounces")?.value),
          followUpDate: clean(byId("photo-review-follow-up")?.value),
          details: clean(byId("photo-review-details")?.value)
        };
      }
      return next;
    }

    function confirmReview() {
      const next = collectReview();
      const validation = validateReview(next, animals());
      if (!validation.ok) {
        deps.toast(validation.issues[0] || "Review the extracted draft before continuing.", "error");
        return false;
      }
      telemetry("photo_draft_confirmed", "success", next.classification);
      deps.closeModal();
      return next.classification === "registration_document"
        ? deps.openAnimalForm("", next.defaults)
        : deps.openHealthForm("", next.defaults);
    }

    async function analyze() {
      if (!selectedFile) {
        deps.toast("Choose a JPG or PNG image first.", "error");
        return false;
      }
      if (!["image/jpeg","image/png"].includes(selectedFile.type)) {
        deps.toast("Photo-assisted entry currently supports JPG and PNG images.", "error");
        return false;
      }
      if (!cloud()?.getSession?.()?.user?.id) {
        deps.toast("Sign in before using photo-assisted entry.", "error");
        return false;
      }
      const button = byId("photo-entry-analyze");
      if (button) button.disabled = true;
      try {
        const dataUrl = await readFileAsDataUrl(selectedFile);
        if (dataUrl.length > 10_500_000) throw new Error("That image is too large. Resize it and try again.");
        const payload = { dataUrl, mimeType: selectedFile.type, fileName: selectedFile.name };
        const response = typeof cloud().invokeFunctionWithDiagnostics === "function"
          ? await cloud().invokeFunctionWithDiagnostics("photo-record-extract", payload)
          : await cloud().invokeFunction("photo-record-extract", payload);
        if (!response?.draft) throw new Error(response?.error || "The photo reader returned no review draft.");
        reviewed = canonicalDraft(response.draft, animals());
        telemetry("photo_draft_created", reviewed.classification === "unsupported" ? "failure" : "success", reviewed.classification);
        renderReview();
        return reviewed;
      } catch (error) {
        telemetry("photo_extraction_failed", "failure", reviewed?.classification || "");
        const code = clean(error?.code);
        const suffix = code && code !== "secure_service_error" ? " [" + code + "]" : "";
        deps.toast((error?.message || "HerdHarbor could not read that image.") + suffix, "error");
        return false;
      } finally {
        if (button) button.disabled = false;
      }
    }

    function open() {
      selectedFile = null;
      reviewed = null;
      deps.openModal("Photo-assisted entry",
        '<form id="photo-entry-form"><label>Record photo<input id="photo-entry-file" type="file" accept="image/jpeg,image/png"></label>' +
        '<p class="muted">Supported now: registration documents, veterinary documents, weight sheets, and medication labels. The image creates a review draft only.</p>' +
        '<div class="modal-actions"><button type="button" class="button button-ghost" id="photo-entry-cancel">Cancel</button><button type="submit" class="button button-primary" id="photo-entry-analyze">Analyze photo</button></div></form>' +
        '<div id="photo-entry-review"></div>',
        "Reviewed assistant"
      );
      byId("photo-entry-file")?.addEventListener("change", (event) => {
        selectedFile = event.target?.files?.[0] || null;
        reviewed = null;
        const reviewHost = byId("photo-entry-review");
        if (reviewHost) reviewHost.innerHTML = "";
      });
      byId("photo-entry-cancel")?.addEventListener("click", () => {
        telemetry("photo_entry_cancelled", "cancelled", "");
        deps.closeModal();
      });
      byId("photo-entry-form")?.addEventListener("submit", (event) => {
        event.preventDefault();
        analyze();
      });
      return true;
    }

    return Object.freeze({ VERSION, open, analyze, confirmReview });
  }

  return Object.freeze({ VERSION, CLASSES, exactAnimalMatches, canonicalDraft, validateReview, create });
});
