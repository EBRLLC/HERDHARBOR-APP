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

  function strictPayloadIntegrity(row, recordId) {
    const payload = rowPayload(row);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw integrityError(
        `Normalized cloud record ${recordId} has an invalid payload.`,
        "HH_NORMALIZED_ROW_PAYLOAD_INVALID"
      );
    }
    const supplied = String(row?.payload_checksum ?? row?.payloadChecksum ?? "").trim();
    if (!supplied) {
      throw integrityError(
        `Normalized cloud record ${recordId} is missing its payload checksum.`,
        "HH_NORMALIZED_ROW_CHECKSUM_MISSING"
      );
    }
    const actual = checksumValue(payload);
    if (actual !== supplied) {
      throw integrityError(
        `Normalized cloud record ${recordId} failed payload integrity validation.`,
        "HH_NORMALIZED_ROW_CHECKSUM_MISMATCH"
      );
    }
    return payload;
  }

  function reassembleAuthoritativeSnapshotWithMetadata(rows) {
    const records = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      if (rowNamespace(row) !== NAMESPACE || rowDeletedAt(row)) continue;
      const recordId = rowRecordId(row);
      if (!recordId) {
        throw integrityError(
          "Normalized cloud contains an active record without an identifier.",
          "HH_NORMALIZED_RECORD_ID_MISSING"
        );
      }
      if (records.has(recordId)) {
        throw integrityError(
          `Duplicate normalized cloud record ${recordId}.`,
          "HH_NORMALIZED_DUPLICATE_RECORD"
        );
      }
      records.set(recordId, {
        row,
        payload: strictPayloadIntegrity(row, recordId)
      });
    }

    const checkpoint = records.get(SNAPSHOT_MANIFEST_ID);
    if (!checkpoint || checkpoint.payload.kind !== "snapshot_manifest") {
      throw integrityError(
        "Normalized cloud checkpoint manifest is missing.",
        "HH_NORMALIZED_MANIFEST_MISSING"
      );
    }
    if (Number(checkpoint.payload.format_version) !== FORMAT_VERSION) {
      throw integrityError(
        "Normalized cloud checkpoint format is not supported.",
        "HH_NORMALIZED_FORMAT_UNSUPPORTED"
      );
    }

    const output = Object.create(null);
    const claimedKeys = new Set();
    const referencedItems = new Set();
    const arrayManifests = [];

    for (const [recordId, entry] of records) {
      if (recordId === SNAPSHOT_MANIFEST_ID) continue;
      const payload = entry.payload;
      const kind = String(payload.kind || "");

      if (kind === "root_value") {
        if (!("key" in payload)) {
          throw integrityError("Normalized root record is missing its key.");
        }
        const key = String(payload.key);
        if (claimedKeys.has(key)) {
          throw integrityError(
            `Normalized cloud contains duplicate top-level key ${key}.`,
            "HH_NORMALIZED_DUPLICATE_KEY"
          );
        }
        claimedKeys.add(key);
        output[key] = cloneJson(payload.value, `normalized root ${key}`);
        continue;
      }

      if (kind === "array_manifest") {
        if (!("key" in payload)) {
          throw integrityError("Normalized array manifest is missing its key.");
        }
        arrayManifests.push({ recordId, payload });
        continue;
      }

      if (kind !== "array_item") {
        throw integrityError(
          `Normalized cloud record ${recordId} has unsupported kind ${kind || "unknown"}.`,
          "HH_NORMALIZED_KIND_UNSUPPORTED"
        );
      }
    }

    for (const { payload } of arrayManifests) {
      const key = String(payload.key);
      if (claimedKeys.has(key)) {
        throw integrityError(
          `Normalized cloud contains duplicate top-level key ${key}.`,
          "HH_NORMALIZED_DUPLICATE_KEY"
        );
      }
      claimedKeys.add(key);

      if (!Array.isArray(payload.item_record_ids)) {
        throw integrityError(`Normalized array manifest is invalid for ${key}.`);
      }
      const declaredLength = Number(payload.length);
      if (
        !Number.isSafeInteger(declaredLength) ||
        declaredLength < 0 ||
        declaredLength !== payload.item_record_ids.length
      ) {
        throw integrityError(`Normalized array length is invalid for ${key}.`);
      }

      const localIds = new Set();
      output[key] = payload.item_record_ids.map((value, index) => {
        const itemRecordId = String(value ?? "");
        if (!itemRecordId || localIds.has(itemRecordId) || referencedItems.has(itemRecordId)) {
          throw integrityError(
            `Normalized array item reference ${index} is invalid for ${key}.`,
            "HH_NORMALIZED_ARRAY_REFERENCE_INVALID"
          );
        }
        localIds.add(itemRecordId);
        referencedItems.add(itemRecordId);
        const item = records.get(itemRecordId);
        if (!item || item.payload.kind !== "array_item" || String(item.payload.key) !== key) {
          throw integrityError(
            `Normalized array item ${index} is missing for ${key}.`,
            "HH_NORMALIZED_ARRAY_ITEM_MISSING"
          );
        }
        return cloneJson(item.payload.value, `normalized array item ${key}[${index}]`);
      });
    }

    for (const [recordId, entry] of records) {
      if (entry.payload.kind === "array_item" && !referencedItems.has(recordId)) {
        throw integrityError(
          `Normalized cloud record ${recordId} is orphaned from its array manifest.`,
          "HH_NORMALIZED_ORPHAN_RECORD"
        );
      }
    }

    const safeOutput = cloneJson(output, "normalized authoritative snapshot");
    const actualChecksum = checksumValue(safeOutput);
    const checkpointChecksum = String(checkpoint.payload.snapshot_checksum || "");

    return Object.freeze({
      snapshot: safeOutput,
      checksum: actualChecksum,
      manifestChecksum: checkpointChecksum,
      recordCount: records.size,
      dataRecordCount: Math.max(0, records.size - 1),
      checkpointStale: Boolean(checkpointChecksum) && checkpointChecksum !== actualChecksum
    });
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


  function logicalIdentityValue(item) {
    if (!isPlainObject(item)) return "";
    for (const key of IDENTITY_KEYS) {
      const value = item[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
    }
    return "";
  }

  function rowDomain(row) {
    const payload = rowPayload(row);
    return payload && typeof payload === "object" && "key" in payload ? String(payload.key) : "";
  }

  function rowKind(row) {
    return String(rowPayload(row)?.kind || "");
  }

  function rowLogicalIdentity(row) {
    const payload = rowPayload(row);
    return payload?.kind === "array_item" ? logicalIdentityValue(payload.value) : "";
  }

  function rowsById(rows) {
    const result = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const id = rowRecordId(row);
      if (id) result.set(id, row);
    }
    return result;
  }

  function intentArrayManifest(currentManifest, baselineManifest, primaryId, operation) {
    if (!currentManifest?.payload || currentManifest.payload.kind !== "array_manifest") return currentManifest;
    if (!baselineManifest?.payload || baselineManifest.payload.kind !== "array_manifest") return currentManifest;
    const currentIds = Array.isArray(currentManifest.payload.item_record_ids)
      ? currentManifest.payload.item_record_ids.map(String)
      : [];
    const baselineIds = Array.isArray(baselineManifest.payload.item_record_ids)
      ? baselineManifest.payload.item_record_ids.map(String)
      : [];
    const targetId = String(primaryId || "");

    let desired = [...baselineIds];
    if (operation === "delete" && targetId) {
      desired = desired.filter((id) => id !== targetId);
    } else if (operation === "create" && targetId && !desired.includes(targetId)) {
      const targetIndex = currentIds.indexOf(targetId);
      let inserted = false;
      for (let index = targetIndex - 1; index >= 0; index -= 1) {
        const anchor = currentIds[index];
        const anchorIndex = desired.indexOf(anchor);
        if (anchorIndex >= 0) {
          desired.splice(anchorIndex + 1, 0, targetId);
          inserted = true;
          break;
        }
      }
      if (!inserted) {
        for (let index = targetIndex + 1; index < currentIds.length; index += 1) {
          const anchor = currentIds[index];
          const anchorIndex = desired.indexOf(anchor);
          if (anchorIndex >= 0) {
            desired.splice(anchorIndex, 0, targetId);
            inserted = true;
            break;
          }
        }
      }
      if (!inserted) desired.push(targetId);
    }

    const payload = {
      ...cloneJson(currentManifest.payload, "array manifest"),
      length: desired.length,
      item_record_ids: desired
    };
    return {
      ...currentManifest,
      payload,
      payload_checksum: checksumValue(payload)
    };
  }

  function planLogicalMutation(snapshot, baselineRows, mutation = {}) {
    const domain = String(mutation.domain || "");
    const logicalId = String(mutation.recordId || "");
    if (!domain || !logicalId) throw new TypeError("mutation domain and recordId are required.");

    const mapped = mapLegacySnapshot(snapshot);
    const currentRows = rowsById(mapped.records);
    const baseline = rowsById(baselineRows);
    const diff = diffNormalizedRecords(baselineRows, mapped.records);
    const changedPuts = new Map(diff.puts.map((row) => [row.record_id, row]));
    const changedDeletes = new Map(diff.tombstones.map((row) => [row.record_id, row]));
    const selected = [];

    function addPut(recordId, role) {
      const row = changedPuts.get(recordId);
      if (row) selected.push({ type: "put", role, row });
    }
    function addDelete(recordId, role) {
      const row = changedDeletes.get(recordId);
      if (row) selected.push({ type: "delete", role, row });
    }

    const currentDomainRows = [...currentRows.values()].filter((row) => rowDomain(row) === domain);
    const baselineDomainRows = [...baseline.values()].filter((row) => rowDomain(row) === domain);
    const currentArrayManifest = currentDomainRows.find((row) => rowKind(row) === "array_manifest");
    const baselineArrayManifest = baselineDomainRows.find((row) => rowKind(row) === "array_manifest");
    const currentRoot = currentDomainRows.find((row) => rowKind(row) === "root_value");
    const baselineRoot = baselineDomainRows.find((row) => rowKind(row) === "root_value");

    if (logicalId === "$order") {
      const currentIds = Array.isArray(currentArrayManifest?.payload?.item_record_ids)
        ? currentArrayManifest.payload.item_record_ids.map(String)
        : [];
      const baselineIds = Array.isArray(baselineArrayManifest?.payload?.item_record_ids)
        ? baselineArrayManifest.payload.item_record_ids.map(String)
        : [];
      const localSet = new Set(currentIds);
      const remoteOnly = baselineIds.filter((id) => !localSet.has(id));
      if (remoteOnly.length) {
        return Object.freeze({
          namespace: NAMESPACE,
          checksum: mapped.checksum,
          recordCount: mapped.records.length,
          operations: Object.freeze([]),
          snapshotManifestChanged: true,
          conflictFields: Object.freeze(["$order.remote_members"])
        });
      }
      if (currentArrayManifest) addPut(rowRecordId(currentArrayManifest), "domain-manifest");
    } else if (logicalId === "$section") {
      const ids = new Set([
        ...currentDomainRows.map(rowRecordId),
        ...baselineDomainRows.map(rowRecordId)
      ]);
      for (const id of ids) {
        if (changedPuts.has(id)) selected.push({ type: "put", role: rowKind(changedPuts.get(id)) === "array_manifest" ? "domain-manifest" : "primary", row: changedPuts.get(id) });
        else if (changedDeletes.has(id)) selected.push({ type: "delete", role: rowKind(baseline.get(id)) === "array_manifest" ? "domain-manifest" : "primary", row: changedDeletes.get(id) });
      }
    } else {
      const currentPrimary = currentDomainRows.find((row) => rowKind(row) === "array_item" && rowLogicalIdentity(row) === logicalId);
      const baselinePrimary = baselineDomainRows.find((row) => rowKind(row) === "array_item" && rowLogicalIdentity(row) === logicalId);
      const primaryId = rowRecordId(currentPrimary || baselinePrimary || {});
      if (primaryId) {
        if (changedPuts.has(primaryId)) selected.push({ type: "put", role: "primary", row: changedPuts.get(primaryId) });
        if (changedDeletes.has(primaryId)) selected.push({ type: "delete", role: "primary", row: changedDeletes.get(primaryId) });
      }

      if (mutation.operation === "create" || mutation.operation === "delete") {
        const manifestId = rowRecordId(currentArrayManifest || baselineArrayManifest || {});
        if (manifestId && changedPuts.has(manifestId)) {
          selected.push({
            type: "put",
            role: "domain-manifest",
            row: intentArrayManifest(
              changedPuts.get(manifestId),
              baselineArrayManifest,
              primaryId,
              mutation.operation
            )
          });
        }
        if (manifestId && changedDeletes.has(manifestId)) selected.push({ type: "delete", role: "domain-manifest", row: changedDeletes.get(manifestId) });
      }
    }

    // Root sections are represented by one normalized row. The global
    // snapshot-manifest is finalized separately so its checksum cannot become
    // an account-wide conflict boundary for unrelated record edits.
    if (!selected.length && logicalId === "$section") {
      const rootId = rowRecordId(currentRoot || baselineRoot || {});
      if (rootId && changedPuts.has(rootId)) selected.push({ type: "put", role: "primary", row: changedPuts.get(rootId) });
      if (rootId && changedDeletes.has(rootId)) selected.push({ type: "delete", role: "primary", row: changedDeletes.get(rootId) });
    }

    const rank = (entry) => {
      if (mutation.operation === "delete") return entry.role === "domain-manifest" ? 0 : 1;
      if (entry.type === "put" && entry.role === "primary") return 0;
      if (entry.role === "domain-manifest") return 1;
      if (entry.type === "delete") return 2;
      return 3;
    };
    selected.sort((left, right) => rank(left) - rank(right) || rowRecordId(left.row).localeCompare(rowRecordId(right.row)));

    const snapshotManifestChanged =
      changedPuts.has(SNAPSHOT_MANIFEST_ID) || changedDeletes.has(SNAPSHOT_MANIFEST_ID);

    return Object.freeze({
      namespace: NAMESPACE,
      checksum: mapped.checksum,
      recordCount: mapped.records.length,
      operations: Object.freeze(selected.map((entry) => Object.freeze({
        type: entry.type,
        role: entry.role,
        row: Object.freeze(cloneJson(entry.row, "planned normalized row"))
      }))),
      snapshotManifestChanged
    });
  }

  const MISSING = Symbol("missing");

  function sameMergeValue(left, right) {
    if (left === MISSING || right === MISSING) return left === right;
    return stableStringify(left) === stableStringify(right);
  }

  function threeWayMergeJson(base, local, remote, path = "$") {
    function mergeNode(baseValue, localValue, remoteValue, currentPath) {
      if (sameMergeValue(localValue, remoteValue)) {
        return { value: localValue === MISSING ? MISSING : cloneJson(localValue, "merged value"), conflicts: [] };
      }
      if (sameMergeValue(localValue, baseValue)) {
        return { value: remoteValue === MISSING ? MISSING : cloneJson(remoteValue, "merged value"), conflicts: [] };
      }
      if (sameMergeValue(remoteValue, baseValue)) {
        return { value: localValue === MISSING ? MISSING : cloneJson(localValue, "merged value"), conflicts: [] };
      }

      if (isPlainObject(baseValue) && isPlainObject(localValue) && isPlainObject(remoteValue)) {
        const output = {};
        const conflicts = [];
        const keys = [...new Set([
          ...Object.keys(baseValue),
          ...Object.keys(localValue),
          ...Object.keys(remoteValue)
        ])].sort();

        for (const key of keys) {
          const b = Object.prototype.hasOwnProperty.call(baseValue, key) ? baseValue[key] : MISSING;
          const l = Object.prototype.hasOwnProperty.call(localValue, key) ? localValue[key] : MISSING;
          const r = Object.prototype.hasOwnProperty.call(remoteValue, key) ? remoteValue[key] : MISSING;
          const childPath = `${currentPath}.${key}`;
          const merged = mergeNode(b, l, r, childPath);
          conflicts.push(...merged.conflicts);
          if (merged.value !== MISSING) output[key] = merged.value;
        }
        return { value: output, conflicts };
      }

      return {
        value: cloneJson(localValue === MISSING ? null : localValue, "conflicted local value"),
        conflicts: [currentPath]
      };
    }

    const result = mergeNode(base, local, remote, path);
    return Object.freeze({
      ok: result.conflicts.length === 0,
      value: result.value === MISSING ? undefined : result.value,
      conflicts: Object.freeze(result.conflicts)
    });
  }

  function mergeUniqueSequence(baseList, localList, remoteList) {
    const base = Array.isArray(baseList) ? baseList.map(String) : [];
    const local = Array.isArray(localList) ? localList.map(String) : [];
    const remote = Array.isArray(remoteList) ? remoteList.map(String) : [];
    if (new Set(local).size !== local.length || new Set(remote).size !== remote.length || new Set(base).size !== base.length) {
      return { ok: false, value: local, conflicts: ["$.item_record_ids"] };
    }
    if (stableStringify(local) === stableStringify(remote)) return { ok: true, value: [...local], conflicts: [] };
    if (stableStringify(local) === stableStringify(base)) return { ok: true, value: [...remote], conflicts: [] };
    if (stableStringify(remote) === stableStringify(base)) return { ok: true, value: [...local], conflicts: [] };

    const baseSet = new Set(base);
    const localSet = new Set(local);
    const remoteSet = new Set(remote);
    const deleted = new Set(base.filter((id) => !localSet.has(id) || !remoteSet.has(id)));
    const nodes = [...new Set([...base, ...remote, ...local])].filter((id) => !deleted.has(id));
    const nodeSet = new Set(nodes);
    const edges = new Map(nodes.map((id) => [id, new Set()]));
    const indegree = new Map(nodes.map((id) => [id, 0]));

    function addSequence(sequence) {
      const filtered = sequence.filter((id) => nodeSet.has(id));
      for (let index = 0; index + 1 < filtered.length; index += 1) {
        const from = filtered[index];
        const to = filtered[index + 1];
        if (from === to || edges.get(from).has(to)) continue;
        edges.get(from).add(to);
        indegree.set(to, indegree.get(to) + 1);
      }
    }
    addSequence(remote);
    addSequence(local);

    const preference = new Map(nodes.map((id, index) => [id, index]));
    const ready = nodes.filter((id) => indegree.get(id) === 0)
      .sort((a, b) => preference.get(a) - preference.get(b) || a.localeCompare(b));
    const output = [];
    while (ready.length) {
      const id = ready.shift();
      output.push(id);
      for (const next of edges.get(id)) {
        indegree.set(next, indegree.get(next) - 1);
        if (indegree.get(next) === 0) {
          ready.push(next);
          ready.sort((a, b) => preference.get(a) - preference.get(b) || a.localeCompare(b));
        }
      }
    }
    if (output.length !== nodes.length) {
      return { ok: false, value: local, conflicts: ["$.item_record_ids"] };
    }
    return { ok: true, value: output, conflicts: [] };
  }

  function mergeNormalizedPayload(basePayload, localPayload, remotePayload) {
    if (!basePayload || !localPayload || !remotePayload) {
      return Object.freeze({ ok: false, value: cloneJson(localPayload, "local payload"), conflicts: Object.freeze(["$"]) });
    }
    if (
      String(basePayload.kind || "") !== String(localPayload.kind || "") ||
      String(basePayload.kind || "") !== String(remotePayload.kind || "") ||
      String(basePayload.key ?? "") !== String(localPayload.key ?? "") ||
      String(basePayload.key ?? "") !== String(remotePayload.key ?? "")
    ) {
      return Object.freeze({ ok: false, value: cloneJson(localPayload, "local payload"), conflicts: Object.freeze(["$.kind"]) });
    }

    if (localPayload.kind === "array_manifest") {
      const mergedSequence = mergeUniqueSequence(
        basePayload.item_record_ids,
        localPayload.item_record_ids,
        remotePayload.item_record_ids
      );
      if (!mergedSequence.ok) return Object.freeze({ ok: false, value: cloneJson(localPayload, "local payload"), conflicts: Object.freeze(mergedSequence.conflicts) });
      const value = {
        ...cloneJson(remotePayload, "remote array manifest"),
        ...cloneJson(localPayload, "local array manifest"),
        item_record_ids: mergedSequence.value,
        length: mergedSequence.value.length
      };
      return Object.freeze({ ok: true, value, conflicts: Object.freeze([]) });
    }

    const merged = threeWayMergeJson(basePayload, localPayload, remotePayload);
    return Object.freeze({
      ok: merged.ok,
      value: merged.value,
      conflicts: merged.conflicts
    });
  }

  function applyNormalizedPayloadToSnapshot(snapshot, recordId, payload) {
    const safeSnapshot = normalizeSnapshot(snapshot);
    if (!payload || typeof payload !== "object") throw new TypeError("normalized payload is required.");
    if (payload.kind === "root_value") {
      safeSnapshot[String(payload.key)] = cloneJson(payload.value, "normalized root value");
      return safeSnapshot;
    }
    if (payload.kind !== "array_item") return safeSnapshot;

    const key = String(payload.key);
    if (!Array.isArray(safeSnapshot[key])) throw integrityError(`Normalized array ${key} is missing locally.`);
    const currentMapped = mapLegacySnapshot(safeSnapshot);
    const currentRow = currentMapped.records.find((row) => row.record_id === String(recordId));
    const identity = logicalIdentityValue(currentRow?.payload?.value);
    if (!identity) throw integrityError("Compatible record merge requires a stable logical identity.", "HH_NORMALIZED_MERGE_IDENTITY_REQUIRED");
    const matches = safeSnapshot[key]
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => logicalIdentityValue(item) === identity);
    if (matches.length !== 1) throw integrityError("Compatible record merge could not locate one stable local record.", "HH_NORMALIZED_MERGE_IDENTITY_REQUIRED");
    safeSnapshot[key][matches[0].index] = cloneJson(payload.value, "merged normalized item");
    return safeSnapshot;
  }

  return Object.freeze({
    version: VERSION,
    release: RELEASE,
    formatVersion: FORMAT_VERSION,
    namespace: NAMESPACE,
    snapshotManifestId: SNAPSHOT_MANIFEST_ID,
    stableStringify,
    snapshotChecksum,
    checksumValue,
    mapLegacySnapshot,
    reassembleLegacySnapshot,
    reassembleLegacySnapshotWithMetadata,
    reassembleAuthoritativeSnapshotWithMetadata,
    diffNormalizedRecords,
    planLogicalMutation,
    threeWayMergeJson,
    mergeNormalizedPayload,
    applyNormalizedPayloadToSnapshot,
    logicalIdentityValue
  });
});
