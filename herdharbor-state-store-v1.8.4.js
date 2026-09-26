(function (root, factory) {
  "use strict";
  const moduleApi = factory();
  if (typeof module === "object" && module.exports) module.exports = moduleApi;
  if (root?.localStorage) {
    root.HerdHarborStateStore = moduleApi.create({
      root,
      storage: root.localStorage,
      indexedDB: root.indexedDB
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "1.0";
  const RELEASE = "1.8.4";
  const STATE_KEY = "herdharbor_pre_alpha_v1";
  const ACTIVE_OWNER_KEY = "herdharbor_active_user_v1";
  const PREPARED_TXN_KEY = "herdharbor_state_txn_v1";
  const REVISION_PREFIX = "herdharbor_state_revision_v1_";
  const OUTBOX_PREFIX = "herdharbor_state_outbox_v1_";
  const RECORD_VERSION_PREFIX = "herdharbor_record_versions_v1_";
  const OUTBOX_DB_NAME = "herdharbor_state_store_v1";
  const OUTBOX_DB_VERSION = 1;
  const OUTBOX_STORE = "outbox";
  const META_STORE = "meta";
  const IDENTITY_KEYS = Object.freeze(["id", "uuid", "recordId", "record_id", "key"]);
  const DEVICE_LOCAL_SETTINGS = Object.freeze(new Set(["theme", "sidebarCollapsed"]));

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function cloneJson(value, fallback = null) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return fallback;
    }
  }

  function safeParse(rawValue) {
    if (!rawValue || typeof rawValue !== "string") return null;
    try {
      const value = JSON.parse(rawValue);
      return value && typeof value === "object" ? value : null;
    } catch {
      return null;
    }
  }

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (isPlainObject(value)) {
      return Object.keys(value).sort().reduce((result, key) => {
        result[key] = stableValue(value[key]);
        return result;
      }, {});
    }
    return value;
  }

  function stableStringify(value) {
    return JSON.stringify(stableValue(value));
  }

  function checksumText(text) {
    let left = 0x811c9dc5;
    let right = 0x9e3779b9;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      left ^= code;
      left = Math.imul(left, 0x01000193) >>> 0;
      right ^= code + index;
      right = Math.imul(right, 0x85ebca6b) >>> 0;
    }
    return `${left.toString(16).padStart(8, "0")}${right.toString(16).padStart(8, "0")}`;
  }

  function token(value) {
    const safe = String(value == null ? "" : value)
      .trim()
      .replace(/[^a-zA-Z0-9_.:-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return safe.slice(0, 120) || "record";
  }

  function mutationToken(value) {
    const raw = String(value == null ? "" : value).trim();
    const safe = raw
      .replace(/[^a-zA-Z0-9_.:-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96) || "record";
    return `${safe}-${checksumText(raw)}`;
  }

  function ownerToken(value) {
    return token(value || "local");
  }

  function cloudComparableState(state) {
    const safe = cloneJson(state, {});
    if (!isPlainObject(safe)) return {};
    if (isPlainObject(safe.settings)) {
      DEVICE_LOCAL_SETTINGS.forEach((key) => {
        delete safe.settings[key];
      });
      if (!Object.keys(safe.settings).length) delete safe.settings;
    }
    return safe;
  }

  function recordIdentity(value) {
    if (!isPlainObject(value)) return "";
    for (const key of IDENTITY_KEYS) {
      const candidate = value[key];
      if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
        return String(candidate);
      }
    }
    return "";
  }

  function versionLookup(recordVersions, domain, recordId) {
    const domainMap = isPlainObject(recordVersions?.[domain]) ? recordVersions[domain] : {};
    const value = domainMap[recordId];
    return value === undefined || value === null || value === "" ? null : value;
  }

  function mutationMetadata({
    ownerId,
    revision,
    domain,
    recordId,
    operation,
    expectedCloudVersion,
    createdAt
  }) {
    return Object.freeze({
      mutationId: `hhm:${ownerToken(ownerId)}:${revision}:${mutationToken(domain)}:${mutationToken(recordId)}:${operation}`,
      ownerId: ownerId || "local",
      domain,
      recordId,
      operation,
      expectedCloudVersion: expectedCloudVersion ?? null,
      localRevision: revision,
      createdAt,
      retryState: "pending",
      retryCount: 0,
      nextRetryAt: null,
      lastErrorClass: null
    });
  }

  function sectionMutation(previousValue, nextValue, context) {
    const operation = previousValue === undefined
      ? "create"
      : nextValue === undefined
        ? "delete"
        : "update";
    return mutationMetadata({
      ...context,
      recordId: "$section",
      operation,
      expectedCloudVersion: versionLookup(context.recordVersions, context.domain, "$section")
    });
  }

  function diffArray(previousValue, nextValue, context) {
    const previous = Array.isArray(previousValue) ? previousValue : [];
    const next = Array.isArray(nextValue) ? nextValue : [];
    const previousIds = previous.map(recordIdentity);
    const nextIds = next.map(recordIdentity);
    const allIdentified = [...previousIds, ...nextIds].every(Boolean);
    const uniquePrevious = new Set(previousIds);
    const uniqueNext = new Set(nextIds);

    if (!allIdentified || uniquePrevious.size !== previousIds.length || uniqueNext.size !== nextIds.length) {
      return [sectionMutation(previousValue, nextValue, context)];
    }

    const before = new Map(previous.map((record) => [recordIdentity(record), record]));
    const after = new Map(next.map((record) => [recordIdentity(record), record]));
    const mutations = [];
    const ids = [...new Set([...before.keys(), ...after.keys()])].sort();
    const addedIds = ids.filter((recordId) => !before.has(recordId) && after.has(recordId));
    const removedIds = ids.filter((recordId) => before.has(recordId) && !after.has(recordId));

    // A same-commit membership replacement (for example a capped activity
    // list adding the newest entry while dropping the oldest) must be planned
    // as one domain transaction. Emitting independent create/delete/$order
    // mutations lets sibling CAS operations race the shared array manifest.
    if (addedIds.length && removedIds.length) {
      return [mutationMetadata({
        ...context,
        recordId: "$section",
        operation: "update",
        expectedCloudVersion: null
      })];
    }

    for (const recordId of ids) {
      const oldRecord = before.get(recordId);
      const newRecord = after.get(recordId);
      if (oldRecord !== undefined && newRecord !== undefined && stableStringify(oldRecord) === stableStringify(newRecord)) continue;
      const operation = oldRecord === undefined ? "create" : newRecord === undefined ? "delete" : "update";
      mutations.push(mutationMetadata({
        ...context,
        recordId,
        operation,
        expectedCloudVersion: versionLookup(context.recordVersions, context.domain, recordId)
      }));
    }

    if (
      previousIds.length === nextIds.length &&
      previousIds.some((recordId, index) => recordId !== nextIds[index])
    ) {
      mutations.push(mutationMetadata({
        ...context,
        recordId: "$order",
        operation: "update",
        expectedCloudVersion: versionLookup(context.recordVersions, context.domain, "$order")
      }));
    }
    return mutations;
  }

  function diffMutations(previousState, nextState, options = {}) {
    const previous = cloudComparableState(previousState);
    const next = cloudComparableState(nextState);
    const ownerId = String(options.ownerId || "local");
    const revision = Math.max(1, Number(options.revision || 1));
    const createdAt = String(options.createdAt || new Date().toISOString());
    const recordVersions = isPlainObject(options.recordVersions) ? options.recordVersions : {};
    const keys = [...new Set([...Object.keys(previous), ...Object.keys(next)])].sort();
    const mutations = [];

    for (const domain of keys) {
      const before = previous[domain];
      const after = next[domain];
      if (stableStringify(before) === stableStringify(after)) continue;
      const context = { ownerId, revision, createdAt, domain, recordVersions };
      if (Array.isArray(before) || Array.isArray(after)) {
        mutations.push(...diffArray(before, after, context));
      } else {
        mutations.push(sectionMutation(before, after, context));
      }
    }

    return mutations;
  }

  function create(options = {}) {
    const root = options.root || null;
    const storage = options.storage || root?.localStorage || null;
    const indexedDB = options.indexedDB || root?.indexedDB || null;
    const now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
    const listeners = new Set();

    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
      throw new Error("HerdHarborStateStore requires a localStorage-compatible durable store.");
    }

    const activeOwnerId = () => {
      try {
        return String(storage.getItem(ACTIVE_OWNER_KEY) || "local");
      } catch {
        return "local";
      }
    };

    const revisionKey = (ownerId = activeOwnerId()) => `${REVISION_PREFIX}${ownerToken(ownerId)}`;
    const outboxKey = (ownerId = activeOwnerId()) => `${OUTBOX_PREFIX}${ownerToken(ownerId)}`;
    const recordVersionKey = (ownerId = activeOwnerId()) => `${RECORD_VERSION_PREFIX}${ownerToken(ownerId)}`;

    function getRaw() {
      try {
        return storage.getItem(STATE_KEY) || "";
      } catch {
        return "";
      }
    }

    function getState() {
      return cloneJson(safeParse(getRaw()), null);
    }

    function getRevision(ownerId = activeOwnerId()) {
      try {
        return Math.max(0, Number(storage.getItem(revisionKey(ownerId)) || 0));
      } catch {
        return 0;
      }
    }

    function readRecordVersions(ownerId = activeOwnerId()) {
      try {
        const parsed = safeParse(storage.getItem(recordVersionKey(ownerId)));
        return isPlainObject(parsed) ? parsed : {};
      } catch {
        return {};
      }
    }

    function writeRecordVersions(ownerId, versions) {
      storage.setItem(recordVersionKey(ownerId), JSON.stringify(versions || {}));
      return true;
    }

    function getRecordVersion(domain, recordId, ownerId = activeOwnerId()) {
      return versionLookup(readRecordVersions(ownerId), String(domain || ""), String(recordId || ""));
    }

    function setRecordVersion(domain, recordId, version, ownerId = activeOwnerId()) {
      const safeDomain = String(domain || "").trim();
      const safeRecordId = String(recordId || "").trim();
      if (!safeDomain || !safeRecordId) return false;
      const versions = readRecordVersions(ownerId);
      versions[safeDomain] = isPlainObject(versions[safeDomain]) ? versions[safeDomain] : {};
      if (version === undefined || version === null || version === "") delete versions[safeDomain][safeRecordId];
      else versions[safeDomain][safeRecordId] = version;
      return writeRecordVersions(ownerId, versions);
    }

    function readOutbox(ownerId = activeOwnerId()) {
      try {
        const value = JSON.parse(storage.getItem(outboxKey(ownerId)) || "[]");
        return Array.isArray(value) ? value.filter((entry) => entry && entry.mutationId) : [];
      } catch {
        return [];
      }
    }

    function writeOutbox(ownerId, mutations) {
      storage.setItem(outboxKey(ownerId), JSON.stringify(mutations || []));
      return true;
    }

    function appendOutbox(ownerId, mutations) {
      if (!Array.isArray(mutations) || !mutations.length) return readOutbox(ownerId);
      const current = readOutbox(ownerId);
      const byId = new Map(current.map((entry) => [entry.mutationId, entry]));
      mutations.forEach((entry) => {
        if (entry?.mutationId) byId.set(entry.mutationId, cloneJson(entry, entry));
      });
      const next = [...byId.values()].sort((left, right) =>
        Number(left.localRevision || 0) - Number(right.localRevision || 0) ||
        String(left.mutationId).localeCompare(String(right.mutationId))
      );
      writeOutbox(ownerId, next);
      return next;
    }

    function openOutboxDb() {
      return new Promise((resolve, reject) => {
        if (!indexedDB?.open) return resolve(null);
        const request = indexedDB.open(OUTBOX_DB_NAME, OUTBOX_DB_VERSION);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(OUTBOX_STORE)) {
            const store = database.createObjectStore(OUTBOX_STORE, { keyPath: "mutationId" });
            store.createIndex("ownerId", "ownerId");
            store.createIndex("retryState", "retryState");
          }
          if (!database.objectStoreNames.contains(META_STORE)) {
            database.createObjectStore(META_STORE, { keyPath: "key" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("State outbox database could not open."));
      });
    }

    async function mirrorOutboxEntries(mutations) {
      if (!Array.isArray(mutations) || !mutations.length) return false;
      try {
        const database = await openOutboxDb();
        if (!database) return false;
        await new Promise((resolve, reject) => {
          const transaction = database.transaction(OUTBOX_STORE, "readwrite");
          const store = transaction.objectStore(OUTBOX_STORE);
          mutations.forEach((entry) => store.put(cloneJson(entry, entry)));
          transaction.oncomplete = resolve;
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
        database.close();
        return true;
      } catch {
        return false;
      }
    }

    async function mirrorOutboxDeletes(mutationIds) {
      if (!Array.isArray(mutationIds) || !mutationIds.length) return false;
      try {
        const database = await openOutboxDb();
        if (!database) return false;
        await new Promise((resolve, reject) => {
          const transaction = database.transaction(OUTBOX_STORE, "readwrite");
          const store = transaction.objectStore(OUTBOX_STORE);
          mutationIds.forEach((mutationId) => store.delete(mutationId));
          transaction.oncomplete = resolve;
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
        database.close();
        return true;
      } catch {
        return false;
      }
    }

    function dispatchMetadata(detail) {
      try {
        root?.dispatchEvent?.(new root.CustomEvent("herdharbor:state-committed", {
          detail: {
            source: detail.source,
            ownerIdPresent: Boolean(detail.ownerId),
            revision: detail.revision,
            cloudRelevant: detail.cloudRelevant,
            mutationCount: detail.mutations.length
          }
        }));
      } catch {}
    }

    function notify(detail) {
      listeners.forEach((listener) => {
        try {
          listener(detail);
        } catch {}
      });
      dispatchMetadata(detail);
    }

    function recoverPreparedTransaction() {
      let transaction;
      try {
        transaction = JSON.parse(storage.getItem(PREPARED_TXN_KEY) || "null");
      } catch {
        transaction = null;
      }
      if (!transaction || !transaction.nextChecksum) return false;

      const currentRaw = getRaw();
      if (currentRaw && checksumText(currentRaw) === transaction.nextChecksum) {
        const ownerId = String(transaction.ownerId || "local");
        const revision = Math.max(getRevision(ownerId), Number(transaction.revision || 0));
        try {
          storage.setItem(revisionKey(ownerId), String(revision));
          appendOutbox(ownerId, Array.isArray(transaction.mutations) ? transaction.mutations : []);
          storage.removeItem(PREPARED_TXN_KEY);
          void mirrorOutboxEntries(transaction.mutations || []);
          return true;
        } catch {
          return false;
        }
      }

      try {
        storage.removeItem(PREPARED_TXN_KEY);
      } catch {}
      return false;
    }

    function commit(nextState, commitOptions = {}) {
      recoverPreparedTransaction();
      const rawValue = JSON.stringify(nextState && typeof nextState === "object" ? nextState : {});
      const previousRaw = getRaw();
      if (previousRaw === rawValue) {
        return {
          ok: true,
          changed: false,
          rawValue,
          previousRaw,
          revision: getRevision(),
          mutations: [],
          cloudRelevant: false
        };
      }

      const source = String(commitOptions.source || "local");
      const reason = String(commitOptions.reason || "state-save").slice(0, 160);
      const ownerId = String(commitOptions.ownerId || activeOwnerId());
      const revision = getRevision(ownerId) + 1;
      const createdAt = now();
      const previousState = safeParse(previousRaw) || {};
      const nextComparable = safeParse(rawValue) || {};
      const recordVersions = readRecordVersions(ownerId);
      const mutations = source === "local" && commitOptions.cloudRelevant !== false
        ? diffMutations(previousState, nextComparable, { ownerId, revision, createdAt, recordVersions })
        : [];
      const transaction = {
        schemaVersion: 1,
        ownerId,
        revision,
        createdAt,
        nextChecksum: checksumText(rawValue),
        mutations
      };

      try {
        storage.setItem(PREPARED_TXN_KEY, JSON.stringify(transaction));
        storage.setItem(STATE_KEY, rawValue);
      } catch (error) {
        try { storage.removeItem(PREPARED_TXN_KEY); } catch {}
        return { ok: false, changed: false, error, rawValue: previousRaw, previousRaw, revision: getRevision(ownerId), mutations: [] };
      }

      let outboxRecoveryPending = false;
      try {
        storage.setItem(revisionKey(ownerId), String(revision));
        appendOutbox(ownerId, mutations);
        storage.removeItem(PREPARED_TXN_KEY);
      } catch {
        outboxRecoveryPending = true;
      }

      void mirrorOutboxEntries(mutations);
      const detail = Object.freeze({
        source,
        reason,
        ownerId,
        revision,
        rawValue,
        previousRaw,
        mutations: Object.freeze(mutations.map((entry) => Object.freeze({ ...entry }))),
        cloudRelevant: mutations.length > 0,
        outboxRecoveryPending
      });
      notify(detail);
      return { ok: true, changed: true, ...detail };
    }

    function replaceRaw(rawValue, replaceOptions = {}) {
      recoverPreparedTransaction();
      const source = String(replaceOptions.source || "cloud");
      const reason = String(replaceOptions.reason || "compatibility-replace").slice(0, 160);
      const previousRaw = getRaw();
      try {
        if (rawValue === null || rawValue === undefined || rawValue === "") {
          storage.removeItem(STATE_KEY);
        } else {
          if (!safeParse(String(rawValue))) throw new Error("Compatibility snapshot must be valid JSON state.");
          storage.setItem(STATE_KEY, String(rawValue));
        }
      } catch (error) {
        return { ok: false, changed: false, error, rawValue: previousRaw, previousRaw };
      }
      const nextRaw = getRaw();
      if (replaceOptions.notify === true && nextRaw !== previousRaw) {
        notify(Object.freeze({
          source,
          reason,
          ownerId: activeOwnerId(),
          revision: getRevision(),
          rawValue: nextRaw,
          previousRaw,
          mutations: Object.freeze([]),
          cloudRelevant: false,
          outboxRecoveryPending: false
        }));
      }
      return { ok: true, changed: nextRaw !== previousRaw, rawValue: nextRaw, previousRaw };
    }

    function clear(clearOptions = {}) {
      return commit({}, {
        ...clearOptions,
        source: clearOptions.source || "local",
        reason: clearOptions.reason || "state-clear"
      });
    }

    function subscribe(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    }

    function acknowledgeMutations(mutationIds, ownerId = activeOwnerId()) {
      const ids = new Set((Array.isArray(mutationIds) ? mutationIds : [mutationIds]).filter(Boolean).map(String));
      if (!ids.size) return false;
      const current = readOutbox(ownerId);
      const next = current.filter((entry) => !ids.has(String(entry.mutationId)));
      if (next.length === current.length) return false;
      writeOutbox(ownerId, next);
      void mirrorOutboxDeletes([...ids]);
      return true;
    }

    function acknowledgeMutation(mutationId, ownerId = activeOwnerId()) {
      return acknowledgeMutations([mutationId], ownerId);
    }

    function markMutationRetry(mutationId, retry = {}, ownerId = activeOwnerId()) {
      const current = readOutbox(ownerId);
      let changed = false;
      const next = current.map((entry) => {
        if (String(entry.mutationId) !== String(mutationId)) return entry;
        changed = true;
        return {
          ...entry,
          retryState: String(retry.retryState || "retry"),
          retryCount: Math.max(Number(entry.retryCount || 0) + 1, Number(retry.retryCount || 0)),
          nextRetryAt: retry.nextRetryAt || null,
          lastErrorClass: retry.lastErrorClass || null,
          lastConflictFields: Array.isArray(retry.conflictFields)
            ? retry.conflictFields.map((field) => String(field).slice(0, 160)).slice(0, 40)
            : (entry.lastConflictFields || []),
          lastAttemptAt: retry.lastAttemptAt || now()
        };
      });
      if (!changed) return false;
      writeOutbox(ownerId, next);
      void mirrorOutboxEntries(next.filter((entry) => String(entry.mutationId) === String(mutationId)));
      return true;
    }

    function load() {
      recoverPreparedTransaction();
      return getState();
    }

    recoverPreparedTransaction();

    return Object.freeze({
      version: VERSION,
      release: RELEASE,
      stateKey: STATE_KEY,
      load,
      getState,
      getRaw,
      getRevision,
      commit,
      clear,
      replaceRaw,
      compatibilitySnapshot: getRaw,
      subscribe,
      getOutbox: readOutbox,
      acknowledgeMutation,
      acknowledgeMutations,
      markMutationRetry,
      getRecordVersion,
      setRecordVersion,
      recoverPreparedTransaction
    });
  }

  return Object.freeze({
    version: VERSION,
    release: RELEASE,
    stateKey: STATE_KEY,
    deviceLocalSettings: Object.freeze([...DEVICE_LOCAL_SETTINGS]),
    cloudComparableState,
    diffMutations,
    safeParse,
    stableStringify,
    create
  });
});
