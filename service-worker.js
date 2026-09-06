"use strict";

const CACHE_PREFIX = "herdharbor-shell-";
const CACHE_NAME = "herdharbor-shell-v1.8.1-alpha-october-launch-trial-1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json?v=1.7.1",
  "./herdharbor-release-v1.6.1.js?v=1.7.1",
  "./herdharbor-membership-v1.6.1.js?v=1.7.1",
  "./herdharbor-billing-v1.6.1.js?v=1.7.1",
  "./herdharbor-access-cache-v1.6.1.js?v=1.7.1",
  "./herdharbor-cloud.js?v=20",
  "./herdharbor-admin-v1.6.1.js?v=1.7.1",
  "./herdharbor-core-v1.6.1.css?v=1.7.1",
  "./herdharbor-v1.6.1.css?v=1.7.1",
  "./herdharbor-build.js?v=1.7.1",
  "./subscription-engine-v1.8.0.js?v=1",
  "./subscription-engine-v1.8.0.css?v=1",
  "./mobile-viewport-hotfix-v1.8.0.css?v=1",
  "./subscription-launch-v1.8.1.js?v=1",
  "./subscription-launch-v1.8.1.css?v=1",
  "./herdharbor-v1.7.1-stability-hotfix.js?v=2",
  "./workflow-phase1-v1.7.1.js?v=2",
  "./workflow-phase1-v1.7.1.css?v=2",
  "./analytics-v1.6.1.css?v=1.7.1",
  "./market-analytics-v1.6.5.js?v=1.7.1",
  "./analytics-v1.6.1.js?v=1.7.1",
  "./herdharbor-monitoring-config.js?v=1.7.1",
  "./vendor/herdharbor-monitoring-v1.6.1.min.js?v=1.7.1",
  "./symptom-guide.js?v=1",
  "./health-intelligence-v1.7.1.js?v=1.7.1",
  "./health-intelligence-v1.7.1.css?v=1.7.1",
  "./pwa.js?v=29",
  "./pedigree-visual.css?v=2",
  "./pedigree-visual.js?v=2",
  "./pedigree-genetics-v1.6.1.css?v=1.7.1",
  "./pedigree-genetics-v1.6.1.js?v=1.7.1",
  "./breeding-intelligence-core-v1.6.1.js?v=1.7.1",
  "./rabbit-genetics-v1.6.1.js?v=1.7.1",
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
  "./rabbit-genetics-ui-advanced-v1.6.1.js?v=1.7.1",
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
  "./vendor/supabase-2.111.0.js",
  "./vendor/jszip-3.10.1.min.js",
  "./vendor/exceljs-4.4.0.min.js",
  "./vendor/qrcode-generator-1.4.4.js",
  "./spreadsheet-import.js?v=17",
  "./icon-192.png",
  "./icon-512.png"
];

const NETWORK_FIRST_PATHS = [
  "/manifest.json",
  "/herdharbor-release-v1.6.1.js",
  "/herdharbor-membership-v1.6.1.js",
  "/herdharbor-billing-v1.6.1.js",
  "/herdharbor-access-cache-v1.6.1.js",
  "/pwa.js",
  "/herdharbor-cloud.js",
  "/herdharbor-admin-v1.6.1.js",
  "/herdharbor-core-v1.6.1.css",
  "/herdharbor-v1.6.1.css",
  "/herdharbor-build.js",
  "/subscription-engine-v1.8.0.js",
  "/subscription-engine-v1.8.0.css",
  "/mobile-viewport-hotfix-v1.8.0.css",
  "/subscription-launch-v1.8.1.js",
  "/subscription-launch-v1.8.1.css",
  "/herdharbor-v1.7.1-stability-hotfix.js",
  "/workflow-phase1-v1.7.1.js",
  "/workflow-phase1-v1.7.1.css",
  "/analytics-v1.6.1.css",
  "/market-analytics-v1.6.5.js",
  "/analytics-v1.6.1.js",
  "/herdharbor-monitoring-config.js",
  "/vendor/herdharbor-monitoring-v1.6.1.min.js",
  "/symptom-guide.js",
  "/health-intelligence-v1.7.1.js",
  "/health-intelligence-v1.7.1.css",
  "/spreadsheet-import.js",
  "/pedigree-visual.css",
  "/pedigree-visual.js",
  "/pedigree-genetics-v1.6.1.css",
  "/pedigree-genetics-v1.6.1.js",
  "/breeding-intelligence-core-v1.6.1.js",
  "/rabbit-genetics-v1.6.1.js",
  "/standards-registry-v1.6.1.js",
  "/multispecies-genetics-v1.7.1.js",
  "/multispecies-genetics-ui-v1.7.1.js",
  "/multispecies-genetics-v1.7.1.css",
  "/standards-genetics-ui-v1.6.1.js",
  "/standards-genetics-v1.6.1.css",
  "/breeding-intelligence-v1.6.1.css",
  "/breeding-intelligence-v1.6.1.js",
  "/breeding-genetics-advanced-v1.6.1.css",
  "/breeding-pair-v1.6.1.js",
  "/rabbit-records-v1.6.1.js",
  "/rabbit-genetics-engine-advanced-v1.6.1.js",
  "/rabbit-genetics-engine-compat-v1.6.1.js",
  "/rabbit-genetics-runtime-v1.6.1.js",
  "/rabbit-genetics-ui-compat-v1.6.1.js",
  "/rabbit-genetics-ui-advanced-v1.6.1.js",
  "/breeding-intelligence-tools-v1.6.1.js",
  "/shows-v1.6.1.js",
  "/shows-v1.6.1-hardening.js",
  "/shows-v1.6.1-performance.js",
  "/shows-v1.6.1.css",
  "/standards-v1.7.0.css",
  "/standards-registry-v1.7.0.js",
  "/standards-ui-v1.7.0.js",
  "/standards-public-reference-v1.7.0.js",
  "/shows-youth-guides-v1.7.0.js",
  "/reference-guides-v1.7.0.css"
];

function isNetworkFirstPath(pathname) {
  return NETWORK_FIRST_PATHS.some((path) => pathname.endsWith(path));
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

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      const requests = APP_SHELL.map((path) => new Request(new URL(path, self.location.href), { cache: "reload" }));
      return cache.addAll(requests);
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

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok && response.type === "basic") {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
      }
      return response;
    }))
  );
});