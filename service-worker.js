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
  "./herdharbor-release-v1.6.1.js?v=1.7.1",
  "./herdharbor-membership-v1.6.1.js?v=1.7.1",
  "./herdharbor-billing-v1.6.1.js?v=1.7.1",
  "./herdharbor-access-cache-v1.6.1.js?v=1.7.1",
  "./herdharbor-cloud.js?v=21",
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

const NETWORK_FIRST_PATHS = [
  "/manifest.json",
  "/herdharbor-build.js",
  "/herdharbor-cloud.js",
  "/herdharbor-monitoring-config.js",
  "/herdharbor-release-v1.6.1.js",
  "/herdharbor-membership-v1.6.1.js",
  "/herdharbor-billing-v1.6.1.js",
  "/herdharbor-access-cache-v1.6.1.js"
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

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  return cacheFreshResponse(request, response);
}

function isVersionedStaticAsset(url) {
  if (!/\.(?:js|css|png|svg|webp|woff2?)$/i.test(url.pathname)) return false;
  return url.searchParams.has("v") || /\/vendor\//.test(url.pathname);
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
        path.endsWith("/index.html") ||
        path.endsWith("/herdharbor-build.js") ||
        path.endsWith("/herdharbor-app-runtime.js") ||
        path.endsWith("/herdharbor-cloud.js")
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

  if (isVersionedStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
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
