(() => {
  "use strict";

  const ASSETS = Object.freeze({
    jszip: "vendor/jszip-3.10.1.min.js",
    exceljs: "vendor/exceljs-4.4.0.min.js",
    spreadsheet: "spreadsheet-import.js?v=17",
    qr: "vendor/qrcode-generator-1.4.4.js"
  });

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

  async function ensureSpreadsheetTools() {
    await loadScript(ASSETS.jszip, "JSZip", () => typeof window.JSZip?.loadAsync === "function");
    await loadScript(ASSETS.exceljs, "ExcelJS", () => typeof window.ExcelJS?.Workbook === "function");
    await loadScript(ASSETS.spreadsheet, "HerdHarbor spreadsheet tools", spreadsheetApiReady);
    return window.HerdHarborSpreadsheet;
  }

  async function ensureQrTools() {
    await loadScript(ASSETS.qr, "QR generator", () => typeof window.qrcode === "function");
    return window.qrcode;
  }

  window.HerdHarborOptionalTools = Object.freeze({
    ensureSpreadsheetTools,
    ensureQrTools
  });
})();
