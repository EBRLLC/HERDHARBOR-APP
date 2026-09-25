"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const controlApi = require(path.join(root, "cloud-sync-rollout-control-v1.8.3.js"));

function manifest(stage, { verified = false, writerReady = false, generation = 10 } = {}) {
  return {
    cutover_stage: stage,
    sync_generation: generation,
    normalized_verified_at: verified ? "2026-09-21T00:00:00.000Z" : null,
    metadata: {
      source_checksum: "hh64:1234567890abcdef",
      verified_checksum: verified ? "hh64:1234567890abcdef" : null,
      normalized_record_count: 10,
      verification_record_count: verified ? 10 : null,
      normalized_namespace: "legacy-state",
      normalized_format_version: 2,
      normalized_writer_ready: writerReady,
      normalized_writer_version: writerReady ? "writer-v1" : null
    }
  };
}

const goodSchema = Object.freeze({
  verified: true,
  recordsTable: true,
  manifestTable: true,
  ownerRls: true,
  batchRpc: true,
  recordRpc: true,
  cohortRpc: true,
  verifyRpc: true,
  stageRpc: true,
  guardedWriterRpc: true,
  legacyGuard: true
});

const goodMetrics = Object.freeze({
  recordsCompared: 10,
  recordsMatching: 10,
  recordsDiffering: 0,
  missingNormalizedRecords: 0,
  unexpectedNormalizedRecords: 0,
  unresolvedConflicts: 0,
  bootstrapFailures: 0,
  dualWriteFailures: 0,
  normalizedReadFallbackCount: 0,
  reconciliationErrorRate: 0
});

function setup(initialManifest, overrides = {}) {
  let current = structuredClone(initialManifest);
  const calls = [];
  const store = {
    async getManifest() {
      calls.push(["getManifest"]);
      return structuredClone(current);
    },
    async setStage(input) {
      calls.push(["setStage", input]);
      current.cutover_stage = input.targetStage;
      current.sync_generation += 1;
      if (input.targetStage !== "normalized") {
        current.normalized_verified_at = null;
        current.metadata.normalized_writer_ready = false;
        current.metadata.normalized_writer_version = null;
      }
      return { ok: true, stage: input.targetStage, generation: current.sync_generation };
    },
    async prepareNormalizedWriter(input) {
      calls.push(["prepareNormalizedWriter", input]);
      current.metadata.normalized_writer_ready = true;
      current.metadata.normalized_writer_version = input.writerVersion;
      current.sync_generation += 1;
      current.normalized_verified_at = "2026-09-21T00:05:00.000Z";
      current.metadata.verified_checksum = current.metadata.source_checksum;
      current.metadata.verification_record_count = current.metadata.normalized_record_count;
      return { ok: true, generation: current.sync_generation };
    }
  };
  const cohortGate = overrides.cohortGate || { evaluate: () => ({ eligible: true, reason: "allowlisted" }) };
  const control = controlApi.createRolloutControl({
    recordStore: store,
    cohortGate,
    getSchemaStatus: async () => overrides.schemaStatus || goodSchema,
    getMetrics: async () => overrides.metrics || goodMetrics,
    telemetryAvailable: async () => overrides.telemetryAvailable !== false,
    rollbackAvailable: async () => overrides.rollbackAvailable !== false,
    maxReconciliationErrorRate: overrides.maxReconciliationErrorRate ?? 0
  });
  return { control, calls, getManifest: () => structuredClone(current) };
}

test("schema verification requires every rollout prerequisite", () => {
  assert.equal(controlApi.schemaIsVerified(goodSchema), true);
  for (const key of controlApi.requiredSchemaChecks) {
    assert.equal(controlApi.schemaIsVerified({ ...goodSchema, [key]: false }), false, key);
  }
});

test("legacy to shadow promotion is blocked unless schema, telemetry, rollback, and cohort gates are ready", async () => {
  const bad = setup(manifest("legacy"), {
    schemaStatus: { ...goodSchema, legacyGuard: false },
    telemetryAvailable: false,
    rollbackAvailable: false,
    cohortGate: { evaluate: () => ({ eligible: false }) }
  });
  const decision = await bad.control.promotionDecision("shadow", "user-1");
  assert.equal(decision.allowed, false);
  assert.ok(decision.reasons.includes("schema-not-verified"));
  assert.ok(decision.reasons.includes("telemetry-unavailable"));
  assert.ok(decision.reasons.includes("rollback-unavailable"));
  assert.ok(decision.reasons.includes("cohort-not-eligible"));
  await assert.rejects(
    () => bad.control.promote("shadow", { userId: "user-1" }),
    (error) => error?.code === "HH_SYNC_PROMOTION_BLOCKED"
  );
  assert.equal(bad.calls.some((call) => call[0] === "setStage"), false);
});

test("shadow to dual-write requires current verification and healthy reconciliation", async () => {
  const unverified = setup(manifest("shadow", { verified: false }));
  const unverifiedDecision = await unverified.control.promotionDecision("dual_write", "user-1");
  assert.equal(unverifiedDecision.allowed, false);
  assert.ok(unverifiedDecision.reasons.includes("current-verification-required"));

  const divergent = setup(manifest("shadow", { verified: true }), {
    metrics: { ...goodMetrics, recordsDiffering: 1, reconciliationErrorRate: 0.1 }
  });
  const divergentDecision = await divergent.control.promotionDecision("dual_write", "user-1");
  assert.equal(divergentDecision.allowed, false);
  assert.ok(divergentDecision.reasons.includes("reconciliation-error-rate-too-high"));

  const healthy = setup(manifest("shadow", { verified: true }));
  const result = await healthy.control.promote("dual_write", { userId: "user-1" });
  assert.equal(result.stage, "dual_write");
});

test("normalized writer preparation is guarded and does not itself promote authority", async () => {
  const state = setup(manifest("dual_write", { verified: true, writerReady: false }));
  const result = await state.control.prepareWriter({
    userId: "user-1",
    writerVersion: "normalized-writer-v1",
    namespace: "legacy-state",
    formatVersion: 2
  });
  assert.equal(result.ok, true);
  assert.equal(state.getManifest().cutover_stage, "dual_write");
  assert.equal(state.calls.some((call) => call[0] === "setStage"), false);
});

test("normalized promotion blocks when fallback was observed and succeeds only after healthy validation", async () => {
  const blocked = setup(manifest("dual_write", { verified: true, writerReady: true }), {
    metrics: { ...goodMetrics, normalizedReadFallbackCount: 1 }
  });
  const decision = await blocked.control.promotionDecision("normalized", "user-1");
  assert.equal(decision.allowed, false);
  assert.ok(decision.reasons.includes("normalized-read-fallbacks-present"));

  const healthy = setup(manifest("dual_write", { verified: true, writerReady: true }));
  const result = await healthy.control.promote("normalized", { userId: "user-1" });
  assert.equal(result.stage, "normalized");
});

test("illegal stage transitions remain blocked by the existing stage policy", async () => {
  const state = setup(manifest("legacy", { verified: true, writerReady: true }));
  const decision = await state.control.promotionDecision("normalized", "user-1");
  assert.equal(decision.allowed, false);
  assert.ok(decision.reasons.includes("invalid-stage-transition"));
  await assert.rejects(() => state.control.promote("normalized", { userId: "user-1" }));
});

test("rollback remains available even when promotion telemetry and cohort gates are unavailable", async () => {
  const state = setup(manifest("normalized", { verified: true, writerReady: true }), {
    telemetryAvailable: false,
    rollbackAvailable: false,
    cohortGate: { evaluate: () => ({ eligible: false }) }
  });
  const result = await state.control.rollback();
  assert.equal(result.stage, "dual_write");
  assert.deepEqual(
    state.calls.find((call) => call[0] === "setStage")[1],
    { targetStage: "dual_write", expectedGeneration: 10 }
  );
});

test("legacy authority is preserved through shadow and dual-write policy definitions", () => {
  assert.equal(controlApi.stagePolicy.legacy.authority, "legacy");
  assert.equal(controlApi.stagePolicy.shadow.authority, "legacy");
  assert.equal(controlApi.stagePolicy.dual_write.authority, "legacy");
  assert.equal(controlApi.stagePolicy.normalized.rollback, "dual_write");
});


test("controlled rollout remains disconnected from production authority after the formal v1.8.4 release", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.equal(packageJson.version, "1.8.4");
  assert.doesNotMatch(indexSource, /cloud-sync-cohort-gate-v1\.8\.3\.js/);
  assert.doesNotMatch(indexSource, /cloud-sync-reconciliation-v1\.8\.3\.js/);
  assert.doesNotMatch(indexSource, /cloud-sync-rollout-control-v1\.8\.3\.js/);
});
