const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const buildSource = fs.readFileSync(path.join(__dirname, "..", "herdharbor-build.js"), "utf8");

function loadBuild(seed = {}) {
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

  const localStorage = new TestStorage(seed);
  const events = [];
  const context = {
    Storage: TestStorage,
    localStorage,
    console,
    URL,
    setTimeout,
    clearTimeout,
    AbortController,
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
      }
    },
    dispatchEvent(event) { events.push(event); },
    location: { href: "https://app.herdharbor.com/" }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(buildSource, context, { filename: "herdharbor-build.js" });
  return { context, localStorage, events };
}

const STATE_KEY = "herdharbor_pre_alpha_v1";
const OWNER_KEY = "herdharbor_active_user_v1";
const userId = "user-123";
const BASE_KEY = `herdharbor_user_cloud_base_${userId}`;
const DIRTY_KEY = `herdharbor_user_dirty_${userId}`;
const VERSION_KEY = `herdharbor_user_cloud_version_${userId}`;
const baseState = JSON.stringify({ animals: [{ id: "a1", name: "Judy" }], settings: {} });

test("v1.8.2 restores a missing confirmed baseline only for a clean known cloud revision", () => {
  const { context, localStorage } = loadBuild({
    [OWNER_KEY]: userId,
    [STATE_KEY]: baseState,
    [VERSION_KEY]: "2026-09-10T04:00:00.000Z"
  });

  assert.equal(context.HerdHarborBuild.version, "1.8.2");
  assert.equal(context.HerdHarborBuild.buildId, "cloud-sync-v2-baseline-recovery-2");
  assert.equal(context.HerdHarborCloudSyncV2.version, "2.0");
  assert.equal(localStorage.getItem(BASE_KEY), baseState);
});

test("v1.8.2 never invents a baseline when unsynced local work is marked dirty", () => {
  const { localStorage } = loadBuild({
    [OWNER_KEY]: userId,
    [STATE_KEY]: baseState,
    [VERSION_KEY]: "2026-09-10T04:00:00.000Z",
    [DIRTY_KEY]: "1"
  });

  assert.equal(localStorage.getItem(BASE_KEY), null);
});

test("v1.8.2 does not rebuild a baseline without a known cloud revision", () => {
  const { localStorage } = loadBuild({
    [OWNER_KEY]: userId,
    [STATE_KEY]: baseState
  });

  assert.equal(localStorage.getItem(BASE_KEY), null);
});

test("v1.8.2 does not rebuild a baseline from malformed local state", () => {
  const { localStorage } = loadBuild({
    [OWNER_KEY]: userId,
    [STATE_KEY]: "not-json",
    [VERSION_KEY]: "2026-09-10T04:00:00.000Z"
  });

  assert.equal(localStorage.getItem(BASE_KEY), null);
});

test("v1.8.2 captures the last clean state immediately before the first local edit when baseline history is missing", () => {
  const { localStorage } = loadBuild({
    [OWNER_KEY]: userId,
    [STATE_KEY]: baseState
  });

  assert.equal(localStorage.getItem(BASE_KEY), null);
  localStorage.setItem(VERSION_KEY, "2026-09-10T04:00:00.000Z");

  const edited = JSON.stringify({ animals: [{ id: "a1", name: "Judy", notes: "new note" }], settings: {} });
  localStorage.setItem(STATE_KEY, edited);

  assert.equal(localStorage.getItem(BASE_KEY), baseState);
  assert.equal(localStorage.getItem(STATE_KEY), edited);
});

test("v1.8.2 captures the last clean state before a first local clear when baseline history is missing", () => {
  const { localStorage } = loadBuild({
    [OWNER_KEY]: userId,
    [STATE_KEY]: baseState
  });

  localStorage.setItem(VERSION_KEY, "2026-09-10T04:00:00.000Z");
  localStorage.removeItem(STATE_KEY);

  assert.equal(localStorage.getItem(BASE_KEY), baseState);
  assert.equal(localStorage.getItem(STATE_KEY), null);
});

test("v1.8.2 refuses to capture a pre-mutation baseline once local work is dirty", () => {
  const { localStorage } = loadBuild({
    [OWNER_KEY]: userId,
    [STATE_KEY]: baseState,
    [DIRTY_KEY]: "1",
    [VERSION_KEY]: "2026-09-10T04:00:00.000Z"
  });

  const edited = JSON.stringify({ animals: [{ id: "a1", name: "Changed" }], settings: {} });
  localStorage.setItem(STATE_KEY, edited);

  assert.equal(localStorage.getItem(BASE_KEY), null);
});

test("Cloud Sync V2 leaves the existing sign-in resilience contract intact", () => {
  assert.match(buildSource, /const AUTH_FETCH_TIMEOUT_MS = 12000;/);
  assert.match(buildSource, /const SIGN_IN_WATCHDOG_MS = 15000;/);
  assert.match(buildSource, /path\.startsWith\("\/auth\/v1\/"\)/);
  assert.match(buildSource, /root\.HerdHarborAuthResilience = Object\.freeze/);
  assert.match(buildSource, /form\.id !== "hh-signin-form"/);
});
