"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (name) => fs.readFileSync(path.join(__dirname, "..", name), "utf8");
const syncSource = read("cloud-sync-rollout-runtime-v1.8.4.js");
const getSyncApi = () => {
  const global = {};
  const module = { exports: {} };
  new Function("globalThis", "module", syncSource)(global, module);
  return module.exports;
};
const ticks = async () => { for (let n = 0; n < 40; n++) await Promise.resolve(); };

function setupSyncRuntime() {
  const api = getSyncApi();
  let session = { user: { id: "account-a" } };
  const listeners = new Map();
  const released = [];
  const baselines = [];
  let recordStage = "legacy";
  let delayManifest = false;
  let resolveManifest = null;
  const root = {
    document: {
      addEventListener(type, listener) { listeners.set(type, listener); },
      dispatchEvent() {}
    },
    CustomEvent: class { constructor(_type, options) { this.detail = options.detail; } }
  };
  const modules = {
    normalizer: { mapLegacySnapshot() {}, reassembleAuthoritativeSnapshotWithMetadata() {}, namespace: "farm", formatVersion: 1 },
    baselineApi: { createIndexedDbStore(options) { baselines.push(options.ownerId); return {}; } },
    workerApi: { create() { return {}; } },
    cohortApi: { createCohortGate() { return { evaluate() { return { eligible: true }; } }; } },
    shadowApi: { createShadowSyncController() { return {}; } },
    bootstrapApi: { createShadowBootstrap() { return {}; } },
    reconciliationApi: { reconcileSnapshot() { return {}; }, createRolloutMetrics() { return { recordEvent() {}, snapshot() { return {}; } }; } },
    rolloutApi: { createRolloutControl() { return {}; } },
    dualWriteApi: { createDualWriteCoordinator() { return {}; } },
    readApi: { createReadResolver() { return {}; } }
  };
  const cloud = {
    getSession: () => session,
    syncNow: async () => true,
    getNormalizedSyncCohortStatus: async () => ({
      eligible: true, mode: "allowlist", percentageEnabled: false, schemaVerified: true, stage: "legacy"
    }),
    createNormalizedRecordStore: () => ({ getManifest: async () => {
      if (delayManifest) {
        delayManifest = false;
        await new Promise(resolve => { resolveManifest = resolve; });
      }
      return { cutover_stage: recordStage };
    } }),
    readLegacySnapshotForNormalizedSync: async () => ({ snapshot: {} })
  };
  const runtime = api.create({
    root, cloud,
    stateStore: { getState: () => ({}), getOutbox: () => [] },
    modules,
    loadDependencies: () => new Promise(resolve => released.push(resolve))
  });
  return {
    runtime, listeners, released, baselines,
    setStage(stage) { recordStage = stage; },
    pauseNextManifest() { delayManifest = true; },
    resumeManifest() { resolveManifest?.(); resolveManifest = null; },
    get manifestPending() { return resolveManifest !== null; },
    switchTo(id, event = "herdharbor:auth-boundary") {
      session = id ? { user: { id } } : null;
      listeners.get(event)?.({});
      if (event !== "herdharbor:auth-session") listeners.get("herdharbor:auth-session")?.({});
    }
  };
}

test("account A cannot publish a normalized context after an A-to-B sign-in during dependency load", async () => {
  const testCase = setupSyncRuntime();
  const starting = testCase.runtime.start({ confirmLegacy: false });
  await ticks();
  assert.equal(testCase.released.length, 1, "A must be waiting for its module loader");
  testCase.switchTo("account-b");
  await ticks();
  assert.equal(testCase.released.length, 2, "B gets a fresh owner-specific setup");
  testCase.released[0]();
  await assert.rejects(starting, error => error.code === "HH_SYNC_ACCOUNT_CHANGED");
  assert.ok(!testCase.baselines.includes("account-a"), "stale A baseline must not be initialized");
  testCase.released[1]();
  await ticks();
  assert.deepEqual(testCase.baselines, ["account-b"]);
});

test("same-account session refresh does not restart an active normalized setup", async () => {
  const testCase = setupSyncRuntime();
  const starting = testCase.runtime.start({ confirmLegacy: false });
  await ticks();
  testCase.switchTo("account-a", "herdharbor:auth-session");
  await ticks();
  assert.equal(testCase.released.length, 1);
  testCase.released[0]();
  await starting;
  assert.deepEqual(testCase.baselines, ["account-a"]);
});


test("in-flight normalized stage read is rejected after account switch, before priming an old-owner baseline", async () => {
  const testCase = setupSyncRuntime();
  const started = testCase.runtime.start({ confirmLegacy: false });
  await ticks();
  testCase.released[0]();
  await started;
  assert.deepEqual(testCase.baselines, ["account-a"]);

  testCase.setStage("dual_write");
  testCase.pauseNextManifest();
  const pending = testCase.runtime.refreshDualWriteBaseline();
  await ticks();
  assert.equal(testCase.manifestPending, true, "test must suspend the actual stage read");

  testCase.switchTo("account-b");
  await ticks();
  testCase.resumeManifest();
  await assert.rejects(pending, error => error.code === "HH_SYNC_ACCOUNT_CHANGED");
  assert.deepEqual(testCase.baselines, ["account-a"],
    "stale account A must not initialize or prime its baseline for account B");
});

test("A-to-B-to-A during an in-flight normalized read still invalidates the original A context", async () => {
  const testCase = setupSyncRuntime();
  const starting = testCase.runtime.start({ confirmLegacy: false });
  await ticks();
  testCase.released[0]();
  await starting;
  testCase.setStage("dual_write");
  testCase.pauseNextManifest();
  const pending = testCase.runtime.refreshDualWriteBaseline();
  await ticks();
  assert.equal(testCase.manifestPending, true);
  testCase.switchTo("account-b");
  await ticks();
  testCase.switchTo("account-a");
  await ticks();
  // Matching the old user ID is not sufficient; the original context was
  // invalidated by the B boundary, even though the active ID is A again.
  testCase.resumeManifest();
  await assert.rejects(pending, error => error.code === "HH_SYNC_ACCOUNT_CHANGED");
  assert.deepEqual(testCase.baselines, ["account-a"]);
});

test("failed dependency element is removed; next attempt can create a fresh script", async () => {
  const beginning = syncSource.indexOf("  function browserScriptLoader(root) {");
  const ending = syncSource.indexOf("  function create(options = {}) {", beginning);
  assert.ok(beginning >= 0 && ending > beginning);
  const loaderBody = syncSource.slice(beginning, ending);
  const elements = new Map(), attached = [];
  const root = {
    setTimeout() { return 7; }, clearTimeout() {},
    document: {
      head: { appendChild(node) { elements.set(node.id, node); attached.push(node); } },
      getElementById(id) { return elements.get(id) || null; },
      createElement() {
        return {
          id: "", dataset: {}, handlers: new Map(),
          addEventListener(type, fn) { this.handlers.set(type, fn); },
          removeEventListener(type) { this.handlers.delete(type); },
          remove() { elements.delete(this.id); }
        };
      }
    }
  };
  const loader = new Function("DEPENDENCIES", "root", loaderBody + "\nreturn browserScriptLoader(root);")(
    [["test-cloud-script", "test-cloud-script.js"]], root
  );
  const first = loader();
  assert.equal(attached.length, 1);
  attached[0].handlers.get("error")();
  await assert.rejects(first, /Could not load test-cloud-script/);
  assert.equal(elements.has("test-cloud-script"), false);
  const second = loader();
  assert.equal(attached.length, 2);
  assert.notEqual(attached[0], attached[1]);
  attached[1].handlers.get("load")();
  await second;
});

test("the required offline shell is strict JSON for the fingerprinted release builder", () => {
  const worker = read("service-worker.js");
  const shell = worker.match(/const REQUIRED_SHELL = (\[[\s\S]*?\]);/)?.[1];
  assert.ok(shell);
  const assets = JSON.parse(shell);
  assert.ok(assets.length >= 30);
  assert.ok(assets.some(asset => asset.includes("herdharbor-cloud.js")));
  assert.ok(!assets.includes("./how-to/"));
  assert.ok(!assets.includes("./icon-192.png"));
  assert.ok(!assets.includes("./icon-512.png"));
});

test("How-To and install icons are optional while the operational PWA shell stays mandatory", async () => {
  const source = read("service-worker.js");
  const vm = require("node:vm");
  for (const unavailable of ["/how-to/", "/icon-192.png", "/icon-512.png"]) {
    const handlers = {}, added = [];
    const self = {
      location: { href: "https://app.herdharbor.com/service-worker.js", origin: "https://app.herdharbor.com" },
      addEventListener(type, fn) { handlers[type] = fn; }
    };
    const caches = { async open() { return { async add(request) {
      added.push(request.url);
      if (new URL(request.url).pathname === unavailable) throw new Error("Nonessential asset offline");
    }}; } };
    class RequestStub { constructor(url) { this.url = String(url); } }
    vm.runInNewContext(source, { self, caches, Request: RequestStub, URL, Promise, console });
    let pending;
    handlers.install({ waitUntil(promise) { pending = promise; } });
    await pending;
    assert.equal(added.some(url => new URL(url).pathname === unavailable), false,
      unavailable + " must not be required for offline startup");
    assert.ok(source.includes('"."' + unavailable + '"') ||
      source.includes('"./' + unavailable.slice(1) + '"'),
      unavailable + " remains available for runtime caching");
  }
});

test("AI tester preference follows authenticated account rather than entire browser", async () => {
  const values = new Map();
  let userId = "account-a";
  const docListeners = new Map();
  const document = {
    readyState: "loading",
    documentElement: { dataset: {}, appendChild() {} },
    getElementById() { return null; },
    createElement() { return { id: "", textContent: "" }; },
    addEventListener(type, fn) { docListeners.set(type, fn); }
  };
  const window = {
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: key => values.delete(key)
    },
    HerdHarborCloud: { getSession: () => ({ user: { id: userId } }) },
    HerdHarborVoiceAssistedEntry: { create() {} },
    HerdHarborPhotoAssistedEntry: { create() {} },
    addEventListener() {}
  };
  new Function("window", "document", "console", read("herdharbor-optional-tools.js"))(window, document, console);
  const tools = window.HerdHarborOptionalTools;
  assert.equal(tools.setAiLiveTesterEnabled(true), true);
  assert.equal(values.get("herdharbor_ai_live_tester_v1:account-a"), "1");
  userId = "account-b";
  docListeners.get("herdharbor:auth-boundary")({});
  assert.equal(document.documentElement.dataset.hhAiLiveTester, "false");
  assert.equal(tools.isAiLiveTester(), false);
  docListeners.get("herdharbor:auth-session")({});
  assert.equal(document.documentElement.dataset.hhAiLiveTester, "false");
  userId = "account-a";
  docListeners.get("herdharbor:auth-session")({});
  assert.equal(tools.isAiLiveTester(), true);
  assert.equal(values.has("herdharbor_ai_live_tester_v1"), false);
});

test("changed browser scripts share a coherent offline release revision", () => {
  const html = read("index.html"), worker = read("service-worker.js");
  for (const source of [html, worker]) {
    assert.ok(source.includes("herdharbor-optional-tools.js?v=4"));
    assert.ok(source.includes("cloud-sync-rollout-runtime-v1.8.4.js?v=5"));
  }
});
