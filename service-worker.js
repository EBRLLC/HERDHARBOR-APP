"use strict";

const CACHE_PREFIX = "herdharbor-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v1.4.5-alpha-20260825-2`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json?v=15",
  "./herdharbor-cloud.js?v=17",
  "./symptom-guide.js?v=1",
  "./pwa.js?v=21",
  "./pedigree-visual.css?v=2",
  "./pedigree-visual.js?v=2",
  "./pedigree-genetics-v1.4.5.css?v=1.4.5",
  "./pedigree-genetics-v1.4.5.js?v=1.4.5",
  "./breeding-intelligence-core.js?v=1.4.0",
  "./rabbit-records-v1.4.5.js?v=1.4.5",
  "./rabbit-genetics-engine-v2.js?v=2.0.0",
  "./rabbit-genetics-engine-v1.4.5.js?v=1.4.5",
  "./rabbit-genetics-runtime-v1.4.5.js?v=1.4.5",
  "./breeding-intelligence.css?v=1.4.0",
  "./breeding-genetics-v2.css?v=2.0.0",
  "./breeding-intelligence.js?v=1.4.0",
  "./breeding-pair-hotfix-v1.4.2.js?v=1",
  "./rabbit-genetics-ui-v1.4.5.js?v=1.4.5",
  "./rabbit-genetics-ui-v2.js?v=2.0.0",
  "./breeding-intelligence-tools.js?v=1.4.0",
  "./herdharbor-release-v1.4.5.js?v=1.4.5",
  "./vendor/supabase-2.111.0.js",
  "./vendor/jszip-3.10.1.min.js",
  "./vendor/exceljs-4.4.0.min.js",
  "./vendor/qrcode-generator-1.4.4.js",
  "./spreadsheet-import.js?v=17",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => { if (event.data?.type === "SKIP_WAITING") self.skipWaiting(); });

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok && url.pathname.endsWith("/")) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy)));
      }
      return response;
    }).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match("./index.html")) || cache.match("./");
    }));
    return;
  }

  const forceFresh = url.pathname.endsWith("/pwa.js") ||
    url.pathname.endsWith("/breeding-pair-hotfix-v1.4.2.js") ||
    url.pathname.endsWith("/rabbit-records-v1.4.5.js") ||
    url.pathname.endsWith("/rabbit-genetics-engine-v2.js") ||
    url.pathname.endsWith("/rabbit-genetics-engine-v1.4.5.js") ||
    url.pathname.endsWith("/rabbit-genetics-runtime-v1.4.5.js") ||
    url.pathname.endsWith("/rabbit-genetics-ui-v1.4.5.js") ||
    url.pathname.endsWith("/rabbit-genetics-ui-v2.js") ||
    url.pathname.endsWith("/pedigree-genetics-v1.4.5.js") ||
    url.pathname.endsWith("/pedigree-genetics-v1.4.5.css") ||
    url.pathname.endsWith("/herdharbor-release-v1.4.5.js") ||
    url.pathname.endsWith("/breeding-genetics-v2.css");
  if (forceFresh) {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok && response.type === "basic") {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
      }
      return response;
    }).catch(() => caches.match(request)));
    return;
  }

  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok && response.type === "basic") {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
    }
    return response;
  })));
});
