(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborCloudRecordStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "0.9-record-cas";
  const RELEASE = "1.8.3";
  const RECORD_TABLE = "herdharbor_sync_records";
  const MANIFEST_TABLE = "herdharbor_sync_manifest";
  const BATCH_RPC = "herdharbor_sync_apply_batch";
  const RECORD_RPC = "herdharbor_sync_apply_record";
  const VERIFY_RPC = "herdharbor_sync_mark_verified";
  const PREPARE_WRITER_RPC = "herdharbor_sync_prepare_normalized_writer_guarded";
  const STAGE_RPC = "herdharbor_sync_set_stage";
  const NAMESPACE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
  const RECORD_ID_MAX_LENGTH = 160;
  const CUTOVER_STAGES = new Set(["legacy", "shadow", "dual_write", "normalized"]);
  const BATCH_STAGES = new Set(["legacy", "shadow", "dual_write"]);
  const READ_PAGE_SIZE = 500;
  const MAX_READ_ROWS = 100000;

  function requiredText(value, label, maxLength) {
    const text = String(value == null ? "" : value).trim();
    if (!text) throw new TypeError(`${label} is required.`);
    if (text.length > maxLength) throw new TypeError(`${label} is too long.`);
    return text;
  }

  function strictInteger(value, label, minimum) {
    if (value === null || value === undefined || typeof value === "boolean") {
      throw new TypeError(`${label} must be an integer.`);
    }
    if (typeof value === "string" && !/^\d+$/.test(value.trim())) {
      throw new TypeError(`${label} must be an integer.`);
    }
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < minimum) {
      throw new TypeError(`${label} must be ${minimum === 0 ? "a non-negative" : "a positive"} integer.`);
    }
    return number;
  }

  function normalizeNamespace(value) {
    const namespace = requiredText(value, "namespace", 64).toLowerCase();
    if (!NAMESPACE_PATTERN.test(namespace)) throw new TypeError("namespace must use lowercase letters, numbers, hyphens, or underscores.");
    return namespace;
  }
  function normalizeRecordId(value) { return requiredText(value, "record_id", RECORD_ID_MAX_LENGTH); }
  function normalizeChecksum(value, label = "payload_checksum") { return requiredText(value, label, 128); }
  function normalizePayload(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("payload must be a JSON object.");
    try { return JSON.parse(JSON.stringify(value)); } catch { throw new TypeError("payload must be JSON serializable."); }
  }
  function normalizeExpectedVersion(value) {
    if (value === undefined || value === null) return null;
    return strictInteger(value, "expectedVersion", 1);
  }
  function normalizeGeneration(value) { return strictInteger(value, "expectedGeneration", 0); }
  function normalizeRecordCount(value) { return strictInteger(value, "recordCount", 0); }
  function normalizeFormatVersion(value) { return strictInteger(value, "formatVersion", 1); }

  function knownProviderFailure(operation, error) {
    const message = String(error?.message || "");
    const knownCodes = ["HH_SYNC_CONFLICT","HH_SYNC_RECORD_WRITER_STAGE_REQUIRED","HH_SYNC_RECORD_VERSION_REQUIRED","HH_SYNC_INVALID_RECORD_MUTATION","HH_SYNC_WRITER_VERSION_MISMATCH","HH_SYNC_VERIFY_STALE","HH_SYNC_BATCH_LIMIT","HH_SYNC_INVALID_BATCH","HH_SYNC_INVALID_PUT","HH_SYNC_INVALID_TOMBSTONE","HH_SYNC_INVALID_VERSION","HH_SYNC_INVALID_CHECKSUM","HH_SYNC_INVALID_VERIFICATION","HH_SYNC_RECORD_COUNT_MISMATCH","HH_SYNC_AUTH_REQUIRED","HH_SYNC_NORMALIZED_REQUIRES_VERIFICATION","HH_SYNC_NORMALIZED_WRITER_REQUIRED","HH_SYNC_STAGE_VERIFICATION_REQUIRED","HH_SYNC_ALREADY_NORMALIZED","HH_SYNC_EXPECTED_GENERATION_REQUIRED","HH_SYNC_INVALID_GENERATION","HH_SYNC_INVALID_STAGE","HH_SYNC_INVALID_STAGE_TRANSITION","HH_SYNC_INVALID_BATCH_STAGE","HH_SYNC_STAGE_CHANGE_REQUIRES_RPC","HH_SYNC_INVALID_SCHEMA_VERSION","HH_SYNC_INVALID_MANIFEST_METADATA","HH_SYNC_INVALID_WRITER_READINESS","HH_SYNC_DUAL_WRITE_STAGE_REQUIRED","HH_SYNC_WRITER_FORMAT_MISMATCH","HH_SYNC_LEGACY_GUARD_REQUIRED","HH_SYNC_LEGACY_WRITE_BLOCKED_AFTER_CUTOVER","HH_SYNC_LEGACY_GUARD_USER_REQUIRED","HH_SYNC_INITIAL_STAGE_MUST_BE_LEGACY","HH_SYNC_MANIFEST_MISSING"];
    const known = knownCodes.find((code) => message.includes(code));
    if (!known) return null;
    const messages = { HH_SYNC_CONFLICT:"The normalized cloud record changed on another device.", HH_SYNC_RECORD_WRITER_STAGE_REQUIRED:"Record-level normalized writes are not enabled for this account stage.", HH_SYNC_RECORD_VERSION_REQUIRED:"The normalized record mutation requires a known cloud version.", HH_SYNC_INVALID_RECORD_MUTATION:"The normalized record mutation is invalid.", HH_SYNC_WRITER_VERSION_MISMATCH:"This normalized writer does not match the prepared cloud writer version.", HH_SYNC_VERIFY_STALE:"The normalized cloud state changed before verification completed.", HH_SYNC_ALREADY_NORMALIZED:"Legacy shadow writes are disabled after normalized cutover.", HH_SYNC_STAGE_VERIFICATION_REQUIRED:"A current normalized verification is required before this migration stage change.", HH_SYNC_NORMALIZED_WRITER_REQUIRED:"The normalized writer has not been prepared for cutover.", HH_SYNC_DUAL_WRITE_STAGE_REQUIRED:"Normalized writer preparation is only allowed during dual-write migration.", HH_SYNC_WRITER_FORMAT_MISMATCH:"The normalized writer does not match the verified cloud format.", HH_SYNC_LEGACY_GUARD_REQUIRED:"The stale-client legacy-write guard is required before normalized cutover.", HH_SYNC_LEGACY_WRITE_BLOCKED_AFTER_CUTOVER:"Legacy cloud writes are blocked because normalized sync is authoritative.", HH_SYNC_INVALID_STAGE_TRANSITION:"That cloud migration stage transition is not allowed.", HH_SYNC_MANIFEST_MISSING:"The normalized cloud migration manifest is missing.", HH_SYNC_RECORD_COUNT_MISMATCH:"The normalized cloud record count did not match the verified snapshot." };
    const wrapped = new Error(messages[known] || "The normalized cloud operation was rejected by its safety gate.");
    wrapped.name = "HerdHarborCloudRecordError"; wrapped.code = known; wrapped.status = Number(error?.status || error?.statusCode || 0) || null; wrapped.operation = operation; return wrapped;
  }
  function providerError(operation, error) {
    const known = knownProviderFailure(operation, error); if (known) return known;
    const wrapped = new Error(error?.message || `Normalized cloud ${operation} failed.`); wrapped.name="HerdHarborCloudRecordError"; wrapped.code=String(error?.code||"provider_error"); wrapped.status=Number(error?.status||error?.statusCode||0)||null; wrapped.operation=operation; return wrapped;
  }
  function readLimitError(operation) { const error=new Error(`Normalized cloud ${operation} exceeded the ${MAX_READ_ROWS} row safety limit.`); error.name="HerdHarborCloudRecordError"; error.code="HH_SYNC_READ_LIMIT"; error.operation=operation; return error; }

  function batchManifestPatch(patch = {}) {
    const provider = {};
    if (patch.expectedGeneration === undefined || patch.expectedGeneration === null) throw new TypeError("Atomic batches require expectedGeneration.");
    provider.expected_generation = normalizeGeneration(patch.expectedGeneration);
    if (patch.schemaVersion !== undefined) provider.schema_version = strictInteger(patch.schemaVersion, "schemaVersion", 1);
    if (patch.cutoverStage !== undefined) { const stage=String(patch.cutoverStage||"").trim(); if(!BATCH_STAGES.has(stage)) throw new TypeError("Invalid batch cutoverStage."); provider.cutover_stage=stage; }
    if (patch.legacySnapshotUpdatedAt !== undefined) provider.legacy_snapshot_updated_at=patch.legacySnapshotUpdatedAt||null;
    if (patch.lastBackfillAt !== undefined) provider.last_backfill_at=patch.lastBackfillAt||null;
    if (patch.normalizedVerifiedAt !== undefined) provider.normalized_verified_at=patch.normalizedVerifiedAt||null;
    if (patch.metadata !== undefined) provider.metadata=normalizePayload(patch.metadata);
    return provider;
  }

  function createRecordStore({ client, userId } = {}) {
    if (!client?.from || !client?.rpc) throw new TypeError("A Supabase client is required.");
    const ownerId=requiredText(userId,"userId",128);
    async function readRows(namespace, options, fields, operation) {
      const safeNamespace=normalizeNamespace(namespace); const rows=[]; let from=0;
      while(true){ let query=client.from(RECORD_TABLE).select(fields).eq("user_id",ownerId).eq("namespace",safeNamespace).order("record_id",{ascending:true}); if(!options.includeDeleted) query=query.is("deleted_at",null); const supportsRange=typeof query.range==="function"; if(supportsRange) query=query.range(from,from+READ_PAGE_SIZE-1); const {data,error}=await query; if(error) throw providerError(operation,error); const page=Array.isArray(data)?data:[]; if(rows.length+page.length>MAX_READ_ROWS) throw readLimitError(operation); rows.push(...page); if(!supportsRange||page.length<READ_PAGE_SIZE) break; if(rows.length>=MAX_READ_ROWS) throw readLimitError(operation); from+=READ_PAGE_SIZE; }
      return rows;
    }
    async function list(namespace,options={}){return readRows(namespace,options,"namespace,record_id,payload,payload_checksum,record_version,deleted_at","list");}
    async function listHeaders(namespace,options={}){return readRows(namespace,options,"namespace,record_id,payload_checksum,record_version,deleted_at","list-headers");}
    async function get(namespace,recordId,options={}){const safeNamespace=normalizeNamespace(namespace),safeRecordId=normalizeRecordId(recordId);let query=client.from(RECORD_TABLE).select("namespace,record_id,payload,payload_checksum,record_version,deleted_at").eq("user_id",ownerId).eq("namespace",safeNamespace).eq("record_id",safeRecordId);if(!options.includeDeleted)query=query.is("deleted_at",null);const{data,error}=await query.maybeSingle();if(error)throw providerError("get",error);return data||null;}
    async function getManifest(){const{data,error}=await client.from(MANIFEST_TABLE).select("schema_version,cutover_stage,sync_generation,legacy_snapshot_updated_at,last_backfill_at,normalized_verified_at,metadata,updated_at").eq("user_id",ownerId).maybeSingle();if(error)throw providerError("manifest-read",error);return data||null;}
    async function applyBatch({puts=[],tombstones=[],manifestPatch={}}={}){if(!Array.isArray(puts)||!Array.isArray(tombstones))throw new TypeError("puts and tombstones must be arrays.");const seen=new Set();const providerPuts=puts.map(record=>{const namespace=normalizeNamespace(record?.namespace),recordId=normalizeRecordId(record?.record_id??record?.recordId),key=`${namespace}\u0000${recordId}`;if(seen.has(key))throw new TypeError(`Duplicate normalized batch record: ${recordId}.`);seen.add(key);const row={namespace,record_id:recordId,payload:normalizePayload(record?.payload),payload_checksum:normalizeChecksum(record?.payload_checksum??record?.payloadChecksum)};const expectedVersion=normalizeExpectedVersion(record?.expectedVersion??record?.expected_version);if(expectedVersion!==null)row.expected_version=expectedVersion;return row;});const providerTombstones=tombstones.map(record=>{const namespace=normalizeNamespace(record?.namespace),recordId=normalizeRecordId(record?.record_id??record?.recordId),key=`${namespace}\u0000${recordId}`;if(seen.has(key))throw new TypeError(`Duplicate normalized batch record: ${recordId}.`);seen.add(key);const expectedVersion=normalizeExpectedVersion(record?.expectedVersion??record?.expected_version);if(expectedVersion===null)throw new TypeError("Tombstones require expectedVersion.");return{namespace,record_id:recordId,expected_version:expectedVersion};});const{data,error}=await client.rpc(BATCH_RPC,{p_puts:providerPuts,p_tombstones:providerTombstones,p_manifest_patch:batchManifestPatch(manifestPatch)});if(error)throw providerError("batch-write",error);return data||{ok:true,puts:providerPuts.length,tombstones:providerTombstones.length};}
    async function applyRecordMutation({namespace,recordId,payload,payloadChecksum,expectedVersion,deleted=false,writerVersion=null}={}) {
      const safeNamespace=normalizeNamespace(namespace);
      const safeRecordId=normalizeRecordId(recordId);
      const safeExpectedVersion=normalizeExpectedVersion(expectedVersion);
      const isDelete=deleted===true;
      if(isDelete && safeExpectedVersion===null) throw new TypeError("Deleted record mutations require expectedVersion.");
      const safePayload=isDelete?null:normalizePayload(payload);
      const safeChecksum=isDelete?null:normalizeChecksum(payloadChecksum);
      const safeWriterVersion=writerVersion===undefined||writerVersion===null||String(writerVersion).trim()===""?null:requiredText(writerVersion,"writerVersion",80);
      const {data,error}=await client.rpc(RECORD_RPC,{
        p_namespace:safeNamespace,
        p_record_id:safeRecordId,
        p_payload:safePayload,
        p_payload_checksum:safeChecksum,
        p_expected_version:safeExpectedVersion,
        p_delete:isDelete,
        p_writer_version:safeWriterVersion
      });
      if(error) throw providerError("record-write",error);
      return data||{
        ok:true,
        namespace:safeNamespace,
        record_id:safeRecordId,
        record_version:safeExpectedVersion===null?1:safeExpectedVersion+1,
        deleted:isDelete
      };
    }

    async function markVerified({expectedGeneration,checksum,recordCount}={}){const generation=normalizeGeneration(expectedGeneration),safeChecksum=normalizeChecksum(checksum,"checksum"),safeRecordCount=normalizeRecordCount(recordCount);const{data,error}=await client.rpc(VERIFY_RPC,{p_expected_generation:generation,p_checksum:safeChecksum,p_record_count:safeRecordCount});if(error)throw providerError("mark-verified",error);return data||{ok:true,generation,checksum:safeChecksum,record_count:safeRecordCount};}
    async function prepareNormalizedWriter({expectedGeneration,writerVersion,namespace,formatVersion}={}){const generation=normalizeGeneration(expectedGeneration),safeWriterVersion=requiredText(writerVersion,"writerVersion",80),safeNamespace=normalizeNamespace(namespace),safeFormatVersion=normalizeFormatVersion(formatVersion);const{data,error}=await client.rpc(PREPARE_WRITER_RPC,{p_expected_generation:generation,p_writer_version:safeWriterVersion,p_namespace:safeNamespace,p_format_version:safeFormatVersion});if(error)throw providerError("prepare-normalized-writer",error);return data||{ok:true,generation,writer_version:safeWriterVersion};}
    async function setStage({targetStage,expectedGeneration}={}){const stage=String(targetStage||"").trim();if(!CUTOVER_STAGES.has(stage))throw new TypeError("Invalid targetStage.");const generation=normalizeGeneration(expectedGeneration);const{data,error}=await client.rpc(STAGE_RPC,{p_target_stage:stage,p_expected_generation:generation});if(error)throw providerError("set-stage",error);return data||{ok:true,stage,generation};}
    return Object.freeze({list,listHeaders,get,getManifest,applyBatch,applyRecordMutation,markVerified,prepareNormalizedWriter,setStage});
  }
  return Object.freeze({version:VERSION,release:RELEASE,recordTable:RECORD_TABLE,manifestTable:MANIFEST_TABLE,batchRpc:BATCH_RPC,recordRpc:RECORD_RPC,verifyRpc:VERIFY_RPC,prepareWriterRpc:PREPARE_WRITER_RPC,stageRpc:STAGE_RPC,readPageSize:READ_PAGE_SIZE,maxReadRows:MAX_READ_ROWS,normalizeNamespace,normalizeRecordId,normalizePayload,createRecordStore});
});
