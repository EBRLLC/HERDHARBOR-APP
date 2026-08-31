(() => {
  "use strict";

  const CACHE_VERSION = 1;
  const CACHE_PREFIX = "herdharbor_access_profile_v1";
  const VALID_ROLES = new Set(["owner", "admin", "user"]);
  const VALID_TIERS = new Set(["junior", "founder", "member", "business"]);
  const VALID_SOURCES = new Set(["default", "subscription", "founder", "manual_override"]);
  const VALID_STATUSES = new Set(["active", "disabled"]);

  const clean = (value) => String(value ?? "").trim().toLowerCase();
  const keyFor = (userId) => `${CACHE_PREFIX}_${String(userId || "").trim()}`;

  function validTimestamp(value, allowNull = false) {
    if ((value === null || value === undefined || value === "") && allowNull) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  function normalize(userId, profile = {}, verifiedAt = new Date().toISOString()) {
    const expectedUserId = String(userId || "").trim();
    const profileUserId = String(profile.user_id || expectedUserId).trim();
    const accountRole = clean(profile.account_role);
    const membershipTier = clean(profile.membership_tier);
    const membershipSource = clean(profile.membership_source);
    const accountStatus = clean(profile.account_status);
    const overrideExpiresAt = validTimestamp(profile.override_expires_at, true);
    const lastVerifiedAt = validTimestamp(profile.last_verified_at || verifiedAt);

    if (
      !expectedUserId ||
      profileUserId !== expectedUserId ||
      !VALID_ROLES.has(accountRole) ||
      !VALID_TIERS.has(membershipTier) ||
      !VALID_SOURCES.has(membershipSource) ||
      !VALID_STATUSES.has(accountStatus) ||
      overrideExpiresAt === undefined ||
      lastVerifiedAt === undefined
    ) {
      return null;
    }

    return {
      version: CACHE_VERSION,
      user_id: expectedUserId,
      account_role: accountRole,
      membership_tier: membershipTier,
      membership_source: membershipSource,
      account_status: accountStatus,
      override_expires_at: overrideExpiresAt,
      last_verified_at: lastVerifiedAt
    };
  }

  function create(storage = window.localStorage, now = () => new Date().toISOString()) {
    function read(userId) {
      const expectedUserId = String(userId || "").trim();
      if (!expectedUserId) return null;
      try {
        const parsed = JSON.parse(storage.getItem(keyFor(expectedUserId)) || "null");
        if (!parsed || parsed.version !== CACHE_VERSION) return null;
        return normalize(expectedUserId, parsed, parsed.last_verified_at);
      } catch {
        return null;
      }
    }

    function write(userId, profile = {}) {
      const snapshot = normalize(userId, profile, now());
      if (!snapshot) return null;
      try {
        storage.setItem(keyFor(snapshot.user_id), JSON.stringify(snapshot));
        return { ...snapshot };
      } catch {
        return null;
      }
    }

    return Object.freeze({ read, write, keyFor });
  }

  const cache = create();
  window.HerdHarborAccessCache = Object.freeze({
    version: CACHE_VERSION,
    read: cache.read,
    write: cache.write,
    keyFor,
    __test: Object.freeze({ create, normalize })
  });
})();
