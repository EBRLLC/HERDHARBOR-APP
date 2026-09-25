"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const Runtime = require("../cloud-sync-rollout-runtime-v1.8.4.js");
const Cohort = require("../cloud-sync-cohort-gate-v1.8.3.js");
const Dual = require("../cloud-dual-write-coordinator-v1.8.3.js");

function eventRoot() {
  const listeners = new Map();
  return {
    CustomEvent: class {
      constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
    },
    document: {
      addEventListener(type, handler) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(handler);
      },
      dispatchEvent(event) {
        for (const handler of listeners.get(event.type) || []) handler(event);
      }
    }
  };
}

test("non-eligible accounts never load normalized modules or force a cloud sync", async () => {
  const root = eventRoot();
  let loads = 0;
  let syncs = 0;
  const runtime = Runtime.create({
    root,
    stateStore: { getOutbox: () => [], getState: () => ({}) },
    cloud: {
      getSession: async () => ({ user: { id: "u1" } }),
      syncNow: async () => { syncs += 1; return true; },
      getNormalizedSyncCohortStatus: async () => ({
        eligible: false,
        mode: "allowlist",
        percentageEnabled: false,
        schemaVerified: true
      })
    },
    loadDependencies: async () => { loads += 1; }
  });

  const status = await runtime.start();
  assert.equal(status.eligible, false);
  assert.equal(loads, 0);
  assert.equal(syncs, 0);
});

test("percentage eligibility is rejected even when a caller claims eligible", async () => {
  const root = eventRoot();
  let loads = 0;
  const runtime = Runtime.create({
    root,
    stateStore: { getOutbox: () => [], getState: () => ({}) },
    cloud: {
      getSession: async () => ({ user: { id: "u1" } }),
      syncNow: async () => true,
      getNormalizedSyncCohortStatus: async () => ({
        eligible: true,
        mode: "allowlist",
        percentageEnabled: true,
        schemaVerified: true
      })
    },
    loadDependencies: async () => { loads += 1; }
  });
  const decision = await runtime.checkEligibility();
  assert.equal(decision.active, false);
  assert.equal(loads, 0);
});

test("cohort gate used by rollout is allowlist-only with zero percentage", () => {
  const gate = Cohort.createCohortGate({
    enabled: true,
    mode: "allowlist",
    allowlist: ["u-approved"],
    percentage: 0
  });
  assert.equal(gate.evaluate("u-approved").eligible, true);
  assert.equal(gate.evaluate("u-other").eligible, false);
  assert.equal(gate.percentage, 0);
});

test("post-legacy coordinator preserves legacy success when normalized drain degrades", async () => {
  const events = [];
  const coordinator = Dual.createPostLegacyCoordinator({
    enabled: true,
    normalizedWriter: {
      async drain() {
        return { ok: false, failed: 1, succeeded: 0, conflicts: 1 };
      }
    },
    onEvent: (event) => events.push(event)
  });

  const result = await coordinator.afterLegacyCommit();
  assert.equal(result.legacySaved, true);
  assert.equal(result.ok, false);
  assert.equal(result.mode, "dual-write-degraded");
  assert.equal(result.normalizedPending, true);
  assert.equal(result.normalizedConflicts, 1);
  assert.ok(events.some((event) => event.type === "dual-write-degraded"));
});

test("post-legacy coordinator never invokes normalized writer while disabled", async () => {
  let drains = 0;
  const coordinator = Dual.createPostLegacyCoordinator({
    enabled: false,
    normalizedWriter: { async drain() { drains += 1; return { failed: 0 }; } }
  });
  const result = await coordinator.afterLegacyCommit();
  assert.equal(result.mode, "legacy-only");
  assert.equal(result.legacySaved, true);
  assert.equal(drains, 0);
});
