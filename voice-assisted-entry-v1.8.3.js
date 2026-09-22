(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborVoiceAssistedEntry = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const VERSION = "1.8.3";
  const TYPES = Object.freeze(["weight", "medication", "breeding"]);
  const clean = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  const lower = (v) => clean(v).toLowerCase();

  function isoDate(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function addDays(iso, days) {
    const d = new Date(iso + "T12:00:00");
    if (Number.isNaN(d.getTime())) return "";
    d.setDate(d.getDate() + Number(days || 0));
    return isoDate(d);
  }

  function parseDate(text, today) {
    const s = lower(text);
    if (/\btoday\b/.test(s)) return today;
    if (/\byesterday\b/.test(s)) return addDays(today, -1);
    const iso = s.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
    if (iso) return iso[1] + "-" + String(iso[2]).padStart(2, "0") + "-" + String(iso[3]).padStart(2, "0");
    const us = s.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
    if (us) return us[3] + "-" + String(us[1]).padStart(2, "0") + "-" + String(us[2]).padStart(2, "0");
    return "";
  }

  function mentionedAnimals(text, animals) {
    const s = lower(text);
    return (Array.isArray(animals) ? animals : []).filter((animal) => {
      const name = lower(animal && animal.name);
      if (!name) return false;
      const start = s.indexOf(name);
      if (start < 0) return false;
      const before = start === 0 ? "" : s[start - 1];
      const after = s[start + name.length] || "";
      return (!before || !/[a-z0-9]/.test(before)) && (!after || !/[a-z0-9]/.test(after));
    });
  }

  function detectType(text) {
    const s = lower(text);
    const weight = /\b(weight|weighs?|weighed|pounds?|lbs?|ounces?|oz|kilograms?|kg|grams?)\b/.test(s);
    const breeding = /\b(breed|bred|breeding|pair|paired|mate|mated)\b/.test(s);
    const medication = /\b(medication|medicine|dose|dosed|administered|received|gave)\b/.test(s) &&
      /\b(ml|milliliters?|cc|mg|milligrams?|tablets?|tabs?|drops?)\b/.test(s);
    const found = [weight && "weight", medication && "medication", breeding && "breeding"].filter(Boolean);
    return found.length === 1 ? found[0] : "";
  }

  function parseWeight(text) {
    const s = lower(text);
    let m = s.match(/\b(\d+(?:\.\d+)?)\s*(pounds?|lbs?|lb)\b(?:\s*(?:and\s*)?(\d+(?:\.\d+)?)\s*(ounces?|oz)\b)?/);
    if (m) return { weight: m[1], weightUnit: m[3] ? "lb+oz" : "lb", weightOunces: m[3] || "" };
    m = s.match(/\b(\d+(?:\.\d+)?)\s*(ounces?|oz|kilograms?|kg|grams?|g)\b/);
    if (!m) return null;
    const unit = lower(m[2]);
    return {
      weight: m[1],
      weightUnit: unit.indexOf("oz") === 0 || unit.indexOf("ounce") === 0 ? "oz" :
        (unit.indexOf("kg") === 0 || unit.indexOf("kilogram") === 0 ? "kg" : "g"),
      weightOunces: ""
    };
  }

  function parseMedication(text) {
    const source = clean(text);
    const dose = source.match(/\b(\d+(?:\.\d+)?)\s*(mL|milliliters?|cc|mg|milligrams?|tablets?|tabs?|drops?)\b/i);
    const named = source.match(/\b(?:medication|medicine|med)\s+([A-Za-z0-9][A-Za-z0-9 ._\/-]{0,80}?)(?=\s+(?:today|yesterday|on\s+\d)|[,.]|$)/i);
    let name = named ? clean(named[1]) : "";
    if (!name && dose) {
      const tail = source.slice((dose.index || 0) + dose[0].length);
      const after = tail.match(/^\s*(?:of\s+)?([A-Za-z][A-Za-z0-9 ._\/-]{0,80}?)(?=\s+(?:today|yesterday|on\s+\d)|[,.]|$)/i);
      if (after) name = clean(after[1]).replace(/^(medication|medicine|med)\s+/i, "");
    }
    const rawUnit = dose ? lower(dose[2]) : "";
    const unit = ["ml", "milliliter", "milliliters", "cc"].includes(rawUnit) ? "mL" :
      (["mg", "milligram", "milligrams"].includes(rawUnit) ? "mg" :
      (rawUnit.indexOf("tab") === 0 ? "tablet" : (rawUnit.indexOf("drop") === 0 ? "drop" : rawUnit)));
    return { amount: dose ? dose[1] : "", unit, name };
  }

  function interpretTranscript(transcript, options) {
    options = options || {};
    const animals = Array.isArray(options.animals) ? options.animals : [];
    const today = clean(options.todayISO) || isoDate(new Date());
    const draft = { transcript: clean(transcript), recordType: "", confidence: "low", issues: [], date: "", defaults: {} };
    if (!draft.transcript) {
      draft.issues.push("Enter or speak an instruction first.");
      return draft;
    }
    draft.recordType = detectType(draft.transcript);
    if (!draft.recordType) {
      draft.issues.push("Say one supported action: weight, medication, or breeding.");
      return draft;
    }
    draft.date = parseDate(draft.transcript, today);
    if (!draft.date) draft.issues.push("A date is required. Say today, yesterday, or an explicit date.");

    const matches = mentionedAnimals(draft.transcript, animals);

    if (draft.recordType === "weight") {
      const w = parseWeight(draft.transcript);
      if (!w) draft.issues.push("A supported weight and unit are required.");
      if (matches.length !== 1) draft.issues.push(matches.length ? "More than one animal matched; choose the correct animal." : "No animal matched; choose the animal.");
      draft.defaults = {
        animalId: matches.length === 1 ? String(matches[0].id) : "",
        date: draft.date, type: "Weight",
        weight: w ? w.weight : "", weightUnit: w ? w.weightUnit : "lb",
        weightOunces: w ? w.weightOunces : "", details: "Weight measurement."
      };
    }

    if (draft.recordType === "medication") {
      const med = parseMedication(draft.transcript);
      if (!med.amount || !med.unit) draft.issues.push("A medication dose and unit are required.");
      if (!med.name) draft.issues.push("The medication name is required.");
      if (matches.length !== 1) draft.issues.push(matches.length ? "More than one animal matched; choose the correct animal." : "No animal matched; choose the animal.");
      draft.defaults = {
        animalId: matches.length === 1 ? String(matches[0].id) : "",
        date: draft.date, type: "Medication",
        details: med.name && med.amount && med.unit ? med.name + " · " + med.amount + " " + med.unit : ""
      };
    }

    if (draft.recordType === "breeding") {
      const females = matches.filter((a) => lower(a.sex) === "female");
      const males = matches.filter((a) => lower(a.sex) === "male");
      if (matches.length !== 2) draft.issues.push("A breeding instruction requires exactly two matched animals.");
      if (females.length !== 1) draft.issues.push("Choose exactly one recorded female/dam.");
      if (males.length !== 1) draft.issues.push("Choose exactly one recorded male/sire.");
      if (females[0] && males[0] && females[0].species && males[0].species && females[0].species !== males[0].species) draft.issues.push("Dam and sire must be the same species.");
      draft.defaults = {
        femaleId: females.length === 1 ? String(females[0].id) : "",
        maleId: males.length === 1 ? String(males[0].id) : "",
        breedingDate: draft.date, method: "Natural service",
        pregnancyCheckStatus: "Not checked", status: "Bred", notes: ""
      };
    }

    draft.confidence = draft.issues.length ? (draft.date ? "medium" : "low") : "high";
    return draft;
  }

  function validateDraft(draft, animals) {
    const issues = [];
    animals = Array.isArray(animals) ? animals : [];
    if (!draft || !TYPES.includes(draft.recordType)) return { ok: false, issues: ["Choose a supported record type."] };
    if (!draft.date) issues.push("Date is required.");
    if (draft.recordType === "weight") {
      if (!draft.defaults.animalId) issues.push("Animal is required.");
      if (!draft.defaults.weight) issues.push("Weight is required.");
    }
    if (draft.recordType === "medication") {
      if (!draft.defaults.animalId) issues.push("Animal is required.");
      if (!clean(draft.defaults.details)) issues.push("Medication name and dose are required.");
    }
    if (draft.recordType === "breeding") {
      const female = animals.find((a) => String(a.id) === String(draft.defaults.femaleId));
      const male = animals.find((a) => String(a.id) === String(draft.defaults.maleId));
      if (!female || lower(female.sex) !== "female") issues.push("A recorded female/dam is required.");
      if (!male || lower(male.sex) !== "male") issues.push("A recorded male/sire is required.");
      if (female && male && String(female.id) === String(male.id)) issues.push("Dam and sire must be different animals.");
      if (female && male && female.species && male.species && female.species !== male.species) issues.push("Dam and sire must be the same species.");
    }
    return { ok: issues.length === 0, issues };
  }

  function create(deps) {
    deps = deps || {};
    ["getState","openModal","closeModal","openHealthForm","openBreedingForm","todayISO","esc","toast"].forEach((name) => {
      if (typeof deps[name] !== "function") throw new Error("Voice-assisted entry requires " + name + "().");
    });
    let draft = null;
    let recognition = null;

    const animals = () => {
      const state = deps.getState() || {};
      return Array.isArray(state.animals) ? state.animals : [];
    };
    const byId = (id) => root.document && root.document.getElementById(id);
    const optionList = (selected, sex) => animals().filter((a) => !sex || lower(a.sex) === lower(sex)).map((a) =>
      '<option value="' + deps.esc(a.id) + '"' + (String(a.id) === String(selected) ? " selected" : "") + '>' + deps.esc(a.name || "Unnamed animal") + "</option>"
    ).join("");

    function telemetry(action, result, recordType) {
      try {
        root.HerdHarborMonitoring && root.HerdHarborMonitoring.addBreadcrumb && root.HerdHarborMonitoring.addBreadcrumb({
          module: recordType === "breeding" ? "breeding" : (recordType ? "health" : "dashboard"),
          action, result, metadata: recordType ? { record_type: recordType } : {}
        });
      } catch {}
    }

    function renderReview() {
      const host = byId("voice-entry-review");
      if (!host || !draft) return;
      let fields = "";
      if (draft.recordType === "weight" || draft.recordType === "medication") {
        fields += '<label>Animal<select id="voice-review-animal"><option value="">Choose an animal</option>' + optionList(draft.defaults.animalId, "") + "</select></label>";
        fields += '<label>Date<input id="voice-review-date" type="date" value="' + deps.esc(draft.date) + '"></label>';
        if (draft.recordType === "weight") {
          fields += '<label>Weight<input id="voice-review-weight" type="number" min="0" step="0.01" value="' + deps.esc(draft.defaults.weight) + '"></label>';
          fields += '<label>Unit<select id="voice-review-weight-unit">' + ["lb","lb+oz","oz","kg","g"].map((u) => '<option value="' + u + '"' + (u === draft.defaults.weightUnit ? " selected" : "") + ">" + u + "</option>").join("") + "</select></label>";
          fields += '<label>Ounces<input id="voice-review-ounces" type="number" min="0" max="15.9" step="0.1" value="' + deps.esc(draft.defaults.weightOunces || "") + '"></label>';
        } else {
          fields += '<label>Medication and dose<input id="voice-review-details" type="text" value="' + deps.esc(draft.defaults.details || "") + '"></label>';
        }
      } else if (draft.recordType === "breeding") {
        fields += '<label>Dam<select id="voice-review-female"><option value="">Choose a dam</option>' + optionList(draft.defaults.femaleId, "Female") + "</select></label>";
        fields += '<label>Sire<select id="voice-review-male"><option value="">Choose a sire</option>' + optionList(draft.defaults.maleId, "Male") + "</select></label>";
        fields += '<label>Breeding date<input id="voice-review-date" type="date" value="' + deps.esc(draft.date) + '"></label>';
      }
      const issueHtml = draft.issues.length ? '<div class="notice"><strong>Needs review</strong><ul>' + draft.issues.map((x) => "<li>" + deps.esc(x) + "</li>").join("") + "</ul></div>" : '<div class="notice"><strong>Draft looks complete.</strong> Review every field before continuing.</div>';
      host.innerHTML = '<div class="panel" style="margin-top:14px"><div class="panel-header"><div><h3>Review draft</h3><small>Confidence: ' + deps.esc(draft.confidence) + '</small></div></div>' +
        issueHtml + '<div class="form-grid two">' + fields + '</div><p class="muted">Nothing has been saved. This only opens the normal HerdHarbor form for final review and save.</p>' +
        '<div class="modal-actions"><button type="button" class="button button-ghost" id="voice-review-cancel">Cancel</button><button type="button" class="button button-primary" id="voice-review-confirm"' + (draft.recordType ? "" : " disabled") + '>Use reviewed draft</button></div></div>';
      const cancel = byId("voice-review-cancel");
      if (cancel) cancel.addEventListener("click", () => { telemetry("voice_draft_cancelled","cancelled",draft.recordType); deps.closeModal(); });
      const confirm = byId("voice-review-confirm");
      if (confirm) confirm.addEventListener("click", confirmDraft);
    }

    function reviewedDraft() {
      if (!draft) return null;
      const next = JSON.parse(JSON.stringify(draft));
      const date = byId("voice-review-date") ? byId("voice-review-date").value : "";
      next.date = date;
      if (next.recordType === "weight" || next.recordType === "medication") {
        next.defaults.animalId = byId("voice-review-animal") ? byId("voice-review-animal").value : "";
        next.defaults.date = date;
      }
      if (next.recordType === "weight") {
        next.defaults.weight = byId("voice-review-weight") ? byId("voice-review-weight").value : "";
        next.defaults.weightUnit = byId("voice-review-weight-unit") ? byId("voice-review-weight-unit").value : "";
        next.defaults.weightOunces = byId("voice-review-ounces") ? byId("voice-review-ounces").value : "";
      }
      if (next.recordType === "medication") next.defaults.details = clean(byId("voice-review-details") ? byId("voice-review-details").value : "");
      if (next.recordType === "breeding") {
        next.defaults.femaleId = byId("voice-review-female") ? byId("voice-review-female").value : "";
        next.defaults.maleId = byId("voice-review-male") ? byId("voice-review-male").value : "";
        next.defaults.breedingDate = date;
      }
      return next;
    }

    function confirmDraft() {
      const next = reviewedDraft();
      const check = validateDraft(next, animals());
      if (!check.ok) {
        deps.toast(check.issues[0] || "Review the draft before continuing.", "error");
        return false;
      }
      telemetry("voice_draft_confirmed","success",next.recordType);
      deps.closeModal();
      return next.recordType === "breeding" ? deps.openBreedingForm("", next.defaults) : deps.openHealthForm("", next.defaults);
    }

    function interpretFromUi() {
      draft = interpretTranscript(byId("voice-entry-transcript") ? byId("voice-entry-transcript").value : "", { animals: animals(), todayISO: deps.todayISO() });
      telemetry("voice_transcript_interpreted", draft.recordType ? "success" : "failure", draft.recordType);
      renderReview();
      return draft;
    }

    function startListening() {
      const Recognition = root.SpeechRecognition || root.webkitSpeechRecognition;
      if (typeof Recognition !== "function") {
        deps.toast("Voice recognition is not available here. Type the instruction instead.", "error");
        return false;
      }
      try {
        if (recognition && recognition.abort) recognition.abort();
        recognition = new Recognition();
        recognition.lang = "en-US";
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.onresult = (event) => {
          const transcript = clean(event && event.results && event.results[0] && event.results[0][0] && event.results[0][0].transcript);
          const input = byId("voice-entry-transcript");
          if (input && transcript) input.value = transcript;
          telemetry("voice_capture_completed","success","");
        };
        recognition.onerror = () => {
          telemetry("voice_capture_failed","failure","");
          deps.toast("Voice capture did not complete. Farm records were not changed.", "error");
        };
        recognition.start();
        telemetry("voice_capture_started","success","");
        return true;
      } catch {
        telemetry("voice_capture_failed","failure","");
        deps.toast("Voice capture could not start. Type the instruction instead.", "error");
        return false;
      }
    }

    function open() {
      draft = null;
      deps.openModal("Voice-assisted entry",
        '<form id="voice-entry-form"><label>Instruction<textarea id="voice-entry-transcript" rows="4" placeholder="Example: Add a weight of 4 pounds 3 ounces to Daisy today."></textarea></label>' +
        '<p class="muted">Supported now: weight, medication, and breeding. Voice only creates a review draft.</p>' +
        '<div class="modal-actions"><button type="button" class="button button-ghost" id="voice-entry-listen">Speak</button><button type="button" class="button button-ghost" id="voice-entry-cancel">Cancel</button><button type="submit" class="button button-primary">Interpret</button></div></form><div id="voice-entry-review"></div>',
        "Reviewed assistant"
      );
      const cancel = byId("voice-entry-cancel");
      if (cancel) cancel.addEventListener("click", () => { if (recognition && recognition.abort) recognition.abort(); telemetry("voice_entry_cancelled","cancelled",""); deps.closeModal(); });
      const listen = byId("voice-entry-listen");
      if (listen) listen.addEventListener("click", startListening);
      const form = byId("voice-entry-form");
      if (form) form.addEventListener("submit", (event) => { event.preventDefault(); interpretFromUi(); });
      return true;
    }

    return Object.freeze({ VERSION, open, interpretFromUi, confirmDraft });
  }

  return Object.freeze({ VERSION, TYPES, parseDate, detectType, parseWeight, parseMedication, mentionedAnimals, interpretTranscript, validateDraft, create });
});
