"use strict";

const CACHE_PREFIX = "herdharbor-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v1.4.1-alpha-20260824-1`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json?v=15",
  "./herdharbor-cloud.js?v=17",
  "./symptom-guide.js?v=1",
  "./pwa.js?v=23",
  "./pedigree-visual.css?v=2",
  "./pedigree-visual.js?v=2",
  "./breeding-intelligence-core.js?v=1.4.0",
  "./breeding-intelligence.css?v=1.4.0",
  "./breeding-intelligence.js?v=1.4.0",
  "./breeding-pair-hotfix-v1.4.1.js?v=1",
  "./breeding-intelligence-tools.js?v=1.4.0",
  "./vendor/supabase-2.111.0.js",
  "./vendor/jszip-3.10.1.min.js",
  "./vendor/exceljs-4.4.0.min.js",
  "./vendor/qrcode-generator-1.4.4.js",
  "./spreadsheet-import.js?v=17",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
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
      fetch(request)
        .then((response) => {
          if (response.ok && url.pathname.endsWith("/")) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy)));
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

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
        }
        return response;
      });
    })
  );
});
