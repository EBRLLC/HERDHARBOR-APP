"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

(async () => {
  const instrumentation = await import(pathToFileURL(path.resolve(__dirname, "../monitoring/herdharbor-monitoring-instrumentation.mjs")).href);
  const core = await import(pathToFileURL(path.resolve(__dirname, "../monitoring/herdharbor-monitoring-core.mjs")).href);

  const failures = [];
  const monitoringStub = {
    captureOperationalFailure(category, metadata, error) {
      failures.push({ category, metadata, error });
    },
    setModule() {},
    addBreadcrumb() {}
  };

  class FakeStorage {
    setItem(key, value) {
      throw new Error(`Quota failure while storing ${key}; private value ${value}`);
    }
    removeItem(key) {
      throw new Error(`Remove failure ${key}`);
    }
  }
  const runtime = { Storage: FakeStorage };
  assert.equal(instrumentation.installStorageFailureMonitoring(monitoringStub, runtime), true);

  const storage = new FakeStorage();
  assert.throws(() => storage.setItem("herdharbor_pre_alpha_v1", "Judy private record contents"));
  assert.equal(failures.length, 1);
  assert.equal(failures[0].category, "storage_failure");
  assert.deepEqual(failures[0].metadata, {
    module: "backup",
    operation: "local_storage_write",
    result: "failure",
    storage_type: "localStorage"
  });
  assert.ok(!JSON.stringify(failures[0].metadata).includes("Judy"));
  assert.ok(!JSON.stringify(failures[0].metadata).includes("herdharbor_pre_alpha_v1"));

  assert.throws(() => storage.removeItem("private-record-key"));
  assert.equal(failures.length, 2);
  assert.equal(failures[1].metadata.operation, "local_storage_remove");
  assert.ok(!JSON.stringify(failures[1].metadata).includes("private-record-key"));

  // IndexedDB is used for local recovery snapshots. Instrument only open and
  // transaction failures; never inspect database names, store names, keys, or values.
  class FakeRequest {
    constructor() {
      this.error = new Error("IndexedDB request failed for private recovery data");
      this.listeners = new Map();
    }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    emit(type) { this.listeners.get(type)?.(); }
  }
  class FakeIDBFactory {
    open(databaseName) {
      this.lastDatabaseName = databaseName;
      this.request = new FakeRequest();
      return this.request;
    }
  }
  class FakeTransaction {
    constructor() {
      this.error = new Error("IndexedDB transaction failed with private animal data");
      this.listeners = new Map();
    }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    emit(type) { this.listeners.get(type)?.(); }
  }
  class FakeIDBDatabase {
    transaction(storeName) {
      this.lastStoreName = storeName;
      this.lastTransaction = new FakeTransaction();
      return this.lastTransaction;
    }
  }

  const indexedRuntime = { IDBFactory: FakeIDBFactory, IDBDatabase: FakeIDBDatabase };
  assert.equal(instrumentation.installIndexedDbFailureMonitoring(monitoringStub, indexedRuntime), true);
  const factory = new FakeIDBFactory();
  const request = factory.open("private-recovery-database-name");
  request.emit("error");
  assert.equal(failures.at(-1).category, "storage_failure");
  assert.deepEqual(failures.at(-1).metadata, {
    module: "backup",
    operation: "indexeddb_open",
    result: "failure",
    storage_type: "indexedDB"
  });
  assert.ok(!JSON.stringify(failures.at(-1).metadata).includes("private-recovery-database-name"));

  const database = new FakeIDBDatabase();
  const transaction = database.transaction("private-snapshot-store");
  transaction.emit("error");
  transaction.emit("abort");
  assert.equal(failures.at(-1).metadata.operation, "indexeddb_transaction_error");
  assert.ok(!JSON.stringify(failures.at(-1).metadata).includes("private-snapshot-store"));

  // Spreadsheet wrappers receive the original arguments but monitoring gets
  // only the controlled operation/category, never workbook rows or file data.
  const spreadsheetRuntime = {
    navigator: { onLine: true, userAgent: "", platform: "" },
    location: { hostname: "localhost", hash: "#dashboard" },
    document: { referrer: "" },
    matchMedia: () => ({ matches: false }),
    HerdHarborSpreadsheet: {
      downloadExport(privateWorkbook) {
        throw new Error(`Export failed for ${privateWorkbook.customerEmail} with Judy notes`);
      },
      async openImport(privateRows) {
        throw new Error(`Import failed with ${privateRows[0].notes}`);
      }
    }
  };
  const monitor = core.createHerdHarborMonitoring(null, spreadsheetRuntime);
  monitor.init({ dsn: "", environment: "test" });
  assert.equal(monitor.instrumentSpreadsheet(), true);
  assert.throws(() => spreadsheetRuntime.HerdHarborSpreadsheet.downloadExport({
    customerEmail: "customer@example.com",
    animal: "Judy",
    notes: "private finance notes"
  }));
  await assert.rejects(() => spreadsheetRuntime.HerdHarborSpreadsheet.openImport([{ notes: "private medical notes" }]));

  // Adapters must never serialize operation arguments. Static checks make the
  // privacy invariant explicit for both spreadsheets and storage wrappers.
  const coreSource = fs.readFileSync(path.resolve(__dirname, "../monitoring/herdharbor-monitoring-core.mjs"), "utf8");
  const instrumentationSource = fs.readFileSync(path.resolve(__dirname, "../monitoring/herdharbor-monitoring-instrumentation.mjs"), "utf8");
  assert.match(coreSource, /original\.apply\(spreadsheet, args\)/);
  assert.doesNotMatch(coreSource, /metadata:\s*args|record_count:\s*args|JSON\.stringify\(args\)/);
  assert.match(instrumentationSource, /indexeddb_open/);
  assert.match(instrumentationSource, /indexeddb_transaction_error/);
  assert.doesNotMatch(instrumentationSource, /databaseName|storeName|JSON\.stringify\(args\)|metadata:\s*args/);

  console.log("Alpha v1.6.1 localStorage, IndexedDB, and import-export monitoring adapter tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
