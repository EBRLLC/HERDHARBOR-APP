"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { MessageChannel } = require("node:worker_threads");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const rollout = read("cloud-sync-rollout-runtime-v1.8.4.js");
const pwa = read("pwa.js");
const worker = read("service-worker.js");

function extract(source, startText, endText) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start);
  assert.ok(start >= 0 && end > start, `Could not extract ${startText}`);
  return source.slice(start, end);
}

function validationHarness({ pauseAt, current = true, drain = { failed: 0 } } = {}) {
  let release;
  let didPause = false;
  let epoch = 4;
  const calls = [];
  const wait = async (name, result) => {
    calls.push(name);
    if (pauseAt === name && !didPause) {
      didPause = true;
      await new Promise((resolve) => { release = resolve; });
    }
    return result;
  };
  const ctx = {
    userId: "account-a", identityEpoch: 4, stage: "shadow",
    worker: { drain: () => wait("drain", drain) },
    recordStore: {
      list: () => wait("list", []),
      getManifest: () => wait("manifest", { cutover_stage: "shadow" })
    },
    normalizer: { namespace: "farm", mapLegacySnapshot() {} },
    shadowController: {
      sync: () => wait("sync", { checksum: "sum" }),
      verifyAndRecord: () => wait("verify", { ok: true, actualChecksum: "sum", expectedChecksum: "sum" })
    },
    reconciliationApi: { reconcileSnapshot: () => ({ recordsDiffering: 0 }) },
    metrics: { snapshot: () => ({}) }
  };
  let outbox = [];
  const stateStore = { getOutbox(ownerId) { assert.equal(ownerId, "account-a"); return outbox; } };
  const cloud = {
    getSession: () => ({ user: { id: current ? "account-a" : "account-b" } }),
    readLegacySnapshotForNormalizedSync: (userId) => {
      assert.equal(userId, "account-a");
      return wait("legacy", { snapshot: {}, updatedAt: "now" });
    }
  };
  let validationPasses = 0;
  let lastValidation = null;
  const events = [];
  const source = extract(rollout, "    async function validateNow() {", "    async function refreshContextStage(ctx) {");
  const factory = new Function("ensureContext", "assertContextCurrent", "bootstrapIfNeeded", "cloud", "stateStore", "emit", "stageOf", "reconciliationPass", `
    let validationPasses = 0, lastValidation = null;
    ${source}
    return { validateNow, state: () => ({ validationPasses, lastValidation }) };
  `);
  const runtime = factory(
    async () => ctx,
    (given) => { if (!current || given !== ctx || given.identityEpoch !== epoch) throw Object.assign(new Error("account changed"), { code: "HH_SYNC_ACCOUNT_CHANGED" }); },
    async () => wait("bootstrap", { ok: true }), cloud, stateStore,
    (type) => events.push(type), (manifest) => manifest.cutover_stage,
    (result) => Number(result?.recordsDiffering || 0) === 0
  );
  return {
    runtime, calls, events,
    get release() { return release; },
    switchAccount() { current = false; },
    switchAwayAndBack() { epoch += 1; },
    setOutbox(value) { outbox = value; }
  };
}

test("S16-A validation stops at an account boundary during drain without reading or recording a pass", async () => {
  const h = validationHarness({ pauseAt: "drain" });
  const pending = h.runtime.validateNow();
  await new Promise((resolve) => setImmediate(resolve));
  h.switchAccount();
  h.release();
  await assert.rejects(pending, (error) => error.code === "HH_SYNC_ACCOUNT_CHANGED");
  assert.deepEqual(h.calls, ["bootstrap", "drain"]);
  assert.deepEqual(h.events, []);
  assert.equal(h.runtime.state().validationPasses, 0);
  assert.equal(h.runtime.state().lastValidation, null);
});

test("S16-A validation fences a legacy read and never reaches normalized writes after the account changes", async () => {
  const h = validationHarness({ pauseAt: "legacy" });
  const pending = h.runtime.validateNow();
  await new Promise((resolve) => setImmediate(resolve));
  h.switchAccount();
  h.release();
  await assert.rejects(pending, (error) => error.code === "HH_SYNC_ACCOUNT_CHANGED");
  assert.deepEqual(h.calls, ["bootstrap", "drain", "legacy"]);
  assert.deepEqual(h.events, []);
});

test("S16-A validation fences every awaited verification boundary, including a rapid A-to-B-to-A switch", async () => {
  for (const pauseAt of ["list", "sync", "verify", "manifest"]) {
    const h = validationHarness({ pauseAt });
    const pending = h.runtime.validateNow();
    await new Promise((resolve) => setImmediate(resolve));
    h.switchAwayAndBack();
    h.release();
    await assert.rejects(pending, (error) => error.code === "HH_SYNC_ACCOUNT_CHANGED", pauseAt);
    assert.equal(h.events.includes("validation-pass"), false, pauseAt);
    assert.equal(h.runtime.state().validationPasses, 0, pauseAt);
  }
});

test("S16-A a failed outbox drain leaves the queued mutation pending for retry", async () => {
  const h = validationHarness({ drain: { failed: 1, pending: 1 } });
  h.setOutbox([{ mutationId: "m-1" }]);
  const result = await h.runtime.validateNow();
  assert.equal(result.reason, "pending-normalized-mutations");
  assert.deepEqual(h.calls, ["bootstrap", "drain"]);
  assert.equal(h.events.includes("validation-pass"), false);
});

test("S16-A successful validation passes an explicit user id and publishes only after all checks", async () => {
  const h = validationHarness();
  const result = await h.runtime.validateNow();
  assert.equal(result.ok, true);
  assert.deepEqual(h.calls, ["bootstrap", "drain", "legacy", "list", "sync", "verify", "list", "manifest"]);
  assert.deepEqual(h.events, ["validation-pass"]);
  assert.equal(h.runtime.state().validationPasses, 1);
});

function workerHarness(clients) {
  const listeners = {};
  let skips = 0;
  const self = {
    location: { href: "https://app.herdharbor.com/service-worker.js", origin: "https://app.herdharbor.com" },
    clients: { async matchAll() { return clients; } },
    skipWaiting() { skips += 1; },
    addEventListener(type, handler) { listeners[type] = handler; }
  };
  vm.runInNewContext(worker, { self, caches: {}, URL, Promise, MessageChannel, console, Math, Date,
    setTimeout: (fn) => setTimeout(fn, 25), clearTimeout });
  return { listeners, skips: () => skips };
}

test("S16-B/S17 legacy clicks remain requests and cannot prove draft readiness", async () => {
  const silentLegacy = { id: "old-silent", postMessage() {} };
  const h = workerHarness([silentLegacy]);
  let work;
  h.listeners.message({ data: { type: "SKIP_WAITING" }, source: { id: "old-clicked", postMessage() {} }, waitUntil(promise) { work = promise; } });
  await work;
  assert.equal(h.skips(), 0, "an unacknowledged older tab blocks activation");

  const oldClicked = { id: "old-clicked", postMessage() {} };
  const currentReady = { id: "new-ready", postMessage(message, ports) {
    ports[0].postMessage({ type: "HH_UPDATE_READINESS_RESPONSE", requestId: message.requestId, ready: true });
  } };
  const h2 = workerHarness([oldClicked, currentReady]);
  h2.listeners.message({ data: { type: "SKIP_WAITING" }, source: { id: "old-clicked" }, waitUntil(promise) { work = promise; } });
  await work;
  assert.equal(h2.skips(), 0, "legacy click cannot prove its unsaved drafts are safe even with another ready tab");
});

test("S16-C foreground retry requests activation and does not reload until controllerchange", () => {
  const fnSource = extract(pwa, "  function requestForegroundUpdateCheck() {", '\n  window.addEventListener("beforeinstallprompt"');
  const calls = [];
  const document = { visibilityState: "visible" };
  const window = {};
  const run = new Function("document", "window", "Date", "hasUnfinishedLocalWork", "reloadAfterUpdate", "activatePendingUpdate", "checkForAppUpdate", `
    const UPDATE_CHECK_MIN_INTERVAL_MS = 60000;
    let updateReloadDeferred = true, updateControllerChanged = false, nextUpdateActivationRetryAt = 0;
    let updateToast = null;
    ${fnSource}
    return { requestForegroundUpdateCheck, markControllerChanged() { updateControllerChanged = true; }, state: () => ({ updateControllerChanged, nextUpdateActivationRetryAt }) };
  `)(document, window, Date, () => false, () => calls.push("reload"), () => calls.push("activate"), () => calls.push("check"));
  run.requestForegroundUpdateCheck();
  assert.deepEqual(calls, ["activate"]);
  run.markControllerChanged();
  run.requestForegroundUpdateCheck();
  assert.deepEqual(calls, ["activate", "reload"]);
});
