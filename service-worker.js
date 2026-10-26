"use strict";

const CACHE_PREFIX = "herdharbor-shell-";
const CACHE_NAME = "herdharbor-shell-v2.0.1-v2.0.1-release-1-canine-markings-1";
const REQUIRED_SHELL = [
  "./",
  "./index.html",
  "./manifest.json?v=2.0.1",
  "./herdharbor-core-v1.6.1.css?v=1.7.1",
  "./herdharbor-v1.6.1.css?v=1.7.1",
  "./herdharbor-index-shell.css?v=1",
  "./analytics-v1.6.1.css?v=2",
  "./vendor/supabase-2.111.0.js",
  "./herdharbor-optional-tools.js?v=4",
  "./herdharbor-build.js?v=2.0.1",
  "./herdharbor-state-store-v1.8.4.js?v=2",
  "./herdharbor-release-v1.6.1.js?v=2",
  "./herdharbor-membership-v1.6.1.js?v=1.7.1",
  "./marketplace-nav-v2.0.1.js?v=3",
  "./herdharbor-billing-v1.6.1.js?v=1.7.1",
  "./herdharbor-access-cache-v1.6.1.js?v=1.7.1",
  "./cloud-legacy-baseline-v1.8.4.js?v=1",
  "./account-boundary-core-v1.8.4.js?v=4",
  "./herdharbor-cloud.js?v=39",
  "./cloud-sync-rollout-runtime-v1.8.4.js?v=5",
  "./local-cache-v2-v1.8.2.js?v=1",
  "./cloud-sync-v2-flow-v1.8.2.js?v=1",
  "./cloud-sync-v2-diagnostics-v1.8.2.js?v=1",
  "./herdharbor-admin-v1.6.1.js?v=2",
  "./pwa.js?v=36",
  "./market-analytics-v1.6.5.js?v=1.7.1",
  "./pedigree-engine-v2.0.0.js?v=1",
  "./pedigree-customization-v2.0.0.css?v=1",
  "./pedigree-customization-v2.0.0.js?v=1",
  "./pedigree-renderer-v2.0.0.css?v=1",
  "./pedigree-renderer-v2.0.0.js?v=1",
  "./canine-identity-v2.0.1.css?v=1",
  "./canine-breeds-v2.0.1.js?v=4",
  "./canine-identity-v2.0.1.js?v=2",
  "./canine-lineage-v2.0.1.js?v=1",
  "./canine-pedigree-print-v2.0.1.js?v=1",
  "./animal-profile-runtime-v1.8.3.js?v=5",
  "./breeding-litter-runtime-v1.8.3.js?v=1",
  "./task-automation-v1.8.3.js?v=1",
  "./health-runtime-v1.8.3.js?v=1",
  "./task-runtime-v1.8.3.js?v=1",
  "./sales-customer-runtime-v1.8.3.js?v=1",
  "./production-reporting-runtime-v1.8.3.js?v=1",
  "./mobile-capture-v1.8.3.js?v=1",
  "./herdharbor-app-runtime.js?v=6",
  "./herdharbor-monitoring-config.js?v=2.0.1",
  "./vendor/herdharbor-monitoring-v1.6.1.min.js?v=2.0.1"
];

const RUNTIME_CACHE_PATHS = [
  "./how-to/",
  "./icon-192.png",
  "./icon-512.png",
  "./animal-documents-v2.0.0.js?v=1",
  "./birth-certificate-v2.0.0.js?v=1",
  "./standard-pedigree-print-v2.0.0.js?v=1",
  "./document-export-v2.0.0.js?v=1",
  "./pedigree-documents-v2.0.0.js?v=1",
  "./animal-documents-v2.0.0.css?v=1",
  "./birth-certificate-v2.0.0.css?v=1",
  "./pedigree-documents-v2.0.0.css?v=1",
  "./profitability-analytics-v1.8.3.js?v=1",
  "./settings-runtime-v1.8.3.js?v=1",
  "./analytics-v1.6.1.js?v=2",
  "./symptom-guide.js?v=1",
  "./cloud-record-store-v1.8.3.js?v=2",
  "./cloud-state-normalizer-v1.8.3.js?v=1",
  "./cloud-record-baseline-v1.8.4.js?v=1",
  "./cloud-record-outbox-worker-v1.8.4.js?v=2",
  "./cloud-sync-cohort-gate-v1.8.3.js?v=1",
  "./cloud-shadow-sync-v1.8.3.js?v=1",
  "./cloud-shadow-bootstrap-v1.8.3.js?v=1",
  "./cloud-sync-reconciliation-v1.8.3.js?v=1",
  "./cloud-sync-stage-policy-v1.8.3.js?v=1",
  "./cloud-sync-rollout-control-v1.8.3.js?v=1",
  "./cloud-dual-write-coordinator-v1.8.3.js?v=1",
  "./cloud-normalized-read-fallback-v1.8.3.js?v=1",
  "./voice-assisted-entry-v1.8.3.js?v=1",
  "./photo-assisted-entry-v1.8.3.js?v=3",
  "./how-to-navigation-v1.8.1.js?v=1",
  "./direct-transfer-core-v1.8.2.js?v=1",
  "./direct-transfer-v1.8.2.js?v=1",
  "./direct-transfer-v1.8.2.css?v=1",
  "./paper-pedigree-import-core-v1.8.2.js?v=1",
  "./paper-pedigree-import-v1.8.2.js?v=3",
  "./registration-safety-v1.8.1.js?v=1",
  "./subscription-referral-policy-v1.8.1.js?v=3",
  "./subscription-admin-credits-v1.8.1.js?v=1",
  "./subscription-launch-v1.8.1.js?v=3",
  "./subscription-engine-v1.8.0.js?v=4",
  "./subscription-engine-v1.8.0.css?v=1",
  "./subscription-member-ui-v1.8.0.css?v=1",
  "./subscription-tab-visibility-v1.8.0.js?v=2",
  "./subscription-header-copy-v1.8.0.js?v=3",
  "./subscription-stripe-provider-v1.8.0.js?v=3",
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
  "./breeding-litter-workspace-v1.8.2.js?v=2",
  "./breeding-litter-workspace-integration-v1.8.2.js?v=1",
  "./breeding-litter-workspace-v1.8.2.css?v=1",
  "./litter-sale-transfer-core-v1.8.2.js?v=1",
  "./litter-sale-transfer-v1.8.2.js?v=1",
  "./litter-sale-transfer-v1.8.2.css?v=1",
  "./breeding-next-action-core-v1.8.2.js?v=3",
  "./breeding-next-action-v1.8.2.js?v=3",
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
  "./pedigree-genetics-v1.6.1.js?v=2",
  "./breeding-intelligence-core-v1.6.1.js?v=1.7.1",
  "./rabbit-genetics-v1.6.1.js?v=3",
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
  "./rabbit-genetics-ui-advanced-v1.6.1.js?v=4",
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
  "/account-boundary-core-v1.8.4.js",
  "/herdharbor-monitoring-config.js",
  "/herdharbor-release-v1.6.1.js",
  "/herdharbor-membership-v1.6.1.js",
  "/marketplace-nav-v2.0.1.js",
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
  "/pedigree-engine-v2.0.0.js",
  "/pedigree-customization-v2.0.0.css",
  "/pedigree-customization-v2.0.0.js",
  "/pedigree-documents-v2.0.0.css",
  "/pedigree-documents-v2.0.0.js",
  "/pedigree-renderer-v2.0.0.css",
  "/pedigree-renderer-v2.0.0.js",
  "/document-export-v2.0.0.js",
  "/standard-pedigree-print-v2.0.0.js",
  "/birth-certificate-v2.0.0.css",
  "/birth-certificate-v2.0.0.js",
  "/animal-documents-v2.0.0.css",
  "/animal-documents-v2.0.0.js",
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

function shellCacheVersion(name) {
  const match = String(name || "").match(/v(\d+)\.(\d+)\.(\d+)/i);
  return match ? match.slice(1).map(Number) : [0, 0, 0];
}

async function pruneObsoleteShellCaches() {
  const names = (await caches.keys()).filter((key) => key.startsWith(CACHE_PREFIX));
  names.sort((left, right) => {
    const a = shellCacheVersion(left);
    const b = shellCacheVersion(right);
    for (let index = 0; index < 3; index += 1) {
      if (a[index] !== b[index]) return b[index] - a[index];
    }
    if (left === CACHE_NAME) return -1;
    if (right === CACHE_NAME) return 1;
    return right.localeCompare(left);
  });

  // Keep the active shell and two prior, provenance-named releases. An update
  // readiness handshake proves no silent/dirty old client is still depending
  // on older assets before activation prunes anything beyond that bound.
  await Promise.all(names.slice(3).map((key) => caches.delete(key)));
}

// Only the audited, static documentation document is exempt. Its search and
// feedback controls are ephemeral; it loads no app, account or storage engine.
function isReadOnlyDocumentationClient(client) {
  if (!client.id || client.type !== "window" || client.frameType !== "top-level") return false;
  try {
    const url = new URL(client.url);
    const scope = new URL(self.registration?.scope || "./", self.location.href);
    return url.origin === self.location.origin && !url.username && !url.password &&
      [new URL("how-to/", scope).pathname, new URL("how-to/index.html", scope).pathname].includes(url.pathname);
  } catch { return false; }
}

async function allOpenClientsReadyForUpdate() {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  if (!clients.length) return true;
  // Copy identities now: WindowClient URL may change while other tabs reply.
  const scanned = clients.map(({ id, url }) => ({ id, url }));
  const requestId = `${CACHE_NAME}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const responses = await Promise.all(clients.map((client) => new Promise((resolve) => {
    if (isReadOnlyDocumentationClient(client)) {
      resolve(true);
      return;
    }
    if (typeof MessageChannel === "undefined") {
      resolve(false);
      return;
    }
    const channel = new MessageChannel();
    let settled = false;
    const finish = (ready) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { channel.port1.close(); } catch {}
      try { channel.port2.close(); } catch {}
      resolve(ready === true);
    };
    const timer = setTimeout(() => finish(false), 2500);
    channel.port1.onmessage = (messageEvent) => {
      const data = messageEvent.data;
      finish(data?.type === "HH_UPDATE_READINESS_RESPONSE" && data.requestId === requestId && data.ready === true);
    };
    channel.port1.start?.();
    try {
      client.postMessage({ type: "HH_UPDATE_READINESS_QUERY", requestId }, [channel.port2]);
    } catch {
      finish(false);
    }
  })));
  if (responses.length !== clients.length || !responses.every(Boolean)) return false;
  // Fail closed if a document navigated or a new editor opened during the
  // readiness exchange. A later user retry queries the new client set.
  const current = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  return current.length === scanned.length && current.every((client) =>
    scanned.some((before) => before.id === client.id && before.url === client.url));
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
      // Every entry in REQUIRED_SHELL is essential to a usable offline install.
      // Optional/lazy assets belong in RUNTIME_CACHE_PATHS, not this list.
      if (requiredFailures.length) throw new Error("Required HerdHarbor shell assets failed to cache: " + requiredFailures.join(", "));
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    pruneObsoleteShellCaches()
      .then(async () => {
        try {
          await self.registration?.navigationPreload?.enable?.();
        } catch {}
        return self.clients.claim();
      })
  );
});

self.addEventListener("message", (event) => {
  // A legacy click is a request, never proof that its in-memory edits are safe.
  // Loaded 2.0.0 timeout navigation cannot be stopped by this worker; see the
  // S17 release blocker and save/close/reopen procedure.
  if (!["HH_CHECK_UPDATE_READINESS", "SKIP_WAITING"].includes(event.data?.type)) return;
  event.waitUntil((async () => {
    const ready = await allOpenClientsReadyForUpdate();
    if (ready) {
      self.skipWaiting();
      return;
    }
    try { event.source?.postMessage({ type: "HH_UPDATE_DEFERRED" }); } catch {}
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const appRoot = new URL("./", self.location.href).pathname;
      const appIndex = new URL("./index.html", self.location.href).pathname;
      const isAppShell = url.pathname === appRoot || url.pathname === appIndex;
      const cacheKey = isAppShell ? "./index.html" : request;
      try {
        const preloaded = await event.preloadResponse;
        const response = preloaded || await fetch(request, { cache: "no-store" });
        if (response?.ok && response.type === "basic") {
          const copy = response.clone();
          // A How-To or other HTML route must never replace the offline app
          // homepage. Each non-app navigation keeps its own cache identity.
          event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, copy))
          );
        }
        return response;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        if (isAppShell) return (await cache.match("./index.html")) || cache.match("./");
        // Never show a cached application or unrelated member document at
        // another URL merely because the requested route is offline.
        return (await cache.match(request, { ignoreSearch: true })) || Response.error();
      }
    })());
    return;
  }

  // Production JS/CSS is content-fingerprinted by the release builder.
  // Its URL identity changes whenever its bytes change, so a matching cached
  // response is exact and can safely bypass the network-first legacy list.
  if (isImmutableFingerprintAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (isNetworkFirstPath(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isRuntimeCachePath(url)) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});
