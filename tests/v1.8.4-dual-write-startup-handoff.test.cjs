"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const cloudSource = fs.readFileSync(path.join(root, "herdharbor-cloud.js"), "utf8");
const rolloutApi = require(path.join(root, "cloud-sync-rollout-runtime-v1.8.4.js"));
// Startup handoff regressions mirror the owner-account production failure sequence.

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
    "session",
    "document",
    "recoveryMode",
    `
      "use strict";
      let hydrationInFlight = null;
      let hydrationUserId = "";
      let lastHydratedUserId = "";
      ${fnSource}
      return hydrateUserData;
    `
  );

  const sessionState = { user: { id: "owner-1" } };
  const documentState = {
    documentElement: {
      classList: {
        contains() { return false; }
      }
    }
  };

  const hydrate = factory(
    async () => {
      calls += 1;
      await gate;
      return "done";
    },
    sessionState,
    documentState,
    false
  );

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

test("legacy completion reports success without waiting on normalized handoff", async () => {
  const fnSource = extract(
    cloudSource,
    "  async function completeNormalizedAfterLegacyCommit",
    "  function safeParse"
  );

  const events = [];
  let releaseNormalized;
  let normalizedStarted = false;
  const normalizedGate = new Promise((resolve) => { releaseNormalized = resolve; });

  const factory = new Function(
    "normalizedRollout",
    "normalizedRolloutStage",
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
      async afterLegacyCommit(options) {
        assert.equal(options, undefined);
        normalizedStarted = true;
        await normalizedGate;
        return {
          ok: true,
          mode: "dual-write",
          normalizedPending: false
        };
      }
    },
    () => "dual_write",
    (sequence, updatedAt, options) => {
      events.push({ sequence, updatedAt, options });
    },
    { error() {}, warn() {} }
  );

  const result = await complete(7, "2026-09-28T07:00:00Z");
  assert.equal(result.ok, true);
  assert.equal(result.handled, true);
  assert.equal(result.deferred, true);
  assert.equal(normalizedStarted, true);
  assert.deepEqual(events, [], "normalized completion event waits for background handoff");

  releaseNormalized();
  await Promise.resolve();
  await Promise.resolve();

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
      syncNow: async () => true,
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

test("clean dual-write hydration does not wait on normalized maintenance before becoming usable", () => {
  const hydrateSource = extract(
    cloudSource,
    "  async function hydrateUserDataOnce(activeSession)",
    "  async function hydrateUserData(activeSession)"
  );

  const legacyCloudBranch = hydrateSource.indexOf("if (data?.app_state)");
  assert.ok(legacyCloudBranch >= 0, "legacy cloud hydration branch must exist");

  const cleanupIndex = hydrateSource.indexOf(
    "deferNormalizedDualWriteCleanup({",
    legacyCloudBranch
  );
  const unlockIndex = hydrateSource.indexOf("unlockApp();", cleanupIndex);
  const successIndex = hydrateSource.indexOf(
    'setSyncState("Cloud records loaded", "success")',
    cleanupIndex
  );

  assert.ok(cleanupIndex >= 0, "hydration schedules normalized maintenance");
  assert.ok(unlockIndex > cleanupIndex, "hydration continues without awaiting normalized maintenance");
  assert.ok(successIndex > unlockIndex, "authoritative legacy load ends in a success state");
  assert.doesNotMatch(
    hydrateSource.slice(legacyCloudBranch),
    /await normalizedRollout\.afterLegacyCommit\(\{ ensureCurrent: true \}\)/,
    "startup must not block on normalized dual-write cleanup"
  );
  assert.doesNotMatch(
    hydrateSource.slice(legacyCloudBranch),
    /setSyncState\("Finishing normalized cloud sync…", "working"\)/
  );
  assert.doesNotMatch(
    hydrateSource.slice(legacyCloudBranch),
    /setSyncState\("Repairing normalized cloud records…", "working"\)/
  );
});


test("shadow-stage legacy completion remains background/event-driven", async () => {
  const fnSource = extract(
    cloudSource,
    "  async function completeNormalizedAfterLegacyCommit",
    "  function safeParse"
  );

  let directCalls = 0;
  const events = [];
  const factory = new Function(
    "normalizedRollout",
    "normalizedRolloutStage",
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
        directCalls += 1;
        return { ok: true };
      }
    },
    () => "shadow",
    (sequence, updatedAt, options) => events.push({ sequence, updatedAt, options }),
    { error() {} }
  );

  const result = await complete(2, "2026-09-28T07:00:00Z");
  assert.equal(directCalls, 0, "shadow stage must keep the existing event-driven normalized handoff");
  assert.equal(result.handled, false);
  assert.equal(result.ok, true);
  assert.deepEqual(events, [{
    sequence: 2,
    updatedAt: "2026-09-28T07:00:00Z",
    options: { normalizedHandled: false, normalizedOk: true }
  }]);
});

test("startup leaves pending dual-write outbox maintenance in the background", () => {
  const hydrateSource = extract(
    cloudSource,
    "  async function hydrateUserDataOnce(activeSession)",
    "  async function hydrateUserData(activeSession)"
  );

  assert.match(
    hydrateSource,
    /const normalizedCleanupNeeded =[\s\S]*normalizedOutboxPending\(userId\)/
  );
  assert.match(
    hydrateSource,
    /if \(normalizedCleanupNeeded\) \{[\s\S]*deferNormalizedDualWriteCleanup\(\{[\s\S]*ensureCurrent: true,[\s\S]*reason: "startup-hydration"/
  );
  assert.doesNotMatch(
    hydrateSource,
    /await normalizedRollout\.afterLegacyCommit\(\{ ensureCurrent: true \}\)/
  );
});


test("redundant same-user SIGNED_IN does not rehydrate an already unlocked app", () => {
  const source = cloudSource;
  assert.match(
    source,
    /signedInUserId && signedInUserId === lastHydratedUserId && appUnlocked/
  );
  assert.match(
    source,
    /dispatchAuthSession\(\);[\s\S]*void loadAccessProfile\(\);[\s\S]*void window\.HerdHarborBilling\?\.refresh\?\.\(\);[\s\S]*return;/
  );
  assert.match(
    source,
    /lastHydratedUserId = "";/,
    "sign-out must clear the same-user hydration guard"
  );
});

test("completed unlocked hydration records the hydrated user only after the run settles", () => {
  const fnSource = extract(
    cloudSource,
    "  async function hydrateUserData(activeSession)",
    "  async function initialize()"
  );

  assert.match(fnSource, /const result = await run;/);
  assert.match(fnSource, /stillCurrentUser/);
  assert.match(fnSource, /appUnlocked/);
  assert.match(fnSource, /lastHydratedUserId = userId;/);
});


test("syncNow does not enqueue an identical raw state while that state is already in flight", () => {
  const source = cloudSource;
  const declarationIndex = source.indexOf("let syncInFlightRaw = null;");
  const syncNowIndex = source.indexOf("async function syncNow()");
  const duplicateGuardIndex = source.indexOf(
    "if (syncInFlight && syncInFlightRaw && sameState(syncInFlightRaw, raw))",
    syncNowIndex
  );
  const enqueueIndex = source.indexOf(
    "pendingSync = { rawValue: raw, sequence: writeSequence };",
    syncNowIndex
  );

  assert.ok(declarationIndex >= 0, "cloud queue must track the raw snapshot currently in flight");
  assert.ok(duplicateGuardIndex > syncNowIndex, "syncNow must guard against identical in-flight state");
  assert.ok(enqueueIndex > duplicateGuardIndex, "duplicate guard must execute before syncNow enqueues raw state");
  assert.match(
    source.slice(duplicateGuardIndex, enqueueIndex),
    /return syncInFlight;/,
    "identical lifecycle-triggered sync should join the current save instead of queueing a second PATCH"
  );
});

test("drainSyncQueue tracks and clears the exact raw snapshot around each cloud write", () => {
  const source = cloudSource;
  const drainIndex = source.indexOf("async function drainSyncQueue()");
  const syncValueIndex = source.indexOf("syncValueToCloud(next.rawValue, next.sequence)", drainIndex);
  const setRawIndex = source.lastIndexOf('syncInFlightRaw = String(next.rawValue || "");', syncValueIndex);
  const clearRawIndex = source.indexOf("syncInFlightRaw = null;", syncValueIndex);

  assert.ok(drainIndex >= 0 && syncValueIndex > drainIndex);
  assert.ok(setRawIndex > drainIndex && setRawIndex < syncValueIndex);
  assert.ok(clearRawIndex > syncValueIndex, "in-flight raw identity must be cleared after the write settles");
});


test("syncNow prioritizes a pending legacy save before normalized authority readiness refresh", () => {
  const source = cloudSource;
  const syncNowIndex = source.indexOf("async function syncNow()");
  const pendingCheckIndex = source.indexOf("const legacyWritePendingAtStart", syncNowIndex);
  const refreshIndex = source.indexOf("await refreshNormalizedAuthorityIfEligible();", syncNowIndex);
  const guardIndex = source.indexOf("!legacyWritePendingAtStart", syncNowIndex);

  assert.ok(syncNowIndex >= 0);
  assert.ok(pendingCheckIndex > syncNowIndex, "syncNow must determine whether legacy work is already pending");
  assert.ok(guardIndex > pendingCheckIndex && guardIndex < refreshIndex, "authority refresh must be gated by absence of pending legacy work");
  assert.match(
    source.slice(syncNowIndex, refreshIndex + 80),
    /Boolean\(pendingSync\)[\s\S]*dirtyKey\(syncUserIdAtStart\)[\s\S]*!legacyWritePendingAtStart[\s\S]*refreshNormalizedAuthorityIfEligible/,
    "pending legacy state must bypass readiness refresh and proceed to persistence first"
  );
});


test("syncNow keeps a clean dual-write account green while normalized outbox cleanup runs", () => {
  const syncSource = extract(
    cloudSource,
    "  async function syncNow()",
    "  async function invokeFunction"
  );

  const pendingBranch = syncSource.indexOf("normalizedOutboxPending(syncUserId)");
  assert.ok(pendingBranch >= 0, "syncNow must detect pending normalized dual-write work");

  const tail = syncSource.slice(pendingBranch);
  assert.match(
    tail,
    /deferNormalizedDualWriteCleanup\(\{[\s\S]*ensureCurrent: true,[\s\S]*reason: "sync-now-clean-legacy"/
  );
  assert.match(tail, /setSyncState\("Saved to cloud", "success"\);[\s\S]*return true;/);
  assert.doesNotMatch(
    tail,
    /setSyncState\("Finishing normalized cloud sync…", "working"\)/
  );
  assert.doesNotMatch(
    tail,
    /await normalizedRollout\.afterLegacyCommit\(\{ ensureCurrent: true \}\)/
  );
});


test("large-state autosave uses the same 2.5 second debounce as normal state", () => {
  assert.match(cloudSource, /const SYNC_DELAY_MS = 2500;/);
  assert.match(cloudSource, /const LARGE_STATE_SYNC_DELAY_MS = 2500;/);
  assert.match(cloudSource, /const LARGE_STATE_THRESHOLD_CHARS = 750000;/);
  assert.match(cloudSource, /const MAX_SYNC_DEBOUNCE_MS = 15000;/);
  assert.match(
    cloudSource,
    /String\(rawValue \|\| ""\)\.length >= LARGE_STATE_THRESHOLD_CHARS[\s\S]*\? LARGE_STATE_SYNC_DELAY_MS[\s\S]*: SYNC_DELAY_MS/
  );
});


test("older save does not surface a normalized error when a newer same-device save is already queued", () => {
  const source = cloudSource;
  const saveIndex = source.indexOf("const normalized = await completeNormalizedAfterLegacyCommit(", source.indexOf("async function syncValueToCloud"));
  const deferIndex = source.indexOf("const deferredForNewerLocalSave", saveIndex);
  const workingIndex = source.indexOf('setSyncState("Saving newer device changes…", "working")', deferIndex);
  const errorIndex = source.indexOf('"Legacy cloud is saved; normalized sync is still finishing and will retry."', deferIndex);

  assert.ok(saveIndex >= 0, "cloud save path must complete normalized handoff after legacy PATCH");
  assert.ok(deferIndex > saveIndex, "normalized failure handling must detect a newer queued local save");
  assert.match(
    source.slice(deferIndex, workingIndex + 100),
    /local-state-ahead-of-legacy[\s\S]*sequence !== writeSequence[\s\S]*Boolean\(pendingSync\)/
  );
  assert.ok(workingIndex > deferIndex, "deferred older save should remain in working state");
  assert.ok(errorIndex > workingIndex, "real normalized failures must still surface after the deferred-save guard");
});


// Guard the sign-in critical path against reintroducing a serial network waterfall.
test("sign-in runs access-profile refresh and rollout hydration concurrently", () => {
  const source = cloudSource;
  const hydrateIndex = source.indexOf("async function hydrateUserDataOnce");
  const accessStartIndex = source.indexOf("const accessProfilePromise", hydrateIndex);
  const rolloutStartIndex = source.indexOf("const rolloutHydrationPromise", hydrateIndex);
  const joinIndex = source.indexOf("await Promise.all([", rolloutStartIndex);

  assert.ok(hydrateIndex >= 0, "hydrateUserDataOnce must exist");
  assert.ok(accessStartIndex > hydrateIndex, "access profile refresh must start during hydration");
  assert.ok(rolloutStartIndex > accessStartIndex, "rollout hydration promise must be created after local state inspection");
  assert.ok(joinIndex > rolloutStartIndex, "independent sign-in network phases must be joined concurrently");
  assert.match(
    source.slice(joinIndex, joinIndex + 220),
    /accessProfilePromise[\s\S]*rolloutHydrationPromise/,
    "sign-in must wait on access and rollout hydration together rather than serially"
  );
  assert.doesNotMatch(
    source.slice(hydrateIndex, accessStartIndex),
    /await loadAccessProfile\(\)/,
    "sign-in must not block all hydration behind access-profile network calls"
  );
});


test("clean sign-in starts legacy cloud prefetch before rollout hydration finishes", () => {
  const hydrateSource = extract(
    cloudSource,
    "  async function hydrateUserDataOnce(activeSession)",
    "  async function hydrateUserData(activeSession)"
  );

  const prefetchIndex = hydrateSource.indexOf(
    "const legacyCloudPrefetchPromise = dirty"
  );
  const rolloutIndex = hydrateSource.indexOf(
    "const rolloutHydrationPromise = normalizedRollout?.prepareHydration"
  );
  const joinedFetchIndex = hydrateSource.indexOf(
    "legacyCloudPrefetchPromise || fetchCloudRecord(userId)"
  );

  assert.ok(prefetchIndex >= 0, "clean sign-in creates a legacy cloud prefetch promise");
  assert.ok(
    prefetchIndex < rolloutIndex,
    "legacy cloud read must start before waiting on rollout hydration"
  );
  assert.ok(
    joinedFetchIndex > rolloutIndex,
    "the prefetched cloud result is consumed only after authority routing is known"
  );
});

test("clean sign-in overlaps baseline restoration with the cloud read", () => {
  const hydrateSource = extract(
    cloudSource,
    "  async function hydrateUserDataOnce(activeSession)",
    "  async function hydrateUserData(activeSession)"
  );

  const baselineStart = hydrateSource.indexOf(
    'const baselineRestorePromise = restoreMissingCloudBaseline(userId, "hydrate")'
  );
  const cloudStart = hydrateSource.indexOf(
    "const legacyCloudPrefetchPromise = dirty"
  );
  const joinIndex = hydrateSource.indexOf(
    "const [{ data, error }] = await Promise.all(["
  );

  assert.ok(baselineStart >= 0 && cloudStart > baselineStart);
  assert.ok(joinIndex > cloudStart);
  assert.match(
    hydrateSource.slice(joinIndex, joinIndex + 240),
    /legacyCloudPrefetchPromise \|\| fetchCloudRecord\(userId\)[\s\S]*baselineRestorePromise/
  );
});

test("dirty startup still prioritizes the protected local snapshot instead of prefetching cloud", () => {
  const hydrateSource = extract(
    cloudSource,
    "  async function hydrateUserDataOnce(activeSession)",
    "  async function hydrateUserData(activeSession)"
  );

  assert.match(
    hydrateSource,
    /const legacyCloudPrefetchPromise = dirty[\s\S]*\? null[\s\S]*: fetchCloudRecord\(userId\)/
  );
  const dirtyIndex = hydrateSource.indexOf("if (dirty) {");
  const drainIndex = hydrateSource.indexOf("await drainSyncQueue();", dirtyIndex);
  const normalCloudJoin = hydrateSource.indexOf(
    "legacyCloudPrefetchPromise || fetchCloudRecord(userId)",
    dirtyIndex
  );
  assert.ok(dirtyIndex >= 0 && drainIndex > dirtyIndex);
  assert.ok(
    normalCloudJoin > drainIndex,
    "dirty startup saves its local copy before entering the normal cloud-load path"
  );
});
