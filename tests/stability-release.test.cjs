const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const cloud = fs.readFileSync(path.join(root, "herdharbor-cloud.js"), "utf8");
const spreadsheet = fs.readFileSync(path.join(root, "spreadsheet-import.js"), "utf8");
const serviceWorker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

assert.match(html, /HerdHarbor installable tester build v0\.4\.0/);
assert.match(html, /id="settings-sync-now"/);
assert.match(html, /id="settings-last-synced"/);
assert.match(html, /id="export-excel"/);
assert.match(html, /HerdHarbor Pre-Alpha v0\.4\.0/);
assert.match(html, /id="task-status-filter"/);
assert.match(html, /id="task-custom-interval"/);
assert.match(html, /function ensureNextRecurringTask\(/);
assert.match(html, /id="add-production"/);
assert.match(html, /id="repeat-last-production"/);
assert.match(html, /id="download-production-report"/);
assert.match(html, /id="production-report-group"/);
assert.match(html, /productionRecords: \[\]/);
assert.match(html, /id="breeding-year-filter"/);
assert.match(html, /id="download-breeding-report"/);
assert.match(html, /function syncBreedingReminders\(/);
assert.match(html, /function openOffspringCreator\(/);
assert.match(html, /sourceBirthId: litter\.id/);
assert.match(html, /protected cloud copy and an offline copy on this device/);
assert.doesNotMatch(
  html,
  /This pre-alpha stores data only on this device/,
  "onboarding no longer contradicts protected cloud sync"
);

assert.match(cloud, /const STORAGE_KEY = "herdharbor_pre_alpha_v1"/);
assert.match(cloud, /function getSyncDetails\(\)/);
assert.match(cloud, /herdharbor:sync-status/);
assert.match(cloud, /lastSyncedAt:/);
assert.match(cloud, /getSyncDetails,/);
assert.match(cloud, /window\.addEventListener\("offline"/);

assert.match(spreadsheet, /function buildExportWorkbook\(/);
assert.match(spreadsheet, /function buildProductionReportWorkbook\(/);
assert.match(spreadsheet, /function buildBreedingReportWorkbook\(/);
assert.match(spreadsheet, /workbook\.addWorksheet\("Production"\)/);
assert.match(spreadsheet, /workbook\.addWorksheet\("Breeding"\)/);
assert.match(spreadsheet, /workbook\.addWorksheet\("Births"\)/);
assert.match(spreadsheet, /function stageProduction\(/);
assert.match(spreadsheet, /function stageBreedings\(/);
assert.match(spreadsheet, /function stageBirths\(/);
assert.match(spreadsheet, /downloadExport,/);
assert.match(spreadsheet, /How to fix:/);
assert.match(spreadsheet, /Download issue report/);

assert.match(serviceWorker, /v0\.4\.0-/);
assert.match(serviceWorker, /spreadsheet-import\.js\?v=8/);
assert.match(serviceWorker, /herdharbor-cloud\.js\?v=10/);
assert.match(serviceWorker, /pwa\.js\?v=11/);

console.log("v0.4.0 stability release tests passed");
