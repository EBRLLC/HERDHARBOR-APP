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

  const VERSION = "1.3-normalized-primary-cutover";
  const RELEASE = "1.8.4";
  const REQUIRED_VALIDATION_PASSES = 3;
  const WRITER_VERSION = "record-cas-v1";
  const AUTHORITY_VERSION = "record-authority-v1";
  const DEPENDENCIES = Object.freeze([
    ["hh-normalized-record-store-v183", "cloud-record-store-v1.8.3.js?v=2"],
    ["hh-normalized-state-mapper-v183", "cloud-state-normalizer-v1.8.3.js?v=1"],
    ["hh-normalized-record-baseline-v184", "cloud-record-baseline-v1.8.4.js?v=1"],
    ["hh-normalized-record-worker-v184", "cloud-record-outbox-worker-v1.8.4.js?v=2"],
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
        let node = root.document.getElementById(id);
        if (node?.dataset?.hhFailed === "1") {
          node.remove?.();
          node = null;
        }
        if (node?.dataset?.hhLoaded === "1" || node?.readyState === "complete") {
          resolve();
          return;
        }
        const existing = Boolean(node);
        if (!node) {
          node = root.document.createElement("script");
          node.id = id;
          node.src = src;
          node.async = false;
        }
        let settled = false;
        let timeoutId = null;
        const finish = (ok) => {
          if (settled) return;
          settled = true;
          if (timeoutId != null) root.clearTimeout?.(timeoutId);
          node.removeEventListener?.("load", onLoad);
          node.removeEventListener?.("error", onError);
          if (ok) {
            if (node.dataset) node.dataset.hhLoaded = "1";
            resolve();
          } else {
            if (node.dataset) node.dataset.hhFailed = "1";
            node.remove?.();
            reject(new Error(`Could not load ${src}; retry normalized synchronization when connected.`));
          }
        };
        const onLoad = () => finish(true);
        const onError = () => finish(false);
        node.addEventListener("load", onLoad, { once: true });
        node.addEventListener("error", onError, { once: true });
        timeoutId = root.setTimeout?.(() => finish(false), 15000) ?? null;
        if (!existing) target.appendChild(node);
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
    let setupUserId = "";
    let identityEpoch = 0;
    let commitChain = Promise.resolve();
    let validationPasses = 0;
    let lastValidation = null;
    let lastResult = null;

    function invalidateAccountContext() {
      identityEpoch += 1;
      context = null;
      setupPromise = null;
      setupUserId = "";
      eligibility = null;
      validationPasses = 0;
      lastValidation = null;
      lastResult = null;
    }

    function assertAccountCurrent(userId, epoch) {
      if (identityEpoch !== epoch || safeText(cloud.getSession?.()?.user?.id) !== userId) {
        throw Object.assign(new Error("Authenticated account changed during normalized sync initialization."), {
          code: "HH_SYNC_ACCOUNT_CHANGED"
        });
      }
    }

    // A completed context can outlive its authentication session if a cloud
    // operation was already awaiting a response. Never hand its data or
    // baseline state to a later session, including rapid A->B->A switches.
    function assertContextCurrent(ctx) {
      if (!ctx || context !== ctx || ctx.identityEpoch !== identityEpoch || safeText(cloud.getSession?.()?.user?.id) !== ctx.userId) {
        throw Object.assign(new Error("Authenticated account changed during normalized synchronization."), {
          code: "HH_SYNC_ACCOUNT_CHANGED"
        });
      }
    }

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

    async function rollbackAvailable(userId = safeText(cloud.getSession?.()?.user?.id), epoch = identityEpoch) {
      try {
        assertAccountCurrent(userId, epoch);
        const legacy = await cloud.readLegacySnapshotForNormalizedSync(userId);
        assertAccountCurrent(userId, epoch);
        return Boolean(legacy?.snapshot && typeof legacy.snapshot === "object");
      } catch {
        return false;
      }
    }

    async function ensureContext() {
      const liveUserId = safeText(cloud.getSession?.()?.user?.id);
      if (context && context.userId !== liveUserId) invalidateAccountContext();
      if (context) return context;
      if (setupPromise && setupUserId !== liveUserId) invalidateAccountContext();
      if (setupPromise) return setupPromise;
      const epoch = identityEpoch;
      setupUserId = liveUserId;
      const pending = (async () => {
        const session = await cloud.getSession();
        const userId = safeText(session?.user?.id);
        assertAccountCurrent(userId, epoch);
        if (!userId) throw Object.assign(new Error("A signed-in session is required."), { code: "HH_SYNC_NO_SESSION" });

        const cohortStatus = await cloud.getNormalizedSyncCohortStatus();
        assertAccountCurrent(userId, epoch);
        eligibility = cohortStatus;
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
        assertAccountCurrent(userId, epoch);
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

        assertAccountCurrent(userId, epoch);
        const recordStore = cloud.createNormalizedRecordStore(userId);
        const baselineStore = m.baselineApi.createIndexedDbStore({
          ownerId: userId,
          indexedDB
        });
        const worker = m.workerApi.create({
          stateStore,
          recordStore,
          normalizer: m.normalizer,
          baselineStore,
          writerVersion: WRITER_VERSION,
          readAuthoritativeLegacySnapshot: () => {
            assertAccountCurrent(userId, epoch);
            return cloud.readLegacySnapshotForNormalizedSync(userId);
          }
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
          getSession: () => {
            assertAccountCurrent(userId, epoch);
            return cloud.getSession();
          },
          readLegacySnapshot: () => {
            assertAccountCurrent(userId, epoch);
            return cloud.readLegacySnapshotForNormalizedSync(userId);
          },
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
            assertAccountCurrent(userId, epoch);
            const legacy = await cloud.readLegacySnapshotForNormalizedSync(userId);
            assertAccountCurrent(userId, epoch);
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
          rollbackAvailable: () => rollbackAvailable(userId, epoch)
        });

        const manifest = await recordStore.getManifest();
        assertAccountCurrent(userId, epoch);
        context = {
          userId,
          identityEpoch: epoch,
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
          stage: stageOf(manifest)
        };
        emit("rollout-ready", { stage: context.stage, ok: true });
        return context;
      })();
      setupPromise = pending;
      try {
        return await pending;
      } finally {
        if (setupPromise === pending) {
          setupPromise = null;
          setupUserId = "";
        }
      }
    }

    async function bootstrapIfNeeded(ctx) {
      assertContextCurrent(ctx);
      const manifest = await ctx.recordStore.getManifest();
      assertContextCurrent(ctx);
      const stage = stageOf(manifest);
      ctx.stage = stage;
      if (stage !== "legacy") return { ok: true, skipped: true, stage };

      assertContextCurrent(ctx);
      const result = await ctx.bootstrap.run();
      assertContextCurrent(ctx);
      const after = await ctx.recordStore.getManifest();
      assertContextCurrent(ctx);
      ctx.stage = stageOf(after);
      if (result?.verified !== true || ctx.stage !== "shadow") {
        validationPasses = 0;
        emit("shadow-bootstrap-incomplete", { stage: ctx.stage, reason: result?.reason || "not-verified" });
        return { ok: false, stage: ctx.stage, result };
      }
      emit("shadow-bootstrap-verified", { stage: ctx.stage, ok: true });
      return { ok: true, stage: ctx.stage, result };
    }

    async function reconcileDualWriteFromLegacyAuthority(ctx, degradedResult) {
      assertContextCurrent(ctx);
      const pendingBefore = stateStore.getOutbox(ctx.userId);
      if (!Array.isArray(pendingBefore)) return degradedResult;
      if (typeof stateStore.acknowledgeMutations !== "function") return degradedResult;

      assertContextCurrent(ctx);
      const legacyRead = await cloud.readLegacySnapshotForNormalizedSync(ctx.userId);
      assertContextCurrent(ctx);
      const authoritative = ctx.normalizer.mapLegacySnapshot(legacyRead.snapshot);
      const local = ctx.normalizer.mapLegacySnapshot(stateStore.getState());

      // The fallback is safe only while the local device still represents the
      // exact legacy snapshot that just committed. If another local edit is
      // already ahead of legacy, leave its mutations pending for the next
      // legacy commit rather than pushing unsaved state into normalized data.
      if (String(authoritative?.checksum || "") !== String(local?.checksum || "")) {
        emit("dual-write-authority-reconcile-skipped", {
          stage: ctx.stage,
          reason: "local-state-ahead-of-legacy",
          pending: pendingBefore.length
        });
        return {
          ...degradedResult,
          authoritativeLegacyReconcile: {
            ok: false,
            skipped: true,
            reason: "local-state-ahead-of-legacy"
          }
        };
      }

      const coveredMutationIds = pendingBefore
        .map((entry) => String(entry?.mutationId || ""))
        .filter(Boolean);

      try {
        const beforeRows = await ctx.recordStore.list(ctx.normalizer.namespace, { includeDeleted: true });
        assertContextCurrent(ctx);
        const sync = await ctx.shadowController.sync(legacyRead.snapshot, {
          previousRows: beforeRows,
          legacySnapshotUpdatedAt: legacyRead.updatedAt || undefined
        });
        assertContextCurrent(ctx);
        const verification = await ctx.shadowController.verifyAndRecord(legacyRead.snapshot, {
          expectedChecksum: sync?.checksum || authoritative?.checksum || undefined
        });
        assertContextCurrent(ctx);
        const rows = await ctx.recordStore.list(ctx.normalizer.namespace, { includeDeleted: true });
        assertContextCurrent(ctx);
        const reconciliation = ctx.reconciliationApi.reconcileSnapshot(
          ctx.normalizer,
          legacyRead.snapshot,
          rows,
          ctx.metrics.snapshot()
        );
        const repaired =
          verification?.ok === true &&
          verification?.actualChecksum === verification?.expectedChecksum &&
          reconciliationPass(reconciliation);

        if (!repaired) {
          emit("dual-write-authority-reconcile-failed", {
            stage: ctx.stage,
            reason: "verification-divergence"
          });
          return {
            ...degradedResult,
            authoritativeLegacyReconcile: {
              ok: false,
              skipped: false,
              reason: "verification-divergence",
              verification,
              reconciliation
            }
          };
        }

        assertContextCurrent(ctx);
        if (coveredMutationIds.length) {
          stateStore.acknowledgeMutations(coveredMutationIds, ctx.userId);
        }

        // The shadow reconciliation may have advanced normalized record
        // versions. Refresh the durable CAS baseline before the next edit.
        const primed = await ctx.worker.primeBaseline({ force: true });
        assertContextCurrent(ctx);
        const remaining = stateStore.getOutbox(ctx.userId).length;
        const ok = remaining === 0 && primed?.ok !== false;

        emit(ok ? "dual-write-authority-reconciled" : "dual-write-authority-reconcile-pending", {
          stage: ctx.stage,
          ok,
          pending: remaining
        });

        return {
          ok,
          mode: ok ? "dual-write" : "dual-write-degraded",
          legacySaved: true,
          normalizedSaved: true,
          normalizedCurrent: true,
          normalizedVerified: true,
          normalizedPending: remaining > 0 || primed?.ok === false,
          verificationPending: false,
          normalizedPendingCount: remaining,
          normalizedErrorCode: ok ? null : "HH_SYNC_RECORD_RETRY_PENDING",
          normalizedResult: degradedResult?.normalizedResult || null,
          legacyResult: degradedResult?.legacyResult || null,
          authoritativeLegacyReconcile: {
            ok: true,
            skipped: false,
            checksum: verification?.actualChecksum || authoritative?.checksum || null,
            reconciliation,
            coveredMutations: coveredMutationIds.length,
            remaining,
            baselinePrimed: primed?.ok !== false
          }
        };
      } catch (error) {
        if (error?.code === "HH_SYNC_ACCOUNT_CHANGED") throw error;
        assertContextCurrent(ctx);
        emit("dual-write-authority-reconcile-failed", {
          stage: ctx.stage,
          reason: error?.code || error?.message || "unknown"
        });
        return {
          ...degradedResult,
          authoritativeLegacyReconcile: {
            ok: false,
            skipped: false,
            reason: error?.code || "authoritative-legacy-reconcile-failed"
          }
        };
      }
    }

    async function afterLegacyCommit(options = {}) {
      const ctx = await ensureContext();
      if (!ctx) return { ok: true, skipped: true, reason: "not-eligible" };
      assertContextCurrent(ctx);

      const boot = await bootstrapIfNeeded(ctx);
      assertContextCurrent(ctx);
      if (!boot.ok) return boot;

      const manifest = await ctx.recordStore.getManifest();
      assertContextCurrent(ctx);
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
        assertContextCurrent(ctx);
        const normalizedErrorCode = String(result?.normalizedErrorCode || "");
        const conflictLikeDegradation =
          Number(result?.normalizedConflicts || 0) > 0 ||
          normalizedErrorCode === "HH_SYNC_RECORD_CONFLICT" ||
          normalizedErrorCode === "HH_SYNC_RECORD_RETRY_PENDING" ||
          normalizedErrorCode === "HH_SYNC_CONFLICT" ||
          normalizedErrorCode === "HH_SYNC_CONFLICT_RETRY";
        const noNormalizedWork =
          result?.mode === "dual-write" &&
          result?.normalizedPending !== true &&
          Number(result?.normalizedResult?.processed || 0) === 0 &&
          Number(result?.normalizedResult?.pending || 0) === 0;
        if (
          result?.legacySaved === true &&
          (
            conflictLikeDegradation ||
            (options?.ensureCurrent === true && noNormalizedWork)
          )
        ) {
          result = await reconcileDualWriteFromLegacyAuthority(ctx, result);
          assertContextCurrent(ctx);
        }
      } else {
        const normalizedResult = await ctx.worker.drain({ ownerId: ctx.userId });
        assertContextCurrent(ctx);
        result = {
          ok: normalizedResult?.failed === 0,
          mode: "shadow-record-write",
          legacySaved: true,
          normalizedSaved: Number(normalizedResult?.succeeded || 0) > 0,
          normalizedPending:
            normalizedResult?.skipped === true ||
            Number(normalizedResult?.failed || 0) > 0 ||
            Number(normalizedResult?.pending || 0) > 0,
          normalizedResult
        };
        if (!result.ok) ctx.metrics.record("dualWriteFailures");
      }
      assertContextCurrent(ctx);
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
      assertContextCurrent(ctx);
      const boot = await bootstrapIfNeeded(ctx);
      assertContextCurrent(ctx);
      if (!boot.ok) return boot;

      assertContextCurrent(ctx);
      const drain = await ctx.worker.drain({ ownerId: ctx.userId });
      assertContextCurrent(ctx);
      if (Number(drain?.failed || 0) > 0 || stateStore.getOutbox(ctx.userId).length > 0) {
        assertContextCurrent(ctx);
        validationPasses = 0;
        const result = { ok: false, reason: "pending-normalized-mutations", drain };
        lastValidation = result;
        emit("validation-failed", { stage: ctx.stage, reason: result.reason });
        return result;
      }

      assertContextCurrent(ctx);
      const legacyRead = await cloud.readLegacySnapshotForNormalizedSync(ctx.userId);
      assertContextCurrent(ctx);
      const beforeRows = await ctx.recordStore.list(ctx.normalizer.namespace, { includeDeleted: true });
      assertContextCurrent(ctx);
      const sync = await ctx.shadowController.sync(legacyRead.snapshot, {
        previousRows: beforeRows,
        legacySnapshotUpdatedAt: legacyRead.updatedAt || undefined
      });
      assertContextCurrent(ctx);
      const verification = await ctx.shadowController.verifyAndRecord(legacyRead.snapshot, {
        expectedChecksum: sync?.checksum || undefined
      });
      assertContextCurrent(ctx);
      const rows = await ctx.recordStore.list(ctx.normalizer.namespace, { includeDeleted: true });
      assertContextCurrent(ctx);
      const reconciliation = ctx.reconciliationApi.reconcileSnapshot(
        ctx.normalizer,
        legacyRead.snapshot,
        rows,
        ctx.metrics.snapshot()
      );
      assertContextCurrent(ctx);
      const ok = verification?.ok === true &&
        verification?.actualChecksum === verification?.expectedChecksum &&
        reconciliationPass(reconciliation);

      assertContextCurrent(ctx);
      const manifest = await ctx.recordStore.getManifest();
      assertContextCurrent(ctx);
      const stage = stageOf(manifest);
      assertContextCurrent(ctx);
      validationPasses = ok ? validationPasses + 1 : 0;
      lastValidation = Object.freeze({
        ok,
        stage,
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
      assertContextCurrent(ctx);
      const manifest = await ctx.recordStore.getManifest();
      assertContextCurrent(ctx);
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
      assertContextCurrent(ctx);
      assertContextCurrent(ctx);
      if (eligibility?.recoveryPending !== true) {
        return Object.freeze({ ok: true, skipped: true, stage: ctx.stage });
      }

      const transitions = [];
      while (ctx.stage !== "legacy") {
        assertContextCurrent(ctx);
        const result = await ctx.rolloutControl.rollback();
        assertContextCurrent(ctx);
        transitions.push(result);
        await refreshContextStage(ctx);
        assertContextCurrent(ctx);
      }
      assertContextCurrent(ctx);
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

    async function advanceToDualWriteForCleanHydration(ctx) {
      assertContextCurrent(ctx);
      const current = await refreshContextStage(ctx);
      if (current.stage === "dual_write" || current.stage === "normalized") {
        return Object.freeze({ ok: true, skipped: true, stage: current.stage, reason: "already-advanced" });
      }
      if (current.stage !== "legacy" && current.stage !== "shadow") {
        return Object.freeze({ ok: true, skipped: true, stage: current.stage, reason: "stage-not-eligible" });
      }

      const boot = await bootstrapIfNeeded(ctx);
      assertContextCurrent(ctx);
      if (!boot?.ok) {
        validationPasses = 0;
        lastValidation = null;
        return Object.freeze({
          ok: false,
          skipped: false,
          stage: ctx.stage,
          reason: boot?.reason || "shadow-bootstrap-incomplete",
          bootstrap: boot
        });
      }

      await refreshContextStage(ctx);
      while (ctx.stage === "shadow" && validationPasses < requiredValidationPasses) {
        assertContextCurrent(ctx);
        const validation = await validateNow();
        assertContextCurrent(ctx);
        if (validation?.ok !== true) {
          return Object.freeze({
            ok: false,
            skipped: false,
            stage: ctx.stage,
            reason: validation?.reason || "validation-failed",
            validation
          });
        }
        await refreshContextStage(ctx);
      }

      if (ctx.stage !== "shadow") {
        return Object.freeze({ ok: true, skipped: true, stage: ctx.stage, reason: "stage-changed-during-validation" });
      }

      assertContextCurrent(ctx);
      const promotion = await promoteToDualWrite();
      assertContextCurrent(ctx);
      return Object.freeze({
        ok: promotion?.ok === true,
        skipped: false,
        stage: promotion?.stage || ctx.stage,
        validationCheckpoints: requiredValidationPasses,
        promotion
      });
    }

    async function prepareHydration(options = {}) {
      const ctx = await ensureContext();
      if (!ctx) return Object.freeze({ active: false, authoritative: false, ok: true, stage: "legacy" });
      assertContextCurrent(ctx);

      const { stage } = await refreshContextStage(ctx);
      assertContextCurrent(ctx);
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
        if (options.legacyDirty !== true && (stage === "legacy" || stage === "shadow")) {
          try {
            const expansion = await advanceToDualWriteForCleanHydration(ctx);
            const current = await refreshContextStage(ctx);
            if (expansion?.ok === true && expansion?.skipped !== true && current.stage === "dual_write") {
              emit("dual-write-expansion-complete", { stage: current.stage, ok: true });
            } else if (expansion?.ok !== true) {
              emit("dual-write-expansion-deferred", {
                stage: current.stage,
                ok: false,
                reason: expansion?.reason || "validation-incomplete"
              });
            }
            return Object.freeze({
              active: true,
              authoritative: false,
              ok: true,
              stage: current.stage,
              dualWriteExpansion: expansion
            });
          } catch (error) {
            if (error?.code === "HH_SYNC_ACCOUNT_CHANGED") throw error;
            assertContextCurrent(ctx);
            validationPasses = 0;
            lastValidation = null;
            const current = await refreshContextStage(ctx);
            emit("dual-write-expansion-deferred", {
              stage: current.stage,
              ok: false,
              reason: error?.code || error?.message || "dual-write-expansion-failed"
            });
            return Object.freeze({
              active: true,
              authoritative: false,
              ok: true,
              stage: current.stage,
              dualWriteExpansion: Object.freeze({
                ok: false,
                skipped: false,
                stage: current.stage,
                reason: error?.code || "dual-write-expansion-failed"
              })
            });
          }
        }
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
        assertContextCurrent(ctx);
        const drain = await ctx.worker.drain({ ownerId: ctx.userId });
        assertContextCurrent(ctx);
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

      assertContextCurrent(ctx);
      const read = await ctx.readResolver.read();
      assertContextCurrent(ctx);
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

      assertContextCurrent(ctx);
      const primed = await ctx.worker.primeBaseline({ force: true });
      assertContextCurrent(ctx);
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

    async function refreshDualWriteBaseline() {
      const ctx = await ensureContext();
      if (!ctx) return Object.freeze({ ok: true, skipped: true, reason: "not-eligible", stage: "legacy" });

      const { stage } = await refreshContextStage(ctx);
      if (stage !== "dual_write") {
        return Object.freeze({ ok: true, skipped: true, reason: "not-dual-write", stage });
      }

      assertContextCurrent(ctx);
      const pending = stateStore.getOutbox(ctx.userId).length;
      if (pending > 0) {
        validationPasses = 0;
        lastValidation = null;
        const result = Object.freeze({
          ok: false,
          skipped: true,
          stage,
          reason: "pending-normalized-mutations",
          pending
        });
        emit("dual-write-baseline-refresh-blocked", {
          stage,
          reason: result.reason
        });
        return result;
      }

      assertContextCurrent(ctx);
      const primed = await ctx.worker.primeBaseline({ force: true });
      assertContextCurrent(ctx);
      if (!primed?.ok) {
        validationPasses = 0;
        lastValidation = null;
        const result = Object.freeze({
          ok: false,
          skipped: primed?.skipped === true,
          stage,
          reason: primed?.reason || "normalized-baseline-unavailable"
        });
        emit("dual-write-baseline-refresh-blocked", {
          stage,
          reason: result.reason
        });
        return result;
      }

      validationPasses = 0;
      lastValidation = null;
      const generation = Number(
        primed?.manifest?.sync_generation ??
        primed?.manifest?.syncGeneration
      );
      emit("dual-write-baseline-refreshed", { stage, ok: true });
      return Object.freeze({
        ok: true,
        skipped: false,
        stage,
        rows: Number(primed?.rows || 0),
        generation: Number.isSafeInteger(generation) ? generation : null
      });
    }

    async function syncNormalizedNow() {
      const ctx = await ensureContext();
      if (!ctx) return Object.freeze({ ok: true, skipped: true, reason: "not-eligible" });
      assertContextCurrent(ctx);
      const { stage } = await refreshContextStage(ctx);
      if (stage !== "normalized") {
        return Object.freeze({ ok: true, skipped: true, reason: "normalized-not-authoritative", stage });
      }
      assertContextCurrent(ctx);
      const drain = await ctx.worker.drain({ ownerId: ctx.userId });
      assertContextCurrent(ctx);
      const pending = stateStore.getOutbox(ctx.userId).length;
      // A skipped or failed drain is NOT confirmation of a successful cloud
      // save. In particular offline() returns { ok:true, skipped:true } and
      // may contain zero pending records when an explicit refresh is requested.
      // Never report an authoritative save merely because failed===0.
      const drainCompleted = drain?.ok === true && drain?.skipped !== true &&
        drain?.stage === "normalized";
      const ok = drainCompleted &&
        Number(drain?.failed || 0) === 0 && pending === 0;
      const result = Object.freeze({
        ok,
        stage,
        mode: ok ? "normalized-authority" : "normalized-authority-degraded",
        reason: ok ? null : String(drain?.reason || (pending > 0 ? "normalized-mutations-pending" : "normalized-write-not-confirmed")),
        pending,
        drain
      });
      assertContextCurrent(ctx);
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
      assertContextCurrent(ctx);
      const { stage } = await refreshContextStage(ctx);
      if (stage !== "normalized") {
        return Object.freeze({ ok: true, skipped: true, reason: "normalized-not-authoritative", stage });
      }

      const beforeRevision = Number(stateStore.getRevision?.(ctx.userId) || 0);
      const sync = await syncNormalizedNow();
      assertContextCurrent(ctx);
      if (!sync.ok) return Object.freeze({ ...sync, source: null });

      assertContextCurrent(ctx);
      const read = await ctx.readResolver.read();
      assertContextCurrent(ctx);
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

      assertContextCurrent(ctx);
      await ctx.worker.primeBaseline({ force: true });
      assertContextCurrent(ctx);
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
      assertContextCurrent(ctx);
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

      assertContextCurrent(ctx);
      const rows = await ctx.recordStore.list(ctx.normalizer.namespace, { includeDeleted: true });
      assertContextCurrent(ctx);
      const preview = ctx.normalizer.reassembleAuthoritativeSnapshotWithMetadata(rows);
      if (preview.checkpointStale) {
        throw Object.assign(new Error("Normalized authority promotion requires a current verified checkpoint."), { code: "HH_SYNC_STAGE_VERIFICATION_REQUIRED" });
      }

      assertContextCurrent(ctx);
      const activated = await ctx.rolloutControl.activateAuthority({
        userId: ctx.userId,
        writerVersion: WRITER_VERSION,
        namespace: ctx.normalizer.namespace,
        formatVersion: ctx.normalizer.formatVersion,
        authorityVersion: AUTHORITY_VERSION
      });
      assertContextCurrent(ctx);
      await refreshContextStage(ctx);

      try {
        assertContextCurrent(ctx);
        const read = await ctx.readResolver.read();
        assertContextCurrent(ctx);
        if (ctx.stage !== "normalized" || read?.source !== "normalized" || read?.fallback === true) {
          throw Object.assign(new Error("Normalized authority read verification failed immediately after cutover."), {
            code: "HH_SYNC_NORMALIZED_READ_VERIFY_FAILED"
          });
        }
        assertContextCurrent(ctx);
        await ctx.worker.primeBaseline({ force: true });
        assertContextCurrent(ctx);
        validationPasses = 0;
        emit("promoted-normalized", { stage: ctx.stage, ok: true });
        return Object.freeze({ ok: true, stage: ctx.stage, activated, read });
      } catch (error) {
        if (error?.code === "HH_SYNC_ACCOUNT_CHANGED") throw error;
        try {
          assertContextCurrent(ctx);
          const manifest = await ctx.recordStore.getManifest();
          assertContextCurrent(ctx);
          const generation = Number(manifest?.sync_generation ?? manifest?.syncGeneration);
          if (stageOf(manifest) === "normalized" && Number.isSafeInteger(generation) && generation >= 0) {
            assertContextCurrent(ctx);
            await ctx.recordStore.materializeLegacyRecovery({
              snapshot: preview.snapshot,
              expectedGeneration: generation
            });
            assertContextCurrent(ctx);
            await refreshContextStage(ctx);
            while (ctx.stage !== "legacy") {
              assertContextCurrent(ctx);
              await ctx.rolloutControl.rollback();
              assertContextCurrent(ctx);
              await refreshContextStage(ctx);
            }
          }
        } catch {}
        assertContextCurrent(ctx);
        validationPasses = 0;
        throw error;
      }
    }

    // S18: Explicit, fail-closed transition from dual-write to normalized-first.
    // Never enable normalized writes just because the account is allowlisted:
    // the installed clients, durable backups, and server-side checkpoint must
    // all be verified before the legacy authority is retired.
    async function cutoverToNormalizedPrimary(options = {}) {
      if (
        options.ownerApproved !== true ||
        options.legacyClientsClosed !== true ||
        options.backupVerified !== true
      ) {
        return Object.freeze({ ok: false, reason: "normalized-cutover-owner-acceptance-required" });
      }
      const ctx = await ensureContext();
      if (!ctx) return Object.freeze({ ok: false, reason: "normalized-cutover-not-eligible" });
      assertContextCurrent(ctx);
      const current = await refreshContextStage(ctx);
      assertContextCurrent(ctx);
      if (current.stage === "normalized") {
        return Object.freeze({ ok: true, skipped: true, stage: "normalized", reason: "already-normalized" });
      }
      if (current.stage !== "dual_write") {
        return Object.freeze({ ok: false, stage: current.stage, reason: "normalized-cutover-dual-write-required" });
      }
      const clean = () => (
        cloud.getSession?.()?.user?.id === ctx.userId &&
        cloud.getSyncDetails?.()?.online !== false &&
        cloud.getSyncDetails?.()?.syncing !== true &&
        cloud.hasUnsyncedChanges?.() === false &&
        cloud.hasConflict?.() === false &&
        stateStore.getOutbox(ctx.userId).length === 0
      );
      if (!clean()) {
        return Object.freeze({ ok: false, stage: ctx.stage, reason: "normalized-cutover-local-work-pending" });
      }
      // Even a clean local outbox cannot prove there is no in-memory draft.
      // The acceptance process must close all older installed app clients.
      const initialRevision = Number(stateStore.getRevision?.(ctx.userId) || 0);
      validationPasses = 0;
      lastValidation = null;
      for (let checkpoint = 0; checkpoint < requiredValidationPasses; checkpoint += 1) {
        assertContextCurrent(ctx);
        if (!clean() || Number(stateStore.getRevision?.(ctx.userId) || 0) !== initialRevision) {
          return Object.freeze({ ok: false, stage: ctx.stage, reason: "normalized-cutover-local-state-changed" });
        }
        const validation = await validateNow();
        assertContextCurrent(ctx);
        if (!validation?.ok || validation.stage !== "dual_write") {
          return Object.freeze({
            ok: false, stage: ctx.stage, reason: validation?.reason || "normalized-cutover-verification-failed"
          });
        }
      }
      assertContextCurrent(ctx);
      if (!clean() || Number(stateStore.getRevision?.(ctx.userId) || 0) !== initialRevision) {
        return Object.freeze({ ok: false, stage: ctx.stage, reason: "normalized-cutover-local-state-changed" });
      }
      // promoteToNormalized performs a second server-backed generation/CAS gate,
      // normalized-read verification, and rollback on failure.
      const promoted = await promoteToNormalized();
      assertContextCurrent(ctx);
      const authoritative = await refreshContextStage(ctx);
      assertContextCurrent(ctx);
      if (promoted?.ok !== true || authoritative.stage !== "normalized" || !isNormalizedAuthority()) {
        return Object.freeze({ ok: false, stage: authoritative.stage, reason: "normalized-cutover-authority-not-verified" });
      }
      emit("normalized-primary-active", { stage: "normalized", ok: true });
      return Object.freeze({ ok: true, stage: "normalized", primaryWriter: "record-outbox", legacyWriteRequired: false });
    }

    async function rollbackToLegacy() {
      const ctx = await ensureContext();
      if (!ctx) return Object.freeze({ ok: true, skipped: true, reason: "not-eligible" });
      assertContextCurrent(ctx);
      await refreshContextStage(ctx);
      let recovery = null;

      if (ctx.stage === "normalized") {
        assertContextCurrent(ctx);
        const sync = await syncNormalizedNow();
        assertContextCurrent(ctx);
        if (!sync.ok) {
          throw Object.assign(new Error("Rollback blocked while normalized mutations are still pending."), {
            code: "HH_SYNC_ROLLBACK_PENDING_MUTATIONS"
          });
        }
        assertContextCurrent(ctx);
        const read = await ctx.readResolver.read();
        assertContextCurrent(ctx);
        if (read?.source !== "normalized" || read?.fallback === true) {
          throw Object.assign(new Error("Rollback blocked because normalized authority could not be read safely."), {
            code: "HH_SYNC_ROLLBACK_READ_REQUIRED"
          });
        }
        assertContextCurrent(ctx);
        const manifest = await ctx.recordStore.getManifest();
        assertContextCurrent(ctx);
        const generation = Number(manifest?.sync_generation ?? manifest?.syncGeneration);
        if (!Number.isSafeInteger(generation) || generation < 0) {
          throw Object.assign(new Error("Rollback blocked because manifest generation is missing."), {
            code: "HH_SYNC_ROLLBACK_BLOCKED"
          });
        }
        assertContextCurrent(ctx);
        recovery = await ctx.recordStore.materializeLegacyRecovery({
          snapshot: read.snapshot,
          expectedGeneration: generation
        });
        assertContextCurrent(ctx);
      }

      const transitions = [];
      while (ctx.stage !== "legacy") {
        assertContextCurrent(ctx);
        const result = await ctx.rolloutControl.rollback();
        assertContextCurrent(ctx);
        transitions.push(result);
        await refreshContextStage(ctx);
      }
      assertContextCurrent(ctx);
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
      assertContextCurrent(ctx);
      assertContextCurrent(ctx);
      const manifest = await ctx.recordStore.getManifest();
      assertContextCurrent(ctx);
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
      assertContextCurrent(ctx);
      const promoted = await ctx.rolloutControl.promote("dual_write", { userId: ctx.userId });
      assertContextCurrent(ctx);
      try {
        assertContextCurrent(ctx);
        const prepared = await ctx.rolloutControl.prepareWriter({
          userId: ctx.userId,
          writerVersion: WRITER_VERSION,
          namespace: ctx.normalizer.namespace,
          formatVersion: ctx.normalizer.formatVersion
        });
        assertContextCurrent(ctx);
        const afterPrepare = await ctx.recordStore.getManifest();
        assertContextCurrent(ctx);
        ctx.stage = stageOf(afterPrepare);
        validationPasses = 0;
        emit("promoted-dual-write", { stage: ctx.stage, ok: true });
        return Object.freeze({ ok: true, stage: ctx.stage, promoted, prepared });
      } catch (error) {
        if (error?.code === "HH_SYNC_ACCOUNT_CHANGED") throw error;
        try {
          assertContextCurrent(ctx);
          await ctx.rolloutControl.rollback();
          assertContextCurrent(ctx);
          const rollbackManifest = await ctx.recordStore.getManifest();
          assertContextCurrent(ctx);
          ctx.stage = stageOf(rollbackManifest);
          emit("dual-write-prepare-rollback", { stage: ctx.stage, ok: true, reason: error?.code || "writer-prepare-failed" });
        } catch {}
        assertContextCurrent(ctx);
        validationPasses = 0;
        throw error;
      }
    }

    async function rollback() {
      const ctx = await ensureContext();
      if (!ctx) return { ok: true, skipped: true, reason: "not-eligible" };
      assertContextCurrent(ctx);
      await refreshContextStage(ctx);
      assertContextCurrent(ctx);
      if (ctx.stage === "normalized") {
        return rollbackToLegacy();
      }
      assertContextCurrent(ctx);
      const result = await ctx.rolloutControl.rollback();
      assertContextCurrent(ctx);
      await refreshContextStage(ctx);
      assertContextCurrent(ctx);
      validationPasses = 0;
      emit("rollback", { stage: ctx.stage, ok: true });
      return result;
    }

    async function checkEligibility() {
      const userId = safeText(cloud.getSession?.()?.user?.id);
      const epoch = identityEpoch;
      const status = await cloud.getNormalizedSyncCohortStatus();
      if (identityEpoch !== epoch || safeText(cloud.getSession?.()?.user?.id) !== userId) {
        return Object.freeze({ active: false, reason: "account-changed-during-eligibility" });
      }
      eligibility = status;
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
      if (ctx) {
        assertContextCurrent(ctx);
        await refreshContextStage(ctx);
        assertContextCurrent(ctx);
      }
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

      root?.document?.addEventListener?.("herdharbor:legacy-cloud-commit", (event) => {
        if (event?.detail?.normalizedHandled === true) return;
        commitChain = commitChain.then(afterLegacyCommit, afterLegacyCommit);
      });
      root?.document?.addEventListener?.("herdharbor:auth-boundary", () => {
        // Dispatch occurs before the cloud bridge updates its session. Fence
        // pending setup immediately, including A->B->A rapid transitions.
        invalidateAccountContext();
      });
      root?.document?.addEventListener?.("herdharbor:auth-session", () => {
        const currentUserId = safeText(cloud.getSession?.()?.user?.id);
        if (currentUserId && (
          (context && context.userId === currentUserId) ||
          (setupPromise && setupUserId === currentUserId)
        )) {
          const epoch = identityEpoch;
          void cloud.getNormalizedSyncCohortStatus()
            .then((next) => {
              if (identityEpoch === epoch && safeText(cloud.getSession?.()?.user?.id) === currentUserId) eligibility = next;
            })
            .catch(() => {});
          return;
        }
        invalidateAccountContext();
        if (currentUserId) void checkEligibility().catch(() => {});
      });

      const startEpoch = identityEpoch;
      const session = await cloud.getSession();
      if (identityEpoch !== startEpoch || safeText(cloud.getSession?.()?.user?.id) !== safeText(session?.user?.id)) return status();
      if (session?.user?.id) {
        const decision = await checkEligibility();
        if (identityEpoch !== startEpoch || safeText(cloud.getSession?.()?.user?.id) !== safeText(session.user.id)) return status();
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
          if (identityEpoch !== startEpoch || safeText(cloud.getSession?.()?.user?.id) !== safeText(session.user.id)) return status();
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
      refreshDualWriteBaseline,
      syncNormalizedNow,
      refreshAuthoritative,
      isNormalizedAuthority,
      validateNow,
      promoteToDualWrite,
      promoteToNormalized,
      cutoverToNormalizedPrimary,
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
