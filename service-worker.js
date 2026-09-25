"use strict";

const CACHE_PREFIX = "herdharbor-shell-";
const CACHE_NAME = "herdharbor-shell-v1.8.4-alpha-v1.8.4-release-1";
const REQUIRED_SHELL = [
  "./",
  "./index.html",
  "./manifest.json?v=1.8.4",
  "./herdharbor-core-v1.6.1.css?v=1.7.1",
  "./herdharbor-v1.6.1.css?v=1.7.1",
  "./herdharbor-index-shell.css?v=1",
  "./analytics-v1.6.1.css?v=2",
  "./vendor/supabase-2.111.0.js",
  "./herdharbor-optional-tools.js?v=2",
  "./herdharbor-build.js?v=1.8.4",
  "./herdharbor-state-store-v1.8.4.js?v=1",
  "./herdharbor-release-v1.6.1.js?v=1.7.1",
  "./herdharbor-membership-v1.6.1.js?v=1.7.1",
  "./herdharbor-billing-v1.6.1.js?v=1.7.1",
  "./herdharbor-access-cache-v1.6.1.js?v=1.7.1",
  "./herdharbor-cloud.js?v=21",
  "./cloud-sync-rollout-runtime-v1.8.4.js?v=1",
  "./local-cache-v2-v1.8.2.js?v=1",
  "./cloud-sync-v2-flow-v1.8.2.js?v=1",
  "./cloud-sync-v2-diagnostics-v1.8.2.js?v=1",
  "./herdharbor-admin-v1.6.1.js?v=1.7.1",
  "./symptom-guide.js?v=1",
  "./pwa.js?v=31",
  "./market-analytics-v1.6.5.js?v=1.7.1",
  "./analytics-v1.6.1.js?v=2",
  "./animal-profile-runtime-v1.8.3.js?v=1",
  "./breeding-litter-runtime-v1.8.3.js?v=1",
  "./task-automation-v1.8.3.js?v=1",
  "./health-runtime-v1.8.3.js?v=1",
  "./task-runtime-v1.8.3.js?v=1",
  "./sales-customer-runtime-v1.8.3.js?v=1",
  "./profitability-analytics-v1.8.3.js?v=1",
  "./production-reporting-runtime-v1.8.3.js?v=1",
  "./settings-runtime-v1.8.3.js?v=1",
  "./mobile-capture-v1.8.3.js?v=1",
  "./herdharbor-app-runtime.js?v=2",
  "./herdharbor-monitoring-config.js?v=1.8.4",
  "./vendor/herdharbor-monitoring-v1.6.1.min.js?v=1.8.4",
  "./how-to/",
  "./icon-192.png",
  "./icon-512.png"
];

const RUNTIME_CACHE_PATHS = [
  "./cloud-record-store-v1.8.3.js?v=1",
  "./cloud-state-normalizer-v1.8.3.js?v=1",
  "./cloud-record-baseline-v1.8.4.js?v=1",
  "./cloud-record-outbox-worker-v1.8.4.js?v=1",
  "./cloud-sync-cohort-gate-v1.8.3.js?v=1",
  "./cloud-shadow-sync-v1.8.3.js?v=1",
  "./cloud-shadow-bootstrap-v1.8.3.js?v=1",
  "./cloud-sync-reconciliation-v1.8.3.js?v=1",
  "./cloud-sync-stage-policy-v1.8.3.js?v=1",
  "./cloud-sync-rollout-control-v1.8.3.js?v=1",
  "./cloud-dual-write-coordinator-v1.8.3.js?v=1",
  "./cloud-normalized-read-fallback-v1.8.3.js?v=1",
  "./voice-assisted-entry-v1.8.3.js?v=1",
  "./photo-assisted-entry-v1.8.3.js?v=2",
  "./how-to-navigation-v1.8.1.js?v=1",
  "./direct-transfer-core-v1.8.2.js?v=1",
  "./direct-transfer-v1.8.2.js?v=1",
  "./direct-transfer-v1.8.2.css?v=1",
  "./paper-pedigree-import-core-v1.8.2.js?v=1",
  "./paper-pedigree-import-v1.8.2.js?v=2",
  "./registration-safety-v1.8.1.js?v=1",
  "./subscription-referral-policy-v1.8.1.js?v=1",
  "./subscription-admin-credits-v1.8.1.js?v=1",
  "./subscription-launch-v1.8.1.js?v=2",
  "./subscription-engine-v1.8.0.js?v=1",
  "./subscription-engine-v1.8.0.css?v=1",
  "./subscription-member-ui-v1.8.0.css?v=1",
  "./subscription-tab-visibility-v1.8.0.js?v=2",
  "./subscription-header-copy-v1.8.0.js?v=3",
  "./subscription-stripe-provider-v1.8.0.js?v=2",
  "./subscription-stripe-launch-bridge-v1.8.1.js?v=1",
  "./mobile-viewport-hotfix-v1.8.0.css?v=1",
  "./herdharbor-v1.7.1-stability-hotfix.js?v=2",
  "./workflow-phase1-v1.7.1.js?v=2",
  "./workflow-phase1-v1.7.1.css?v=2",
  "./flow-phase1-v1.8.2.js?v=1",
  "./flow-phase2-v1.8.2.js?v=1",
  "./animal-action-router-v1.8.3.js?v=1",
  "./flow-phase2-v1.8.2.css?v=1",
  "./flow-phase2-lifecycle-v1.8.2.js?v=1",
  "./flow-phase2-lifecycle-v1.8.2.css?v=1",
  "./breeding-litter-workspace-v1.8.2.js?v=1",
  "./breeding-litter-workspace-integration-v1.8.2.js?v=1",
  "./breeding-litter-workspace-v1.8.2.css?v=1",
  "./litter-sale-transfer-core-v1.8.2.js?v=1",
  "./litter-sale-transfer-v1.8.2.js?v=1",
  "./litter-sale-transfer-v1.8.2.css?v=1",
  "./breeding-next-action-core-v1.8.2.js?v=1",
  "./breeding-next-action-v1.8.2.js?v=1",
  "./breeding-next-action-v1.8.2.css?v=1",
  "./breeding-performance-core-v1.8.2.js?v=1",
  "./breeding-performance-dashboard-v1.8.2.js?v=1",
  "./breeding-performance-dashboard-v1.8.2.css?v=1",
  "./flow-phase2-profile-finish-v1.8.2.js?v=1",
  "./flow-phase2-profile-finish-v1.8.2.css?v=1",
  "./flow-phase1-completion-v1.8.2.js?v=1",
  "./flow-phase1-v1.8.2.css?v=1",
  "./health-intelligence-v1.7.1.js?v=1.7.1",
  "./health-intelligence-v1.7.1.css?v=1.7.1",
  "./pedigree-visual.css?v=2",
  "./pedigree-visual.js?v=2",
  "./pedigree-genetics-v1.6.1.css?v=1.7.1",
  "./pedigree-genetics-v1.6.1.js?v=1.7.1",
  "./breeding-intelligence-core-v1.6.1.js?v=1.7.1",
  "./rabbit-genetics-v1.6.1.js?v=2",
  "./standards-registry-v1.6.1.js?v=1.7.1",
  "./multispecies-genetics-v1.7.1.js?v=1.7.1",
  "./multispecies-genetics-ui-v1.7.1.js?v=1.7.1",
  "./multispecies-genetics-v1.7.1.css?v=1.7.1",
  "./standards-genetics-ui-v1.6.1.js?v=1.7.1",
  "./standards-genetics-v1.6.1.css?v=1.7.1",
  "./rabbit-records-v1.6.1.js?v=1.7.1",
  "./rabbit-genetics-engine-advanced-v1.6.1.js?v=1.7.1",
  "./rabbit-genetics-engine-compat-v1.6.1.js?v=1.7.1",
  "./rabbit-genetics-runtime-v1.6.1.js?v=1.7.1",
  "./breeding-intelligence-v1.6.1.css?v=1.7.1",
  "./breeding-genetics-advanced-v1.6.1.css?v=1.7.1",
  "./breeding-intelligence-v1.6.1.js?v=1.7.1",
  "./breeding-pair-v1.6.1.js?v=1.7.1",
  "./rabbit-genetics-ui-compat-v1.6.1.js?v=1.7.1",
  "./rabbit-genetics-ui-advanced-v1.6.1.js?v=2",
  "./breeding-intelligence-tools-v1.6.1.js?v=1.7.1",
  "./shows-v1.6.1.css?v=1.7.1",
  "./shows-v1.6.1.js?v=1.7.1",
  "./shows-v1.6.1-hardening.js?v=1.7.1",
  "./shows-v1.6.1-performance.js?v=1.7.1",
  "./standards-v1.7.0.css?v=1.7.1",
  "./standards-registry-v1.7.0.js?v=1.7.1",
  "./standards-ui-v1.7.0.js?v=1.7.1",
  "./standards-public-reference-v1.7.0.js?v=1.7.1",
  "./shows-youth-guides-v1.7.0.js?v=1.7.1",
  "./reference-guides-v1.7.0.css?v=1.7.1",
  "./herdharbor-optional-tools.js?v=1"
];

const NETWORK_FIRST_PATHS = [
  "/manifest.json",
  "/herdharbor-build.js",
  "/herdharbor-cloud.js",
  "/herdharbor-monitoring-config.js",
  "/herdharbor-release-v1.6.1.js",
  "/herdharbor-membership-v1.6.1.js",
  "/herdharbor-billing-v1.6.1.js",
  "/herdharbor-access-cache-v1.6.1.js",
  "/herdharbor-index-shell.css",
  "/pwa.js",
  "/local-cache-v2-v1.8.2.js",
  "/cloud-sync-v2-flow-v1.8.2.js",
  "/cloud-sync-v2-diagnostics-v1.8.2.js",
  "/herdharbor-admin-v1.6.1.js",
  "/market-analytics-v1.6.5.js",
  "/analytics-v1.6.1.js",
  "/registration-safety-v1.8.1.js",
  "/subscription-referral-policy-v1.8.1.js",
  "/subscription-admin-credits-v1.8.1.js",
  "/subscription-launch-v1.8.1.js",
  "/subscription-engine-v1.8.0.js",
  "/subscription-engine-v1.8.0.css",
  "/subscription-member-ui-v1.8.0.css",
  "/subscription-tab-visibility-v1.8.0.js",
  "/subscription-header-copy-v1.8.0.js",
  "/subscription-stripe-provider-v1.8.0.js",
  "/subscription-stripe-launch-bridge-v1.8.1.js",
  "/animal-profile-runtime-v1.8.3.js",
  "/animal-action-router-v1.8.3.js",
  "/breeding-litter-runtime-v1.8.3.js",
  "/task-automation-v1.8.3.js",
  "/health-runtime-v1.8.3.js",
  "/task-runtime-v1.8.3.js",
  "/sales-customer-runtime-v1.8.3.js",
  "/profitability-analytics-v1.8.3.js",
  "/production-reporting-runtime-v1.8.3.js",
  "/settings-runtime-v1.8.3.js",
  "/mobile-capture-v1.8.3.js",
  "/herdharbor-app-runtime.js",
  "/mobile-viewport-hotfix-v1.8.0.css",
  "/paper-pedigree-import-core-v1.8.2.js",
  "/paper-pedigree-import-v1.8.2.js",
  "/spreadsheet-import.js",
  "/vendor/jszip-3.10.1.min.js",
  "/vendor/exceljs-4.4.0.min.js",
  "/vendor/qrcode-generator-1.4.4.js"
];

function isNetworkFirstPath(pathname) {
  return NETWORK_FIRST_PATHS.some((path) => pathname.endsWith(path));
}

function isRuntimeCachePath(url) {
  return RUNTIME_CACHE_PATHS.some((path) => {
    try {
      return new URL(path, self.location.href).pathname === url.pathname;
    } catch {
      return false;
    }
  });
}

async function cacheFreshResponse(request, response) {
  if (!response?.ok || response.type !== "basic") return response;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    return cacheFreshResponse(request, response);
  } catch {
    return caches.match(request);
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    return cacheFreshResponse(request, response);
  } catch {
    return caches.match(request);
  }
}

function isImmutableFingerprintAsset(url) {
  if (!/\.(?:js|css)$/i.test(url.pathname)) return false;
  return /^[a-f0-9]{12,64}$/i.test(url.searchParams.get("rev") || "");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const requests = REQUIRED_SHELL.map((path) => new Request(new URL(path, self.location.href), { cache: "reload" }));
      const results = await Promise.allSettled(requests.map((request) => cache.add(request)));
      const requiredFailures = results
        .map((result, index) => ({ result, request: requests[index] }))
        .filter(({ result }) => result.status === "rejected")
        .map(({ request }) => new URL(request.url).pathname);
      const fatal = requiredFailures.filter((path) =>
        path.endsWith("index.html") ||
        path.endsWith("herdharbor-build.js") ||
        path.endsWith("herdharbor-app-runtime.js") ||
        path.endsWith("herdharbor-cloud.js")
      );
      if (fatal.length) throw new Error("Required HerdHarbor shell assets failed to cache: " + fatal.join(", "));
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy))
            );
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match("./index.html")) || cache.match("./");
        })
    );
    return;
  }

  if (isNetworkFirstPath(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isImmutableFingerprintAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (isRuntimeCachePath(url)) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});
