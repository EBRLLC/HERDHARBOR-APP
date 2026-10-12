"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const cloud = fs.readFileSync(path.join(root, "herdharbor-cloud.js"), "utf8");
const diagnostics = fs.readFileSync(path.join(root, "cloud-sync-v2-diagnostics-v1.8.2.js"), "utf8");

function localStateHelpers() {
  const start = cloud.indexOf("  function hasConfiguredOperationProfile(");
  const end = cloud.indexOf("  function animalStateTransitionResult(", start);
  assert.ok(start >= 0 && end > start, "local profile safeguards must exist");
  return new Function("safeParse", `
    "use strict";
    ${cloud.slice(start, end)}
    return { hasConfiguredOperationProfile, hasUnsyncedDomainRecords };
  `)((raw) => { try { return JSON.parse(raw); } catch { return null; } });
}

test("blank first-run device state is not a valid cloud operation profile", () => {
  const { hasConfiguredOperationProfile, hasUnsyncedDomainRecords } = localStateHelpers();
  const empty = JSON.stringify({ profile: null, animals: [], tasks: [] });
  assert.equal(hasConfiguredOperationProfile(empty), false);
  assert.equal(hasUnsyncedDomainRecords(empty), false);
  assert.equal(hasConfiguredOperationProfile({ profile: { operationName: "" } }), false);
  assert.equal(hasConfiguredOperationProfile({ profile: { operationName: "Existing Rabbitry" } }), true);
  assert.equal(hasUnsyncedDomainRecords(JSON.stringify({ profile: null, animals: [{ id: "a" }] })), true);
});

test("cloud writes reject unconfigured state before any provider write", () => {
  const start = cloud.indexOf("  async function syncValueToCloud(");
  const end = cloud.indexOf("  async function drainSyncQueue(", start);
  assert.ok(start >= 0 && end > start);
  const body = cloud.slice(start, end);
  assert.match(body, /if \(!hasConfiguredOperationProfile\(appState\)\)/);
  assert.ok(body.indexOf("if (!hasConfiguredOperationProfile(appState))") < body.indexOf("fetchCloudVersion(userId)"));
  assert.ok(body.indexOf("if (!hasConfiguredOperationProfile(appState))") < body.indexOf("writeCloudRecord("));
});

test("dirty first-run state reads existing cloud profile rather than uploading onboarding", () => {
  const start = cloud.indexOf("  async function hydrateUserDataOnce(");
  const end = cloud.indexOf("  async function hydrateUserData(", start);
  assert.ok(start >= 0 && end > start);
  const hydration = cloud.slice(start, end);
  assert.match(hydration, /if \(dirty && !hasConfiguredOperationProfile\(activeRaw \|\| cachedRaw\)\)/);
  assert.match(hydration, /hasUnsyncedDomainRecords\(deviceRaw\)/);
  assert.match(hydration, /const cloudProbe = await fetchCloudRecord\(userId\);/);
  assert.match(hydration, /if \(dirty && !verifiedExistingCloudRecord\)/);
  assert.match(hydration, /verifiedExistingCloudRecord \|\| legacyCloudPrefetchPromise \|\| fetchCloudRecord\(userId\)/);
  assert.ok(hydration.indexOf("const cloudProbe = await fetchCloudRecord(userId)") < hydration.indexOf("await drainSyncQueue();"));
  assert.match(hydration, /setActiveUserData\(userId, deviceCloudRaw\);/);
});

test("sync diagnostics do not indefinitely schedule themselves from DOM mutations", () => {
  const callbacks = [];
  let observer = null;
  let observerDisconnected = 0;
  const elements = new Map();
  const cloudRaw = JSON.stringify({ profile: null, animals: [] });
  const values = new Map([
    ["herdharbor_pre_alpha_v1", cloudRaw],
    ["herdharbor_active_user_v1", "owner-1"],
    ["herdharbor_user_dirty_owner-1", "1"]
  ]);

  const status = {
    dataset: {},
    _text: "",
    get textContent() { return this._text; },
    set textContent(value) {
      this._text = value;
      if (observer && !observer.disconnected) observer.callback();
    },
    insertAdjacentElement(_where, element) {
      elements.set(element.id, element);
      if (observer && !observer.disconnected) observer.callback();
    }
  };

  const document = {
    body: {},
    head: { appendChild(node) { elements.set(node.id, node); } },
    querySelector(selector) {
      if (selector === "#hh-account-sync-status") return status;
      return null;
    },
    getElementById(id) { return elements.get(id) || null; },
    createElement() {
      return { id: "", dataset: {}, addEventListener() {}, setAttribute() {} };
    },
    addEventListener() {}
  };
  class FakeMutationObserver {
    constructor(callback) { this.callback = callback; this.disconnected = false; observer = this; }
    observe() {}
    disconnect() { this.disconnected = true; observerDisconnected += 1; }
  }
  const runtime = {
    document,
    localStorage: { getItem(key) { return values.get(key) || null; }, setItem(key, value) { values.set(key, value); } },
    navigator: { onLine: true },
    HerdHarborCloud: { getSyncDetails() {
      return { signedIn: true, online: true, unsynced: true, syncing: false, conflict: false, type: "working", message: "Pending" };
    } },
    HerdHarborStateStore: { subscribe() {}, getRevision() { return 1; } },
    MutationObserver: FakeMutationObserver,
    requestAnimationFrame(callback) { callbacks.push(callback); },
    addEventListener() {}
  };
  const context = vm.createContext({ globalThis: runtime, module: { exports: {} } });
  vm.runInContext(diagnostics, context, { filename: "cloud-sync-v2-diagnostics-v1.8.2.js" });

  let frames = 0;
  while (callbacks.length && frames < 12) {
    callbacks.shift()();
    frames += 1;
  }
  assert.equal(observerDisconnected, 1, "observer must stop after diagnostics button is installed");
  assert.equal(callbacks.length, 0, "observer must not produce a perpetual animation-frame loop");
  assert.ok(frames <= 3);
  assert.ok(elements.has("hh-sync-diagnostics-open"), "diagnostics button remains present");
});
