"use strict";
const crypto = require("node:crypto");
const normalizer = require("../cloud-state-normalizer-v1.8.3.js");
const stages = new Set(["missing", "dual_write", "normalized"]);
function assert(ok, message) { if (!ok) throw new Error("S19_BLOCKED: " + message); }
function canonical(value) { return normalizer.stableStringify(value); }
function planMigration({ userId, enabled, cohort, legacy, manifest, rows } = {}) {
  assert(typeof userId === "string" && /^[0-9a-f-]{36}$/i.test(userId), "invalid account");
  assert(enabled === true && cohort === "internal_test", "account not allowlisted");
  assert(legacy && legacy.app_state && !Array.isArray(legacy.app_state) &&
    typeof legacy.app_state === "object", "legacy source unavailable");
  assert(legacy.updated_at && !Number.isNaN(Date.parse(legacy.updated_at)), "missing revision");
  assert(Array.isArray(rows), "normalized rows not supplied");
  const stage = manifest?.cutover_stage || "missing";
  assert(stages.has(stage), "unsupported stage");
  const mapped = normalizer.mapLegacySnapshot(legacy.app_state);
  const wanted = new Map(mapped.records.map(row => [row.namespace + "/" + row.record_id, row]));
  const live = rows.filter(row => !row.deleted_at);
  if (stage === "missing") assert(rows.length === 0, "orphaned normalized records");
  else {
    assert(live.length === mapped.records.length, "normalized record count differs");
    for (const row of live) {
      const key = row.namespace + "/" + row.record_id;
      const expected = wanted.get(key);
      assert(expected && expected.payload_checksum === row.payload_checksum &&
        canonical(expected.payload) === canonical(row.payload), "normalized record differs");
      wanted.delete(key);
    }
    assert(wanted.size === 0, "missing normalized records");
    const rebuilt = normalizer.reassembleAuthoritativeSnapshotWithMetadata(rows);
    assert(rebuilt.checkpointStale !== true &&
      canonical(rebuilt.snapshot) === canonical(legacy.app_state), "reassembly mismatch");
  }
  const digest = crypto.createHash("sha256").update(JSON.stringify({
    userId, stage, revision: legacy.updated_at, generation: manifest?.sync_generation ?? null,
    checksum: mapped.checksum, recordChecksums: mapped.records.map(r => [r.record_id, r.payload_checksum])
  })).digest("hex");
  return Object.freeze({ stage, digest, accountId: userId, sourceRevision: legacy.updated_at,
    sourceChecksum: mapped.checksum, recordCount: mapped.records.length, normalizedRecords: mapped.records,
    verified: stage !== "missing", requiresBackup: true, requiresLegacyClientsClosed: true });
}
module.exports = { planMigration };
