"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const app=fs.readFileSync(path.join(root,"herdharbor-app-runtime.js"),"utf8");
const pwaSource=fs.readFileSync(path.join(root,"pwa.js"),"utf8");
const sw=fs.readFileSync(path.join(root,"service-worker.js"),"utf8");
const market=fs.readFileSync(path.join(root,"herdharbor-marketplace.js"),"utf8");

const lazy=[
  "animal-profile-runtime-v1.8.3.js?v=1",
  "health-runtime-v1.8.3.js?v=1",
  "production-reporting-runtime-v1.8.3.js?v=1"
];

test("route-only runtimes do not execute eagerly but remain offline-cacheable",()=>{
  for(const asset of lazy){
    assert.equal(html.includes('<script src="'+asset+'"></script>'),false,asset+" should not be eager");
    assert.equal(sw.includes('"./'+asset+'"'),true,asset+" should remain in the offline cache");
  }
});

test("dashboard/startup synchronous dependencies remain eager",()=>{
  for(const asset of [
    "breeding-litter-runtime-v1.8.3.js?v=1",
    "task-runtime-v1.8.3.js?v=1",
    "sales-customer-runtime-v1.8.3.js?v=1"
  ]) assert.equal(html.includes('<script src="'+asset+'"></script>'),true,asset);
});

test("lazy route runtimes have guarded loaders",()=>{
  assert.match(app,/function ensureAnimalProfileRuntimeLoaded\(\)[\s\S]*animal-profile-runtime-v1\.8\.3\.js\?v=1/);
  assert.match(app,/function ensureHealthRuntimeLoaded\(\)[\s\S]*health-runtime-v1\.8\.3\.js\?v=1/);
  assert.match(app,/function ensureProductionReportingRuntimeLoaded\(\)[\s\S]*production-reporting-runtime-v1\.8\.3\.js\?v=1/);
  assert.match(app,/function renderAnimals\(\)[\s\S]*renderLazyRoute\([\s\S]*ensureAnimalProfileRuntimeLoaded/);
  assert.match(app,/function renderHealth\(\)[\s\S]*renderLazyRoute\([\s\S]*ensureHealthRuntimeLoaded/);
});

test("cross-route actions wait for lazy dependencies before use",()=>{
  assert.match(app,/async function openAnimalForm[\s\S]*await ensureAnimalProfileRuntimeLoaded\(\)/);
  assert.match(app,/async function openAnimalDetail[\s\S]*await ensureAnimalProfileRuntimeLoaded\(\)/);
  assert.match(app,/async function openHealthForm[\s\S]*await ensureHealthRuntimeLoaded\(\)/);
  assert.match(app,/async function openPedigreeRecord[\s\S]*await ensureAnimalProfileRuntimeLoaded\(\)/);
});

test("import and demo workflows load reporting before synchronous accounting hooks",()=>{
  const importStart=app.indexOf("async function handleSpreadsheetImport");
  const importEnd=app.indexOf("function loadDemoData",importStart);
  const importBlock=app.slice(importStart,importEnd);
  assert.ok(importBlock.indexOf("await ensureProductionReportingRuntimeLoaded()")>=0);
  assert.ok(importBlock.indexOf("await ensureProductionReportingRuntimeLoaded()")<importBlock.indexOf("syncProductionIncome(record)"));

  const demoStart=app.indexOf("async function loadDemoData");
  const demoEnd=app.indexOf("async function exportData",demoStart);
  const demoBlock=app.slice(demoStart,demoEnd);
  assert.ok(demoBlock.indexOf("await ensureProductionReportingRuntimeLoaded()")>=0);
  assert.ok(demoBlock.indexOf("await ensureProductionReportingRuntimeLoaded()")<demoBlock.indexOf("syncSalePaymentIncome(demoPayment)"));
});

test("budget waits for both reporting and profitability modules",()=>{
  const start=app.indexOf("function renderBudget");
  const end=app.indexOf("async function openProductionForm",start);
  const block=app.slice(start,end);
  assert.match(block,/Promise\.all\(\[ensureProductionReportingRuntimeLoaded\(\), ensureProfitabilityAnalyticsLoaded\(\)\]\)/);
});


test("legacy pedigree attachment migration waits for idle time",()=>{
  assert.match(app,/function schedulePedigreeAttachmentMigration\(\)/);
  assert.match(app,/requestIdleCallback\(run, \{ timeout: 1800 \}\)/);
  const initStart=app.indexOf("function initialize()");
  const initEnd=app.indexOf("function showOnboarding",initStart);
  const initBlock=app.slice(initStart,initEnd);
  assert.match(initBlock,/schedulePedigreeAttachmentMigration\(\)/);
  assert.doesNotMatch(initBlock,/\bmigratePedigreeAttachments\(\)/);
});


test("failed route script registrations can be retried instead of hanging on stale script tags",()=>{
  assert.match(app,/if \(existing && !ready\(\)\) \{[\s\S]*existing\.remove\(\);[\s\S]*existing = null;/);
  assert.match(app,/lazyScriptPromises\.delete\(src\)/);
});

test("Marketplace cross-feature actions await their lazy dependencies",()=>{
  assert.match(app,/function ensureDirectTransferRuntime\(\)[\s\S]*direct-transfer-core-v1\.8\.2\.js\?v=1[\s\S]*direct-transfer-v1\.8\.2\.js\?v=1/);
  assert.match(app,/loadStyleOnce\("direct-transfer-v1\.8\.2\.css\?v=1"\)/);
  assert.match(app,/const marketplaceActionShims = Object\.freeze\([\s\S]*ensureDocumentCenter:[\s\S]*ensureDirectTransfer:/);
  assert.match(app,/renderMarketplace\(\{ target:[\s\S]*actions: marketplaceActionShims/);
  assert.match(market,/await actions\.ensureDocumentCenter\(\)/);
  assert.match(market,/await actions\.ensureDirectTransfer\(\)/);
});

test("lazy Marketplace dependencies remain offline-cacheable without returning to eager startup",()=>{
  for(const asset of [
    "herdharbor-document-center.js?v=1",
    "herdharbor-marketplace.js?v=1",
    "direct-transfer-core-v1.8.2.js?v=1",
    "direct-transfer-v1.8.2.js?v=1",
    "direct-transfer-v1.8.2.css?v=1"
  ]){
    assert.equal(sw.includes('"./'+asset+'"'),true,asset+" should remain runtime-cacheable");
  }
  assert.equal(html.includes('<script src="herdharbor-document-center.js?v=1"></script>'),false);
  assert.equal(html.includes('<script src="herdharbor-marketplace.js?v=1"></script>'),false);
  assert.equal(html.includes('<script src="direct-transfer-v1.8.2.js?v=1"></script>'),false);
});


test("Direct Transfer starts only from Sales or an explicit Marketplace transfer action",()=>{
  const build=fs.readFileSync(path.join(root,"herdharbor-build.js"),"utf8");
  const required=sw.slice(sw.indexOf("const REQUIRED_SHELL"),sw.indexOf("const RUNTIME_CACHE_PATHS"));
  const runtimeCache=sw.slice(sw.indexOf("const RUNTIME_CACHE_PATHS"),sw.indexOf("const NETWORK_FIRST_PATHS"));
  assert.doesNotMatch(build,/addStyle\("hh-direct-transfer-v182-style"/);
  assert.doesNotMatch(build,/addScript\("hh-direct-transfer-core-v182"/);
  assert.doesNotMatch(required,/direct-transfer-(?:core-)?v1\.8\.2/);
  for(const asset of ["direct-transfer-core-v1.8.2.js?v=1","direct-transfer-v1.8.2.js?v=1","direct-transfer-v1.8.2.css?v=1"]){
    assert.ok(runtimeCache.includes(asset),asset);
  }
  const renderers=app.slice(app.indexOf("const renderers"),app.indexOf("renderers[currentRoute]"));
  assert.match(renderers,/sales:\s*\(\) => \{[\s\S]*renderSales\(\);[\s\S]*ensureDirectTransferRuntime\(\)/);
  assert.match(market,/if\(transferButton\)\{if\(typeof actions\?\.ensureDirectTransfer==="function"\)await actions\.ensureDirectTransfer\(\);openDirectTransferForListing/);
});


test("legacy pedigree and genetics bundles are not part of unconditional PWA boot",()=>{
  const pwa=fs.readFileSync(path.join(root,"pwa.js"),"utf8");
  const bootStart=pwa.indexOf("function bootApplication()");
  const bootEnd=pwa.indexOf("function boot()",bootStart);
  const boot=pwa.slice(bootStart,bootEnd);
  assert.doesNotMatch(boot,/loadPedigreeVisuals\(\)/);
  assert.doesNotMatch(boot,/loadBreedingIntelligence\(\)/);
  assert.doesNotMatch(boot,/loadShows\(\)/);
  assert.match(pwa,/function ensureRouteAssets\(route\)/);
  assert.match(pwa,/normalized === "breeding"\) ensureBreedingIntelligence\(\)/);
  assert.match(pwa,/normalized === "pedigrees" \|\| normalized === "animals"\) ensurePedigreeVisuals\(\)/);
  assert.match(pwa,/herdharbor:route-change/);
  assert.match(app,/new CustomEvent\("herdharbor:route-change", \{ detail: \{ route: currentRoute \} \}\)/);
});

test("unused Shows legacy bundle is no longer started during application boot",()=>{
  const pwa=fs.readFileSync(path.join(root,"pwa.js"),"utf8");
  const boot=pwa.slice(pwa.indexOf("function bootApplication()"),pwa.indexOf("function boot()",pwa.indexOf("function bootApplication()")));
  assert.doesNotMatch(boot,/loadShows\(\)/);
});


test("route-only runtimes are runtime-cached rather than mandatory service-worker install assets",()=>{
  const required=sw.slice(sw.indexOf("const REQUIRED_SHELL"),sw.indexOf("const RUNTIME_CACHE_PATHS"));
  const runtimeCache=sw.slice(sw.indexOf("const RUNTIME_CACHE_PATHS"),sw.indexOf("const NETWORK_FIRST_PATHS"));
  const networkFirst=sw.slice(sw.indexOf("const NETWORK_FIRST_PATHS"),sw.indexOf("function isNetworkFirstPath"));
  for(const asset of [
    "animal-profile-runtime-v1.8.3.js?v=1",
    "health-runtime-v1.8.3.js?v=1",
    "production-reporting-runtime-v1.8.3.js?v=1"
  ]){
    assert.equal(required.includes(asset),false,asset+" must not block service-worker install");
    assert.equal(runtimeCache.includes(asset),true,asset+" remains available after first use");
  }
  for(const obsolete of [
    "local-cache-v2-v1.8.2.js",
    "cloud-sync-v2-flow-v1.8.2.js",
    "cloud-sync-v2-diagnostics-v1.8.2.js"
  ]) assert.equal(networkFirst.includes(obsolete),false,obsolete+" must not remain an active fetch classification");
});


test("route-change instrumentation preserves multi-view navigation",()=>{
  const navStart=app.indexOf("function navigate(");
  const navEnd=app.indexOf("function render",navStart);
  const block=app.slice(navStart,navEnd);
  assert.match(block,/\$\$\("\.view"\)\.forEach\(\(view\) => view\.classList\.remove\("active"\)\)/);
  assert.doesNotMatch(block,/(?<!\$)\$\("\.view"\)\.forEach/);
  assert.match(block,/herdharbor:route-change/);
});


test("pedigree platform is route-loaded once and dependency-ordered before consumers",()=>{
  const required=sw.slice(sw.indexOf("const REQUIRED_SHELL"),sw.indexOf("const RUNTIME_CACHE_PATHS"));
  const runtimeCache=sw.slice(sw.indexOf("const RUNTIME_CACHE_PATHS"),sw.indexOf("const NETWORK_FIRST_PATHS"));
  assert.equal(html.includes('<script src="herdharbor-pedigree-platform.js?v=1"></script>'),false);
  assert.doesNotMatch(html, /<link[^>]+herdharbor-breeder-platform\.css/);
  assert.equal(required.includes("herdharbor-pedigree-platform.js?v=1"),false);
  assert.equal(required.includes("herdharbor-breeder-platform.css?v=1"),false);
  assert.equal(runtimeCache.includes("herdharbor-pedigree-platform.js?v=1"),true);
  assert.equal(runtimeCache.includes("herdharbor-breeder-platform.css?v=1"),true);
  assert.match(app,/async function ensurePedigreePlatformRuntime\(\)[\s\S]*loadStyleOnce\("herdharbor-breeder-platform\.css\?v=1"\)[\s\S]*herdharbor-pedigree-platform\.js\?v=1/);
  assert.match(app,/async function ensureDocumentCenterRuntime\(\) \{\s*await ensurePedigreePlatformRuntime\(\);/);
  assert.match(app,/async function ensureMarketplaceRuntime\(\) \{\s*await ensurePedigreePlatformRuntime\(\);/);
  assert.match(app,/async function ensureAnimalProfileRuntimeLoaded\(\) \{\s*await ensurePedigreePlatformRuntime\(\);/);
  const renderers=app.slice(app.indexOf("const renderers"),app.indexOf("renderers[currentRoute]"));
  assert.match(renderers,/breeding:[\s\S]*ensurePedigreePlatformRuntime/);
  assert.match(renderers,/pedigrees:[\s\S]*ensurePedigreePlatformRuntime/);
});


test("optional monitoring assets do not block service-worker installation",()=>{
  const required=sw.slice(sw.indexOf("const REQUIRED_SHELL"),sw.indexOf("const RUNTIME_CACHE_PATHS"));
  const runtimeCache=sw.slice(sw.indexOf("const RUNTIME_CACHE_PATHS"),sw.indexOf("const NETWORK_FIRST_PATHS"));
  for(const asset of [
    "herdharbor-monitoring-config.js?v=2.0.0",
    "vendor/herdharbor-monitoring-v1.6.1.min.js?v=2.0.0"
  ]){
    assert.equal(required.includes(asset),false,asset+" must not block install");
    assert.equal(runtimeCache.includes(asset),true,asset+" should cache after optional load");
  }
});


test("public animal actions require the pedigree dependency before taking the fast path",()=>{
  const start=app.indexOf("function launchLazyAnimalProfileAction");
  const end=app.indexOf("window.HerdHarborApp",start);
  const block=app.slice(start,end);
  assert.match(block,/HerdHarborAnimalProfileRuntime\?\.create[\s\S]*HerdHarborPedigreePlatform\?\.buildPedigreeGraph[\s\S]*return run\(\)/);
  assert.match(block,/ensureAnimalProfileRuntimeLoaded\(\)[\s\S]*\.then\(run\)/);
});


test("deferred legacy asset loaders can retry after a script fetch failure",()=>{
  assert.match(pwaSource,/function addScript\(id, src, onload\)[\s\S]*script\.addEventListener\("error"[\s\S]*script\.remove\(\)[\s\S]*herdharbor:dynamic-asset-error/);
  assert.match(pwaSource,/window\.addEventListener\("herdharbor:dynamic-asset-error"[\s\S]*pedigreeVisualsLoadStarted = false/);
  assert.match(pwaSource,/herdharbor:dynamic-asset-error[\s\S]*breedingIntelligenceLoadStarted = false/);
  assert.match(pwaSource,/if \(pedigreeVisualsLoadStarted\) return;/);
  assert.match(pwaSource,/if \(breedingIntelligenceLoadStarted\) return;/);
});
