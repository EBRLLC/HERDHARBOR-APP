"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Boundary = require("../account-boundary-core-v1.8.4.js");

test("clean first login adopts authenticated identity", () => {
  assert.deepEqual(
    Boundary.evaluate({ authenticatedUserId: "A", hasActiveState: false }),
    { ok: true, action: "clean-login", reason: "no-active-state", staleOwnerId: "" }
  );
});

test("same-user reload preserves the current account boundary", () => {
  assert.equal(Boundary.evaluate({
    authenticatedUserId: "A", activeOwnerId: "A", hasActiveState: true
  }).action, "same-user");
});

test("A to B and B to A identify the stale owner without adopting its state", () => {
  assert.equal(Boundary.evaluate({
    authenticatedUserId: "B", activeOwnerId: "A", hasActiveState: true
  }).staleOwnerId, "A");
  assert.equal(Boundary.evaluate({
    authenticatedUserId: "A", activeOwnerId: "B", hasActiveState: true
  }).staleOwnerId, "B");
});

test("legacy poisoned owner is recoverable when ownership is attributable", () => {
  const result = Boundary.evaluate({
    authenticatedUserId: "A", legacyOwnerId: "B", hasActiveState: true
  });
  assert.equal(result.action, "switch-owner");
  assert.equal(result.staleOwnerId, "B");
});

test("unowned active state fails closed unless it matches the authenticated user's cache", () => {
  assert.equal(Boundary.evaluate({
    authenticatedUserId: "A", hasActiveState: true
  }).ok, false);
  assert.equal(Boundary.evaluate({
    authenticatedUserId: "A", hasActiveState: true, authenticatedCacheMatchesActive: true
  }).action, "adopt-owner");
});


test("hydration generation fence rejects stale Account A work after switch to Account B", () => {
  const fence = Boundary.createGenerationFence();
  fence.advance("A");
  const aToken = fence.capture("A");
  assert.equal(fence.isCurrent(aToken, "A"), true);

  fence.advance("B");
  assert.equal(fence.isCurrent(aToken, "B"), false);
  const bToken = fence.capture("B");
  assert.equal(fence.isCurrent(bToken, "B"), true);
});

test("sign-out invalidates every previously captured hydration token", () => {
  const fence = Boundary.createGenerationFence();
  fence.advance("A");
  const token = fence.capture("A");
  fence.invalidate();
  assert.equal(fence.isCurrent(token, "A"), false);
});


function storageHarness({ owner = "", active = "", caches = {}, legacyOwner = "" } = {}) {
  const state = {
    owner,
    active,
    legacyOwner,
    caches: { ...caches },
    events: []
  };
  return {
    state,
    adapters: {
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
      setOwner(userId) {
        state.events.push(`set-owner:${userId}`);
        state.owner = userId;
      },
      removeLegacy() {
        state.events.push("remove-legacy");
        state.legacyOwner = "";
      }
    }
  };
}

test("storage transition A -> B preserves A before clearing and never assigns A state to B", async () => {
  const harness = storageHarness({
    owner: "A",
    active: '{"animals":[{"id":"a"}]}',
    caches: { B: '{"animals":[{"id":"b"}]}' }
  });
  const result = await Boundary.applyPlan({
    authenticatedUserId: "B",
    activeOwnerId: "A",
    hasActiveState: true
  }, harness.adapters);

  assert.equal(result.ok, true);
  assert.equal(harness.state.owner, "B");
  assert.equal(harness.state.active, "");
  assert.equal(harness.state.caches.A, '{"animals":[{"id":"a"}]}');
  assert.equal(harness.state.caches.B, '{"animals":[{"id":"b"}]}');
  assert.deepEqual(harness.state.events, [
    "preserve:A",
    "clear-active",
    "reset-runtime",
    "set-owner:B",
    "remove-legacy"
  ]);
});

test("storage transition B -> A has the same preservation guarantees", async () => {
  const harness = storageHarness({
    owner: "B",
    active: '{"tasks":[{"id":"b-task"}]}',
    caches: { A: '{"tasks":[{"id":"a-task"}]}' }
  });
  await Boundary.applyPlan({
    authenticatedUserId: "A",
    activeOwnerId: "B",
    hasActiveState: true
  }, harness.adapters);

  assert.equal(harness.state.owner, "A");
  assert.equal(harness.state.active, "");
  assert.equal(harness.state.caches.B, '{"tasks":[{"id":"b-task"}]}');
  assert.equal(harness.state.caches.A, '{"tasks":[{"id":"a-task"}]}');
});

test("same-user reload keeps active working state intact", async () => {
  const harness = storageHarness({ owner: "A", active: '{"animals":[]}' });
  const result = await Boundary.applyPlan({
    authenticatedUserId: "A",
    activeOwnerId: "A",
    hasActiveState: true
  }, harness.adapters);

  assert.equal(result.action, "same-user");
  assert.equal(harness.state.owner, "A");
  assert.equal(harness.state.active, '{"animals":[]}');
  assert.deepEqual(harness.state.events, ["remove-legacy"]);
});

test("ambiguous unowned state fails closed without mutating storage", async () => {
  const harness = storageHarness({ active: '{"animals":[{"id":"unknown"}]}' });
  const result = await Boundary.applyPlan({
    authenticatedUserId: "A",
    hasActiveState: true,
    authenticatedCacheMatchesActive: false
  }, harness.adapters);

  assert.equal(result.ok, false);
  assert.equal(harness.state.active, '{"animals":[{"id":"unknown"}]}');
  assert.equal(harness.state.owner, "");
  assert.deepEqual(harness.state.events, []);
});

test("legacy owned state is preserved to its legacy owner before authenticated recovery", async () => {
  const harness = storageHarness({
    legacyOwner: "B",
    active: '{"litters":[{"id":"legacy-b"}]}'
  });
  await Boundary.applyPlan({
    authenticatedUserId: "A",
    legacyOwnerId: "B",
    hasActiveState: true
  }, harness.adapters);

  assert.equal(harness.state.caches.B, '{"litters":[{"id":"legacy-b"}]}');
  assert.equal(harness.state.owner, "A");
  assert.equal(harness.state.legacyOwner, "");
});
