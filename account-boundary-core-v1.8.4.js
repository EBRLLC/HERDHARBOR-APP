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
    const staleOwnerId = plan.action === "switch-owner" ? plan.staleOwnerId : "";
    const failure = (reason) => Object.freeze({
      ok: false,
      action: "lock",
      reason,
      staleOwnerId
    });

    try {
      // Lock before awaiting storage adapters so no caller can render the new
      // identity while the prior account's workspace is still present.
      const locked = plan.action === "same-user" ? true : await adapters.lock?.();
      if (locked === false) return failure("account-boundary-lock-failed");
      if (typeof adapters.isCurrent === "function" && await adapters.isCurrent(authenticatedUserId) !== true) {
        return failure("account-boundary-session-changed");
      }

      if (plan.action === "same-user") {
        try { await adapters.removeLegacy?.(); } catch {}
        return Object.freeze({ ...plan, userId: authenticatedUserId });
      }

      if (plan.action === "switch-owner" && staleOwnerId && input.hasActiveState === true) {
        if (typeof adapters.preserve !== "function") return failure("stale-owner-preserve-unavailable");
        const preserved = await adapters.preserve(staleOwnerId);
        // A mere callback completion is not evidence that data was preserved.
        if (preserved !== true) return failure("stale-owner-preserve-failed");
        if (typeof adapters.isCurrent === "function" && await adapters.isCurrent(authenticatedUserId) !== true) {
          return failure("account-boundary-session-changed");
        }
      }

      if (plan.action === "switch-owner") {
        if (typeof adapters.clearActive !== "function") return failure("active-workspace-clear-unavailable");
        const cleared = await adapters.clearActive();
        if (cleared !== true) {
          try { await adapters.restoreOwner?.(staleOwnerId); } catch {}
          return failure("active-workspace-clear-failed");
        }
        if (typeof adapters.isCurrent === "function" && await adapters.isCurrent(authenticatedUserId) !== true) {
          try { await adapters.restoreOwner?.(staleOwnerId); } catch {}
          return failure("account-boundary-session-changed");
        }
        await adapters.resetRuntime?.();
      }

      const ownerWritten = typeof adapters.setOwner === "function"
        ? await adapters.setOwner(authenticatedUserId)
        : false;
      const ownerVerified = ownerWritten === true && (
        typeof adapters.verifyOwner !== "function" || await adapters.verifyOwner(authenticatedUserId) === true
      );
      const sessionStillCurrent = typeof adapters.isCurrent !== "function" ||
        await adapters.isCurrent(authenticatedUserId) === true;
      if (!ownerVerified || !sessionStillCurrent) {
        // A switched workspace is already empty and its former contents are in
        // the verified recovery copy. Restore old ownership for diagnosis and
        // keep the app locked; never hydrate the incoming identity on failure.
        try { await adapters.restoreOwner?.(staleOwnerId); } catch {}
        return failure(sessionStillCurrent ? "account-owner-marker-unverified" : "account-boundary-session-changed");
      }

      try { await adapters.removeLegacy?.(); } catch {}
      return Object.freeze({ ...plan, userId: authenticatedUserId });
    } catch (error) {
      try { await adapters.restoreOwner?.(staleOwnerId); } catch {}
      return Object.freeze({
        ...failure("account-boundary-adapter-failed"),
        error: String(error?.message || error || "unknown")
      });
    }
  }

  async function preserveWithFallback({ localPreserve, indexedDbPreserve, timeoutMs = 8000 } = {}) {
    let localOk = false;
    try { localOk = typeof localPreserve === "function" && await localPreserve() === true; } catch {}
    if (localOk) return Object.freeze({ ok: true, source: "local" });
    if (typeof indexedDbPreserve !== "function") return Object.freeze({ ok: false, source: "none" });

    let timer = null;
    try {
      const indexedDbResult = await Promise.race([
        Promise.resolve().then(indexedDbPreserve).then((value) => value === true),
        new Promise((resolve) => {
          timer = setTimeout(() => resolve(false), Math.max(1, Number(timeoutMs) || 8000));
        })
      ]);
      return indexedDbResult
        ? Object.freeze({ ok: true, source: "indexeddb" })
        : Object.freeze({ ok: false, source: "none" });
    } catch {
      return Object.freeze({ ok: false, source: "none" });
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
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

  return Object.freeze({ evaluate, applyPlan, preserveWithFallback, createGenerationFence });
});
