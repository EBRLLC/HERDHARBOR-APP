"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const pwaSource = fs.readFileSync(path.join(root, "pwa.js"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

function createHarness() {
  const nodes = new Map();
  const documentListeners = new Map();
  const windowListeners = new Map();

  class FakeNode {
    constructor(tagName = "div") {
      this.tagName = String(tagName).toUpperCase();
      this.id = "";
      this.src = "";
      this.href = "";
      this.rel = "";
      this.async = true;
      this.hidden = false;
      this.disabled = false;
      this.textContent = "";
      this.listeners = new Map();
      this.dataset = {};
      this.className = "";
    }
    addEventListener(type, listener) {
      const list = this.listeners.get(type) || [];
      list.push(listener);
      this.listeners.set(type, list);
    }
    dispatch(type, event = {}) {
      for (const listener of this.listeners.get(type) || []) listener({ currentTarget: this, target: this, ...event });
    }
    appendChild(node) {
      if (node?.id) nodes.set(node.id, node);
      return node;
    }
    remove() {
      if (this.id) nodes.delete(this.id);
    }
    setAttribute() {}
    querySelector() { return null; }
    querySelectorAll() { return []; }
  }

  const head = new FakeNode("head");
  const body = new FakeNode("body");
  const documentElement = new FakeNode("html");
  documentElement.classList = { contains() { return false; } };

  const document = {
    readyState: "loading",
    visibilityState: "visible",
    head,
    body,
    documentElement,
    createElement(tag) { return new FakeNode(tag); },
    getElementById(id) { return nodes.get(id) || null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener(type, listener) {
      const list = documentListeners.get(type) || [];
      list.push(listener);
      documentListeners.set(type, list);
    }
  };

  const location = {
    href: "https://app.herdharbor.com/",
    reload() {},
    replace() {}
  };
  const navigator = { onLine: true, userAgent: "test", platform: "test" };
  const window = {
    document,
    navigator,
    location,
    matchMedia() { return { matches: false }; },
    alert() {},
    setTimeout,
    clearTimeout,
    addEventListener(type, listener) {
      const list = windowListeners.get(type) || [];
      list.push(listener);
      windowListeners.set(type, list);
    },
    removeEventListener(type, listener) {
      const list = windowListeners.get(type) || [];
      windowListeners.set(type, list.filter((entry) => entry !== listener));
    }
  };
  window.window = window;

  const context = {
    window,
    document,
    navigator,
    URL,
    console,
    setTimeout,
    clearTimeout,
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
    }
  };
  const sandbox = vm.createContext(context);
  vm.runInContext(pwaSource, sandbox, { filename: "pwa.js" });

  return {
    window,
    document,
    nodes,
    makeError(message) {
      sandbox.__hhTestErrorMessage = String(message);
      const error = vm.runInContext("new Error(__hhTestErrorMessage)", sandbox);
      delete sandbox.__hhTestErrorMessage;
      return error;
    },
    fireDocument(type, event = {}) {
      for (const listener of documentListeners.get(type) || []) listener(event);
    },
    fireWindow(type, event = {}) {
      for (const listener of [...(windowListeners.get(type) || [])]) listener(event);
    },
    fireNode(id, type, event = {}) {
      const node = nodes.get(id);
      assert.ok(node, `expected node ${id}`);
      node.dispatch(type, event);
    }
  };
}

test("application boot is structurally independent from monitoring completion", () => {
  assert.match(pwaSource, /function startMonitoringLoad\(\)/);
  assert.match(pwaSource, /if \(monitoringLoadStarted\) return/);
  assert.match(pwaSource, /function bootApplication\(\)/);
  assert.match(pwaSource, /if \(applicationBooted\) return/);
  assert.match(pwaSource, /function boot\(\) \{[\s\S]*bootApplication\(\);[\s\S]*\}/);
  assert.doesNotMatch(pwaSource, /loadMonitoring\(bootApplication\)/);
  assert.ok(
    pwaSource.indexOf("startMonitoringLoad();") < pwaSource.indexOf('document.readyState === "loading"'),
    "monitoring should start as early as the PWA bootstrap can attach without becoming the app boot gate"
  );
});

test("slow monitoring does not delay normal application module loading", () => {
  const harness = createHarness();
  assert.ok(harness.nodes.has("hh-monitoring-config"), "monitoring config begins loading immediately");
  assert.equal(harness.nodes.has("hh-monitoring-v151"), false, "SDK waits for its config");
  harness.fireDocument("DOMContentLoaded");
  assert.ok(harness.nodes.has("hh-pedigree-visual-script"));
  assert.ok(harness.nodes.has("hh-rabbit-records-v151"));
  assert.ok(harness.nodes.has("hh-shows-v151-script"));
});

test("unavailable monitoring configuration is fail-open", () => {
  const harness = createHarness();
  harness.fireNode("hh-monitoring-config", "error");
  assert.doesNotThrow(() => harness.fireDocument("DOMContentLoaded"));
  assert.ok(harness.nodes.has("hh-pedigree-visual-script"));
  assert.ok(harness.nodes.has("hh-shows-v151-script"));
});

test("monitoring bundle load failure cannot block or restart application boot", () => {
  const harness = createHarness();
  harness.fireNode("hh-monitoring-config", "load");
  assert.ok(harness.nodes.has("hh-monitoring-v151"));
  harness.fireDocument("DOMContentLoaded");
  const firstPedigreeNode = harness.nodes.get("hh-pedigree-visual-script");
  assert.doesNotThrow(() => harness.fireNode("hh-monitoring-v151", "error"));
  assert.equal(harness.nodes.get("hh-pedigree-visual-script"), firstPedigreeNode);
});

test("bounded early bootstrap failures flush after monitoring attaches", () => {
  const harness = createHarness();
  const captured = [];
  const breadcrumbs = [];
  harness.fireWindow("error", { error: harness.makeError("early bootstrap failure") });

  harness.window.HerdHarborMonitoring = {
    captureError(error, options) { captured.push({ error, options }); },
    setModule() {},
    addBreadcrumb(entry) { breadcrumbs.push(entry); }
  };

  harness.fireNode("hh-monitoring-config", "load");
  harness.fireNode("hh-monitoring-v151", "load");

  assert.equal(captured.length, 1);
  assert.equal(captured[0].error.message, "early bootstrap failure");
  assert.equal(captured[0].options.errorCategory, "startup_failure");
  assert.equal(captured[0].options.metadata.operation, "early_window_error");
  assert.equal(breadcrumbs[0].action, "monitoring_attached_before_application_boot");
  assert.match(pwaSource, /EARLY_MONITORING_QUEUE_LIMIT = 8/);
  assert.match(pwaSource, /earlyMonitoringFailures\.length >= EARLY_MONITORING_QUEUE_LIMIT/);
});

test("early listeners are removed once monitoring settles to avoid duplicate global capture", () => {
  assert.match(pwaSource, /removeEventListener\?\.\("error", earlyWindowErrorHandler\)/);
  assert.match(pwaSource, /removeEventListener\?\.\("unhandledrejection", earlyUnhandledRejectionHandler\)/);
  assert.match(pwaSource, /if \(monitoringLoadSettled\) return/);
});

test("monitoring release/build metadata and cloud telemetry assets remain unchanged", () => {
  const config = fs.readFileSync(path.join(root, "herdharbor-monitoring-config.js"), "utf8");
  const instrumentation = fs.readFileSync(path.join(root, "monitoring/herdharbor-monitoring-instrumentation.mjs"), "utf8");
  assert.match(config, /release: "HerdHarbor@1\.8\.2"/);
  assert.match(config, /build: "cloud-sync-v2-state-integrity-1"/);
  assert.match(instrumentation, /herdharbor:cloud-sync-failure/);
  assert.match(instrumentation, /source_error instanceof Error/);
  assert.match(instrumentation, /retry_attempts/);
  assert.match(instrumentation, /session_refresh_result/);
});

test("PWA asset revision advances without a whole-app release bump", () => {
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
  assert.equal(packageJson.version, "1.8.2");
  assert.match(index, /pwa\.js\?v=31/);
  assert.match(worker, /\.\/pwa\.js\?v=31/);
  assert.match(worker, /herdharbor-shell-v1\.8\.2/);
  assert.match(packageJson.scripts["test:v1.8.3"], /monitoring-startup-nonblocking-v1\.8\.3\.test\.cjs/);
});
