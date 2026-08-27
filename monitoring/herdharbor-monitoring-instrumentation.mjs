"use strict";

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
        try {
          monitoring?.captureOperationalFailure?.("storage_failure", {
            module: "backup",
            operation: "local_storage_write",
            result: "failure",
            storage_type: "localStorage"
          }, error);
        } catch {}
        throw error;
      }
    };
  }

  if (typeof originalRemoveItem === "function") {
    prototype.removeItem = function monitoredRemoveItem(key) {
      try {
        return originalRemoveItem.call(this, key);
      } catch (error) {
        try {
          monitoring?.captureOperationalFailure?.("storage_failure", {
            module: "backup",
            operation: "local_storage_remove",
            result: "failure",
            storage_type: "localStorage"
          }, error);
        } catch {}
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

export function installMonitoringAdapters(monitoring, runtime = globalThis) {
  try { installStorageFailureMonitoring(monitoring, runtime); } catch {}
  try { installGeneticsMonitoring(monitoring, runtime); } catch {}
}
