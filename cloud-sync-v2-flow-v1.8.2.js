(() => {
  "use strict";

  const RETRY_DELAYS_MS = [1500, 4000, 10000, 30000];
  const MAX_VISIBLE_RETRY_MS = 30000;
  let retryTimer = null;
  let retryIndex = 0;
  let lastAttemptAt = 0;

  function cloud() {
    return window.HerdHarborCloud || null;
  }

  function ensureLocalCache() {
    if (window.HerdHarborLocalCacheV2) {
      window.HerdHarborLocalCacheV2.install?.();
      return true;
    }
    if (document.getElementById("hh-local-cache-v2-v182")) return false;
    const script = document.createElement("script");
    script.id = "hh-local-cache-v2-v182";
    script.src = "local-cache-v2-v1.8.2.js?v=1";
    script.async = false;
    (document.head || document.documentElement || document.body)?.appendChild(script);
    return false;
  }

  function details() {
    try {
      return cloud()?.getSyncDetails?.() || null;
    } catch {
      return null;
    }
  }

  function isRecoverablePending(state) {
    if (!state) return false;
    return Boolean(state.signedIn && state.unsynced && !state.conflict);
  }

  function pendingMessage(state) {
    if (navigator.onLine === false || state?.online === false) {
      return "Saved on this device. Cloud sync will resume when you're back online. Safe to close HerdHarbor.";
    }
    if (state?.syncing) {
      return "Saved on this device. Cloud backup is finishing in the background; you can keep working or close HerdHarbor.";
    }
    return "Saved on this device. Cloud backup is pending and will retry automatically; you can keep working or close HerdHarbor.";
  }

  function applyNonBlockingPresentation(state) {
    if (!isRecoverablePending(state)) return false;

    const message = pendingMessage(state);
    const button = document.querySelector(".hh-account-button");
    if (button) {
      button.dataset.state = "working";
      button.title = `HerdHarbor account: ${message}`;
    }

    const status = document.querySelector("#hh-account-sync-status");
    if (status) {
      status.textContent = message;
      status.dataset.type = "working";
    }
    return true;
  }

  function clearRetry() {
    if (retryTimer) window.clearTimeout(retryTimer);
    retryTimer = null;
  }

  function scheduleRetry(state = details()) {
    clearRetry();
    if (!isRecoverablePending(state)) {
      retryIndex = 0;
      return;
    }
    if (navigator.onLine === false || document.visibilityState === "hidden") return;

    const delay = RETRY_DELAYS_MS[Math.min(retryIndex, RETRY_DELAYS_MS.length - 1)];
    retryTimer = window.setTimeout(async () => {
      retryTimer = null;
      const current = details();
      if (!isRecoverablePending(current) || navigator.onLine === false) {
        retryIndex = 0;
        return;
      }

      const now = Date.now();
      if (now - lastAttemptAt < 1000) {
        scheduleRetry(current);
        return;
      }

      lastAttemptAt = now;
      retryIndex = Math.min(retryIndex + 1, RETRY_DELAYS_MS.length - 1);
      try {
        await cloud()?.syncNow?.();
      } catch {
        // The canonical cloud layer retains the dirty state. A later retry or
        // the next foreground/online event will continue without blocking UI.
      }
      const after = details();
      applyNonBlockingPresentation(after);
      scheduleRetry(after);
    }, Math.min(delay, MAX_VISIBLE_RETRY_MS));
  }

  function refresh() {
    const state = details();
    if (!state) return;
    if (!applyNonBlockingPresentation(state) && !state.unsynced) retryIndex = 0;
    scheduleRetry(state);
  }

  function resumeImmediately() {
    const state = details();
    if (!isRecoverablePending(state) || state.syncing || navigator.onLine === false) {
      refresh();
      return;
    }
    clearRetry();
    lastAttemptAt = Date.now();
    Promise.resolve(cloud()?.syncNow?.())
      .catch(() => false)
      .finally(refresh);
  }

  document.addEventListener("herdharbor:sync-status", (event) => {
    const state = event?.detail || details();
    if (!state) return;
    applyNonBlockingPresentation(state);
    scheduleRetry(state);
  });

  window.addEventListener("online", resumeImmediately);
  window.addEventListener("focus", resumeImmediately);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") resumeImmediately();
    else {
      clearRetry();
      applyNonBlockingPresentation(details());
    }
  });

  // Do not add a beforeunload blocker. The local write is the durable first
  // save, and the dirty marker tells the cloud layer to resume on next launch.
  function boot(attempt = 0) {
    ensureLocalCache();
    if (cloud()) {
      refresh();
      return;
    }
    if (attempt >= 120) return;
    window.setTimeout(() => boot(attempt + 1), 100);
  }

  window.HerdHarborCloudSyncFlowV2 = Object.freeze({
    version: "2.0",
    release: "1.8.2",
    refresh,
    resumeImmediately,
    isRecoverablePending,
    ensureLocalCache
  });

  boot();
})();
