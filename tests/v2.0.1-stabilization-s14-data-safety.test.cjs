"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const cloud = read("herdharbor-cloud.js");
const core = require("../account-boundary-core-v1.8.4.js");

function actualPreserver({ localSuccess = false, recoverySuccess = false, raw = '{"animals":[{"id":"unsynced"}]}' } = {}) {
  const a = cloud.indexOf("  async function preserveActiveForUser(");
  const b = cloud.indexOf("  function setActiveUserData(", a);
  assert.ok(a > 0 && b > a);
  const storage = new Map();
  let snapshots = 0;
  const preserve = new Function("activeStateRaw", "safeParse", "safeStorageSet", "cacheKey", "originalGetItem",
    "localStorage", "recordRecoverySnapshot", "window", cloud.slice(a, b) + "\nreturn preserveActiveForUser;")(
    () => raw, JSON.parse,
    (key, val) => { if (!localSuccess) return false; storage.set(key, val); return true; },
    id => "recover:" + id, { call: (_store, key) => storage.get(key) ?? null },
    {}, async () => { snapshots++; return recoverySuccess; }, { HerdHarborAccountBoundaryCore: core }
  );
  return { preserve, snapshots: () => snapshots };
}

test("actual account transition refuses to clear unsynced state when local and IndexedDB backups fail", async () => {
  const h = actualPreserver();
  let raw = '{"animals":[{"id":"unsynced"}]}';
  let cleared = 0;
  const result = await core.applyPlan(
    { authenticatedUserId: "B", activeOwnerId: "A", hasActiveState: true },
    { preserve: async owner => h.preserve(owner, "storage failure", raw),
      clearActive: () => { cleared++; raw = null; return true; }, resetRuntime() {}, setOwner() { return true; },
      verifyOwner() { return true; }, restoreOwner() { return true; }, removeLegacy() {} }
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "stale-owner-preserve-failed");
  assert.equal(cleared, 0);
  assert.match(raw, /unsynced/);
  assert.equal(h.snapshots(), 1);
});

for (const [label, options] of [
  ["verified localStorage backup", { localSuccess: true, recoverySuccess: false }],
  ["committed IndexedDB recovery fallback", { localSuccess: false, recoverySuccess: true }]
]) {
  test(label + " permits account switch", async () => {
    const h = actualPreserver(options);
    let cleared = 0;
    const outcome = await core.applyPlan(
      { authenticatedUserId: "B", activeOwnerId: "A", hasActiveState: true },
      { preserve: owner => h.preserve(owner, "account switch"),
        clearActive: () => { cleared++; return true; }, resetRuntime() {}, setOwner() { return true; },
        verifyOwner() { return true; }, restoreOwner() { return true; }, removeLegacy() {} }
    );
    assert.equal(outcome.ok, true);
    assert.equal(cleared, 1);
  });
}

test("initial SIGNED_OUT with no workspace needs no owner backup; unattributed data remains locked", async () => {
  const empty = actualPreserver({ raw: "" });
  assert.equal(await empty.preserve(null, "initial sign-out"), true);
  const unowned = actualPreserver({ raw: '{"animals":[{"id":"unowned"}]}' });
  assert.equal(await unowned.preserve(null, "unattributed sign-out"), false);
});

test("sign-out preserves active state before clearing it, and retains it on failed backup", () => {
  const start = cloud.indexOf('    if (event === "SIGNED_OUT") {');
  const end = cloud.indexOf('\n  });\n\n  window.addEventListener("online"', start);
  assert.ok(start >= 0 && end > start);
  const block = cloud.slice(start, end);
  assert.match(block, /const preserved = await preserveActiveForUser/);
  assert.match(block, /if \(!preserved\) \{/);
  assert.match(block, /if \(!clearActiveUserData\(\)\) \{/);
  assert.ok(block.indexOf("if (!preserved)") < block.indexOf("if (!clearActiveUserData())"));
});

function workerHarness() {
  const source = read("service-worker.js");
  const events = {}, items = new Map();
  let online = true;
  const asKey = key => typeof key === "string" ? key : String(key?.url || key);
  const cache = {
    put: async (key, response) => { items.set(asKey(key), response); },
    match: async key => items.get(asKey(key)),
    add: async () => {}
  };
  const self = {
    location: { href: "https://app.herdharbor.com/service-worker.js", origin: "https://app.herdharbor.com" },
    addEventListener(name, handler) { events[name] = handler; }
  };
  class RequestStub { constructor(url) { this.url = String(url); } }
  const fetch = async request => {
    if (!online) throw new Error("network offline");
    const pathname = new URL(request.url).pathname;
    const route = pathname === "/how-to/" ? "how-to" : pathname === "/" ? "app" : "other";
    return { ok: true, type: "basic", route, clone() { return this; } };
  };
  const errorResponse = { route: "offline-error" };
  vm.runInNewContext(source, {
    self, Request: RequestStub, caches: { open: async () => cache, match: cache.match },
    fetch, URL, Promise, Response: { error: () => errorResponse }, console
  });
  return {
    offline() { online = false; },
    items,
    async navigate(pathname) {
      let promise, additional = [];
      events.fetch({
        request: { method: "GET", mode: "navigate", url: "https://app.herdharbor.com" + pathname },
        preloadResponse: Promise.resolve(null),
        respondWith(p) { promise = p; },
        waitUntil(p) { additional.push(p); }
      });
      const value = await promise;
      await Promise.all(additional);
      return value?.route;
    }
  };
}

test("visiting How-To cannot overwrite the offline app homepage", async () => {
  const h = workerHarness();
  h.items.set("./index.html", { route: "app" });
  assert.equal(await h.navigate("/how-to/"), "how-to");
  assert.equal(h.items.get("./index.html").route, "app");
  h.offline();
  assert.equal(await h.navigate("/"), "app");
  assert.equal(await h.navigate("/how-to/"), "how-to");
  assert.equal(await h.navigate("/not-visited/"), "offline-error");
});

test("normalized syncNow result cannot report stale account A success to account B", async () => {
  const a = cloud.indexOf("  async function syncNow() {");
  const b = cloud.indexOf("    const syncUserId = session?.user?.id;", a);
  assert.ok(a > 0 && b > a);
  const fence = core.createGenerationFence();
  fence.advance("A");
  let release;
  const statuses = [];
  const runtime = new Function("fence", "statuses", "releaseRef", 
    "let session = {user:{id:'A'}};\n" +
    "const captureAccountOperation = id => fence.capture(id);\n" +
    "const isAccountOperationCurrent = (token) => fence.isCurrent(token,session?.user?.id);\n" +
    "let pendingSync=null, syncTimer=null, syncDebounceStartedAt=0;\n" +
    "const localStorage={}, originalGetItem={call:()=>null}, dirtyKey=x=>x, versionKey=x=>x;\n" +
    "const normalizedRolloutStage=()=> 'normalized',normalizedAuthorityActive=()=>true,refreshNormalizedAuthorityIfEligible=async()=>true;\n" +
    "const clearTimeout=()=>{}, setSyncState=(message,type)=>statuses.push({userId:session?.user?.id,message,type});\n" +
    "const normalizedRollout={syncNormalizedNow:()=>new Promise(resolve=>releaseRef.current=resolve)};\n" +
    "const console={error() {}};\n" +
    cloud.slice(a,b) + "\n return false;\n}\n" +
    "return {syncNow,changeToB(){session={user:{id:'B'}};fence.advance('B');}};"
  )(fence, statuses, { get current(){return release}, set current(v){release=v} });
  const run = runtime.syncNow();
  await Promise.resolve();
  runtime.changeToB();
  release({ ok: true });
  assert.equal(await run, false);
  assert.equal(statuses.some(entry => entry.userId === "B"), false);
});

test("reconciliation rejects account change before acknowledging old owner mutations", async () => {
  const src = read("cloud-sync-rollout-runtime-v1.8.4.js");
  const a = src.indexOf("    async function reconcileDualWriteFromLegacyAuthority(");
  const b = src.indexOf("    async function afterLegacyCommit(", a);
  assert.ok(a > 0 && b > a);
  let current = true, resumeRead, acknowledged = 0, writes = 0;
  const currentCheck = () => { if (!current) throw Object.assign(new Error("account changed"), { code: "HH_SYNC_ACCOUNT_CHANGED" }); };
  const stateStore = {
    getOutbox: () => [{ mutationId: "pending-A" }],
    acknowledgeMutations: () => { acknowledged++; },
    getState: () => ({ animals: [{id:"A"}] })
  };
  const cloud = {
    readLegacySnapshotForNormalizedSync: () => new Promise(resolve => { resumeRead = resolve; })
  };
  const reconcile = new Function("stateStore", "cloud", "assertContextCurrent", "emit", "reconciliationPass",
    src.slice(a,b) + "\nreturn reconcileDualWriteFromLegacyAuthority;"
  )(stateStore, cloud, currentCheck, () => {}, () => true);
  const ctx = {
    userId: "A", stage: "dual_write",
    normalizer: { namespace: "animals", mapLegacySnapshot: () => ({ checksum: "same" }) },
    recordStore: { list: async () => [] },
    shadowController: { sync: async () => { writes++; return { checksum: "same" }; }, verifyAndRecord: async () => ({ok:true,actualChecksum:"same",expectedChecksum:"same"}) },
    reconciliationApi: { reconcileSnapshot: () => ({}) },
    metrics: { snapshot:()=>({}) }, worker: { primeBaseline: async()=>({ok:true}) }
  };
  const pending = reconcile(ctx, { ok: false, mode: "dual-write-degraded" });
  current = false; // account B signs in before A's cloud read resolves
  resumeRead({ snapshot: { animals: [{id:"A"}] } });
  await assert.rejects(pending, err => err.code === "HH_SYNC_ACCOUNT_CHANGED");
  assert.equal(writes, 0);
  assert.equal(acknowledged, 0);
});

test("background PWA controller changes retain unsaved AI drafts and cloud changes", () => {
  const s = read("pwa.js");
  const a = s.indexOf("  function hasUnfinishedLocalWork() {");
  const b = s.indexOf("  async function activatePendingUpdate(", a);
  assert.ok(a > 0 && b > a);
  let dirty = true, dialogOpen = false, reloads = 0, attached = 0;
  const doc = {
    documentElement: { dataset: { hhUnsynced: "true" } },
    querySelector(selector) { return dirty || (dialogOpen && selector.includes("#modal-backdrop:not(.hidden)")) ? {} : null; },
    createElement() {
      return { className: "", innerHTML: "", setAttribute() {},
        querySelector() { return { addEventListener() {} }; },
        remove() {} };
    }, body: { appendChild() { attached++; } }
  };
  const win = {
    HerdHarborCloud: { hasUnsyncedChanges: () => dirty },
    location: { reload() { reloads++; } },
    clearTimeout() {}
  };
  const gate = new Function("window","document",
    "let reloading=false,updateReloadDeferred=false,updateControllerChanged=true,updateToast=null,updateActivationTimer=null,updateActivationInFlight=false;\n" +
    "const clearUpdateActivationTimer=()=>{};\n" +
    s.slice(a,b) + "\nreturn {reloadAfterUpdate,deferred:()=>updateReloadDeferred};"
  )(win,doc);
  gate.reloadAfterUpdate();
  assert.equal(reloads,0);
  assert.equal(gate.deferred(),true);
  assert.equal(attached,1);
  dirty=false;
  doc.documentElement.dataset.hhUnsynced = "false";
  dialogOpen = true;
  gate.reloadAfterUpdate();
  assert.equal(reloads,0, "visible animal-editing modal must also defer the update");
  dialogOpen = false;
  gate.reloadAfterUpdate();
  assert.equal(reloads,1);
  assert.match(s,/serviceWorker\?\.addEventListener\("controllerchange"[\s\S]*?reloadAfterUpdate\(\)/);
});
