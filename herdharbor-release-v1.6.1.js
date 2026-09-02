(() => {
  "use strict";

  const release = Object.freeze({
    version: window.HerdHarborBuild?.version || "1.7.0",
    buildId: window.HerdHarborBuild?.buildId || "arba-standards-1",
    build: window.HerdHarborBuild?.build || "1.7.0-alpha-arba-standards-1",
    howToUrl: "https://herdharbor.com/how-to/",
    featureFlags: Object.freeze({
      adminMemberManagementEnabled: true,
      juniorPlanEnabled: true,
      billingEnabled: false
    }),
    plans: Object.freeze({
      junior: Object.freeze({ label: "Junior", priceMonthly: 0, maxActiveAnimals: 5 }),
      founder: Object.freeze({ label: "Founder", priceMonthly: 7.99, maxActiveAnimals: null }),
      member: Object.freeze({ label: "Member", priceMonthly: 14.99, maxActiveAnimals: null }),
      business: Object.freeze({ label: "Business", priceMonthly: null, maxActiveAnimals: null, reserved: true })
    })
  });

  const STORAGE_KEY = "herdharbor_pre_alpha_v1";

  // Supabase documents a supabase-js deadlock when additional Supabase API calls
  // are made synchronously from onAuthStateChange. HerdHarbor's cloud runtime
  // hydrates account access and farm records after SIGNED_IN, so defer every
  // registered auth callback until the auth notification has fully returned.
  // This guard is installed before herdharbor-cloud.js creates its client.
  function installSupabaseAuthDeadlockGuard() {
    const supabase = window.supabase;
    const originalCreateClient = supabase?.createClient;
    if (typeof originalCreateClient !== "function" || window.__HH_SUPABASE_AUTH_DEADLOCK_GUARD__) return;

    window.__HH_SUPABASE_AUTH_DEADLOCK_GUARD__ = true;
    supabase.createClient = function guardedCreateClient(...args) {
      const client = originalCreateClient.apply(this, args);
      const auth = client?.auth;
      const originalOnAuthStateChange = auth?.onAuthStateChange;
      if (typeof originalOnAuthStateChange !== "function" || auth.__hhDeferredAuthCallbacks) return client;

      auth.__hhDeferredAuthCallbacks = true;
      auth.onAuthStateChange = function guardedOnAuthStateChange(callback) {
        if (typeof callback !== "function") return originalOnAuthStateChange.call(auth, callback);
        return originalOnAuthStateChange.call(auth, (event, session) => {
          const defer = typeof window.setTimeout === "function" ? window.setTimeout.bind(window) : setTimeout;
          defer(() => {
            try {
              const result = callback(event, session);
              if (result && typeof result.catch === "function") {
                result.catch((error) => console.error("HerdHarbor auth-state callback failed:", error));
              }
            } catch (error) {
              console.error("HerdHarbor auth-state callback failed:", error);
            }
          }, 0);
        });
      };
      return client;
    };
  }

  installSupabaseAuthDeadlockGuard();

  function createElement(tagName) {
    try { return document.createElement?.(tagName) || null; } catch { return null; }
  }

  function addHelpButton() {
    const theme = document.querySelector?.("#theme-toggle");
    if (!theme || document.querySelector?.("#herdharbor-help-button")) return;
    const button = createElement("button");
    if (!button) return;
    button.id = "herdharbor-help-button";
    button.type = "button";
    button.className = "icon-button help-toggle";
    button.textContent = "?";
    button.title = "Open HerdHarbor How-To Center";
    button.setAttribute("aria-label", "Open HerdHarbor How-To Center");
    button.addEventListener("click", () => {
      const opened = window.open(release.howToUrl, "_blank", "noopener,noreferrer");
      if (!opened) window.location.href = release.howToUrl;
    });
    theme.insertAdjacentElement("afterend", button);
  }

  function addStyles() {
    if (document.querySelector?.("#herdharbor-v151-release-style")) return;
    const style = createElement("style");
    if (!style) return;
    style.id = "herdharbor-v151-release-style";
    style.textContent = ".help-toggle{font-size:1rem;font-weight:900}.topbar-actions .help-toggle{flex:0 0 auto}@media(max-width:620px){.help-toggle{width:40px;min-width:40px}}";
    const target = document.head || document.body || document.documentElement;
    if (target?.appendChild) target.appendChild(style);
  }

  function updateVersionLabels() {
    if (document.documentElement?.dataset) document.documentElement.dataset.herdharborRelease = release.version;
    document.querySelectorAll?.("[data-app-version], .app-version, .version-label").forEach((element) => {
      const current = String(element.textContent || "");
      if (/alpha|version|v\d/i.test(current)) element.textContent = current.replace(/(?:v)?1\.\d+\.\d+/gi, "v" + release.version);
    });
    document.querySelectorAll?.(".hh-bi-kicker").forEach((element) => {
      if (/Alpha v/i.test(element.textContent || "")) element.textContent = String(element.textContent).replace(/Alpha v\d+\.\d+\.\d+/i, "Alpha v" + release.version);
    });
  }

  function readState() {
    try {
      const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      state.animals = Array.isArray(state.animals) ? state.animals : [];
      return state;
    } catch {
      return { animals: [] };
    }
  }

  function canonicalSpecies(value) {
    try {
      return window.HerdHarborBreedingIntelligenceCore?.canonicalSpecies?.(value) || String(value || "");
    } catch {
      return String(value || "");
    }
  }

  function animalIdFromTrigger(trigger) {
    if (!trigger) return "";
    const candidates = [
      trigger.dataset?.gv2Profile,
      trigger.dataset?.animalGenetics,
      trigger.dataset?.geneticsAnimalId,
      trigger.dataset?.animalId,
      trigger.closest?.("[data-animal-id]")?.dataset?.animalId,
      trigger.closest?.("[data-view-animal]")?.dataset?.viewAnimal,
      trigger.closest?.(".animal-card")?.querySelector?.("[data-view-animal]")?.dataset?.viewAnimal
    ];
    const direct = candidates.find((value) => value != null && String(value).trim());
    if (direct != null) return String(direct);

    const modalTitle = document.querySelector?.("#modal-content h2, #modal-content h3, #modal .modal-header h2")?.textContent?.trim();
    if (!modalTitle) return "";
    const animal = readState().animals.find((row) => String(row.name || row.tag || "").trim() === modalTitle);
    return animal ? String(animal.id) : "";
  }

  function openAnimalGenetics(animalId) {
    const state = readState();
    const animal = state.animals.find((row) => String(row.id) === String(animalId));
    if (!animal) return false;

    if (canonicalSpecies(animal.species) !== "Rabbit") {
      try {
        window.HerdHarborPhase3?.openGenetics?.(animal.id);
        return Boolean(window.HerdHarborPhase3?.openGenetics);
      } catch {
        return false;
      }
    }

    const openers = [
      () => window.HerdHarborRabbitGeneticsV2?.openProfile?.(animal.id),
      () => window.HerdHarborBreedingIntelligence?.openGeneticProfile?.(animal.id),
      () => window.HerdHarborPhase3?.openGenetics?.(animal.id)
    ];

    for (const open of openers) {
      try {
        const apiReady = window.HerdHarborRabbitGeneticsV2?.openProfile || window.HerdHarborBreedingIntelligence?.openGeneticProfile || window.HerdHarborPhase3?.openGenetics;
        if (!apiReady) break;
        const result = open();
        if (result !== undefined || document.querySelector?.(".hh-bi-modal-backdrop, #hh-phase3-dialog")) return true;
      } catch {}
    }
    return false;
  }

  function isGeneticsTrigger(target) {
    const trigger = target?.closest?.("[data-gv2-profile], [data-animal-genetics], [data-genetics-animal-id], [data-bi-action=\"genetics\"], [data-bi-action=\"profile\"]");
    if (trigger) return trigger;
    const button = target?.closest?.("button, a");
    if (!button) return null;
    const text = String(button.textContent || "").trim().toLowerCase();
    if (text !== "genetics" && text !== "open genetics" && text !== "view genetics") return null;
    if (!button.closest?.(".animal-card, #modal-content, #modal, [data-animal-id]")) return null;
    return button;
  }

  function bindGeneticsRouting() {
    if (window.__hhV161GeneticsRouterBound) return;
    if (typeof document.addEventListener !== "function") return;
    window.__hhV161GeneticsRouterBound = true;
    document.addEventListener("click", (event) => {
      const trigger = isGeneticsTrigger(event.target);
      if (!trigger) return;
      const animalId = animalIdFromTrigger(trigger);
      if (!animalId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openAnimalGenetics(animalId);
    }, true);
  }

  function boot() {
    addStyles();
    addHelpButton();
    updateVersionLabels();
    bindGeneticsRouting();
  }

  window.HerdHarborRelease = release;
  window.HerdHarborAnimalGenetics = Object.freeze({
    version: release.version,
    open: openAnimalGenetics,
    resolveAnimalId: animalIdFromTrigger
  });
  if (document.readyState === "loading" && typeof document.addEventListener === "function") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
