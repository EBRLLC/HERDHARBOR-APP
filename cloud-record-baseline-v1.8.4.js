(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborCloudRecordBaseline = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "1.0";
  const RELEASE = "1.8.4";
  const DB_NAME = "herdharbor_record_baseline_v1";
  const DB_VERSION = 1;
  const RECORD_STORE = "records";
  const META_STORE = "meta";

  function cloneJson(value, fallback = null) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return fallback;
    }
  }

  function requiredText(value, label, maxLength = 200) {
    const text = String(value == null ? "" : value).trim();
    if (!text) throw new TypeError(`${label} is required.`);
    if (text.length > maxLength) throw new TypeError(`${label} is too long.`);
    return text;
  }

  function normalizeRow(row) {
    const namespace = requiredText(row?.namespace, "namespace", 64);
    const recordId = requiredText(row?.record_id ?? row?.recordId, "record_id", 160);
    const version = Number(row?.record_version ?? row?.recordVersion ?? 0);
    if (!Number.isSafeInteger(version) || version < 1) throw new TypeError("record_version must be a positive integer.");
    const payload = row?.payload === undefined ? null : cloneJson(row.payload, undefined);
    if (row?.payload !== undefined && payload === undefined) throw new TypeError("payload must be JSON serializable.");
    return {
      namespace,
      record_id: recordId,
      payload,
      payload_checksum: String(row?.payload_checksum ?? row?.payloadChecksum ?? ""),
      record_version: version,
      deleted_at: row?.deleted_at ?? row?.deletedAt ?? null
    };
  }

  function normalizeMeta(meta = {}) {
    const generation = meta.generation ?? meta.sync_generation ?? meta.syncGeneration ?? null;
    const safeGeneration = generation === null || generation === undefined
      ? null
      : Number(generation);
    if (safeGeneration !== null && (!Number.isSafeInteger(safeGeneration) || safeGeneration < 0)) {
      throw new TypeError("baseline generation must be a non-negative integer.");
    }
    return {
      primed: meta.primed !== false,
      generation: safeGeneration,
      stage: String(meta.stage ?? meta.cutover_stage ?? meta.cutoverStage ?? ""),
      checksum: String(meta.checksum ?? ""),
      updatedAt: String(meta.updatedAt ?? meta.updated_at ?? new Date().toISOString())
    };
  }

  function recordKey(ownerId, namespace, recordId) {
    return `${ownerId}\u0000${namespace}\u0000${recordId}`;
  }

  function metaKey(ownerId, namespace) {
    return `${ownerId}\u0000${namespace}`;
  }

  function createMemoryStore(options = {}) {
    const ownerId = requiredText(options.ownerId || "local", "ownerId", 200);
    const rows = options.rows instanceof Map ? options.rows : new Map();
    const metas = options.metas instanceof Map ? options.metas : new Map();

    async function list(namespace) {
      const safeNamespace = requiredText(namespace, "namespace", 64);
      return [...rows.values()]
        .filter((entry) => entry.ownerId === ownerId && entry.namespace === safeNamespace)
        .map(({ ownerId: _ownerId, key: _key, ...row }) => cloneJson(row))
        .sort((left, right) => left.record_id.localeCompare(right.record_id));
    }

    async function get(namespace, recordId) {
      const safeNamespace = requiredText(namespace, "namespace", 64);
      const safeRecordId = requiredText(recordId, "recordId", 160);
      const entry = rows.get(recordKey(ownerId, safeNamespace, safeRecordId));
      if (!entry) return null;
      const { ownerId: _ownerId, key: _key, ...row } = entry;
      return cloneJson(row);
    }

    async function put(row) {
      const safe = normalizeRow(row);
      rows.set(recordKey(ownerId, safe.namespace, safe.record_id), {
        key: recordKey(ownerId, safe.namespace, safe.record_id),
        ownerId,
        ...safe
      });
      return cloneJson(safe);
    }

    async function replace(namespace, nextRows, meta = {}) {
      const safeNamespace = requiredText(namespace, "namespace", 64);
      for (const [key, entry] of rows.entries()) {
        if (entry.ownerId === ownerId && entry.namespace === safeNamespace) rows.delete(key);
      }
      for (const row of Array.isArray(nextRows) ? nextRows : []) {
        const safe = normalizeRow(row);
        if (safe.namespace !== safeNamespace) throw new TypeError("baseline row namespace mismatch.");
        await put(safe);
      }
      await setMeta(safeNamespace, { ...meta, primed: true });
      return true;
    }

    async function getMeta(namespace) {
      const safeNamespace = requiredText(namespace, "namespace", 64);
      return cloneJson(metas.get(metaKey(ownerId, safeNamespace)) || null);
    }

    async function setMeta(namespace, meta = {}) {
      const safeNamespace = requiredText(namespace, "namespace", 64);
      const safe = normalizeMeta(meta);
      metas.set(metaKey(ownerId, safeNamespace), safe);
      return cloneJson(safe);
    }

    async function isPrimed(namespace) {
      return Boolean((await getMeta(namespace))?.primed);
    }

    return Object.freeze({ list, get, put, replace, getMeta, setMeta, isPrimed });
  }

  function createIndexedDbStore(options = {}) {
    const ownerId = requiredText(options.ownerId, "ownerId", 200);
    const indexedDB = options.indexedDB || (typeof globalThis !== "undefined" ? globalThis.indexedDB : null);
    const dbName = String(options.dbName || DB_NAME);
    if (!indexedDB?.open) throw new TypeError("IndexedDB is required for the durable normalized baseline.");

    function open() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, DB_VERSION);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(RECORD_STORE)) {
            const store = database.createObjectStore(RECORD_STORE, { keyPath: "key" });
            store.createIndex("ownerNamespace", ["ownerId", "namespace"]);
          }
          if (!database.objectStoreNames.contains(META_STORE)) {
            database.createObjectStore(META_STORE, { keyPath: "key" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("Normalized baseline database could not open."));
      });
    }

    async function transact(storeNames, mode, operation) {
      const database = await open();
      try {
        return await new Promise((resolve, reject) => {
          const transaction = database.transaction(storeNames, mode);
          let result;
          try {
            result = operation(transaction);
          } catch (error) {
            reject(error);
            try { transaction.abort(); } catch {}
            return;
          }
          transaction.oncomplete = () => resolve(result);
          transaction.onerror = () => reject(transaction.error || new Error("Normalized baseline transaction failed."));
          transaction.onabort = () => reject(transaction.error || new Error("Normalized baseline transaction aborted."));
        });
      } finally {
        database.close();
      }
    }

    async function list(namespace) {
      const safeNamespace = requiredText(namespace, "namespace", 64);
      const database = await open();
      try {
        return await new Promise((resolve, reject) => {
          const transaction = database.transaction(RECORD_STORE, "readonly");
          const request = transaction.objectStore(RECORD_STORE).index("ownerNamespace").getAll([ownerId, safeNamespace]);
          request.onsuccess = () => resolve((request.result || []).map(({ ownerId: _ownerId, key: _key, ...row }) => cloneJson(row)).sort((a, b) => a.record_id.localeCompare(b.record_id)));
          request.onerror = () => reject(request.error || new Error("Normalized baseline read failed."));
        });
      } finally {
        database.close();
      }
    }

    async function get(namespace, recordId) {
      const safeNamespace = requiredText(namespace, "namespace", 64);
      const safeRecordId = requiredText(recordId, "recordId", 160);
      const database = await open();
      try {
        return await new Promise((resolve, reject) => {
          const transaction = database.transaction(RECORD_STORE, "readonly");
          const request = transaction.objectStore(RECORD_STORE).get(recordKey(ownerId, safeNamespace, safeRecordId));
          request.onsuccess = () => {
            const entry = request.result;
            if (!entry) return resolve(null);
            const { ownerId: _ownerId, key: _key, ...row } = entry;
            resolve(cloneJson(row));
          };
          request.onerror = () => reject(request.error || new Error("Normalized baseline record read failed."));
        });
      } finally {
        database.close();
      }
    }

    async function put(row) {
      const safe = normalizeRow(row);
      await transact([RECORD_STORE], "readwrite", (transaction) => {
        transaction.objectStore(RECORD_STORE).put({
          key: recordKey(ownerId, safe.namespace, safe.record_id),
          ownerId,
          ...cloneJson(safe)
        });
      });
      return cloneJson(safe);
    }

    async function replace(namespace, nextRows, meta = {}) {
      const safeNamespace = requiredText(namespace, "namespace", 64);
      const safeRows = (Array.isArray(nextRows) ? nextRows : []).map(normalizeRow);
      for (const row of safeRows) {
        if (row.namespace !== safeNamespace) throw new TypeError("baseline row namespace mismatch.");
      }
      const safeMeta = normalizeMeta({ ...meta, primed: true });

      const database = await open();
      try {
        await new Promise((resolve, reject) => {
          const transaction = database.transaction([RECORD_STORE, META_STORE], "readwrite");
          const recordStore = transaction.objectStore(RECORD_STORE);
          const cursorRequest = recordStore.index("ownerNamespace").openCursor([ownerId, safeNamespace]);
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (cursor) {
              cursor.delete();
              cursor.continue();
              return;
            }
            for (const row of safeRows) {
              recordStore.put({
                key: recordKey(ownerId, row.namespace, row.record_id),
                ownerId,
                ...cloneJson(row)
              });
            }
            transaction.objectStore(META_STORE).put({
              key: metaKey(ownerId, safeNamespace),
              ownerId,
              namespace: safeNamespace,
              ...safeMeta
            });
          };
          cursorRequest.onerror = () => reject(cursorRequest.error || new Error("Normalized baseline replace failed."));
          transaction.oncomplete = resolve;
          transaction.onerror = () => reject(transaction.error || new Error("Normalized baseline replace transaction failed."));
          transaction.onabort = () => reject(transaction.error || new Error("Normalized baseline replace transaction aborted."));
        });
      } finally {
        database.close();
      }
      return true;
    }

    async function getMeta(namespace) {
      const safeNamespace = requiredText(namespace, "namespace", 64);
      const database = await open();
      try {
        return await new Promise((resolve, reject) => {
          const transaction = database.transaction(META_STORE, "readonly");
          const request = transaction.objectStore(META_STORE).get(metaKey(ownerId, safeNamespace));
          request.onsuccess = () => {
            const entry = request.result;
            if (!entry) return resolve(null);
            const { ownerId: _ownerId, namespace: _namespace, key: _key, ...meta } = entry;
            resolve(cloneJson(meta));
          };
          request.onerror = () => reject(request.error || new Error("Normalized baseline metadata read failed."));
        });
      } finally {
        database.close();
      }
    }

    async function setMeta(namespace, meta = {}) {
      const safeNamespace = requiredText(namespace, "namespace", 64);
      const safe = normalizeMeta(meta);
      await transact([META_STORE], "readwrite", (transaction) => {
        transaction.objectStore(META_STORE).put({
          key: metaKey(ownerId, safeNamespace),
          ownerId,
          namespace: safeNamespace,
          ...safe
        });
      });
      return cloneJson(safe);
    }

    async function isPrimed(namespace) {
      return Boolean((await getMeta(namespace))?.primed);
    }

    return Object.freeze({ list, get, put, replace, getMeta, setMeta, isPrimed });
  }

  return Object.freeze({
    version: VERSION,
    release: RELEASE,
    createMemoryStore,
    createIndexedDbStore
  });
});
