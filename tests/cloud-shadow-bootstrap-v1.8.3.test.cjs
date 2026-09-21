"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const bootstrapApi = require(path.join(root, "cloud-shadow-bootstrap-v1.8.3.js"));
const cohortGateApi = require(path.join(root, "cloud-sync-cohort-gate-v1.8.3.js"));
const fixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, "fixtures", "cloud-state-normalization-v1.8.3.json"),
  "utf8"
));
const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");

function dependencies(overrides = {}) {
  const calls = [];
  const events = [];
  const controller = {
    async sync(snapshot, options) {
      calls.push(["sync", snapshot, options]);
      return { skipped: false, stage: "shadow", checksum: "sync-checksum", recordCount: 12 };
    },
    async verifyAndRecord(snapshot) {
      calls.push(["verifyAndRecord", snapshot]);
      return {
        skipped: false,
        ok: true,
        stage: "shadow",
        actualChecksum: "verified-checksum",
        recordCount: 12,
        verifiedAt: "2026-09-16T04:00:00.000Z"
      };
    }
  };

  return {
    calls,
    events,
    options: {
      featureGate: true,
      cohortUserIds: ["internal-user-1"],
      client: { label: "fake-client" },
      async getSession() {
        calls.push(["getSession"]);
        return { user: { id: "internal-user-1" } };
      },
      async readLegacySnapshot(context) {
        calls.push(["readLegacySnapshot", context]);
        return {
          snapshot: JSON.parse(JSON.stringify(fixture)),
          updatedAt: "2026-09-16T03:59:00.000Z"
        };
      },
      createRecordStore(input) {
        calls.push(["createRecordStore", input]);
        return { label: "fake-store" };
      },
      createShadowSyncController(input) {
        calls.push(["createShadowSyncController", input]);
        return controller;
      },
      onEvent(event) {
        events.push(event);
      },
      ...overrides
    }
  };
}

test("feature gate disabled performs no session, legacy, or provider work", async () => {
  let sessionReads = 0;
  let legacyReads = 0;
  let storeCreates = 0;
  const events = [];
  const bootstrap = bootstrapApi.createShadowBootstrap({
    featureGate: false,
    cohortUserIds: ["internal-user-1"],
    async getSession() {
      sessionReads += 1;
      return { user: { id: "internal-user-1" } };
    },
    async readLegacySnapshot() {
      legacyReads += 1;
      return fixture;
    },
    createRecordStore() {
      storeCreates += 1;
      return {};
    },
    createShadowSyncController() {
      return {};
    },
    onEvent: (event) => events.push(event)
  });

  const result = await bootstrap.run();

  assert.equal(result.skipped, true);
  assert.equal(result.reason, "feature-gate-disabled");
  assert.equal(sessionReads, 0);
  assert.equal(legacyReads, 0);
  assert.equal(storeCreates, 0);
  assert.equal(events.length, 1);
});

test("feature gate alone is insufficient; user must be explicitly allowlisted", async () => {
  let legacyReads = 0;
  let storeCreates = 0;
  const bootstrap = bootstrapApi.createShadowBootstrap({
    featureGate: true,
    cohortUserIds: ["internal-user-1"],
    async getSession() {
      return { data: { session: { user: { id: "different-user" } } } };
    },
    async readLegacySnapshot() {
      legacyReads += 1;
      return fixture;
    },
    createRecordStore() {
      storeCreates += 1;
      return {};
    },
    createShadowSyncController() {
      return {};
    }
  });

  assert.equal(bootstrap.isEligibleUser("internal-user-1"), true);
  assert.equal(bootstrap.isEligibleUser("different-user"), false);
  const result = await bootstrap.run();
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "not-in-internal-cohort");
  assert.equal(legacyReads, 0);
  assert.equal(storeCreates, 0);
});

test("shadow bootstrap accepts the shared deterministic cohort gate without bypassing the feature gate", async () => {
  const setup = dependencies({
    cohortUserIds: [],
    cohortGate: cohortGateApi.createCohortGate({
      enabled: true,
      mode: "allowlist",
      allowlistUserIds: ["internal-user-1"]
    })
  });
  const bootstrap = bootstrapApi.createShadowBootstrap(setup.options);

  assert.equal(bootstrap.cohortMode, "allowlist");
  assert.equal(bootstrap.isEligibleUser("internal-user-1"), true);
  const result = await bootstrap.run();
  assert.equal(result.skipped, false);
  assert.equal(result.verified, true);
});

test("eligible internal user runs shadow write followed by recorded verification", async () => {
  const setup = dependencies();
  const bootstrap = bootstrapApi.createShadowBootstrap(setup.options);

  const result = await bootstrap.run();

  assert.equal(bootstrap.featureGate, true);
  assert.equal(bootstrap.cohortSize, 1);
  assert.equal(result.skipped, false);
  assert.equal(result.stage, "shadow");
  assert.equal(result.verified, true);
  assert.equal(result.checksum, "verified-checksum");
  assert.equal(result.verifiedAt, "2026-09-16T04:00:00.000Z");
  assert.equal(result.resumedVerification, false);

  const names = setup.calls.map((call) => call[0]);
  assert.deepEqual(names, [
    "getSession",
    "readLegacySnapshot",
    "createRecordStore",
    "createShadowSyncController",
    "sync",
    "verifyAndRecord"
  ]);
  const syncCall = setup.calls.find((call) => call[0] === "sync");
  assert.equal(syncCall[2].legacySnapshotUpdatedAt, "2026-09-16T03:59:00.000Z");

  const eventJson = JSON.stringify(setup.events);
  assert.doesNotMatch(eventJson, /Annie|Patches|Waggin Tails Homestead/);
  assert.match(eventJson, /shadow-bootstrap-complete/);
});

test("dry run never proceeds to verification recording", async () => {
  const setup = dependencies({
    createShadowSyncController(input) {
      setup.calls.push(["createShadowSyncController", input]);
      return {
        async sync(snapshot, options) {
          setup.calls.push(["sync", snapshot, options]);
          return { skipped: true, reason: "dry-run" };
        },
        async verifyAndRecord() {
          setup.calls.push(["verifyAndRecord"]);
          throw new Error("must not be called");
        }
      };
    }
  });
  const bootstrap = bootstrapApi.createShadowBootstrap(setup.options);

  const result = await bootstrap.run({ dryRun: true });

  assert.equal(result.skipped, true);
  assert.equal(result.reason, "dry-run");
  assert.equal(setup.calls.some((call) => call[0] === "verifyAndRecord"), false);
});

test("already-current but unverified shadow data resumes verification instead of getting stuck", async () => {
  const setup = dependencies({
    createShadowSyncController(input) {
      setup.calls.push(["createShadowSyncController", input]);
      return {
        async sync(snapshot, options) {
          setup.calls.push(["sync", snapshot, options]);
          return { skipped: true, reason: "already-current", verified: false, generation: 8 };
        },
        async verifyAndRecord(snapshot) {
          setup.calls.push(["verifyAndRecord", snapshot]);
          return {
            skipped: false,
            ok: true,
            stage: "shadow",
            actualChecksum: "retried-checksum",
            recordCount: 12,
            verifiedAt: "2026-09-16T04:05:00.000Z"
          };
        }
      };
    }
  });
  const bootstrap = bootstrapApi.createShadowBootstrap(setup.options);

  const result = await bootstrap.run();

  assert.equal(result.skipped, false);
  assert.equal(result.verified, true);
  assert.equal(result.resumedVerification, true);
  assert.equal(result.checksum, "retried-checksum");
  assert.deepEqual(
    setup.calls.filter((call) => ["sync", "verifyAndRecord"].includes(call[0])).map((call) => call[0]),
    ["sync", "verifyAndRecord"]
  );
});

test("already-current and verified shadow data avoids redundant verification", async () => {
  const setup = dependencies({
    createShadowSyncController(input) {
      setup.calls.push(["createShadowSyncController", input]);
      return {
        async sync(snapshot, options) {
          setup.calls.push(["sync", snapshot, options]);
          return { skipped: true, reason: "already-current", verified: true, generation: 8 };
        },
        async verifyAndRecord() {
          setup.calls.push(["verifyAndRecord"]);
          throw new Error("must not be called");
        }
      };
    }
  });
  const bootstrap = bootstrapApi.createShadowBootstrap(setup.options);
  const result = await bootstrap.run();
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "already-current");
  assert.equal(result.verified, true);
  assert.equal(setup.calls.some((call) => call[0] === "verifyAndRecord"), false);
});

test("bootstrap failure telemetry excludes provider messages and legacy payload data", async () => {
  const setup = dependencies({
    createShadowSyncController(input) {
      setup.calls.push(["createShadowSyncController", input]);
      return {
        async sync() {
          const error = new Error("Annie secret record provider failure");
          error.name = "ProviderError";
          error.code = "PGRST500";
          error.operation = "shadow-write";
          throw error;
        },
        async verifyAndRecord() {
          throw new Error("not reached");
        }
      };
    }
  });
  const bootstrap = bootstrapApi.createShadowBootstrap(setup.options);

  await assert.rejects(() => bootstrap.run(), /Annie secret record provider failure/);

  const failure = setup.events.find((event) => event.type === "shadow-bootstrap-failure");
  assert.equal(failure.name, "ProviderError");
  assert.equal(failure.code, "PGRST500");
  assert.equal(failure.operation, "shadow-write");
  assert.doesNotMatch(JSON.stringify(failure), /Annie|secret|provider failure/);
});

test("v1.8.3 shadow modules remain disconnected from the production page", () => {
  assert.doesNotMatch(indexSource, /cloud-record-store-v1\.8\.3\.js/);
  assert.doesNotMatch(indexSource, /cloud-state-normalizer-v1\.8\.3\.js/);
  assert.doesNotMatch(indexSource, /cloud-shadow-sync-v1\.8\.3\.js/);
  assert.doesNotMatch(indexSource, /cloud-shadow-bootstrap-v1\.8\.3\.js/);
  assert.doesNotMatch(indexSource, /cloud-sync-cohort-gate-v1\.8\.3\.js/);
  assert.doesNotMatch(indexSource, /cloud-sync-reconciliation-v1\.8\.3\.js/);
  assert.doesNotMatch(indexSource, /cloud-sync-rollout-control-v1\.8\.3\.js/);
});
