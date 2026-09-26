"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const StateStore = require("../herdharbor-state-store-v1.8.4.js");
const buildSource = fs.readFileSync(path.join(__dirname, "..", "herdharbor-build.js"), "utf8");
const cloudSource = fs.readFileSync(path.join(__dirname, "..", "herdharbor-cloud.js"), "utf8");

const STATE_KEY = "herdharbor_pre_alpha_v1";
const OWNER_KEY = "herdharbor_active_user_v1";
const userId = "user-123";
const BASE_KEY = `herdharbor_user_cloud_base_${userId}`;
const DIRTY_KEY = `herdharbor_user_dirty_${userId}`;
const VERSION_KEY = `herdharbor_user_cloud_version_${userId}`;
const baseState = JSON.stringify({ animals: [{ id: "a1", name: "Judy" }], settings: {} });

class TestStorage {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial));
  }
  getItem(key) {
    return this.values.has(String(key)) ? this.values.get(String(key)) : null;
  }
  setItem(key, value) {
    this.values.set(String(key), String(value));
  }
  removeItem(key) {
    this.values.delete(String(key));
  }
}

function safeParse(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

const flushAsync = () => new Promise((resolve) => setImmediate(resolve));

function makeBridge(seed = {}) {
  const storage = new TestStorage({ [OWNER_KEY]: userId, ...seed });
  const baseline = new Map();
  const stateStore = StateStore.create({ storage, indexedDB: null, now: () => "2026-09-24T12:00:00.000Z" });
  const scheduled = [];
  const recovery = [];
  const events = [];
  const start = cloudSource.indexOf("  function dispatchBaselineRestored");
  const end = cloudSource.indexOf("\n  async function fetchCloudRecord", start);
  assert.ok(start >= 0 && end > start, "explicit state-store cloud bridge is present");
  const bridgeSource = cloudSource.slice(start, end);

  class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  }
  const windowObject = {
    dispatchEvent(event) { events.push(event); }
  };
  const createBridge = new Function(
    "originalGetItem",
    "localStorage",
    "baseKey",
    "dirtyKey",
    "versionKey",
    "canonicalStateStore",
    "ACTIVE_OWNER_KEY",
    "safeParse",
    "activeStateRaw",
    "safeStorageSet",
    "readCloudBaseline",
    "writeCloudBaseline",
    "window",
    "CustomEvent",
    "sessionArg",
    "removeRedundantStateCache",
    "sameState",
    "recordRecoverySnapshot",
    "scheduleCloudSync",
    "normalizedAuthorityActive",
    "safeStorageRemove",
    `let session=sessionArg;let writeSequence=0;let syncConflict=null;
${bridgeSource}
return {
  restoreMissingCloudBaseline,
  captureCleanBaselineBeforeLocalCommit,
  handleCanonicalStateCommit,
  installStateStoreBridge,
  sequence:()=>writeSequence
};`
  );

  const bridge = createBridge(
    TestStorage.prototype.getItem,
    storage,
    (id) => `herdharbor_user_cloud_base_${id}`,
    (id) => `herdharbor_user_dirty_${id}`,
    (id) => `herdharbor_user_cloud_version_${id}`,
    stateStore,
    OWNER_KEY,
    safeParse,
    () => stateStore.compatibilitySnapshot(),
    (key, value) => { storage.setItem(key, value); return true; },
    async (id) => {
      const durable = baseline.get(id);
      if (durable) return durable;
      const legacy = storage.getItem(`herdharbor_user_cloud_base_${id}`);
      if (legacy && safeParse(legacy)) {
        baseline.set(id, legacy);
        storage.removeItem(`herdharbor_user_cloud_base_${id}`);
        return legacy;
      }
      return null;
    },
    async (id, raw) => {
      if (!id || !safeParse(raw)) return false;
      baseline.set(id, raw);
      storage.removeItem(`herdharbor_user_cloud_base_${id}`);
      return true;
    },
    windowObject,
    CustomEvent,
    { user: { id: userId } },
    () => {},
    (left, right) => left === right,
    (id, raw, reason) => { recovery.push({ id, raw, reason }); return Promise.resolve(true); },
    (rawValue, sequence) => { scheduled.push({ rawValue, sequence }); },
    () => false,
    (key) => storage.removeItem(key)
  );

  return { storage, baseline, stateStore, bridge, scheduled, recovery, events };
}

test("missing confirmed baseline is restored only for a clean device with a known cloud revision", async () => {
  const { baseline, bridge } = makeBridge({
    [STATE_KEY]: baseState,
    [VERSION_KEY]: "2026-09-10T04:00:00.000Z"
  });
  assert.equal(await bridge.restoreMissingCloudBaseline(userId, "hydrate"), true);
  assert.equal(baseline.get(userId), baseState);
});

test("dirty local work prevents baseline invention", async () => {
  const { baseline, bridge } = makeBridge({
    [STATE_KEY]: baseState,
    [VERSION_KEY]: "2026-09-10T04:00:00.000Z",
    [DIRTY_KEY]: "1"
  });
  assert.equal(await bridge.restoreMissingCloudBaseline(userId, "hydrate"), false);
  assert.equal(baseline.get(userId) || null, null);
});

test("canonical local commit captures the clean pre-edit ancestor before marking legacy sync dirty", async () => {
  const { storage, baseline, stateStore, bridge, scheduled } = makeBridge({
    [STATE_KEY]: baseState,
    [VERSION_KEY]: "2026-09-10T04:00:00.000Z"
  });
  stateStore.subscribe(bridge.handleCanonicalStateCommit);

  const edited = { animals: [{ id: "a1", name: "Judy", notes: "new note" }], settings: {} };
  const result = stateStore.commit(edited, { source: "local" });
  await flushAsync();

  assert.equal(result.ok, true);
  assert.equal(baseline.get(userId), baseState);
  assert.equal(storage.getItem(DIRTY_KEY), "1");
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].rawValue, JSON.stringify(edited));
  assert.equal(bridge.sequence(), 1);
});

test("canonical local commit never invents a merge ancestor without a known cloud revision", async () => {
  const { storage, baseline, stateStore, bridge, scheduled } = makeBridge({ [STATE_KEY]: baseState });
  stateStore.subscribe(bridge.handleCanonicalStateCommit);

  stateStore.commit({ animals: [{ id: "a1", name: "Changed" }], settings: {} }, { source: "local" });
  await flushAsync();

  assert.equal(baseline.get(userId) || null, null);
  assert.equal(storage.getItem(DIRTY_KEY), "1");
  assert.equal(scheduled.length, 1);
});

test("device-only state commits do not schedule the legacy full-state cloud engine", () => {
  const { stateStore, bridge, scheduled } = makeBridge({
    [STATE_KEY]: JSON.stringify({ settings: { theme: "system" } }),
    [VERSION_KEY]: "2026-09-10T04:00:00.000Z"
  });
  stateStore.subscribe(bridge.handleCanonicalStateCommit);
  const result = stateStore.commit({ settings: { theme: "dark" } }, { source: "local" });
  assert.equal(result.cloudRelevant, false);
  assert.equal(scheduled.length, 0);
});

test("build bootstrap no longer owns sync correctness while sign-in resilience remains intact", () => {
  assert.doesNotMatch(buildSource, /Storage\.prototype\.(?:setItem|removeItem)\s*=/);
  assert.doesNotMatch(buildSource, /CLOUD_STATE_KEY|cloudDirtyKey|captureMissingBaselineBeforeMutation/);
  assert.match(buildSource, /const AUTH_FETCH_TIMEOUT_MS = 12000;/);
  assert.match(buildSource, /const SIGN_IN_WATCHDOG_MS = 15000;/);
  assert.match(buildSource, /path\.startsWith\("\/auth\/v1\/"\)/);
  assert.match(buildSource, /root\.HerdHarborAuthResilience = Object\.freeze/);
  assert.match(buildSource, /form\.id !== "hh-signin-form"/);
});
