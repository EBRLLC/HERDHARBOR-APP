(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./cloud-sync-stage-policy-v1.8.3.js"));
  } else if (root) {
    root.HerdHarborCloudSyncRolloutControl = factory(root.HerdHarborCloudSyncStagePolicy);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (stagePolicy) {
  "use strict";

  const VERSION = "1.0-rollout-guardrails";
  const RELEASE = "1.8.3";
  const BUILD = "cloud-sync-rollout-control-1";

  const REQUIRED_SCHEMA_CHECKS = Object.freeze([
    "recordsTable",
    "manifestTable",
    "ownerRls",
    "batchRpc",
    "verifyRpc",
    "stageRpc",
    "guardedWriterRpc",
    "legacyGuard"
  ]);

  const STAGE_POLICY = Object.freeze({
    legacy: Object.freeze({
      authority: "legacy",
      next: "shadow",
      rollback: null,
      entry: "default production authority"
    }),
    shadow: Object.freeze({
      authority: "legacy",
      next: "dual_write",
      rollback: "legacy",
      entry: "schema verified; explicit cohort; telemetry and rollback available"
    }),
    dual_write: Object.freeze({
      authority: "legacy",
      next: "normalized",
      rollback: "shadow",
      entry: "current verification; reconciliation healthy; normalized writes healthy"
    }),
    normalized: Object.freeze({
      authority: "normalized-with-legacy-recovery",
      next: null,
      rollback: "dual_write",
      entry: "current verification; guarded writer ready; normalized-read validation healthy"
    })
  });

  function schemaIsVerified(status) {
    return status?.verified === true && REQUIRED_SCHEMA_CHECKS.every((key) => status?.[key] === true);
  }

  function safeMetrics(metrics = {}) {
    const number = (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    };
    return Object.freeze({
      recordsCompared: number(metrics.recordsCompared),
      recordsMatching: number(metrics.recordsMatching),
      recordsDiffering: number(metrics.recordsDiffering),
      missingNormalizedRecords: number(metrics.missingNormalizedRecords),
      unexpectedNormalizedRecords: number(metrics.unexpectedNormalizedRecords),
      unresolvedConflicts: number(metrics.unresolvedConflicts),
      bootstrapFailures: number(metrics.bootstrapFailures),
      dualWriteFailures: number(metrics.dualWriteFailures),
      normalizedReadFallbackCount: number(metrics.normalizedReadFallbackCount),
      reconciliationErrorRate: number(metrics.reconciliationErrorRate)
    });
  }

  function evaluatePromotion(input = {}) {
    const manifest = input.manifest || {};
    const targetStage = String(input.targetStage || "").trim();
    const stageDecision = stagePolicy?.evaluateTransition?.(manifest, targetStage);
    const reasons = [];
    const metrics = safeMetrics(input.metrics);

    if (!stageDecision?.allowed) reasons.push(stageDecision?.reason || "stage-policy-unavailable");
    if (!schemaIsVerified(input.schemaStatus)) reasons.push("schema-not-verified");
    if (input.telemetryAvailable !== true) reasons.push("telemetry-unavailable");
    if (input.rollbackAvailable !== true) reasons.push("rollback-unavailable");
    if (input.cohortEligible !== true) reasons.push("cohort-not-eligible");

    const fromStage = stagePolicy?.stageOf?.(manifest) || "legacy";
    if (fromStage === "shadow" || fromStage === "dual_write") {
      if (metrics.recordsCompared < 1) reasons.push("reconciliation-not-observed");
      if (metrics.unresolvedConflicts > 0) reasons.push("unresolved-conflicts");
      if (metrics.bootstrapFailures > 0) reasons.push("bootstrap-failures-present");
      if (metrics.dualWriteFailures > 0) reasons.push("normalized-write-failures-present");
      const limit = Number.isFinite(Number(input.maxReconciliationErrorRate))
        ? Math.max(0, Number(input.maxReconciliationErrorRate))
        : 0;
      if (metrics.reconciliationErrorRate > limit) reasons.push("reconciliation-error-rate-too-high");
    }

    if (targetStage === "normalized" && metrics.normalizedReadFallbackCount > 0) {
      reasons.push("normalized-read-fallbacks-present");
    }

    return Object.freeze({
      allowed: reasons.length === 0,
      fromStage,
      targetStage,
      reasons: Object.freeze([...new Set(reasons)]),
      metrics,
      stageDecision
    });
  }

  function rolloutError(decision) {
    const error = new Error(`Normalized sync rollout blocked: ${decision.reasons.join(", ") || "unknown"}.`);
    error.name = "HerdHarborCloudRolloutGuardError";
    error.code = "HH_SYNC_PROMOTION_BLOCKED";
    error.reasons = decision.reasons;
    error.fromStage = decision.fromStage;
    error.targetStage = decision.targetStage;
    return error;
  }

  function createRolloutControl(options = {}) {
    if (!stagePolicy?.evaluateTransition || !stagePolicy?.rollbackTarget) {
      throw new TypeError("HerdHarbor cloud sync stage policy is required.");
    }
    const store = options.recordStore;
    if (!store?.getManifest || !store?.setStage || !store?.prepareNormalizedWriter) {
      throw new TypeError("A normalized cloud record store with stage controls is required.");
    }
    const getSchemaStatus = typeof options.getSchemaStatus === "function"
      ? options.getSchemaStatus
      : async () => ({ verified: false });
    const getMetrics = typeof options.getMetrics === "function"
      ? options.getMetrics
      : async () => ({});
    const telemetryAvailable = typeof options.telemetryAvailable === "function"
      ? options.telemetryAvailable
      : async () => false;
    const rollbackAvailable = typeof options.rollbackAvailable === "function"
      ? options.rollbackAvailable
      : async () => false;
    const cohortGate = options.cohortGate;
    const maxReconciliationErrorRate = Number.isFinite(Number(options.maxReconciliationErrorRate))
      ? Math.max(0, Number(options.maxReconciliationErrorRate))
      : 0;

    async function promotionDecision(targetStage, userId) {
      const [manifest, schemaStatus, metrics, hasTelemetry, canRollback] = await Promise.all([
        store.getManifest(),
        getSchemaStatus(),
        getMetrics(),
        telemetryAvailable(),
        rollbackAvailable()
      ]);
      const cohortEligible = cohortGate?.evaluate
        ? cohortGate.evaluate(userId).eligible === true
        : cohortGate?.isEligibleUser
          ? cohortGate.isEligibleUser(userId) === true
          : false;
      return evaluatePromotion({
        manifest,
        targetStage,
        schemaStatus,
        metrics,
        telemetryAvailable: hasTelemetry === true,
        rollbackAvailable: canRollback === true,
        cohortEligible,
        maxReconciliationErrorRate
      });
    }

    async function promote(targetStage, { userId } = {}) {
      const decision = await promotionDecision(targetStage, userId);
      if (!decision.allowed) throw rolloutError(decision);
      const manifest = await store.getManifest();
      const generation = stagePolicy.generationOf(manifest);
      if (generation === null) {
        const decisionWithReason = { ...decision, reasons: [...decision.reasons, "manifest-generation-missing"] };
        throw rolloutError(decisionWithReason);
      }
      return store.setStage({ targetStage, expectedGeneration: generation });
    }

    async function prepareWriter({ userId, writerVersion, namespace, formatVersion } = {}) {
      const decision = await promotionDecision("normalized", userId);
      const allowedReasons = new Set(["normalized-writer-required"]);
      const blocking = decision.reasons.filter((reason) => !allowedReasons.has(reason));
      if (decision.fromStage !== "dual_write") blocking.push("dual-write-stage-required");
      if (blocking.length) throw rolloutError({ ...decision, reasons: [...new Set(blocking)] });
      const manifest = await store.getManifest();
      const generation = stagePolicy.generationOf(manifest);
      if (generation === null) throw rolloutError({ ...decision, reasons: ["manifest-generation-missing"] });
      return store.prepareNormalizedWriter({
        expectedGeneration: generation,
        writerVersion,
        namespace,
        formatVersion
      });
    }

    async function rollback() {
      const manifest = await store.getManifest();
      const targetStage = stagePolicy.rollbackTarget(manifest);
      if (!targetStage) return Object.freeze({ ok: true, skipped: true, reason: "already-legacy" });
      const generation = stagePolicy.generationOf(manifest);
      if (generation === null) {
        const error = new Error("Normalized sync rollback blocked: manifest generation is missing.");
        error.name = "HerdHarborCloudRolloutGuardError";
        error.code = "HH_SYNC_ROLLBACK_BLOCKED";
        throw error;
      }
      return store.setStage({ targetStage, expectedGeneration: generation });
    }

    return Object.freeze({
      build: BUILD,
      promotionDecision,
      promote,
      prepareWriter,
      rollback
    });
  }

  return Object.freeze({
    version: VERSION,
    release: RELEASE,
    build: BUILD,
    requiredSchemaChecks: REQUIRED_SCHEMA_CHECKS,
    stagePolicy: STAGE_POLICY,
    schemaIsVerified,
    evaluatePromotion,
    createRolloutControl
  });
});
