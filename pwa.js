(() => {
  "use strict";

  const PWA_BUILD = "1.0.0-alpha-pedigree-1";
  let installPrompt = null;
  let registration = null;
  let updateToast = null;
  let reloading = false;

  const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  const isIos = () =>
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  function loadPedigreeVisuals() {
    if (!document.getElementById("hh-pedigree-visual-style")) {
      const style = document.createElement("link");
      style.id = "hh-pedigree-visual-style";
      style.rel = "stylesheet";
      style.href = "pedigree-visual.css?v=1";
      document.head.appendChild(style);
    }

    if (!document.getElementById("hh-pedigree-visual-script")) {
      const script = document.createElement("script");
      script.id = "hh-pedigree-visual-script";
      script.src = "pedigree-visual.js?v=1";
      script.async = false;
      document.head.appendChild(script);
    }
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
      button.textContent = button.id === "install-app-button" && !installed
        ? "Install app"
        : installLabel();
    });

    const topButton = document.querySelector("#install-app-button");
    if (topButton) {
      topButton.hidden = installed || (!installPrompt && !isIos());
      topButton.disabled = installed;
    }

    const note = document.querySelector("#pwa-install-note");
    if (note) {
      note.textContent = installed
        ? "This device is running the installed HerdHarbor app."
        : isIos()
          ? "On iPhone or iPad, tap Share, then Add to Home Screen."
          : "The installed app uses the same account and protected cloud records as the website.";
    }
  }

  async function requestInstall() {
    if (isStandalone()) return;

    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      refreshInstallUI();
      return;
    }

    if (isIos()) {
      window.alert("To install HerdHarbor: tap the Share button in Safari, then tap Add to Home Screen.");
      return;
    }

    window.alert("Open your browser menu and choose Install app or Add to Home screen.");
  }

  function showUpdateReady(worker) {
    if (updateToast || !worker) return;

    updateToast = document.createElement("aside");
    updateToast.className = "hh-pwa-update";
    updateToast.setAttribute("role", "status");
    updateToast.innerHTML = `
      <strong>HerdHarbor update ready</strong>
      <span>Your records will be protected before the app reloads.</span>
      <button type="button">Update now</button>
    `;
    updateToast.querySelector("button").addEventListener("click", async () => {
      const cloud = window.HerdHarborCloud;
      if (cloud?.hasUnsyncedChanges?.()) {
        const saved = await cloud.syncNow();
        if (!saved) {
          window.alert(
            "The update is paused because local changes are not safely synced yet. Your current app and records remain available."
          );
          return;
        }
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
      registration = await navigator.serviceWorker.register(
        `service-worker.js?build=${encodeURIComponent(PWA_BUILD)}`,
        { scope: "./" }
      );

      if (registration.waiting && navigator.serviceWorker.controller) {
        showUpdateReady(registration.waiting);
      }

      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            showUpdateReady(worker);
          }
        });
      });
    } catch (error) {
      console.error("HerdHarbor could not register its offline app shell:", error);
    }
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    refreshInstallUI();
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    refreshInstallUI();
  });

  navigator.serviceWorker?.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-pwa-install]");
    if (trigger) requestInstall();
  });

  window.HerdHarborPWA = {
    install: requestInstall,
    refreshInstallUI,
    isInstalled: isStandalone
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      loadPedigreeVisuals();
      refreshInstallUI();
      registerServiceWorker();
    }, { once: true });
  } else {
    loadPedigreeVisuals();
    refreshInstallUI();
    registerServiceWorker();
  }
})();
