"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const StateStoreModule = require("../herdharbor-state-store-v1.8.4.js");

const OWNER_KEY = "herdharbor_active_user_v1";
const STATE_KEY = "herdharbor_pre_alpha_v1";

class MemoryStorage {
  constructor(seed = {}) {
    this.values = new Map(Object.entries(seed).map(([key, value]) => [String(key), String(value)]));
    this.failOncePrefix = "";
  }
  getItem(key) {
    return this.values.has(String(key)) ? this.values.get(String(key)) : null;
  }
  setItem(key, value) {
    const textKey = String(key);
    if (this.failOncePrefix && textKey.startsWith(this.failOncePrefix)) {
      this.failOncePrefix = "";
      throw new Error("simulated durable metadata interruption");
    }
    this.values.set(textKey, String(value));
  }
  removeItem(key) {
    this.values.delete(String(key));
  }
}

function createStore(storage, timestamps = []) {
  let counter = 0;
  return StateStoreModule.create({
    storage,
    indexedDB: null,
    now: () => timestamps[counter++] || `2026-09-24T12:00:0${counter}.000Z`
  });
}

test("local-first commit durably writes the compatibility snapshot and record-level mutation before network acknowledgement", () => {
  const storage = new MemoryStorage({ [OWNER_KEY]: "user-1" });
  const store = createStore(storage);
  const state = { animals: [{ id: "a1", name: "Judy" }] };

  const result = store.commit(state, { source: "local", reason: "animal-save" });

  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.deepEqual(JSON.parse(storage.getItem(STATE_KEY)), state);
  assert.equal(store.getOutbox("user-1").length, 1);
  assert.deepEqual(
    store.getOutbox("user-1")[0],
    {
      mutationId: result.mutations[0].mutationId,
      ownerId: "user-1",
      domain: "animals",
      recordId: "a1",
      operation: "create",
      expectedCloudVersion: null,
      localRevision: 1,
      createdAt: result.mutations[0].createdAt,
      retryState: "pending",
      retryCount: 0,
      nextRetryAt: null,
      lastErrorClass: null
    }
  );
  assert.doesNotMatch(JSON.stringify(store.getOutbox("user-1")), /Judy/, "outbox metadata must not duplicate farm record payloads");
});

test("reload or installed-app close before acknowledgement preserves pending mutations", () => {
  const storage = new MemoryStorage({ [OWNER_KEY]: "user-1" });
  const first = createStore(storage);
  first.commit({ tasks: [{ id: "t1", title: "Check nest" }] }, { source: "local" });

  const reloaded = createStore(storage);
  assert.equal(reloaded.getOutbox("user-1").length, 1);
  assert.match(reloaded.getOutbox("user-1")[0].mutationId, /^hhm:user-1:1:tasks-[a-f0-9-]+:t1-[a-f0-9-]+:create$/);
  assert.equal(reloaded.getState().tasks[0].id, "t1");
});

test("prepared local transaction recovers its outbox after interruption between state and metadata persistence", () => {
  const storage = new MemoryStorage({
    [OWNER_KEY]: "user-1",
    [STATE_KEY]: JSON.stringify({ animals: [{ id: "a1", name: "Judy" }] })
  });
  const first = createStore(storage);
  storage.failOncePrefix = "herdharbor_state_revision_v1_";

  const result = first.commit(
    { animals: [{ id: "a1", name: "Judy", notes: "offline edit" }] },
    { source: "local" }
  );

  assert.equal(result.ok, true);
  assert.equal(result.outboxRecoveryPending, true);
  assert.equal(JSON.parse(storage.getItem(STATE_KEY)).animals[0].notes, "offline edit");
  assert.ok(storage.getItem("herdharbor_state_txn_v1"), "prepared transaction survives the interrupted metadata write");

  const restarted = createStore(storage);
  const pending = restarted.getOutbox("user-1");
  assert.equal(pending.length, 1);
  assert.equal(pending[0].domain, "animals");
  assert.equal(pending[0].recordId, "a1");
  assert.equal(pending[0].operation, "update");
  assert.equal(storage.getItem("herdharbor_state_txn_v1"), null);
});

test("retry metadata is durable and duplicate retry handling does not duplicate the mutation", () => {
  const storage = new MemoryStorage({ [OWNER_KEY]: "user-1" });
  const store = createStore(storage);
  store.commit({ animals: [{ id: "a1" }] }, { source: "local" });
  const id = store.getOutbox("user-1")[0].mutationId;

  assert.equal(store.markMutationRetry(id, { lastErrorClass: "offline" }, "user-1"), true);
  assert.equal(store.markMutationRetry(id, { lastErrorClass: "provider" }, "user-1"), true);

  const pending = createStore(storage).getOutbox("user-1");
  assert.equal(pending.length, 1);
  assert.equal(pending[0].mutationId, id);
  assert.equal(pending[0].retryCount, 2);
  assert.equal(pending[0].lastErrorClass, "provider");
});

test("cloud record version is carried into update and delete mutations and acknowledgement clears only confirmed work", () => {
  const storage = new MemoryStorage({ [OWNER_KEY]: "user-1" });
  const store = createStore(storage);
  store.commit({ animals: [{ id: "a1", name: "Judy" }, { id: "a2", name: "Jack" }] }, { source: "local" });
  assert.equal(store.acknowledgeMutations(store.getOutbox("user-1").map((entry) => entry.mutationId), "user-1"), true);

  store.setRecordVersion("animals", "a1", 7, "user-1");
  store.commit({ animals: [{ id: "a1", name: "Judy Updated" }, { id: "a2", name: "Jack" }] }, { source: "local" });
  let pending = store.getOutbox("user-1");
  assert.equal(pending.length, 1);
  assert.equal(pending[0].operation, "update");
  assert.equal(pending[0].recordId, "a1");
  assert.equal(pending[0].expectedCloudVersion, 7);

  assert.equal(store.acknowledgeMutation(pending[0].mutationId, "user-1"), true);
  assert.equal(store.getOutbox("user-1").length, 0);

  store.commit({ animals: [{ id: "a2", name: "Jack" }] }, { source: "local" });
  pending = store.getOutbox("user-1");
  assert.equal(pending.length, 1);
  assert.equal(pending[0].operation, "delete");
  assert.equal(pending[0].recordId, "a1");
  assert.equal(pending[0].expectedCloudVersion, 7);
});

test("device-only UI preferences persist locally without generating cloud mutations", () => {
  const storage = new MemoryStorage({ [OWNER_KEY]: "user-1" });
  const store = createStore(storage);
  const result = store.commit(
    { settings: { theme: "dark", sidebarCollapsed: true } },
    { source: "local" }
  );

  assert.equal(result.ok, true);
  assert.equal(result.cloudRelevant, false);
  assert.deepEqual(result.mutations, []);
  assert.equal(store.getOutbox("user-1").length, 0);
  assert.equal(store.getState().settings.theme, "dark");
});

test("cloud compatibility replacement never creates a local mutation or echo outbox entry", () => {
  const storage = new MemoryStorage({ [OWNER_KEY]: "user-1" });
  const store = createStore(storage);
  const cloudRaw = JSON.stringify({ animals: [{ id: "remote-1", name: "Remote" }] });

  const result = store.replaceRaw(cloudRaw, { source: "cloud", notify: false });

  assert.equal(result.ok, true);
  assert.equal(store.compatibilitySnapshot(), cloudRaw);
  assert.equal(store.getOutbox("user-1").length, 0);
});

test("canonical persistence no longer depends on Storage prototype interception", () => {
  const root = path.resolve(__dirname, "..");
  const files = [
    "herdharbor-build.js",
    "herdharbor-cloud.js",
    "local-cache-v2-v1.8.2.js",
    "cloud-sync-v2-diagnostics-v1.8.2.js"
  ];
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.doesNotMatch(source, /Storage\.prototype\.(?:setItem|removeItem)\s*=/, `${file} must not replace Storage prototype methods`);
  }

  const app = fs.readFileSync(path.join(root, "herdharbor-app-runtime.js"), "utf8");
  assert.match(app, /canonicalStateStore\.commit\(state/);
  assert.doesNotMatch(app, /localStorage\.setItem\(STORAGE_KEY/);

  const cloud = fs.readFileSync(path.join(root, "herdharbor-cloud.js"), "utf8");
  assert.match(cloud, /canonicalStateStore\.subscribe\(handleCanonicalStateCommit\)/);
  assert.match(cloud, /canonicalStateStore\.replaceRaw/);

  const build = fs.readFileSync(path.join(root, "herdharbor-build.js"), "utf8");
  assert.doesNotMatch(build, /CLOUD_STATE_KEY|cloudDirtyKey|captureMissingBaselineBeforeMutation/);
});


test("mutation ids remain unique for sanitized and truncated logical-id collisions", () => {
  const storage = new MemoryStorage({ [OWNER_KEY]: "user-1" });
  const store = createStore(storage);
  const longPrefix = "x".repeat(140);
  const result = store.commit({
    animals: [
      { id: "a/b", name: "Slash" },
      { id: "a b", name: "Space" },
      { id: longPrefix + "-one", name: "Long One" },
      { id: longPrefix + "-two", name: "Long Two" }
    ]
  }, { source: "local" });

  assert.equal(result.ok, true);
  const pending = store.getOutbox("user-1");
  assert.equal(pending.length, 4);
  assert.equal(new Set(pending.map((entry) => entry.mutationId)).size, 4);
  assert.equal(new Set(pending.map((entry) => entry.recordId)).size, 4);
});
