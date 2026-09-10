(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborLocalCacheV2 = api;
  if (root && root.document) api.install();
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const VERSION = "2.0";
  const RELEASE = "1.8.2";
  const STATE_KEY = "herdharbor_pre_alpha_v1";
  const ACTIVE_OWNER_KEY = "herdharbor_active_user_v1";
  const DB_NAME = "herdharbor_local_cache_v2";
  const DB_VERSION = 1;
  const SNAPSHOT_STORE = "snapshots";
  const SECTION_STORE = "sections";
  const META_STORE = "meta";
  const CACHE_DELAY_MS = 700;
  const HOT_SECTION_NAMES = Object.freeze([
    "animals",
    "tasks",
    "breedings",
    "litters",
    "settings"
  ]);

  let installed = false;
  let cacheTimer = null;
  let pendingRaw = null;
  let pendingReason = "change";
  let writeInFlight = null;
  let lastStats = null;

  function safeParse(rawValue) {
    if (!rawValue || typeof rawValue !== "string") return null;
    try {
      const value = JSON.parse(rawValue);
      return value && typeof value === "object" ? value : null;
    } catch {
      return null;
    }
  }

  function extractHotSections(state) {
    const source = state && typeof state === "object" ? state : {};
    const result = {};
    HOT_SECTION_NAMES.forEach((name) => {
      const value = source[name];
      if (Array.isArray(value)) result[name] = value;
      else if (value && typeof value === "object") result[name] = value;
      else result[name] = Array.isArray(value) ? value : (name === "settings" ? {} : []);
    });
    return result;
  }

  function activeUserId() {
    try {
      return root.localStorage?.getItem?.(ACTIVE_OWNER_KEY) || null;
    } catch {
      return null;
    }
  }

  function requestIdle(callback) {
    if (typeof root.requestIdleCallback === "function") {
      return root.requestIdleCallback(callback, { timeout: 1200 });
    }
    return root.setTimeout?.(callback, 0);
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!root.indexedDB) {
        reject(new Error("IndexedDB is unavailable."));
        return;
      }
      const request = root.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) {
          database.createObjectStore(SNAPSHOT_STORE, { keyPath: "userId" });
        }
        if (!database.objectStoreNames.contains(SECTION_STORE)) {
          const store = database.createObjectStore(SECTION_STORE, { keyPath: "key" });
          store.createIndex("userId", "userId");
          store.createIndex("section", "section");
        }
        if (!database.objectStoreNames.contains(META_STORE)) {
          database.createObjectStore(META_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Local cache could not open."));
    });
  }

  async function compressText(text) {
    if (typeof root.CompressionStream !== "function") {
      return { encoding: "plain", payload: text, bytes: new Blob([text]).size };
    }
    try {
      const stream = new Blob([text]).stream().pipeThrough(new root.CompressionStream("gzip"));
      const payload = await new Response(stream).arrayBuffer();
      return { encoding: "gzip", payload, bytes: payload.byteLength };
    } catch {
      return { encoding: "plain", payload: text, bytes: new Blob([text]).size };
    }
  }

  async function decompressPayload(record) {
    if (!record) return null;
    if (record.encoding !== "gzip") return typeof record.payload === "string" ? record.payload : null;
    if (typeof root.DecompressionStream !== "function") return null;
    try {
      const stream = new Blob([record.payload]).stream().pipeThrough(new root.DecompressionStream("gzip"));
      return await new Response(stream).text();
    } catch {
      return null;
    }
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error || new Error("Local cache transaction failed."));
      transaction.onabort = () => reject(transaction.error || new Error("Local cache transaction was aborted."));
    });
  }

  async function writeCache(rawValue, reason = "change") {
    const state = safeParse(rawValue);
    const userId = activeUserId();
    if (!state || !userId) return false;

    const savedAt = new Date().toISOString();
    const hot = extractHotSections(state);
    const compressed = await compressText(rawValue);
    const database = await openDatabase();
    try {
      const transaction = database.transaction(
        [SNAPSHOT_STORE, SECTION_STORE, META_STORE],
        "readwrite"
      );
      const snapshots = transaction.objectStore(SNAPSHOT_STORE);
      const sections = transaction.objectStore(SECTION_STORE);
      const meta = transaction.objectStore(META_STORE);

      snapshots.put({
        userId,
        savedAt,
        reason,
        encoding: compressed.encoding,
        payload: compressed.payload,
        sourceBytes: new Blob([rawValue]).size,
        cachedBytes: compressed.bytes
      });

      Object.entries(hot).forEach(([section, value]) => {
        sections.put({
          key: `${userId}:${section}`,
          userId,
          section,
          savedAt,
          value
        });
      });

      meta.put({
        key: `stats:${userId}`,
        userId,
        savedAt,
        reason,
        sourceBytes: new Blob([rawValue]).size,
        cachedBytes: compressed.bytes,
        encoding: compressed.encoding,
        hotSections: HOT_SECTION_NAMES.slice()
      });

      await transactionDone(transaction);
      lastStats = {
        userId,
        savedAt,
        reason,
        sourceBytes: new Blob([rawValue]).size,
        cachedBytes: compressed.bytes,
        encoding: compressed.encoding,
        hotSections: HOT_SECTION_NAMES.slice()
      };
      try {
        root.dispatchEvent?.(new CustomEvent("herdharbor:local-cache-saved", { detail: lastStats }));
      } catch {}
      return true;
    } finally {
      database.close();
    }
  }

  function schedule(rawValue, reason = "change") {
    if (!safeParse(rawValue)) return false;
    pendingRaw = rawValue;
    pendingReason = reason;
    if (cacheTimer) root.clearTimeout?.(cacheTimer);
    cacheTimer = root.setTimeout?.(() => {
      cacheTimer = null;
      requestIdle(() => flush());
    }, CACHE_DELAY_MS);
    return true;
  }

  async function flush() {
    if (writeInFlight) return writeInFlight;
    if (!pendingRaw) return false;
    const rawValue = pendingRaw;
    const reason = pendingReason;
    pendingRaw = null;
    writeInFlight = writeCache(rawValue, reason)
      .catch((error) => {
        console.warn("HerdHarbor local performance cache was not updated:", error);
        return false;
      })
      .finally(() => {
        writeInFlight = null;
        if (pendingRaw) requestIdle(() => flush());
      });
    return writeInFlight;
  }

  async function getHotSection(section) {
    const userId = activeUserId();
    if (!userId || !HOT_SECTION_NAMES.includes(section)) return null;
    const database = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const request = database
          .transaction(SECTION_STORE, "readonly")
          .objectStore(SECTION_STORE)
          .get(`${userId}:${section}`);
        request.onsuccess = () => resolve(request.result?.value ?? null);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  }

  async function getSnapshot() {
    const userId = activeUserId();
    if (!userId) return null;
    const database = await openDatabase();
    try {
      const record = await new Promise((resolve, reject) => {
        const request = database.transaction(SNAPSHOT_STORE, "readonly").objectStore(SNAPSHOT_STORE).get(userId);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      const rawValue = await decompressPayload(record);
      return safeParse(rawValue);
    } finally {
      database.close();
    }
  }

  async function getStats() {
    if (lastStats) return { ...lastStats };
    const userId = activeUserId();
    if (!userId) return null;
    const database = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const request = database.transaction(META_STORE, "readonly").objectStore(META_STORE).get(`stats:${userId}`);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  }

  function install() {
    if (installed || !root.localStorage || !root.Storage?.prototype?.setItem) return API;
    installed = true;

    const previousSetItem = root.Storage.prototype.setItem;
    const previousRemoveItem = root.Storage.prototype.removeItem;

    root.Storage.prototype.setItem = function herdHarborLocalCacheSetItem(key, value) {
      const result = previousSetItem.call(this, key, value);
      if (this === root.localStorage && key === STATE_KEY) schedule(String(value), "state-change");
      return result;
    };

    if (typeof previousRemoveItem === "function") {
      root.Storage.prototype.removeItem = function herdHarborLocalCacheRemoveItem(key) {
        const result = previousRemoveItem.call(this, key);
        if (this === root.localStorage && key === STATE_KEY) schedule("{}", "state-cleared");
        return result;
      };
    }

    const current = root.localStorage.getItem(STATE_KEY);
    if (safeParse(current)) schedule(current, "startup-warm-cache");

    root.addEventListener?.("pagehide", () => {
      if (pendingRaw) void flush();
    });
    root.addEventListener?.("online", () => {
      const latest = root.localStorage.getItem(STATE_KEY);
      if (safeParse(latest)) schedule(latest, "online-refresh");
    });
    root.document?.addEventListener?.("visibilitychange", () => {
      if (root.document.visibilityState === "hidden" && pendingRaw) void flush();
    });

    return API;
  }

  const API = Object.freeze({
    version: VERSION,
    release: RELEASE,
    hotSections: HOT_SECTION_NAMES.slice(),
    install,
    schedule,
    flush,
    getHotSection,
    getSnapshot,
    getStats,
    extractHotSections,
    safeParse
  });

  return API;
});
