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
