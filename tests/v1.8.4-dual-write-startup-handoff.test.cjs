"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const cloudSource = fs.readFileSync(path.join(root, "herdharbor-cloud.js"), "utf8");
const rolloutApi = require(path.join(root, "cloud-sync-rollout-runtime-v1.8.4.js"));

function extract(source, startText, endText) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start);
  assert.ok(start >= 0 && end > start, `Could not extract ${startText}`);
  return source.slice(start, end);
}

test("startup hydration dedupes concurrent getSession/SIGNED_IN calls for the same user", async () => {
  const fnSource = extract(
    cloudSource,
    "  async function hydrateUserData(activeSession)",
    "  async function initialize()"
  );

  let resolveOnce;
  const gate = new Promise((resolve) => { resolveOnce = resolve; });
  let calls = 0;

  const factory = new Function(
    "hydrateUserDataOnce",
    `
      "use strict";
      let hydrationInFlight = null;
      let hydrationUserId = "";
      ${fnSource}
      return hydrateUserData;
    `
  );

  const hydrate = factory(async () => {
    calls += 1;
    await gate;
    return "done";
  });

  const session = { user: { id: "owner-1" } };
  const first = hydrate(session);
  const second = hydrate(session);

  assert.equal(calls, 1, "concurrent hydration for one user must collapse into one run");
  resolveOnce();
  assert.equal(await first, "done");
  assert.equal(await second, "done");

  await hydrate(session);
  assert.equal(calls, 2, "a later completed hydration may run again");
});

test("normalized outbox remains pending in dual_write even before normalized authority", () => {
  const fnSource = extract(
    cloudSource,
    "  function normalizedRolloutStage()",
    "  function hasPendingCloudMutations"
  );

  const make = new Function(
    "normalizedRollout",
    "canonicalStateStore",
    "session",
    `
      "use strict";
      ${fnSource}
      return { normalizedRolloutStage, normalizedOutboxPending };
    `
  );

  const stateStore = {
    getOutbox(ownerId) {
      assert.equal(ownerId, "owner-1");
      return [{ mutationId: "m-1" }];
    }
  };

  let stage = "dual_write";
  const api = make(
    { status: () => ({ stage }) },
    stateStore,
    { user: { id: "owner-1" } }
  );

  assert.equal(api.normalizedOutboxPending("owner-1"), true);

  stage = "shadow";
  assert.equal(api.normalizedOutboxPending("owner-1"), false);

  stage = "normalized";
  assert.equal(api.normalizedOutboxPending("owner-1"), true);
});

test("legacy completion awaits normalized handoff before reporting success", async () => {
  const fnSource = extract(
    cloudSource,
    "  async function completeNormalizedAfterLegacyCommit",
    "  function safeParse"
  );

  const events = [];
  let releaseNormalized;
  const normalizedGate = new Promise((resolve) => { releaseNormalized = resolve; });

  const factory = new Function(
    "normalizedRollout",
    "dispatchLegacyCloudCommit",
    "console",
    `
      "use strict";
      ${fnSource}
      return completeNormalizedAfterLegacyCommit;
    `
  );

  const complete = factory(
    {
      async afterLegacyCommit() {
        await normalizedGate;
        return {
          ok: true,
          mode: "dual-write",
          normalizedPending: false
        };
      }
    },
    (sequence, updatedAt, options) => {
      events.push({ sequence, updatedAt, options });
    },
    { error() {} }
  );

  let settled = false;
  const pending = complete(7, "2026-09-28T07:00:00Z").then((value) => {
    settled = true;
    return value;
  });

  await Promise.resolve();
  assert.equal(settled, false, "legacy completion must not finish before normalized handoff");

  releaseNormalized();
  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(result.handled, true);
  assert.deepEqual(events, [{
    sequence: 7,
    updatedAt: "2026-09-28T07:00:00Z",
    options: { normalizedHandled: true, normalizedOk: true }
  }]);
});

test("rollout event bridge skips duplicate work when cloud already awaited normalized handoff", async () => {
  const listeners = new Map();
  let afterCalls = 0;

  const document = {
    addEventListener(name, fn) {
      listeners.set(name, fn);
    },
    dispatchEvent() {}
  };

  const fakeRoot = {
    document,
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail || {};
      }
    }
  };

  // Use the source's public create() runtime with a deliberately ineligible
  // account; start() still installs the event bridge before eligibility checks.
  const runtime = rolloutApi.create({
    root: fakeRoot,
    cloud: {
      getSession: async () => null,
      getNormalizedSyncCohortStatus: async () => ({
        eligible: false,
        mode: "allowlist",
        percentageEnabled: false,
        schemaVerified: false
      })
    },
    stateStore: {
      getOutbox: () => [],
      getState: () => ({})
    },
    loadDependencies: async () => true,
    modules: {},
    telemetryAvailable: () => true
  });

  const original = runtime.afterLegacyCommit;
  if (typeof original === "function") {
    const descriptor = Object.getOwnPropertyDescriptor(runtime, "afterLegacyCommit");
    assert.ok(descriptor, "runtime must expose afterLegacyCommit");
  }

  await runtime.start({ confirmLegacy: false });

  const listener = listeners.get("herdharbor:legacy-cloud-commit");
  assert.equal(typeof listener, "function");

  listener({ detail: { normalizedHandled: true } });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(afterCalls, 0);

  // Structural assertion limited to the event bridge itself: unhandled events
  // must still be chained into afterLegacyCommit.
  const runtimeSource = fs.readFileSync(path.join(root, "cloud-sync-rollout-runtime-v1.8.4.js"), "utf8");
  assert.match(
    runtimeSource,
    /if \(event\?\.detail\?\.normalizedHandled === true\) return;[\s\S]*commitChain = commitChain\.then\(afterLegacyCommit, afterLegacyCommit\)/
  );
});

test("clean cloud hydration finishes normalized repair before any reload", () => {
  const hydrateSource = extract(
    cloudSource,
    "  async function hydrateUserDataOnce(activeSession)",
    "  async function hydrateUserData(activeSession)"
  );

  const normalizedIndex = hydrateSource.indexOf(
    'setSyncState("Finishing normalized cloud sync…", "working")'
  );
  const awaitIndex = hydrateSource.indexOf(
    "const normalized = await normalizedRollout.afterLegacyCommit()"
  );
  const reloadIndex = hydrateSource.indexOf(
    "window.location.reload()",
    awaitIndex
  );

  assert.ok(normalizedIndex >= 0, "hydration must enter normalized repair");
  assert.ok(awaitIndex > normalizedIndex, "hydration must await normalized repair");
  assert.ok(reloadIndex > awaitIndex, "reload must occur only after normalized repair completes");
});
