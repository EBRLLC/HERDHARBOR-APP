(() => {
  "use strict";

  const VERSION = "1.8.1";
  const MAX_ATTEMPTS = 40;
  const INTERVAL_MS = 250;
  let timer = null;
  let refreshedUserId = null;
  let refreshInFlight = false;

  function sessionUserId() {
    try {
      return String(window.HerdHarborCloud?.getSession?.()?.user?.id || "");
    } catch {
      return "";
    }
  }

  function readyForStripeRefresh() {
    const userId = sessionUserId();
    const authLocked = document.documentElement.classList.contains("hh-auth-locked");
    const provider = String(window.HerdHarborSubscriptionEngine?.getState?.()?.provider || "").toLowerCase();
    return Boolean(userId) && !authLocked && provider === "stripe";
  }

  function stop() {
    if (timer != null) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  async function refreshOnce() {
    const userId = sessionUserId();
    if (!userId || refreshedUserId === userId || refreshInFlight || !readyForStripeRefresh()) return false;
    refreshInFlight = true;
    try {
      await window.HerdHarborSubscriptionEngine?.refresh?.({ force: true });
      refreshedUserId = userId;
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = false;
    }
  }

  function schedule() {
    const userId = sessionUserId();
    if (!userId) {
      refreshedUserId = null;
      stop();
      return;
    }
    if (refreshedUserId === userId) {
      stop();
      return;
    }
    if (timer != null) return;

    let attempts = 0;
    timer = window.setInterval(async () => {
      attempts += 1;
      if (await refreshOnce()) stop();
      else if (attempts >= MAX_ATTEMPTS) stop();
    }, INTERVAL_MS);

    void refreshOnce().then((ok) => { if (ok) stop(); });
  }

  function boot() {
    document.addEventListener("herdharbor:auth-session", (event) => {
      if (event.detail?.signedIn === true) schedule();
      else {
        refreshedUserId = null;
        stop();
      }
    });
    document.addEventListener("herdharbor:subscription-engine-state", schedule);
    window.addEventListener("focus", schedule);
    schedule();
  }

  window.HerdHarborStripeLaunchBridge = Object.freeze({ version: VERSION, refresh: schedule });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
