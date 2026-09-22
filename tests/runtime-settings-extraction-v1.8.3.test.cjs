"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const app = read("herdharbor-app-runtime.js");
const settings = read("settings-runtime-v1.8.3.js");
const html = read("index.html");
const worker = read("service-worker.js");
const pkg = JSON.parse(read("package.json"));
const Runtime = require("../settings-runtime-v1.8.3.js");

function deps() {
  const noop = () => {};
  return {
    getState: () => ({ profile: {}, settings: {}, activity: [] }),
    getDefaultSettings: () => ({ marketAnalyticsConsent: {} }),
    getCurrentRoute: () => "settings",
    getAppVersion: () => "1.8.2",
    $: () => null,
    $$: () => [],
    esc: (value) => String(value ?? ""),
    headerHtml: () => "",
    detailField: () => "",
    activeAnimals: () => [],
    currentSyncDetails: () => ({ online: true, unsynced: false }),
    formatSyncTimestamp: () => "Never",
    refreshSyncStatus: noop,
    openModal: noop,
    closeModal: noop,
    field: () => "",
    selectField: () => "",
    textareaField: () => "",
    toast: noop,
    applyTheme: noop,
    saveState: () => true,
    showApp: noop,
    prepareProfileImage: async () => ({}),
    recordActivity: noop,
    loadDemoData: noop,
    exportData: noop,
    importData: noop,
    handleSpreadsheetImport: noop,
    clearData: noop,
    ensureSpreadsheetToolsReady: async () => ({}),
    navigate: noop,
    refreshDeviceStorageSummary: noop
  };
}

test("Settings domain has one extracted runtime owner", () => {
  assert.equal(Runtime.VERSION, "1.8.3");
  assert.equal(typeof Runtime.create, "function");
  const api = Runtime.create(deps());
  assert.equal(typeof api.renderSettings, "function");
  assert.equal(typeof api.openFeedbackForm, "function");
  assert.match(settings, /root\.HerdHarborSettingsRuntime = api/);
});

test("composition runtime delegates Settings instead of retaining a second implementation", () => {
  assert.match(app, /HerdHarborSettingsRuntime\?\.create/);
  assert.match(app, /function renderSettings\(\) \{\s*return settingsRuntime\(\)\.renderSettings\(\);\s*\}/);
  assert.match(app, /function openFeedbackForm\(\) \{\s*return settingsRuntime\(\)\.openFeedbackForm\(\);\s*\}/);
  assert.doesNotMatch(app, /id="market-analytics-consent-form"/);
  assert.doesNotMatch(app, /id="request-account-deletion"/);
  assert.doesNotMatch(app, /id="rabbitry-logo-file"/);
  assert.match(settings, /id="market-analytics-consent-form"/);
  assert.match(settings, /id="request-account-deletion"/);
  assert.match(settings, /id="rabbitry-logo-file"/);
});

test("cross-domain state and import/export services remain composition-owned", () => {
  for (const name of ["handleSpreadsheetImport", "loadDemoData", "exportData", "importData", "clearData"]) {
    assert.match(app, new RegExp("function " + name + "\\("));
  }
  assert.doesNotMatch(settings, /function handleSpreadsheetImport\(/);
  assert.doesNotMatch(settings, /function loadDemoData\(/);
  assert.doesNotMatch(settings, /function exportData\(/);
  assert.doesNotMatch(settings, /function importData\(/);
  assert.doesNotMatch(settings, /function clearData\(/);
  assert.doesNotMatch(settings, /localStorage|indexedDB|STORAGE_KEY/);
});

test("existing extracted runtime public APIs remain intact", () => {
  for (const owner of [
    "HerdHarborAnimalProfileRuntime",
    "HerdHarborBreedingLitterRuntime",
    "HerdHarborHealthRuntime",
    "HerdHarborTaskRuntime",
    "HerdHarborSalesCustomerRuntime",
    "HerdHarborProductionReportingRuntime",
    "HerdHarborSettingsRuntime"
  ]) assert.ok(app.includes(owner + "?.create"), owner + " factory remains composed");
});

test("Settings shell asset loads after Production/Reporting and before composition", () => {
  const productionIndex = html.indexOf("production-reporting-runtime-v1.8.3.js?v=1");
  const settingsIndex = html.indexOf("settings-runtime-v1.8.3.js?v=1");
  const appIndex = html.indexOf("herdharbor-app-runtime.js?v=2");
  assert.ok(productionIndex >= 0 && settingsIndex > productionIndex && appIndex > settingsIndex);
  assert.match(worker, /\.\/settings-runtime-v1\.8\.3\.js\?v=1/);
  assert.match(worker, /"\/settings-runtime-v1\.8\.3\.js"/);
});

test("Phase 6H preserves lazy optional tools under the formal v1.8.3 identity", () => {
  assert.match(settings, /await ensureSpreadsheetToolsReady\(\)/);
  assert.doesNotMatch(html, /<script[^>]+(?:exceljs|jszip|spreadsheet-import)/i);
  assert.equal(pkg.version, "1.8.3");
  assert.match(read("herdharbor-build.js"), /version:\s*"1\.8\.3"/);
  assert.doesNotMatch(html, /cloud-sync-rollout-control-v1\.8\.3\.js/);
});
