"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "herdharbor-cloud.js"), "utf8");

function extractCaptureFactory() {
  const start = source.indexOf("  function captureCleanBaselineBeforeLocalCommit");
  const end = source.indexOf("  async function handleCanonicalStateCommit", start);
  assert.ok(start >= 0 && end > start, "captureCleanBaselineBeforeLocalCommit must remain extractable");

  return new Function(
    "safeParse",
    "cloudBaselineMemory",
    "originalGetItem",
    "localStorage",
    "baseKey",
    "legacyBaselineStore",
    "safeStorageRemove",
    "console",
    "dirtyKey",
    "versionKey",
    "dispatchBaselineRestored",
    "safeStorageSet",
    `
      "use strict";
      ${source.slice(start, end)}
      return captureCleanBaselineBeforeLocalCommit;
    `
  );
}

function createHarness({ durableGet = () => new Promise(() => {}), storageValues = {} } = {}) {
  const cloudBaselineMemory = new Map();
  const storage = new Map(Object.entries(storageValues));
  const restored = [];
  const fallbackWrites = [];
  const durableSets = [];
  const removes = [];

  const originalGetItem = {
    call(_storage, key) {
      return storage.get(String(key)) ?? null;
    }
  };

  const legacyBaselineStore = {
    get: durableGet,
    async set(userId, rawValue) {
      durableSets.push({ userId, rawValue });
      return true;
    }
  };

  const capture = extractCaptureFactory()(
    (value) => {
      try {
        const parsed = JSON.parse(String(value || ""));
        return parsed && typeof parsed === "object" ? parsed : null;
      } catch {
        return null;
      }
    },
    cloudBaselineMemory,
    originalGetItem,
    {},
    (userId) => `base:${userId}`,
    legacyBaselineStore,
    (key) => removes.push(key),
    { warn() {} },
    (userId) => `dirty:${userId}`,
    (userId) => `version:${userId}`,
    (userId, reason) => restored.push({ userId, reason }),
    (key, value) => {
      fallbackWrites.push({ key, value });
      storage.set(key, value);
      return true;
    }
  );

  return {
    capture,
    cloudBaselineMemory,
    restored,
    fallbackWrites,
    durableSets,
    removes
  };
}

test("first clean local edit stages its merge baseline without waiting for IndexedDB", () => {
  const h = createHarness({
    durableGet: () => new Promise(() => {}),
    storageValues: {
      "version:owner-1": "2026-09-28T05:00:00.000Z"
    }
  });

  const previousRaw = JSON.stringify({ tasks: [{ id: "task-1", title: "before" }] });
  const result = h.capture("owner-1", previousRaw, "before-local-edit");

  assert.equal(result, true);
  assert.equal(result instanceof Promise, false);
  assert.equal(h.cloudBaselineMemory.get("owner-1"), previousRaw);
  assert.deepEqual(h.restored, [{ userId: "owner-1", reason: "before-local-edit" }]);
});

test("an existing in-memory cloud baseline is never replaced by the pre-edit state", () => {
  const h = createHarness({
    storageValues: {
      "version:owner-1": "2026-09-28T05:00:00.000Z"
    }
  });

  const confirmed = JSON.stringify({ tasks: [{ id: "task-1", title: "confirmed" }] });
  const previousRaw = JSON.stringify({ tasks: [{ id: "task-1", title: "before" }] });
  h.cloudBaselineMemory.set("owner-1", confirmed);

  const result = h.capture("owner-1", previousRaw, "before-local-edit");

  assert.equal(result, false);
  assert.equal(h.cloudBaselineMemory.get("owner-1"), confirmed);
  assert.equal(h.restored.length, 0);
});

test("a legacy localStorage baseline is promoted to memory synchronously", () => {
  const legacyRaw = JSON.stringify({ tasks: [{ id: "task-1", title: "legacy-base" }] });
  const h = createHarness({
    storageValues: {
      "base:owner-1": legacyRaw,
      "version:owner-1": "2026-09-28T05:00:00.000Z"
    }
  });

  const result = h.capture(
    "owner-1",
    JSON.stringify({ tasks: [{ id: "task-1", title: "before" }] }),
    "before-local-edit"
  );

  assert.equal(result, false);
  assert.equal(h.cloudBaselineMemory.get("owner-1"), legacyRaw);
});
