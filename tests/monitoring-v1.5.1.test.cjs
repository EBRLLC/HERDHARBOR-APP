"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

function makeRuntime(overrides = {}) {
  const listeners = new Map();
  const runtime = {
    location: { hostname: "localhost", hash: "#dashboard" },
    navigator: { userAgent: "Mozilla/5.0 Windows Chrome/151.0", platform: "Win32", onLine: true },
    document: {
      referrer: "",
      documentElement: {},
      addEventListener() {},
      querySelector() { return null; }
    },
    crypto: {
      getRandomValues(bytes) {
        bytes.set([0x7f, 0x2a, 0x91, 0xc4]);
        return bytes;
      }
    },
    matchMedia() { return { matches: false }; },
    addEventListener(type, listener) { listeners.set(type, listener); },
    setInterval() { return 1; },
    clearInterval() {},
    MutationObserver: class { observe() {} },
    __listeners: listeners,
    ...overrides
  };
  return runtime;
}

function makeFakeSentry() {
  const calls = {
    initOptions: null,
    tags: {},
    contexts: {},
    users: [],
    breadcrumbs: [],
    exceptionEvents: [],
    messageEvents: []
  };
  let activeScope = null;

  const sdk = {
    init(options) {
      if (typeof options.defaultIntegrations === "function") {
        throw new TypeError("defaultIntegrations must be false or an integration array");
      }
      calls.initOptions = options;
    },
    setTag(key, value) { calls.tags[key] = value; },
    setContext(name, value) { calls.contexts[name] = value; },
    setUser(user) { calls.users.push(user); },
    addBreadcrumb(breadcrumb) {
      const filtered = calls.initOptions?.beforeBreadcrumb ? calls.initOptions.beforeBreadcrumb(breadcrumb) : breadcrumb;
      if (filtered) calls.breadcrumbs.push(filtered);
    },
    withScope(callback) {
      const scope = {
        tags: {},
        contexts: {},
        fingerprint: null,
        setTag(key, value) { this.tags[key] = value; },
        setContext(name, value) { this.contexts[name] = value; },
        setFingerprint(value) { this.fingerprint = value; }
      };
      activeScope = scope;
      callback(scope);
      activeScope = null;
    },
    captureException(error) {
      const raw = {
        event_id: "exception-event",
        level: "error",
        exception: {
          values: [{
            type: error?.name || "Error",
            value: error?.message || String(error),
            stacktrace: { frames: [{ filename: "https://app.herdharbor.com/pwa.js?token=private", function: "test", lineno: 1, colno: 2 }] }
          }]
        },
        tags: activeScope?.tags || {},
        extra: activeScope?.contexts?.["herdharbor.operation"] || {}
      };
      const safe = calls.initOptions?.beforeSend ? calls.initOptions.beforeSend(raw) : raw;
      calls.exceptionEvents.push({ error, scope: activeScope, event: safe });
      return "exception-event";
    },
    captureMessage(message, level) {
      const raw = {
        event_id: "message-event",
        level,
        message,
        tags: activeScope?.tags || {},
        extra: activeScope?.contexts?.["herdharbor.operation"] || {}
      };
      const safe = calls.initOptions?.beforeSend ? calls.initOptions.beforeSend(raw) : raw;
      calls.messageEvents.push({ message, level, scope: activeScope, event: safe });
      return "message-event";
    }
  };
  return { sdk, calls };
}

(async () => {
  const core = await import(pathToFileURL(path.resolve(__dirname, "../monitoring/herdharbor-monitoring-core.mjs")).href);
  const privacy = await import(pathToFileURL(path.resolve(__dirname, "../monitoring/herdharbor-monitoring-privacy.mjs")).href);

  // Missing SDK and missing DSN both fail open.
  const noSdk = core.createHerdHarborMonitoring(null, makeRuntime());
  assert.equal(noSdk.init({ dsn: "https://public@example.invalid/1", environment: "test" }), false);
  assert.equal(noSdk.isEnabled(), false);
  assert.doesNotThrow(() => noSdk.captureError(new Error("test")));

  const missingDsnFake = makeFakeSentry();
  const missingDsn = core.createHerdHarborMonitoring(privacy.createPrivacySentryAdapter(missingDsnFake.sdk), makeRuntime());
  assert.equal(missingDsn.init({ dsn: "", environment: "test" }), false);
  assert.equal(missingDsnFake.calls.initOptions, null, "Sentry.init is not called without a DSN");

  const { sdk, calls } = makeFakeSentry();
  const runtime = makeRuntime();
  const monitoring = core.createHerdHarborMonitoring(privacy.createPrivacySentryAdapter(sdk), runtime);
  assert.equal(monitoring.init({
    dsn: "https://public@example.invalid/1",
    environment: "test",
    release: "HerdHarbor@1.6.1",
    build: "behavior-test",
    enableTestCrash: true
  }), true);

  assert.equal(calls.initOptions.sendDefaultPii, false);
  assert.equal(calls.initOptions.enableLogs, false);
  assert.equal(calls.initOptions.tracesSampleRate, 0);
  assert.equal(calls.initOptions.sampleRate, 1);
  assert.equal(calls.initOptions.release, "HerdHarbor@1.6.1");
  assert.equal(calls.initOptions.environment, "test");
  assert.equal(calls.initOptions.defaultIntegrations, undefined);
  const integrations = calls.initOptions.integrations([
    { name: "Breadcrumbs" },
    { name: "GlobalHandlers" },
    { name: "TryCatch" },
    { name: "BrowserTracing" },
    { name: "Replay" },
    { name: "Dedupe" }
  ]);
  assert.deepEqual(integrations.map((item) => item.name), ["Dedupe"]);

  assert.equal(monitoring.setModule("shows"), "shows");
  assert.equal(monitoring.getStatus().module, "shows");
  assert.equal(monitoring.getStatus().platform, "web");
  assert.equal(monitoring.getStatus().release, "HerdHarbor@1.6.1");
  assert.equal(monitoring.getStatus().build, "behavior-test");

  monitoring.addBreadcrumb({
    module: "shows",
    action: "add_result",
    result: "failure",
    metadata: { record_count: 1, notes: "private notes", customer_email: "private@example.com" }
  });
  assert.equal(calls.breadcrumbs.length, 1);
  assert.equal(calls.breadcrumbs[0].message, "add_result");
  assert.equal(calls.breadcrumbs[0].data.record_count, 1);
  assert.equal(calls.breadcrumbs[0].data.notes, undefined);

  const first = monitoring.captureError(new Error("private Judy notes should never transmit"), {
    module: "shows",
    errorCategory: "storage_failure",
    metadata: { module: "shows", operation: "save_result", result: "failure", record_count: 1, notes: "private" }
  });
  assert.equal(first.captured, true);
  assert.match(first.referenceId, /^HH-[A-F0-9]{8}$/);
  assert.equal(calls.exceptionEvents.length, 1);
  assert.equal(calls.exceptionEvents[0].event.tags.hh_module, "shows");
  assert.equal(calls.exceptionEvents[0].event.tags.hh_error_category, "storage_failure");
  assert.equal(calls.exceptionEvents[0].event.tags.hh_build, "behavior-test");
  assert.equal(calls.exceptionEvents[0].event.tags.hh_platform, "web");
  assert.ok(!JSON.stringify(calls.exceptionEvents[0].event).includes("Judy"));
  assert.equal(calls.exceptionEvents[0].event.exception.values[0].value, "Local persistence operation failed");
  assert.ok(!calls.exceptionEvents[0].event.exception.values[0].stacktrace.frames[0].filename.includes("?"));

  const duplicate = monitoring.captureError(new Error("private Judy notes should never transmit"), {
    module: "shows",
    errorCategory: "storage_failure"
  });
  assert.equal(duplicate.captured, false);
  assert.equal(duplicate.suppressed, true);
  assert.equal(calls.exceptionEvents.length, 1, "duplicate error is not sent again inside the dedupe window");

  const anonId = await monitoring.setUser("internal-account-uuid-123");
  assert.match(anonId, /^anon-/);
  assert.ok(!anonId.includes("internal-account-uuid-123"));
  assert.equal(calls.users.at(-1).id, anonId);
  assert.equal(calls.users.at(-1).email, undefined);

  assert.equal(typeof monitoring.testCrash, "function", "controlled test is available in test environment only");
  const controlled = monitoring.testCrash();
  assert.match(controlled.referenceId, /^HH-[A-F0-9]{8}$/);
  assert.equal(calls.exceptionEvents.at(-1).event.tags.hh_error_category, "controlled_test");
  assert.equal(calls.exceptionEvents.at(-1).event.exception.values[0].value, "HerdHarbor controlled monitoring test");

  const prodFake = makeFakeSentry();
  const prodMonitoring = core.createHerdHarborMonitoring(
    privacy.createPrivacySentryAdapter(prodFake.sdk),
    makeRuntime({ location: { hostname: "app.herdharbor.com", hash: "#dashboard" } })
  );
  prodMonitoring.init({ dsn: "https://public@example.invalid/1", environment: "production", enableTestCrash: true });
  assert.equal(prodMonitoring.testCrash, undefined, "controlled crash cannot be invoked in production");

  // Global exception/rejection handlers are installed by the browser adapter.
  assert.equal(monitoring.installBrowserInstrumentation(), true);
  assert.ok(runtime.__listeners.has("error"));
  assert.ok(runtime.__listeners.has("unhandledrejection"));

  // Platform tags are only asserted when a reliable signal exists.
  assert.equal(core.detectPlatform(makeRuntime({
    document: { referrer: "android-app://com.ebrllc.herdharbor", addEventListener() {}, documentElement: {} }
  })), "android-twa");
  assert.equal(core.detectPlatform(makeRuntime({
    Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" }
  })), "ios-capacitor");
  assert.equal(core.detectPlatform(makeRuntime({ matchMedia: () => ({ matches: true }) })), "pwa");
  assert.equal(core.detectEnvironment({}, makeRuntime({ location: { hostname: "app.herdharbor.com", hash: "" } })), "production");
  assert.equal(core.detectEnvironment({ environment: "test" }, makeRuntime()), "test");

  // Cloud Sync is monitored by operation/result only, not payload contents.
  const cloudFake = makeFakeSentry();
  const cloudRuntime = makeRuntime();
  cloudRuntime.HerdHarborCloud = {
    async syncNow() { return false; },
    getSyncDetails() { return { signedIn: true, conflict: false }; },
    getSession() { return { user: { id: "internal-cloud-user", email: "private@example.com" } }; },
    async downloadSafetyBackup() { return true; }
  };
  const cloudMonitoring = core.createHerdHarborMonitoring(privacy.createPrivacySentryAdapter(cloudFake.sdk), cloudRuntime);
  cloudMonitoring.init({ dsn: "https://public@example.invalid/1", environment: "test" });
  assert.equal(cloudMonitoring.instrumentCloud(), true);
  await cloudRuntime.HerdHarborCloud.syncNow();
  assert.equal(cloudFake.calls.messageEvents.length, 1);
  const cloudSerialized = JSON.stringify(cloudFake.calls.messageEvents[0].event);
  assert.ok(!cloudSerialized.includes("private@example.com"));
  assert.ok(!cloudSerialized.includes("internal-cloud-user"));
  assert.equal(cloudFake.calls.messageEvents[0].event.tags.hh_error_category, "upload_failure");

  console.log("Alpha v1.6.1 monitoring behavior, tagging, dedupe, and platform tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
