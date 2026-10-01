(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborAccountBoundaryCore = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function cleanId(value) {
    return String(value || "").trim();
  }

  function evaluate(input = {}) {
    const authenticatedUserId = cleanId(input.authenticatedUserId);
    const activeOwnerId = cleanId(input.activeOwnerId);
    const legacyOwnerId = cleanId(input.legacyOwnerId);
    const hasActiveState = input.hasActiveState === true;
    const authenticatedCacheMatchesActive = input.authenticatedCacheMatchesActive === true;

    if (!authenticatedUserId) {
      return Object.freeze({ ok: false, action: "lock", reason: "missing-authenticated-user", staleOwnerId: "" });
    }

    if (activeOwnerId === authenticatedUserId) {
      return Object.freeze({ ok: true, action: "same-user", reason: "active-owner-matches-session", staleOwnerId: "" });
    }

    if (activeOwnerId) {
      return Object.freeze({
        ok: true,
        action: "switch-owner",
        reason: "active-owner-mismatch",
        staleOwnerId: activeOwnerId
      });
    }

    if (legacyOwnerId === authenticatedUserId) {
      return Object.freeze({ ok: true, action: "adopt-owner", reason: "legacy-owner-matches-session", staleOwnerId: "" });
    }

    if (legacyOwnerId && hasActiveState) {
      return Object.freeze({
        ok: true,
        action: "switch-owner",
        reason: "legacy-owner-mismatch",
        staleOwnerId: legacyOwnerId
      });
    }

    if (hasActiveState && authenticatedCacheMatchesActive) {
      return Object.freeze({ ok: true, action: "adopt-owner", reason: "authenticated-cache-matches-active", staleOwnerId: "" });
    }

    if (hasActiveState) {
      return Object.freeze({ ok: false, action: "lock", reason: "unowned-active-state", staleOwnerId: "" });
    }

    return Object.freeze({ ok: true, action: "clean-login", reason: "no-active-state", staleOwnerId: "" });
  }

  return Object.freeze({ evaluate });
});
