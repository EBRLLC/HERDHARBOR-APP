(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborCloudRecordStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "0.1-foundation";
  const RELEASE = "1.8.3";
  const RECORD_TABLE = "herdharbor_sync_records";
  const MANIFEST_TABLE = "herdharbor_sync_manifest";
  const NAMESPACE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
  const RECORD_ID_MAX_LENGTH = 160;
  const CUTOVER_STAGES = new Set(["legacy", "shadow", "dual_write", "normalized"]);

  function requiredText(value, label, maxLength) {
    const text = String(value == null ? "" : value).trim();
    if (!text) throw new TypeError(`${label} is required.`);
    if (text.length > maxLength) throw new TypeError(`${label} is too long.`);
    return text;
  }

  function normalizeNamespace(value) {
    const namespace = requiredText(value, "namespace", 64).toLowerCase();
    if (!NAMESPACE_PATTERN.test(namespace)) {
      throw new TypeError("namespace must use lowercase letters, numbers, hyphens, or underscores.");
    }
    return namespace;
  }

  function normalizeRecordId(value) {
    return requiredText(value, "record_id", RECORD_ID_MAX_LENGTH);
  }

  function normalizePayload(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError("payload must be a JSON object.");
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      throw new TypeError("payload must be JSON serializable.");
    }
  }

  function normalizeExpectedVersion(value) {
    if (value === undefined || value === null) return null;
    const version = Number(value);
    if (!Number.isSafeInteger(version) || version < 1) {
      throw new TypeError("expectedVersion must be a positive integer.");
    }
    return version;
  }

  function providerError(operation, error) {
    const wrapped = new Error(error?.message || `Normalized cloud ${operation} failed.`);
    wrapped.name = "HerdHarborCloudRecordError";
    wrapped.code = String(error?.code || "provider_error");
    wrapped.status = Number(error?.status || error?.statusCode || 0) || null;
    wrapped.operation = operation;
    return wrapped;
  }

  function conflictError(namespace, recordId, expectedVersion) {
    const error = new Error("The cloud record changed before this update completed.");
    error.name = "HerdHarborCloudRecordConflict";
    error.code = "HH_SYNC_CONFLICT";
    error.namespace = namespace;
    error.recordId = recordId;
    error.expectedVersion = expectedVersion;
    return error;
  }

  function createRecordStore({ client, userId } = {}) {
    if (!client?.from) throw new TypeError("A Supabase client is required.");
    const ownerId = requiredText(userId, "userId", 128);

    async function list(namespace, options = {}) {
      const safeNamespace = normalizeNamespace(namespace);
      let query = client
        .from(RECORD_TABLE)
        .select("namespace,record_id,payload,record_version,deleted_at,created_at,updated_at")
        .eq("user_id", ownerId)
        .eq("namespace", safeNamespace)
        .order("updated_at", { ascending: true });

      if (!options.includeDeleted) query = query.is("deleted_at", null);
      const { data, error } = await query;
      if (error) throw providerError("list", error);
      return Array.isArray(data) ? data : [];
    }

    async function get(namespace, recordId, options = {}) {
      const safeNamespace = normalizeNamespace(namespace);
      const safeRecordId = normalizeRecordId(recordId);
      let query = client
        .from(RECORD_TABLE)
        .select("namespace,record_id,payload,record_version,deleted_at,created_at,updated_at")
        .eq("user_id", ownerId)
        .eq("namespace", safeNamespace)
        .eq("record_id", safeRecordId);

      if (!options.includeDeleted) query = query.is("deleted_at", null);
      const { data, error } = await query.maybeSingle();
      if (error) throw providerError("get", error);
      return data || null;
    }

    async function put(namespace, recordId, payload, options = {}) {
      const safeNamespace = normalizeNamespace(namespace);
      const safeRecordId = normalizeRecordId(recordId);
      const safePayload = normalizePayload(payload);
      const expectedVersion = normalizeExpectedVersion(options.expectedVersion);

      if (expectedVersion !== null) {
        const { data, error } = await client
          .from(RECORD_TABLE)
          .update({ payload: safePayload, deleted_at: null })
          .eq("user_id", ownerId)
          .eq("namespace", safeNamespace)
          .eq("record_id", safeRecordId)
          .eq("record_version", expectedVersion)
          .select("namespace,record_id,payload,record_version,deleted_at,created_at,updated_at")
          .maybeSingle();

        if (error) throw providerError("update", error);
        if (!data) throw conflictError(safeNamespace, safeRecordId, expectedVersion);
        return data;
      }

      const { data, error } = await client
        .from(RECORD_TABLE)
        .upsert({
          user_id: ownerId,
          namespace: safeNamespace,
          record_id: safeRecordId,
          payload: safePayload,
          deleted_at: null
        }, { onConflict: "user_id,namespace,record_id" })
        .select("namespace,record_id,payload,record_version,deleted_at,created_at,updated_at")
        .single();

      if (error) throw providerError("upsert", error);
      return data;
    }

    async function tombstone(namespace, recordId, options = {}) {
      const safeNamespace = normalizeNamespace(namespace);
      const safeRecordId = normalizeRecordId(recordId);
      const expectedVersion = normalizeExpectedVersion(options.expectedVersion);
      let query = client
        .from(RECORD_TABLE)
        .update({ deleted_at: new Date().toISOString() })
        .eq("user_id", ownerId)
        .eq("namespace", safeNamespace)
        .eq("record_id", safeRecordId);

      if (expectedVersion !== null) query = query.eq("record_version", expectedVersion);
      const { data, error } = await query
        .select("namespace,record_id,payload,record_version,deleted_at,created_at,updated_at")
        .maybeSingle();

      if (error) throw providerError("tombstone", error);
      if (!data && expectedVersion !== null) {
        throw conflictError(safeNamespace, safeRecordId, expectedVersion);
      }
      return data || null;
    }

    async function getManifest() {
      const { data, error } = await client
        .from(MANIFEST_TABLE)
        .select("schema_version,cutover_stage,legacy_snapshot_updated_at,last_backfill_at,normalized_verified_at,metadata,created_at,updated_at")
        .eq("user_id", ownerId)
        .maybeSingle();
      if (error) throw providerError("manifest-read", error);
      return data || null;
    }

    async function putManifest(patch = {}) {
      const row = { user_id: ownerId };
      if (patch.schemaVersion !== undefined) {
        const schemaVersion = Number(patch.schemaVersion);
        if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 1) {
          throw new TypeError("schemaVersion must be a positive integer.");
        }
        row.schema_version = schemaVersion;
      }
      if (patch.cutoverStage !== undefined) {
        const stage = String(patch.cutoverStage || "").trim();
        if (!CUTOVER_STAGES.has(stage)) throw new TypeError("Invalid cutoverStage.");
        row.cutover_stage = stage;
      }
      if (patch.legacySnapshotUpdatedAt !== undefined) {
        row.legacy_snapshot_updated_at = patch.legacySnapshotUpdatedAt || null;
      }
      if (patch.lastBackfillAt !== undefined) row.last_backfill_at = patch.lastBackfillAt || null;
      if (patch.normalizedVerifiedAt !== undefined) {
        row.normalized_verified_at = patch.normalizedVerifiedAt || null;
      }
      if (patch.metadata !== undefined) row.metadata = normalizePayload(patch.metadata);

      const { data, error } = await client
        .from(MANIFEST_TABLE)
        .upsert(row, { onConflict: "user_id" })
        .select("schema_version,cutover_stage,legacy_snapshot_updated_at,last_backfill_at,normalized_verified_at,metadata,created_at,updated_at")
        .single();
      if (error) throw providerError("manifest-write", error);
      return data;
    }

    return Object.freeze({
      list,
      get,
      put,
      tombstone,
      getManifest,
      putManifest
    });
  }

  return Object.freeze({
    version: VERSION,
    release: RELEASE,
    recordTable: RECORD_TABLE,
    manifestTable: MANIFEST_TABLE,
    normalizeNamespace,
    normalizeRecordId,
    normalizePayload,
    createRecordStore
  });
});
