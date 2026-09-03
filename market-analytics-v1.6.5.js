(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborMarket = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const VERSION = "1.6.6";
  const CONSENT_VERSION = "2026-09-v2";
  const MINIMUM_SAMPLE_SIZE = 5;
  const QUEUE_KEY = "herdharbor_market_queue_v1";
  const RECEIPT_KEY = "herdharbor_market_receipts_v1";
  const RETRY_DELAYS_MS = Object.freeze([1800, 5000, 15000, 60000, 300000]);
  const ALLOWED_FACT_FIELDS = Object.freeze([
    "species", "breed", "sex", "age_at_sale_days", "age_bucket", "color_variety",
    "pedigree_status", "registration_status", "listed_price_at_sale", "sale_price",
    "sale_month", "sale_year", "region_country", "region_code", "broad_region",
    "currency", "structured_traits"
  ]);
  const PROHIBITED_FIELDS = Object.freeze([
    "customer_name", "customer_email", "customer_phone", "breeder_name", "farm_name",
    "rabbitry_name", "animal_name", "street_address", "exact_coordinates", "latitude",
    "longitude", "customer_id", "animal_id", "account_id", "user_id", "notes",
    "medical_notes", "pedigree_names", "customer_notes", "transaction_notes", "photos",
    "documents", "payment_reference", "cloud_storage_path", "profile"
  ]);
  const AGGREGATE_FILTER_FIELDS = Object.freeze([
    "species", "breed", "sex", "age_bucket", "color_variety", "pedigree_status",
    "registration_status", "region_country", "region_code", "broad_region",
    "sale_month", "sale_year", "currency", "start", "end"
  ]);
  const QUALIFYING_STATUS = "Completed";
  let flushPromise = null;
  let retryTimer = null;
  let retryAttempt = 0;

  const memory = { queue: [], queueKey: "", receipts: {}, receiptsKey: "" };
  const storage = () => root?.localStorage || null;
  const currentUserId = () => String(root?.HerdHarborCloud?.getSession?.()?.user?.id || "").trim();
  const storageKey = (base) => {
    const cloud = root?.HerdHarborCloud;
    const userId = currentUserId();
    if (cloud && !userId) return null;
    return userId ? `${base}:${userId}` : base;
  };
  const parse = (value, fallback) => {
    try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
  };
  const readQueue = () => {
    const key = storageKey(QUEUE_KEY);
    if (!key) return [];
    const fallback = memory.queueKey === key ? memory.queue : [];
    const value = parse(storage()?.getItem?.(key), fallback);
    memory.queueKey = key;
    memory.queue = Array.isArray(value) ? value : [];
    return memory.queue;
  };
  const writeQueue = (queue) => {
    const key = storageKey(QUEUE_KEY);
    if (!key) return queue;
    memory.queueKey = key;
    memory.queue = queue;
    storage()?.setItem?.(key, JSON.stringify(queue));
    return queue;
  };
  const readReceipts = () => {
    const key = storageKey(RECEIPT_KEY);
    if (!key) return {};
    const fallback = memory.receiptsKey === key ? memory.receipts : {};
    const value = parse(storage()?.getItem?.(key), fallback);
    memory.receiptsKey = key;
    memory.receipts = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return memory.receipts;
  };
  const writeReceipts = (receipts) => {
    const key = storageKey(RECEIPT_KEY);
    if (!key) return receipts;
    memory.receiptsKey = key;
    memory.receipts = receipts;
    storage()?.setItem?.(key, JSON.stringify(receipts));
    return receipts;
  };
  const now = () => new Date().toISOString();
  const itemKey = (saleId, itemId) => `${String(saleId || "")}:${String(itemId || "")}`;

  function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
    return JSON.stringify(value);
  }

  function fingerprint(value) {
    const text = stableStringify(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function sanitizeMarketFact(input = {}) {
    const output = {};
    for (const field of ALLOWED_FACT_FIELDS) {
      if (input[field] !== undefined && input[field] !== null && input[field] !== "") output[field] = input[field];
    }
    return output;
  }

  function sanitizeAggregateFilters(input = {}) {
    const output = {};
    for (const field of AGGREGATE_FILTER_FIELDS) {
      const value = input?.[field];
      if (typeof value !== "string" && typeof value !== "number") continue;
      const text = String(value).trim();
      if (!text) continue;
      if ((field === "start" || field === "end") && !isIsoDate(text)) continue;
      if (field === "sale_month" && (!/^\d{1,2}$/.test(text) || Number(text) < 1 || Number(text) > 12)) continue;
      if (field === "sale_year" && (!/^\d{4}$/.test(text) || Number(text) < 1900 || Number(text) > 2200)) continue;
      output[field] = text.slice(0, 160);
    }
    return output;
  }

  function isIsoDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function getConsent(state = {}) {
    const value = state?.settings?.marketAnalyticsConsent;
    const consentVersion = String(value?.consentVersion || "");
    const currentVersion = consentVersion === CONSENT_VERSION;
    return {
      enabled: value?.enabled === true && currentVersion,
      needsReview: value?.enabled === true && !currentVersion,
      consentVersion,
      enabledAt: String(value?.enabledAt || ""),
      disabledAt: String(value?.disabledAt || ""),
      includeHistorical: currentVersion && value?.includeHistorical === true,
      regionCountry: String(value?.regionCountry || "US").slice(0, 2).toUpperCase(),
      regionCode: String(value?.regionCode || "").slice(0, 32),
      broadRegion: String(value?.broadRegion || "").slice(0, 64)
    };
  }

  function contributionFingerprint(sale, item) {
    return fingerprint({
      saleId: sale?.id, itemId: item?.id, status: sale?.status,
      completedAt: sale?.completedAt || "", saleDate: sale?.saleDate || "",
      animalId: item?.animalId || "", salePrice: item?.salePrice ?? item?.unitPrice ?? "",
      listedPriceAtSale: item?.listedPriceAtSale ?? null, updatedAt: sale?.updatedAt || ""
    });
  }

  function enqueue(entry) {
    const queue = readQueue();
    const key = entry.action === "consent" || entry.action === "account-deletion"
      ? entry.action
      : `${entry.action}:${itemKey(entry.saleId, entry.itemId)}`;
    const next = queue.filter((queued) => {
      const queuedKey = queued.action === "consent" || queued.action === "account-deletion"
        ? queued.action
        : `${queued.action}:${itemKey(queued.saleId, queued.itemId)}`;
      if (queuedKey === key) return false;
      if (["upsert", "withdraw"].includes(entry.action) && ["upsert", "withdraw"].includes(queued.action)) {
        return itemKey(queued.saleId, queued.itemId) !== itemKey(entry.saleId, entry.itemId);
      }
      return true;
    });
    next.push({ ...entry, queuedAt: entry.queuedAt || now() });
    return writeQueue(next);
  }

  function clearContributionQueue() {
    return writeQueue(readQueue().filter((entry) => !["upsert", "withdraw"].includes(entry.action)));
  }

  function cancelRetry() {
    if (retryTimer) root?.clearTimeout?.(retryTimer);
    retryTimer = null;
  }

  function resetRetry() {
    retryAttempt = 0;
    cancelRetry();
  }

  function nextRetryDelay() {
    const delay = RETRY_DELAYS_MS[Math.min(retryAttempt, RETRY_DELAYS_MS.length - 1)];
    retryAttempt += 1;
    return delay;
  }

  function isFutureEligible(sale, consent) {
    if (consent.includeHistorical) return true;
    if (!sale?.completedAt || !consent.enabledAt) return false;
    return new Date(sale.completedAt).getTime() >= new Date(consent.enabledAt).getTime();
  }

  function reconcileSale(sale, previousSale, state) {
    const consent = getConsent(state);
    if (!consent.enabled || consent.consentVersion !== CONSENT_VERSION) return [];
    const queued = [];
    const previousItems = new Map((previousSale?.items || []).map((item) => [item.id, item]));
    const currentItems = new Map((sale?.items || []).map((item) => [item.id, item]));
    const wasCompleted = previousSale?.status === QUALIFYING_STATUS;
    const isCompleted = sale?.status === QUALIFYING_STATUS;

    if (wasCompleted && !isCompleted) {
      for (const item of previousItems.values()) {
        const entry = { action: "withdraw", saleId: previousSale.id, itemId: item.id, fingerprint: contributionFingerprint(previousSale, item), consentVersion: CONSENT_VERSION };
        enqueue(entry); queued.push(entry);
      }
      return queued;
    }

    if (!isCompleted || !isFutureEligible(sale, consent)) return queued;
    for (const item of currentItems.values()) {
      const entry = { action: "upsert", saleId: sale.id, itemId: item.id, fingerprint: contributionFingerprint(sale, item), consentVersion: CONSENT_VERSION };
      const receipt = readReceipts()[itemKey(sale.id, item.id)];
      if (receipt?.fingerprint !== entry.fingerprint) { enqueue(entry); queued.push(entry); }
    }
    if (wasCompleted) {
      for (const item of previousItems.values()) {
        if (currentItems.has(item.id)) continue;
        const entry = { action: "withdraw", saleId: sale.id, itemId: item.id, fingerprint: contributionFingerprint(previousSale, item), consentVersion: CONSENT_VERSION };
        enqueue(entry); queued.push(entry);
      }
    }
    return queued;
  }

  function queueHistoricalCompletedSales(state) {
    const consent = getConsent(state);
    if (!consent.enabled || !consent.includeHistorical) return [];
    return (state.sales || []).flatMap((sale) => sale.status === QUALIFYING_STATUS ? reconcileSale(sale, null, state) : []);
  }

  async function invoke(body) {
    const cloud = root?.HerdHarborCloud;
    if (!cloud?.getSession?.()?.user?.id) throw new Error("Sign in before using Market Analytics.");
    if (!cloud?.invokeFunction) throw new Error("The secure Market Analytics connection is unavailable.");
    return cloud.invokeFunction("market-contribution", body);
  }

  function scheduleFlush(delay = null) {
    cancelRetry();
    const wait = delay === null ? nextRetryDelay() : Math.max(0, Number(delay) || 0);
    retryTimer = root?.setTimeout?.(() => {
      retryTimer = null;
      flush();
    }, wait);
  }

  async function flush() {
    if (flushPromise) return flushPromise;
    const flushUserId = currentUserId();
    if (root?.navigator?.onLine === false || !flushUserId) {
      if (readQueue().length) scheduleFlush();
      return { submitted: 0, pending: readQueue().length };
    }
    flushPromise = (async () => {
      let submitted = 0;
      let failed = false;
      let switched = false;
      for (const entry of [...readQueue()]) {
        if (currentUserId() !== flushUserId) {
          switched = true;
          break;
        }
        try {
          const result = await invoke(entry);
          if (currentUserId() !== flushUserId) {
            switched = true;
            break;
          }
          const queue = readQueue();
          const match = (candidate) => candidate.queuedAt === entry.queuedAt && candidate.action === entry.action && candidate.saleId === entry.saleId && candidate.itemId === entry.itemId;
          writeQueue(queue.filter((candidate) => !match(candidate)));
          if (["upsert", "withdraw"].includes(entry.action)) {
            const receipts = readReceipts(), key = itemKey(entry.saleId, entry.itemId);
            if (entry.action === "withdraw") delete receipts[key];
            else receipts[key] = { fingerprint: entry.fingerprint, processedAt: result?.processedAt || now(), contributionId: result?.contributionId || "" };
            writeReceipts(receipts);
          }
          submitted += 1;
        } catch {
          failed = true;
          break;
        }
      }
      const pending = readQueue().length;
      if (switched) {
        if (pending) scheduleFlush(250);
      } else if (!pending) resetRetry();
      else if (failed) scheduleFlush();
      else scheduleFlush(250);
      return { submitted, pending };
    })().finally(() => { flushPromise = null; });
    return flushPromise;
  }

  function recordSaleChange(sale, previousSale, state) {
    const queued = reconcileSale(sale, previousSale, state);
    if (queued.length) {
      retryAttempt = 0;
      scheduleFlush(250);
    }
    return queued;
  }

  async function setConsent(state, options = {}) {
    state.settings = state.settings || {};
    const previous = getConsent(state);
    const enabled = options.enabled === true;
    const timestamp = now();
    state.settings.marketAnalyticsConsent = {
      enabled,
      consentVersion: CONSENT_VERSION,
      enabledAt: enabled ? (previous.enabled ? (previous.enabledAt || timestamp) : timestamp) : previous.enabledAt,
      disabledAt: enabled ? "" : timestamp,
      includeHistorical: enabled && options.includeHistorical === true,
      regionCountry: String(options.regionCountry || previous.regionCountry || "US").slice(0, 2).toUpperCase(),
      regionCode: String(options.regionCode || previous.regionCode || "").slice(0, 32),
      broadRegion: String(options.broadRegion || previous.broadRegion || "").slice(0, 64)
    };
    if (!enabled) {
      clearContributionQueue();
      writeReceipts({});
      resetRetry();
    }
    enqueue({ action: "consent", consent: { ...state.settings.marketAnalyticsConsent } });
    if (enabled && state.settings.marketAnalyticsConsent.includeHistorical) queueHistoricalCompletedSales(state);
    retryAttempt = 0;
    scheduleFlush(50);
    return state.settings.marketAnalyticsConsent;
  }

  async function queryAggregate(filters = {}) {
    const result = await invoke({ action: "aggregate", filters: sanitizeAggregateFilters(filters) });
    return result || { available: false, minimumSampleSize: MINIMUM_SAMPLE_SIZE };
  }

  async function prepareAccountDeletion() {
    clearContributionQueue();
    writeReceipts({});
    resetRetry();
    let backendConfirmed = false;
    try {
      await invoke({ action: "account-deletion" });
      backendConfirmed = true;
    } catch {
      // The user's canonical deletion request must still proceed. Backend deletion also cascades by user id.
    }
    return { backendConfirmed, localQueueCleared: true };
  }

  function resetForTests() {
    const queueKey = storageKey(QUEUE_KEY);
    const receiptsKey = storageKey(RECEIPT_KEY);
    memory.queue = [];
    memory.queueKey = "";
    memory.receipts = {};
    memory.receiptsKey = "";
    resetRetry();
    storage()?.removeItem?.(QUEUE_KEY);
    storage()?.removeItem?.(RECEIPT_KEY);
    if (queueKey && queueKey !== QUEUE_KEY) storage()?.removeItem?.(queueKey);
    if (receiptsKey && receiptsKey !== RECEIPT_KEY) storage()?.removeItem?.(receiptsKey);
  }

  function retryNow() {
    retryAttempt = 0;
    cancelRetry();
    return flush();
  }

  root?.addEventListener?.("online", retryNow);
  root?.addEventListener?.("focus", retryNow);
  root?.document?.addEventListener?.("herdharbor:sync-status", (event) => {
    if (event?.detail?.signedIn && event?.detail?.online !== false && event?.detail?.unsynced === false && readQueue().length) retryNow();
  });

  return {
    VERSION, CONSENT_VERSION, MINIMUM_SAMPLE_SIZE, QUEUE_KEY, RECEIPT_KEY, RETRY_DELAYS_MS,
    ALLOWED_FACT_FIELDS, PROHIBITED_FIELDS, AGGREGATE_FILTER_FIELDS, QUALIFYING_STATUS, stableStringify,
    fingerprint, sanitizeMarketFact, sanitizeAggregateFilters, getConsent, contributionFingerprint, readQueue,
    readReceipts, enqueue, clearContributionQueue, isFutureEligible, reconcileSale,
    queueHistoricalCompletedSales, recordSaleChange, setConsent, flush, queryAggregate,
    prepareAccountDeletion, resetForTests, retryNow
  };
});
