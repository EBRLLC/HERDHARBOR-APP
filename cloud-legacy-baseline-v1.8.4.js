(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborLegacyCloudBaseline = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "1.0";
  const RELEASE = "1.8.4";
  const DB_NAME = "herdharbor_legacy_cloud_baseline_v1";
  const DB_VERSION = 1;
  const STORE_NAME = "baselines";

  function requiredText(value, label, maxLength = 240) {
    const text = String(value == null ? "" : value).trim();
    if (!text) throw new TypeError(`${label} is required.`);
    if (text.length > maxLength) throw new TypeError(`${label} is too long.`);
    return text;
  }

  function normalizeRaw(rawValue) {
    const raw = String(rawValue == null ? "" : rawValue);
    if (!raw) throw new TypeError("rawValue is required.");
    let parsed;
    try { parsed = JSON.parse(raw); } catch { throw new TypeError("rawValue must be valid JSON."); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new TypeError("rawValue must describe an object state.");
    }
    return raw;
  }

  function createMemoryStore(options = {}) {
    const rows = options.rows instanceof Map ? options.rows : new Map();

    async function get(userId) {
      return rows.get(requiredText(userId, "userId"))?.rawValue || null;
    }

    async function set(userId, rawValue) {
      const id = requiredText(userId, "userId");
      const raw = normalizeRaw(rawValue);
      rows.set(id, { userId: id, rawValue: raw, updatedAt: new Date().toISOString() });
      return true;
    }

    async function remove(userId) {
      rows.delete(requiredText(userId, "userId"));
      return true;
    }

    return Object.freeze({ get, set, remove });
  }

  function createIndexedDbStore(options = {}) {
    const indexedDB = options.indexedDB || (typeof globalThis !== "undefined" ? globalThis.indexedDB : null);
    const dbName = String(options.dbName || DB_NAME);
    if (!indexedDB?.open) throw new TypeError("IndexedDB is required for the legacy cloud baseline.");

    function open() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, DB_VERSION);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(STORE_NAME)) {
            database.createObjectStore(STORE_NAME, { keyPath: "userId" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("Legacy cloud baseline database could not open."));
      });
    }

    async function get(userId) {
      const id = requiredText(userId, "userId");
      const database = await open();
      try {
        return await new Promise((resolve, reject) => {
          const transaction = database.transaction(STORE_NAME, "readonly");
          const request = transaction.objectStore(STORE_NAME).get(id);
          request.onsuccess = () => resolve(request.result?.rawValue || null);
          request.onerror = () => reject(request.error || new Error("Legacy cloud baseline read failed."));
        });
      } finally {
        database.close();
      }
    }

    async function set(userId, rawValue) {
      const id = requiredText(userId, "userId");
      const raw = normalizeRaw(rawValue);
      const database = await open();
      try {
        await new Promise((resolve, reject) => {
          const transaction = database.transaction(STORE_NAME, "readwrite");
          transaction.objectStore(STORE_NAME).put({
            userId: id,
            rawValue: raw,
            updatedAt: new Date().toISOString()
          });
          transaction.oncomplete = resolve;
          transaction.onerror = () => reject(transaction.error || new Error("Legacy cloud baseline write failed."));
          transaction.onabort = () => reject(transaction.error || new Error("Legacy cloud baseline write aborted."));
        });
      } finally {
        database.close();
      }
      return true;
    }

    async function remove(userId) {
      const id = requiredText(userId, "userId");
      const database = await open();
      try {
        await new Promise((resolve, reject) => {
          const transaction = database.transaction(STORE_NAME, "readwrite");
          transaction.objectStore(STORE_NAME).delete(id);
          transaction.oncomplete = resolve;
          transaction.onerror = () => reject(transaction.error || new Error("Legacy cloud baseline delete failed."));
          transaction.onabort = () => reject(transaction.error || new Error("Legacy cloud baseline delete aborted."));
        });
      } finally {
        database.close();
      }
      return true;
    }

    return Object.freeze({ get, set, remove });
  }

  return Object.freeze({
    version: VERSION,
    release: RELEASE,
    createMemoryStore,
    createIndexedDbStore
  });
});
