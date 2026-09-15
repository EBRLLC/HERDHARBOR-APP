"use strict";

function reportStorageFailure(monitoring, operation, storageType, error) {
  try {
    monitoring?.captureOperationalFailure?.("storage_failure", {
      module: "backup",
      operation,
      result: "failure",
      storage_type: storageType
    }, error instanceof Error ? error : new Error(`${storageType} operation failed`));
  } catch {}
}

export function installStorageFailureMonitoring(monitoring, runtime = globalThis) {
  const StorageCtor = runtime?.Storage;
  if (!StorageCtor?.prototype || StorageCtor.prototype.__hhMonitoringWrapped) return false;

  const prototype = StorageCtor.prototype;
  const originalSetItem = prototype.setItem;
  const originalRemoveItem = prototype.removeItem;

  if (typeof originalSetItem === "function") {
    prototype.setItem = function monitoredSetItem(key, value) {
      try {
        return originalSetItem.call(this, key, value);
      } catch (error) {
        reportStorageFailure(monitoring, "local_storage_write", "localStorage", error);
        throw error;
      }
    };
  }

  if (typeof originalRemoveItem === "function") {
    prototype.removeItem = function monitoredRemoveItem(key) {
      try {
        return originalRemoveItem.call(this, key);
      } catch (error) {
        reportStorageFailure(monitoring, "local_storage_remove", "localStorage", error);
        throw error;
      }
    };
  }

  Object.defineProperty(prototype, "__hhMonitoringWrapped", {
    configurable: true,
    value: true
  });
  return true;
}

export function installIndexedDbFailureMonitoring(monitoring, runtime = globalThis) {
  let installed = false;

  const FactoryCtor = runtime?.IDBFactory;
  if (FactoryCtor?.prototype && !FactoryCtor.prototype.__hhMonitoringWrapped) {
    const prototype = FactoryCtor.prototype;
    const originalOpen = prototype.open;
    if (typeof originalOpen === "function") {
      prototype.open = function monitoredIndexedDbOpen(...args) {
        let request;
        try {
          request = originalOpen.apply(this, args);
        } catch (error) {
          reportStorageFailure(monitoring, "indexeddb_open", "indexedDB", error);
          throw error;
        }
        try {
          request?.addEventListener?.("error", () => {
            reportStorageFailure(
              monitoring,
              "indexeddb_open",
              "indexedDB",
              request?.error || new Error("IndexedDB open failed")
            );
          }, { once: true });
        } catch {}
        return request;
      };
    }
    Object.defineProperty(prototype, "__hhMonitoringWrapped", {
      configurable: true,
      value: true
    });
    installed = true;
  }

  const DatabaseCtor = runtime?.IDBDatabase;
  if (DatabaseCtor?.prototype && !DatabaseCtor.prototype.__hhMonitoringWrapped) {
    const prototype = DatabaseCtor.prototype;
    const originalTransaction = prototype.transaction;
    if (typeof originalTransaction === "function") {
      prototype.transaction = function monitoredIndexedDbTransaction(...args) {
        let transaction;
        try {
          transaction = originalTransaction.apply(this, args);
        } catch (error) {
          reportStorageFailure(monitoring, "indexeddb_transaction", "indexedDB", error);
          throw error;
        }

        try {
          let reported = false;
          const report = (operation) => {
            if (reported) return;
            reported = true;
            reportStorageFailure(
              monitoring,
              operation,
              "indexedDB",
              transaction?.error || new Error("IndexedDB transaction failed")
            );
          };
          transaction?.addEventListener?.("error", () => report("indexeddb_transaction_error"), { once: true });
          transaction?.addEventListener?.("abort", () => report("indexeddb_transaction_abort"), { once: true });
        } catch {}
        return transaction;
      };
    }
    Object.defineProperty(prototype, "__hhMonitoringWrapped", {
      configurable: true,
      value: true
    });
    installed = true;
  }

  return installed;
}

export function installGeneticsMonitoring(monitoring, runtime = globalThis) {
  const document = runtime?.document;
  if (!document?.addEventListener || document.__hhGeneticsMonitoring) return false;
  Object.defineProperty(document, "__hhGeneticsMonitoring", { configurable: true, value: true });

  document.addEventListener("click", (event) => {
    const pairTrigger = event.target?.closest?.('[data-bi-action="pair"], #v145-run');
    if (!pairTrigger) return;
    try {
      monitoring?.setModule?.("rabbit-genetics");
      monitoring?.addBreadcrumb?.({
        module: "rabbit-genetics",
        action: pairTrigger.id === "v145-run" ? "generate_prediction" : "open_pair_analysis"
      });
    } catch {}
  }, true);

  document.addEventListener("herdharbor:genetics-ready", () => {
    try {
      monitoring?.addBreadcrumb?.({ module: "rabbit-genetics", action: "genetics_engine_ready" });
    } catch {}
  });
  return true;
}

export function installCloudSyncFailureMonitoring(monitoring, runtime = globalThis) {
  const document = runtime?.document;
  if (!document?.addEventListener || document.__hhCloudSyncFailureMonitoring) return false;
  Object.defineProperty(document, "__hhCloudSyncFailureMonitoring", { configurable: true, value: true });

  document.addEventListener("herdharbor:cloud-sync-failure", (event) => {
    try {
      const detail = event?.detail || {};
      const code = String(detail.error_code || "unknown").slice(0, 80);
      const error = new Error(String(detail.message || "Cloud synchronization operation failed.").slice(0, 500));
      error.name = code === "unknown" ? "CloudSyncError" : "CloudSyncError:" + code;
      monitoring?.captureOperationalFailure?.("cloud_sync_failure", {
        module: "sync",
        operation: String(detail.operation || "cloud-sync").slice(0, 80),
        result: "failure",
        error_category: "cloud_sync_failure",
        reason: code,
        status_code: Number.isFinite(Number(detail.status_code)) ? Number(detail.status_code) : 0
      }, error);
    } catch {}
  });
  return true;
}

export function installMonitoringAdapters(monitoring, runtime = globalThis) {
  try { installStorageFailureMonitoring(monitoring, runtime); } catch {}
  try { installIndexedDbFailureMonitoring(monitoring, runtime); } catch {}
  try { installGeneticsMonitoring(monitoring, runtime); } catch {}
  try { installCloudSyncFailureMonitoring(monitoring, runtime); } catch {}
}
