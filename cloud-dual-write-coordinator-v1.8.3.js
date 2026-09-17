(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else if (root) {
    root.HerdHarborCloudDualWriteCoordinator = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "0.2-deferred-verification";
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
      return shadowController.verifyAndRecord(snapshot);
    }

    async function save(snapshot, saveOptions = {}) {
      let legacyResult;
      try {
        legacyResult = await writeLegacySnapshot(snapshot, saveOptions.legacy || {});
      } catch (error) {
        emit("dual-write-failure", safeFailure(error, "legacy-write"));
        throw error;
      }

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

      let normalizedResult;
      try {
        normalizedResult = await shadowController.sync(snapshot, {
          legacySnapshotUpdatedAt:
            saveOptions.legacySnapshotUpdatedAt ||
            legacyResult?.updated_at ||
            legacyResult?.updatedAt ||
            undefined
        });
      } catch (error) {
        const failure = safeFailure(error, "normalized-write");
        emit("dual-write-degraded", failure);
        return Object.freeze({
          ok: true,
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

      if (normalizedResult?.skipped) {
        const reason = String(normalizedResult.reason || "normalized-write-skipped").slice(0, 80);
        if (reason === "already-current") {
          const alreadyVerified = normalizedResult.verified === true;
          if (verifyAfterWrite && !alreadyVerified) {
            try {
              const verification = await shadowController.verifyAndRecord(snapshot);
              return Object.freeze({
                ok: true,
                mode: "dual-write",
                legacySaved: true,
                normalizedSaved: false,
                normalizedCurrent: true,
                normalizedVerified: verification?.ok === true,
                normalizedPending: false,
                verificationPending: verification?.ok !== true,
                normalizedGeneration: normalizedResult?.generation ?? null,
                verifiedAt: verification?.verifiedAt || null,
                legacyResult
              });
            } catch (error) {
              const failure = safeFailure(error, "normalized-verify");
              emit("dual-write-degraded", failure);
              return Object.freeze({
                ok: true,
                mode: "dual-write-degraded",
                legacySaved: true,
                normalizedSaved: false,
                normalizedCurrent: true,
                normalizedVerified: false,
                normalizedPending: false,
                verificationPending: true,
                normalizedErrorCode: failure.errorCode,
                legacyResult
              });
            }
          }
          const result = Object.freeze({
            ok: true,
            mode: "dual-write",
            legacySaved: true,
            normalizedSaved: false,
            normalizedCurrent: true,
            normalizedVerified: alreadyVerified,
            normalizedPending: false,
            verificationPending: !alreadyVerified,
            normalizedGeneration: normalizedResult?.generation ?? null,
            legacyResult
          });
          emit("dual-write-complete", {
            mode: result.mode,
            normalizedCurrent: true,
            normalizedVerified: result.normalizedVerified,
            verificationPending: result.verificationPending
          });
          return result;
        }

        const result = Object.freeze({
          ok: true,
          mode: "dual-write-degraded",
          legacySaved: true,
          normalizedSaved: false,
          normalizedCurrent: reason === "normalized-authoritative",
          normalizedVerified: false,
          normalizedPending: reason !== "normalized-authoritative",
          verificationPending: false,
          normalizedReason: reason,
          legacyResult
        });
        emit("dual-write-degraded", {
          operation: "normalized-write",
          reason,
          normalizedPending: result.normalizedPending
        });
        return result;
      }

      // A full normalized read/reassembly is deliberately not performed after
      // every legacy save. Atomic generation/version guards make the write safe;
      // explicit verification is performed at shadow bootstrap, on demand, and
      // immediately before any stage promotion that requires it.
      if (!verifyAfterWrite) {
        const result = Object.freeze({
          ok: true,
          mode: "dual-write",
          legacySaved: true,
          normalizedSaved: true,
          normalizedCurrent: true,
          normalizedVerified: false,
          normalizedPending: false,
          verificationPending: true,
          normalizedGeneration: normalizedResult?.generation ?? null,
          legacyResult
        });
        emit("dual-write-complete", {
          mode: result.mode,
          legacySaved: true,
          normalizedSaved: true,
          normalizedCurrent: true,
          normalizedVerified: false,
          normalizedPending: false,
          verificationPending: true,
          normalizedGeneration: result.normalizedGeneration
        });
        return result;
      }

      try {
        const verification = await shadowController.verifyAndRecord(snapshot);
        const result = Object.freeze({
          ok: true,
          mode: "dual-write",
          legacySaved: true,
          normalizedSaved: true,
          normalizedCurrent: true,
          normalizedVerified: verification?.ok === true,
          normalizedPending: false,
          verificationPending: verification?.ok !== true,
          normalizedGeneration: normalizedResult?.generation ?? null,
          verifiedAt: verification?.verifiedAt || null,
          legacyResult
        });
        emit("dual-write-complete", {
          mode: result.mode,
          legacySaved: true,
          normalizedSaved: true,
          normalizedCurrent: true,
          normalizedVerified: result.normalizedVerified,
          normalizedPending: false,
          verificationPending: result.verificationPending,
          normalizedGeneration: result.normalizedGeneration
        });
        return result;
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
          normalizedGeneration: normalizedResult?.generation ?? null,
          normalizedErrorCode: failure.errorCode,
          legacyResult
        });
      }
    }

    return Object.freeze({
      setEnabled,
      isEnabled,
      verifyCurrent,
      save
    });
  }

  return Object.freeze({
    version: VERSION,
    release: RELEASE,
    createDualWriteCoordinator
  });
});
