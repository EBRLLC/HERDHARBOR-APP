(() => {
  "use strict";

  const PWA_BUILD = "0.2.14";
  const ROTATION_PREFERENCE_KEY = "herdharbor_auto_rotate";
  let installPrompt = null;
  let registration = null;
  let updateToast = null;
  let reloading = false;
  let orientationMode = "pending";

  const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  const isIos = () =>
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const isMobileDevice = () =>
    Boolean(navigator.userAgentData?.mobile) ||
    /android|iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  function autoRotateEnabled() {
    try {
      return localStorage.getItem(ROTATION_PREFERENCE_KEY) === "true";
    } catch {
      return false;
    }
  }

  function ensureOrientationGuard() {
    if (document.querySelector("#hh-orientation-guard")) return;

    const guard = document.createElement("aside");
    guard.id = "hh-orientation-guard";
    guard.className = "hh-orientation-guard";
    guard.setAttribute("role", "status");
    guard.setAttribute("aria-live", "polite");
    guard.innerHTML = `
      <div class="hh-orientation-guard-card">
        <span>HerdHarbor</span>
        <strong>Portrait lock is on</strong>
        <p>Turn your phone upright to continue.</p>
      </div>
    `;
    document.body.appendChild(guard);
  }

  function orientationStatus(enabled = autoRotateEnabled()) {
    if (enabled) return "On — HerdHarbor follows this device's orientation.";
    if (orientationMode === "native") return "Off — HerdHarbor is locked upright in portrait.";
    return "Off — portrait guard is active if this browser cannot lock the screen directly.";
  }

  function refreshOrientationUI() {
    const enabled = autoRotateEnabled();
    document.documentElement.dataset.autoRotate = enabled ? "on" : "off";
    document.documentElement.dataset.orientationLock = orientationMode;
    document.documentElement.dataset.mobileDevice = isMobileDevice() ? "true" : "false";

    document.querySelectorAll("[data-orientation-toggle]").forEach((button) => {
      button.setAttribute("aria-checked", String(enabled));
      button.textContent = enabled ? "Auto-rotate: On" : "Auto-rotate: Off";
    });

    const note = document.querySelector("#orientation-setting-note");
    if (note) note.textContent = orientationStatus(enabled);
  }

  async function applyOrientationPreference() {
    const enabled = autoRotateEnabled();
    ensureOrientationGuard();

    if (enabled) {
      try {
        screen.orientation?.unlock?.();
      } catch (error) {
        console.info("HerdHarbor could not release the screen orientation lock:", error);
      }
      orientationMode = "unlocked";
      refreshOrientationUI();
      return orientationMode;
    }

    if (document.visibilityState === "hidden") {
      refreshOrientationUI();
      return orientationMode;
    }

    if (typeof screen.orientation?.lock === "function") {
      try {
        await screen.orientation.lock("portrait-primary");
        orientationMode = "native";
        refreshOrientationUI();
        return orientationMode;
      } catch (error) {
        console.info("HerdHarbor is using its portrait guard because native orientation lock is unavailable:", error);
      }
    }

    orientationMode = "fallback";
    refreshOrientationUI();
    return orientationMode;
  }

  async function setAutoRotate(enabled) {
    try {
      localStorage.setItem(ROTATION_PREFERENCE_KEY, String(Boolean(enabled)));
    } catch (error) {
      console.error("HerdHarbor could not save the device rotation preference:", error);
    }
    return applyOrientationPreference();
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

    const orientationToggle = event.target.closest("[data-orientation-toggle]");
    if (orientationToggle) {
      orientationToggle.disabled = true;
      setAutoRotate(!autoRotateEnabled()).finally(() => {
        orientationToggle.disabled = false;
      });
    }
  });

  window.HerdHarborPWA = {
    install: requestInstall,
    refreshInstallUI,
    isInstalled: isStandalone,
    applyOrientationPreference,
    autoRotateEnabled,
    refreshOrientationUI,
    setAutoRotate
  };

  window.addEventListener("pageshow", applyOrientationPreference);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") applyOrientationPreference();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      refreshInstallUI();
      applyOrientationPreference();
      registerServiceWorker();
    }, { once: true });
  } else {
    refreshInstallUI();
    applyOrientationPreference();
    registerServiceWorker();
  }
})();
