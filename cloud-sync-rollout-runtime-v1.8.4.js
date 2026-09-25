(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.HerdHarborNormalizedSyncRolloutRuntime = api;
    if (root.document && root.HerdHarborCloud && root.HerdHarborStateStore && !root.HerdHarborNormalizedSyncRollout) {
      const instance = api.createBrowserRuntime(root);
      root.HerdHarborNormalizedSyncRollout = instance;
      instance.start().catch((error) => {
        console.warn("HerdHarbor normalized rollout stayed disabled:", error?.code || error?.message || error);
      });
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "1.1-normalized-authority";
  const RELEASE = "1.8.4";
  const REQUIRED_VALIDATION_PASSES = 3;
  const WRITER_VERSION = "record-cas-v1";
  const AUTHORITY_VERSION = "record-authority-v1";
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
    ["hh-normalized-dual-write-v183", "cloud-dual-write-coordinator-v1.8.3.js?v=1"],
    ["hh-normalized-read-fallback-v183", "cloud-normalized-read-fallback-v1.8.3.js?v=1"]
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
        authorityActive: eligibility?.authorityActive === true,
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
        dualWriteApi: m.dualWriteApi || root?.HerdHarborCloudDualWriteCoordinator,
        readApi: m.readApi || root?.HerdHarborCloudNormalizedReadFallback
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
        const recoveryAccess =
          (eligibility?.authorityActive === true && eligibility?.stage === "normalized") ||
          eligibility?.recoveryPending === true;
        if (
          (eligibility?.eligible !== true && !recoveryAccess) ||
          eligibility?.mode !== "allowlist" ||
          eligibility?.percentageEnabled === true ||
          eligibility?.schemaVerified !== true
        ) {
          const reason = eligibility?.percentageEnabled === true
            ? "percentage-rollout-forbidden"
            : eligibility?.schemaVerified !== true
              ? "schema-not-ready"
              : "not-in-internal-cohort";
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
          !m.dualWriteApi?.createDualWriteCoordinator ||
          !m.readApi?.createReadResolver ||
          !m.normalizer?.reassembleAuthoritativeSnapshotWithMetadata
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
        const readResolver = m.readApi.createReadResolver({
          normalizer: m.normalizer,
          getManifest: () => recordStore.getManifest(),
          listNormalizedRows: () => recordStore.list(m.normalizer.namespace, { includeDeleted: true }),
          readLegacySnapshot: async () => {
            const legacy = await cloud.readLegacySnapshotForNormalizedSync();
            return legacy?.snapshot || {};
          },
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
          getMetrics: async () => ({
            ...(lastValidation?.reconciliation || {}),
            ...metrics.snapshot()
          }),
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
          readResolver,
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

    async function refreshContextStage(ctx) {
      const manifest = await ctx.recordStore.getManifest();
      ctx.stage = stageOf(manifest);
      const authorityActive =
        ctx.stage === "normalized" &&
        manifest?.metadata?.normalized_authority_ready === true;
      const recoveryPending =
        manifest?.metadata?.legacy_recovery_lock === true;
      eligibility = {
        ...(eligibility || {}),
        stage: ctx.stage,
        authorityActive,
        recoveryPending
      };
      return { manifest, stage: ctx.stage };
    }

    function isNormalizedAuthority() {
      return Boolean(
        context &&
        eligibility?.authorityActive === true &&
        eligibility?.schemaVerified === true &&
        context.stage === "normalized"
      );
    }

    async function resumeRecoveryRollback(ctx) {
      await refreshContextStage(ctx);
      if (eligibility?.recoveryPending !== true) {
        return Object.freeze({ ok: true, skipped: true, stage: ctx.stage });
      }

      const transitions = [];
      while (ctx.stage !== "legacy") {
        const result = await ctx.rolloutControl.rollback();
        transitions.push(result);
        await refreshContextStage(ctx);
      }
      validationPasses = 0;
      eligibility = {
        ...(eligibility || {}),
        stage: "legacy",
        authorityActive: false,
        recoveryPending: false
      };
      emit("rollback-recovery-resumed", { stage: "legacy", ok: true });
      return Object.freeze({
        ok: true,
        skipped: false,
        stage: "legacy",
        transitions: Object.freeze(transitions)
      });
    }

    async function prepareHydration(options = {}) {
      const ctx = await ensureContext();
      if (!ctx) return Object.freeze({ active: false, authoritative: false, ok: true, stage: "legacy" });

      const { stage } = await refreshContextStage(ctx);
      if (eligibility?.recoveryPending === true) {
        const recovery = await resumeRecoveryRollback(ctx);
        return Object.freeze({
          active: true,
          authoritative: false,
          ok: recovery.ok === true,
          stage: recovery.stage,
          recoveryCompleted: recovery.ok === true,
          recovery
        });
      }
      if (stage !== "normalized") {
        return Object.freeze({ active: true, authoritative: false, ok: true, stage });
      }

      const outbox = stateStore.getOutbox(ctx.userId);
      if (options.legacyDirty === true && outbox.length === 0) {
        const result = Object.freeze({
          active: true,
          authoritative: true,
          ok: false,
          stage,
          reason: "legacy-dirty-without-record-outbox"
        });
        emit("normalized-hydration-blocked", { stage, reason: result.reason });
        return result;
      }

      if (outbox.length > 0) {
        const drain = await ctx.worker.drain({ ownerId: ctx.userId });
        if (Number(drain?.failed || 0) > 0 || stateStore.getOutbox(ctx.userId).length > 0) {
          const result = Object.freeze({
            active: true,
            authoritative: true,
            ok: false,
            stage,
            reason: "pending-normalized-mutations",
            drain
          });
          emit("normalized-hydration-blocked", { stage, reason: result.reason });
          return result;
        }
      }

      const read = await ctx.readResolver.read();
      if (read?.source !== "normalized" || read?.fallback === true) {
        const result = Object.freeze({
          active: true,
          authoritative: true,
          ok: false,
          stage,
          reason: read?.reason || "normalized-read-unavailable",
          read
        });
        emit("normalized-hydration-blocked", { stage, reason: result.reason });
        return result;
      }

      const primed = await ctx.worker.primeBaseline({ force: true });
      if (!primed?.ok) {
        const result = Object.freeze({
          active: true,
          authoritative: true,
          ok: false,
          stage,
          reason: primed?.reason || "normalized-baseline-unavailable",
          read
        });
        emit("normalized-hydration-blocked", { stage, reason: result.reason });
        return result;
      }

      emit("normalized-hydration-ready", { stage, ok: true });
      return Object.freeze({
        active: true,
        authoritative: true,
        ok: true,
        stage,
        snapshot: read.snapshot,
        generation: read.generation,
        checksum: read.checksum,
        checkpointStale: read.checkpointStale === true
      });
    }

    async function syncNormalizedNow() {
      const ctx = await ensureContext();
      if (!ctx) return Object.freeze({ ok: true, skipped: true, reason: "not-eligible" });
      const { stage } = await refreshContextStage(ctx);
      if (stage !== "normalized") {
        return Object.freeze({ ok: true, skipped: true, reason: "normalized-not-authoritative", stage });
      }
      const drain = await ctx.worker.drain({ ownerId: ctx.userId });
      const pending = stateStore.getOutbox(ctx.userId).length;
      const ok = Number(drain?.failed || 0) === 0 && pending === 0;
      const result = Object.freeze({
        ok,
        stage,
        mode: ok ? "normalized-authority" : "normalized-authority-degraded",
        pending,
        drain
      });
      lastResult = result;
      if (!ok) ctx.metrics.record("dualWriteFailures");
      emit(ok ? "normalized-write-complete" : "normalized-write-degraded", {
        stage,
        ok,
        reason: ok ? "" : drain?.reason || "normalized-write-pending"
      });
      return result;
    }

    async function refreshAuthoritative() {
      const ctx = await ensureContext();
      if (!ctx) return Object.freeze({ ok: true, skipped: true, reason: "not-eligible" });
      const { stage } = await refreshContextStage(ctx);
      if (stage !== "normalized") {
        return Object.freeze({ ok: true, skipped: true, reason: "normalized-not-authoritative", stage });
      }

      const beforeRevision = Number(stateStore.getRevision?.(ctx.userId) || 0);
      const sync = await syncNormalizedNow();
      if (!sync.ok) return Object.freeze({ ...sync, source: null });

      const read = await ctx.readResolver.read();
      const afterRevision = Number(stateStore.getRevision?.(ctx.userId) || 0);
      if (
        read?.source !== "normalized" ||
        read?.fallback === true ||
        beforeRevision !== afterRevision ||
        stateStore.getOutbox(ctx.userId).length > 0
      ) {
        const reason = read?.source !== "normalized" || read?.fallback === true
          ? (read?.reason || "normalized-read-unavailable")
          : "local-change-during-normalized-refresh";
        emit("normalized-refresh-skipped", { stage, reason });
        return Object.freeze({
          ok: read?.source === "normalized" && read?.fallback !== true,
          skipped: true,
          stage,
          reason,
          source: read?.source || null
        });
      }

      await ctx.worker.primeBaseline({ force: true });
      emit("normalized-refresh-ready", { stage, ok: true });
      return Object.freeze({
        ok: true,
        skipped: false,
        stage,
        source: "normalized",
        snapshot: read.snapshot,
        generation: read.generation,
        checksum: read.checksum,
        checkpointStale: read.checkpointStale === true
      });
    }

    async function promoteToNormalized() {
      const ctx = await ensureContext();
      if (!ctx) throw Object.assign(new Error("This account is not in the internal rollout cohort."), { code: "HH_SYNC_NOT_IN_COHORT" });
      const { stage } = await refreshContextStage(ctx);
      if (stage === "normalized") return Object.freeze({ ok: true, skipped: true, reason: "already-normalized", stage });
      if (stage !== "dual_write") {
        throw Object.assign(new Error("Normalized authority promotion requires dual-write stage."), { code: "HH_SYNC_DUAL_WRITE_STAGE_REQUIRED" });
      }
      if (validationPasses < requiredValidationPasses || lastValidation?.ok !== true || lastValidation?.stage !== "dual_write") {
        throw Object.assign(
          new Error(`Normalized authority promotion requires ${requiredValidationPasses} consecutive successful dual-write validation checkpoints.`),
          { code: "HH_SYNC_REPEATED_VALIDATION_REQUIRED" }
        );
      }
      if (stateStore.getOutbox(ctx.userId).length > 0) {
        throw Object.assign(new Error("Normalized authority promotion requires an empty record outbox."), { code: "HH_SYNC_PENDING_MUTATIONS" });
      }

      const rows = await ctx.recordStore.list(ctx.normalizer.namespace, { includeDeleted: true });
      const preview = ctx.normalizer.reassembleAuthoritativeSnapshotWithMetadata(rows);
      if (preview.checkpointStale) {
        throw Object.assign(new Error("Normalized authority promotion requires a current verified checkpoint."), { code: "HH_SYNC_STAGE_VERIFICATION_REQUIRED" });
      }

      const activated = await ctx.rolloutControl.activateAuthority({
        userId: ctx.userId,
        writerVersion: WRITER_VERSION,
        namespace: ctx.normalizer.namespace,
        formatVersion: ctx.normalizer.formatVersion,
        authorityVersion: AUTHORITY_VERSION
      });
      await refreshContextStage(ctx);

      try {
        const read = await ctx.readResolver.read();
        if (ctx.stage !== "normalized" || read?.source !== "normalized" || read?.fallback === true) {
          throw Object.assign(new Error("Normalized authority read verification failed immediately after cutover."), {
            code: "HH_SYNC_NORMALIZED_READ_VERIFY_FAILED"
          });
        }
        await ctx.worker.primeBaseline({ force: true });
        validationPasses = 0;
        emit("promoted-normalized", { stage: ctx.stage, ok: true });
        return Object.freeze({ ok: true, stage: ctx.stage, activated, read });
      } catch (error) {
        try {
          const manifest = await ctx.recordStore.getManifest();
          const generation = Number(manifest?.sync_generation ?? manifest?.syncGeneration);
          if (stageOf(manifest) === "normalized" && Number.isSafeInteger(generation) && generation >= 0) {
            await ctx.recordStore.materializeLegacyRecovery({
              snapshot: preview.snapshot,
              expectedGeneration: generation
            });
            await refreshContextStage(ctx);
            while (ctx.stage !== "legacy") {
              await ctx.rolloutControl.rollback();
              await refreshContextStage(ctx);
            }
          }
        } catch {}
        validationPasses = 0;
        throw error;
      }
    }

    async function rollbackToLegacy() {
      const ctx = await ensureContext();
      if (!ctx) return Object.freeze({ ok: true, skipped: true, reason: "not-eligible" });
      await refreshContextStage(ctx);
      let recovery = null;

      if (ctx.stage === "normalized") {
        const sync = await syncNormalizedNow();
        if (!sync.ok) {
          throw Object.assign(new Error("Rollback blocked while normalized mutations are still pending."), {
            code: "HH_SYNC_ROLLBACK_PENDING_MUTATIONS"
          });
        }
        const read = await ctx.readResolver.read();
        if (read?.source !== "normalized" || read?.fallback === true) {
          throw Object.assign(new Error("Rollback blocked because normalized authority could not be read safely."), {
            code: "HH_SYNC_ROLLBACK_READ_REQUIRED"
          });
        }
        const manifest = await ctx.recordStore.getManifest();
        const generation = Number(manifest?.sync_generation ?? manifest?.syncGeneration);
        if (!Number.isSafeInteger(generation) || generation < 0) {
          throw Object.assign(new Error("Rollback blocked because manifest generation is missing."), {
            code: "HH_SYNC_ROLLBACK_BLOCKED"
          });
        }
        recovery = await ctx.recordStore.materializeLegacyRecovery({
          snapshot: read.snapshot,
          expectedGeneration: generation
        });
      }

      const transitions = [];
      while (ctx.stage !== "legacy") {
        const result = await ctx.rolloutControl.rollback();
        transitions.push(result);
        await refreshContextStage(ctx);
      }
      validationPasses = 0;
      emit("rollback-legacy-complete", { stage: ctx.stage, ok: true });
      return Object.freeze({
        ok: true,
        stage: ctx.stage,
        recovery,
        transitions: Object.freeze(transitions)
      });
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
      await refreshContextStage(ctx);
      if (ctx.stage === "normalized") {
        return rollbackToLegacy();
      }
      const result = await ctx.rolloutControl.rollback();
      await refreshContextStage(ctx);
      validationPasses = 0;
      emit("rollback", { stage: ctx.stage, ok: true });
      return result;
    }

    async function checkEligibility() {
      eligibility = await cloud.getNormalizedSyncCohortStatus();
      const recoveryAccess =
        (eligibility?.authorityActive === true && eligibility?.stage === "normalized") ||
        eligibility?.recoveryPending === true;
      if (
        (eligibility?.eligible !== true && !recoveryAccess) ||
        eligibility?.mode !== "allowlist" ||
        eligibility?.percentageEnabled === true ||
        eligibility?.schemaVerified !== true
      ) {
        return Object.freeze({ ...eligibility, active: false });
      }
      const ctx = await ensureContext();
      if (ctx) await refreshContextStage(ctx);
      return Object.freeze({
        ...eligibility,
        stage: ctx?.stage || eligibility?.stage || "legacy",
        authorityActive: isNormalizedAuthority(),
        recoveryPending: eligibility?.recoveryPending === true,
        active: Boolean(context)
      });
    }

    async function start(startOptions = {}) {
      if (started) return status();
      started = true;

      root?.document?.addEventListener?.("herdharbor:legacy-cloud-commit", () => {
        commitChain = commitChain.then(afterLegacyCommit, afterLegacyCommit);
      });
      root?.document?.addEventListener?.("herdharbor:auth-session", () => {
        const currentUserId = safeText(cloud.getSession?.()?.user?.id);
        if (context && currentUserId && context.userId === currentUserId) {
          void cloud.getNormalizedSyncCohortStatus()
            .then((next) => { eligibility = next; })
            .catch(() => {});
          return;
        }
        context = null;
        eligibility = null;
        validationPasses = 0;
        lastValidation = null;
        if (currentUserId) void checkEligibility().catch(() => {});
      });

      const session = await cloud.getSession();
      if (session?.user?.id) {
        const decision = await checkEligibility();
        if (
          decision.active &&
          decision.recoveryPending !== true &&
          startOptions.confirmLegacy !== false &&
          context?.stage !== "normalized"
        ) {
          // Confirm legacy only during forward shadow/dual-write validation.
          // A pending rollback must be resumed by prepareHydration() before
          // either cloud writer is allowed to run again.
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
        recoveryPending: eligibility?.recoveryPending === true,
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
      prepareHydration,
      syncNormalizedNow,
      refreshAuthoritative,
      isNormalizedAuthority,
      validateNow,
      promoteToDualWrite,
      promoteToNormalized,
      rollback,
      rollbackToLegacy,
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
      telemetryAvailable: () => {
        try {
          const status = root.HerdHarborMonitoring?.getStatus?.();
          return status?.initialized === true && status?.enabled === true;
        } catch {
          return false;
        }
      }
    });
  }

  return Object.freeze({
    version: VERSION,
    release: RELEASE,
    requiredValidationPasses: REQUIRED_VALIDATION_PASSES,
    writerVersion: WRITER_VERSION,
    authorityVersion: AUTHORITY_VERSION,
    dependencies: DEPENDENCIES,
    reconciliationPass,
    create,
    createBrowserRuntime
  });
});
