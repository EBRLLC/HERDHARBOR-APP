"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const cloudSource = fs.readFileSync(path.join(root, "herdharbor-cloud.js"), "utf8");

class NameList {
  constructor(readNames) {
    this.readNames = readNames;
  }
  contains(name) {
    return this.readNames().includes(String(name));
  }
  item(index) {
    return this.readNames()[index] ?? null;
  }
  get length() {
    return this.readNames().length;
  }
  [Symbol.iterator]() {
    return this.readNames()[Symbol.iterator]();
  }
}

function clone(value) {
  return structuredClone(value);
}

class FakeStoreData {
  constructor(name, options = {}) {
    this.name = name;
    this.keyPath = options.keyPath ?? null;
    this.autoIncrement = options.autoIncrement === true;
    this.records = new Map();
    this.indexes = new Map();
    this.nextKey = 1;
    this.indexNames = new NameList(() => [...this.indexes.keys()]);
  }

  createIndex(name, keyPath) {
    if (this.indexes.has(name)) throw new Error(`Index ${name} already exists.`);
    this.indexes.set(String(name), String(keyPath));
    return { name: String(name), keyPath: String(keyPath) };
  }

  seed(record) {
    const value = clone(record);
    let key = this.keyPath ? value[this.keyPath] : undefined;
    if (key == null && this.autoIncrement) {
      key = this.nextKey++;
      if (this.keyPath) value[this.keyPath] = key;
    }
    if (typeof key === "number" && key >= this.nextKey) this.nextKey = key + 1;
    this.records.set(key, value);
  }
}

class FakeBoundStore {
  constructor(data, transaction) {
    this.data = data;
    this.transaction = transaction;
  }
  get indexNames() {
    return this.data.indexNames;
  }
  createIndex(name, keyPath) {
    return this.data.createIndex(name, keyPath);
  }
  index(name) {
    if (!this.data.indexes.has(name)) throw new Error(`Index ${name} was not found.`);
    const keyPath = this.data.indexes.get(name);
    return {
      getAll: (value) => this.transaction.request(() =>
        [...this.data.records.values()]
          .filter((record) => record?.[keyPath] === value)
          .map(clone)
      )
    };
  }
  add(record) {
    return this.transaction.request(() => {
      const value = clone(record);
      let key = this.data.keyPath ? value[this.data.keyPath] : undefined;
      if (key == null && this.data.autoIncrement) {
        key = this.data.nextKey++;
        if (this.data.keyPath) value[this.data.keyPath] = key;
      }
      if (key == null) throw new Error("A key is required.");
      if (this.data.records.has(key)) throw new Error("ConstraintError");
      this.data.records.set(key, value);
      return key;
    });
  }
  delete(key) {
    return this.transaction.request(() => this.data.records.delete(key));
  }
}

class FakeTransaction {
  constructor(database, mode = "readonly") {
    this.database = database;
    this.mode = mode;
    this.pending = 0;
    this.aborted = false;
    this.error = null;
    this.oncomplete = null;
    this.onerror = null;
    this.onabort = null;
    this.completeQueued = false;
  }

  objectStore(name) {
    const store = this.database.stores.get(String(name));
    if (!store) throw new Error(`Object store ${name} was not found.`);
    return new FakeBoundStore(store, this);
  }

  request(operation) {
    const request = { result: undefined, error: null, onsuccess: null, onerror: null };
    this.pending += 1;
    queueMicrotask(() => {
      if (this.aborted) return;
      try {
        request.result = operation();
        request.onsuccess?.({ target: request });
      } catch (error) {
        request.error = error;
        this.error = error;
        request.onerror?.({ target: request });
        this.onerror?.({ target: this });
      } finally {
        this.pending -= 1;
        this.queueCompletion();
      }
    });
    return request;
  }

  queueCompletion() {
    if (this.pending !== 0 || this.completeQueued || this.aborted) return;
    this.completeQueued = true;
    queueMicrotask(() => {
      this.completeQueued = false;
      if (!this.aborted && this.pending === 0) this.oncomplete?.({ target: this });
    });
  }

  abort() {
    if (this.aborted) return;
    this.aborted = true;
    this.error = new Error("AbortError");
    queueMicrotask(() => this.onabort?.({ target: this }));
  }
}

class FakeDatabase {
  constructor(name, version) {
    this.name = name;
    this.version = version;
    this.stores = new Map();
    this.objectStoreNames = new NameList(() => [...this.stores.keys()]);
  }

  createObjectStore(name, options = {}) {
    if (this.stores.has(name)) throw new Error(`Object store ${name} already exists.`);
    const store = new FakeStoreData(String(name), options);
    this.stores.set(String(name), store);
    return store;
  }

  transaction(name, mode = "readonly") {
    const transaction = new FakeTransaction(this, mode);
    transaction.objectStore(name);
    return transaction;
  }

  close() {}
}

class FakeIndexedDB {
  constructor() {
    this.databases = new Map();
  }

  seed(name, version, stores = {}) {
    const database = new FakeDatabase(name, version);
    for (const [storeName, definition] of Object.entries(stores)) {
      const store = database.createObjectStore(storeName, {
        keyPath: definition.keyPath,
        autoIncrement: definition.autoIncrement
      });
      for (const [indexName, keyPath] of Object.entries(definition.indexes || {})) {
        store.createIndex(indexName, keyPath);
      }
      for (const record of definition.records || []) store.seed(record);
    }
    this.databases.set(name, database);
    return database;
  }

  open(name, requestedVersion) {
    const request = {
      result: null,
      error: null,
      transaction: null,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      onblocked: null
    };

    queueMicrotask(() => {
      try {
        const existing = this.databases.get(name);
        const oldVersion = existing?.version || 0;
        const nextVersion = requestedVersion ?? (oldVersion || 1);
        if (oldVersion && nextVersion < oldVersion) throw new Error("VersionError");

        const database = existing || new FakeDatabase(name, nextVersion);
        request.result = database;
        this.databases.set(name, database);

        if (!existing || nextVersion > oldVersion) {
          database.version = nextVersion;
          request.transaction = new FakeTransaction(database, "versionchange");
          request.onupgradeneeded?.({
            oldVersion,
            newVersion: nextVersion,
            target: request
          });
          if (request.transaction.aborted) {
            request.error = request.transaction.error || new Error("AbortError");
            request.onerror?.({ target: request });
            return;
          }
        }

        request.onsuccess?.({ target: request });
      } catch (error) {
        request.error = error;
        request.onerror?.({ target: request });
      }
    });

    return request;
  }

  records(name, storeName) {
    const database = this.databases.get(name);
    const store = database?.stores.get(storeName);
    return store ? [...store.records.values()].map(clone) : [];
  }
}

function readStringConstant(name) {
  const match = cloudSource.match(new RegExp(`const ${name} = "([^"]+)";`));
  assert.ok(match, `${name} must exist in herdharbor-cloud.js`);
  return match[1];
}

function readNumberConstant(name) {
  const match = cloudSource.match(new RegExp(`const ${name} = ([0-9_]+);`));
  assert.ok(match, `${name} must exist in herdharbor-cloud.js`);
  return Number(match[1].replaceAll("_", ""));
}

function recoveryHarness(indexedDB, testConsole = console) {
  const start = cloudSource.indexOf("  function recoverySchemaError");
  const end = cloudSource.indexOf("  function preserveActiveForUser", start);
  assert.ok(start >= 0 && end > start, "production recovery helpers must remain extractable for behavioral tests");

  const RECOVERY_DB_NAME = readStringConstant("RECOVERY_DB_NAME");
  const RECOVERY_STORE_NAME = readStringConstant("RECOVERY_STORE_NAME");
  const RECOVERY_DB_VERSION = readNumberConstant("RECOVERY_DB_VERSION");
  const MAX_RECOVERY_SNAPSHOTS = readNumberConstant("MAX_RECOVERY_SNAPSHOTS");
  const MAX_RECOVERY_BYTES = readNumberConstant("MAX_RECOVERY_BYTES");

  const factory = new Function(
    "window",
    "indexedDB",
    "console",
    "RECOVERY_DB_NAME",
    "RECOVERY_STORE_NAME",
    "RECOVERY_DB_VERSION",
    "MAX_RECOVERY_SNAPSHOTS",
    "MAX_RECOVERY_BYTES",
    `
      "use strict";
      function safeParse(rawValue) {
        if (!rawValue || typeof rawValue !== "string") return null;
        try {
          const value = JSON.parse(rawValue);
          return value && typeof value === "object" ? value : null;
        } catch {
          return null;
        }
      }
      ${cloudSource.slice(start, end)}
      return {
        openRecoveryDatabase,
        recordRecoverySnapshot,
        validateRecoveryDatabase
      };
    `
  );

  return {
    RECOVERY_DB_NAME,
    RECOVERY_STORE_NAME,
    RECOVERY_DB_VERSION,
    MAX_RECOVERY_SNAPSHOTS,
    MAX_RECOVERY_BYTES,
    ...factory(
      { indexedDB },
      indexedDB,
      testConsole,
      RECOVERY_DB_NAME,
      RECOVERY_STORE_NAME,
      RECOVERY_DB_VERSION,
      MAX_RECOVERY_SNAPSHOTS,
      MAX_RECOVERY_BYTES
    )
  };
}

function snapshotDefinition(records = []) {
  return {
    keyPath: "id",
    autoIncrement: true,
    indexes: { userId: "userId", createdAt: "createdAt" },
    records
  };
}

test("existing v1 states-only recovery database upgrades in place and stores snapshots", async () => {
  const indexedDB = new FakeIndexedDB();
  const harness = recoveryHarness(indexedDB);
  indexedDB.seed(harness.RECOVERY_DB_NAME, 1, {
    states: {
      keyPath: "id",
      autoIncrement: true,
      indexes: {},
      records: [{ id: 1, value: "preserve-me" }]
    }
  });

  const database = await harness.openRecoveryDatabase();
  assert.equal(database.version, 2);
  assert.equal(database.objectStoreNames.contains("states"), true);
  assert.equal(database.objectStoreNames.contains("snapshots"), true);
  const snapshotStore = database.transaction("snapshots", "readonly").objectStore("snapshots");
  assert.equal(snapshotStore.indexNames.contains("userId"), true);
  assert.equal(snapshotStore.indexNames.contains("createdAt"), true);
  database.close();

  assert.deepEqual(indexedDB.records(harness.RECOVERY_DB_NAME, "states"), [
    { id: 1, value: "preserve-me" }
  ]);

  const rawValue = JSON.stringify({ animals: [{ id: "rabbit-1" }] });
  assert.equal(await harness.recordRecoverySnapshot("owner-1", rawValue, "upgrade-test"), true);
  const snapshots = indexedDB.records(harness.RECOVERY_DB_NAME, "snapshots");
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].userId, "owner-1");
  assert.equal(snapshots[0].rawValue, rawValue);
});

test("existing snapshots survive the v1 to v2 schema upgrade", async () => {
  const indexedDB = new FakeIndexedDB();
  const harness = recoveryHarness(indexedDB);
  const existing = {
    id: 7,
    userId: "owner-1",
    createdAt: "2026-09-01T12:00:00.000Z",
    reason: "existing",
    rawValue: JSON.stringify({ tasks: [{ id: "task-1" }] })
  };
  indexedDB.seed(harness.RECOVERY_DB_NAME, 1, {
    snapshots: snapshotDefinition([existing])
  });

  const database = await harness.openRecoveryDatabase();
  assert.equal(database.version, 2);
  database.close();
  assert.deepEqual(indexedDB.records(harness.RECOVERY_DB_NAME, "snapshots"), [existing]);
});

test("fresh recovery storage is created at v2 with a writable validated snapshots schema", async () => {
  const indexedDB = new FakeIndexedDB();
  const harness = recoveryHarness(indexedDB);
  const database = await harness.openRecoveryDatabase();

  assert.equal(database.version, 2);
  assert.deepEqual([...database.objectStoreNames], ["snapshots"]);
  const store = database.transaction("snapshots", "readonly").objectStore("snapshots");
  assert.deepEqual([...store.indexNames].sort(), ["createdAt", "userId"]);
  assert.equal(harness.validateRecoveryDatabase(database), true);
  database.close();

  const rawValue = JSON.stringify({ profile: { operationName: "Fresh" } });
  assert.equal(await harness.recordRecoverySnapshot("owner-fresh", rawValue, "fresh-install"), true);
  assert.equal(indexedDB.records(harness.RECOVERY_DB_NAME, "snapshots").length, 1);
});

test("duplicate recovery snapshots remain suppressed", async () => {
  const indexedDB = new FakeIndexedDB();
  const harness = recoveryHarness(indexedDB);
  const rawValue = JSON.stringify({ animals: [{ id: "same" }] });

  assert.equal(await harness.recordRecoverySnapshot("owner-duplicate", rawValue, "before-change"), true);
  assert.equal(await harness.recordRecoverySnapshot("owner-duplicate", rawValue, "before-change-again"), true);

  const snapshots = indexedDB.records(harness.RECOVERY_DB_NAME, "snapshots")
    .filter((row) => row.userId === "owner-duplicate");
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].rawValue, rawValue);
});

test("recovery retention still enforces count and byte-budget limits", async () => {
  const countDb = new FakeIndexedDB();
  const countHarness = recoveryHarness(countDb);

  for (let index = 0; index < countHarness.MAX_RECOVERY_SNAPSHOTS + 2; index += 1) {
    const rawValue = JSON.stringify({ revision: index });
    assert.equal(await countHarness.recordRecoverySnapshot("owner-count", rawValue, `revision-${index}`), true);
  }

  const retainedByCount = countDb.records(countHarness.RECOVERY_DB_NAME, "snapshots")
    .filter((row) => row.userId === "owner-count");
  assert.equal(retainedByCount.length, countHarness.MAX_RECOVERY_SNAPSHOTS);

  const byteDb = new FakeIndexedDB();
  const byteHarness = recoveryHarness(byteDb);
  const largeA = JSON.stringify({ payload: "a".repeat(2_100_000) });
  const largeB = JSON.stringify({ payload: "b".repeat(2_100_000) });
  assert.ok(largeA.length * 2 < byteHarness.MAX_RECOVERY_BYTES);
  assert.ok((largeA.length + largeB.length) * 2 > byteHarness.MAX_RECOVERY_BYTES);

  assert.equal(await byteHarness.recordRecoverySnapshot("owner-bytes", largeA, "large-a"), true);
  assert.equal(await byteHarness.recordRecoverySnapshot("owner-bytes", largeB, "large-b"), true);

  const retainedByBytes = byteDb.records(byteHarness.RECOVERY_DB_NAME, "snapshots")
    .filter((row) => row.userId === "owner-bytes");
  assert.equal(retainedByBytes.length, 1);
  assert.equal(retainedByBytes[0].rawValue, largeB);
});

test("already-version-2 malformed recovery storage fails validation without deleting data", async () => {
  const indexedDB = new FakeIndexedDB();
  const warnings = [];
  const errors = [];
  const harness = recoveryHarness(indexedDB, {
    warn: (...args) => warnings.push(args),
    error: (...args) => errors.push(args)
  });
  indexedDB.seed(harness.RECOVERY_DB_NAME, 2, {
    states: {
      keyPath: "id",
      autoIncrement: true,
      records: [{ id: 3, value: "still-here" }]
    }
  });

  await assert.rejects(
    harness.openRecoveryDatabase(),
    (error) => error?.code === "HH_RECOVERY_SCHEMA_INVALID"
  );
  assert.deepEqual(indexedDB.records(harness.RECOVERY_DB_NAME, "states"), [
    { id: 3, value: "still-here" }
  ]);
  assert.equal(indexedDB.databases.has(harness.RECOVERY_DB_NAME), true);
  assert.equal(errors.length, 1);
});
