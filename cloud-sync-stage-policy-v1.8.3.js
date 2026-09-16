(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborCloudSyncStagePolicy = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "0.1-transition-policy";
  const RELEASE = "1.8.3";
  const STAGES = Object.freeze(["legacy", "shadow", "dual_write", "normalized"]);
  const STAGE_SET = new Set(STAGES);
  const TRANSITIONS = Object.freeze({
    legacy: Object.freeze(["shadow"]),
    shadow: Object.freeze(["legacy", "dual_write"]),
    dual_write: Object.freeze(["shadow", "normalized"]),
    normalized: Object.freeze(["dual_write"])
  });

  function stageOf(manifest) {
    const stage = String(manifest?.cutover_stage ?? manifest?.cutoverStage ?? "legacy");
    return STAGE_SET.has(stage) ? stage : "legacy";
  }

  function metadataOf(manifest) {
    const metadata = manifest?.metadata;
    return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
  }

  function verifiedAt(manifest) {
    return String(manifest?.normalized_verified_at ?? manifest?.normalizedVerifiedAt ?? "").trim();
  }

  function verificationIsCurrent(manifest) {
    if (!verifiedAt(manifest)) return false;
    const metadata = metadataOf(manifest);
    const verifiedChecksum = String(metadata.verified_checksum || "").trim();
    const sourceChecksum = String(metadata.source_checksum || "").trim();
    if (!verifiedChecksum || !sourceChecksum || verifiedChecksum !== sourceChecksum) return false;
    const count = Number(metadata.verification_record_count);
    return Number.isSafeInteger(count) && count >= 0;
  }

  function transitionRequiresVerification(fromStage, toStage) {
    return (
      (fromStage === "shadow" && toStage === "dual_write") ||
      (fromStage === "dual_write" && toStage === "normalized")
    );
  }

  function evaluateTransition(manifest, targetStage) {
    const fromStage = stageOf(manifest);
    const toStage = String(targetStage || "").trim();

    if (!STAGE_SET.has(toStage)) {
      return Object.freeze({
        allowed: false,
        fromStage,
        toStage,
        reason: "invalid-target-stage",
        requiresVerification: false
      });
    }
    if (fromStage === toStage) {
      return Object.freeze({
        allowed: true,
        fromStage,
        toStage,
        reason: "no-op",
        requiresVerification: false
      });
    }

    const legal = TRANSITIONS[fromStage]?.includes(toStage) === true;
    if (!legal) {
      return Object.freeze({
        allowed: false,
        fromStage,
        toStage,
        reason: "invalid-stage-transition",
        requiresVerification: false
      });
    }

    const requiresVerification = transitionRequiresVerification(fromStage, toStage);
    if (requiresVerification && !verificationIsCurrent(manifest)) {
      return Object.freeze({
        allowed: false,
        fromStage,
        toStage,
        reason: "current-verification-required",
        requiresVerification: true
      });
    }

    return Object.freeze({
      allowed: true,
      fromStage,
      toStage,
      reason: toStage === "legacy" || toStage === "shadow" && fromStage !== "legacy"
        ? "rollback"
        : "promotion",
      requiresVerification
    });
  }

  function assertTransition(manifest, targetStage) {
    const decision = evaluateTransition(manifest, targetStage);
    if (decision.allowed) return decision;
    const error = new Error(`Cloud sync stage transition rejected: ${decision.reason}.`);
    error.name = "HerdHarborCloudSyncStageError";
    error.code = decision.reason === "current-verification-required"
      ? "HH_SYNC_STAGE_VERIFICATION_REQUIRED"
      : decision.reason === "invalid-target-stage"
        ? "HH_SYNC_INVALID_STAGE"
        : "HH_SYNC_INVALID_STAGE_TRANSITION";
    error.fromStage = decision.fromStage;
    error.toStage = decision.toStage;
    throw error;
  }

  function rollbackTarget(manifest) {
    switch (stageOf(manifest)) {
      case "normalized": return "dual_write";
      case "dual_write": return "shadow";
      case "shadow": return "legacy";
      default: return null;
    }
  }

  return Object.freeze({
    version: VERSION,
    release: RELEASE,
    stages: STAGES,
    transitions: TRANSITIONS,
    stageOf,
    verificationIsCurrent,
    transitionRequiresVerification,
    evaluateTransition,
    assertTransition,
    rollbackTarget
  });
});
