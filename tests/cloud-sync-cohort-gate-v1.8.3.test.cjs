"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const gateApi = require(path.resolve(__dirname, "..", "cloud-sync-cohort-gate-v1.8.3.js"));

test("cohort gate is default-off even with an allowlist", () => {
  const gate = gateApi.createCohortGate({ allowlistUserIds: ["internal-1"] });
  assert.equal(gate.enabled, false);
  assert.equal(gate.isEligibleUser("internal-1"), false);
  assert.equal(gate.evaluate("internal-1").reason, "gate-disabled");
});

test("allowlist mode requires explicit membership", () => {
  const gate = gateApi.createCohortGate({
    enabled: true,
    mode: "allowlist",
    allowlistUserIds: ["internal-1"]
  });
  assert.equal(gate.isEligibleUser("internal-1"), true);
  assert.equal(gate.isEligibleUser("other"), false);
  assert.equal(gate.allowlistSize, 1);
});

test("percentage cohorts are deterministic and bounded", () => {
  const a = gateApi.createCohortGate({
    enabled: true,
    mode: "percentage",
    percentage: 10,
    salt: "test-salt"
  });
  const b = gateApi.createCohortGate({
    enabled: true,
    mode: "percentage",
    percentage: 10,
    salt: "test-salt"
  });
  for (const id of ["u1", "u2", "u3", "u4", "u5"]) {
    assert.deepEqual(a.evaluate(id), b.evaluate(id));
  }

  const zero = gateApi.createCohortGate({ enabled: true, mode: "percentage", percentage: -10 });
  const all = gateApi.createCohortGate({ enabled: true, mode: "percentage", percentage: 500 });
  assert.equal(zero.isEligibleUser("any-user"), false);
  assert.equal(all.isEligibleUser("any-user"), true);
});

test("allowlist-or-percentage never removes explicitly selected internal users", () => {
  const gate = gateApi.createCohortGate({
    enabled: true,
    mode: "allowlist-or-percentage",
    percentage: 0,
    allowlistUserIds: ["owner-internal"]
  });
  assert.equal(gate.evaluate("owner-internal").eligible, true);
  assert.equal(gate.evaluate("ordinary-user").eligible, false);
});

test("evaluation output never returns the user identifier", () => {
  const gate = gateApi.createCohortGate({
    enabled: true,
    mode: "percentage",
    percentage: 50
  });
  assert.doesNotMatch(JSON.stringify(gate.evaluate("private-user-id")), /private-user-id/);
});
