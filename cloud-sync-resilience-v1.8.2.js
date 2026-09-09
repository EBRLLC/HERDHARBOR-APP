(() => {
  "use strict";

  const CHECK_INTERVAL_MS = 30_000;
  const START_DELAY_MS = 5_000;
  const SUPABASE_PROJECT_REF = "okynebbksifqppwicghj";
  const SUPABASE_AUTH_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;
  const SESSION_RECOVERY_KEY = "herdharbor_cloud_session_recovery_v1";

  let syncCheckInFlight = null;

  function safeStorage(storageName) {
    try {
      const storage = window[storageName];
      if (!storage || typeof storage.getItem !== "function") return null;
      return storage;
    } catch {
      return null;
    }
  }

  function hasPersistedAuthSession() {
    const storage = safeStorage("localStorage");
    if (!storage) return false;
    try {
      const saved = JSON.parse(storage.getItem(SUPABASE_AUTH_STORAGE_KEY) || "null");
      return Boolean(saved?.access_token && saved?.refresh_token && saved?.user?.id);
    } catch {
      return false;
    }
  }

  function recoverMissedCloudSession() {
    if (!hasPersistedAuthSession()) return false;
    const storage = safeStorage("sessionStorage");
    if (!storage || storage.getItem(SESSION_RECOVERY_KEY) === "1") return false;
    try {
      storage.setItem(SESSION_RECOVERY_KEY, "1");
    } catch {
      return false;
    }
    window.location.reload();
    return true;
  }

  async function checkCloudSync() {
    if (syncCheckInFlight) return syncCheckInFlight;
    if (document.hidden || navigator.onLine === false) return false;

    const cloud = window.HerdHarborCloud;
    if (!cloud?.getSyncDetails || typeof cloud.syncNow !== "function") return false;

    const details = cloud.getSyncDetails();
    if (!details?.signedIn) {
      recoverMissedCloudSession();
      return false;
    }

    try {
      safeStorage("sessionStorage")?.removeItem?.(SESSION_RECOVERY_KEY);
    } catch {}

    if (details.conflict || details.syncing) return false;

    syncCheckInFlight = Promise.resolve()
      .then(() => cloud.syncNow())
      .catch((error) => {
        console.warn("HerdHarbor cloud sync watchdog could not complete a sync check:", error);
        return false;
      })
      .finally(() => {
        syncCheckInFlight = null;
      });

    return syncCheckInFlight;
  }

  function scheduleCheck() {
    window.setTimeout(() => { void checkCloudSync(); }, 0);
  }

  window.addEventListener("online", scheduleCheck);
  window.addEventListener("focus", scheduleCheck);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleCheck();
  });

  window.setTimeout(() => { void checkCloudSync(); }, START_DELAY_MS);
  window.setInterval(() => { void checkCloudSync(); }, CHECK_INTERVAL_MS);

  window.HerdHarborCloudSyncResilience = Object.freeze({
    checkIntervalMs: CHECK_INTERVAL_MS,
    checkCloudSync,
    hasPersistedAuthSession,
    recoverMissedCloudSession
  });
})();
