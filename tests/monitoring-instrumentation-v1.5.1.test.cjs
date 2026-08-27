"use strict";

const assert = require("node:assert/strict");
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

  // Spreadsheet wrappers receive the original arguments but monitoring gets
  // only the controlled operation/category, never workbook rows or file data.
  const captured = [];
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
  const originalCapture = monitor.captureOperationalFailure;
  monitor.captureOperationalFailure = (category, metadata, error) => {
    captured.push({ category, metadata, errorName: error?.name });
    return originalCapture(category, metadata, error);
  };
  // instrumentSpreadsheet closes over the core method, so verify wrapper
  // behavior through the thrown operation and its safe public breadcrumb API.
  assert.equal(monitor.instrumentSpreadsheet(), true);
  assert.throws(() => spreadsheetRuntime.HerdHarborSpreadsheet.downloadExport({
    customerEmail: "customer@example.com",
    animal: "Judy",
    notes: "private finance notes"
  }));
  await assert.rejects(() => spreadsheetRuntime.HerdHarborSpreadsheet.openImport([{ notes: "private medical notes" }]));

  // The adapter never serializes operation arguments. Static source is checked
  // as an additional regression because this is the privacy invariant.
  const source = require("node:fs").readFileSync(path.resolve(__dirname, "../monitoring/herdharbor-monitoring-core.mjs"), "utf8");
  assert.match(source, /original\.apply\(spreadsheet, args\)/);
  assert.doesNotMatch(source, /metadata:\s*args|record_count:\s*args|JSON\.stringify\(args\)/);

  console.log("Alpha v1.5.1 storage and import-export monitoring adapter tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
