(() => {
  "use strict";

  const ASSETS = Object.freeze({
    jszip: "vendor/jszip-3.10.1.min.js",
    exceljs: "vendor/exceljs-4.4.0.min.js",
    spreadsheet: "spreadsheet-import.js?v=17",
    qr: "vendor/qrcode-generator-1.4.4.js",
    voiceAi: "voice-assisted-entry-v1.8.3.js?v=1",
    photoAi: "photo-assisted-entry-v1.8.3.js?v=2"
  });

  const AI_TESTER_KEY = "herdharbor_ai_live_tester_v1";

  const inFlight = new Map();

  function absoluteUrl(path) {
    return new URL(path, document.baseURI || window.location.href).href;
  }

  function existingScript(src) {
    return Array.from(document.scripts || []).find((script) => script.src === src) || null;
  }

  function loadScript(path, label, validate) {
    if (validate()) return Promise.resolve();

    const src = absoluteUrl(path);
    const pending = inFlight.get(src);
    if (pending) return pending;

    let script = existingScript(src);
    if (script && script.dataset?.hhOptionalState !== "loading") {
      script.remove();
      script = null;
    }

    const promise = new Promise((resolve, reject) => {
      const node = script || document.createElement("script");
      const fail = (message) => reject(new Error(message));

      const onLoad = () => {
        if (!validate()) {
          fail(label + " loaded but did not publish its expected API.");
          return;
        }
        node.dataset.hhOptionalState = "loaded";
        resolve();
      };

      const onError = () => fail(label + " could not be loaded. Check your connection and try again.");

      node.addEventListener("load", onLoad, { once: true });
      node.addEventListener("error", onError, { once: true });

      if (!script) {
        node.src = src;
        node.async = false;
        node.dataset.hhOptionalTool = label;
        node.dataset.hhOptionalState = "loading";
        (document.head || document.body || document.documentElement).appendChild(node);
      }
    })
      .catch((error) => {
        const failed = existingScript(src);
        if (failed?.dataset?.hhOptionalTool) {
          failed.dataset.hhOptionalState = "failed";
          failed.remove();
        }
        throw error;
      })
      .finally(() => {
        inFlight.delete(src);
      });

    inFlight.set(src, promise);
    return promise;
  }

  function spreadsheetApiReady() {
    const api = window.HerdHarborSpreadsheet;
    return Boolean(
      api &&
      typeof api.openImport === "function" &&
      typeof api.downloadTemplate === "function" &&
      typeof api.downloadExport === "function" &&
      typeof api.downloadBreedingReport === "function" &&
      typeof api.downloadProductionReport === "function"
    );
  }

  async function ensureSpreadsheetTools(options = {}) {
    if (options.importSupport) {
      await loadScript(ASSETS.jszip, "JSZip", () => typeof window.JSZip?.loadAsync === "function");
    }
    await loadScript(ASSETS.exceljs, "ExcelJS", () => typeof window.ExcelJS?.Workbook === "function");
    await loadScript(ASSETS.spreadsheet, "HerdHarbor spreadsheet tools", spreadsheetApiReady);
    return window.HerdHarborSpreadsheet;
  }

  async function ensureQrTools() {
    await loadScript(ASSETS.qr, "QR generator", () => typeof window.qrcode === "function");
    return window.qrcode;
  }

  function isAiLiveTester() {
    try {
      return window.localStorage?.getItem(AI_TESTER_KEY) === "1";
    } catch {
      return false;
    }
  }

  function publishAiTesterState() {
    const enabled = isAiLiveTester();
    if (document.documentElement?.dataset) {
      document.documentElement.dataset.hhAiLiveTester = enabled ? "true" : "false";
    }
    return enabled;
  }

  function installAiTesterVisibility() {
    if (!document.documentElement?.dataset || typeof document.getElementById !== "function") return;
    if (document.getElementById("hh-ai-live-tester-visibility")) return;
    const style = document.createElement("style");
    style.id = "hh-ai-live-tester-visibility";
    style.textContent =
      'html:not([data-hh-ai-live-tester="true"]) [data-quick="voice"],' +
      'html:not([data-hh-ai-live-tester="true"]) [data-quick="photo"],' +
      'html:not([data-hh-ai-live-tester="true"]) [data-pp-read]{display:none!important}';
    (document.head || document.documentElement).appendChild(style);

    document.addEventListener("click", (event) => {
      if (isAiLiveTester()) return;
      const target = event.target?.closest?.('[data-quick="voice"],[data-quick="photo"],[data-pp-read]');
      if (!target) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  }

  async function ensureAiLiveTools() {
    if (!isAiLiveTester()) throw new Error("AI live testing is not enabled for this browser.");
    await Promise.all([
      loadScript(ASSETS.voiceAi, "HerdHarbor voice-assisted entry", () => typeof window.HerdHarborVoiceAssistedEntry?.create === "function"),
      loadScript(ASSETS.photoAi, "HerdHarbor photo-assisted entry", () => typeof window.HerdHarborPhotoAssistedEntry?.create === "function")
    ]);
    return Object.freeze({
      voice: window.HerdHarborVoiceAssistedEntry,
      photo: window.HerdHarborPhotoAssistedEntry
    });
  }

  function setAiLiveTesterEnabled(enabled) {
    try {
      if (enabled) window.localStorage?.setItem(AI_TESTER_KEY, "1");
      else window.localStorage?.removeItem(AI_TESTER_KEY);
    } catch {}
    const active = publishAiTesterState();
    if (active) ensureAiLiveTools().catch((error) => console.error("HerdHarbor AI tester tools failed to load:", error));
    return active;
  }

  function bootAiLiveTesterGate() {
    installAiTesterVisibility();
    if (publishAiTesterState()) {
      ensureAiLiveTools().catch((error) => console.error("HerdHarbor AI tester tools failed to load:", error));
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootAiLiveTesterGate, { once: true });
  else bootAiLiveTesterGate();

  window.addEventListener?.("storage", (event) => {
    if (event.key === AI_TESTER_KEY) bootAiLiveTesterGate();
  });

  window.HerdHarborOptionalTools = Object.freeze({
    ensureSpreadsheetTools,
    ensureQrTools,
    ensureAiLiveTools,
    isAiLiveTester,
    setAiLiveTesterEnabled
  });
})();
