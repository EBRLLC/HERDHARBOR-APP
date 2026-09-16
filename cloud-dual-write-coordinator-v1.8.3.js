(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else if (root) {
    root.HerdHarborCloudDualWriteCoordinator = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "0.1-migration-coordinator";
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
          normalizedVerified: false,
          normalizedPending: false,
          legacyResult
        });
        emit("dual-write-complete", {
          mode: result.mode,
          legacySaved: true,
          normalizedSaved: false,
          normalizedVerified: false,
          normalizedPending: false
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
          normalizedVerified: false,
          normalizedPending: true,
          normalizedErrorCode: failure.errorCode,
          legacyResult
        });
      }

      if (normalizedResult?.skipped) {
        const reason = String(normalizedResult.reason || "normalized-write-skipped").slice(0, 80);
        const result = Object.freeze({
          ok: true,
          mode: "dual-write-degraded",
          legacySaved: true,
          normalizedSaved: false,
          normalizedVerified: false,
          normalizedPending: reason !== "normalized-authoritative",
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

      try {
        const verification = await shadowController.verifyAndRecord(snapshot);
        const result = Object.freeze({
          ok: true,
          mode: "dual-write",
          legacySaved: true,
          normalizedSaved: true,
          normalizedVerified: verification?.ok === true,
          normalizedPending: verification?.ok !== true,
          normalizedGeneration: normalizedResult?.generation ?? null,
          verifiedAt: verification?.verifiedAt || null,
          legacyResult
        });
        emit("dual-write-complete", {
          mode: result.mode,
          legacySaved: true,
          normalizedSaved: true,
          normalizedVerified: result.normalizedVerified,
          normalizedPending: result.normalizedPending,
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
          normalizedVerified: false,
          normalizedPending: true,
          normalizedGeneration: normalizedResult?.generation ?? null,
          normalizedErrorCode: failure.errorCode,
          legacyResult
        });
      }
    }

    return Object.freeze({
      setEnabled,
      isEnabled,
      save
    });
  }

  return Object.freeze({
    version: VERSION,
    release: RELEASE,
    createDualWriteCoordinator
  });
});
