import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, value) {
  fs.writeFileSync(path, value, "utf8");
}

function replaceOnce(path, before, after, label) {
  const source = read(path);
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: target not found in ${path}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${label}: target is not unique in ${path}`);
  }
  write(path, source.slice(0, first) + after + source.slice(first + before.length));
}

replaceOnce(
  "herdharbor-cloud.js",
  "  const SYNC_DELAY_MS = 700;\n",
  "  const SYNC_DELAY_MS = 2500;\n  const LARGE_STATE_SYNC_DELAY_MS = 5000;\n  const LARGE_STATE_THRESHOLD_CHARS = 750000;\n",
  "sync debounce constants"
);

replaceOnce(
  "herdharbor-cloud.js",
  `  function reportAccountOperationFailure(operation) {\n    document.dispatchEvent(new CustomEvent("herdharbor:account-operation-failure", {\n      detail: { operation, result: "failure" }\n    }));\n  }\n`,
  `  function reportAccountOperationFailure(operation) {\n    document.dispatchEvent(new CustomEvent("herdharbor:account-operation-failure", {\n      detail: { operation, result: "failure" }\n    }));\n  }\n\n  function normalizeCloudFailure(error) {\n    const code = String(error?.code || error?.name || "unknown").slice(0, 80);\n    const numericStatus = Number(error?.status || error?.statusCode || 0);\n    return {\n      code,\n      status: Number.isFinite(numericStatus) && numericStatus > 0 ? numericStatus : null,\n      message: String(error?.message || "Cloud synchronization operation failed.").slice(0, 500)\n    };\n  }\n\n  function reportCloudSyncFailure(operation, error) {\n    const failure = normalizeCloudFailure(error);\n    try {\n      document.dispatchEvent(new CustomEvent("herdharbor:cloud-sync-failure", {\n        detail: {\n          operation: String(operation || "cloud-sync").slice(0, 80),\n          result: "failure",\n          error_code: failure.code,\n          status_code: failure.status,\n          message: failure.message\n        }\n      }));\n    } catch {}\n    return failure;\n  }\n`,
  "cloud failure reporter"
);

replaceOnce(
  "herdharbor-cloud.js",
  `    if (loadError) {\n      console.error("HerdHarbor cloud preflight failed:", loadError);\n      setSyncState("Cloud unavailable; changes are safe on this device and will retry.", "error");\n      return false;\n    }\n`,
  `    if (loadError) {\n      const failure = reportCloudSyncFailure("cloud-preflight", loadError);\n      console.error("HerdHarbor cloud preflight failed:", loadError);\n      console.warn("HerdHarbor cloud preflight diagnostic:", failure.code, failure.status || "no-status");\n      setSyncState("Cloud unavailable; changes are safe on this device and will retry.", "error");\n      return false;\n    }\n`,
  "preflight failure diagnostics"
);

replaceOnce(
  "herdharbor-cloud.js",
  `    const { data: savedRecord, error, raced } = await writeCloudRecord(\n      userId,\n      appState,\n      remoteRecord || null\n    );\n`,
  `    if (sequence < writeSequence && pendingSync && !options.force) {\n      setSyncState("Newer changes queued; saving the latest copy…", "working");\n      return true;\n    }\n\n    const { data: savedRecord, error, raced } = await writeCloudRecord(\n      userId,\n      appState,\n      remoteRecord || null\n    );\n`,
  "stale write suppression"
);

replaceOnce(
  "herdharbor-cloud.js",
  `    if (error) {\n      console.error("HerdHarbor cloud save failed:", error);\n      setSyncState("Cloud save failed; changes are safe on this device and will retry.", "error");\n      return false;\n    }\n`,
  `    if (error) {\n      const failure = reportCloudSyncFailure("cloud-save", error);\n      console.error("HerdHarbor cloud save failed:", error);\n      console.warn("HerdHarbor cloud save diagnostic:", failure.code, failure.status || "no-status");\n      setSyncState("Cloud save failed; changes are safe on this device and will retry.", "error");\n      return false;\n    }\n`,
  "save failure diagnostics"
);

replaceOnce(
  "herdharbor-cloud.js",
  `  function scheduleCloudSync(rawValue, sequence = writeSequence) {\n    clearTimeout(syncTimer);\n    pendingSync = { rawValue, sequence };\n    syncTimer = setTimeout(() => {\n      drainSyncQueue();\n    }, SYNC_DELAY_MS);\n  }\n`,
  `  function scheduleCloudSync(rawValue, sequence = writeSequence) {\n    clearTimeout(syncTimer);\n    pendingSync = { rawValue, sequence };\n    const delay = String(rawValue || "").length >= LARGE_STATE_THRESHOLD_CHARS\n      ? LARGE_STATE_SYNC_DELAY_MS\n      : SYNC_DELAY_MS;\n    syncTimer = setTimeout(() => {\n      drainSyncQueue();\n    }, delay);\n  }\n`,
  "adaptive sync debounce"
);

replaceOnce(
  "cloud-sync-v2-flow-v1.8.2.js",
  "  const RETRY_DELAYS_MS = [1500, 4000, 10000, 30000];\n  const MAX_VISIBLE_RETRY_MS = 30000;\n",
  "  const RETRY_DELAYS_MS = [3000, 10000, 30000, 120000];\n  const MAX_VISIBLE_RETRY_MS = 120000;\n",
  "retry backoff"
);

replaceOnce(
  "monitoring/herdharbor-monitoring-instrumentation.mjs",
  `export function installMonitoringAdapters(monitoring, runtime = globalThis) {\n  try { installStorageFailureMonitoring(monitoring, runtime); } catch {}\n  try { installIndexedDbFailureMonitoring(monitoring, runtime); } catch {}\n  try { installGeneticsMonitoring(monitoring, runtime); } catch {}\n}\n`,
  `export function installCloudSyncFailureMonitoring(monitoring, runtime = globalThis) {\n  const document = runtime?.document;\n  if (!document?.addEventListener || document.__hhCloudSyncFailureMonitoring) return false;\n  Object.defineProperty(document, "__hhCloudSyncFailureMonitoring", { configurable: true, value: true });\n\n  document.addEventListener("herdharbor:cloud-sync-failure", (event) => {\n    try {\n      const detail = event?.detail || {};\n      const code = String(detail.error_code || "unknown").slice(0, 80);\n      const error = new Error(String(detail.message || "Cloud synchronization operation failed.").slice(0, 500));\n      error.name = code === "unknown" ? "CloudSyncError" : `CloudSyncError:${code}`;\n      monitoring?.captureOperationalFailure?.("cloud_sync_failure", {\n        module: "sync",\n        operation: String(detail.operation || "cloud-sync").slice(0, 80),\n        result: "failure",\n        error_category: "cloud_sync_failure",\n        reason: code,\n        status_code: Number.isFinite(Number(detail.status_code)) ? Number(detail.status_code) : 0\n      }, error);\n    } catch {}\n  });\n  return true;\n}\n\nexport function installMonitoringAdapters(monitoring, runtime = globalThis) {\n  try { installStorageFailureMonitoring(monitoring, runtime); } catch {}\n  try { installIndexedDbFailureMonitoring(monitoring, runtime); } catch {}\n  try { installGeneticsMonitoring(monitoring, runtime); } catch {}\n  try { installCloudSyncFailureMonitoring(monitoring, runtime); } catch {}\n}\n`,
  "cloud sync monitoring adapter"
);

write("tests/cloud-sync-hotfix-v1.8.2.test.cjs", `"use strict";\n\nconst test = require("node:test");\nconst assert = require("node:assert/strict");\nconst fs = require("node:fs");\nconst path = require("node:path");\n\nconst root = path.resolve(__dirname, "..");\nconst cloud = fs.readFileSync(path.join(root, "herdharbor-cloud.js"), "utf8");\nconst flow = fs.readFileSync(path.join(root, "cloud-sync-v2-flow-v1.8.2.js"), "utf8");\nconst instrumentation = fs.readFileSync(path.join(root, "monitoring", "herdharbor-monitoring-instrumentation.mjs"), "utf8");\n\ntest("cloud hotfix debounces large full-state saves and suppresses stale queued writes", () => {\n  assert.match(cloud, /const SYNC_DELAY_MS = 2500/);\n  assert.match(cloud, /const LARGE_STATE_SYNC_DELAY_MS = 5000/);\n  assert.match(cloud, /LARGE_STATE_THRESHOLD_CHARS = 750000/);\n  assert.match(cloud, /sequence < writeSequence && pendingSync && !options\\.force/);\n  assert.match(cloud, /Newer changes queued; saving the latest copy/);\n});\n\ntest("cloud hotfix preserves provider failure code and message without sending app state", () => {\n  assert.match(cloud, /herdharbor:cloud-sync-failure/);\n  assert.match(cloud, /error_code: failure\\.code/);\n  assert.match(cloud, /status_code: failure\\.status/);\n  assert.match(cloud, /message: failure\\.message/);\n  const reporter = cloud.slice(cloud.indexOf("function reportCloudSyncFailure"), cloud.indexOf("async function loadAccessProfile"));\n  assert.doesNotMatch(reporter, /app_state|rawValue|payload/);\n});\n\ntest("cloud hotfix backs retries off to two minutes", () => {\n  assert.match(flow, /RETRY_DELAYS_MS = \\[3000, 10000, 30000, 120000\\]/);\n  assert.match(flow, /MAX_VISIBLE_RETRY_MS = 120000/);\n});\n\ntest("monitoring captures the original cloud provider error through the privacy adapter", () => {\n  assert.match(instrumentation, /installCloudSyncFailureMonitoring/);\n  assert.match(instrumentation, /herdharbor:cloud-sync-failure/);\n  assert.match(instrumentation, /captureOperationalFailure\\?\\.\\("cloud_sync_failure"/);\n  assert.match(instrumentation, /reason: code/);\n});\n`);

console.log("Cloud sync v1.8.2 hotfix applied.");
