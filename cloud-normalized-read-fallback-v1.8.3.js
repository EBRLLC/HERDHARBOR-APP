(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./cloud-state-normalizer-v1.8.3.js"));
  } else if (root) {
    root.HerdHarborCloudNormalizedReadFallback = factory(root.HerdHarborCloudStateNormalizer);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (normalizer) {
  "use strict";

  const VERSION = "0.3-single-pass-integrity";
  const RELEASE = "1.8.3";
  const NORMALIZED_STAGE = "normalized";

  function requiredFunction(value, label) {
    if (typeof value !== "function") throw new TypeError(`${label} is required.`);
    return value;
  }

  function requiredNormalizer(value) {
    const methods = ["reassembleLegacySnapshotWithMetadata"];
    if (!value || methods.some((name) => typeof value[name] !== "function")) {
      throw new TypeError("HerdHarbor cloud state normalizer is required.");
    }
    return value;
  }

  function normalizedStage(manifest) {
    return String(manifest?.cutover_stage ?? manifest?.cutoverStage ?? "legacy") === NORMALIZED_STAGE;
  }

  function manifestGeneration(manifest) {
    const value = Number(manifest?.sync_generation ?? manifest?.syncGeneration);
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }

  function verifiedAt(manifest) {
    return String(manifest?.normalized_verified_at ?? manifest?.normalizedVerifiedAt ?? "").trim();
  }

  function metadata(manifest) {
    const value = manifest?.metadata;
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function activeRecordCount(rows, namespace) {
    return (Array.isArray(rows) ? rows : []).filter((row) => {
      if (row?.deleted_at ?? row?.deletedAt) return false;
      const rowNamespace = String(row?.namespace || "");
      return !rowNamespace || rowNamespace === namespace;
    }).length;
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

    function verificationMarkers(manifest) {
      const details = metadata(manifest);
      const verifiedChecksum = String(details.verified_checksum || "").trim();
      const sourceChecksum = String(details.source_checksum || "").trim();
      const count = Number(details.verification_record_count);
      const normalizedCount = Number(details.normalized_record_count);
      const formatVersion = Number(details.normalized_format_version);
      const namespace = String(details.normalized_namespace || "").trim();
      return {
        verifiedChecksum,
        sourceChecksum,
        count: Number.isSafeInteger(count) && count >= 0 ? count : null,
        normalizedCount: Number.isSafeInteger(normalizedCount) && normalizedCount >= 0 ? normalizedCount : null,
        formatVersion: Number.isSafeInteger(formatVersion) && formatVersion >= 1 ? formatVersion : null,
        namespace
      };
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

      const initialGeneration = manifestGeneration(manifest);
      if (initialGeneration === null) return legacy("normalized-generation-missing");
      const markers = verificationMarkers(manifest);
      if (!markers.verifiedChecksum) return legacy("verification-checksum-missing");
      if (!markers.sourceChecksum || markers.sourceChecksum !== markers.verifiedChecksum) {
        return legacy("verification-source-mismatch");
      }
      if (markers.count === null || markers.normalizedCount === null || markers.count !== markers.normalizedCount) {
        return legacy("verification-record-count-missing");
      }
      if (markers.namespace !== mapper.namespace) return legacy("normalized-namespace-mismatch");
      if (markers.formatVersion !== mapper.formatVersion) return legacy("normalized-format-mismatch");

      let rows;
      try {
        rows = await listNormalizedRows();
      } catch (error) {
        return legacy("normalized-row-read-failed", safeFailure(error, "normalized-row-read-failed"));
      }

      let reconstruction;
      try {
        // Reassembly already performs the full snapshot checksum. Reuse that
        // result instead of cloning/stringifying/hashing a multi-MB state a
        // second time on every normalized read.
        reconstruction = mapper.reassembleLegacySnapshotWithMetadata(rows);
      } catch (error) {
        return legacy("normalized-reassembly-failed", safeFailure(error, "normalized-reassembly-failed"));
      }
      const snapshot = reconstruction.snapshot;
      const actualChecksum = reconstruction.checksum;
      if (actualChecksum !== markers.verifiedChecksum) {
        return legacy("normalized-checksum-mismatch", {
          errorName: "HerdHarborCloudNormalizationError",
          errorCode: "HH_NORMALIZED_CHECKSUM_MISMATCH",
          operation: "normalized-read-verify"
        });
      }

      const recordCount = activeRecordCount(rows, mapper.namespace);
      if (recordCount !== markers.count) {
        return legacy("normalized-record-count-mismatch", {
          errorName: "HerdHarborCloudNormalizationError",
          errorCode: "HH_NORMALIZED_RECORD_COUNT_MISMATCH",
          operation: "normalized-read-verify"
        });
      }

      // Re-read the small manifest after the payload read. A concurrent rollback
      // or generation change must not let this caller return a snapshot that is
      // no longer authoritative by the time the read completes.
      let finalManifest;
      try {
        finalManifest = await getManifest();
      } catch (error) {
        return legacy("manifest-recheck-failed", safeFailure(error, "manifest-recheck-failed"));
      }
      const finalMarkers = verificationMarkers(finalManifest);
      if (
        !normalizedStage(finalManifest) ||
        manifestGeneration(finalManifest) !== initialGeneration ||
        verifiedAt(finalManifest) !== verifiedAt(manifest) ||
        finalMarkers.verifiedChecksum !== markers.verifiedChecksum ||
        finalMarkers.count !== markers.count
      ) {
        return legacy("normalized-manifest-changed");
      }

      const result = Object.freeze({
        source: "normalized",
        fallback: false,
        reason: null,
        checksum: actualChecksum,
        recordCount,
        generation: initialGeneration,
        verifiedAt: verifiedAt(manifest),
        snapshot
      });
      emit("normalized-read-complete", {
        source: "normalized",
        checksum: result.checksum,
        recordCount: result.recordCount,
        generation: result.generation
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
