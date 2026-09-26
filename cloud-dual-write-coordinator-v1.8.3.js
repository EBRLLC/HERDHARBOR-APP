(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else if (root) {
    root.HerdHarborCloudDualWriteCoordinator = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "0.3-record-outbox";
  const RELEASE = "1.8.3";

  function requiredFunction(value, label) {
    if (typeof value !== "function") throw new TypeError(`${label} is required.`);
    return value;
  }

  function requiredShadowController(value) {
    if (!value || typeof value.sync !== "function" || typeof value.verifyAndRecord !== "function") {
      throw new TypeError("A shadow sync controller is required.");
    }
    return value;
  }

  function requiredRecordWorker(value) {
    if (!value || typeof value.drain !== "function") {
      throw new TypeError("A record-level normalized outbox worker is required.");
    }
    return value;
  }

  function safeFailure(error, operation) {
    return {
      operation,
      errorName: String(error?.name || "Error").slice(0, 80),
      errorCode: String(error?.code || "unknown").slice(0, 80)
    };
  }

  function createDualWriteCoordinator(options = {}) {
    const writeLegacySnapshot = requiredFunction(options.writeLegacySnapshot, "writeLegacySnapshot");
    const shadowController = requiredShadowController(options.shadowController);
    const recordWorker = options.recordWorker ? requiredRecordWorker(options.recordWorker) : null;
    const onEvent = typeof options.onEvent === "function" ? options.onEvent : () => {};
    const verifyAfterWrite = options.verifyAfterWrite === true;
    let enabled = options.enabled === true;

    function emit(type, detail = {}) {
      try {
        onEvent({ type, release: RELEASE, ...detail });
      } catch {}
    }

    function setEnabled(value) {
      enabled = value === true;
      emit("dual-write-toggle", { enabled });
      return enabled;
    }

    function isEnabled() {
      return enabled;
    }

    async function verifyCurrent(snapshot) {
      if (!enabled) return Object.freeze({ skipped: true, reason: "disabled" });
      const syncResult = await shadowController.sync(snapshot);
      const verification = await shadowController.verifyAndRecord(snapshot);
      return Object.freeze({
        ...verification,
        checkpointSync: syncResult
      });
    }

    async function afterLegacySave(snapshot, legacyResult = {}) {
      if (!enabled) {
        const result = Object.freeze({
          ok: true,
          mode: "legacy-only",
          legacySaved: true,
          normalizedSaved: false,
          normalizedCurrent: false,
          normalizedVerified: false,
          normalizedPending: false,
          verificationPending: false,
          legacyResult
        });
        emit("dual-write-complete", {
          mode: result.mode,
          legacySaved: true,
          normalizedSaved: false,
          normalizedCurrent: false,
          normalizedVerified: false,
          normalizedPending: false,
          verificationPending: false
        });
        return result;
      }

      if (!recordWorker) {
        const failure = {
          operation: "normalized-write",
          errorCode: "HH_SYNC_RECORD_WORKER_REQUIRED"
        };
        emit("dual-write-degraded", failure);
        return Object.freeze({
          ok: false,
          mode: "dual-write-degraded",
          legacySaved: true,
          normalizedSaved: false,
          normalizedCurrent: false,
          normalizedVerified: false,
          normalizedPending: true,
          verificationPending: false,
          normalizedErrorCode: failure.errorCode,
          legacyResult
        });
      }

      let normalizedResult;
      try {
        normalizedResult = await recordWorker.drain();
      } catch (error) {
        const failure = safeFailure(error, "normalized-write");
        emit("dual-write-degraded", failure);
        return Object.freeze({
          ok: false,
          mode: "dual-write-degraded",
          legacySaved: true,
          normalizedSaved: false,
          normalizedCurrent: false,
          normalizedVerified: false,
          normalizedPending: true,
          verificationPending: false,
          normalizedErrorCode: failure.errorCode,
          legacyResult
        });
      }

      const normalizedPendingCount = Math.max(0, Number(normalizedResult?.pending || 0));
      const normalizedFailed =
        normalizedResult?.ok === false ||
        Number(normalizedResult?.failed || 0) > 0 ||
        normalizedPendingCount > 0;
      if (normalizedFailed) {
        const errorCode = Number(normalizedResult?.conflicts || 0) > 0
          ? "HH_SYNC_RECORD_CONFLICT"
          : String(normalizedResult?.results?.find?.((entry) => entry?.errorClass)?.errorClass || "HH_SYNC_RECORD_RETRY_PENDING");
        emit("dual-write-degraded", {
          operation: "normalized-write",
          errorCode,
          normalizedPending: true
        });
        return Object.freeze({
          ok: false,
          mode: "dual-write-degraded",
          legacySaved: true,
          normalizedSaved: Number(normalizedResult?.succeeded || 0) > 0,
          normalizedCurrent: false,
          normalizedVerified: false,
          normalizedPending: true,
          verificationPending: false,
          normalizedErrorCode: errorCode,
          normalizedConflicts: Number(normalizedResult?.conflicts || 0),
          normalizedPendingCount,
          normalizedResult,
          legacyResult
        });
      }

      let verification = null;
      if (verifyAfterWrite) {
        try {
          verification = await verifyCurrent(snapshot);
        } catch (error) {
          const failure = safeFailure(error, "normalized-verify");
          emit("dual-write-degraded", failure);
          return Object.freeze({
            ok: true,
            mode: "dual-write-degraded",
            legacySaved: true,
            normalizedSaved: true,
            normalizedCurrent: true,
            normalizedVerified: false,
            normalizedPending: false,
            verificationPending: true,
            normalizedErrorCode: failure.errorCode,
            normalizedResult,
            legacyResult
          });
        }
      }

      const result = Object.freeze({
        ok: true,
        mode: "dual-write",
        legacySaved: true,
        normalizedSaved: Number(normalizedResult?.processed || 0) > 0,
        normalizedCurrent: true,
        normalizedVerified: verification?.ok === true,
        normalizedPending: false,
        verificationPending: verifyAfterWrite ? verification?.ok !== true : true,
        normalizedResult,
        verifiedAt: verification?.verifiedAt || null,
        legacyResult
      });
      emit("dual-write-complete", {
        mode: result.mode,
        legacySaved: true,
        normalizedSaved: result.normalizedSaved,
        normalizedCurrent: true,
        normalizedVerified: result.normalizedVerified,
        normalizedPending: false,
        verificationPending: result.verificationPending
      });
      return result;
    }

    async function save(snapshot, saveOptions = {}) {
      let legacyResult;
      try {
        legacyResult = await writeLegacySnapshot(snapshot, saveOptions.legacy || {});
      } catch (error) {
        emit("dual-write-failure", safeFailure(error, "legacy-write"));
        throw error;
      }
      return afterLegacySave(snapshot, legacyResult);
    }

    return Object.freeze({
      setEnabled,
      isEnabled,
      verifyCurrent,
      afterLegacySave,
      save
    });
  }

  return Object.freeze({
    version: VERSION,
    release: RELEASE,
    createDualWriteCoordinator
  });
});
