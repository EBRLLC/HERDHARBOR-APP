(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.HerdHarborCloudSyncValidationRuntime = api;
    if (root.document) {
      try {
        root.HerdHarborCloudSyncValidation = api.create({ root });
      } catch (error) {
        root.console?.warn?.("HerdHarbor normalized validation runtime stayed disabled:", error?.message || error);
      }
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "1.0";
  const RELEASE = "1.8.4";
  const WRITER_VERSION = "record-cas-v1";
  const ALLOWED_VALIDATION_STAGES = new Set(["legacy", "shadow", "dual_write"]);

  function cloneJson(value, fallback = null) {
    try { return JSON.parse(JSON.stringify(value)); } catch { return fallback; }
  }

  function validationError(message, code) {
    const error = new Error(message);
    error.name = "HerdHarborCloudSyncValidationError";
    error.code = code;
    return error;
  }

  function safeStage(manifest) {
    const stage = String(manifest?.cutover_stage ?? manifest?.cutoverStage ?? "legacy");
    return ["legacy", "shadow", "dual_write", "normalized"].includes(stage) ? stage : "legacy";
  }

  function zeroMetrics() {
    return {
      recordsCompared: 0,
      recordsMatching: 0,
      recordsDiffering: 0,
      missingNormalizedRecords: 0,
      unexpectedNormalizedRecords: 0,
      unresolvedConflicts: 0,
      bootstrapFailures: 0,
      dualWriteFailures: 0,
      normalizedReadFallbackCount: 0,
      reconciliationErrorRate: 0
    };
  }

  function create(options = {}) {
    const root = options.root || null;
    const cloud = options.cloud || root?.HerdHarborCloud;
    const stateStore = options.stateStore || root?.HerdHarborStateStore;
    const recordStoreApi = options.recordStoreApi || root?.HerdHarborCloudRecordStore;
    const normalizer = options.normalizer || root?.HerdHarborCloudStateNormalizer;
    const baselineApi = options.baselineApi || root?.HerdHarborCloudRecordBaseline;
    const workerApi = options.workerApi || root?.HerdHarborCloudRecordOutboxWorker;
    const shadowApi = options.shadowApi || root?.HerdHarborCloudShadowSync;
    const dualWriteApi = options.dualWriteApi || root?.HerdHarborCloudDualWriteCoordinator;
    const reconciliationApi = options.reconciliationApi || root?.HerdHarborCloudSyncReconciliation;
    const rolloutApi = options.rolloutApi || root?.HerdHarborCloudSyncRolloutControl;
    const monitoring = options.monitoring || root?.HerdHarborMonitoring || null;
    const createBaselineStore = typeof options.createBaselineStore === "function"
      ? options.createBaselineStore
      : ({ userId }) => baselineApi.createIndexedDbStore({ ownerId: userId, indexedDB: root?.indexedDB });
    const autoStart = options.autoStart !== false;

    if (!cloud?.getSession || !cloud?.getNormalizedSyncCohortStatus || !cloud?.createNormalizedRecordStore) {
      throw new TypeError("The canonical HerdHarbor cloud bridge is required.");
    }
    if (!stateStore?.getState || !stateStore?.getOutbox || !stateStore?.acknowledgeMutations) {
      throw new TypeError("The canonical HerdHarbor state store is required.");
    }
    if (!normalizer?.mapLegacySnapshot || !normalizer?.namespace || !normalizer?.formatVersion) {
      throw new TypeError("The normalized state mapper is required.");
    }
    if (!workerApi?.create || !shadowApi?.createShadowSyncController || !dualWriteApi?.createDualWriteCoordinator) {
      throw new TypeError("The normalized validation writer modules are required.");
    }
    if (!reconciliationApi?.reconcileSnapshot || !reconciliationApi?.createRolloutMetrics) {
      throw new TypeError("The normalized reconciliation module is required.");
    }
    if (!rolloutApi?.createRolloutControl || !Array.isArray(rolloutApi?.requiredSchemaChecks)) {
      throw new TypeError("The normalized rollout controller is required.");
    }

    let context = null;
    let gateStatus = Object.freeze({
      eligible: false,
      mode: "allowlist",
      percentageEnabled: false,
      schemaVerified: false
    });
    let lastMetrics = Object.freeze(zeroMetrics());
    let lastStage = "legacy";
    let operation = Promise.resolve();

    function monitoringAvailable() {
      try {
        const status = monitoring?.getStatus?.();
        return Boolean(status?.initialized);
      } catch {
        return false;
      }
    }

    function emit(action, result, metadata = {}) {
      try {
        monitoring?.addBreadcrumb?.({
          module: "sync",
          action,
          result,
          metadata: {
            component: "normalized-validation",
            phase: String(metadata.phase || "").slice(0, 64),
            mode: String(metadata.mode || "").slice(0, 64),
            record_count: Number.isFinite(Number(metadata.record_count)) ? Number(metadata.record_count) : undefined
          }
        });
      } catch {}
    }

    function schemaStatus() {
      const ready = gateStatus.schemaVerified === true;
      const result = { verified: ready };
      for (const key of rolloutApi.requiredSchemaChecks) result[key] = ready;
      return Object.freeze(result);
    }

    function currentUserId() {
      return String(cloud.getSession()?.user?.id || "").trim();
    }

    async function refreshGate() {
      const sessionUserId = currentUserId();
      if (!sessionUserId) {
        gateStatus = Object.freeze({
          eligible: false,
          mode: "allowlist",
          percentageEnabled: false,
          schemaVerified: false,
          reason: "signed-out"
        });
        context = null;
        return gateStatus;
      }

      const status = await cloud.getNormalizedSyncCohortStatus();
      const mode = String(status?.mode || "");
      const percentageEnabled = status?.percentageEnabled === true;
      const schemaVerified = status?.schemaVerified === true;
      const eligible = status?.eligible === true &&
        mode === "allowlist" &&
        percentageEnabled === false &&
        schemaVerified;

      gateStatus = Object.freeze({
        eligible,
        mode: mode === "allowlist" ? "allowlist" : "invalid",
        percentageEnabled,
        schemaVerified,
        reason: eligible
          ? "allowlisted"
          : percentageEnabled
            ? "percentage-rollout-blocked"
            : !schemaVerified
              ? "schema-not-verified"
              : "not-allowlisted"
      });
      if (!eligible) context = null;
      return gateStatus;
    }

    function requireEligible() {
      if (gateStatus.eligible !== true) {
        throw validationError(
          `Normalized validation is not available: ${gateStatus.reason || "not-eligible"}.`,
          "HH_SYNC_VALIDATION_NOT_ELIGIBLE"
        );
      }
    }

    function combineMetrics(reconciled, operational) {
      return Object.freeze({
        ...zeroMetrics(),
        ...(reconciled || {}),
        unresolvedConflicts: Number(operational?.unresolvedConflicts || reconciled?.unresolvedConflicts || 0),
        bootstrapFailures: Number(operational?.bootstrapFailures || reconciled?.bootstrapFailures || 0),
        dualWriteFailures: Number(operational?.dualWriteFailures || reconciled?.dualWriteFailures || 0),
        normalizedReadFallbackCount: Number(operational?.normalizedReadFallbackCount || reconciled?.normalizedReadFallbackCount || 0)
      });
    }

    async function ensureContext() {
      requireEligible();
      const userId = currentUserId();
      if (!userId) throw validationError("Sign in before normalized validation.", "HH_SYNC_AUTH_REQUIRED");
      if (context?.userId === userId) return context;

      const recordStore = cloud.createNormalizedRecordStore();
      const baselineStore = createBaselineStore({ userId });
      const operationalMetrics = reconciliationApi.createRolloutMetrics();
      const onEvent = (event) => {
        operationalMetrics.recordEvent(event);
        emit(event?.type || "normalized-event", event?.errorCode ? "failure" : "success", {
          phase: event?.type || "",
          mode: safeStage(event)
        });
      };
      const shadowController = shadowApi.createShadowSyncController({
        recordStore,
        normalizer,
        enabled: true,
        onEvent
      });
      const worker = workerApi.create({
        stateStore,
        recordStore,
        normalizer,
        baselineStore,
        writerVersion: WRITER_VERSION
      });
      const dualWrite = dualWriteApi.createDualWriteCoordinator({
        enabled: true,
        recordWorker: worker,
        shadowController,
        writeLegacySnapshot: async () => ({ ok: true, skipped: true, reason: "legacy-already-confirmed" }),
        onEvent
      });
      const cohortGate = {
        evaluate(candidateUserId) {
          return Object.freeze({
            eligible: gateStatus.eligible === true && String(candidateUserId || "") === userId,
            reason: gateStatus.eligible === true ? "server-allowlisted" : "not-allowlisted",
            mode: "allowlist",
            percentage: 0
          });
        }
      };
      const rolloutControl = rolloutApi.createRolloutControl({
        recordStore,
        cohortGate,
        getSchemaStatus: async () => schemaStatus(),
        getMetrics: async () => lastMetrics,
        telemetryAvailable: async () => monitoringAvailable(),
        rollbackAvailable: async () => typeof cloud.readLegacySnapshotForNormalizedSync === "function",
        maxReconciliationErrorRate: 0
      });

      context = {
        userId,
        recordStore,
        baselineStore,
        operationalMetrics,
        shadowController,
        worker,
        dualWrite,
        rolloutControl
      };
      return context;
    }

    async function reconciliationCheckpoint(ctx, snapshot, checkpointRevision) {
      const rows = await ctx.recordStore.list(normalizer.namespace, { includeDeleted: true });
      const reconciled = reconciliationApi.reconcileSnapshot(
        normalizer,
        snapshot,
        rows,
        ctx.operationalMetrics.snapshot()
      );
      lastMetrics = combineMetrics(reconciled, ctx.operationalMetrics.snapshot());

      const clean =
        lastMetrics.recordsDiffering === 0 &&
        lastMetrics.missingNormalizedRecords === 0 &&
        lastMetrics.unexpectedNormalizedRecords === 0 &&
        lastMetrics.unresolvedConflicts === 0 &&
        lastMetrics.reconciliationErrorRate === 0;
      if (!clean) {
        throw validationError("Normalized validation reconciliation is not clean.", "HH_SYNC_RECONCILIATION_DIVERGENCE");
      }

      const manifest = await ctx.recordStore.getManifest();
      await ctx.baselineStore.replace(normalizer.namespace, rows, {
        primed: true,
        generation: manifest?.sync_generation ?? manifest?.syncGeneration ?? null,
        stage: safeStage(manifest),
        checksum: normalizer.snapshotChecksum(snapshot)
      });

      const acknowledged = stateStore.getOutbox(ctx.userId)
        .filter((entry) => Number(entry.localRevision || 0) <= Number(checkpointRevision || 0))
        .map((entry) => entry.mutationId);
      if (acknowledged.length) stateStore.acknowledgeMutations(acknowledged, ctx.userId);

      return { rows, manifest, metrics: lastMetrics, acknowledged: acknowledged.length };
    }

    async function checkpoint(expectedStages) {
      await refreshGate();
      requireEligible();
      const ctx = await ensureContext();
      const beforeManifest = await ctx.recordStore.getManifest();
      const beforeStage = safeStage(beforeManifest);
      if (Array.isArray(expectedStages) && !expectedStages.includes(beforeStage)) {
        throw validationError(
          `Normalized validation checkpoint requires ${expectedStages.join(" or ")}, not ${beforeStage}.`,
          "HH_SYNC_VALIDATION_STAGE"
        );
      }

      const snapshot = cloneJson(stateStore.getState(), {});
      const checkpointRevision = stateStore.getRevision?.(ctx.userId) ?? 0;
      const syncResult = await ctx.shadowController.sync(snapshot);
      const verification = await ctx.shadowController.verifyAndRecord(snapshot);
      const reconciled = await reconciliationCheckpoint(ctx, snapshot, checkpointRevision);
      const manifest = await ctx.recordStore.getManifest();
      lastStage = safeStage(manifest);
      emit("normalized-validation-checkpoint", "success", {
        phase: lastStage,
        record_count: reconciled.rows.length
      });

      return Object.freeze({
        ok: verification?.ok === true,
        stage: lastStage,
        sync: syncResult,
        verification,
        metrics: lastMetrics,
        acknowledged: reconciled.acknowledged
      });
    }

    async function bootstrapShadow() {
      await refreshGate();
      requireEligible();
      const ctx = await ensureContext();
      const manifest = await ctx.recordStore.getManifest();
      if (safeStage(manifest) !== "legacy") {
        throw validationError("Shadow bootstrap is only allowed from legacy stage.", "HH_SYNC_VALIDATION_STAGE");
      }
      return checkpoint(["legacy"]);
    }

    async function validateShadow() {
      return checkpoint(["shadow"]);
    }

    async function promoteDualWrite() {
      const shadowResult = await checkpoint(["shadow"]);
      if (!shadowResult.ok) throw validationError("Shadow verification is not current.", "HH_SYNC_SHADOW_NOT_VERIFIED");
      const ctx = await ensureContext();
      if (stateStore.getOutbox(ctx.userId).length) {
        throw validationError("Pending local mutations block dual-write promotion.", "HH_SYNC_OUTBOX_NOT_QUIESCENT");
      }

      const promoted = await ctx.rolloutControl.promote("dual_write", { userId: ctx.userId });
      const prepared = await ctx.rolloutControl.prepareWriter({
        userId: ctx.userId,
        writerVersion: WRITER_VERSION,
        namespace: normalizer.namespace,
        formatVersion: normalizer.formatVersion
      });
      const manifest = await ctx.recordStore.getManifest();
      lastStage = safeStage(manifest);
      await ctx.baselineStore.setMeta?.(normalizer.namespace, {
        primed: true,
        generation: manifest?.sync_generation ?? null,
        stage: lastStage,
        checksum: normalizer.snapshotChecksum(stateStore.getState())
      });
      return Object.freeze({ ok: true, stage: lastStage, promoted, prepared, metrics: lastMetrics });
    }

    async function validateDualWrite() {
      await refreshGate();
      requireEligible();
      const ctx = await ensureContext();
      const manifest = await ctx.recordStore.getManifest();
      if (safeStage(manifest) !== "dual_write") {
        throw validationError("Dual-write validation requires dual_write stage.", "HH_SYNC_VALIDATION_STAGE");
      }
      const drained = await ctx.worker.drain();
      if (drained?.ok === false || Number(drained?.failed || 0) > 0) {
        throw validationError("Pending normalized record mutations failed during validation.", "HH_SYNC_DUAL_WRITE_PENDING");
      }
      const verified = await checkpoint(["dual_write"]);
      return Object.freeze({ ...verified, outbox: drained });
    }

    async function afterLegacyCommit(detail = {}) {
      const gate = await refreshGate();
      if (!gate.eligible) return Object.freeze({ skipped: true, reason: gate.reason });
      const ctx = await ensureContext();
      const manifest = await ctx.recordStore.getManifest();
      const stage = safeStage(manifest);
      lastStage = stage;

      if (stage === "legacy") return Object.freeze({ skipped: true, reason: "manual-shadow-bootstrap-required", stage });
      if (stage === "shadow") return checkpoint(["shadow"]);
      if (stage === "dual_write") {
        const snapshot = cloneJson(stateStore.getState(), {});
        return ctx.dualWrite.afterLegacySave(snapshot, { updated_at: detail.updatedAt || null });
      }
      return Object.freeze({ skipped: true, reason: "normalized-authority-not-enabled-in-pr6", stage });
    }

    async function rollback() {
      await refreshGate();
      requireEligible();
      const ctx = await ensureContext();
      const result = await ctx.rolloutControl.rollback();
      const manifest = await ctx.recordStore.getManifest();
      lastStage = safeStage(manifest);
      return Object.freeze({ ok: true, stage: lastStage, result });
    }

    function status() {
      return Object.freeze({
        release: RELEASE,
        version: VERSION,
        eligible: gateStatus.eligible === true,
        gateReason: gateStatus.reason || "unknown",
        mode: gateStatus.mode || "allowlist",
        percentageEnabled: gateStatus.percentageEnabled === true,
        schemaVerified: gateStatus.schemaVerified === true,
        stage: lastStage,
        metrics: lastMetrics,
        signedIn: Boolean(currentUserId())
      });
    }

    function serialize(task) {
      const run = operation.then(task, task);
      operation = run.catch(() => {});
      return run;
    }

    if (autoStart && root?.document?.addEventListener) {
      root.document.addEventListener("herdharbor:legacy-cloud-commit", (event) => {
        void serialize(() => afterLegacyCommit(event?.detail || {})).catch((error) => {
          try {
            monitoring?.captureOperationalFailure?.("normalized_sync_validation_failure", {
              module: "sync",
              operation: "normalized_validation",
              result: "failure",
              component: "normalized-validation",
              phase: lastStage
            }, error);
          } catch {}
        });
      });
      root.document.addEventListener("herdharbor:auth-session", () => {
        context = null;
        void serialize(() => refreshGate()).catch(() => {});
      });
      void serialize(() => refreshGate()).catch(() => {});
    }

    return Object.freeze({
      version: VERSION,
      release: RELEASE,
      writerVersion: WRITER_VERSION,
      refreshGate: () => serialize(refreshGate),
      bootstrapShadow: () => serialize(bootstrapShadow),
      validateShadow: () => serialize(validateShadow),
      promoteDualWrite: () => serialize(promoteDualWrite),
      validateDualWrite: () => serialize(validateDualWrite),
      afterLegacyCommit: (detail) => serialize(() => afterLegacyCommit(detail)),
      rollback: () => serialize(rollback),
      status
    });
  }

  return Object.freeze({
    version: VERSION,
    release: RELEASE,
    writerVersion: WRITER_VERSION,
    create
  });
});
