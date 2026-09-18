"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const html = read("index.html");
const loader = read("herdharbor-optional-tools.js");
const runtime = read("herdharbor-app-runtime.js");
const worker = read("service-worker.js");

const heavyAssets = [
  "vendor/jszip-3.10.1.min.js",
  "vendor/exceljs-4.4.0.min.js",
  "vendor/qrcode-generator-1.4.4.js",
  "spreadsheet-import.js?v=17"
];

function appShellBlock() {
  return worker.match(/const APP_SHELL = \[([\s\S]*?)\n\];/)?.[1] || "";
}

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await nextTurn();
  }
  assert.fail(message);
}

function createHarness() {
  const scripts = [];
  const baseURI = "https://app.herdharbor.com/";
  const window = { location: { href: baseURI } };

  function removeScript(script) {
    const index = scripts.indexOf(script);
    if (index >= 0) scripts.splice(index, 1);
  }

  const document = {
    baseURI,
    scripts,
    createElement(tag) {
      assert.equal(tag, "script");
      const listeners = new Map();
      return {
        dataset: {},
        async: true,
        src: "",
        addEventListener(type, handler) {
          listeners.set(type, handler);
        },
        remove() {
          removeScript(this);
        },
        dispatch(type) {
          listeners.get(type)?.();
        }
      };
    }
  };

  document.head = {
    appendChild(script) {
      scripts.push(script);
      return script;
    }
  };
  document.body = null;
  document.documentElement = document.head;

  vm.runInNewContext(loader, {
    window,
    document,
    URL,
    Object,
    Array,
    Map,
    Promise,
    Error
  });

  return { window, scripts };
}

test("heavy spreadsheet and QR assets are absent from unconditional index startup", () => {
  for (const asset of heavyAssets) {
    assert.ok(!html.includes('<script src="' + asset + '"></script>'), asset + " must not load from index.html");
  }
  assert.match(html, /herdharbor-optional-tools\.js\?v=1/);
  assert.ok(
    html.indexOf("herdharbor-optional-tools.js?v=1") < html.indexOf("herdharbor-app-runtime.js?v=1"),
    "optional loader is available before the app runtime"
  );
});

test("optional loader owns one canonical URL for each heavy dependency", () => {
  for (const asset of heavyAssets) {
    assert.equal(loader.split(asset).length - 1, 1, asset + " is registered exactly once");
  }
  assert.match(loader, /ensureSpreadsheetTools/);
  assert.match(loader, /ensureQrTools/);
  assert.match(loader, /const inFlight = new Map\(\)/);
  assert.match(loader, /node\.async = false/);
  assert.match(loader, /did not publish its expected API/);
});

test("spreadsheet loader is ordered and deduplicates concurrent calls", async () => {
  const { window, scripts } = createHarness();
  const api = window.HerdHarborOptionalTools;

  const first = api.ensureSpreadsheetTools();
  const second = api.ensureSpreadsheetTools();

  assert.equal(scripts.length, 1);
  assert.match(scripts[0].src, /vendor\/jszip-3\.10\.1\.min\.js$/);

  window.JSZip = { loadAsync() {} };
  scripts[0].dispatch("load");
  await waitFor(() => scripts.length === 2, "ExcelJS did not begin after JSZip");
  assert.match(scripts[1].src, /vendor\/exceljs-4\.4\.0\.min\.js$/);

  window.ExcelJS = { Workbook: function Workbook() {} };
  scripts[1].dispatch("load");
  await waitFor(() => scripts.length === 3, "spreadsheet importer did not begin after ExcelJS");
  assert.match(scripts[2].src, /spreadsheet-import\.js\?v=17$/);

  window.HerdHarborSpreadsheet = {
    openImport() {},
    downloadTemplate() {},
    downloadExport() {},
    downloadBreedingReport() {},
    downloadProductionReport() {}
  };
  scripts[2].dispatch("load");

  await Promise.all([first, second]);
  assert.equal(scripts.length, 3, "concurrent callers share the same three script loads");

  await api.ensureSpreadsheetTools();
  assert.equal(scripts.length, 3, "later spreadsheet actions reuse already loaded tools");
});

test("QR loading stays separate from spreadsheet tooling", async () => {
  const { window, scripts } = createHarness();
  const pending = window.HerdHarborOptionalTools.ensureQrTools();

  assert.equal(scripts.length, 1);
  assert.match(scripts[0].src, /vendor\/qrcode-generator-1\.4\.4\.js$/);
  assert.doesNotMatch(scripts[0].src, /exceljs|jszip|spreadsheet-import/);

  window.qrcode = function qrcode() {};
  scripts[0].dispatch("load");
  await pending;
  assert.equal(scripts.length, 1);
});

test("failed optional loads reject cleanly and can be retried", async () => {
  const { window, scripts } = createHarness();
  const first = window.HerdHarborOptionalTools.ensureQrTools();

  assert.equal(scripts.length, 1);
  scripts[0].dispatch("error");
  await assert.rejects(first, /could not be loaded/);
  assert.equal(scripts.length, 0, "failed loader script is removed before retry");

  const retry = window.HerdHarborOptionalTools.ensureQrTools();
  assert.equal(scripts.length, 1, "retry creates one fresh script");
  window.qrcode = function qrcode() {};
  scripts[0].dispatch("load");
  await retry;
});

test("network success without the expected API is treated as failure", async () => {
  const { window, scripts } = createHarness();
  const pending = window.HerdHarborOptionalTools.ensureQrTools();

  scripts[0].dispatch("load");
  await assert.rejects(pending, /did not publish its expected API/);
  assert.equal(scripts.length, 0);
});

test("spreadsheet and QR action paths await their optional tools", () => {
  assert.match(runtime, /download-breeding-report[\s\S]*?await ensureSpreadsheetToolsReady\(\)[\s\S]*?downloadBreedingReport/);
  assert.match(runtime, /download-production-report[\s\S]*?await ensureSpreadsheetToolsReady\(\)/);
  assert.match(runtime, /export-excel[\s\S]*?await ensureSpreadsheetToolsReady\(\)/);
  assert.match(runtime, /download-spreadsheet-template[\s\S]*?await ensureSpreadsheetToolsReady\(\)/);
  assert.match(runtime, /async function handleSpreadsheetImport[\s\S]*?await ensureSpreadsheetToolsReady\(\)/);
  assert.match(runtime, /async function openAnimalQrCardForm[\s\S]*?await ensureQrToolsReady\(\)/);
});

test("service worker keeps heavy tools out of APP_SHELL and runtime-caches them", () => {
  const shell = appShellBlock();
  for (const asset of heavyAssets) {
    assert.ok(!shell.includes(asset), asset + " must not be mandatory APP_SHELL");
  }
  assert.match(shell, /herdharbor-optional-tools\.js\?v=1/);

  for (const route of [
    "/vendor/jszip-3.10.1.min.js",
    "/vendor/exceljs-4.4.0.min.js",
    "/vendor/qrcode-generator-1.4.4.js",
    "/spreadsheet-import.js"
  ]) {
    assert.ok(worker.includes('"' + route + '"'), route + " must remain runtime-cacheable");
  }
  assert.ok(worker.includes('"/herdharbor-optional-tools.js"'));
  assert.match(worker, /return caches\.match\(request\)/);
});


test("transfer import cleanup remains independent from optional spreadsheet state", () => {
  const start = runtime.indexOf("async function handleTransferImport(event)");
  const end = runtime.indexOf("\n  function renderBudget()", start);
  assert.ok(start >= 0 && end > start, "transfer import function is present");
  const transferImport = runtime.slice(start, end);

  assert.match(transferImport, /const file = event\.target\.files\?\.\[0\]/);
  assert.match(transferImport, /finally\s*\{[\s\S]*?event\.target\.value = "";[\s\S]*?\}/);
  assert.doesNotMatch(transferImport, /\binput\.(?:value|disabled)\b/, "transfer cleanup must not use an undefined spreadsheet input variable");
  assert.doesNotMatch(transferImport, /ensureSpreadsheetToolsReady|HerdHarborOptionalTools/, "animal transfer import stays independent from spreadsheet optional-tool loading");
});

test("spreadsheet import always clears and re-enables its captured input", () => {
  const start = runtime.indexOf("async function handleSpreadsheetImport(event)");
  const end = runtime.indexOf("\n  function loadDemoData()", start);
  assert.ok(start >= 0 && end > start, "spreadsheet import function is present");
  const spreadsheetImport = runtime.slice(start, end);

  assert.match(spreadsheetImport, /const input = event\.currentTarget;/);
  assert.match(spreadsheetImport, /const file = input\.files\?\.\[0\];/);
  assert.match(spreadsheetImport, /input\.disabled = true;[\s\S]*?await ensureSpreadsheetToolsReady\(\)/);
  assert.match(
    spreadsheetImport,
    /finally\s*\{\s*input\.value = "";\s*input\.disabled = false;\s*\}/,
    "finally must clear and re-enable the same captured file input"
  );
  assert.doesNotMatch(spreadsheetImport, /finally\s*\{[\s\S]*?event\.target\.value = "";/, "cleanup must consistently use the captured input reference");
});
