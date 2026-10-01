"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Boundary = require("../account-boundary-core-v1.8.4.js");

function accountHarness({
  sessionUser = "",
  owner = "",
  legacyOwner = "",
  active = "",
  caches = {},
  cloud = {},
  online = true,
  recovered = {}
} = {}) {
  const fence = Boundary.createGenerationFence();
  const state = {
    sessionUser,
    owner,
    legacyOwner,
    active,
    caches: { ...caches },
    cloud: { ...cloud },
    online,
    recovered: { ...recovered },
    locked: true,
    renderedUser: "",
    events: [],
    unattributed: []
  };

  async function boundary(userId, { allowUnownedQuarantine = false } = {}) {
    fence.advance(userId);
    const cache = state.caches[userId] || "";
    const input = {
      authenticatedUserId: userId,
      activeOwnerId: state.owner,
      legacyOwnerId: state.legacyOwner,
      hasActiveState: Boolean(state.active),
      authenticatedCacheMatchesActive: Boolean(state.active && cache && state.active === cache)
    };
    let plan = Boundary.evaluate(input);

    if (!plan.ok && plan.reason === "unowned-active-state" && allowUnownedQuarantine && state.active) {
      state.unattributed.push(state.active);
      state.events.push("quarantine-unowned");
      state.active = "";
      state.owner = userId;
      state.legacyOwner = "";
      return { ok: true, action: "quarantine-and-recover", userId };
    }

    return Boundary.applyPlan(input, {
      async preserve(staleOwnerId) {
        state.events.push(`preserve:${staleOwnerId}`);
        state.caches[staleOwnerId] = state.active;
        return true;
      },
      clearActive() {
        state.events.push("clear-active");
        state.active = "";
        state.owner = "";
      },
      resetRuntime() {
        state.events.push("reset-runtime");
      },
      setOwner(nextUser) {
        state.events.push(`set-owner:${nextUser}`);
        state.owner = nextUser;
      },
      removeLegacy() {
        state.events.push("remove-legacy");
        state.legacyOwner = "";
      }
    });
  }

  async function hydrate(userId) {
    const token = fence.capture(userId);
    const stillCurrent = () => fence.isCurrent(token, state.sessionUser);
    if (!stillCurrent()) return false;

    let raw = "";
    if (state.online && state.cloud[userId]) raw = state.cloud[userId];
    else if (state.caches[userId]) raw = state.caches[userId];

    await Promise.resolve();
    if (!stillCurrent()) return false;
    if (!raw) {
      state.locked = true;
      state.renderedUser = "";
      return false;
    }
    state.active = raw;
    state.owner = userId;
    state.renderedUser = userId;
    state.locked = false;
    return true;
  }

  async function startup(userId) {
    state.sessionUser = userId;
    const firstRun = state.recovered[userId] !== true;
    const result = await boundary(userId, { allowUnownedQuarantine: firstRun });
    if (!result.ok) {
      state.locked = true;
      state.renderedUser = "";
      return false;
    }
    state.recovered[userId] = true;
    return hydrate(userId);
  }

  async function switchTo(userId) {
    state.sessionUser = userId;
    const result = await boundary(userId);
    if (!result.ok) {
      state.locked = true;
      state.renderedUser = "";
      return false;
    }
    return hydrate(userId);
  }

  function signOut() {
    const userId = state.sessionUser;
    if (userId && state.active) state.caches[userId] = state.active;
    state.active = "";
    state.owner = "";
    state.sessionUser = "";
    state.renderedUser = "";
    state.locked = true;
    fence.invalidate();
    state.events.push("sign-out");
  }

  return { state, fence, startup, switchTo, signOut, hydrate };
}

test("A clean first login loads only Account A", async () => {
  const h = accountHarness({ cloud: { A: "A-cloud" } });
  assert.equal(await h.startup("A"), true);
  assert.equal(h.state.owner, "A");
  assert.equal(h.state.active, "A-cloud");
  assert.equal(h.state.renderedUser, "A");
});

test("B same-user reload preserves Account A identity and records", async () => {
  const h = accountHarness({ owner: "A", active: "A-local", caches: { A: "A-local" }, cloud: { A: "A-cloud" } });
  assert.equal(await h.startup("A"), true);
  assert.equal(h.state.owner, "A");
  assert.equal(h.state.renderedUser, "A");
  assert.notEqual(h.state.active, "B-local");
});

test("C Account A to Account B preserves A and hydrates only B", async () => {
  const h = accountHarness({
    owner: "A",
    active: "A-local",
    caches: { B: "B-cache" },
    cloud: { B: "B-cloud" }
  });
  assert.equal(await h.switchTo("B"), true);
  assert.equal(h.state.caches.A, "A-local");
  assert.equal(h.state.owner, "B");
  assert.equal(h.state.active, "B-cloud");
  assert.equal(h.state.renderedUser, "B");
});

test("D Account B to Account A has identical isolation guarantees", async () => {
  const h = accountHarness({
    owner: "B",
    active: "B-local",
    caches: { A: "A-cache" },
    cloud: { A: "A-cloud" }
  });
  assert.equal(await h.switchTo("A"), true);
  assert.equal(h.state.caches.B, "B-local");
  assert.equal(h.state.owner, "A");
  assert.equal(h.state.active, "A-cloud");
});

test("E stale active owner automatically recovers to authenticated Account A", async () => {
  const h = accountHarness({
    owner: "B",
    active: "B-local",
    caches: { A: "A-cache" },
    cloud: { A: "A-cloud" }
  });
  assert.equal(await h.startup("A"), true);
  assert.equal(h.state.caches.B, "B-local");
  assert.equal(h.state.owner, "A");
  assert.equal(h.state.active, "A-cloud");
});

test("F stale Account A hydration cannot commit after Account B becomes authenticated", async () => {
  const h = accountHarness({ cloud: { A: "A-cloud", B: "B-cloud" } });
  h.state.sessionUser = "A";
  h.fence.advance("A");
  const staleHydration = h.hydrate("A");
  h.state.sessionUser = "B";
  h.fence.advance("B");
  assert.equal(await staleHydration, false);
  assert.notEqual(h.state.renderedUser, "A");
  assert.equal(await h.hydrate("B"), true);
  assert.equal(h.state.renderedUser, "B");
  assert.equal(h.state.active, "B-cloud");
});

test("G sign-out preserves Account A safety copy and leaves no active owner", async () => {
  const h = accountHarness({ cloud: { A: "A-cloud", B: "B-cloud" } });
  await h.startup("A");
  h.signOut();
  assert.equal(h.state.caches.A, "A-cloud");
  assert.equal(h.state.owner, "");
  assert.equal(h.state.active, "");
  assert.equal(h.state.locked, true);
  assert.equal(await h.startup("B"), true);
  assert.equal(h.state.renderedUser, "B");
});

test("H one-time poisoned-browser recovery quarantines unattributed data without deleting account caches", async () => {
  const h = accountHarness({
    active: "unknown-old-state",
    caches: { A: "A-safe", B: "B-safe" },
    cloud: { A: "A-cloud" }
  });
  assert.equal(await h.startup("A"), true);
  assert.deepEqual(h.state.unattributed, ["unknown-old-state"]);
  assert.equal(h.state.caches.A, "A-safe");
  assert.equal(h.state.caches.B, "B-safe");
  assert.equal(h.state.recovered.A, true);
  assert.equal(h.state.active, "A-cloud");
});

test("I offline mismatch recovers only authenticated Account A cache and never Account B state", async () => {
  const h = accountHarness({
    owner: "B",
    active: "B-local",
    caches: { A: "A-offline", B: "B-cache" },
    online: false
  });
  assert.equal(await h.startup("A"), true);
  assert.equal(h.state.caches.B, "B-local");
  assert.equal(h.state.owner, "A");
  assert.equal(h.state.active, "A-offline");
  assert.equal(h.state.renderedUser, "A");
});

test("J no-cloud/no-cache startup stays locked and never falls back to another account", async () => {
  const h = accountHarness({
    owner: "B",
    active: "B-local",
    caches: { B: "B-cache" },
    online: false
  });
  assert.equal(await h.startup("A"), false);
  assert.equal(h.state.locked, true);
  assert.equal(h.state.renderedUser, "");
  assert.notEqual(h.state.active, "B-local");
  assert.equal(h.state.caches.B, "B-local");
});

test("production runtime exposes member-safe recovery and targeted legacy cleanup contracts", () => {
  const cloud = fs.readFileSync(path.join(__dirname, "..", "herdharbor-cloud.js"), "utf8");
  assert.match(cloud, /Refresh account data/);
  assert.match(cloud, /HerdHarbor is refreshing your account data\. Your records are safe\./);
  assert.match(cloud, /ACCOUNT_BOUNDARY_RECOVERY_MARKER_PREFIX = "herdharbor_account_boundary_recovery_v1"/);
  assert.doesNotMatch(cloud, /CURRENT_SHELL_CACHE_NAME|caches\.keys\(\)|caches\.delete\(|registration\.update\(\)/);
  const pwa = fs.readFileSync(path.join(__dirname, "..", "pwa.js"), "utf8");
  const worker = fs.readFileSync(path.join(__dirname, "..", "service-worker.js"), "utf8");
  assert.match(pwa, /registration\.update\(\)/);
  assert.match(worker, /key\.startsWith\(CACHE_PREFIX\) && key !== CACHE_NAME/);
  assert.doesNotMatch(cloud, /localStorage\.clear\(\)|indexedDB\.deleteDatabase\(/);
});

test("production sign-out contract preserves per-user data before clearing active ownership", () => {
  const cloud = fs.readFileSync(path.join(__dirname, "..", "herdharbor-cloud.js"), "utf8");
  const start = cloud.indexOf('accountDialog.querySelector("#hh-sign-out")');
  const end = cloud.indexOf("const accountDialogTarget", start);
  assert.ok(start >= 0 && end > start);
  const block = cloud.slice(start, end);
  const preserveAt = block.indexOf("preserveActiveForUser");
  const clearAt = block.indexOf("clearActiveUserData");
  assert.ok(preserveAt >= 0 && clearAt > preserveAt);
  assert.match(block, /clearAccountSessionMarkers\(userId\)/);
  assert.match(block, /resetAccountBoundaryRuntime\(\)/);
});
