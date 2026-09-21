(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborCloudSyncCohortGate = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "1.0-controlled-cohort";
  const RELEASE = "1.8.3";
  const MODES = new Set(["allowlist", "percentage", "allowlist-or-percentage"]);

  function boundedPercentage(value) {
    const number = Number(value ?? 0);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(100, number));
  }

  function normalizedIds(values) {
    const result = new Set();
    for (const value of values instanceof Set ? values : Array.isArray(values) ? values : []) {
      const id = String(value || "").trim();
      if (id) result.add(id);
    }
    return result;
  }

  function deterministicBucket(userId, salt = "herdharbor-normalized-sync-v1") {
    const text = `${String(salt || "")}|${String(userId || "")}`;
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) % 10000;
  }

  function createCohortGate(options = {}) {
    const enabled = options.enabled === true;
    const mode = MODES.has(options.mode) ? options.mode : "allowlist";
    const allowlist = normalizedIds(options.allowlistUserIds);
    const percentage = boundedPercentage(options.percentage);
    const salt = String(options.salt || "herdharbor-normalized-sync-v1").slice(0, 120);

    function evaluate(userId) {
      const id = String(userId || "").trim();
      if (!enabled) return Object.freeze({ eligible: false, reason: "gate-disabled", mode, percentage });
      if (!id) return Object.freeze({ eligible: false, reason: "missing-user-id", mode, percentage });

      const allowlisted = allowlist.has(id);
      if (mode === "allowlist") {
        return Object.freeze({
          eligible: allowlisted,
          reason: allowlisted ? "allowlisted" : "not-allowlisted",
          mode,
          percentage
        });
      }

      const bucket = deterministicBucket(id, salt);
      const percentageEligible = bucket < Math.round(percentage * 100);
      const eligible = mode === "percentage"
        ? percentageEligible
        : allowlisted || percentageEligible;
      return Object.freeze({
        eligible,
        reason: allowlisted ? "allowlisted" : percentageEligible ? "percentage-cohort" : "not-in-cohort",
        mode,
        percentage,
        bucket
      });
    }

    return Object.freeze({
      enabled,
      mode,
      percentage,
      allowlistSize: allowlist.size,
      evaluate,
      isEligibleUser(userId) { return evaluate(userId).eligible; }
    });
  }

  return Object.freeze({
    version: VERSION,
    release: RELEASE,
    deterministicBucket,
    createCohortGate
  });
});
