const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const cloud = fs.readFileSync(path.join(root, "herdharbor-cloud.js"), "utf8");
const spreadsheet = fs.readFileSync(path.join(root, "spreadsheet-import.js"), "utf8");
const serviceWorker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const pwa = fs.readFileSync(path.join(root, "pwa.js"), "utf8");

// v1.4.0 is additive: the legacy inline Member app remains intact while
// Breeding Intelligence is loaded as versioned modules through the PWA shell.
assert.match(html, /HerdHarbor Alpha v1\.3\.0 Member workflow and cattle record release/);
assert.match(html, /id="settings-sync-now"/);
assert.match(html, /id="settings-last-synced"/);
assert.match(html, /id="export-excel"/);
assert.match(html, /HerdHarbor Alpha v\$\{APP_VERSION\}/);
assert.match(html, /const APP_VERSION = "1\.3\.0"/);
assert.match(html, /Guided pedigree builder · v\$\{APP_VERSION\}/);
assert.doesNotMatch(html, /Guided pedigree builder · v0\.2\.1/);
assert.match(html, /let animalView = \{[\s\S]*?status: "Active"[\s\S]*?\};/);
assert.match(html, /id="animal-status"[\s\S]*?"Ancestor Only"/);
assert.match(html, /animalView\[fieldName\] = event\.currentTarget\.value/);
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
assert.match(html, /customers: \[\]/);
assert.match(html, /sales: \[\]/);
assert.match(html, /payments: \[\]/);
assert.match(html, /transfers: \[\]/);
assert.match(html, /function renderSales\(\)/);
assert.match(html, /function syncSalePaymentIncome\(/);
assert.match(html, /function printSaleDocument\(/);
assert.match(html, /function exportAnimalTransfer\(/);
assert.match(html, /function openAnimalQrCardForm\(/);
assert.match(html, /protected cloud copy and an offline copy on this device/);
assert.doesNotMatch(
  html,
  /stores data only on this device/,
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
assert.match(spreadsheet, /workbook\.addWorksheet\("Customers"\)/);
assert.match(spreadsheet, /workbook\.addWorksheet\("Sales"\)/);
assert.match(spreadsheet, /workbook\.addWorksheet\("Payments"\)/);
assert.match(spreadsheet, /function stageProduction\(/);
assert.match(spreadsheet, /function stageBreedings\(/);
assert.match(spreadsheet, /function stageBirths\(/);
assert.match(spreadsheet, /downloadExport,/);
assert.match(spreadsheet, /How to fix:/);
assert.match(spreadsheet, /Download issue report/);

assert.match(serviceWorker, /v1\.4\.0-alpha-/);
assert.match(serviceWorker, /v1\.4\.0-alpha-20260824-2/);
assert.match(serviceWorker, /spreadsheet-import\.js\?v=17/);
assert.match(serviceWorker, /herdharbor-cloud\.js\?v=17/);
assert.match(serviceWorker, /symptom-guide\.js\?v=1/);
assert.match(serviceWorker, /pwa\.js\?v=23/);
assert.match(serviceWorker, /pedigree-visual\.css\?v=2/);
assert.match(serviceWorker, /pedigree-visual\.js\?v=2/);
assert.match(serviceWorker, /breeding-intelligence-core\.js\?v=1\.4\.0/);
assert.match(serviceWorker, /breeding-intelligence\.css\?v=1\.4\.0/);
assert.match(serviceWorker, /breeding-intelligence\.js\?v=1\.4\.0/);
assert.match(serviceWorker, /breeding-intelligence-tools\.js\?v=1\.4\.0/);
assert.match(serviceWorker, /qrcode-generator-1\.4\.4\.js/);
assert.match(pwa, /1\.4\.0-alpha-breeding-intelligence-2/);
assert.match(pwa, /loadPedigreeVisuals/);
assert.match(pwa, /loadBreedingIntelligence/);

console.log("v1.4.0 alpha stability release tests passed");
