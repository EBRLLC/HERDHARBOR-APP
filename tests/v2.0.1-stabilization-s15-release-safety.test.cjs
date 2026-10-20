"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { MessageChannel } = require("node:worker_threads");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const Core = require("../account-boundary-core-v1.8.4.js");

test("S15-A missing, undefined, false, and throwing preservation all fail closed", async () => {
  const raw = '{"animals":[{"id":"A-rabbit"}]}';
  const attempts = [undefined, async () => undefined, async () => null, async () => false, async () => { throw new Error("quota"); }];
  for (const preserve of attempts) {
    let active = raw;
    let owner = "A";
    let clears = 0;
    const adapters = {
      clearActive() { clears += 1; active = ""; owner = ""; return true; },
      setOwner(userId) { owner = userId; return true; },
      verifyOwner(userId) { return owner === userId; },
      restoreOwner(userId) { owner = userId; return true; }
    };
    if (preserve) adapters.preserve = preserve;
    const result = await Core.applyPlan({
      authenticatedUserId: "B", activeOwnerId: "A", hasActiveState: true
    }, adapters);
    assert.equal(result.ok, false);
    assert.equal(clears, 0);
    assert.equal(active, raw);
    assert.equal(owner, "A");
  }
});

test("S15-A owner marker must be written and read back before a boundary can complete", async () => {
  let active = '{"rabbits":[{"id":"A1"}]}';
  let owner = "A";
  let backup = "";
  const result = await Core.applyPlan({
    authenticatedUserId: "B", activeOwnerId: "A", hasActiveState: true
  }, {
    async preserve() { backup = active; return true; },
    clearActive() { active = ""; owner = ""; return true; },
    setOwner() { return false; },
    verifyOwner(userId) { return owner === userId; },
    restoreOwner(userId) { owner = userId; return true; }
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "account-owner-marker-unverified");
  assert.equal(owner, "A");
  assert.equal(active, "");
  assert.equal(backup, '{"rabbits":[{"id":"A1"}]}');
});

test("S15-A session switch during preservation cannot clear the old workspace", async () => {
  let current = true;
  let released;
  let cleared = false;
  const operation = Core.applyPlan({
    authenticatedUserId: "B", activeOwnerId: "A", hasActiveState: true
  }, {
    isCurrent: () => current,
    preserve: () => new Promise((resolve) => { released = resolve; }),
    clearActive() { cleared = true; return true; },
    setOwner() { return true; },
    verifyOwner() { return true; }
  });
  await new Promise((resolve) => setImmediate(resolve));
  current = false;
  released(true);
  const result = await operation;
  assert.equal(result.reason, "account-boundary-session-changed");
  assert.equal(cleared, false);
});

test("S15-A manual and completed sign-out paths retain locked recovery when clear fails", () => {
  const cloud = read("herdharbor-cloud.js");
  const manualStart = cloud.indexOf('accountDialog.querySelector("#hh-sign-out").addEventListener');
  const manualEnd = cloud.indexOf("const accountDialogTarget", manualStart);
  assert.ok(manualStart >= 0 && manualEnd > manualStart);
  const manual = cloud.slice(manualStart, manualEnd);
  assert.match(manual, /const preserved = await preserveActiveForUser/);
  assert.ok(manual.indexOf("if (!preserved)") < manual.indexOf("if (!clearActiveUserData())"));
  assert.ok(manual.indexOf("if (!clearActiveUserData())") < manual.indexOf("clearAccountSessionMarkers(userId)"));

  const signedOutStart = cloud.indexOf('    if (event === "SIGNED_OUT") {');
  const signedOutEnd = cloud.indexOf('\n  });\n\n  window.addEventListener("online"', signedOutStart);
  assert.ok(signedOutStart >= 0 && signedOutEnd > signedOutStart);
  const signedOut = cloud.slice(signedOutStart, signedOutEnd);
  assert.match(signedOut, /const preserved = await preserveActiveForUser/);
  assert.match(signedOut, /if \(!clearActiveUserData\(\)\) \{[\s\S]*?Sign-out completed, but HerdHarbor could not clear the active workspace/);
  assert.ok(signedOut.indexOf("if (!clearActiveUserData())") < signedOut.indexOf("clearAccountSessionMarkers(previousUserId)"));
});

test("S15-B a verified local backup completes without waiting for optional IndexedDB", async () => {
  let indexedDbCalls = 0;
  const result = await Core.preserveWithFallback({
    localPreserve: async () => true,
    indexedDbPreserve: () => { indexedDbCalls += 1; return new Promise(() => {}); },
    timeoutMs: 5
  });
  assert.deepEqual(result, { ok: true, source: "local" });
  assert.equal(indexedDbCalls, 0);
});

test("S15-B IndexedDB fallback succeeds only on committed success and fails on abort or timeout", async () => {
  const committed = await Core.preserveWithFallback({
    localPreserve: async () => false,
    indexedDbPreserve: async () => true,
    timeoutMs: 20
  });
  assert.deepEqual(committed, { ok: true, source: "indexeddb" });

  const aborted = await Core.preserveWithFallback({
    localPreserve: async () => false,
    indexedDbPreserve: async () => false,
    timeoutMs: 20
  });
  assert.equal(aborted.ok, false);

  const stalled = await Core.preserveWithFallback({
    localPreserve: async () => false,
    indexedDbPreserve: () => new Promise(() => {}),
    timeoutMs: 10
  });
  assert.equal(stalled.ok, false);
  assert.equal(stalled.source, "none");
});

test("S15-B production preservation uses the verified local fast path and bounded IDB fallback", () => {
  const source = read("herdharbor-cloud.js");
  const start = source.indexOf("  async function preserveActiveForUser(");
  const end = source.indexOf("  function setActiveUserData(", start);
  assert.ok(start >= 0 && end > start);
  const block = source.slice(start, end);
  assert.match(block, /HerdHarborAccountBoundaryCore\.preserveWithFallback/);
  assert.match(block, /originalGetItem\.call\(localStorage, cacheId\) === rawValue/);
  assert.match(block, /recordRecoverySnapshot\(userId, rawValue, reason, \{ timeoutMs: 8000 \}\)/);
  assert.match(source, /transaction\?\.abort\(\)/);
  assert.match(source, /Recovery storage transaction timed out/);
});

function activateHarness({ dirty = false } = {}) {
  const source = read("pwa.js");
  const start = source.indexOf("  async function activatePendingUpdate(button) {");
  const end = source.indexOf('\n  navigatorRef().serviceWorker?.addEventListener("message"', start);
  assert.ok(start >= 0 && end > start);
  const posted = [];
  let notice = 0;
  const worker = { state: "installed", postMessage(message) { posted.push(message); } };
  const timers = new Map();
  let nextTimer = 0;
  const window = {
    setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); }
  };
  const registration = { waiting: worker };
  const run = new Function("window", "registration", "pendingUpdateWorker", "hasUnfinishedLocalWork", "showDeferredReloadNotice", "showOtherClientDeferredNotice", "clearUpdateActivationTimer", "monitorFailure",
    "const UPDATE_ACTIVATION_TIMEOUT_MS=12000;\nlet updateActivationInFlight=false,updateActivationTimer=null,updateReloadDeferred=false;\n" +
    source.slice(start, end) +
    "\nreturn { activatePendingUpdate, state:()=>({updateActivationInFlight,updateReloadDeferred}) };"
  )(window, registration, worker, () => dirty, () => { notice += 1; }, () => { notice += 1; }, () => {}, () => {});
  return { run, posted, notice: () => notice, timers };
}

test("S15-C dirty current tab is checked before any activation message is sent", async () => {
  const h = activateHarness({ dirty: true });
  const button = { disabled: false, textContent: "Update Now" };
  await h.run.activatePendingUpdate(button);
  assert.deepEqual(h.posted, []);
  assert.equal(h.notice(), 1);
  assert.equal(h.run.state().updateReloadDeferred, true);
});

test("S15-C update handshake timeout defers safely without forcing a navigation", async () => {
  const h = activateHarness({ dirty: false });
  const button = { disabled: false, textContent: "Update Now" };
  await h.run.activatePendingUpdate(button);
  assert.deepEqual(h.posted, [{ type: "HH_CHECK_UPDATE_READINESS" }]);
  const timeout = [...h.timers.values()][0];
  assert.equal(typeof timeout, "function");
  timeout();
  assert.equal(h.run.state().updateActivationInFlight, false);
  assert.equal(h.notice(), 1);
});

function workerHarness({ clients = [], cacheKeys = [] } = {}) {
  const listeners = {};
  const deleted = [];
  let skipWaiting = 0;
  const self = {
    location: { href: "https://app.herdharbor.com/service-worker.js", origin: "https://app.herdharbor.com" },
    registration: { navigationPreload: { async enable() {} } },
    clients: { async matchAll() { return clients; }, async claim() {} },
    skipWaiting() { skipWaiting += 1; },
    addEventListener(name, handler) { listeners[name] = handler; }
  };
  const caches = {
    async keys() { return cacheKeys; },
    async delete(name) { deleted.push(name); return true; }
  };
  vm.runInNewContext(read("service-worker.js"), {
    self, caches, URL, Promise, MessageChannel, console,
    setTimeout: (fn, delay) => setTimeout(fn, Math.min(delay, 20)),
    clearTimeout
  });
  return { listeners, deleted, skipWaiting: () => skipWaiting };
}

function readyClient(ready) {
  return {
    postMessage(message, ports) {
      if (message.type !== "HH_UPDATE_READINESS_QUERY") return;
      ports[0].postMessage({
        type: "HH_UPDATE_READINESS_RESPONSE",
        requestId: message.requestId,
        ready
      });
    }
  };
}

test("S15-C service worker skips waiting only when every open client explicitly replies safe", async () => {
  for (const [clientSet, expectedSkips] of [
    [[readyClient(true)], 1],
    [[readyClient(true), readyClient(false)], 0],
    [[{}], 0]
  ]) {
    const h = workerHarness({ clients: clientSet });
    let work;
    h.listeners.message({
      data: { type: "HH_CHECK_UPDATE_READINESS" },
      source: { postMessage() {} },
      waitUntil(promise) { work = promise; }
    });
    await work;
    assert.equal(h.skipWaiting(), expectedSkips);
  }
});

test("S15-C legacy Update Now messages are gated by the same readiness handshake", async () => {
  const h = workerHarness({ clients: [readyClient(false)] });
  let work;
  h.listeners.message({
    data: { type: "SKIP_WAITING" },
    source: { postMessage() {} },
    waitUntil(promise) { work = promise; }
  });
  await work;
  assert.equal(h.skipWaiting(), 0);
});

test("S15-C activation retains current and two prior release caches for old lazy assets", async () => {
  const current = "herdharbor-shell-v2.0.1-v2.0.1-release-1-s20-2";
  const previous = "herdharbor-shell-v2.0.0-v2.0.0-release-1";
  const older = "herdharbor-shell-v1.8.4-release-1";
  const oldest = "herdharbor-shell-v1.8.2-release-1";
  const h = workerHarness({ cacheKeys: [oldest, previous, older, current, "other-cache"] });
  let work;
  h.listeners.activate({ waitUntil(promise) { work = promise; } });
  await work;
  assert.deepEqual(h.deleted, [oldest]);
  assert.equal(h.deleted.includes(previous), false);
  assert.equal(h.deleted.includes(older), false);
  assert.equal(h.deleted.includes(current), false);
});
