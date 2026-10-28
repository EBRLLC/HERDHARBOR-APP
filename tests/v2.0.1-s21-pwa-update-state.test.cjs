"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "pwa.js"), "utf8");
const start = source.indexOf("  async function checkForAppUpdate(");
const end = source.indexOf("  async function registerServiceWorker()", start);
assert.ok(start >= 0 && end > start, "PWA update check must be extractable");
const implementation = source.slice(start, end);

function harness(options = {}) {
  let shown = 0, warnings = 0, updated = 0;
  const registration = options.noRegistration ? null : {
    waiting: options.waiting === true ? { state: "installed" } : null,
    update: async () => {
      updated += 1;
      if (options.failUpdate) throw new Error("update service unavailable");
    }
  };
  const run = new Function(
    "registration", "navigatorRef", "showUpdateReady", "monitorFailure", "console",
    "const UPDATE_CHECK_MIN_INTERVAL_MS = 60000; let lastUpdateCheckAt = 0, updateCheckInFlight = null;\n"
      + implementation + "\nreturn checkForAppUpdate;"
  )(
    registration,
    () => ({ onLine: options.offline !== true, serviceWorker: { controller: {} } }),
    () => { shown += 1; },
    () => { warnings += 1; },
    { warn: () => {} }
  );
  return { run, get stats() { return { shown, warnings, updated }; } };
}

test("S21 forced update probe reports unknown when offline or registration is absent", async () => {
  for (const options of [{ noRegistration: true }, { offline: true }]) {
    const h = harness(options);
    assert.equal(await h.run({ force: true }), null);
    assert.equal(h.stats.updated, 0);
  }
});

test("S21 update-check failure is unknown rather than a false no-update signal", async () => {
  const h = harness({ failUpdate: true });
  assert.equal(await h.run({ force: true }), null);
  assert.equal(h.stats.updated, 1);
  assert.equal(h.stats.warnings, 1);
});

test("S21 completed update check still reports false when no worker is waiting", async () => {
  const h = harness();
  assert.equal(await h.run({ force: true }), false);
  assert.equal(h.stats.updated, 1);
});

test("S21 existing waiting worker still yields explicit update required", async () => {
  const h = harness({ waiting: true });
  assert.equal(await h.run({ force: true }), true);
  assert.equal(h.stats.shown, 1);
  assert.equal(h.stats.updated, 0);
});

test("S21 consent handoff always requests a forced PWA recheck", () => {
  assert.match(source, /event\.detail\.promise = checkForAppUpdate\(\{ force: true \}\)/);
  const cloud = fs.readFileSync(path.join(__dirname, "..", "herdharbor-cloud.js"), "utf8");
  assert.match(cloud, /return detail\.promise \|\| Promise\.resolve\(null\)/);
});
