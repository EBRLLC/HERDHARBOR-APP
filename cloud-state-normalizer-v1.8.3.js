(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborCloudStateNormalizer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "0.6-canonical-checksums";
  const RELEASE = "1.8.3";
  const FORMAT_VERSION = 2;
  const NAMESPACE = "legacy-state";
  const SNAPSHOT_MANIFEST_ID = "snapshot-manifest";
  const IDENTITY_KEYS = ["id", "uuid", "recordId", "record_id", "key"];

  function isPlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function cloneJson(value, label = "value") {
    if (value === undefined) throw new TypeError(`${label} must be JSON serializable.`);
    try {
      const serialized = JSON.stringify(value);
      if (serialized === undefined) throw new Error("undefined");
      return JSON.parse(serialized);
    } catch {
      throw new TypeError(`${label} must be JSON serializable.`);
    }
  }

  function normalizeSnapshot(value) {
    if (!isPlainObject(value)) throw new TypeError("legacy snapshot must be a JSON object.");
    return cloneJson(value, "legacy snapshot");
  }

  function stableStringify(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) {
      return `[${value.map((item) => stableStringify(item)).join(",")}]`;
    }
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }

  function checksumText(text) {
    const input = String(text == null ? "" : text);
    let left = 0x811c9dc5;
    let right = 0x9e3779b9;
    for (let index = 0; index < input.length; index += 1) {
      const code = input.charCodeAt(index);
      left ^= code;
      left = Math.imul(left, 0x01000193) >>> 0;
      right ^= code + index;
      right = Math.imul(right, 0x85ebca6b) >>> 0;
      right = (right ^ (right >>> 13)) >>> 0;
    }
    return `${left.toString(16).padStart(8, "0")}${right.toString(16).padStart(8, "0")}`;
  }

  function checksumValue(value) {
    return `hh64:${checksumText(stableStringify(value))}`;
  }

  function snapshotChecksum(snapshot) {
    return checksumValue(normalizeSnapshot(snapshot));
  }

  function token(value) {
    const text = String(value == null ? "" : value);
    const slug = text
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "value";
    return `${slug}-${checksumText(text)}`;
  }

  function stableIdentity(item) {
    if (!isPlainObject(item)) return null;
    for (const key of IDENTITY_KEYS) {
      const value = item[key];
      if (typeof value === "string" && value.trim()) return `${key}:${value.trim()}`;
      if (typeof value === "number" && Number.isFinite(value)) return `${key}:${value}`;
    }
    return null;
  }

  function rootRecordId(key) {
    return `root:${token(key)}`;
  }

  function arrayManifestRecordId(key) {
    return `array:${token(key)}`;
  }

  function arrayItemRecordId(key, item, identityCounts, duplicateCounts) {
    const identity = stableIdentity(item);
    // Treat an explicit identity as stable only when it is unique inside its
    // legacy array. Duplicate IDs can exist in old data; content-derived IDs
    // prevent two distinct duplicate-ID items from swapping cloud rows when
    // their order changes.
    const uniqueIdentity = identity && identityCounts.get(identity) === 1 ? identity : null;
    const identityBasis = uniqueIdentity || `content:${stableStringify(item)}`;
    const identityToken = token(identityBasis);
    const base = `item:${token(key)}:${identityToken}`;
    const seen = duplicateCounts.get(base) || 0;
    duplicateCounts.set(base, seen + 1);
    return seen === 0 ? base : `${base}:dup-${seen}`;
  }

  function makeRecord(recordId, payload) {
    return {
      namespace: NAMESPACE,
      record_id: recordId,
      payload,
      payload_checksum: checksumValue(payload)
    };
  }

  function integrityError(message, code = "HH_NORMALIZED_INTEGRITY") {
    const error = new Error(message);
    error.name = "HerdHarborCloudNormalizationError";
    error.code = code;
    return error;
  }

  function assertUniqueRecordIds(records) {
    const seen = new Set();
    for (const record of records) {
      if (seen.has(record.record_id)) {
        throw integrityError(
          `Normalized record ID collision detected for ${record.record_id}.`,
          "HH_NORMALIZED_RECORD_ID_COLLISION"
        );
      }
      seen.add(record.record_id);
    }
  }

  function mapLegacySnapshot(snapshot) {
    const safeSnapshot = normalizeSnapshot(snapshot);
    const records = [];
    const entries = [];
    const keys = Object.keys(safeSnapshot).sort();

    for (const key of keys) {
      const value = safeSnapshot[key];
      if (!Array.isArray(value)) {
        const recordId = rootRecordId(key);
        records.push(makeRecord(recordId, {
          kind: "root_value",
          key,
          value
        }));
        entries.push({ key, kind: "root_value", record_id: recordId });
        continue;
      }

      const identityCounts = new Map();
      for (const item of value) {
        const identity = stableIdentity(item);
        if (identity) identityCounts.set(identity, (identityCounts.get(identity) || 0) + 1);
      }
      const duplicateCounts = new Map();
      const itemRecordIds = value.map((item) => {
        const recordId = arrayItemRecordId(key, item, identityCounts, duplicateCounts);
        records.push(makeRecord(recordId, {
          kind: "array_item",
          key,
          value: item
        }));
        return recordId;
      });
      const recordId = arrayManifestRecordId(key);
      records.push(makeRecord(recordId, {
        kind: "array_manifest",
        key,
        length: value.length,
        item_record_ids: itemRecordIds
      }));
      entries.push({ key, kind: "array", record_id: recordId });
    }

    const checksum = checksumValue(safeSnapshot);
    records.push(makeRecord(SNAPSHOT_MANIFEST_ID, {
      kind: "snapshot_manifest",
      format_version: FORMAT_VERSION,
      snapshot_checksum: checksum,
      entry_count: entries.length,
      entries
    }));

    assertUniqueRecordIds(records);
    records.sort((left, right) => left.record_id.localeCompare(right.record_id));
    return Object.freeze({
      namespace: NAMESPACE,
      formatVersion: FORMAT_VERSION,
      checksum,
      records
    });
  }

  function rowRecordId(row) {
    return String(row?.record_id ?? row?.recordId ?? "");
  }

  function rowNamespace(row) {
    return String(row?.namespace ?? "");
  }

  function rowDeletedAt(row) {
    return row?.deleted_at ?? row?.deletedAt ?? null;
  }

  function rowPayload(row) {
    return row?.payload;
  }

  function rowPayloadChecksum(row) {
    const supplied = String(row?.payload_checksum ?? row?.payloadChecksum ?? "").trim();
    if (supplied) return supplied;
    const payload = rowPayload(row);
    return payload && typeof payload === "object" ? checksumValue(payload) : "";
  }

  function activeRecordMap(rows) {
    const map = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      if (rowNamespace(row) !== NAMESPACE || rowDeletedAt(row)) continue;
      const recordId = rowRecordId(row);
      if (!recordId) continue;
      if (map.has(recordId)) {
        throw integrityError(
          `Duplicate normalized cloud record ${recordId}.`,
          "HH_NORMALIZED_DUPLICATE_RECORD"
        );
      }
      map.set(recordId, rowPayload(row));
    }
    return map;
  }

  function reassembleLegacySnapshotWithMetadata(rows, options = {}) {
    const records = activeRecordMap(rows);
    const manifest = records.get(SNAPSHOT_MANIFEST_ID);
    if (!manifest || manifest.kind !== "snapshot_manifest") {
      throw integrityError("Normalized cloud snapshot manifest is missing.", "HH_NORMALIZED_MANIFEST_MISSING");
    }
    if (Number(manifest.format_version) !== FORMAT_VERSION) {
      throw integrityError("Normalized cloud snapshot format is not supported.", "HH_NORMALIZED_FORMAT_UNSUPPORTED");
    }
    if (!Array.isArray(manifest.entries)) {
      throw integrityError("Normalized cloud snapshot manifest entries are invalid.");
    }
    if (!Number.isSafeInteger(Number(manifest.entry_count)) || Number(manifest.entry_count) !== manifest.entries.length) {
      throw integrityError("Normalized cloud snapshot manifest entry count is invalid.");
    }

    // Null-prototype assembly avoids __proto__ setter behavior. A final JSON
    // clone restores the ordinary JSON.parse object shape without prototype
    // pollution or loss of legal keys such as "" and "__proto__".
    const output = Object.create(null);
    const seenKeys = new Set();
    for (const entry of manifest.entries) {
      if (!entry || typeof entry !== "object" || !("key" in entry)) {
        throw integrityError("Normalized cloud snapshot manifest contains an invalid entry.");
      }
      const key = String(entry.key);
      const recordId = String(entry.record_id ?? "");
      if (!recordId) throw integrityError("Normalized cloud snapshot manifest contains an invalid record reference.");
      if (seenKeys.has(key)) throw integrityError(`Normalized cloud snapshot contains duplicate key ${key}.`);
      seenKeys.add(key);
      const payload = records.get(recordId);
      if (!payload) throw integrityError(`Normalized cloud record is missing for ${key}.`);

      if (entry.kind === "root_value") {
        if (payload.kind !== "root_value" || payload.key !== key) {
          throw integrityError(`Normalized root record does not match ${key}.`);
        }
        output[key] = cloneJson(payload.value, `normalized root ${key}`);
        continue;
      }

      if (entry.kind !== "array" || payload.kind !== "array_manifest" || payload.key !== key) {
        throw integrityError(`Normalized array manifest does not match ${key}.`);
      }
      if (!Array.isArray(payload.item_record_ids)) {
        throw integrityError(`Normalized array manifest is invalid for ${key}.`);
      }
      const declaredLength = Number(payload.length);
      if (!Number.isSafeInteger(declaredLength) || declaredLength < 0 || declaredLength !== payload.item_record_ids.length) {
        throw integrityError(`Normalized array length is invalid for ${key}.`);
      }
      const seenItemIds = new Set();
      const values = payload.item_record_ids.map((itemRecordId, index) => {
        const safeItemRecordId = String(itemRecordId ?? "");
        if (!safeItemRecordId || seenItemIds.has(safeItemRecordId)) {
          throw integrityError(`Normalized array item reference ${index} is invalid for ${key}.`);
        }
        seenItemIds.add(safeItemRecordId);
        const itemPayload = records.get(safeItemRecordId);
        if (!itemPayload || itemPayload.kind !== "array_item" || itemPayload.key !== key) {
          throw integrityError(`Normalized array item ${index} is missing for ${key}.`);
        }
        return cloneJson(itemPayload.value, `normalized array item ${key}[${index}]`);
      });
      output[key] = values;
    }

    const safeOutput = cloneJson(output, "normalized snapshot");
    const actualChecksum = checksumValue(safeOutput);
    if (options.verifyChecksum !== false && manifest.snapshot_checksum && actualChecksum !== manifest.snapshot_checksum) {
      throw integrityError("Normalized cloud snapshot checksum does not match reconstructed state.", "HH_NORMALIZED_CHECKSUM_MISMATCH");
    }
    return Object.freeze({
      snapshot: safeOutput,
      checksum: actualChecksum,
      manifestChecksum: String(manifest.snapshot_checksum || ""),
      recordCount: records.size
    });
  }

  function reassembleLegacySnapshot(rows, options = {}) {
    return reassembleLegacySnapshotWithMetadata(rows, options).snapshot;
  }

  function recordKey(row) {
    return `${rowNamespace(row)}\u0000${rowRecordId(row)}`;
  }

  function diffNormalizedRecords(previousRows, nextRows) {
    const previous = new Map();
    const next = new Map();

    for (const row of Array.isArray(previousRows) ? previousRows : []) {
      if (rowNamespace(row) !== NAMESPACE || rowDeletedAt(row) || !rowRecordId(row)) continue;
      previous.set(recordKey(row), row);
    }
    for (const row of Array.isArray(nextRows) ? nextRows : []) {
      if (rowNamespace(row) !== NAMESPACE || rowDeletedAt(row) || !rowRecordId(row)) continue;
      next.set(recordKey(row), row);
    }

    const puts = [];
    const tombstones = [];
    for (const [key, row] of next) {
      const prior = previous.get(key);
      if (!prior || rowPayloadChecksum(prior) !== rowPayloadChecksum(row)) puts.push(row);
    }
    for (const [key, row] of previous) {
      if (!next.has(key)) {
        tombstones.push({ namespace: rowNamespace(row), record_id: rowRecordId(row) });
      }
    }

    puts.sort((left, right) => rowRecordId(left).localeCompare(rowRecordId(right)));
    tombstones.sort((left, right) => left.record_id.localeCompare(right.record_id));
    return { puts, tombstones };
  }

  return Object.freeze({
    version: VERSION,
    release: RELEASE,
    formatVersion: FORMAT_VERSION,
    namespace: NAMESPACE,
    snapshotManifestId: SNAPSHOT_MANIFEST_ID,
    stableStringify,
    snapshotChecksum,
    mapLegacySnapshot,
    reassembleLegacySnapshot,
    reassembleLegacySnapshotWithMetadata,
    diffNormalizedRecords
  });
});
