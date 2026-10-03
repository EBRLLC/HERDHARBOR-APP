"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const workerSource = read("service-worker.js");
const pwaSource = read("pwa.js");
const index = read("index.html");

function loadWorkerHarness(cacheKeys) {
  const listeners = {};
  const deleted = [];
  let claimed = 0;
  let navigationPreloadEnabled = 0;
  let skipWaitingCalls = 0;

  const caches = {
    async keys() { return [...cacheKeys]; },
    async delete(key) { deleted.push(key); return true; },
    async open() { throw new Error("activate test must not open a cache"); },
    async match() { return undefined; }
  };

  const self = {
    location: { href: "https://app.herdharbor.com/service-worker.js", origin: "https://app.herdharbor.com" },
    registration: {
      navigationPreload: {
        async enable() { navigationPreloadEnabled += 1; }
      }
    },
    clients: {
      async claim() { claimed += 1; }
    },
    skipWaiting() { skipWaitingCalls += 1; },
    addEventListener(type, handler) { listeners[type] = handler; }
  };

  vm.runInNewContext(workerSource, {
    self,
    caches,
    URL,
    Request: class Request {},
    Promise,
    console
  }, { filename: "service-worker.js" });

  return {
    listeners,
    deleted,
    get claimed() { return claimed; },
    get navigationPreloadEnabled() { return navigationPreloadEnabled; },
    get skipWaitingCalls() { return skipWaitingCalls; }
  };
}

test("2.0.0 activation retires prior HerdHarbor shells but preserves current and unrelated caches", async () => {
  const current = "herdharbor-shell-v2.0.0-v2.0.0-release-2";
  const old200 = "herdharbor-shell-v2.0.0-v2.0.0-release-1";
  const old184 = "herdharbor-shell-v1.8.4-alpha-v1.8.4-release-9";
  const old182 = "herdharbor-shell-v1.8.2-alpha-cloud-sync-v2-state-integrity-1";
  const unrelated = "other-app-cache";

  const h = loadWorkerHarness([old200, old184, old182, current, unrelated]);
  assert.equal(typeof h.listeners.activate, "function");

  let activation;
  h.listeners.activate({ waitUntil(promise) { activation = promise; } });
  await activation;

  assert.deepEqual(new Set(h.deleted), new Set([old200, old184, old182]));
  assert.equal(h.deleted.includes(current), false);
  assert.equal(h.deleted.includes(unrelated), false);
  assert.equal(h.navigationPreloadEnabled, 1);
  assert.equal(h.claimed, 1);
});

test("2.0.0 worker still waits for explicit Update Now activation", () => {
  const h = loadWorkerHarness([]);
  assert.equal(typeof h.listeners.message, "function");
  h.listeners.message({ data: { type: "NOOP" } });
  assert.equal(h.skipWaitingCalls, 0);
  h.listeners.message({ data: { type: "SKIP_WAITING" } });
  assert.equal(h.skipWaitingCalls, 1);

  const install = workerSource.match(/self\.addEventListener\("install",[\s\S]*?\n\}\);/);
  assert.ok(install);
  assert.doesNotMatch(install[0], /skipWaiting/);
  assert.match(pwaSource, /postMessage\(\{ type: "SKIP_WAITING" \}\)/);
  assert.match(pwaSource, /controllerchange/);
});

test("2.0.0 shell bootstrap and required precache agree on the release query identity", () => {
  assert.match(index, /manifest\.json\?v=2\.0\.0/);
  assert.match(index, /herdharbor-build\.js\?v=2\.0\.0-r2/);
  assert.match(index, /pwa\.js\?v=35/);
  assert.match(workerSource, /herdharbor-shell-v2\.0\.0-v2\.0\.0-release-2/);
  assert.match(workerSource, /\.\/manifest\.json\?v=2\.0\.0/);
  assert.match(workerSource, /\.\/herdharbor-build\.js\?v=2\.0\.0-r2/);
  assert.match(workerSource, /\.\/pwa\.js\?v=35/);
  assert.match(workerSource, /\.\/herdharbor-monitoring-config\.js\?v=2\.0\.0/);
  assert.match(workerSource, /\.\/vendor\/herdharbor-monitoring-v1\.6\.1\.min\.js\?v=2\.0\.0/);
});

test("PWA update stays independent from farm state and hides the internal build id", () => {
  assert.doesNotMatch(pwaSource, /localStorage\.(?:clear|removeItem)\(/);
  assert.doesNotMatch(pwaSource, /HerdHarborCloud|syncNow\(/);
  assert.match(pwaSource, /const versionText = `Version \$\{APP_VERSION\}`/);
  assert.doesNotMatch(pwaSource, /Version \$\{APP_VERSION\} · Build \$\{BUILD_ID\}/);
  assert.match(pwaSource, /manifest\.json\?build=\$\{encodeURIComponent\(PWA_BUILD\)\}/);
});

test("fingerprinted release assets remain cache-first while mutable release assets remain network-first", () => {
  assert.match(workerSource, /function isImmutableFingerprintAsset/);
  assert.match(workerSource, /searchParams\.get\("rev"\)/);
  assert.match(workerSource, /event\.respondWith\(cacheFirst\(request\)\)/);
  assert.match(workerSource, /NETWORK_FIRST_PATHS/);
  for (const token of ["/manifest.json", "/herdharbor-build.js", "/pwa.js", "/herdharbor-cloud.js"]) {
    assert.ok(workerSource.includes(token), token);
  }
  assert.match(workerSource, /fetch\(request, \{ cache: "no-store" \}\)/);
});
