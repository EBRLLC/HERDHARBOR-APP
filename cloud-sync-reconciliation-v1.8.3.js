(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborCloudSyncReconciliation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "1.0-safe-reconciliation";
  const RELEASE = "1.8.3";
  const COUNTERS = Object.freeze([
    "unresolvedConflicts",
    "bootstrapFailures",
    "dualWriteFailures",
    "normalizedReadFallbackCount"
  ]);

  function nonNegative(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : 0;
  }

  function activeRow(row) {
    return !row?.deleted_at && !row?.deletedAt;
  }

  function keyOf(row) {
    return `${String(row?.namespace || "")}\u0000${String(row?.record_id ?? row?.recordId ?? "")}`;
  }

  function checksumOf(row) {
    return String(row?.payload_checksum ?? row?.payloadChecksum ?? "");
  }

  function reconcileSnapshot(normalizer, legacySnapshot, normalizedRows, operational = {}) {
    if (!normalizer?.mapLegacySnapshot) throw new TypeError("HerdHarbor cloud state normalizer is required.");
    const mapped = normalizer.mapLegacySnapshot(legacySnapshot);
    const desired = new Map(mapped.records.map((row) => [keyOf(row), checksumOf(row)]));
    const actual = new Map(
      (Array.isArray(normalizedRows) ? normalizedRows : [])
        .filter(activeRow)
        .map((row) => [keyOf(row), checksumOf(row)])
    );

    let matching = 0;
    let differing = 0;
    let missing = 0;
    let unexpected = 0;

    for (const [key, checksum] of desired) {
      if (!actual.has(key)) missing += 1;
      else if (actual.get(key) === checksum) matching += 1;
      else differing += 1;
    }
    for (const key of actual.keys()) {
      if (!desired.has(key)) unexpected += 1;
    }

    const compared = matching + differing;
    const denominator = compared + missing + unexpected;
    const errorCount = differing + missing + unexpected;

    return Object.freeze({
      recordsCompared: compared,
      recordsMatching: matching,
      recordsDiffering: differing,
      missingNormalizedRecords: missing,
      unexpectedNormalizedRecords: unexpected,
      unresolvedConflicts: nonNegative(operational.unresolvedConflicts),
      bootstrapFailures: nonNegative(operational.bootstrapFailures),
      dualWriteFailures: nonNegative(operational.dualWriteFailures),
      normalizedReadFallbackCount: nonNegative(operational.normalizedReadFallbackCount),
      reconciliationErrorRate: denominator ? errorCount / denominator : 0,
      sourceChecksum: String(mapped.checksum || ""),
      normalizedRecordCount: actual.size
    });
  }

  function createRolloutMetrics() {
    const counters = Object.fromEntries(COUNTERS.map((key) => [key, 0]));
    function record(name, increment = 1) {
      if (!COUNTERS.includes(name)) return false;
      counters[name] += nonNegative(increment);
      return true;
    }
    function snapshot() {
      return Object.freeze({ ...counters });
    }
    function reset() {
      for (const key of COUNTERS) counters[key] = 0;
    }
    return Object.freeze({ record, snapshot, reset });
  }

  return Object.freeze({
    version: VERSION,
    release: RELEASE,
    counters: COUNTERS,
    reconcileSnapshot,
    createRolloutMetrics
  });
});
