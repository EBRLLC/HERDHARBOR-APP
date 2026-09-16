(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./cloud-state-normalizer-v1.8.3.js"));
  } else if (root) {
    root.HerdHarborCloudShadowSync = factory(root.HerdHarborCloudStateNormalizer);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (normalizer) {
  "use strict";

  const VERSION = "0.4-atomic-generation";
  const RELEASE = "1.8.3";
  const DEFAULT_MAX_MUTATIONS = 10000;
  const VALID_STAGES = new Set(["legacy", "shadow", "dual_write", "normalized"]);

  function requiredStore(recordStore) {
    const methods = ["list", "getManifest", "applyBatch", "markVerified"];
    if (!recordStore || methods.some((name) => typeof recordStore[name] !== "function")) {
      throw new TypeError("An atomic normalized cloud record store is required.");
    }
    return recordStore;
  }

  function requiredNormalizer(value) {
    const methods = [
      "mapLegacySnapshot",
      "reassembleLegacySnapshot",
      "diffNormalizedRecords",
      "snapshotChecksum"
    ];
    if (!value || methods.some((name) => typeof value[name] !== "function")) {
      throw new TypeError("HerdHarbor cloud state normalizer is required.");
    }
    return value;
  }

  function positiveInteger(value, label) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 1) throw new TypeError(`${label} must be a positive integer.`);
    return number;
  }

  function rowVersion(row) {
    const version = Number(row?.record_version ?? row?.recordVersion ?? 0);
    return Number.isSafeInteger(version) && version > 0 ? version : null;
  }

  function rowRecordId(row) {
    return String(row?.record_id ?? row?.recordId ?? "");
  }

  function rowDeletedAt(row) {
    return row?.deleted_at ?? row?.deletedAt ?? null;
  }

  function manifestStage(manifest) {
    const stage = String(manifest?.cutover_stage ?? manifest?.cutoverStage ?? "legacy");
    return VALID_STAGES.has(stage) ? stage : "legacy";
  }

  function manifestGeneration(manifest) {
    const generation = Number(manifest?.sync_generation ?? manifest?.syncGeneration ?? 0);
    return Number.isSafeInteger(generation) && generation >= 0 ? generation : 0;
  }

  function manifestMetadata(manifest) {
    return manifest?.metadata && typeof manifest.metadata === "object" && !Array.isArray(manifest.metadata)
      ? manifest.metadata
      : {};
  }

  function controllerError(message, code) {
    const error = new Error(message);
    error.name = "HerdHarborCloudShadowSyncError";
    error.code = code;
    return error;
  }

  function createShadowSyncController(options = {}) {
    const store = requiredStore(options.recordStore);
    const mapper = requiredNormalizer(options.normalizer || normalizer);
    const maxMutations = positiveInteger(options.maxMutations || DEFAULT_MAX_MUTATIONS, "maxMutations");
    const now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
    const onEvent = typeof options.onEvent === "function" ? options.onEvent : () => {};
    let enabled = options.enabled === true;

    function emit(type, detail = {}) {
      try {
        onEvent({ type, release: RELEASE, ...detail });
      } catch {}
    }

    function setEnabled(value) {
      enabled = value === true;
      emit("shadow-toggle", { enabled });
      return enabled;
    }

    function isEnabled() {
      return enabled;
    }

    function plan(snapshot, previousRows = []) {
      const mapped = mapper.mapLegacySnapshot(snapshot);
      const diff = mapper.diffNormalizedRecords(previousRows, mapped.records);
      return Object.freeze({
        namespace: mapped.namespace,
        checksum: mapped.checksum,
        recordCount: mapped.records.length,
        puts: diff.puts,
        tombstones: diff.tombstones,
        mutationCount: diff.puts.length + diff.tombstones.length
      });
    }

    async function resolvePreviousRows(previousRows) {
      if (Array.isArray(previousRows)) return previousRows;
      return store.list(mapper.namespace, { includeDeleted: true });
    }

    function versionMap(rows) {
      const versions = new Map();
      for (const row of Array.isArray(rows) ? rows : []) {
        const recordId = rowRecordId(row);
        const version = rowVersion(row);
        if (recordId && version) versions.set(recordId, version);
      }
      return versions;
    }

    async function sync(snapshot, syncOptions = {}) {
      const mapped = mapper.mapLegacySnapshot(snapshot);
      if (!enabled || syncOptions.dryRun === true) {
        const previousRows = Array.isArray(syncOptions.previousRows) ? syncOptions.previousRows : [];
        const preview = mapper.diffNormalizedRecords(previousRows, mapped.records);
        const result = {
          skipped: true,
          reason: !enabled ? "disabled" : "dry-run",
          checksum: mapped.checksum,
          recordCount: mapped.records.length,
          puts: preview.puts.length,
          tombstones: preview.tombstones.length
        };
        emit("shadow-skipped", result);
        return result;
      }

      const manifest = await store.getManifest();
      const stage = manifestStage(manifest);
      const generation = manifestGeneration(manifest);
      if (stage === "normalized") {
        const result = {
          skipped: true,
          reason: "normalized-authoritative",
          checksum: mapped.checksum,
          recordCount: mapped.records.length,
          puts: 0,
          tombstones: 0,
          generation
        };
        emit("shadow-skipped", result);
        return result;
      }

      const previousRows = await resolvePreviousRows(syncOptions.previousRows);
      const diff = mapper.diffNormalizedRecords(previousRows, mapped.records);
      const mutationCount = diff.puts.length + diff.tombstones.length;
      if (mutationCount > maxMutations) {
        throw controllerError(
          `Shadow sync planned ${mutationCount} record mutations, above the ${maxMutations} safety limit.`,
          "HH_SHADOW_MUTATION_LIMIT"
        );
      }

      const versions = versionMap(previousRows);
      const puts = diff.puts.map((record) => {
        const expectedVersion = versions.get(record.record_id);
        return {
          ...record,
          ...(expectedVersion ? { expectedVersion } : {})
        };
      });
      const tombstones = diff.tombstones.map((record) => {
        const expectedVersion = versions.get(record.record_id);
        if (!expectedVersion) {
          throw controllerError(
            `Cannot tombstone ${record.record_id} without a known cloud version.`,
            "HH_SHADOW_VERSION_REQUIRED"
          );
        }
        return { ...record, expectedVersion };
      });

      emit("shadow-start", {
        stage,
        generation,
        checksum: mapped.checksum,
        recordCount: mapped.records.length,
        puts: puts.length,
        tombstones: tombstones.length
      });

      const completedAt = now();
      const nextStage = stage === "legacy" ? "shadow" : stage;
      const nextMetadata = {
        ...manifestMetadata(manifest),
        normalizer_version: mapper.version || "unknown",
        source_checksum: mapped.checksum,
        normalized_record_count: mapped.records.length,
        last_shadow_write_at: completedAt,
        last_shadow_puts: puts.length,
        last_shadow_tombstones: tombstones.length
      };
      if (mutationCount > 0) {
        nextMetadata.verified_checksum = null;
        nextMetadata.last_shadow_verified_at = null;
        nextMetadata.verification_record_count = null;
      }

      const manifestPatch = {
        schemaVersion: mapper.formatVersion || 1,
        cutoverStage: nextStage,
        expectedGeneration: generation,
        legacySnapshotUpdatedAt: syncOptions.legacySnapshotUpdatedAt || completedAt,
        lastBackfillAt: completedAt,
        metadata: nextMetadata
      };
      if (mutationCount > 0) manifestPatch.normalizedVerifiedAt = null;

      const batch = await store.applyBatch({ puts, tombstones, manifestPatch });
      const nextGeneration = Number(batch?.generation);
      const result = {
        skipped: false,
        stage: nextStage,
        checksum: mapped.checksum,
        recordCount: mapped.records.length,
        puts: puts.length,
        tombstones: tombstones.length,
        generation: Number.isSafeInteger(nextGeneration) && nextGeneration >= 0
          ? nextGeneration
          : generation + (mutationCount > 0 ? 1 : 0),
        completedAt
      };
      emit("shadow-complete", result);
      return result;
    }

    async function verify(snapshot, verifyOptions = {}) {
      const rows = Array.isArray(verifyOptions.rows)
        ? verifyOptions.rows
        : await store.list(mapper.namespace, { includeDeleted: true });
      const reconstructed = mapper.reassembleLegacySnapshot(rows);
      const expectedChecksum = mapper.snapshotChecksum(snapshot);
      const actualChecksum = mapper.snapshotChecksum(reconstructed);
      const result = {
        ok: expectedChecksum === actualChecksum,
        expectedChecksum,
        actualChecksum,
        recordCount: rows.filter((row) => !rowDeletedAt(row)).length
      };
      if (!result.ok && verifyOptions.throwOnMismatch !== false) {
        throw controllerError("Shadow normalized state does not match the legacy snapshot.", "HH_SHADOW_VERIFY_MISMATCH");
      }
      emit("shadow-verify", result);
      return result;
    }

    async function verifyAndRecord(snapshot, verifyOptions = {}) {
      if (!enabled) {
        const result = { skipped: true, reason: "disabled" };
        emit("shadow-verify-skipped", result);
        return result;
      }

      const manifest = await store.getManifest();
      const stage = manifestStage(manifest);
      const generation = manifestGeneration(manifest);
      if (stage !== "shadow" && stage !== "dual_write") {
        throw controllerError(
          `Shadow verification cannot be recorded while migration stage is ${stage}.`,
          "HH_SHADOW_STAGE_REQUIRED"
        );
      }

      const rows = Array.isArray(verifyOptions.rows)
        ? verifyOptions.rows
        : await store.list(mapper.namespace, { includeDeleted: true });
      const verification = await verify(snapshot, { ...verifyOptions, rows, throwOnMismatch: true });
      const marked = await store.markVerified({
        expectedGeneration: generation,
        checksum: verification.actualChecksum,
        recordCount: verification.recordCount
      });
      const verifiedAt = marked?.verified_at || marked?.verifiedAt || now();

      const result = {
        ...verification,
        skipped: false,
        stage,
        generation,
        verifiedAt
      };
      emit("shadow-verify-recorded", result);
      return result;
    }

    return Object.freeze({
      setEnabled,
      isEnabled,
      plan,
      sync,
      verify,
      verifyAndRecord
    });
  }

  return Object.freeze({
    version: VERSION,
    release: RELEASE,
    defaultMaxMutations: DEFAULT_MAX_MUTATIONS,
    createShadowSyncController
  });
});
