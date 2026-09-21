(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborAnimalActionRouter = api;
  if (root && root.document) api.install();
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const VERSION = "1.8.3";
  const DIRECT_ACTIONS = Object.freeze([
    "weight",
    "health",
    "episode",
    "care",
    "breeding",
    "genetics",
    "pedigree",
    "show-entry",
    "analytics",
    "print-pedigree",
    "edit"
  ]);
  const DIRECT_ACTION_SET = new Set(DIRECT_ACTIONS);
  const RETURN_TTL_MS = 5 * 60 * 1000;
  const RETURN_SURFACES = Object.freeze({
    weight: "#health-form",
    health: "#health-form",
    episode: "#hh-health-intelligence-modal",
    care: "#hh-health-intelligence-modal",
    breeding: "#breeding-form",
    pedigree: "#pedigree-import-form",
    "show-entry": "#hh-entry-form",
    "print-pedigree": "#print-pedigree-form",
    edit: "#animal-form"
  });

  let installed = false;
  let returnWatchToken = 0;

  const clean = (value) => String(value == null ? "" : value).trim();
  const lower = (value) => clean(value).toLowerCase();

  function stateNow() {
    try { return root.HerdHarborApp?.getState?.() || {}; }
    catch { return {}; }
  }

  function animalById(state, animalId) {
    return (Array.isArray(state?.animals) ? state.animals : [])
      .find((animal) => String(animal?.id) === String(animalId)) || null;
  }

  function toast(message, type = "info") {
    try { root.HerdHarborApp?.toast?.(message, type); } catch {}
  }

  function nav(route) {
    const button = root.document?.querySelector(`.nav-item[data-route="${route}"]`);
    if (!button) return false;
    button.click();
    return true;
  }

  function waitFor(selector, callback, attempt = 0, max = 45) {
    const node = root.document?.querySelector(selector);
    if (node) {
      callback(node);
      return true;
    }
    if (attempt >= max) return false;
    root.setTimeout?.(() => waitFor(selector, callback, attempt + 1, max), 50);
    return true;
  }

  function setFormValue(formSelector, name, value) {
    waitFor(formSelector, (form) => {
      const field = form.querySelector(`[name="${name}"]`);
      if (!field) return;
      field.value = value == null ? "" : String(value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function isCurrentAnimal(animal) {
    try {
      if (typeof root.HerdHarborPhase1Workflow?.isCurrentAnimal === "function") {
        return Boolean(root.HerdHarborPhase1Workflow.isCurrentAnimal(animal));
      }
    } catch {}
    return !new Set(["sold", "deceased", "archived", "ancestor only", "ancestor-only", "ancestor_only"]).has(lower(animal?.status));
  }

  function isQuarantined(state, animalId) {
    try {
      const model = root.HerdHarborPhase1Workflow?.profileModel?.(state, animalId);
      if (model) return Boolean(model.quarantined);
    } catch {}
    try {
      const health = root.HerdHarborHealthIntelligence?.readHealthState?.() || state?.healthIntelligence || {};
      return (Array.isArray(health?.episodes) ? health.episodes : [])
        .some((episode) => String(episode?.animalId) === String(animalId) && !episode?.resolved && episode?.quarantined);
    } catch {
      return false;
    }
  }

  function breedingAvailability(animal, quarantined = false) {
    if (!animal) return { allowed: false, reason: "missing-animal" };
    if (!isCurrentAnimal(animal)) return { allowed: false, reason: "historical" };
    if (quarantined) return { allowed: false, reason: "quarantined" };
    if (!["female", "male"].includes(lower(animal.sex))) return { allowed: false, reason: "missing-sex" };
    return { allowed: true, reason: "" };
  }

  function activeProfileTarget() {
    try {
      const parsed = root.HerdHarborFlowPhase2?.parseProfileHash?.(root.location?.hash || "");
      return parsed?.animalId ? { animalId: String(parsed.animalId), tab: parsed.tab || "overview" } : null;
    } catch {
      return null;
    }
  }

  function announce(action, animalId, tab = "") {
    try {
      root.dispatchEvent?.(new CustomEvent("herdharbor:animal-action-opened", {
        detail: { action, animalId: String(animalId), tab: clean(tab), version: VERSION }
      }));
    } catch {}
  }

  function openHealthRecord(animalId, type = "Observation") {
    if (!nav("health")) {
      toast("Health is not available right now.", "error");
      return false;
    }
    root.setTimeout?.(() => {
      const add = root.document?.querySelector("#add-health");
      if (!add) {
        toast("Health entry did not load. Try again.", "error");
        return;
      }
      add.click();
      setFormValue("#health-form", "animalId", animalId);
      setFormValue("#health-form", "type", type);
    }, 0);
    return true;
  }

  function openHealthIntelligence(animalId, action = "episode") {
    if (!root.HerdHarborHealthIntelligence) return openHealthRecord(animalId, "Observation");
    const trigger = root.document.createElement("button");
    trigger.type = "button";
    trigger.dataset.hiAction = action;
    trigger.hidden = true;
    root.document.body.appendChild(trigger);
    trigger.click();
    trigger.remove();
    setFormValue("#hh-health-intelligence-modal form", "animalId", animalId);
    return true;
  }

  function openBreeding(animalId) {
    const state = stateNow();
    const animal = animalById(state, animalId);
    const availability = breedingAvailability(animal, isQuarantined(state, animalId));
    if (!availability.allowed) {
      if (availability.reason === "historical") toast("Historical animals cannot start a new breeding.", "error");
      else if (availability.reason === "quarantined") toast(`${animal?.name || "This animal"} is quarantined. Clear the active quarantine before starting a breeding.`, "error");
      else if (availability.reason === "missing-sex") toast("Record the animal sex before starting a breeding.", "error");
      else toast("That animal is not available for breeding.", "error");
      return false;
    }
    if (!nav("breeding")) {
      toast("Breeding is not available right now.", "error");
      return false;
    }
    root.setTimeout?.(() => {
      const add = root.document?.querySelector("#add-breeding");
      if (!add) {
        toast("Breeding entry did not load. Try again.", "error");
        return;
      }
      add.click();
      setFormValue("#breeding-form", lower(animal.sex) === "female" ? "femaleId" : "maleId", animal.id);
    }, 0);
    return true;
  }

  function openGenetics(animalId) {
    if (typeof root.HerdHarborAnimalGenetics?.open !== "function") {
      toast("Genetics is not available for this animal right now.", "error");
      return false;
    }
    root.HerdHarborAnimalGenetics.open(animalId);
    return true;
  }

  function openPedigree(animalId) {
    if (!nav("pedigrees")) {
      toast("Pedigrees is not available right now.", "error");
      return false;
    }
    waitFor("#import-pedigree", (button) => {
      button.click();
      setFormValue("#pedigree-import-form", "subjectAnimalId", animalId);
    });
    return true;
  }

  function openShowEntry(animalId) {
    if (!nav("shows")) {
      toast("Shows is still loading. Try again in a moment.", "error");
      return false;
    }
    waitFor("[data-add-entry]", (button) => {
      button.click();
      setFormValue("#hh-entry-form", "animalId", animalId);
    });
    return true;
  }

  function openAnalytics(animalId) {
    if (typeof root.HerdHarborAnalytics?.openAnimal !== "function") {
      toast("Analytics is not available right now.", "error");
      return false;
    }
    root.HerdHarborAnalytics.openAnimal(animalId);
    if (!nav("analytics")) {
      toast("Analytics is not available right now.", "error");
      return false;
    }
    return true;
  }

  function openPedigreePrint(animalId) {
    if (typeof root.HerdHarborApp?.openAnimalPedigreePrint !== "function") {
      toast("Pedigree printing is not available right now.", "error");
      return false;
    }
    return root.HerdHarborApp.openAnimalPedigreePrint(animalId) === true;
  }

  function openEditor(animalId) {
    if (typeof root.HerdHarborApp?.openAnimalEditor !== "function") {
      toast("Animal editing is not available right now.", "error");
      return false;
    }
    return root.HerdHarborApp.openAnimalEditor(animalId) === true;
  }

  function canHandle(action) {
    return DIRECT_ACTION_SET.has(clean(action));
  }

  function returnSurfaceFor(action) {
    return RETURN_SURFACES[clean(action)] || "";
  }

  function restoreAnimalProfile(context) {
    const state = stateNow();
    if (!animalById(state, context.animalId)) {
      nav("animals");
      return false;
    }
    if (typeof root.HerdHarborFlowPhase2?.openAnimalProfile !== "function") return false;
    return root.HerdHarborFlowPhase2.openAnimalProfile(
      context.animalId,
      context.tab || "overview",
      { history: "replace" }
    ) === true;
  }

  function watchReturnToProfile(action, animalId, tab = "overview") {
    const selector = returnSurfaceFor(action);
    if (!selector || !root.document?.querySelector) return false;
    const token = ++returnWatchToken;
    const context = {
      animalId: String(animalId),
      tab: clean(tab) || "overview",
      expiresAt: Date.now() + RETURN_TTL_MS
    };
    let seen = false;

    const poll = () => {
      if (token !== returnWatchToken) return;
      const present = Boolean(root.document?.querySelector(selector));
      if (present) seen = true;
      else if (seen) {
        returnWatchToken += 1;
        restoreAnimalProfile(context);
        return;
      }
      if (Date.now() >= context.expiresAt) return;
      root.setTimeout?.(poll, 60);
    };

    root.setTimeout?.(poll, 0);
    return true;
  }

  function open(action, animalId, options = {}) {
    const nextAction = clean(action);
    const id = clean(animalId);
    if (!id || !canHandle(nextAction)) return false;

    let launched = false;
    if (nextAction === "weight") launched = openHealthRecord(id, "Weight");
    else if (nextAction === "health") launched = openHealthRecord(id, "Observation");
    else if (nextAction === "episode") launched = openHealthIntelligence(id, "episode");
    else if (nextAction === "care") launched = openHealthIntelligence(id, "care");
    else if (nextAction === "breeding") launched = openBreeding(id);
    else if (nextAction === "genetics") launched = openGenetics(id);
    else if (nextAction === "pedigree") launched = openPedigree(id);
    else if (nextAction === "show-entry") launched = openShowEntry(id);
    else if (nextAction === "analytics") launched = openAnalytics(id);
    else if (nextAction === "print-pedigree") launched = openPedigreePrint(id);
    else if (nextAction === "edit") launched = openEditor(id);

    if (launched) {
      watchReturnToProfile(nextAction, id, options.returnTab || "overview");
      announce(nextAction, id, options.returnTab || "");
    }
    return launched;
  }

  function onCaptureClick(event) {
    const actionNode = event.target?.closest?.("#view-animal-profile.active [data-hh-p2-action]");
    if (!actionNode) return;
    const action = actionNode.dataset.hhP2Action || "";
    if (!canHandle(action)) return;
    const target = activeProfileTarget();
    if (!target?.animalId) return;
    const handled = open(action, target.animalId, { returnTab: target.tab });
    if (!handled) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function install() {
    if (installed || !root.document) return API;
    installed = true;
    root.document.addEventListener("click", onCaptureClick, true);
    return API;
  }

  function uninstall() {
    if (!installed || !root.document) return;
    root.document.removeEventListener("click", onCaptureClick, true);
    installed = false;
  }

  const API = Object.freeze({
    VERSION,
    DIRECT_ACTIONS,
    canHandle,
    returnSurfaceFor,
    breedingAvailability,
    activeProfileTarget,
    open,
    install,
    uninstall
  });
  return API;
});
