"use strict";

const CACHE_PREFIX = "herdharbor-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v1.6.1-alpha-current-state-2`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json?v=17",
  "./herdharbor-release-v1.6.1.js?v=1.6.1",
  "./herdharbor-membership-v1.6.1.js?v=1.6.1",
  "./herdharbor-billing-v1.6.1.js?v=1.6.1",
  "./herdharbor-access-cache-v1.6.1.js?v=1.6.1",
  "./herdharbor-cloud.js?v=19",
  "./herdharbor-admin-v1.6.1.js?v=1.6.1",
  "./herdharbor-core-v1.6.1.css?v=1.6.1",
  "./herdharbor-v1.6.1.css?v=1.6.1",
  "./herdharbor-build.js?v=1.6.1",
  "./analytics-v1.6.1.css?v=1.6.1",
  "./analytics-v1.6.1.js?v=1.6.1",
  "./herdharbor-monitoring-config.js?v=1.6.1",
  "./vendor/herdharbor-monitoring-v1.6.1.min.js?v=1.6.1",
  "./symptom-guide.js?v=1",
  "./pwa.js?v=25",
  "./pedigree-visual.css?v=2",
  "./pedigree-visual.js?v=2",
  "./pedigree-genetics-v1.6.1.css?v=1.6.1",
  "./pedigree-genetics-v1.6.1.js?v=1.6.1",
  "./breeding-intelligence-core-v1.6.1.js?v=1.6.1",
  "./rabbit-genetics-v1.6.1.js?v=1.6.1",
  "./standards-registry-v1.6.1.js?v=1.6.1",
  "./multispecies-genetics-v1.6.1.js?v=1.6.1",
  "./standards-genetics-ui-v1.6.1.js?v=1.6.1",
  "./standards-genetics-v1.6.1.css?v=1.6.1",
  "./rabbit-records-v1.6.1.js?v=1.6.1",
  "./rabbit-genetics-engine-advanced-v1.6.1.js?v=1.6.1",
  "./rabbit-genetics-engine-compat-v1.6.1.js?v=1.6.1",
  "./rabbit-genetics-runtime-v1.6.1.js?v=1.6.1",
  "./breeding-intelligence-v1.6.1.css?v=1.6.1",
  "./breeding-genetics-advanced-v1.6.1.css?v=1.6.1",
  "./breeding-intelligence-v1.6.1.js?v=1.6.1",
  "./breeding-pair-v1.6.1.js?v=1.6.1",
  "./rabbit-genetics-ui-compat-v1.6.1.js?v=1.6.1",
  "./rabbit-genetics-ui-advanced-v1.6.1.js?v=1.6.1",
  "./breeding-intelligence-tools-v1.6.1.js?v=1.6.1",
  "./herdharbor-release-v1.6.1.js?v=1.6.1",
  "./shows-v1.6.1.css?v=1.6.1",
  "./shows-v1.6.1.js?v=1.6.1",
  "./shows-v1.6.1-hardening.js?v=1.6.1",
  "./shows-v1.6.1-performance.js?v=1.6.1",
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
  "/analytics-v1.6.1.css",
  "/analytics-v1.6.1.js",
  "/herdharbor-monitoring-config.js",
  "/vendor/herdharbor-monitoring-v1.6.1.min.js",
  "/symptom-guide.js",
  "/spreadsheet-import.js",
  "/pedigree-visual.css",
  "/pedigree-visual.js",
  "/pedigree-genetics-v1.6.1.css",
  "/pedigree-genetics-v1.6.1.js",
  "/breeding-intelligence-core-v1.6.1.js",
  "/rabbit-genetics-v1.6.1.js",
  "/standards-registry-v1.6.1.js",
  "/multispecies-genetics-v1.6.1.js",
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
  "/herdharbor-release-v1.6.1.js",
  "/shows-v1.6.1.js",
  "/shows-v1.6.1-hardening.js",
  "/shows-v1.6.1-performance.js",
  "/shows-v1.6.1.css"
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
