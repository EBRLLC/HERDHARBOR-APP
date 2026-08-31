(() => {
  "use strict";

  const APP_VERSION = "1.5.1";
  const BUILD_ID = "membership-review-2";
  const PWA_BUILD = `${APP_VERSION}-alpha-stability-${BUILD_ID}`;
  const UPDATE_CHECK_MIN_INTERVAL_MS = 60_000;
  let installPrompt = null;
  let registration = null;
  let updateToast = null;
  let pendingUpdateWorker = null;
  let updateCheckInFlight = null;
  let lastUpdateCheckAt = 0;
  let reloading = false;
  let updateDeferredUntil = 0;

  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const pendingDynamicNodes = new Map();

  function dynamicInsertionTarget() {
    return document.head || document.body || document.documentElement || null;
  }

  function appendDynamicNode(id, node) {
    if (document.getElementById(id) || pendingDynamicNodes.has(id)) return;
    const pending = { node };
    pendingDynamicNodes.set(id, pending);

    const insert = () => {
      if (pendingDynamicNodes.get(id) !== pending) return;
      const target = dynamicInsertionTarget();
      if (!target) {
        const retry = typeof window.setTimeout === "function" ? window.setTimeout : setTimeout;
        retry(insert, 0);
        return;
      }
      if (!document.getElementById(id)) target.appendChild(node);
      pendingDynamicNodes.delete(id);
    };

    insert();
  }

  function addStylesheet(id, href) {
    if (document.getElementById(id)) return;
    const style = document.createElement("link");
    style.id = id;
    style.rel = "stylesheet";
    style.href = href;
    appendDynamicNode(id, style);
  }

  function addScript(id, src, onload) {
    if (document.getElementById(id)) { if (onload) onload(); return; }
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = false;
    if (onload) script.addEventListener("load", onload, { once: true });
    appendDynamicNode(id, script);
  }

  function addOptionalScript(id, src, done) {
    const existing = document.getElementById(id);
    if (existing) { done?.(true); return; }
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = false;
    let finished = false;
    const finish = (loaded) => {
      if (finished) return;
      finished = true;
      done?.(loaded);
    };
    script.addEventListener("load", () => finish(true), { once: true });
    script.addEventListener("error", () => finish(false), { once: true });
    appendDynamicNode(id, script);
  }

  function monitoring() {
    return window.HerdHarborMonitoring || null;
  }

  function monitorFailure(error, errorCategory, moduleName = "dashboard", metadata = {}) {
    try {
      monitoring()?.captureError?.(error, {
        module: moduleName,
        errorCategory,
        metadata: {
          module: moduleName,
          result: "failure",
          ...metadata
        }
      });
    } catch {}
  }

  function loadMonitoring(done) {
    addOptionalScript("hh-monitoring-config", "herdharbor-monitoring-config.js?v=1.5.1", (configLoaded) => {
      if (!configLoaded) { done?.(); return; }
      addOptionalScript("hh-monitoring-v151", "vendor/herdharbor-monitoring-v1.5.1.min.js?v=1.5.1", () => done?.());
    });
  }

  function loadPedigreeVisuals() {
    addStylesheet("hh-pedigree-visual-style", "pedigree-visual.css?v=2");
    addScript("hh-pedigree-visual-script", "pedigree-visual.js?v=2");
  }

  function loadBreedingIntelligence() {
    addStylesheet("hh-breeding-intelligence-style", "breeding-intelligence.css?v=1.4.0");
    addStylesheet("hh-rabbit-genetics-v2-style", "breeding-genetics-v2.css?v=2.0.0");
    addScript("hh-rabbit-records-v145", "rabbit-records-v1.4.5.js?v=1.4.5", () => {
      addScript("hh-breeding-intelligence-core-script", "breeding-intelligence-core.js?v=1.4.0", () => {
        addScript("hh-rabbit-genetics-v2-engine", "rabbit-genetics-engine-v2.js?v=2.0.0", () => {
          addScript("hh-rabbit-genetics-v145-engine", "rabbit-genetics-engine-v1.4.5.js?v=1.4.5", () => {
            addScript("hh-rabbit-genetics-v145-runtime", "rabbit-genetics-runtime-v1.4.5.js?v=1.4.5", () => {
              addStylesheet("hh-pedigree-genetics-v145-style", "pedigree-genetics-v1.4.5.css?v=1.4.5");
              addScript("hh-pedigree-genetics-v145-script", "pedigree-genetics-v1.4.5.js?v=1.4.5", () => {
                window.dispatchEvent(new CustomEvent("herdharbor:genetics-ready", { detail: { releaseVersion: "1.4.5" } }));
                addScript("hh-breeding-intelligence-script", "breeding-intelligence.js?v=1.4.0", () => {
                  addScript("hh-breeding-pair-hotfix-script", "breeding-pair-hotfix-v1.4.2.js?v=1", () => {
                    addScript("hh-rabbit-genetics-v145-ui", "rabbit-genetics-ui-v1.4.5.js?v=1.4.5", () => {
                      addScript("hh-rabbit-genetics-v2-ui", "rabbit-genetics-ui-v2.js?v=2.0.0", () => {
                        addScript("hh-breeding-intelligence-tools-script", "breeding-intelligence-tools.js?v=1.4.0", () => {
                          addScript("hh-v145-release-script", "herdharbor-release-v1.4.5.js?v=1.4.5");
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  }

  function loadShows() {
    addStylesheet("hh-shows-v150-style", "shows-v1.5.0.css?v=1.5.0");
    addScript("hh-shows-v150-script", "shows-v1.5.0.js?v=1.5.0", () => {
      addScript("hh-shows-v150-hardening", "shows-v1.5.0-hardening.js?v=1.5.0", () => {
        addScript("hh-shows-v150-performance", "shows-v1.5.0-performance.js?v=1.5.0");
      });
    });
  }

  function refreshManifestLink() {
    const manifest = document.querySelector('link[rel="manifest"]');
    if (!manifest) return;
    manifest.href = `manifest.json?build=${encodeURIComponent(PWA_BUILD)}`;
  }

  function installLabel() {
    if (isStandalone()) return "HerdHarbor is installed";
    if (installPrompt) return "Install HerdHarbor";
    if (isIos()) return "Add to Home Screen";
    return "Installation available from your browser menu";
  }

  function refreshInstallUI() {
    const installed = isStandalone();
    document.querySelectorAll("[data-pwa-install]").forEach((button) => {
      button.hidden = false;
      button.disabled = installed;
      button.textContent = button.id === "install-app-button" && !installed ? "Install app" : installLabel();
    });
    const topButton = document.querySelector("#install-app-button");
    if (topButton) { topButton.hidden = installed || (!installPrompt && !isIos()); topButton.disabled = installed; }
    const note = document.querySelector("#pwa-install-note");
    const versionText = `Version ${APP_VERSION} · Build ${BUILD_ID}`;
    if (note) note.textContent = installed
      ? `This device is running the installed HerdHarbor app. ${versionText}.`
      : isIos()
        ? `On iPhone or iPad, tap Share, then Add to Home Screen. ${versionText}.`
        : `The installed app uses the same account and protected cloud records as the website. ${versionText}.`;
    document.querySelectorAll("[data-herdharbor-version]").forEach((element) => {
      element.textContent = versionText;
    });
  }

  async function requestInstall() {
    if (isStandalone()) return;
    if (installPrompt) { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; refreshInstallUI(); return; }
    if (isIos()) { window.alert("To install HerdHarbor: tap the Share button in Safari, then tap Add to Home Screen."); return; }
    window.alert("Open your browser menu and choose Install app or Add to Home screen.");
  }

  function showUpdateReady(worker) {
    if (!worker) return;
    pendingUpdateWorker = worker;
    if (Date.now() < updateDeferredUntil) return;
    if (updateToast) return;
    updateToast = document.createElement("aside");
    updateToast.className = "hh-pwa-update";
    updateToast.setAttribute("role", "status");
    updateToast.innerHTML = `<strong>HerdHarbor Update Available</strong><span>A new version of HerdHarbor is ready. Finish any unsaved entry before updating. Cloud Sync is not required.</span><div><button type="button" data-hh-update-now>Update Now</button><button type="button" data-hh-update-later>Later</button></div>`;
    updateToast.querySelector("[data-hh-update-now]").addEventListener("click", () => {
      const workerToActivate = registration?.waiting || pendingUpdateWorker;
      if (!workerToActivate) {
        updateToast.querySelector("[data-hh-update-now]").textContent = "Checking…";
        checkForAppUpdate({ force: true });
        return;
      }
      updateToast.querySelector("[data-hh-update-now]").disabled = true;
      updateToast.querySelector("[data-hh-update-now]").textContent = "Updating…";
      workerToActivate.postMessage({ type: "SKIP_WAITING" });
    });
    updateToast.querySelector("[data-hh-update-later]").addEventListener("click", () => {
      updateDeferredUntil = Date.now() + (4 * 60 * 60 * 1000);
      updateToast.remove();
      updateToast = null;
    });
    document.body.appendChild(updateToast);
  }

  function watchInstallingWorker(worker) {
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) {
        showUpdateReady(registration?.waiting || worker);
      }
    });
  }

  async function checkForAppUpdate({ force = false } = {}) {
    if (!registration || navigator.onLine === false) return false;
    if (registration.waiting && navigator.serviceWorker.controller) {
      showUpdateReady(registration.waiting);
      return true;
    }
    const now = Date.now();
    if (!force && now - lastUpdateCheckAt < UPDATE_CHECK_MIN_INTERVAL_MS) return false;
    if (updateCheckInFlight) return updateCheckInFlight;
    lastUpdateCheckAt = now;
    updateCheckInFlight = (async () => {
      try {
        await registration.update();
        if (registration.waiting && navigator.serviceWorker.controller) {
          showUpdateReady(registration.waiting);
          return true;
        }
        return false;
      } catch (error) {
        if (navigator.onLine !== false) {
          console.warn("HerdHarbor could not check for an app update:", error);
          monitorFailure(error, "update_check_failure", "dashboard", { operation: "pwa_update_check" });
        }
        return false;
      }
    })();
    try {
      return await updateCheckInFlight;
    } finally {
      updateCheckInFlight = null;
    }
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    try {
      registration = await navigator.serviceWorker.register("service-worker.js", {
        scope: "./",
        updateViaCache: "none"
      });
      if (registration.waiting && navigator.serviceWorker.controller) showUpdateReady(registration.waiting);
      if (registration.installing) watchInstallingWorker(registration.installing);
      registration.addEventListener("updatefound", () => watchInstallingWorker(registration.installing));
      await checkForAppUpdate({ force: true });
    } catch (error) {
      console.error("HerdHarbor could not register its offline app shell:", error);
      monitorFailure(error, "service_worker_failure", "dashboard", { operation: "service_worker_registration" });
    }
  }

  function requestForegroundUpdateCheck() {
    if (document.visibilityState === "visible") checkForAppUpdate();
  }

  window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); installPrompt = event; refreshInstallUI(); });
  window.addEventListener("appinstalled", () => { installPrompt = null; refreshInstallUI(); });
  window.addEventListener("focus", requestForegroundUpdateCheck);
  window.addEventListener("online", () => checkForAppUpdate({ force: true }));
  window.addEventListener("pageshow", (event) => { if (event.persisted || document.visibilityState === "visible") checkForAppUpdate(); });
  document.addEventListener("visibilitychange", requestForegroundUpdateCheck);
  navigator.serviceWorker?.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    updateToast?.remove();
    updateToast = null;
    window.location.reload();
  });
  document.addEventListener("click", (event) => { const trigger = event.target.closest("[data-pwa-install]"); if (trigger) requestInstall(); });

  window.HerdHarborPWA = {
    install: requestInstall,
    refreshInstallUI,
    checkForUpdates: () => checkForAppUpdate({ force: true }),
    isInstalled: isStandalone,
    version: APP_VERSION,
    build: PWA_BUILD
  };

  function bootApplication() {
    try {
      monitoring()?.setModule?.("dashboard");
      monitoring()?.addBreadcrumb?.({ module: "dashboard", action: "load_application_modules" });
      loadPedigreeVisuals();
      loadBreedingIntelligence();
      loadShows();
      refreshManifestLink();
      refreshInstallUI();
      registerServiceWorker();
    } catch (error) {
      monitorFailure(error, "startup_failure", "dashboard", { operation: "application_startup" });
      console.error("HerdHarbor application startup failed:", error);
    }
  }

  function boot() {
    // Monitoring is optional and fail-open. If either configuration or the
    // bundled SDK cannot load, the application starts normally.
    loadMonitoring(bootApplication);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
