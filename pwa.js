(() => {
  "use strict";

  const PWA_BUILD = "1.4.2-alpha-rabbit-pair-hotfix-1";
  let installPrompt = null;
  let registration = null;
  let updateToast = null;
  let reloading = false;

  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  function addStylesheet(id, href) {
    if (document.getElementById(id)) return;
    const style = document.createElement("link");
    style.id = id;
    style.rel = "stylesheet";
    style.href = href;
    document.head.appendChild(style);
  }

  function addScript(id, src, onload) {
    if (document.getElementById(id)) { if (onload) onload(); return; }
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = false;
    if (onload) script.addEventListener("load", onload, { once: true });
    document.head.appendChild(script);
  }

  function loadPedigreeVisuals() {
    addStylesheet("hh-pedigree-visual-style", "pedigree-visual.css?v=2");
    addScript("hh-pedigree-visual-script", "pedigree-visual.js?v=2");
  }

  function loadBreedingIntelligence() {
    addStylesheet("hh-breeding-intelligence-style", "breeding-intelligence.css?v=1.4.0");
    addStylesheet("hh-rabbit-genetics-v2-style", "breeding-genetics-v2.css?v=2.0.0");
    addScript("hh-breeding-intelligence-core-script", "breeding-intelligence-core.js?v=1.4.0", () => {
      addScript("hh-rabbit-genetics-v2-engine", "rabbit-genetics-engine-v2.js?v=2.0.0", () => {
        addScript("hh-breeding-intelligence-script", "breeding-intelligence.js?v=1.4.0", () => {
          addScript("hh-breeding-pair-hotfix-script", "breeding-pair-hotfix-v1.4.2.js?v=1", () => {
            addScript("hh-rabbit-genetics-v2-ui", "rabbit-genetics-ui-v2.js?v=2.0.0", () => {
              addScript("hh-breeding-intelligence-tools-script", "breeding-intelligence-tools.js?v=1.4.0");
            });
          });
        });
      });
    });
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
    if (note) note.textContent = installed ? "This device is running the installed HerdHarbor app." : isIos() ? "On iPhone or iPad, tap Share, then Add to Home Screen." : "The installed app uses the same account and protected cloud records as the website.";
  }

  async function requestInstall() {
    if (isStandalone()) return;
    if (installPrompt) { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; refreshInstallUI(); return; }
    if (isIos()) { window.alert("To install HerdHarbor: tap the Share button in Safari, then tap Add to Home Screen."); return; }
    window.alert("Open your browser menu and choose Install app or Add to Home screen.");
  }

  function showUpdateReady(worker) {
    if (updateToast || !worker) return;
    updateToast = document.createElement("aside");
    updateToast.className = "hh-pwa-update";
    updateToast.setAttribute("role", "status");
    updateToast.innerHTML = `<strong>HerdHarbor update ready</strong><span>Your records will be protected before the app reloads.</span><button type="button">Update now</button>`;
    updateToast.querySelector("button").addEventListener("click", async () => {
      const cloud = window.HerdHarborCloud;
      if (cloud?.hasUnsyncedChanges?.()) {
        const saved = await cloud.syncNow();
        if (!saved) { window.alert("The update is paused because local changes are not safely synced yet. Your current app and records remain available."); return; }
      }
      updateToast.querySelector("button").disabled = true;
      updateToast.querySelector("button").textContent = "Updating…";
      worker.postMessage({ type: "SKIP_WAITING" });
    });
    document.body.appendChild(updateToast);
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    try {
      registration = await navigator.serviceWorker.register(`service-worker.js?build=${encodeURIComponent(PWA_BUILD)}`, { scope: "./" });
      if (registration.waiting && navigator.serviceWorker.controller) showUpdateReady(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => { if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdateReady(worker); });
      });
    } catch (error) { console.error("HerdHarbor could not register its offline app shell:", error); }
  }

  window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); installPrompt = event; refreshInstallUI(); });
  window.addEventListener("appinstalled", () => { installPrompt = null; refreshInstallUI(); });
  navigator.serviceWorker?.addEventListener("controllerchange", () => { if (reloading) return; reloading = true; window.location.reload(); });
  document.addEventListener("click", (event) => { const trigger = event.target.closest("[data-pwa-install]"); if (trigger) requestInstall(); });

  window.HerdHarborPWA = { install: requestInstall, refreshInstallUI, isInstalled: isStandalone, build: PWA_BUILD };

  function boot() {
    loadPedigreeVisuals();
    loadBreedingIntelligence();
    refreshInstallUI();
    registerServiceWorker();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();