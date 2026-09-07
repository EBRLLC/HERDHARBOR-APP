const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const cloud = fs.readFileSync(path.join(root, "herdharbor-cloud.js"), "utf8");
const spreadsheet = fs.readFileSync(path.join(root, "spreadsheet-import.js"), "utf8");
const serviceWorker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const pwa = fs.readFileSync(path.join(root, "pwa.js"), "utf8");
const build = fs.readFileSync(path.join(root, "herdharbor-build.js"), "utf8");
const records = fs.readFileSync(path.join(root, "rabbit-records-v1.6.1.js"), "utf8");
const genetics = fs.readFileSync(path.join(root, "rabbit-genetics-engine-compat-v1.6.1.js"), "utf8");
const runtime = fs.readFileSync(path.join(root, "rabbit-genetics-runtime-v1.6.1.js"), "utf8");
const pedigreeGenetics = fs.readFileSync(path.join(root, "pedigree-genetics-v1.6.1.js"), "utf8");
const pedigreeGeneticsCss = fs.readFileSync(path.join(root, "pedigree-genetics-v1.6.1.css"), "utf8");
const shows = fs.readFileSync(path.join(root, "shows-v1.6.1.js"), "utf8");
const showsCss = fs.readFileSync(path.join(root, "shows-v1.6.1.css"), "utf8");
const showsHardening = fs.readFileSync(path.join(root, "shows-v1.6.1-hardening.js"), "utf8");
const mobileGrowth = fs.readFileSync(path.join(root, "tests/mobile-growth-layout-v1.6.6.test.cjs"), "utf8");

// Current release remains additive: established data/runtime contracts and mobile protections stay intact.
const webVersion = build.match(/version:\s*"([^"]+)"/)?.[1];
const buildId = build.match(/buildId:\s*"([^"]+)"/)?.[1];
assert.ok(["1.7.1", "1.8.0", "1.8.1"].includes(webVersion), `unexpected web release ${webVersion}`);
if (webVersion === "1.7.1") assert.equal(buildId, "multispecies-genetics-foundation-1");
if (webVersion === "1.8.0") assert.match(buildId, /^subscription-engine-/);
if (webVersion === "1.8.1") {
  assert.match(buildId, /^october-subscription-launch-/);
  assert.match(build, /subscription-launch-v1\.8\.1\.js\?v=1/);
}
assert.match(html, /HerdHarbor Alpha v1\.8\.1 current application shell/);
assert.match(html, /id="settings-sync-now"/);
assert.match(html, /id="settings-last-synced"/);
assert.match(html, /id="export-excel"/);
assert.match(html, /HerdHarbor Alpha v\$\{APP_VERSION\}/);
assert.match(html, /const APP_VERSION = window\.HerdHarborBuild\?\.version \|\| "1\.8\.1"/);
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
assert.doesNotMatch(html, /stores data only on this device/, "onboarding no longer contradicts protected cloud sync");

assert.match(cloud, /const STORAGE_KEY = "herdharbor_pre_alpha_v1"/);
assert.match(cloud, /function getSyncDetails\(\)/);
assert.match(cloud, /herdharbor:sync-status/);
assert.match(cloud, /lastSyncedAt:/);
assert.match(cloud, /getSyncDetails,/);
assert.match(cloud, /window\.addEventListener\("offline"/);
assert.doesNotMatch(cloud, /SKIP_WAITING|registration\.update|HerdHarborPWA/);

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

assert.match(serviceWorker, /const CACHE_NAME = "herdharbor-shell-v1\.(?:7\.1|8\.0|8\.1)-/);
if (webVersion === "1.8.1") assert.match(serviceWorker, /v1\.8\.1-alpha-october-subscription-launch-/);
assert.match(serviceWorker, /spreadsheet-import\.js\?v=17/);
assert.match(serviceWorker, /herdharbor-access-cache-v1\.6\.1\.js\?v=1\.7\.1/);
assert.match(serviceWorker, /herdharbor-cloud\.js\?v=20/);
assert.match(serviceWorker, /symptom-guide\.js\?v=1/);
assert.match(serviceWorker, /pwa\.js\?v=30/);
assert.match(serviceWorker, /pedigree-visual\.css\?v=2/);
assert.match(serviceWorker, /pedigree-visual\.js\?v=2/);
for (const asset of [
  "pedigree-genetics-v1.6.1.css", "pedigree-genetics-v1.6.1.js", "breeding-intelligence-core-v1.6.1.js",
  "breeding-intelligence-v1.6.1.css", "breeding-intelligence-v1.6.1.js", "rabbit-records-v1.6.1.js",
  "rabbit-genetics-engine-advanced-v1.6.1.js", "rabbit-genetics-runtime-v1.6.1.js",
  "rabbit-genetics-ui-compat-v1.6.1.js", "rabbit-genetics-ui-advanced-v1.6.1.js",
  "herdharbor-release-v1.6.1.js", "shows-v1.6.1.css", "shows-v1.6.1.js", "shows-v1.6.1-hardening.js"
]) assert.ok(serviceWorker.includes(`${asset}?v=1.7.1`), `${asset} is not cached with preserved v1.7.1 identity`);
assert.match(serviceWorker, /qrcode-generator-1\.4\.4\.js/);
assert.match(serviceWorker, /NETWORK_FIRST_PATHS/);
assert.match(serviceWorker, /fetch\(request, \{ cache: "no-store" \}\)/);
assert.match(pwa, /window\.HerdHarborBuild\?\.buildId \|\| "october-subscription-launch-referrals-credits-4"/);
assert.match(pwa, /loadPedigreeVisuals/);
assert.match(pwa, /loadBreedingIntelligence/);
assert.match(pwa, /loadShows/);
assert.match(pwa, /shows-v1\.6\.1-hardening\.js\?v=1\.7\.1/);
assert.match(pwa, /schemaVersion: 3/);
assert.match(pwa, /registration\.update\(\)/);
assert.match(pwa, /updateViaCache: "none"/);
assert.doesNotMatch(pwa, /HerdHarborCloud/);
assert.match(mobileGrowth, /Alpha v1\.6\.6 mobile Growth layout guard passed/);

assert.match(records, /normalized === "female"/);
assert.doesNotMatch(records, /\/male\|buck\//);
assert.match(genetics, /Genetic conflict detected/);
assert.match(runtime, /Unknown alleles widen named offspring-color ranges/);
assert.match(runtime, /visible non-white|whiteMask|V\/V/);
assert.match(pedigreeGenetics, /DEFAULTS=Object\.freeze\(\{mode:'full',printGenetics:true\}\)/);
assert.match(pedigreeGenetics, /refineAnimalGenetics/);
assert.match(pedigreeGenetics, /applyEvidenceToGenetics/);
assert.match(pedigreeGenetics, /Entered Genetics remains separate from Inferred Genetics/);
assert.match(pedigreeGeneticsCss, /white-space:nowrap/);
assert.doesNotMatch(pedigreeGeneticsCss, /hh-protected-field[^}]*font-size:/);

// Shows remains additive and uses existing canonical HerdHarbor data stores.
assert.match(shows, /COLLECTIONS=\['shows','showEntries','showResults','showAwards','exhibitors','showProjects','projectGoals','projectNotes','projectPhotos'\]/);
assert.match(shows, /state\.transactions\.push\(/);
assert.match(shows, /state\.health\.push\(/);
assert.match(shows, /showId:defaults\.showId/);
assert.match(shows, /projectId:defaults\.projectId/);
assert.doesNotMatch(shows, /showExpenses\s*:/);
assert.doesNotMatch(shows, /showIncome\s*:/);
assert.doesNotMatch(shows, /4-H Records/);
assert.match(shows, /litters\.insertAdjacentElement\('afterend'/);
assert.match(shows, /Print \/ Save PDF/);
assert.match(shows, /not automatically an official state or county 4-H record book/i);
assert.match(showsHardening, /Animal Show History/);
assert.match(showsHardening, /Remove this attachment from the record\?/);
assert.match(showsHardening, /Archive this show\?/);
assert.match(showsHardening, /data-hh-filter="placement"/);
assert.match(showsHardening, /data-hh-filter="award"/);
assert.match(showsHardening, /PAGE_SIZE = 24/);
assert.match(showsCss, /overflow-x:auto/);
assert.match(showsCss, /@media \(max-width:520px\)/);

console.log(`Alpha v${webVersion} release stability tests passed`);
