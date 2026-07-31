(() => {
  "use strict";

  // HerdHarbor cloud integration v1.4 — automatic three-way merge and local recovery.

  const SUPABASE_URL = "https://okynebbksifqppwicghj.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_jxsX6uS9nnh2FOFtlSF9TA_8v6C7C09";
  const STORAGE_KEY = "herdharbor_pre_alpha_v1";
  const TABLE_NAME = "herdharbor_user_data";
  const SYNC_DELAY_MS = 700;
  const ACTIVE_OWNER_KEY = "herdharbor_active_user_v1";
  const RECOVERY_DB_NAME = "herdharbor_recovery_v1";
  const RECOVERY_STORE_NAME = "snapshots";
  const MAX_RECOVERY_SNAPSHOTS = 6;

  if (!window.supabase?.createClient) {
    console.error("HerdHarbor Cloud: Supabase JavaScript library did not load.");
    const failureStyle = document.createElement("style");
    failureStyle.textContent = `
      html.hh-auth-locked body > *:not(#hh-cloud-startup-error) { visibility: hidden !important; }
      #hh-cloud-startup-error {
        position: fixed;
        inset: 0;
        z-index: 100000;
        display: grid;
        place-items: center;
        padding: 24px;
        color: #18212A;
        background: #F7F2E8;
        font: 700 1rem/1.5 system-ui, sans-serif;
        text-align: center;
      }
      #hh-cloud-startup-error strong { display: block; margin-bottom: 8px; color: #0D2540; font-size: 1.5rem; }
    `;
    document.head.appendChild(failureStyle);
    document.documentElement.classList.add("hh-auth-locked");
    const failure = document.createElement("div");
    failure.id = "hh-cloud-startup-error";
    failure.innerHTML = "<div><strong>HerdHarbor could not start securely.</strong>Your local records were not removed. Check your connection and reload the app.</div>";
    document.body.appendChild(failure);
    return;
  }

  const originalGetItem = Storage.prototype.getItem;
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;

  let session = null;
  let syncTimer = null;
  let syncInFlight = null;
  let pendingSync = null;
  let writeSequence = 0;
  let lastCloudCheckAt = 0;
  let internalStorageWrite = false;
  let accountButton = null;
  let accountDialog = null;
  let syncConflict = null;
  let syncState = "Checking account…";
  let syncStateType = "info";
  let reloadAfterSync = false;
  let recoveryMode = (() => {
    try {
      const url = new URL(window.location.href);
      return (
        url.searchParams.get("password-recovery") === "1" ||
        /(?:^|[&#])type=recovery(?:&|$)/.test(url.hash)
      );
    } catch {
      return false;
    }
  })();

  const client = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  const cacheKey = (userId) => `herdharbor_user_cache_${userId}`;
  const dirtyKey = (userId) => `herdharbor_user_dirty_${userId}`;
  const baseKey = (userId) => `herdharbor_user_cloud_base_${userId}`;
  const versionKey = (userId) => `herdharbor_user_cloud_version_${userId}`;
  const DEVICE_LOCAL_SETTINGS = new Set(["theme", "sidebarCollapsed"]);

  function getSyncDetails() {
    const userId = session?.user?.id || "";
    const unsynced = Boolean(userId) &&
      (
        originalGetItem.call(localStorage, dirtyKey(userId)) === "1" ||
        Boolean(pendingSync)
      );

    return {
      message: syncState,
      type: syncStateType,
      signedIn: Boolean(userId),
      email: session?.user?.email || "",
      online: navigator.onLine !== false,
      unsynced,
      syncing: Boolean(syncInFlight) || syncStateType === "working",
      conflict: Boolean(syncConflict),
      lastSyncedAt: userId
        ? originalGetItem.call(localStorage, versionKey(userId)) || ""
        : ""
    };
  }

  function dispatchSyncStatus() {
    try {
      document.dispatchEvent(new CustomEvent("herdharbor:sync-status", {
        detail: getSyncDetails()
      }));
    } catch (error) {
      console.warn("HerdHarbor could not publish the sync status:", error);
    }
  }

  function safeParse(value) {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function canonicalize(value, path = [], includeDeviceSettings = false) {
    if (Array.isArray(value)) {
      return value.map((item, index) =>
        canonicalize(item, [...path, String(index)], includeDeviceSettings)
      );
    }
    if (value && typeof value === "object") {
      return Object.keys(value)
        .sort()
        .reduce((result, key) => {
          if (
            !includeDeviceSettings &&
            path.length === 1 &&
            path[0] === "settings" &&
            DEVICE_LOCAL_SETTINGS.has(key)
          ) {
            return result;
          }
          result[key] = canonicalize(
            value[key],
            [...path, key],
            includeDeviceSettings
          );
          return result;
        }, {});
    }
    return value;
  }

  function stateFingerprint(rawValue, includeDeviceSettings = false) {
    const parsed = safeParse(rawValue);
    return parsed
      ? JSON.stringify(canonicalize(parsed, [], includeDeviceSettings))
      : "";
  }

  function sameState(left, right) {
    const leftFingerprint = stateFingerprint(left);
    return Boolean(leftFingerprint) && leftFingerprint === stateFingerprint(right);
  }

  function exactSameState(left, right) {
    const leftFingerprint = stateFingerprint(left, true);
    return Boolean(leftFingerprint) &&
      leftFingerprint === stateFingerprint(right, true);
  }

  function valueFingerprint(value) {
    if (value === undefined) return "undefined:";
    return `${typeof value}:${JSON.stringify(canonicalize(value, [], true))}`;
  }

  function sameValue(left, right) {
    return valueFingerprint(left) === valueFingerprint(right);
  }

  function isPlainObject(value) {
    return Boolean(value) &&
      typeof value === "object" &&
      !Array.isArray(value);
  }

  function isIdRecordArray(values) {
    const definedArrays = values.filter(Array.isArray);
    const items = definedArrays.flat();
    return Boolean(items.length) &&
      items.every((item) =>
        isPlainObject(item) &&
        typeof item.id === "string" &&
        Boolean(item.id)
      );
  }

  function mergePrimitiveArray(base, local, remote, path) {
    const pathKey = path.join(".");
    const isAdditiveSetting =
      pathKey === "settings.species" ||
      pathKey.startsWith("settings.breedsBySpecies.");

    if (!isAdditiveSetting) {
      return {
        value: local,
        conflicts: [pathKey || "farm records"]
      };
    }

    const merged = [];
    [...(local || []), ...(remote || []), ...(base || [])].forEach((item) => {
      if (!merged.some((existing) => sameValue(existing, item))) {
        merged.push(item);
      }
    });
    return { value: merged, conflicts: [] };
  }

  function mergeIdRecordArray(base = [], local = [], remote = [], path = []) {
    const baseMap = new Map(base.map((item) => [item.id, item]));
    const localMap = new Map(local.map((item) => [item.id, item]));
    const remoteMap = new Map(remote.map((item) => [item.id, item]));
    const orderedIds = [
      ...local.map((item) => item.id),
      ...remote.map((item) => item.id),
      ...base.map((item) => item.id)
    ].filter((id, index, values) => values.indexOf(id) === index);
    const conflicts = [];
    const value = [];

    orderedIds.forEach((id) => {
      const merged = mergeValue(
        baseMap.get(id),
        localMap.get(id),
        remoteMap.get(id),
        [...path, id]
      );
      conflicts.push(...merged.conflicts);
      if (merged.value !== undefined) value.push(merged.value);
    });

    if (path.join(".") === "activity") {
      value.sort((left, right) =>
        String(right.date || "").localeCompare(String(left.date || ""))
      );
      value.splice(30);
    }

    return { value, conflicts };
  }

  function mergeValue(base, local, remote, path = []) {
    const pathKey = path.join(".");
    const fieldName = path[path.length - 1] || "";
    if (
      path.length === 2 &&
      path[0] === "settings" &&
      DEVICE_LOCAL_SETTINGS.has(path[1])
    ) {
      return {
        value: local !== undefined ? local : remote,
        conflicts: []
      };
    }

    if (sameValue(local, remote)) return { value: local, conflicts: [] };
    if (sameValue(local, base)) return { value: remote, conflicts: [] };
    if (sameValue(remote, base)) return { value: local, conflicts: [] };

    if (
      ["updatedAt", "savedAt", "logoUpdatedAt"].includes(fieldName) &&
      typeof local === "string" &&
      typeof remote === "string" &&
      Number.isFinite(Date.parse(local)) &&
      Number.isFinite(Date.parse(remote))
    ) {
      return {
        value: Date.parse(local) >= Date.parse(remote) ? local : remote,
        conflicts: []
      };
    }

    if (local === undefined || remote === undefined) {
      return {
        value: local,
        conflicts: [pathKey || "farm records"]
      };
    }

    if (Array.isArray(local) && Array.isArray(remote)) {
      if (isIdRecordArray([base, local, remote])) {
        return mergeIdRecordArray(
          Array.isArray(base) ? base : [],
          local,
          remote,
          path
        );
      }
      return mergePrimitiveArray(
        Array.isArray(base) ? base : [],
        local,
        remote,
        path
      );
    }

    if (isPlainObject(local) && isPlainObject(remote)) {
      const baseObject = isPlainObject(base) ? base : {};
      const keys = [...new Set([
        ...Object.keys(baseObject),
        ...Object.keys(local),
        ...Object.keys(remote)
      ])].sort();
      const value = {};
      const conflicts = [];

      keys.forEach((key) => {
        const merged = mergeValue(
          baseObject[key],
          local[key],
          remote[key],
          [...path, key]
        );
        conflicts.push(...merged.conflicts);
        if (merged.value !== undefined) value[key] = merged.value;
      });

      return { value, conflicts };
    }

    return {
      value: local,
      conflicts: [pathKey || "farm records"]
    };
  }

  function mergeRawStates(baseRaw, localRaw, remoteRaw) {
    const base = safeParse(baseRaw);
    const local = safeParse(localRaw);
    const remote = safeParse(remoteRaw);
    if (!base || !local || !remote) {
      return {
        ok: false,
        conflicts: ["farm records"],
        rawValue: localRaw
      };
    }

    const merged = mergeValue(base, local, remote);
    return {
      ok: merged.conflicts.length === 0,
      conflicts: [...new Set(merged.conflicts)],
      value: merged.value,
      rawValue: JSON.stringify(merged.value)
    };
  }

  function applyDevicePreferences(cloudRaw, deviceRaw) {
    const cloudState = safeParse(cloudRaw);
    const deviceState = safeParse(deviceRaw);
    if (!cloudState || !deviceState?.settings) return cloudRaw;

    cloudState.settings = isPlainObject(cloudState.settings)
      ? cloudState.settings
      : {};
    DEVICE_LOCAL_SETTINGS.forEach((key) => {
      if (deviceState.settings[key] !== undefined) {
        cloudState.settings[key] = deviceState.settings[key];
      }
    });
    return JSON.stringify(cloudState);
  }

  function safeStorageSet(key, value) {
    try {
      originalSetItem.call(localStorage, key, value);
      return true;
    } catch (error) {
      console.warn(`HerdHarbor could not retain local safety key ${key}:`, error);
      return false;
    }
  }

  function safeStorageRemove(key) {
    try {
      originalRemoveItem.call(localStorage, key);
    } catch (error) {
      console.warn(`HerdHarbor could not remove local safety key ${key}:`, error);
    }
  }

  function setInternalStorage(key, value) {
    internalStorageWrite = true;
    try {
      originalSetItem.call(localStorage, key, value);
    } finally {
      internalStorageWrite = false;
    }
  }

  function removeInternalStorage(key) {
    internalStorageWrite = true;
    try {
      originalRemoveItem.call(localStorage, key);
    } finally {
      internalStorageWrite = false;
    }
  }

  function openRecoveryDatabase() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB is unavailable."));
        return;
      }

      const request = indexedDB.open(RECOVERY_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(RECOVERY_STORE_NAME)) {
          const store = database.createObjectStore(RECOVERY_STORE_NAME, {
            keyPath: "id",
            autoIncrement: true
          });
          store.createIndex("userId", "userId");
          store.createIndex("createdAt", "createdAt");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Recovery storage could not open."));
    });
  }

  async function recordRecoverySnapshot(userId, rawValue, reason) {
    if (!userId || !rawValue || !safeParse(rawValue)) return false;

    try {
      const database = await openRecoveryDatabase();
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(RECOVERY_STORE_NAME, "readwrite");
        const store = transaction.objectStore(RECOVERY_STORE_NAME);
        const index = store.index("userId");
        const request = index.getAll(userId);

        request.onsuccess = () => {
          const snapshots = request.result
            .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));

          store.add({
            userId,
            createdAt: new Date().toISOString(),
            reason,
            rawValue
          });

          snapshots.slice(MAX_RECOVERY_SNAPSHOTS - 1).forEach((snapshot) => {
            store.delete(snapshot.id);
          });
        };
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      return true;
    } catch (error) {
      console.warn("HerdHarbor local recovery snapshot was not stored:", error);
      return false;
    }
  }

  function preserveActiveForUser(userId, reason) {
    if (!userId) return;
    const activeRaw = originalGetItem.call(localStorage, STORAGE_KEY);
    if (!activeRaw || !safeParse(activeRaw)) return;
    safeStorageSet(cacheKey(userId), activeRaw);
    safeStorageSet(ACTIVE_OWNER_KEY, userId);
    recordRecoverySnapshot(userId, activeRaw, reason);
  }

  function setActiveUserData(userId, rawValue) {
    setInternalStorage(STORAGE_KEY, rawValue);
    setInternalStorage(ACTIVE_OWNER_KEY, userId);
  }

  function clearActiveUserData() {
    removeInternalStorage(STORAGE_KEY);
    removeInternalStorage(ACTIVE_OWNER_KEY);
  }

  function setSyncState(message, type = "info") {
    syncState = message;
    syncStateType = type;
    if (accountButton) {
      accountButton.dataset.state = type;
      accountButton.title = `HerdHarbor account: ${message}`;
    }
    const status = document.querySelector("#hh-account-sync-status");
    if (status) {
      status.textContent = message;
      status.dataset.type = type;
    }
    updateConflictControls();
    dispatchSyncStatus();
  }

  function installStorageBridge() {
    if (window.__HERDHARBOR_STORAGE_BRIDGE__) return;
    window.__HERDHARBOR_STORAGE_BRIDGE__ = true;

    Storage.prototype.setItem = function patchedSetItem(key, value) {
      const previousValue =
        this === localStorage && key === STORAGE_KEY
          ? originalGetItem.call(localStorage, STORAGE_KEY)
          : null;
      const result = originalSetItem.call(this, key, value);

      if (
        this === localStorage &&
        key === STORAGE_KEY &&
        !internalStorageWrite &&
        session?.user?.id
      ) {
        const userId = session.user.id;
        writeSequence += 1;
        syncConflict = null;
        safeStorageSet(ACTIVE_OWNER_KEY, userId);
        safeStorageSet(cacheKey(userId), value);
        safeStorageSet(dirtyKey(userId), "1");
        if (previousValue && !sameState(previousValue, value)) {
          recordRecoverySnapshot(userId, previousValue, "Before local change");
        }
        scheduleCloudSync(value, writeSequence);
      }

      return result;
    };

    Storage.prototype.removeItem = function patchedRemoveItem(key) {
      const previousValue =
        this === localStorage && key === STORAGE_KEY
          ? originalGetItem.call(localStorage, STORAGE_KEY)
          : null;
      const result = originalRemoveItem.call(this, key);

      if (
        this === localStorage &&
        key === STORAGE_KEY &&
        !internalStorageWrite &&
        session?.user?.id
      ) {
        const userId = session.user.id;
        writeSequence += 1;
        syncConflict = null;
        safeStorageSet(ACTIVE_OWNER_KEY, userId);
        safeStorageSet(cacheKey(userId), "{}");
        safeStorageSet(dirtyKey(userId), "1");
        if (previousValue) {
          recordRecoverySnapshot(userId, previousValue, "Before clearing local records");
        }
        scheduleCloudSync("{}", writeSequence);
      }

      return result;
    };
  }

  async function fetchCloudRecord(userId) {
    const { data, error } = await client
      .from(TABLE_NAME)
      .select("app_state, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    return { data, error };
  }

  async function markConflict(userId, localRaw, remoteRecord, message) {
    const remoteRaw = remoteRecord?.app_state
      ? JSON.stringify(remoteRecord.app_state)
      : null;

    syncConflict = {
      userId,
      localRaw,
      remoteRaw,
      remoteUpdatedAt: remoteRecord?.updated_at || null
    };

    await Promise.all([
      recordRecoverySnapshot(userId, localRaw, "Local copy saved during sync conflict"),
      recordRecoverySnapshot(userId, remoteRaw, "Cloud copy saved during sync conflict")
    ]);

    setSyncState(
      message || "Sync paused: this device and the cloud both changed. Choose which copy to keep.",
      "error"
    );
    return false;
  }

  async function writeCloudRecord(userId, appState, remoteRecord) {
    const nextVersion = new Date().toISOString();

    if (!remoteRecord) {
      const { data, error } = await client
        .from(TABLE_NAME)
        .insert({
          user_id: userId,
          app_state: appState,
          updated_at: nextVersion
        })
        .select("app_state, updated_at")
        .single();

      return { data, error, raced: error?.code === "23505" };
    }

    let update = client
      .from(TABLE_NAME)
      .update({
        app_state: appState,
        updated_at: nextVersion
      })
      .eq("user_id", userId);

    update = remoteRecord.updated_at
      ? update.eq("updated_at", remoteRecord.updated_at)
      : update.is("updated_at", null);

    const { data, error } = await update
      .select("app_state, updated_at")
      .maybeSingle();

    return { data, error, raced: !error && !data };
  }

  async function syncValueToCloud(rawValue, sequence = writeSequence, options = {}) {
    if (!session?.user?.id) return false;

    let appState = safeParse(rawValue);
    if (!appState) {
      setSyncState("Local data could not be read.", "error");
      return false;
    }

    const userId = session.user.id;
    let localRawBeforeMerge = null;
    let autoMerged = false;
    setSyncState("Saving to cloud…", "working");

    const { data: remoteRecord, error: loadError } = await fetchCloudRecord(userId);

    if (loadError) {
      console.error("HerdHarbor cloud preflight failed:", loadError);
      setSyncState("Cloud unavailable; changes are safe on this device and will retry.", "error");
      return false;
    }

    const remoteRaw = remoteRecord?.app_state
      ? JSON.stringify(remoteRecord.app_state)
      : null;
    const confirmedBase = originalGetItem.call(localStorage, baseKey(userId));

    if (remoteRaw && sameState(remoteRaw, rawValue)) {
      safeStorageSet(baseKey(userId), remoteRaw);
      if (remoteRecord.updated_at) {
        safeStorageSet(versionKey(userId), remoteRecord.updated_at);
      }
      if (sequence === writeSequence && !pendingSync) {
        safeStorageSet(cacheKey(userId), rawValue);
        safeStorageRemove(dirtyKey(userId));
      } else {
        safeStorageSet(dirtyKey(userId), "1");
      }
      syncConflict = null;
      setSyncState("Saved to cloud", "success");
      return true;
    }

    const remoteChangedSinceBase =
      remoteRaw &&
      (!confirmedBase || !sameState(remoteRaw, confirmedBase));

    if (remoteChangedSinceBase && !options.force) {
      const merged = confirmedBase
        ? mergeRawStates(confirmedBase, rawValue, remoteRaw)
        : { ok: false, conflicts: ["missing sync history"] };

      if (!merged.ok) {
        const conflictLabel = merged.conflicts?.[0]
          ? ` The overlapping change is ${merged.conflicts[0]}.`
          : "";
        return markConflict(
          userId,
          rawValue,
          remoteRecord,
          `Sync paused because the same record changed on two devices.${conflictLabel}`
        );
      }

      localRawBeforeMerge = rawValue;
      rawValue = applyDevicePreferences(merged.rawValue, rawValue);
      appState = safeParse(rawValue);
      autoMerged = true;
      reloadAfterSync = true;
      await Promise.all([
        recordRecoverySnapshot(
          userId,
          localRawBeforeMerge,
          "Local copy before automatic cloud merge"
        ),
        recordRecoverySnapshot(
          userId,
          remoteRaw,
          "Cloud copy before automatic device merge"
        )
      ]);
      if (sequence === writeSequence) {
        setActiveUserData(userId, rawValue);
        safeStorageSet(cacheKey(userId), rawValue);
      }
      safeStorageSet(dirtyKey(userId), "1");
      setSyncState("Combining protected changes from both devices…", "working");
    }

    if (options.force && remoteRaw) {
      await recordRecoverySnapshot(userId, remoteRaw, "Cloud copy before manual conflict resolution");
    }

    const { data: savedRecord, error, raced } = await writeCloudRecord(
      userId,
      appState,
      remoteRecord || null
    );

    if (error) {
      console.error("HerdHarbor cloud save failed:", error);
      setSyncState("Cloud save failed; changes are safe on this device and will retry.", "error");
      return false;
    }

    if (raced) {
      const latest = await fetchCloudRecord(userId);
      if (latest.error) {
        setSyncState("Cloud changed during save; local copy retained.", "error");
        return false;
      }
      return markConflict(
        userId,
        rawValue,
        latest.data,
        "Sync paused because another device saved at the same time."
      );
    }

    const savedRaw = savedRecord?.app_state
      ? JSON.stringify(savedRecord.app_state)
      : rawValue;
    safeStorageSet(baseKey(userId), savedRaw);
    if (savedRecord?.updated_at) {
      safeStorageSet(versionKey(userId), savedRecord.updated_at);
    }

    if (autoMerged && sequence !== writeSequence) {
      const currentRaw = originalGetItem.call(localStorage, STORAGE_KEY);
      const rebased = mergeRawStates(
        localRawBeforeMerge,
        currentRaw,
        savedRaw
      );

      if (!rebased.ok) {
        return markConflict(
          userId,
          currentRaw,
          {
            app_state: safeParse(savedRaw),
            updated_at: savedRecord?.updated_at || null
          },
          "Sync paused because a record was edited again while device changes were being combined."
        );
      }

      const rebasedRaw = applyDevicePreferences(rebased.rawValue, currentRaw);
      setActiveUserData(userId, rebasedRaw);
      safeStorageSet(cacheKey(userId), rebasedRaw);
      safeStorageSet(dirtyKey(userId), "1");
      pendingSync = {
        rawValue: rebasedRaw,
        sequence: writeSequence
      };
    } else if (sequence === writeSequence && !pendingSync) {
      safeStorageSet(cacheKey(userId), rawValue);
      safeStorageRemove(dirtyKey(userId));
    } else {
      safeStorageSet(dirtyKey(userId), "1");
    }

    syncConflict = null;
    setSyncState(
      autoMerged ? "Device and cloud changes combined and saved" : "Saved to cloud",
      "success"
    );
    return true;
  }

  async function drainSyncQueue() {
    if (syncInFlight) return syncInFlight;

    syncInFlight = (async () => {
      let lastResult = true;
      while (pendingSync) {
        const next = pendingSync;
        pendingSync = null;
        lastResult = await syncValueToCloud(next.rawValue, next.sequence);
        if (!lastResult && syncConflict) break;
      }
      return lastResult;
    })();

    try {
      return await syncInFlight;
    } finally {
      syncInFlight = null;
      if (pendingSync && !syncConflict) {
        queueMicrotask(() => drainSyncQueue());
      } else if (reloadAfterSync && !syncConflict) {
        reloadAfterSync = false;
        setTimeout(() => window.location.reload(), 0);
      }
    }
  }

  function scheduleCloudSync(rawValue, sequence = writeSequence) {
    clearTimeout(syncTimer);
    pendingSync = { rawValue, sequence };
    syncTimer = setTimeout(() => {
      drainSyncQueue();
    }, SYNC_DELAY_MS);
  }

  async function syncNow() {
    const raw = originalGetItem.call(localStorage, STORAGE_KEY);
    if (!raw) {
      setSyncState("No HerdHarbor data is available to sync.", "error");
      return false;
    }
    clearTimeout(syncTimer);
    pendingSync = { rawValue: raw, sequence: writeSequence };
    return drainSyncQueue();
  }

  async function checkForCloudChanges() {
    const userId = session?.user?.id;
    if (!userId || syncInFlight || syncConflict) return false;
    if (Date.now() - lastCloudCheckAt < 15000) return false;
    lastCloudCheckAt = Date.now();

    if (originalGetItem.call(localStorage, dirtyKey(userId)) === "1") {
      return syncNow();
    }

    const { data, error } = await fetchCloudRecord(userId);
    if (error || !data?.app_state) return false;

    const remoteRaw = JSON.stringify(data.app_state);
    const activeRaw = originalGetItem.call(localStorage, STORAGE_KEY);
    const confirmedBase = originalGetItem.call(localStorage, baseKey(userId));

    if (activeRaw && sameState(activeRaw, remoteRaw)) {
      safeStorageSet(baseKey(userId), remoteRaw);
      if (data.updated_at) safeStorageSet(versionKey(userId), data.updated_at);
      setSyncState("Saved to cloud", "success");
      return false;
    }

    if (confirmedBase && sameState(activeRaw, confirmedBase)) {
      await recordRecoverySnapshot(userId, activeRaw, "Local copy before receiving another device's changes");
      const deviceCloudRaw = applyDevicePreferences(remoteRaw, activeRaw);
      setActiveUserData(userId, deviceCloudRaw);
      safeStorageSet(cacheKey(userId), deviceCloudRaw);
      safeStorageSet(baseKey(userId), remoteRaw);
      if (data.updated_at) safeStorageSet(versionKey(userId), data.updated_at);
      setSyncState("Newer cloud records found; reloading…", "success");
      window.location.reload();
      return true;
    }

    if (activeRaw) {
      return markConflict(
        userId,
        activeRaw,
        data,
        "Sync paused because this device and another device both have changes."
      );
    }

    return false;
  }

  function ensureStyles() {
    if (document.querySelector("#hh-cloud-styles")) return;

    const style = document.createElement("style");
    style.id = "hh-cloud-styles";
    style.textContent = `
      html.hh-auth-locked body > *:not(#hh-auth-root) {
        visibility: hidden !important;
      }

      #hh-auth-root {
        position: fixed;
        inset: 0;
        z-index: 100000;
        display: grid;
        place-items: center;
        overflow: auto;
        padding: 24px;
        color: #18212A;
        background:
          radial-gradient(circle at top left, rgba(46,125,123,.18), transparent 34%),
          linear-gradient(160deg, #F7F2E8, #EDF3F4);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      #hh-auth-root[hidden] { display: none !important; }

      .hh-auth-shell { width: min(520px, 100%); }
      .hh-auth-brand { margin-bottom: 14px; text-align: center; }
      .hh-auth-brand h1 {
        margin: 0;
        color: #0D2540;
        font-size: clamp(2.2rem, 8vw, 3.5rem);
        letter-spacing: -.045em;
      }
      .hh-auth-brand p { margin: 7px 0 0; color: #65727E; }
      .hh-auth-card {
        padding: clamp(22px, 5vw, 36px);
        background: rgba(255,255,255,.96);
        border: 1px solid rgba(13,37,64,.12);
        border-radius: 24px;
        box-shadow: 0 24px 70px rgba(13,37,64,.16);
      }
      .hh-auth-card h2 { margin: 0 0 8px; color: #0D2540; }
      .hh-auth-intro { margin: 0 0 20px; color: #65727E; line-height: 1.5; }
      .hh-auth-tabs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 20px;
        padding: 5px;
        background: #EDF2F3;
        border-radius: 14px;
      }
      .hh-auth-tab,
      .hh-auth-button,
      .hh-account-button,
      .hh-account-dialog button {
        min-height: 44px;
        padding: 10px 14px;
        border: 0;
        border-radius: 11px;
        font: inherit;
        font-weight: 850;
        cursor: pointer;
      }
      .hh-auth-tab { color: #0D2540; background: transparent; }
      .hh-auth-tab.active { color: white; background: #0D2540; }
      .hh-auth-form { display: grid; gap: 14px; }
      .hh-auth-form[hidden] { display: none !important; }
      .hh-auth-form label {
        display: grid;
        gap: 7px;
        color: #0D2540;
        font-weight: 750;
      }
      .hh-auth-form input {
        width: 100%;
        min-height: 48px;
        padding: 11px 13px;
        color: #18212A;
        background: white;
        border: 1px solid #D8E0E5;
        border-radius: 12px;
        font: inherit;
      }
      .hh-auth-form input:focus {
        outline: 3px solid rgba(46,125,123,.18);
        border-color: #2E7D7B;
      }
      .hh-auth-primary { color: white; background: #2E7D7B; }
      .hh-auth-link {
        min-height: auto;
        padding: 4px;
        color: #2E7D7B;
        background: transparent;
        text-decoration: underline;
      }
      .hh-auth-message {
        display: none;
        margin: 0 0 17px;
        padding: 12px 14px;
        border-radius: 12px;
        line-height: 1.45;
      }
      .hh-auth-message.show { display: block; }
      .hh-auth-message.info { color: #0D2540; background: #E9F0F5; }
      .hh-auth-message.success { color: #2E6A45; background: #E8F4EC; }
      .hh-auth-message.error { color: #7C2020; background: #F9E8E8; }

      .hh-account-button {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 9000;
        min-height: 42px;
        color: white;
        background: #0D2540;
        box-shadow: 0 12px 30px rgba(13,37,64,.25);
      }
      .hh-account-button::before {
        content: "";
        display: inline-block;
        width: 9px;
        height: 9px;
        margin-right: 8px;
        border-radius: 50%;
        background: #E9C46A;
      }
      .hh-account-button[data-state="success"]::before { background: #67C587; }
      .hh-account-button[data-state="error"]::before { background: #E57373; }
      .hh-account-button[data-state="working"]::before { background: #E9C46A; }

      .hh-account-backdrop {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: grid;
        place-items: center;
        padding: 20px;
        background: rgba(13,37,64,.58);
      }
      .hh-account-backdrop[hidden] { display: none !important; }
      .hh-account-dialog {
        width: min(470px, 100%);
        padding: 26px;
        color: #18212A;
        background: white;
        border-radius: 22px;
        box-shadow: 0 24px 70px rgba(0,0,0,.28);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .hh-account-dialog h2 { margin: 0 0 8px; color: #0D2540; }
      .hh-account-email {
        margin: 0 0 18px;
        overflow-wrap: anywhere;
        color: #65727E;
      }
      #hh-account-sync-status {
        margin: 0 0 18px;
        padding: 12px 14px;
        color: #0D2540;
        background: #F0F4F5;
        border-radius: 12px;
        font-weight: 700;
      }
      #hh-account-sync-status[data-type="success"] { color: #2E6A45; background: #E8F4EC; }
      #hh-account-sync-status[data-type="error"] { color: #7C2020; background: #F9E8E8; }
      .hh-account-actions { display: grid; gap: 10px; }
      .hh-account-sync { color: white; background: #2E7D7B; }
      .hh-account-backup { color: #0D2540; background: #E9F0F5; }
      .hh-account-close { color: #0D2540; background: #EDF2F3; }
      .hh-account-signout { color: white; background: #AA3E3E; }
      .hh-conflict-actions {
        display: grid;
        gap: 10px;
        margin: 0 0 16px;
        padding: 14px;
        background: #FFF3DC;
        border: 1px solid #E9C46A;
        border-radius: 12px;
      }
      .hh-conflict-actions[hidden] { display: none !important; }
      .hh-conflict-actions p { margin: 0; color: #694713; line-height: 1.45; }
      .hh-conflict-local { color: white; background: #2E7D7B; }
      .hh-conflict-cloud { color: white; background: #0D2540; }

      @media (max-width: 620px) {
        #hh-auth-root { padding: 14px; }
        .hh-account-button { right: 12px; bottom: 12px; }
      }
    `;
    document.head.appendChild(style);
  }

  function buildAuthRoot() {
    let root = document.querySelector("#hh-auth-root");
    if (root) return root;

    root = document.createElement("div");
    root.id = "hh-auth-root";
    root.innerHTML = `
      <main class="hh-auth-shell">
        <header class="hh-auth-brand">
          <h1>HerdHarbor</h1>
          <p>Secure livestock records, available wherever you sign in</p>
        </header>

        <section class="hh-auth-card">
          <div id="hh-auth-message" class="hh-auth-message" role="status" aria-live="polite"></div>

          <div id="hh-standard-auth">
            <h2 id="hh-auth-title">Sign in</h2>
            <p class="hh-auth-intro">Sign in to load your protected HerdHarbor records.</p>

            <div class="hh-auth-tabs">
              <button id="hh-signin-tab" class="hh-auth-tab active" type="button">Sign in</button>
              <button id="hh-signup-tab" class="hh-auth-tab" type="button">Create account</button>
            </div>

            <form id="hh-signin-form" class="hh-auth-form">
              <label>
                Email
                <input id="hh-signin-email" type="email" autocomplete="email" required>
              </label>
              <label>
                Password
                <input id="hh-signin-password" type="password" autocomplete="current-password" minlength="8" required>
              </label>
              <button class="hh-auth-button hh-auth-primary" type="submit">Sign in</button>
              <button id="hh-forgot-password" class="hh-auth-button hh-auth-link" type="button">Forgot password?</button>
            </form>

            <form id="hh-signup-form" class="hh-auth-form" hidden>
              <label>
                Email
                <input id="hh-signup-email" type="email" autocomplete="email" required>
              </label>
              <label>
                Password
                <input id="hh-signup-password" type="password" autocomplete="new-password" minlength="8" required>
              </label>
              <label>
                Confirm password
                <input id="hh-signup-confirm" type="password" autocomplete="new-password" minlength="8" required>
              </label>
              <button class="hh-auth-button hh-auth-primary" type="submit">Create account</button>
            </form>
          </div>

          <form id="hh-recovery-form" class="hh-auth-form" hidden>
            <h2>Choose a new password</h2>
            <p class="hh-auth-intro">Enter a new password for your HerdHarbor account.</p>
            <label>
              New password
              <input id="hh-recovery-password" type="password" autocomplete="new-password" minlength="8" required>
            </label>
            <label>
              Confirm new password
              <input id="hh-recovery-confirm" type="password" autocomplete="new-password" minlength="8" required>
            </label>
            <button class="hh-auth-button hh-auth-primary" type="submit">Update password</button>
          </form>
        </section>
      </main>
    `;

    document.body.appendChild(root);
    bindAuthEvents(root);
    return root;
  }

  function authMessage(message = "", type = "info") {
    const box = document.querySelector("#hh-auth-message");
    if (!box) return;
    box.textContent = message;
    box.className = "hh-auth-message";
    if (message) box.classList.add("show", type);
  }

  function showAuth(mode = "signin") {
    ensureStyles();
    const root = buildAuthRoot();
    root.hidden = false;
    document.documentElement.classList.add("hh-auth-locked");

    const standard = root.querySelector("#hh-standard-auth");
    const recovery = root.querySelector("#hh-recovery-form");
    standard.hidden = false;
    recovery.hidden = true;

    const isSignin = mode === "signin";
    root.querySelector("#hh-signin-form").hidden = !isSignin;
    root.querySelector("#hh-signup-form").hidden = isSignin;
    root.querySelector("#hh-signin-tab").classList.toggle("active", isSignin);
    root.querySelector("#hh-signup-tab").classList.toggle("active", !isSignin);
    root.querySelector("#hh-auth-title").textContent = isSignin ? "Sign in" : "Create account";
  }

  function showRecovery() {
    ensureStyles();
    const root = buildAuthRoot();
    root.hidden = false;
    document.documentElement.classList.add("hh-auth-locked");
    root.querySelector("#hh-standard-auth").hidden = true;
    root.querySelector("#hh-recovery-form").hidden = false;
  }

  function unlockApp() {
    const root = document.querySelector("#hh-auth-root");
    if (root) root.hidden = true;
    document.documentElement.classList.remove("hh-auth-locked");
    buildAccountControls();
  }

  function setFormBusy(form, busy) {
    form.querySelectorAll("button, input").forEach((element) => {
      element.disabled = busy;
    });
  }

  function bindAuthEvents(root) {
    root.querySelector("#hh-signin-tab").addEventListener("click", () => {
      authMessage();
      showAuth("signin");
    });

    root.querySelector("#hh-signup-tab").addEventListener("click", () => {
      authMessage();
      showAuth("signup");
    });

    root.querySelector("#hh-signin-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      setFormBusy(form, true);
      authMessage("Signing in…", "info");

      const { error } = await client.auth.signInWithPassword({
        email: root.querySelector("#hh-signin-email").value.trim(),
        password: root.querySelector("#hh-signin-password").value
      });

      if (error) authMessage(error.message, "error");
      setFormBusy(form, false);
    });

    root.querySelector("#hh-signup-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const password = root.querySelector("#hh-signup-password").value;
      const confirmation = root.querySelector("#hh-signup-confirm").value;

      if (password !== confirmation) {
        authMessage("The passwords do not match.", "error");
        return;
      }

      setFormBusy(form, true);
      authMessage("Creating your account…", "info");

      const { data, error } = await client.auth.signUp({
        email: root.querySelector("#hh-signup-email").value.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}${window.location.pathname}`
        }
      });

      if (error) {
        authMessage(error.message, "error");
      } else if (data.session) {
        authMessage("Account created and signed in.", "success");
      } else {
        authMessage(
          "Account created. Open the confirmation email, then return here to sign in.",
          "success"
        );
      }

      setFormBusy(form, false);
    });

    root.querySelector("#hh-forgot-password").addEventListener("click", async () => {
      const email = root.querySelector("#hh-signin-email").value.trim();
      if (!email) {
        authMessage("Enter your email address first.", "error");
        root.querySelector("#hh-signin-email").focus();
        return;
      }

      authMessage("Sending password-reset email…", "info");
      const recoveryUrl = new URL(`${window.location.origin}${window.location.pathname}`);
      recoveryUrl.searchParams.set("password-recovery", "1");

      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: recoveryUrl.toString()
      });

      authMessage(
        error ? error.message : "Password-reset email sent. Open the link in that email.",
        error ? "error" : "success"
      );
    });

    root.querySelector("#hh-recovery-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const password = root.querySelector("#hh-recovery-password").value;
      const confirmation = root.querySelector("#hh-recovery-confirm").value;

      if (password !== confirmation) {
        authMessage("The passwords do not match.", "error");
        return;
      }

      setFormBusy(form, true);
      authMessage("Updating password…", "info");
      const { error } = await client.auth.updateUser({ password });

      if (error) {
        authMessage(error.message, "error");
        setFormBusy(form, false);
        return;
      }

      recoveryMode = false;
      try {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("password-recovery");
        cleanUrl.hash = "";
        window.history.replaceState({}, document.title, cleanUrl.toString());
      } catch {}

      await client.auth.signOut();
      showAuth("signin");
      authMessage(
        "Password updated successfully. Sign in with your new password.",
        "success"
      );
      setFormBusy(form, false);
    });
  }

  function updateConflictControls() {
    if (!accountDialog) return;
    const controls = accountDialog.querySelector("#hh-conflict-actions");
    if (controls) controls.hidden = !syncConflict;
  }

  function downloadSafetyBackup() {
    const rawValue = originalGetItem.call(localStorage, STORAGE_KEY);
    const appState = safeParse(rawValue);
    if (!appState) {
      setSyncState("No readable local records are available to back up.", "error");
      return;
    }

    const payload = JSON.stringify({
      app: "HerdHarbor",
      version: "0.3.04",
      backupType: "local-safety-backup",
      exportedAt: new Date().toISOString(),
      data: appState
    }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `herdharbor-safety-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setSyncState("Safety backup downloaded.", "success");
  }

  async function resolveConflict(choice) {
    if (!syncConflict || !session?.user?.id) return false;

    const conflict = syncConflict;
    if (choice === "cloud") {
      if (!conflict.remoteRaw || !safeParse(conflict.remoteRaw)) {
        setSyncState("The cloud copy could not be read; the local copy was not changed.", "error");
        return false;
      }

      await recordRecoverySnapshot(
        conflict.userId,
        conflict.localRaw,
        "Local copy before choosing cloud conflict version"
      );
      const deviceCloudRaw = applyDevicePreferences(
        conflict.remoteRaw,
        conflict.localRaw
      );
      setActiveUserData(conflict.userId, deviceCloudRaw);
      safeStorageSet(cacheKey(conflict.userId), deviceCloudRaw);
      safeStorageSet(baseKey(conflict.userId), conflict.remoteRaw);
      if (conflict.remoteUpdatedAt) {
        safeStorageSet(versionKey(conflict.userId), conflict.remoteUpdatedAt);
      }
      safeStorageRemove(dirtyKey(conflict.userId));
      syncConflict = null;
      setSyncState("Cloud copy selected; reloading records…", "success");
      window.location.reload();
      return true;
    }

    const accepted = window.confirm(
      "Replace the cloud copy with the records currently on this device? A safety snapshot of both copies has already been retained."
    );
    if (!accepted) return false;

    pendingSync = null;
    const saved = await syncValueToCloud(conflict.localRaw, writeSequence, { force: true });
    updateConflictControls();
    return saved;
  }

  function buildAccountControls() {
    if (!accountButton) {
      accountButton = document.createElement("button");
      accountButton.type = "button";
      accountButton.className = "hh-account-button";
      accountButton.textContent = "Account";
      accountButton.dataset.state = "info";
      accountButton.addEventListener("click", () => {
        accountDialog.hidden = false;
        const email = accountDialog.querySelector("#hh-account-email");
        email.textContent = session?.user?.email || "Signed-in user";
        const status = accountDialog.querySelector("#hh-account-sync-status");
        status.textContent = syncState;
      });
      document.body.appendChild(accountButton);
    }

    if (!accountDialog) {
      accountDialog = document.createElement("div");
      accountDialog.className = "hh-account-backdrop";
      accountDialog.hidden = true;
      accountDialog.innerHTML = `
        <section class="hh-account-dialog" role="dialog" aria-modal="true" aria-labelledby="hh-account-title">
          <h2 id="hh-account-title">HerdHarbor account</h2>
          <p id="hh-account-email" class="hh-account-email"></p>
          <p id="hh-account-sync-status">Checking sync status…</p>
          <div id="hh-conflict-actions" class="hh-conflict-actions" hidden>
            <p>Both copies are protected. Choose which version should become the current record set.</p>
            <button id="hh-keep-local" class="hh-conflict-local" type="button">Keep this device's records</button>
            <button id="hh-use-cloud" class="hh-conflict-cloud" type="button">Use cloud records</button>
          </div>
          <div class="hh-account-actions">
            <button id="hh-sync-now" class="hh-account-sync" type="button">Save to cloud now</button>
            <button id="hh-download-safety" class="hh-account-backup" type="button">Download safety backup</button>
            <button id="hh-close-account" class="hh-account-close" type="button">Close</button>
            <button id="hh-sign-out" class="hh-account-signout" type="button">Sign out</button>
          </div>
        </section>
      `;

      accountDialog.addEventListener("click", (event) => {
        if (event.target === accountDialog) accountDialog.hidden = true;
      });

      accountDialog.querySelector("#hh-close-account").addEventListener("click", () => {
        accountDialog.hidden = true;
      });

      accountDialog.querySelector("#hh-sync-now").addEventListener("click", async () => {
        await syncNow();
      });

      accountDialog.querySelector("#hh-download-safety").addEventListener("click", () => {
        downloadSafetyBackup();
      });

      accountDialog.querySelector("#hh-keep-local").addEventListener("click", async () => {
        await resolveConflict("local");
      });

      accountDialog.querySelector("#hh-use-cloud").addEventListener("click", async () => {
        await resolveConflict("cloud");
      });

      accountDialog.querySelector("#hh-sign-out").addEventListener("click", async () => {
        const userId = session?.user?.id;
        const hasUnsyncedChanges =
          Boolean(userId) &&
          originalGetItem.call(localStorage, dirtyKey(userId)) === "1";
        if (hasUnsyncedChanges && !(await syncNow())) {
          setSyncState(
            "Sign-out paused to protect unsynced records. Reconnect and try Save to cloud now.",
            "error"
          );
          return;
        }
        preserveActiveForUser(userId, "Local copy retained at sign out");
        accountDialog.hidden = true;
        await client.auth.signOut();
      });

      document.body.appendChild(accountDialog);
    }

    setSyncState(syncState, syncConflict ? "error" : "success");
  }

  async function hydrateUserData(activeSession) {
    session = activeSession;

    if (recoveryMode) {
      showRecovery();
      authMessage("Your reset link is valid. Choose a new password.", "info");
      return;
    }

    const userId = session.user.id;
    const storedActiveRaw = originalGetItem.call(localStorage, STORAGE_KEY);
    const activeOwner = originalGetItem.call(localStorage, ACTIVE_OWNER_KEY);
    const activeRaw =
      !activeOwner || activeOwner === userId
        ? storedActiveRaw
        : null;
    const cachedRaw = originalGetItem.call(localStorage, cacheKey(userId));
    const dirty = originalGetItem.call(localStorage, dirtyKey(userId)) === "1";

    if (dirty) {
      const unsyncedRaw = activeRaw || cachedRaw;
      if (unsyncedRaw && safeParse(unsyncedRaw)) {
        if (!activeRaw) setActiveUserData(userId, unsyncedRaw);
        unlockApp();
        setSyncState("Unsynced local changes found; saving…", "working");
        pendingSync = { rawValue: unsyncedRaw, sequence: writeSequence };
        await drainSyncQueue();
        return;
      }
    }

    setSyncState("Loading cloud records…", "working");

    const { data, error } = await fetchCloudRecord(userId);

    if (error) {
      console.error("HerdHarbor cloud load failed:", error);

      const offlineRaw = activeRaw || cachedRaw;
      if (offlineRaw && safeParse(offlineRaw)) {
        setActiveUserData(userId, offlineRaw);
        unlockApp();
        setSyncState("Offline copy loaded; changes will sync when connection returns.", "error");
        return;
      }

      authMessage(
        "Your account is signed in, but HerdHarbor could not load the cloud record. Try again shortly.",
        "error"
      );
      showAuth("signin");
      return;
    }

    if (data?.app_state) {
      const cloudRaw = JSON.stringify(data.app_state);
      const stateChanged = !activeRaw || !sameState(activeRaw, cloudRaw);
      const deviceCloudRaw = applyDevicePreferences(
        cloudRaw,
        activeRaw || cachedRaw
      );

      if (activeRaw && stateChanged) {
        await recordRecoverySnapshot(userId, activeRaw, "Local copy before loading newer cloud records");
      }
      setActiveUserData(userId, deviceCloudRaw);
      safeStorageSet(cacheKey(userId), deviceCloudRaw);
      safeStorageSet(baseKey(userId), cloudRaw);
      if (data.updated_at) safeStorageSet(versionKey(userId), data.updated_at);
      safeStorageRemove(dirtyKey(userId));
      syncConflict = null;

      if (stateChanged) {
        const reloadKey = `hh_cloud_loaded_${userId}_${data.updated_at || "current"}`;
        if (!sessionStorage.getItem(reloadKey)) {
          sessionStorage.setItem(reloadKey, "1");
          window.location.reload();
          return;
        }
      }

      unlockApp();
      setSyncState("Cloud records loaded", "success");
      return;
    }

    const newUserRaw = cachedRaw || activeRaw;
    if (newUserRaw && safeParse(newUserRaw)) {
      const stateChanged = !activeRaw || !sameState(activeRaw, newUserRaw);
      setActiveUserData(userId, newUserRaw);
      pendingSync = { rawValue: newUserRaw, sequence: writeSequence };
      await drainSyncQueue();
      if (stateChanged) {
        window.location.reload();
        return;
      }
      unlockApp();
      return;
    }

    if (storedActiveRaw && activeOwner && activeOwner !== userId) {
      await recordRecoverySnapshot(activeOwner, storedActiveRaw, "Retained while switching accounts");
    }
    clearActiveUserData();
    safeStorageSet(ACTIVE_OWNER_KEY, userId);
    unlockApp();
    setSyncState("New cloud account ready", "success");
    if (storedActiveRaw) window.location.reload();
  }

  async function initialize() {
    installStorageBridge();
    ensureStyles();
    document.documentElement.classList.add("hh-auth-locked");
    buildAuthRoot();
    authMessage("Checking your secure session…", "info");

    const { data, error } = await client.auth.getSession();

    if (error) {
      authMessage(error.message, "error");
      showAuth("signin");
      return;
    }

    if (!data.session) {
      authMessage();
      showAuth("signin");
      return;
    }

    session = data.session;
    if (recoveryMode) {
      showRecovery();
      authMessage("Your reset link is valid. Choose a new password.", "info");
      return;
    }

    await hydrateUserData(data.session);
  }

  client.auth.onAuthStateChange((event, activeSession) => {
    if (event === "PASSWORD_RECOVERY") {
      recoveryMode = true;
      session = activeSession;
      showRecovery();
      authMessage("Your reset link is valid. Choose a new password.", "info");
      return;
    }

    if (event === "SIGNED_IN" && activeSession) {
      session = activeSession;
      if (recoveryMode) {
        showRecovery();
        authMessage("Your reset link is valid. Choose a new password.", "info");
        return;
      }
      hydrateUserData(activeSession);
      return;
    }

    if (event === "SIGNED_OUT") {
      const previousUserId = session?.user?.id;
      preserveActiveForUser(previousUserId, "Local copy retained after session ended");
      session = null;
      if (accountButton) accountButton.remove();
      if (accountDialog) accountDialog.remove();
      accountButton = null;
      accountDialog = null;
      showAuth("signin");
      authMessage("Signed out successfully.", "success");
    }
  });

  window.addEventListener("online", () => {
    const userId = session?.user?.id;
    if (
      userId &&
      originalGetItem.call(localStorage, dirtyKey(userId)) === "1" &&
      !syncConflict
    ) {
      syncNow();
    } else {
      checkForCloudChanges();
    }
  });

  window.addEventListener("offline", () => {
    setSyncState(
      "Offline; changes stay protected on this device and will sync after reconnection.",
      "error"
    );
  });

  document.addEventListener("visibilitychange", () => {
    const userId = session?.user?.id;
    if (
      document.visibilityState === "hidden" &&
      userId &&
      originalGetItem.call(localStorage, dirtyKey(userId)) === "1" &&
      !syncConflict
    ) {
      syncNow();
    } else if (document.visibilityState === "visible") {
      checkForCloudChanges();
    }
  });

  window.addEventListener("focus", () => {
    checkForCloudChanges();
  });

  window.HerdHarborCloud = {
    syncNow,
    getSession: () => session,
    getSyncState: () => syncState,
    getSyncDetails,
    hasUnsyncedChanges: () => {
      const userId = session?.user?.id;
      return Boolean(userId) &&
        originalGetItem.call(localStorage, dirtyKey(userId)) === "1";
    },
    hasConflict: () => Boolean(syncConflict),
    downloadSafetyBackup
  };

  initialize().catch((error) => {
    console.error("HerdHarbor cloud initialization failed:", error);
    ensureStyles();
    showAuth("signin");
    authMessage(
      "HerdHarbor could not start the secure account connection. Your local records were not removed. Refresh and try again.",
      "error"
    );
  });
})();
