const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const stageScript = path.join(root, "scripts", "stage-release-assets.mjs");
const workerSource = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

function fixture(appBody = "window.APP_BUILD = 1;") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hh-release-assets-"));
  fs.writeFileSync(path.join(dir, "index.html"), '<!doctype html><link rel="stylesheet" href="style.css?v=1"><script src="app.js?v=1"></script>');
  fs.writeFileSync(path.join(dir, "app.js"), appBody + '\nconst lazy = "lazy.js?v=1";');
  fs.writeFileSync(path.join(dir, "lazy.js"), "window.LAZY = true;");
  fs.writeFileSync(path.join(dir, "style.css"), "body { display: block; }");
  fs.writeFileSync(path.join(dir, "service-worker.js"), workerSource);
  return dir;
}

function stage(dir) {
  execFileSync(process.execPath, [stageScript, "--root", dir, "--release-sha", "test-sha"], { stdio: "pipe" });
  return JSON.parse(fs.readFileSync(path.join(dir, "release-asset-manifest.json"), "utf8"));
}

test("changed application JavaScript deterministically changes every served mutable asset identity", () => {
  const first = fixture("window.APP_BUILD = 1;");
  const second = fixture("window.APP_BUILD = 2;");
  try {
    const a = stage(first);
    const b = stage(second);
    assert.notEqual(a.revision, b.revision);
    const firstHtml = fs.readFileSync(path.join(first, "index.html"), "utf8");
    const secondHtml = fs.readFileSync(path.join(second, "index.html"), "utf8");
    assert.match(firstHtml, new RegExp("app\\.js\\?rev=" + a.revision));
    assert.match(secondHtml, new RegExp("app\\.js\\?rev=" + b.revision));
    assert.doesNotMatch(firstHtml, /\\.(?:js|css)\\?v=/);
    assert.doesNotMatch(secondHtml, /\\.(?:js|css)\\?v=/);
  } finally {
    fs.rmSync(first, { recursive: true, force: true });
    fs.rmSync(second, { recursive: true, force: true });
  }
});

test("dynamic JS/CSS references and service-worker cache generation use the exact same release manifest revision", () => {
  const dir = fixture();
  try {
    const manifest = stage(dir);
    const app = fs.readFileSync(path.join(dir, "app.js"), "utf8");
    const worker = fs.readFileSync(path.join(dir, "service-worker.js"), "utf8");
    assert.match(app, new RegExp("lazy\\.js\\?rev=" + manifest.revision));
    assert.ok(worker.includes('const RELEASE_ASSET_REVISION = "' + manifest.revision + '";'));
    assert.ok(worker.includes("const CACHE_NAME = CACHE_PREFIX + RELEASE_ASSET_REVISION;"));
    assert.doesNotMatch(worker, /__HH_RELEASE_ASSET_REVISION__/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function executeWorker() {
  const listeners = {};
  const deleted = [];
  const cache = {
    match: async (key) => String(key).includes("index.html") ? { source: "offline-shell" } : null,
    put: async () => {}
  };
  const caches = {
    open: async () => cache,
    match: async () => null,
    keys: async () => ["herdharbor-shell-old", "herdharbor-attachments"],
    delete: async (key) => { deleted.push(key); return true; }
  };
  let fetchCalls = 0;
  const context = {
    URL, Request,
    console,
    caches,
    fetch: async () => { fetchCalls += 1; throw new Error("offline"); },
    self: {
      location: { href: "https://app.test/service-worker.js", origin: "https://app.test" },
      clients: { claim: async () => {} },
      skipWaiting: () => {},
      addEventListener(type, handler) { listeners[type] = handler; }
    }
  };
  vm.runInNewContext(workerSource, context, { filename: "service-worker.js" });
  return { listeners, deleted, get fetchCalls() { return fetchCalls; } };
}

test("offline navigation fallback remains executable and activation removes only superseded HerdHarbor shell caches", async () => {
  const harness = executeWorker();
  let navigationPromise;
  harness.listeners.fetch({
    request: { method: "GET", mode: "navigate", url: "https://app.test/dashboard" },
    respondWith(value) { navigationPromise = value; },
    waitUntil() {}
  });
  const response = await navigationPromise;
  assert.equal(response.source, "offline-shell");

  let activationPromise;
  harness.listeners.activate({ waitUntil(value) { activationPromise = value; } });
  await activationPromise;
  assert.deepEqual(harness.deleted, ["herdharbor-shell-old"]);
});

test("auth/API and cross-origin requests are never served from the static application cache", () => {
  const harness = executeWorker();
  for (const url of [
    "https://project.supabase.co/auth/v1/token",
    "https://project.supabase.co/rest/v1/herdharbor_user_data",
    "https://app.test/auth/v1/token",
    "https://app.test/rest/v1/data",
    "https://app.test/functions/v1/test"
  ]) {
    let intercepted = false;
    harness.listeners.fetch({
      request: { method: "GET", mode: "cors", url },
      respondWith() { intercepted = true; },
      waitUntil() {}
    });
    assert.equal(intercepted, false, url);
  }
});
