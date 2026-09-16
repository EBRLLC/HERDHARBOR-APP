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

  const VERSION = "0.1-internal-cohort";
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

    function isEligibleUser(userId) {
      return featureGate && cohort.has(String(userId || ""));
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
      if (!cohort.has(userId)) {
        const result = { skipped: true, reason: "not-in-internal-cohort" };
        emit("shadow-bootstrap-skipped", result);
        return result;
      }

      try {
        const legacyRead = resolveLegacyRead(await readLegacySnapshot({ userId }));
        const mapped = normalizerApi.mapLegacySnapshot(legacyRead.snapshot);
        emit("shadow-bootstrap-start", {
          checksum: mapped.checksum,
          recordCount: mapped.records.length,
          dryRun: runOptions.dryRun === true
        });

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
          dryRun: runOptions.dryRun === true,
          legacySnapshotUpdatedAt: legacyRead.updatedAt || undefined
        });
        if (sync.skipped) {
          const result = {
            skipped: true,
            reason: sync.reason || "shadow-sync-skipped",
            checksum: mapped.checksum,
            recordCount: mapped.records.length
          };
          emit("shadow-bootstrap-complete", result);
          return result;
        }

        const verification = await controller.verifyAndRecord(legacyRead.snapshot);
        const result = {
          skipped: false,
          stage: verification.stage || sync.stage || "shadow",
          checksum: verification.actualChecksum || mapped.checksum,
          recordCount: verification.recordCount || mapped.records.length,
          verified: verification.ok === true,
          verifiedAt: verification.verifiedAt || null
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
