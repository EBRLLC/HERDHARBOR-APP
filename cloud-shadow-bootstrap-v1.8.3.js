(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("./cloud-record-store-v1.8.3.js"),
      require("./cloud-state-normalizer-v1.8.3.js"),
      require("./cloud-shadow-sync-v1.8.3.js")
    );
  } else if (root) {
    root.HerdHarborCloudShadowBootstrap = factory(
      root.HerdHarborCloudRecordStore,
      root.HerdHarborCloudStateNormalizer,
      root.HerdHarborCloudShadowSync
    );
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (recordStoreApi, normalizerApi, shadowApi) {
  "use strict";

  const VERSION = "0.5-cohort-gate";
  const RELEASE = "1.8.3";

  function requiredFunction(value, label) {
    if (typeof value !== "function") throw new TypeError(`${label} is required.`);
    return value;
  }

  function normalizeCohort(values) {
    const cohort = new Set();
    for (const value of values instanceof Set ? values : Array.isArray(values) ? values : []) {
      const id = String(value || "").trim();
      if (id) cohort.add(id);
    }
    return cohort;
  }

  function resolveSession(value) {
    if (value?.user?.id) return value;
    if (value?.session?.user?.id) return value.session;
    if (value?.data?.session?.user?.id) return value.data.session;
    return null;
  }

  function resolveLegacyRead(value) {
    if (value && typeof value === "object" && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, "snapshot")) {
      return {
        snapshot: value.snapshot,
        updatedAt: value.updatedAt || value.updated_at || null
      };
    }
    return { snapshot: value, updatedAt: null };
  }

  function safeError(error) {
    return {
      name: String(error?.name || "Error").slice(0, 80),
      code: String(error?.code || "unknown").slice(0, 80),
      operation: String(error?.operation || "shadow-bootstrap").slice(0, 80)
    };
  }

  function createShadowBootstrap(options = {}) {
    const featureGate = options.featureGate === true;
    const cohort = normalizeCohort(options.cohortUserIds);
    const cohortGate = options.cohortGate;
    const getSession = requiredFunction(options.getSession, "getSession");
    const readLegacySnapshot = requiredFunction(options.readLegacySnapshot, "readLegacySnapshot");
    const createRecordStore = requiredFunction(
      options.createRecordStore || recordStoreApi?.createRecordStore,
      "createRecordStore"
    );
    const createShadowSyncController = requiredFunction(
      options.createShadowSyncController || shadowApi?.createShadowSyncController,
      "createShadowSyncController"
    );
    if (!normalizerApi?.mapLegacySnapshot || !normalizerApi?.snapshotChecksum) {
      throw new TypeError("HerdHarbor cloud state normalizer is required.");
    }
    const onEvent = typeof options.onEvent === "function" ? options.onEvent : () => {};
    const maxMutations = options.maxMutations;

    function emit(type, detail = {}) {
      try {
        onEvent({ type, release: RELEASE, ...detail });
      } catch {}
    }

    function cohortDecision(userId) {
      const id = String(userId || "").trim();
      if (cohortGate?.evaluate) return cohortGate.evaluate(id);
      const eligible = cohort.has(id);
      return Object.freeze({
        eligible,
        reason: eligible ? "allowlisted" : "not-allowlisted"
      });
    }

    function isEligibleUser(userId) {
      return featureGate && cohortDecision(userId).eligible === true;
    }

    async function run(runOptions = {}) {
      if (!featureGate) {
        const result = { skipped: true, reason: "feature-gate-disabled" };
        emit("shadow-bootstrap-skipped", result);
        return result;
      }

      const session = resolveSession(await getSession());
      const userId = String(session?.user?.id || "").trim();
      if (!userId) {
        const result = { skipped: true, reason: "no-session" };
        emit("shadow-bootstrap-skipped", result);
        return result;
      }
      const cohortResult = cohortDecision(userId);
      if (cohortResult.eligible !== true) {
        const result = {
          skipped: true,
          reason: "not-in-internal-cohort",
          cohortReason: String(cohortResult.reason || "not-eligible").slice(0, 80)
        };
        emit("shadow-bootstrap-skipped", result);
        return result;
      }

      try {
        const legacyRead = resolveLegacyRead(await readLegacySnapshot({ userId }));
        const dryRun = runOptions.dryRun === true;
        // The controller owns normalization. Avoid pre-mapping the same multi-MB
        // legacy snapshot here and then immediately mapping it again in sync().
        emit("shadow-bootstrap-start", { dryRun });

        const recordStore = createRecordStore({ client: options.client, userId });
        const controller = createShadowSyncController({
          recordStore,
          normalizer: normalizerApi,
          enabled: true,
          maxMutations,
          now: options.now,
          onEvent: (event) => emit("shadow-controller", {
            controllerType: String(event?.type || "unknown").slice(0, 80),
            checksum: event?.checksum || null,
            recordCount: Number(event?.recordCount || 0) || 0,
            puts: Number(event?.puts || 0) || 0,
            tombstones: Number(event?.tombstones || 0) || 0,
            ok: event?.ok === true
          })
        });

        const sync = await controller.sync(legacyRead.snapshot, {
          dryRun,
          legacySnapshotUpdatedAt: legacyRead.updatedAt || undefined
        });

        if (sync.skipped) {
          if (dryRun || sync.reason === "dry-run") {
            const result = {
              skipped: true,
              reason: "dry-run",
              checksum: sync.checksum || null,
              recordCount: Number(sync.recordCount || 0) || 0
            };
            emit("shadow-bootstrap-complete", result);
            return result;
          }
          if (sync.reason === "already-current" && sync.verified !== true) {
            const verification = await controller.verifyAndRecord(legacyRead.snapshot, {
              expectedChecksum: sync.checksum || undefined
            });
            const result = {
              skipped: false,
              stage: verification.stage || "shadow",
              checksum: verification.actualChecksum || sync.checksum || null,
              recordCount: verification.recordCount || sync.recordCount || 0,
              verified: verification.ok === true,
              verifiedAt: verification.verifiedAt || null,
              resumedVerification: true
            };
            emit("shadow-bootstrap-complete", result);
            return result;
          }
          const result = {
            skipped: true,
            reason: sync.reason || "shadow-sync-skipped",
            checksum: sync.checksum || null,
            recordCount: Number(sync.recordCount || 0) || 0,
            verified: sync.verified === true
          };
          emit("shadow-bootstrap-complete", result);
          return result;
        }

        const verification = await controller.verifyAndRecord(legacyRead.snapshot, {
          expectedChecksum: sync.checksum || undefined
        });
        const result = {
          skipped: false,
          stage: verification.stage || sync.stage || "shadow",
          checksum: verification.actualChecksum || sync.checksum || null,
          recordCount: verification.recordCount || sync.recordCount || 0,
          verified: verification.ok === true,
          verifiedAt: verification.verifiedAt || null,
          resumedVerification: false
        };
        emit("shadow-bootstrap-complete", result);
        return result;
      } catch (error) {
        const failure = safeError(error);
        emit("shadow-bootstrap-failure", failure);
        throw error;
      }
    }

    return Object.freeze({
      featureGate,
      cohortSize: cohort.size,
      cohortMode: cohortGate?.mode || "allowlist",
      isEligibleUser,
      run
    });
  }

  return Object.freeze({
    version: VERSION,
    release: RELEASE,
    createShadowBootstrap
  });
});
