"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const rolloutApi = require(path.join(root, "cloud-sync-rollout-runtime-v1.8.4.js"));

function createRuntimeHarness({ outbox = [] } = {}) {
  const calls = [];
  const manifest = {
    cutover_stage: "dual_write",
    sync_generation: 55,
    metadata: {
      normalized_writer_ready: true
    }
  };

  const recordStore = {
    async getManifest() {
      calls.push(["getManifest"]);
      return structuredClone(manifest);
    },
    async list() {
      return [];
    }
  };

  const worker = {
    async primeBaseline(options) {
      calls.push(["primeBaseline", options]);
      return {
        ok: true,
        skipped: false,
        rows: 239,
        manifest: structuredClone(manifest)
      };
    }
  };

  const metrics = {
    record() {},
    recordEvent() {},
    snapshot() { return {}; }
  };

  const modules = {
    recordStoreApi: {},
    normalizer: {
      namespace: "legacy-state",
      formatVersion: 2,
      mapLegacySnapshot() { return { records: [], checksum: "hh64:test" }; },
      reassembleAuthoritativeSnapshotWithMetadata() {
        return { snapshot: {}, checkpointStale: false };
      }
    },
    baselineApi: {
      createIndexedDbStore() { return {}; }
    },
    workerApi: {
      create() { return worker; }
    },
    cohortApi: {
      createCohortGate() {
        return {
          evaluate() { return { eligible: true }; }
        };
      }
    },
    shadowApi: {
      createShadowSyncController() { return {}; }
    },
    bootstrapApi: {
      createShadowBootstrap() {
        return { async run() { return { verified: true }; } };
      }
    },
    reconciliationApi: {
      reconcileSnapshot() {
        return {
          recordsDiffering: 0,
          missingNormalizedRecords: 0,
          unexpectedNormalizedRecords: 0,
          unresolvedConflicts: 0,
          reconciliationErrorRate: 0
        };
      },
      createRolloutMetrics() { return metrics; }
    },
    stagePolicy: {},
    rolloutApi: {
      requiredSchemaChecks: [],
      createRolloutControl() { return {}; }
    },
    dualWriteApi: {
      createDualWriteCoordinator() { return {}; }
    },
    readApi: {
      createReadResolver() { return {}; }
    }
  };

  const cloud = {
    async getSession() {
      return { user: { id: "11111111-1111-1111-1111-111111111111" } };
    },
    async syncNow() { return true; },
    async getNormalizedSyncCohortStatus() {
      return {
        eligible: true,
        mode: "allowlist",
        percentageEnabled: false,
        schemaVerified: true,
        stage: "dual_write",
        authorityActive: false,
        recoveryPending: false
      };
    },
    createNormalizedRecordStore() { return recordStore; },
    async readLegacySnapshotForNormalizedSync() {
      return { snapshot: {}, updatedAt: "2026-09-28T03:00:00.000Z" };
    }
  };

  const stateStore = {
    getOutbox() { return outbox; },
    getState() { return {}; }
  };

  const runtime = rolloutApi.create({
    cloud,
    stateStore,
    loadDependencies: async () => true,
    modules,
    telemetryAvailable: () => true
  });

  return { runtime, calls };
}

test("dual-write remote-state baseline refresh force-primes current normalized record versions", async () => {
  const { runtime, calls } = createRuntimeHarness();
  const result = await runtime.refreshDualWriteBaseline();

  assert.equal(result.ok, true);
  assert.equal(result.stage, "dual_write");
  assert.equal(result.rows, 239);
  assert.equal(result.generation, 55);
  assert.deepEqual(
    calls.find((entry) => entry[0] === "primeBaseline"),
    ["primeBaseline", { force: true }]
  );
});

test("dual-write baseline refresh refuses to overwrite a baseline while local mutations are pending", async () => {
  const { runtime, calls } = createRuntimeHarness({
    outbox: [{ mutationId: "pending-1" }]
  });
  const result = await runtime.refreshDualWriteBaseline();

  assert.equal(result.ok, false);
  assert.equal(result.reason, "pending-normalized-mutations");
  assert.equal(result.pending, 1);
  assert.equal(calls.some((entry) => entry[0] === "primeBaseline"), false);
});

test("cloud save debounce has a hard deadline so repeated commits cannot postpone a save for minutes", () => {
  const source = read("herdharbor-cloud.js");
  const maxMatch = source.match(/const MAX_SYNC_DEBOUNCE_MS = (\d+);/);
  assert.ok(maxMatch, "MAX_SYNC_DEBOUNCE_MS must be defined");
  const maxWait = Number(maxMatch[1]);
  assert.ok(maxWait > 0 && maxWait <= 15000, "sync deadline must remain bounded at 15 seconds or less");

  const start = source.indexOf("  function boundedSyncDelay");
  const end = source.indexOf("  function scheduleCloudSync", start);
  assert.ok(start >= 0 && end > start, "boundedSyncDelay must remain available");

  const factory = new Function(
    "MAX_SYNC_DEBOUNCE_MS",
    `"use strict";\n${source.slice(start, end)}\nreturn boundedSyncDelay;`
  );
  const boundedSyncDelay = factory(maxWait);

  assert.equal(boundedSyncDelay(2500, 1000, 1000), 2500);
  assert.equal(boundedSyncDelay(5000, 1000, 12000), 4000);
  assert.equal(boundedSyncDelay(2500, 1000, 15500), 500);
  assert.equal(boundedSyncDelay(2500, 1000, 17000), 0);
});

test("legacy cross-device hydration refreshes the normalized baseline before replacing local state", () => {
  const source = read("herdharbor-cloud.js");
  assert.match(source, /async function refreshDualWriteBaselineForRemoteState\(\)/);
  assert.match(source, /normalizedRollout\.refreshDualWriteBaseline\(\)/);

  const liveRefresh = source.indexOf("const baselineRefresh = await refreshDualWriteBaselineForRemoteState();", source.indexOf("async function checkForCloudChanges"));
  const liveReplace = source.indexOf("setActiveUserData(userId, deviceCloudRaw);", liveRefresh);
  assert.ok(liveRefresh >= 0 && liveReplace > liveRefresh, "foreground remote state must refresh normalized baseline before local replacement");

  const hydrateStart = source.indexOf("async function hydrateUserData");
  const hydrateRefresh = source.indexOf("const baselineRefresh = await refreshDualWriteBaselineForRemoteState();", hydrateStart);
  const hydrateReplace = source.indexOf("setActiveUserData(userId, deviceCloudRaw);", hydrateRefresh);
  assert.ok(hydrateRefresh >= 0 && hydrateReplace > hydrateRefresh, "startup hydration must refresh normalized baseline before local replacement");
});
