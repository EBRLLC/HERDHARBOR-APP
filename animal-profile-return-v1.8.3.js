(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborAnimalProfileReturn = api;
  if (root && root.document) api.install();
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const VERSION = "1.8.3";
  const RETURNABLE_ACTIONS = Object.freeze([
    "weight",
    "health",
    "episode",
    "care",
    "breeding",
    "pedigree",
    "show-entry"
  ]);
  const RETURNABLE_SET = new Set(RETURNABLE_ACTIONS);
  const MAX_WAIT_MS = 15000;
  const SETTLE_MS = 120;

  let installed = false;
  let pending = null;
  let observer = null;
  let timer = 0;

  const clean = (value) => String(value == null ? "" : value).trim();

  function isGenericModalOpen() {
    const backdrop = root.document?.querySelector("#modal-backdrop");
    return Boolean(backdrop && !backdrop.classList.contains("hidden") && backdrop.getAttribute("aria-hidden") !== "true");
  }

  function isHealthIntelligenceOpen() {
    return Boolean(root.document?.querySelector("#hh-health-intelligence-modal"));
  }

  function expectedSurface(action) {
    return action === "episode" || action === "care" ? "health-intelligence" : "generic-modal";
  }

  function surfaceOpen(surface) {
    return surface === "health-intelligence" ? isHealthIntelligenceOpen() : isGenericModalOpen();
  }

  function clearPending() {
    pending = null;
    if (timer) root.clearTimeout?.(timer);
    timer = 0;
  }

  function canReturn(target) {
    if (!target?.animalId) return false;
    try {
      const state = root.HerdHarborApp?.getState?.() || {};
      return (Array.isArray(state.animals) ? state.animals : []).some((animal) => String(animal?.id) === String(target.animalId));
    } catch {
      return false;
    }
  }

  function returnToProfile(target) {
    if (!canReturn(target)) {
      clearPending();
      return false;
    }
    const flow = root.HerdHarborFlowPhase2;
    if (typeof flow?.openAnimalProfile !== "function") {
      clearPending();
      return false;
    }
    const restored = flow.openAnimalProfile(target.animalId, target.tab || "overview", { history: "none" });
    clearPending();
    return Boolean(restored);
  }

  function scheduleReturn(target) {
    if (timer) root.clearTimeout?.(timer);
    timer = root.setTimeout?.(() => {
      timer = 0;
      if (!pending || pending.token !== target.token) return;
      if (surfaceOpen(target.surface)) return;
      returnToProfile(target);
    }, SETTLE_MS);
  }

  function evaluate() {
    const target = pending;
    if (!target) return;
    if (Date.now() - target.startedAt > MAX_WAIT_MS && !target.seenOpen) {
      clearPending();
      return;
    }
    const open = surfaceOpen(target.surface);
    if (open) {
      target.seenOpen = true;
      if (timer) {
        root.clearTimeout?.(timer);
        timer = 0;
      }
      return;
    }
    if (target.seenOpen) scheduleReturn(target);
  }

  function startTracking(detail = {}) {
    const action = clean(detail.action);
    const animalId = clean(detail.animalId);
    if (!RETURNABLE_SET.has(action) || !animalId) return false;
    pending = {
      action,
      animalId,
      tab: clean(detail.tab) || "overview",
      surface: expectedSurface(action),
      startedAt: Date.now(),
      seenOpen: false,
      token: `${Date.now()}:${Math.random().toString(36).slice(2)}`
    };
    evaluate();
    return true;
  }

  function onAnimalAction(event) {
    startTracking(event?.detail || {});
  }

  function onMutation() {
    if (!pending) return;
    evaluate();
  }

  function install() {
    if (installed || !root.document) return API;
    installed = true;
    root.addEventListener?.("herdharbor:animal-action-opened", onAnimalAction);
    if (typeof root.MutationObserver === "function" && root.document.body) {
      observer = new root.MutationObserver(onMutation);
      observer.observe(root.document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "aria-hidden"]
      });
    }
    return API;
  }

  function uninstall() {
    if (!installed) return;
    root.removeEventListener?.("herdharbor:animal-action-opened", onAnimalAction);
    observer?.disconnect?.();
    observer = null;
    clearPending();
    installed = false;
  }

  const API = Object.freeze({
    VERSION,
    RETURNABLE_ACTIONS,
    expectedSurface,
    startTracking,
    install,
    uninstall
  });
  return API;
});
