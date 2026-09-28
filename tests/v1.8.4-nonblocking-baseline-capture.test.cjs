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
    "console",
    "dirtyKey",
    "versionKey",
    "writeCloudBaseline",
    "dispatchBaselineRestored",
    `
      "use strict";
      ${source.slice(start, end)}
      return captureCleanBaselineBeforeLocalCommit;
    `
  );
}

function createHarness({ writeCloudBaseline = () => new Promise(() => {}), storageValues = {} } = {}) {
  const cloudBaselineMemory = new Map();
  const storage = new Map(Object.entries(storageValues));
  const restored = [];
  const warnings = [];

  const originalGetItem = {
    call(_storage, key) {
      return storage.get(String(key)) ?? null;
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
    { warn: (...args) => warnings.push(args) },
    (userId) => `dirty:${userId}`,
    (userId) => `version:${userId}`,
    writeCloudBaseline,
    (userId, reason) => restored.push({ userId, reason })
  );

  return { capture, cloudBaselineMemory, restored, warnings };
}

test("first clean local edit stages its merge baseline without waiting for durable persistence", () => {
  const h = createHarness({
    writeCloudBaseline: () => new Promise(() => {}),
    storageValues: {
      "version:owner-1": "2026-09-28T05:00:00.000Z"
    }
  });

  const previousRaw = JSON.stringify({ tasks: [{ id: "task-1", title: "before" }] });
  const result = h.capture("owner-1", previousRaw, "before-local-edit");

  assert.equal(result, true);
  assert.equal(result instanceof Promise, false);
  assert.equal(h.cloudBaselineMemory.get("owner-1"), previousRaw);
  assert.deepEqual(h.restored, [], "durable-success event must not fire while persistence is still pending");
});

test("an existing in-memory cloud baseline is never replaced by the pre-edit state", () => {
  let writes = 0;
  const h = createHarness({
    writeCloudBaseline: async () => {
      writes += 1;
      return true;
    },
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
  assert.equal(writes, 0);
  assert.equal(h.restored.length, 0);
});

test("baseline-restored event remains gated on successful durable persistence", async () => {
  let resolveWrite;
  const writePromise = new Promise((resolve) => {
    resolveWrite = resolve;
  });
  const h = createHarness({
    writeCloudBaseline: () => writePromise,
    storageValues: {
      "version:owner-1": "2026-09-28T05:00:00.000Z"
    }
  });

  const previousRaw = JSON.stringify({ tasks: [{ id: "task-1", title: "before" }] });
  assert.equal(h.capture("owner-1", previousRaw, "before-local-edit"), true);
  assert.deepEqual(h.restored, []);

  resolveWrite(true);
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(h.restored, [{ userId: "owner-1", reason: "before-local-edit" }]);
});
