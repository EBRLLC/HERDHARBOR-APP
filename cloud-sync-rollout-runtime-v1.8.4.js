(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.HerdHarborNormalizedSyncRolloutRuntime = api;
    if (root.document && root.HerdHarborCloud && root.HerdHarborStateStore) {
      const instance = api.createBrowserRuntime(root);
      root.HerdHarborNormalizedSyncRollout = instance;
      instance.start().catch((error) => {
        console.warn("HerdHarbor normalized rollout stayed disabled:", error?.code || error?.message || error);
      });
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "1.0";
  const RELEASE = "1.8.4";
  const REQUIRED_VALIDATION_PASSES = 3;
  const WRITER_VERSION = "record-cas-v1";
  const DEPENDENCIES = Object.freeze([
    ["hh-normalized-record-store-v183", "cloud-record-store-v1.8.3.js?v=1"],
    ["hh-normalized-state-mapper-v183", "cloud-state-normalizer-v1.8.3.js?v=1"],
    ["hh-normalized-record-baseline-v184", "cloud-record-baseline-v1.8.4.js?v=1"],
    ["hh-normalized-record-worker-v184", "cloud-record-outbox-worker-v1.8.4.js?v=1"],
    ["hh-normalized-cohort-gate-v183", "cloud-sync-cohort-gate-v1.8.3.js?v=1"],
    ["hh-normalized-shadow-sync-v183", "cloud-shadow-sync-v1.8.3.js?v=1"],
    ["hh-normalized-shadow-bootstrap-v183", "cloud-shadow-bootstrap-v1.8.3.js?v=1"],
    ["hh-normalized-reconciliation-v183", "cloud-sync-reconciliation-v1.8.3.js?v=1"],
    ["hh-normalized-stage-policy-v183", "cloud-sync-stage-policy-v1.8.3.js?v=1"],
    ["hh-normalized-rollout-control-v183", "cloud-sync-rollout-control-v1.8.3.js?v=1"],
    ["hh-normalized-dual-write-v183", "cloud-dual-write-coordinator-v1.8.3.js?v=1"]
  ]);

  function safeText(value, fallback = "") {
    const text = String(value == null ? "" : value).trim();
    return text || fallback;
  }

  function stageOf(manifest) {
    const stage = String(manifest?.cutover_stage ?? manifest?.cutoverStage ?? "legacy");
    return ["legacy", "shadow", "dual_write", "normalized"].includes(stage) ? stage : "legacy";
  }

  function reconciliationPass(result) {
    return Boolean(result) &&
      Number(result.recordsDiffering || 0) === 0 &&
      Number(result.missingNormalizedRecords || 0) === 0 &&
      Number(result.unexpectedNormalizedRecords || 0) === 0 &&
      Number(result.unresolvedConflicts || 0) === 0 &&
      Number(result.reconciliationErrorRate || 0) === 0;
  }

  function browserScriptLoader(root) {
    const target = root.document?.head || root.document?.documentElement;
    if (!target) throw new Error("A document head is required to load normalized sync modules.");

    function loadOne([id, src]) {
      return new Promise((resolve, reject) => {
        const existing = root.document.getElementById(id);
        if (existing) {
          if (existing.dataset?.hhLoaded === "1" || existing.readyState === "complete") resolve();
          else {
            existing.addEventListener("load", resolve, { once: true });
            existing.addEventListener("error", () => reject(new Error(`Could not load ${src}.`)), { once: true });
          }
          return;
        }
        const node = root.document.createElement("script");
        node.id = id;
        node.src = src;
        node.async = false;
        node.addEventListener("load", () => {
          if (node.dataset) node.dataset.hhLoaded = "1";
          resolve();
        }, { once: true });
        node.addEventListener("error", () => reject(new Error(`Could not load ${src}.`)), { once: true });
        target.appendChild(node);
      });
    }

    return async function loadDependencies() {
      for (const dependency of DEPENDENCIES) await loadOne(dependency);
      return true;
    };
  }

  function create(options = {}) {
    const root = options.root || null;
    const cloud = options.cloud;
    const stateStore = options.stateStore;
    const loadDependencies = options.loadDependencies;
    const indexedDB = options.indexedDB || root?.indexedDB || null;
    const telemetryAvailable = typeof options.telemetryAvailable === "function"
      ? options.telemetryAvailable
      : () => false;
    const requiredValidationPasses = Math.max(
      REQUIRED_VALIDATION_PASSES,
      Number(options.requiredValidationPasses || REQUIRED_VALIDATION_PASSES)
    );

    if (!cloud?.getSession || !cloud?.syncNow || !cloud?.getNormalizedSyncCohortStatus) {
      throw new TypeError("The legacy HerdHarbor cloud bridge with rollout helpers is required.");
    }
    if (!stateStore?.getOutbox || !stateStore?.getState) {
      throw new TypeError("The canonical HerdHarbor state store is required.");
    }
    if (typeof loadDependencies !== "function") {
      throw new TypeError("A normalized dependency loader is required.");
    }

    let started = false;
    let eligibility = null;
    let context = null;
    let setupPromise = null;
    let commitChain = Promise.resolve();
    let validationPasses = 0;
    let lastValidation = null;
    let lastResult = null;

    function emit(type, detail = {}) {
      try {
        root?.document?.dispatchEvent?.(new root.CustomEvent("herdharbor:normalized-rollout", {
          detail: {
            type: String(type || "unknown").slice(0, 80),
            stage: String(detail.stage || context?.stage || "legacy").slice(0, 32),
            ok: detail.ok === true,
            eligible: eligibility?.eligible === true,
            validationPasses,
            reason: String(detail.reason || "").slice(0, 120) || null
          }
        }));
      } catch {}
    }

    function modules() {
      const m = options.modules || {};
      return {
        recordStoreApi: m.recordStoreApi || root?.HerdHarborCloudRecordStore,
        normalizer: m.normalizer || root?.HerdHarborCloudStateNormalizer,
        baselineApi: m.baselineApi || root?.HerdHarborCloudRecordBaseline,
        workerApi: m.workerApi || root?.HerdHarborCloudRecordOutboxWorker,
        cohortApi: m.cohortApi || root?.HerdHarborCloudSyncCohortGate,
        shadowApi: m.shadowApi || root?.HerdHarborCloudShadowSync,
        bootstrapApi: m.bootstrapApi || root?.HerdHarborCloudShadowBootstrap,
        reconciliationApi: m.reconciliationApi || root?.HerdHarborCloudSyncReconciliation,
        stagePolicy: m.stagePolicy || root?.HerdHarborCloudSyncStagePolicy,
        rolloutApi: m.rolloutApi || root?.HerdHarborCloudSyncRolloutControl,
        dualWriteApi: m.dualWriteApi || root?.HerdHarborCloudDualWriteCoordinator
      };
    }

    async function rollbackAvailable() {
      try {
        const legacy = await cloud.readLegacySnapshotForNormalizedSync();
        return Boolean(legacy?.snapshot && typeof legacy.snapshot === "object");
      } catch {
        return false;
      }
    }

    async function ensureContext() {
      if (context) return context;
      if (setupPromise) return setupPromise;
      setupPromise = (async () => {
        const session = await cloud.getSession();
        const userId = safeText(session?.user?.id);
        if (!userId) throw Object.assign(new Error("A signed-in session is required."), { code: "HH_SYNC_NO_SESSION" });

        eligibility = await cloud.getNormalizedSyncCohortStatus();
        if (
          eligibility?.eligible !== true ||
          eligibility?.mode !== "allowlist" ||
          eligibility?.percentageEnabled === true ||
          eligibility?.schemaVerified !== true
        ) {
          const reason = eligibility?.percentageEnabled === true
            ? "percentage-rollout-forbidden"
            : eligibility?.eligible !== true
              ? "not-in-internal-cohort"
              : "schema-not-ready";
          emit("rollout-disabled", { reason });
          return null;
        }

        await loadDependencies();
        const m = modules();
        if (
          !m.normalizer?.mapLegacySnapshot ||
          !m.baselineApi?.createIndexedDbStore ||
          !m.workerApi?.create ||
          !m.cohortApi?.createCohortGate ||
          !m.shadowApi?.createShadowSyncController ||
          !m.bootstrapApi?.createShadowBootstrap ||
          !m.reconciliationApi?.reconcileSnapshot ||
          !m.reconciliationApi?.createRolloutMetrics ||
          !m.rolloutApi?.createRolloutControl ||
          !m.dualWriteApi?.createDualWriteCoordinator
        ) {
          throw Object.assign(new Error("Normalized rollout modules are incomplete."), { code: "HH_SYNC_ROLLOUT_MODULES_MISSING" });
        }

        const cohortGate = m.cohortApi.createCohortGate({
          enabled: true,
          mode: "allowlist",
          allowlistUserIds: [userId],
          percentage: 0
        });
        if (cohortGate.evaluate(userId).eligible !== true) {
          throw Object.assign(new Error("Internal cohort gate rejected the approved session."), { code: "HH_SYNC_COHORT_REJECTED" });
        }

        const recordStore = cloud.createNormalizedRecordStore();
        const baselineStore = m.baselineApi.createIndexedDbStore({
          ownerId: userId,
          indexedDB
        });
        const worker = m.workerApi.create({
          stateStore,
          recordStore,
          normalizer: m.normalizer,
          baselineStore,
          writerVersion: WRITER_VERSION
        });
        const metrics = m.reconciliationApi.createRolloutMetrics();
        const shadowController = m.shadowApi.createShadowSyncController({
          recordStore,
          normalizer: m.normalizer,
          enabled: true,
          onEvent: metrics.recordEvent
        });
        const bootstrap = m.bootstrapApi.createShadowBootstrap({
          featureGate: true,
          cohortGate,
          getSession: cloud.getSession,
          readLegacySnapshot: cloud.readLegacySnapshotForNormalizedSync,
          createRecordStore: () => recordStore,
          createShadowSyncController: () => shadowController,
          onEvent: metrics.recordEvent
        });
        const postLegacy = m.dualWriteApi.createDualWriteCoordinator({
          enabled: true,
          recordWorker: worker,
          shadowController,
          writeLegacySnapshot: async () => ({ ok: true, skipped: true, reason: "legacy-already-confirmed" }),
          onEvent: metrics.recordEvent
        });
        const rolloutControl = m.rolloutApi.createRolloutControl({
          recordStore,
          cohortGate,
          getSchemaStatus: async () => {
            const ready = eligibility?.schemaVerified === true;
            const status = { verified: ready };
            for (const key of m.rolloutApi.requiredSchemaChecks || []) status[key] = ready;
            return status;
          },
          getMetrics: async () => metrics.snapshot(),
          telemetryAvailable: async () => telemetryAvailable() === true,
          rollbackAvailable
        });

        context = {
          userId,
          cohortGate,
          recordStore,
          baselineStore,
          worker,
          metrics,
          shadowController,
          bootstrap,
          postLegacy,
          rolloutControl,
          normalizer: m.normalizer,
          reconciliationApi: m.reconciliationApi,
          stage: stageOf(await recordStore.getManifest())
        };
        emit("rollout-ready", { stage: context.stage, ok: true });
        return context;
      })().finally(() => {
        setupPromise = null;
      });
      return setupPromise;
    }

    async function bootstrapIfNeeded(ctx) {
      const manifest = await ctx.recordStore.getManifest();
      const stage = stageOf(manifest);
      ctx.stage = stage;
      if (stage !== "legacy") return { ok: true, skipped: true, stage };

      const result = await ctx.bootstrap.run();
      const after = await ctx.recordStore.getManifest();
      ctx.stage = stageOf(after);
      if (result?.verified !== true || ctx.stage !== "shadow") {
        validationPasses = 0;
        emit("shadow-bootstrap-incomplete", { stage: ctx.stage, reason: result?.reason || "not-verified" });
        return { ok: false, stage: ctx.stage, result };
      }
      emit("shadow-bootstrap-verified", { stage: ctx.stage, ok: true });
      return { ok: true, stage: ctx.stage, result };
    }

    async function afterLegacyCommit() {
      const ctx = await ensureContext();
      if (!ctx) return { ok: true, skipped: true, reason: "not-eligible" };

      const boot = await bootstrapIfNeeded(ctx);
      if (!boot.ok) return boot;

      const manifest = await ctx.recordStore.getManifest();
      ctx.stage = stageOf(manifest);
      if (ctx.stage === "normalized") {
        return { ok: true, skipped: true, reason: "normalized-authority-owned-by-pr7", stage: ctx.stage };
      }

      let result;
      if (ctx.stage === "dual_write") {
        result = await ctx.postLegacy.afterLegacySave(stateStore.getState(), {
          ok: true,
          updated_at: null
        });
      } else {
        const normalizedResult = await ctx.worker.drain({ ownerId: ctx.userId });
        result = {
          ok: normalizedResult?.failed === 0,
          mode: "shadow-record-write",
          legacySaved: true,
          normalizedSaved: Number(normalizedResult?.succeeded || 0) > 0,
          normalizedPending: normalizedResult?.skipped === true || Number(normalizedResult?.failed || 0) > 0,
          normalizedResult
        };
        if (!result.ok) ctx.metrics.record("dualWriteFailures");
      }
      lastResult = result;
      const normalizedOk = result.mode !== "dual-write-degraded" && result.normalizedPending !== true;
      if (!normalizedOk) validationPasses = 0;
      emit(normalizedOk ? "post-legacy-complete" : "post-legacy-degraded", {
        stage: ctx.stage,
        ok: normalizedOk,
        reason: result.normalizedErrorCode || result.normalizedResult?.reason || ""
      });
      return result;
    }

    async function validateNow() {
      const ctx = await ensureContext();
      if (!ctx) return { ok: false, skipped: true, reason: "not-eligible" };

      const boot = await bootstrapIfNeeded(ctx);
      if (!boot.ok) return boot;

      const drain = await ctx.worker.drain({ ownerId: ctx.userId });
      if (Number(drain?.failed || 0) > 0 || stateStore.getOutbox(ctx.userId).length > 0) {
        validationPasses = 0;
        const result = { ok: false, reason: "pending-normalized-mutations", drain };
        lastValidation = result;
        emit("validation-failed", { stage: ctx.stage, reason: result.reason });
        return result;
      }

      const legacyRead = await cloud.readLegacySnapshotForNormalizedSync();
      const beforeRows = await ctx.recordStore.list(ctx.normalizer.namespace, { includeDeleted: true });
      const sync = await ctx.shadowController.sync(legacyRead.snapshot, {
        previousRows: beforeRows,
        legacySnapshotUpdatedAt: legacyRead.updatedAt || undefined
      });
      const verification = await ctx.shadowController.verifyAndRecord(legacyRead.snapshot, {
        expectedChecksum: sync?.checksum || undefined
      });
      const rows = await ctx.recordStore.list(ctx.normalizer.namespace, { includeDeleted: true });
      const reconciliation = ctx.reconciliationApi.reconcileSnapshot(
        ctx.normalizer,
        legacyRead.snapshot,
        rows,
        ctx.metrics.snapshot()
      );
      const ok = verification?.ok === true &&
        verification?.actualChecksum === verification?.expectedChecksum &&
        reconciliationPass(reconciliation);

      validationPasses = ok ? validationPasses + 1 : 0;
      lastValidation = Object.freeze({
        ok,
        stage: stageOf(await ctx.recordStore.getManifest()),
        verification,
        reconciliation,
        passNumber: validationPasses
      });
      ctx.stage = lastValidation.stage;
      emit(ok ? "validation-pass" : "validation-failed", {
        stage: ctx.stage,
        ok,
        reason: ok ? "" : "reconciliation-divergence"
      });
      return lastValidation;
    }

    async function promoteToDualWrite() {
      const ctx = await ensureContext();
      if (!ctx) throw Object.assign(new Error("This account is not in the internal rollout cohort."), { code: "HH_SYNC_NOT_IN_COHORT" });
      const manifest = await ctx.recordStore.getManifest();
      ctx.stage = stageOf(manifest);
      if (ctx.stage === "dual_write") return { ok: true, skipped: true, reason: "already-dual-write" };
      if (ctx.stage !== "shadow") {
        throw Object.assign(new Error("Dual-write promotion requires shadow stage."), { code: "HH_SYNC_SHADOW_STAGE_REQUIRED" });
      }
      if (validationPasses < requiredValidationPasses || lastValidation?.ok !== true) {
        throw Object.assign(
          new Error(`Dual-write promotion requires ${requiredValidationPasses} consecutive successful validation checkpoints.`),
          { code: "HH_SYNC_REPEATED_VALIDATION_REQUIRED" }
        );
      }
      const promoted = await ctx.rolloutControl.promote("dual_write", { userId: ctx.userId });
      try {
        const prepared = await ctx.rolloutControl.prepareWriter({
          userId: ctx.userId,
          writerVersion: WRITER_VERSION,
          namespace: ctx.normalizer.namespace,
          formatVersion: ctx.normalizer.formatVersion
        });
        ctx.stage = stageOf(await ctx.recordStore.getManifest());
        validationPasses = 0;
        emit("promoted-dual-write", { stage: ctx.stage, ok: true });
        return Object.freeze({ ok: true, stage: ctx.stage, promoted, prepared });
      } catch (error) {
        try {
          await ctx.rolloutControl.rollback();
          ctx.stage = stageOf(await ctx.recordStore.getManifest());
          emit("dual-write-prepare-rollback", { stage: ctx.stage, ok: true, reason: error?.code || "writer-prepare-failed" });
        } catch {}
        validationPasses = 0;
        throw error;
      }
    }

    async function rollback() {
      const ctx = await ensureContext();
      if (!ctx) return { ok: true, skipped: true, reason: "not-eligible" };
      const result = await ctx.rolloutControl.rollback();
      ctx.stage = stageOf(await ctx.recordStore.getManifest());
      validationPasses = 0;
      emit("rollback", { stage: ctx.stage, ok: true });
      return result;
    }

    async function checkEligibility() {
      eligibility = await cloud.getNormalizedSyncCohortStatus();
      if (
        eligibility?.eligible !== true ||
        eligibility?.mode !== "allowlist" ||
        eligibility?.percentageEnabled === true ||
        eligibility?.schemaVerified !== true
      ) {
        return Object.freeze({ ...eligibility, active: false });
      }
      await ensureContext();
      return Object.freeze({ ...eligibility, active: Boolean(context) });
    }

    async function start() {
      if (started) return status();
      started = true;

      root?.document?.addEventListener?.("herdharbor:legacy-cloud-commit", () => {
        commitChain = commitChain.then(afterLegacyCommit, afterLegacyCommit);
      });
      root?.document?.addEventListener?.("herdharbor:auth-session", () => {
        context = null;
        eligibility = null;
        validationPasses = 0;
        lastValidation = null;
        void checkEligibility().catch(() => {});
      });

      const session = await cloud.getSession();
      if (session?.user?.id) {
        const decision = await checkEligibility();
        if (decision.active) {
          // Confirm the authoritative legacy snapshot first. The resulting
          // payload-free legacy-commit event is the only trigger that may start
          // shadow/dual-write work.
          await cloud.syncNow();
        }
      }
      return status();
    }

    function status() {
      return Object.freeze({
        version: VERSION,
        release: RELEASE,
        started,
        eligible: eligibility?.eligible === true,
        mode: eligibility?.mode || "allowlist",
        percentageEnabled: eligibility?.percentageEnabled === true,
        schemaVerified: eligibility?.schemaVerified === true,
        stage: context?.stage || "legacy",
        validationPasses,
        requiredValidationPasses,
        lastValidationOk: lastValidation?.ok === true,
        lastResultOk: lastResult?.ok === true
      });
    }

    return Object.freeze({
      version: VERSION,
      release: RELEASE,
      start,
      checkEligibility,
      afterLegacyCommit,
      validateNow,
      promoteToDualWrite,
      rollback,
      status
    });
  }

  function createBrowserRuntime(root) {
    return create({
      root,
      cloud: root.HerdHarborCloud,
      stateStore: root.HerdHarborStateStore,
      indexedDB: root.indexedDB,
      loadDependencies: browserScriptLoader(root),
      telemetryAvailable: () => Boolean(root.HerdHarborMonitoringConfig)
    });
  }

  return Object.freeze({
    version: VERSION,
    release: RELEASE,
    requiredValidationPasses: REQUIRED_VALIDATION_PASSES,
    writerVersion: WRITER_VERSION,
    dependencies: DEPENDENCIES,
    reconciliationPass,
    create,
    createBrowserRuntime
  });
});
