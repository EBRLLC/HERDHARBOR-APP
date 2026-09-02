"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

(async () => {
  const core = await import(pathToFileURL(path.resolve(__dirname, "../monitoring/herdharbor-monitoring-core.mjs")).href);

  const captures = [];
  const sdk = {
    init() {},
    setTag() {},
    setContext() {},
    addBreadcrumb() {},
    withScope(callback) {
      const tags = {};
      const contexts = {};
      callback({
        setTag(key, value) { tags[key] = value; },
        setContext(key, value) { contexts[key] = value; },
        setFingerprint() {}
      });
      captures.push({ tags, contexts });
    },
    captureMessage() { return "event-id"; }
  };

  const runtime = {
    navigator: { onLine: true, userAgent: "Mozilla/5.0", platform: "test" },
    location: { hostname: "localhost", hash: "#sync" },
    document: { referrer: "" },
    matchMedia: () => ({ matches: false }),
    crypto: {
      getRandomValues(bytes) {
        bytes.set([0x11, 0x22, 0x33, 0x44]);
        return bytes;
      }
    }
  };

  const monitoring = core.createHerdHarborMonitoring(sdk, runtime);
  assert.equal(monitoring.init({ dsn: "https://public@example.invalid/123", environment: "test" }), true);

  const categories = [
    "network_unavailable",
    "authentication_failure",
    "upload_failure",
    "download_failure",
    "conflict_failure",
    "serialization_failure",
    "invalid_response",
    "unexpected_sync_exception"
  ];

  for (const category of categories) {
    const result = monitoring.captureOperationalFailure(category, {
      module: "sync",
      operation: "sync_test",
      result: "failure",
      online: true,
      payload: "PRIVATE CLOUD SYNC RECORDS MUST NEVER LEAVE HERDHARBOR",
      email: "customer@example.com",
      token: "secret-token"
    });
    assert.equal(result.captured, true, `${category} should be captured as a distinct controlled category`);
  }

  assert.equal(captures.length, categories.length);
  assert.deepEqual(captures.map((capture) => capture.tags.hh_error_category), categories);
  for (const capture of captures) {
    assert.equal(capture.tags.hh_module, "sync");
    const operationContext = capture.contexts["herdharbor.operation"] || {};
    assert.equal(operationContext.operation, "sync_test");
    assert.equal(operationContext.result, "failure");
    assert.equal(operationContext.online, true);
    assert.equal("payload" in operationContext, false);
    assert.equal("email" in operationContext, false);
    assert.equal("token" in operationContext, false);
    assert.doesNotMatch(JSON.stringify(operationContext), /PRIVATE CLOUD SYNC RECORDS|customer@example\.com|secret-token/);
  }

  console.log("Alpha v1.6.5 Cloud Sync monitoring taxonomy and sanitization tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
