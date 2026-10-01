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

  async function applyPlan(input = {}, adapters = {}) {
    const plan = evaluate(input);
    if (!plan.ok) return plan;

    const authenticatedUserId = cleanId(input.authenticatedUserId);
    if (plan.action === "switch-owner") {
      if (plan.staleOwnerId && input.hasActiveState === true) {
        const preserved = await adapters.preserve?.(plan.staleOwnerId);
        if (preserved === false) {
          return Object.freeze({
            ok: false,
            action: "lock",
            reason: "stale-owner-preserve-failed",
            staleOwnerId: plan.staleOwnerId
          });
        }
      }
      adapters.clearActive?.();
      adapters.resetRuntime?.();
      adapters.setOwner?.(authenticatedUserId);
    } else if (plan.action === "adopt-owner" || plan.action === "clean-login") {
      adapters.setOwner?.(authenticatedUserId);
    }

    adapters.removeLegacy?.();
    return Object.freeze({ ...plan, userId: authenticatedUserId });
  }

  function createGenerationFence() {
    let generation = 0;
    let currentUserId = "";

    function advance(userId) {
      const nextUserId = cleanId(userId);
      if (nextUserId !== currentUserId) generation += 1;
      currentUserId = nextUserId;
      return Object.freeze({ userId: currentUserId, generation });
    }

    function invalidate() {
      generation += 1;
      currentUserId = "";
      return Object.freeze({ userId: currentUserId, generation });
    }

    function capture(userId = currentUserId) {
      return Object.freeze({ userId: cleanId(userId), generation });
    }

    function isCurrent(token, sessionUserId) {
      return Boolean(
        token &&
        cleanId(token.userId) &&
        cleanId(token.userId) === currentUserId &&
        cleanId(token.userId) === cleanId(sessionUserId) &&
        Number(token.generation) === generation
      );
    }

    function status() {
      return Object.freeze({ userId: currentUserId, generation });
    }

    return Object.freeze({ advance, invalidate, capture, isCurrent, status });
  }

  return Object.freeze({ evaluate, applyPlan, createGenerationFence });
});
