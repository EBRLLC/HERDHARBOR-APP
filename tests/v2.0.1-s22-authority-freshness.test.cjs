"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const cloud = fs.readFileSync(path.join(__dirname, "..", "herdharbor-cloud.js"), "utf8");
const start = cloud.indexOf("  async function getNormalizedSyncCohortStatus(options = {}) {");
const end = cloud.indexOf("  function createNormalizedRecordStore(", start);
assert.ok(start >= 0 && end > start, "authority status function must be extractable");
const source = cloud.slice(start, end);

function harness() {
  const session = { user: { id: "account-a" } };
  let firstFinish = null;
  let firstFail = null;
  let calls = 0;
  const client = {
    rpc: async name => {
      assert.equal(name, "herdharbor_sync_cohort_status");
      calls += 1;
      if (calls === 1) {
        return new Promise((resolve, reject) => {
          firstFinish = resolve;
          firstFail = reject;
        });
      }
      return {
        data: {
          eligible: true, mode: "allowlist", percentage_enabled: false,
          schema_verified: true, stage: "normalized",
          authority_active: true, recovery_pending: false
        },
        error: null
      };
    }
  };
  const factory = new Function("client", "session", "Date", "Object",
    "let normalizedCohortStatusCache=null,normalizedCohortStatusInFlight=null;\n" +
    "const NORMALIZED_COHORT_STATUS_TTL_MS=30000;\n" +
    source + "\nreturn {query:getNormalizedSyncCohortStatus};");
  const instance = factory(client, session, Date, Object);
  return {
    query: instance.query,
    session,
    resolveFirst: () => firstFinish({
      data: {
        eligible: true, mode: "allowlist", percentage_enabled: false,
        schema_verified: true, stage: "dual_write",
        authority_active: false, recovery_pending: false
      }, error: null
    }),
    rejectFirst: () => firstFail(new Error("old status request failed")),
    get calls() { return calls; }
  };
}

test("S22 forced authority checks must not reuse pre-cutover in-flight RPC answers", async () => {
  const h = harness();
  const oldRequest = h.query();
  const forcedRequest = h.query({ force: true });
  assert.equal(h.calls, 1, "fresh request should wait for older request to finish");
  h.resolveFirst();
  assert.equal((await oldRequest).stage, "dual_write");
  const fresh = await forcedRequest;
  assert.equal(h.calls, 2, "force must perform its own server RPC after old request");
  assert.equal(fresh.stage, "normalized");
  assert.equal(fresh.authorityActive, true);
});

test("S22 ordinary simultaneous status callers still share the first RPC", async () => {
  const h = harness();
  const first = h.query();
  const shared = h.query();
  assert.equal(h.calls, 1);
  h.resolveFirst();
  assert.equal((await first).stage, "dual_write");
  assert.equal((await shared).stage, "dual_write");
  assert.equal(h.calls, 1);
});

test("S22 forced authority lookup rejects account changes during older RPC", async () => {
  const h = harness();
  const initial = h.query();
  const forced = h.query({ force: true });
  h.session.user.id = "account-b";
  h.resolveFirst();
  await initial;
  await assert.rejects(forced, error => error?.code === "HH_SYNC_ACCOUNT_CHANGED");
  assert.equal(h.calls, 1, "do not issue an authority RPC for the wrong user");
});
