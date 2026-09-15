"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const flowSource = fs.readFileSync(
  path.join(root, "cloud-sync-v2-flow-v1.8.2.js"),
  "utf8"
);
const cloudSource = fs.readFileSync(
  path.join(root, "herdharbor-cloud.js"),
  "utf8"
);

function createHarness(initialState = {}, syncImplementation = null) {
  const state = {
    signedIn: true,
    online: true,
    unsynced: false,
    syncing: false,
    conflict: false,
    type: "success",
    message: "Saved to cloud",
    ...initialState
  };
  const button = { dataset: { state: state.type }, title: "" };
  const status = { dataset: { type: state.type }, textContent: state.message };
  const windowListeners = new Map();
  const documentListeners = new Map();
  const timers = new Map();
  let timerId = 0;
  let syncCalls = 0;
  let cacheInstalls = 0;

  const document = {
    visibilityState: "visible",
    head: { appendChild() {} },
    documentElement: { appendChild() {} },
    body: { appendChild() {} },
    addEventListener(name, listener) {
      if (!documentListeners.has(name)) documentListeners.set(name, []);
      documentListeners.get(name).push(listener);
    },
    querySelector(selector) {
      if (selector === ".hh-account-button") return button;
      if (selector === "#hh-account-sync-status") return status;
      return null;
    },
    getElementById() {
      return null;
    },
    createElement() {
      return { id: "", src: "", async: true };
    }
  };

  const navigator = { onLine: state.online !== false };
  const cloud = {
    getSyncDetails() {
      return { ...state, online: navigator.onLine && state.online !== false };
    },
    syncNow() {
      syncCalls += 1;
      if (syncImplementation) return syncImplementation({ state, navigator, syncCalls });
      return Promise.resolve(true);
    }
  };

  const window = {
    HerdHarborCloud: cloud,
    HerdHarborLocalCacheV2: {
      install() {
        cacheInstalls += 1;
      }
    },
    addEventListener(name, listener) {
      if (!windowListeners.has(name)) windowListeners.set(name, []);
      windowListeners.get(name).push(listener);
    },
    setTimeout(callback, delay) {
      const id = ++timerId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    }
  };

  const context = {
    window,
    document,
    navigator,
    console,
    Promise,
    Date,
    Object,
    String,
    Boolean,
    Math,
    setTimeout: window.setTimeout,
    clearTimeout: window.clearTimeout
  };
  context.globalThis = context;

  vm.runInNewContext(flowSource, context, {
    filename: "cloud-sync-v2-flow-v1.8.2.js"
  });

  return {
    state,
    document,
    button,
    status,
    navigator,
    timers,
    api: window.HerdHarborCloudSyncFlowV2,
    get syncCalls() {
      return syncCalls;
    },
    get cacheInstalls() {
      return cacheInstalls;
    },
    emitWindow(name, event = {}) {
      for (const listener of windowListeners.get(name) || []) listener(event);
    },
    emitDocument(name, event = {}) {
      for (const listener of documentListeners.get(name) || []) listener(event);
    },
    async settle() {
      await Promise.resolve();
      await Promise.resolve();
    }
  };
}

test("v1.8.2 dynamic flow presents ordinary pending sync as protected, non-blocking work", () => {
  const harness = createHarness({
    unsynced: true,
    type: "error",
    message: "Cloud save failed; changes are safe on this device and will retry."
  });

  assert.equal(harness.button.dataset.state, "working");
  assert.equal(harness.status.dataset.type, "working");
  assert.match(harness.status.textContent, /Saved on this device/);
  assert.equal(harness.timers.size, 1, "visible online pending work schedules one retry");
});

test("v1.8.2 dynamic flow never downgrades a true conflict", () => {
  const harness = createHarness({
    unsynced: true,
    conflict: true,
    type: "error",
    message: "Sync paused because the same record changed on two devices."
  });

  assert.equal(harness.api.isRecoverableCloudState(harness.state), false);
  assert.equal(harness.button.dataset.state, "error");
  assert.equal(harness.status.dataset.type, "error");
  assert.equal(harness.timers.size, 0, "true conflicts do not enter automatic retry");
});

test("v1.8.2 dynamic flow keeps offline pending work local until connectivity returns", async () => {
  const harness = createHarness({
    online: false,
    unsynced: true,
    type: "error",
    message: "Offline; changes stay protected on this device and will sync after reconnection."
  });
  harness.navigator.onLine = false;
  harness.api.refresh();

  assert.equal(harness.syncCalls, 0);
  assert.equal(harness.timers.size, 0, "offline work does not schedule network retries");
  assert.match(harness.status.textContent, /Safe to close HerdHarbor/);

  harness.navigator.onLine = true;
  harness.state.online = true;
  harness.emitWindow("online");
  await harness.settle();

  assert.equal(harness.syncCalls, 1, "reconnection immediately resumes cloud sync");
});

test("v1.8.2 dynamic flow retries on foreground focus without requiring force save", async () => {
  const harness = createHarness({ unsynced: true, type: "working", message: "Saving to cloud…" });
  harness.emitWindow("focus");
  await harness.settle();

  assert.equal(harness.syncCalls, 1);
});

test("v1.8.2 dynamic flow keeps pending presentation after a failed retry", async () => {
  const harness = createHarness(
    { unsynced: true, type: "error", message: "Cloud save failed; changes are safe on this device and will retry." },
    () => Promise.resolve(false)
  );

  await harness.api.resumeImmediately();
  await harness.settle();

  assert.equal(harness.state.unsynced, true, "the simulated dirty state remains pending");
  assert.equal(harness.button.dataset.state, "working");
  assert.equal(harness.status.dataset.type, "working");
  assert.equal(harness.timers.size, 1, "a later retry remains scheduled");
});

test("v1.8.2 dynamic flow stops retrying after a confirmed successful sync", async () => {
  const harness = createHarness(
    { unsynced: true, type: "working", message: "Saving to cloud…" },
    ({ state }) => {
      state.unsynced = false;
      state.syncing = false;
      state.type = "success";
      state.message = "Saved to cloud";
      return Promise.resolve(true);
    }
  );

  await harness.api.resumeImmediately();
  await harness.settle();

  assert.equal(harness.syncCalls, 1);
  assert.equal(harness.state.unsynced, false);
  assert.equal(harness.timers.size, 0, "confirmed saved state cancels retry scheduling");
});

test("v1.8.2 dynamic flow coalesces rapid resume events into one in-flight sync", async () => {
  let resolveSync;
  const pending = new Promise((resolve) => {
    resolveSync = resolve;
  });
  const harness = createHarness(
    { unsynced: true, type: "working", message: "Saving to cloud…" },
    () => pending
  );

  const first = harness.api.resumeImmediately();
  harness.emitWindow("focus");
  harness.emitWindow("online");
  const second = harness.api.resumeImmediately();

  assert.equal(harness.syncCalls, 1, "rapid lifecycle events share the same immediate sync attempt");
  assert.equal(first, second, "callers receive the same in-flight resume promise");
  assert.equal(harness.timers.size, 0, "no delayed retry overlaps the in-flight resume");

  harness.state.unsynced = false;
  harness.state.type = "success";
  harness.state.message = "Saved to cloud";
  resolveSync(true);
  await first;
  await harness.settle();

  assert.equal(harness.timers.size, 0);
});

test("v1.8.2 dynamic flow pauses retry timers while hidden without clearing pending work", () => {
  const harness = createHarness({ unsynced: true, type: "working", message: "Saving to cloud…" });
  assert.equal(harness.timers.size, 1);

  harness.document.visibilityState = "hidden";
  harness.emitDocument("visibilitychange");

  assert.equal(harness.timers.size, 0, "backgrounding clears only the retry timer");
  assert.equal(harness.syncCalls, 0, "backgrounding does not force a network save from the V2 overlay");
  assert.equal(harness.state.unsynced, true, "pending/dirty state remains protected for the next resume");
});

test("v1.8.2 canonical cloud clears dirty state only on confirmed save paths", () => {
  assert.match(
    cloudSource,
    /if \(sequence === writeSequence && !pendingSync\) \{\s*removeRedundantStateCache\(userId\);\s*safeStorageRemove\(dirtyKey\(userId\)\);/,
    "matching or confirmed saves clear dirty only when no newer local write is pending"
  );
  assert.match(
    cloudSource,
    /if \(loadError\) \{[\s\S]*?Cloud unavailable; changes are safe on this device and will retry\.[\s\S]*?return false;/,
    "preflight failure returns without clearing the dirty marker"
  );
  assert.match(
    cloudSource,
    /if \(error\) \{[\s\S]*?Cloud save failed; changes are safe on this device and will retry\.[\s\S]*?return false;/,
    "write failure returns without clearing the dirty marker"
  );
  assert.match(
    cloudSource,
    /else \{\s*safeStorageSet\(dirtyKey\(userId\), "1"\);\s*\}/,
    "newer writes preserve the dirty marker instead of being cleared by an older save"
  );
});
