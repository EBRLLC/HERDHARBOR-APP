(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./cloud-state-normalizer-v1.8.3.js"));
  } else if (root) {
    root.HerdHarborCloudNormalizedReadFallback = factory(root.HerdHarborCloudStateNormalizer);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (normalizer) {
  "use strict";

  const VERSION = "0.4-record-authority-integrity";
  const RELEASE = "1.8.3";
  const NORMALIZED_STAGE = "normalized";

  function requiredFunction(value, label) {
    if (typeof value !== "function") throw new TypeError(`${label} is required.`);
    return value;
  }

  function requiredNormalizer(value) {
    const methods = ["reassembleAuthoritativeSnapshotWithMetadata"];
    if (!value || methods.some((name) => typeof value[name] !== "function")) {
      throw new TypeError("HerdHarbor cloud state normalizer is required.");
    }
    return value;
  }

  function strictNonNegativeInteger(value, minimum = 0) {
    if (typeof value === "number") {
      return Number.isSafeInteger(value) && value >= minimum ? value : null;
    }
    if (typeof value !== "string") return null;
    const text = value.trim();
    if (!/^\d+$/.test(text)) return null;
    const parsed = Number(text);
    return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : null;
  }

  function normalizedStage(manifest) {
    return String(manifest?.cutover_stage ?? manifest?.cutoverStage ?? "legacy") === NORMALIZED_STAGE;
  }

  function manifestGeneration(manifest) {
    return strictNonNegativeInteger(manifest?.sync_generation ?? manifest?.syncGeneration);
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

    function authorityMarkers(manifest) {
      const details = metadata(manifest);
      return {
        authorityReady: details.normalized_authority_ready === true,
        authorityVersion: String(details.normalized_authority_version || "").trim(),
        writerReady: details.normalized_writer_ready === true,
        writerVersion: String(details.normalized_writer_version || "").trim(),
        formatVersion: strictNonNegativeInteger(details.normalized_format_version, 1),
        namespace: String(details.normalized_namespace || "").trim()
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

      const initialGeneration = manifestGeneration(manifest);
      if (initialGeneration === null) return legacy("normalized-generation-missing");

      const markers = authorityMarkers(manifest);
      if (!markers.authorityReady) return legacy("normalized-authority-marker-missing");
      if (!markers.authorityVersion) return legacy("normalized-authority-version-missing");
      if (!markers.writerReady || !markers.writerVersion) return legacy("normalized-writer-not-ready");
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
        reconstruction = mapper.reassembleAuthoritativeSnapshotWithMetadata(rows);
      } catch (error) {
        return legacy("normalized-reassembly-failed", safeFailure(error, "normalized-reassembly-failed"));
      }

      const recordCount = activeRecordCount(rows, mapper.namespace);
      if (recordCount !== reconstruction.recordCount) {
        return legacy("normalized-record-count-mismatch", {
          errorName: "HerdHarborCloudNormalizationError",
          errorCode: "HH_NORMALIZED_RECORD_COUNT_MISMATCH",
          operation: "normalized-read-verify"
        });
      }

      let finalManifest;
      try {
        finalManifest = await getManifest();
      } catch (error) {
        return legacy("manifest-recheck-failed", safeFailure(error, "manifest-recheck-failed"));
      }
      const finalMarkers = authorityMarkers(finalManifest);
      if (
        !normalizedStage(finalManifest) ||
        manifestGeneration(finalManifest) !== initialGeneration ||
        finalMarkers.authorityReady !== true ||
        finalMarkers.authorityVersion !== markers.authorityVersion ||
        finalMarkers.writerReady !== true ||
        finalMarkers.writerVersion !== markers.writerVersion ||
        finalMarkers.namespace !== markers.namespace ||
        finalMarkers.formatVersion !== markers.formatVersion
      ) {
        return legacy("normalized-manifest-changed");
      }

      const result = Object.freeze({
        source: "normalized",
        fallback: false,
        reason: null,
        checksum: reconstruction.checksum,
        checkpointChecksum: reconstruction.manifestChecksum,
        checkpointStale: reconstruction.checkpointStale === true,
        recordCount,
        generation: initialGeneration,
        authorityVersion: markers.authorityVersion,
        snapshot: reconstruction.snapshot
      });
      emit("normalized-read-complete", {
        source: "normalized",
        recordCount: result.recordCount,
        generation: result.generation,
        checkpointStale: result.checkpointStale
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
