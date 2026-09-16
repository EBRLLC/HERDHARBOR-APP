(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./cloud-state-normalizer-v1.8.3.js"));
  } else if (root) {
    root.HerdHarborCloudNormalizedReadFallback = factory(root.HerdHarborCloudStateNormalizer);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (normalizer) {
  "use strict";

  const VERSION = "0.1-safe-read-fallback";
  const RELEASE = "1.8.3";
  const NORMALIZED_STAGE = "normalized";

  function requiredFunction(value, label) {
    if (typeof value !== "function") throw new TypeError(`${label} is required.`);
    return value;
  }

  function requiredNormalizer(value) {
    const methods = ["reassembleLegacySnapshot", "snapshotChecksum"];
    if (!value || methods.some((name) => typeof value[name] !== "function")) {
      throw new TypeError("HerdHarbor cloud state normalizer is required.");
    }
    return value;
  }

  function normalizedStage(manifest) {
    return String(manifest?.cutover_stage ?? manifest?.cutoverStage ?? "legacy") === NORMALIZED_STAGE;
  }

  function verifiedAt(manifest) {
    return String(manifest?.normalized_verified_at ?? manifest?.normalizedVerifiedAt ?? "").trim();
  }

  function metadata(manifest) {
    const value = manifest?.metadata;
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function activeRecordCount(rows) {
    return (Array.isArray(rows) ? rows : []).filter((row) => !(row?.deleted_at ?? row?.deletedAt)).length;
  }

  function safeFailure(error, fallbackReason) {
    return {
      reason: fallbackReason,
      errorName: String(error?.name || "Error").slice(0, 80),
      errorCode: String(error?.code || "unknown").slice(0, 80),
      operation: String(error?.operation || "normalized-read").slice(0, 80)
    };
  }

  function createReadResolver(options = {}) {
    const mapper = requiredNormalizer(options.normalizer || normalizer);
    const getManifest = requiredFunction(options.getManifest, "getManifest");
    const listNormalizedRows = requiredFunction(options.listNormalizedRows, "listNormalizedRows");
    const readLegacySnapshot = requiredFunction(options.readLegacySnapshot, "readLegacySnapshot");
    const onEvent = typeof options.onEvent === "function" ? options.onEvent : () => {};

    function emit(type, detail = {}) {
      try {
        onEvent({ type, release: RELEASE, ...detail });
      } catch {}
    }

    async function legacy(reason, context = {}) {
      emit("normalized-read-fallback", {
        reason,
        errorName: context.errorName || null,
        errorCode: context.errorCode || null,
        operation: context.operation || null
      });
      try {
        const snapshot = await readLegacySnapshot();
        emit("normalized-read-complete", { source: "legacy", reason });
        return Object.freeze({
          source: "legacy",
          fallback: true,
          reason,
          snapshot
        });
      } catch (error) {
        const failure = safeFailure(error, "legacy-fallback-failed");
        emit("normalized-read-failure", failure);
        throw error;
      }
    }

    async function read() {
      let manifest;
      try {
        manifest = await getManifest();
      } catch (error) {
        return legacy("manifest-read-failed", safeFailure(error, "manifest-read-failed"));
      }

      if (!manifest) return legacy("manifest-missing");
      if (!normalizedStage(manifest)) return legacy("normalized-not-authoritative");
      if (!verifiedAt(manifest)) return legacy("normalized-not-verified");

      const manifestMetadata = metadata(manifest);
      const expectedChecksum = String(manifestMetadata.verified_checksum || "").trim();
      if (!expectedChecksum) return legacy("verification-checksum-missing");

      let rows;
      try {
        rows = await listNormalizedRows();
      } catch (error) {
        return legacy("normalized-row-read-failed", safeFailure(error, "normalized-row-read-failed"));
      }

      let snapshot;
      try {
        snapshot = mapper.reassembleLegacySnapshot(rows);
      } catch (error) {
        return legacy("normalized-reassembly-failed", safeFailure(error, "normalized-reassembly-failed"));
      }

      const actualChecksum = mapper.snapshotChecksum(snapshot);
      if (actualChecksum !== expectedChecksum) {
        return legacy("normalized-checksum-mismatch", {
          errorName: "HerdHarborCloudNormalizationError",
          errorCode: "HH_NORMALIZED_CHECKSUM_MISMATCH",
          operation: "normalized-read-verify"
        });
      }

      const expectedRecordCount = Number(manifestMetadata.verification_record_count);
      if (
        Number.isSafeInteger(expectedRecordCount) &&
        expectedRecordCount >= 0 &&
        activeRecordCount(rows) !== expectedRecordCount
      ) {
        return legacy("normalized-record-count-mismatch", {
          errorName: "HerdHarborCloudNormalizationError",
          errorCode: "HH_NORMALIZED_RECORD_COUNT_MISMATCH",
          operation: "normalized-read-verify"
        });
      }

      const result = Object.freeze({
        source: "normalized",
        fallback: false,
        reason: null,
        checksum: actualChecksum,
        recordCount: activeRecordCount(rows),
        verifiedAt: verifiedAt(manifest),
        snapshot
      });
      emit("normalized-read-complete", {
        source: "normalized",
        checksum: result.checksum,
        recordCount: result.recordCount
      });
      return result;
    }

    return Object.freeze({ read });
  }

  return Object.freeze({
    version: VERSION,
    release: RELEASE,
    createReadResolver
  });
});
