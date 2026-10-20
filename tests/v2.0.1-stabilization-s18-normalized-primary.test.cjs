"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = name => fs.readFileSync(path.join(root, name), "utf8");
const rollout = read("cloud-sync-rollout-runtime-v1.8.4.js");
const cloudSource = read("herdharbor-cloud.js");

function extract(source, startText, endText) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start);
  assert.ok(start >= 0 && end > start, "Missing production segment: " + startText);
  return source.slice(start, end);
}

function cutoverHarness({ dirty = false, conflict = false, online = true, revisionChangeAt = 0, failAt = 0 } = {}) {
  const events = [], calls = [];
  let stage = "dual_write", revision = 42, passes = 0;
  const ctx = { userId: "account-a", stage: "dual_write" };
  let localDirty = dirty;
  const code = extract(rollout,
    "    async function cutoverToNormalizedPrimary(options = {}) {",
    "    async function rollbackToLegacy() {");
  const factory = new Function(
    "ensureContext", "assertContextCurrent", "refreshContextStage", "cloud",
    "stateStore", "validateNow", "promoteToNormalized", "isNormalizedAuthority",
    "emit", "requiredValidationPasses",
    "let validationPasses=0,lastValidation=null,cutoverInFlight=null;\n" + code +
    "\nreturn cutoverToNormalizedPrimary;"
  );
  const operation = factory(
    async () => ctx,
    given => { assert.equal(given, ctx); },
    async () => ({ stage }),
    {
      getSession: () => ({ user: { id: "account-a" } }),
      getSyncDetails: () => ({ online, syncing: false }),
      hasUnsyncedChanges: () => localDirty,
      hasConflict: () => conflict
    },
    { getOutbox: () => [], getRevision: () => revision },
    async () => {
      passes += 1;
      calls.push("validate");
      if (revisionChangeAt === passes) revision++;
      if (failAt === passes) return { ok: false, stage, reason: "verification-divergence" };
      return { ok: true, stage };
    },
    async () => { calls.push("promote"); stage = "normalized"; return { ok: true, stage }; },
    () => stage === "normalized",
    (type) => events.push(type),
    3
  );
  return { operation, calls, events, setDirty: v => { localDirty = v; } };
}

const approved = Object.freeze({
  ownerApproved: true, legacyClientsClosed: true, backupVerified: true
});

test("S18 explicit cutover does not promote without all three migration approvals", async () => {
  const h = cutoverHarness();
  for (const options of [{}, { ownerApproved: true }, { ownerApproved: true, legacyClientsClosed: true }]) {
    const result = await h.operation(options);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "normalized-cutover-owner-acceptance-required");
  }
  assert.deepEqual(h.calls, []);
});

test("S18 cutover blocks pending local work, conflicts, offline sessions", async () => {
  for (const options of [{ dirty: true }, { conflict: true }, { online: false }]) {
    const h = cutoverHarness(options);
    const result = await h.operation(approved);
    assert.equal(result.ok, false, JSON.stringify(options));
    assert.equal(result.reason, "normalized-cutover-local-work-pending");
    assert.deepEqual(h.calls, []);
  }
});

test("S18 cutover performs three verified checks before activating record authority", async () => {
  const h = cutoverHarness();
  const result = await h.operation(approved);
  assert.equal(result.ok, true);
  assert.equal(result.stage, "normalized");
  assert.equal(result.primaryWriter, "record-outbox");
  assert.equal(result.legacyWriteRequired, false);
  assert.deepEqual(h.calls, ["validate", "validate", "validate", "promote"]);
  assert.deepEqual(h.events, ["normalized-primary-active"]);
});

test("S18 concurrent requests share one verified cutover and cannot double-promote", async () => {
  const h = cutoverHarness();
  const [first, second] = await Promise.all([
    h.operation(approved),
    h.operation(approved)
  ]);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(h.calls, ["validate", "validate", "validate", "promote"]);
});

test("S18 cutover fails closed on a checkpoint divergence or concurrent local change", async () => {
  for (const options of [{ failAt: 2 }, { revisionChangeAt: 1 }, { revisionChangeAt: 3 }]) {
    const h = cutoverHarness(options);
    const result = await h.operation(approved);
    assert.equal(result.ok, false);
    assert.equal(h.calls.includes("promote"), false);
  }
});

function hydrationHarness({ archived = true, editDuringBaseline = false, editDuringPersist = false, remoteNote = "cloud" } = {}) {
  const oldRaw = JSON.stringify({ animals: [{ id: "rabbit-one", note: "device" }] });
  const editRaw = JSON.stringify({ animals: [{ id: "rabbit-one", note: "new draft" }] });
  let actualRaw = oldRaw, wrote = 0, backedUp = 0, unlocked = 0;
  const messages = [];
  const segment = extract(cloudSource,
    "    if (data?.app_state) {",
    "    const newUserRaw = cachedRaw || activeRaw;");
  const params = {
    data: { app_state: { animals: [{ id: "rabbit-one", note: remoteNote }], operation: { name: "Farm A" } }, updated_at: "server-v1" },
    activeRaw: oldRaw, cachedRaw: null, userId: "account-a",
    rolloutDecision: { stage: "dual_write" },
    JSON,
    sameState: (a,b) => JSON.stringify(JSON.parse(a)) === JSON.stringify(JSON.parse(b)),
    safeParse: JSON.parse,
    applyDevicePreferences: raw => raw,
    allowAnimalStateTransition: () => true,
    markConflict: () => { throw Error("unexpected conflict"); },
    recordRecoverySnapshot: async () => { backedUp++; return archived; },
    isCurrentHydration: () => true,
    hydrationInputCurrent: () => actualRaw === oldRaw,
    deferHydrationForNewEdit: () => ({ ok: false, reason: "hydration-local-state-changed" }),
    normalizedOutboxPending: () => false,
    hasConfiguredOperationProfile: () => true,
    hasUnsyncedDomainRecords: () => false,
    refreshDualWriteBaselineForRemoteState: async () => {
      if (editDuringBaseline) actualRaw = editRaw;
      return { ok: true };
    },
    setActiveUserData: (id,raw) => { wrote++; actualRaw = raw; return true; },
    writeCloudBaseline: async () => {
      if (editDuringPersist) actualRaw = editRaw;
      return true;
    },
    activeStateRaw: () => actualRaw,
    originalGetItem: { call: () => editDuringPersist ? "1" : null },
    localStorage: {},
    safeStorageSet: () => true,
    safeStorageRemove: () => {},
    versionKey: () => "version",
    dirtyKey: () => "dirty",
    syncConflict: null,
    normalizedRollout: null,
    setSyncState: (...args) => messages.push(args),
    showAccountBoundaryRecovery: (...args) => messages.push(args),
    unlockApp: () => { unlocked++; },
    window: { HerdHarborApp: { getState: () => ({ operation: { name: "Farm A" } }), applyVerifiedCloudState: () => true },
      location: { reload: () => {} }, setTimeout: () => {} },
    sessionStorage: { getItem: () => "1", setItem: () => {} },
    pendingSync: null
  };
  const fn = new Function(...Object.keys(params), "return (async function () {\n" + segment + "\nreturn { ok: true };\n})();");
  return { run: () => fn(...Object.values(params)), state: () => ({ actualRaw, wrote, backedUp, unlocked, messages, editRaw }) };
}

test("S18 hydration refuses cloud overwrite when an edit arrives during baseline refresh", async () => {
  const h = hydrationHarness({ editDuringBaseline: true, remoteNote: "device" });
  const result = await h.run();
  assert.equal(result.reason, "hydration-local-state-changed");
  const state = h.state();
  assert.equal(state.actualRaw, state.editRaw);
  assert.equal(state.wrote, 0);
});

test("S18 hydration refuses replacing a local herd when its safety backup failed", async () => {
  const h = hydrationHarness({ archived: false });
  const result = await h.run();
  assert.equal(result.reason, "legacy-hydration-backup-failed");
  const state = h.state();
  assert.equal(state.wrote, 0);
  assert.equal(state.backedUp, 1);
  assert.equal(state.unlocked, 0);
});

test("S18 hydrated data cannot silently clear a dirty edit committed during baseline storage", async () => {
  const h = hydrationHarness({ editDuringPersist: true });
  const result = await h.run();
  assert.equal(result.reason, "hydration-new-local-edit-after-install");
  assert.equal(h.state().actualRaw, h.state().editRaw);
});

function normalizedSaveHarness(drain, outbox=[]) {
  const start = rollout.indexOf("    async function syncNormalizedNow() {");
  const end = rollout.indexOf("    async function refreshAuthoritative() {", start);
  assert.ok(start >= 0 && end > start);
  const compiled = new Function(
    "ensureContext", "assertContextCurrent", "refreshContextStage",
    "stateStore", "emit",
    "let lastResult=null;const ctx={userId:'A',stage:'normalized',worker:{drain:async()=>drain},metrics:{record:()=>{}}};" +
    rollout.slice(start,end) + "return syncNormalizedNow;"
  );
  return compiled(async()=>({ userId:"A", stage:"normalized", worker:{drain:async()=>drain}, metrics:{record:()=>{}}}),
    ()=>{}, async()=>({stage:"normalized"}),{getOutbox:()=>outbox},()=>{});
}

test("S18 normalized-primary rejects offline/skipped/failed writes, including empty outboxes", async () => {
  for (const drain of [
    {ok:true,skipped:true,reason:"offline",processed:0,failed:0},
    {ok:false,skipped:true,reason:"pending-local-mutations",failed:0},
    {ok:true,skipped:false,stage:"normalized",failed:1}
  ]) {
    const save=normalizedSaveHarness(drain);
    const result=await save();
    assert.equal(result.ok,false,JSON.stringify(drain));
  }
});

test("S18 normalized-primary confirms successful non-skipped writes only with empty outbox", async () => {
  const good={ok:true,skipped:false,stage:"normalized",failed:0};
  assert.equal((await normalizedSaveHarness(good)()).ok,true);
  assert.equal((await normalizedSaveHarness(good,[{mutationId:"uncommitted"}])()).ok,false);
});

test("S18 cloud and service worker refer to the same new content revision", () => {
  const html = read("index.html");
  const worker = read("service-worker.js");
  assert.match(html, /cloud-sync-rollout-runtime-v1\.8\.4\.js\?v=6/);
  assert.match(worker, /cloud-sync-rollout-runtime-v1\.8\.4\.js\?v=6/);
  assert.match(html, /herdharbor-cloud\.js\?v=41/);
  assert.match(worker, /herdharbor-cloud\.js\?v=41/);
  assert.match(worker, /herdharbor-shell-v2\.0\.1-v2\.0\.1-release-1-s20-1/);
});

test("S18 leftover legacy dirty work remains visible to PWA after normalized promotion", () => {
  const source = extract(cloudSource,
    "  function hasPendingAuthoritativeCloudMutations(",
    "  function getSyncDetails()");
  const helper = new Function(
    "session", "originalGetItem", "localStorage", "dirtyKey", "pendingSync",
    "normalizedAuthorityActive", "normalizedOutboxPending",
    source + "\nreturn hasPendingAuthoritativeCloudMutations;"
  )(
    { user: { id: "account-a" } },
    { call: (storage, key) => key === "dirty-account-a" ? "1" : null },
    {},
    id => "dirty-" + id,
    null,
    () => true,
    () => false
  );
  assert.equal(helper("account-a"), true);
});

test("S18 stale normalized authority cannot silently route back to legacy save", async () => {
  const beginning = extract(cloudSource,
    "  async function syncNow() {",
    "    const raw = activeStateRaw();");
  const source = beginning + "\n    return 'legacy-write-fallthrough';\n  }";
  const statuses = [];
  let refreshCalls = 0;
  const start = new Function(
    "session", "captureAccountOperation", "isAccountOperationCurrent", "pendingSync",
    "originalGetItem", "localStorage", "dirtyKey", "normalizedRolloutStage",
    "normalizedAuthorityActive", "refreshNormalizedAuthorityIfEligible", "setSyncState",
    "normalizedOutboxPending", "deferNormalizedDualWriteCleanup",
    "clearTimeout", "syncTimer", "syncDebounceStartedAt", "normalizedRollout",
    source + "\nreturn syncNow;"
  )(
    { user: { id: "account-a" } },
    () => ({}),
    () => true,
    null,
    { call: () => "1" },
    {},
    () => "dirty",
    () => "normalized",
    () => false,
    async () => { refreshCalls += 1; return false; },
    (message, status) => statuses.push({ message, status }),
    () => false,
    () => {},
    () => {},
    null,
    0,
    {}
  );
  const result = await start();
  assert.equal(result, false);
  assert.equal(refreshCalls, 1);
  assert.match(statuses[0].message, /Normalized record authority could not be verified/);
  assert.equal(statuses[0].status, "error");
});
