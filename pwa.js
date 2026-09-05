(() => {
  "use strict";

  // Current release contract: const APP_VERSION = "1.7.1";
  // Current build contract: const BUILD_ID = "multispecies-genetics-foundation-1";
  const APP_VERSION = window.HerdHarborBuild?.version || "1.7.1";
  const BUILD_ID = window.HerdHarborBuild?.buildId || "multispecies-genetics-foundation-1";
  const PWA_BUILD = `${APP_VERSION}-alpha-${BUILD_ID}`;
  const UPDATE_CHECK_MIN_INTERVAL_MS = 60_000;
  let installPrompt = null;
  let registration = null;
  let updateToast = null;
  let pendingUpdateWorker = null;
  let updateCheckInFlight = null;
  let lastUpdateCheckAt = 0;
  let reloading = false;
  let updateDeferredUntil = 0;

  const navigatorRef = () => window.navigator || (typeof navigator !== "undefined" ? navigator : {});
  const isStandalone = () => window.matchMedia?.("(display-mode: standalone)")?.matches === true || navigatorRef().standalone === true;
  const isIos = () => {
    const nav = navigatorRef();
    return /iphone|ipad|ipod/i.test(nav.userAgent || "") || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  };

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
    addOptionalScript("hh-monitoring-config", "herdharbor-monitoring-config.js?v=1.7.1", (configLoaded) => {
      if (!configLoaded) { done?.(); return; }
      addOptionalScript("hh-monitoring-v151", "vendor/herdharbor-monitoring-v1.6.1.min.js?v=1.7.1", () => done?.());
    });
  }

  function loadPedigreeVisuals() {
    addStylesheet("hh-pedigree-visual-style", "pedigree-visual.css?v=2");
    addScript("hh-pedigree-visual-script", "pedigree-visual.js?v=2");
  }

  function loadBreedingIntelligence() {
    addStylesheet("hh-breeding-intelligence-style", "breeding-intelligence-v1.6.1.css?v=1.7.1");
    addStylesheet("hh-rabbit-genetics-v2-style", "breeding-genetics-advanced-v1.6.1.css?v=1.7.1");
    addStylesheet("hh-phase3-style", "standards-genetics-v1.6.1.css?v=1.7.1");
    addStylesheet("hh-multispecies-genetics-v171-style", "multispecies-genetics-v1.7.1.css?v=1.7.1");
    addScript("hh-rabbit-records-v151", "rabbit-records-v1.6.1.js?v=1.7.1", () => {
      addScript("hh-breeding-intelligence-core-script", "breeding-intelligence-core-v1.6.1.js?v=1.7.1", () => {
        addScript("hh-rabbit-genetics-v2-engine", "rabbit-genetics-engine-advanced-v1.6.1.js?v=1.7.1", () => {
          addScript("hh-rabbit-genetics-v151-engine", "rabbit-genetics-engine-compat-v1.6.1.js?v=1.7.1", () => {
            addScript("hh-rabbit-genetics-v151-runtime", "rabbit-genetics-runtime-v1.6.1.js?v=1.7.1", () => {
              addScript("hh-rabbit-genetics-v161", "rabbit-genetics-v1.6.1.js?v=1.7.1", () => {
                addScript("hh-standards-phase3", "standards-registry-v1.6.1.js?v=1.7.1", () => {
                  addScript("hh-multispecies-genetics-v1.7.1", "multispecies-genetics-v1.7.1.js?v=1.7.1", () => {
                    addScript("hh-standards-genetics-ui-v1.6.1", "standards-genetics-ui-v1.6.1.js?v=1.7.1", () => {
                      addScript("hh-multispecies-genetics-ui-v1.7.1", "multispecies-genetics-ui-v1.7.1.js?v=1.7.1");
                    });
                  });
                });
                addStylesheet("hh-pedigree-genetics-v151-style", "pedigree-genetics-v1.6.1.css?v=1.7.1");
                addScript("hh-pedigree-genetics-v151-script", "pedigree-genetics-v1.6.1.js?v=1.7.1", () => {
                  window.HerdHarborPedigreeGenetics?.start?.(window);
                  window.dispatchEvent(new CustomEvent("herdharbor:genetics-ready", { detail: { releaseVersion: APP_VERSION, schemaVersion: 3 } }));
                  addScript("hh-breeding-intelligence-script", "breeding-intelligence-v1.6.1.js?v=1.7.1", () => {
                    addScript("hh-breeding-pair-hotfix-script", "breeding-pair-v1.6.1.js?v=1.7.1", () => {
                      addScript("hh-rabbit-genetics-v151-ui", "rabbit-genetics-ui-compat-v1.6.1.js?v=1.7.1", () => {
                        addScript("hh-rabbit-genetics-v2-ui", "rabbit-genetics-ui-advanced-v1.6.1.js?v=1.7.1", () => {
                          addScript("hh-breeding-intelligence-tools-script", "breeding-intelligence-tools-v1.6.1.js?v=1.7.1", () => {
                            addScript("hh-v151-release-script", "herdharbor-release-v1.6.1.js?v=1.7.1");
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
    });
  }

  function loadShows() {
    addStylesheet("hh-shows-v151-style", "shows-v1.6.1.css?v=1.7.1");
    addScript("hh-shows-v151-script", "shows-v1.6.1.js?v=1.7.1", () => {
      addScript("hh-shows-v151-hardening", "shows-v1.6.1-hardening.js?v=1.7.1", () => {
        addScript("hh-shows-v151-performance", "shows-v1.6.1-performance.js?v=1.7.1");
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
    const updateToastTarget = document.body || document.documentElement;
    if (updateToastTarget) updateToastTarget.appendChild(updateToast);
  }

  function watchInstallingWorker(worker) {
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigatorRef().serviceWorker?.controller) {
        showUpdateReady(registration?.waiting || worker);
      }
    });
  }

  async function checkForAppUpdate({ force = false } = {}) {
    if (!registration || navigatorRef().onLine === false) return false;
    if (registration.waiting && navigatorRef().serviceWorker?.controller) {
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
        if (registration.waiting && navigatorRef().serviceWorker?.controller) {
          showUpdateReady(registration.waiting);
          return true;
        }
        return false;
      } catch (error) {
        if (navigatorRef().onLine !== false) {
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
    if (!("serviceWorker" in navigatorRef())) return;
    try {
      registration = await navigatorRef().serviceWorker.register("service-worker.js", {
        scope: "./",
        updateViaCache: "none"
      });
      if (registration.waiting && navigatorRef().serviceWorker?.controller) showUpdateReady(registration.waiting);
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
  navigatorRef().serviceWorker?.addEventListener("controllerchange", () => {
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
