(() => {
  "use strict";

  const release = window.HerdHarborRelease || {};
  const VALID_ROLES = new Set(["owner", "admin", "user"]);
  const VALID_TIERS = new Set(["junior", "founder", "member", "business"]);
  const INACTIVE_STATUSES = new Set(["sold", "deceased", "archived", "ancestor only"]);
  const FULL_FEATURES = Object.freeze({
    animalRecords: true,
    photos: true,
    identification: true,
    notes: true,
    health: true,
    pedigrees: true,
    breeding: true,
    litters: true,
    shows: true,
    exhibitors: true,
    tasks: true,
    backups: true,
    exports: true,
    cloudSync: true,
    genetics: true,
    finance: true,
    sales: true,
    production: true
  });
  const DEFAULT_PROFILE = Object.freeze({
    account_role: "user",
    membership_tier: "member",
    membership_source: "default",
    account_status: "active",
    override_expires_at: null,
    subscription_status: "not_configured",
    backend_ready: false
  });

  let rawProfile = { ...DEFAULT_PROFILE };
  let subscription = { status: "not_configured", tier: null, active: false };
  let access = null;
  let limitDialog = null;

  const clone = (value) => typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));

  function normalize(value = "") {
    return String(value ?? "").trim().toLowerCase();
  }

  function validDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function isExpiredOverride(profile = {}, now = new Date()) {
    if (normalize(profile.membership_source) !== "manual_override") return false;
    const expires = validDate(profile.override_expires_at);
    return Boolean(expires && expires.getTime() <= now.getTime());
  }

  function resolveEffectiveMembership(profile = {}, billing = {}, now = new Date()) {
    const storedTier = VALID_TIERS.has(normalize(profile.membership_tier))
      ? normalize(profile.membership_tier)
      : "member";
    const source = normalize(profile.membership_source) || "default";

    if (source === "manual_override") {
      if (!isExpiredOverride(profile, now)) return { tier: storedTier, source, overrideExpired: false };
      if (release.featureFlags?.billingEnabled === true && billing.active && VALID_TIERS.has(normalize(billing.tier))) {
        return { tier: normalize(billing.tier), source: "subscription", overrideExpired: true };
      }
      return { tier: "member", source: "default", overrideExpired: true };
    }

    if (source === "founder" || storedTier === "founder") {
      return { tier: "founder", source: "founder", overrideExpired: false };
    }

    if (release.featureFlags?.billingEnabled === true && billing.active && VALID_TIERS.has(normalize(billing.tier))) {
      return { tier: normalize(billing.tier), source: "subscription", overrideExpired: false };
    }

    // Billing is intentionally disabled for the v1.6.1 review build. Preserve
    // the database tier and today's automatic Member access until activation.
    return { tier: storedTier, source, overrideExpired: false };
  }

  function normalizedAccess(profile = rawProfile, billing = subscription, now = new Date()) {
    const effective = resolveEffectiveMembership(profile, billing, now);
    const role = VALID_ROLES.has(normalize(profile.account_role)) ? normalize(profile.account_role) : "user";
    const storedTier = VALID_TIERS.has(normalize(profile.membership_tier)) ? normalize(profile.membership_tier) : "member";
    return {
      accountRole: role,
      membershipTier: storedTier,
      effectiveMembershipTier: effective.tier,
      membershipSource: effective.source,
      storedMembershipSource: normalize(profile.membership_source) || "default",
      subscriptionStatus: normalize(billing.status || profile.subscription_status || "not_configured"),
      accountStatus: normalize(profile.account_status || "active"),
      overrideExpiresAt: profile.override_expires_at || null,
      overrideExpired: effective.overrideExpired,
      maxActiveAnimals: effective.tier === "junior" ? 5 : null,
      features: { ...FULL_FEATURES },
      featureFlags: { ...(release.featureFlags || {}) },
      backendReady: profile.backend_ready === true
    };
  }

  function publish() {
    access = normalizedAccess();
    document.documentElement.dataset.hhAccountRole = access.accountRole;
    document.documentElement.dataset.hhMembershipTier = access.effectiveMembershipTier;
    document.dispatchEvent(new CustomEvent("herdharbor:membership-change", { detail: getAccount() }));
    return getAccount();
  }

  function applyAccessProfile(profile = {}) {
    rawProfile = { ...DEFAULT_PROFILE, ...profile };
    return publish();
  }

  function applySubscriptionState(next = {}) {
    subscription = {
      status: normalize(next.status || "not_configured"),
      tier: VALID_TIERS.has(normalize(next.tier)) ? normalize(next.tier) : null,
      active: next.active === true
    };
    return publish();
  }

  function getAccount() {
    // Re-evaluate on every policy read so a manual override cannot remain
    // effective merely because the app stayed open past its expiration time.
    access = normalizedAccess();
    return clone(access);
  }

  function getRole() { return getAccount().accountRole; }
  function getTier() { return getAccount().effectiveMembershipTier; }
  function getSource() { return getAccount().membershipSource; }
  function isOwner() { return getRole() === "owner"; }
  function isAdmin() { return getRole() === "admin"; }
  function canAccessAdmin() {
    const current = getAccount();
    return release.featureFlags?.adminMemberManagementEnabled === true
      && current.backendReady === true
      && current.accountStatus === "active"
      && (current.accountRole === "owner" || current.accountRole === "admin");
  }
  function getEffectiveEntitlements() {
    const current = getAccount();
    return { tier: current.effectiveMembershipTier, maxActiveAnimals: current.maxActiveAnimals, features: clone(current.features) };
  }

  function resolveProfile(profile = {}, billing = {}) {
    return clone(resolveEffectiveMembership(profile, billing, new Date()));
  }

  function isActiveAnimal(animal) {
    return Boolean(animal) && !INACTIVE_STATUSES.has(normalize(animal.status || "Active"));
  }

  function activeAnimalCount(animals = []) {
    return (Array.isArray(animals) ? animals : []).filter(isActiveAnimal).length;
  }

  function validateAnimalTransition(beforeAnimals = [], afterAnimals = []) {
    const before = activeAnimalCount(beforeAnimals);
    const after = activeAnimalCount(afterAnimals);
    const current = getAccount();
    const limit = current.effectiveMembershipTier === "junior" && release.featureFlags?.juniorPlanEnabled === true ? 5 : null;
    return {
      allowed: limit === null || after <= limit || after <= before,
      before,
      after,
      limit,
      remaining: limit === null ? null : Math.max(0, limit - after)
    };
  }

  function closeLimitDialog() {
    limitDialog?.remove();
    limitDialog = null;
  }

  function showJuniorLimit(details = {}) {
    closeLimitDialog();
    limitDialog = document.createElement("div");
    limitDialog.className = "hh-membership-backdrop";
    limitDialog.innerHTML = `
      <section class="hh-membership-dialog" role="dialog" aria-modal="true" aria-labelledby="hh-junior-limit-title">
        <span class="hh-membership-kicker">HerdHarbor Junior</span>
        <h2 id="hh-junior-limit-title">Your Junior herd is full</h2>
        <p>HerdHarbor Junior includes up to 5 active animals. You can continue viewing and managing your current animals, archive or mark an animal as sold when it leaves your project, or upgrade to Member for unlimited animals.</p>
        ${Number.isFinite(details.before) ? `<p class="hh-membership-usage"><strong>${details.before} active animal${details.before === 1 ? "" : "s"}</strong> · 5 included</p>` : ""}
        <div class="hh-membership-actions">
          <button type="button" class="button button-primary" data-hh-upgrade-member>Upgrade to Member</button>
          <button type="button" class="button button-ghost" data-hh-limit-close>Not Now</button>
        </div>
      </section>`;
    limitDialog.addEventListener("click", (event) => {
      if (event.target === limitDialog || event.target.closest("[data-hh-limit-close]")) closeLimitDialog();
      if (event.target.closest("[data-hh-upgrade-member]")) {
        closeLimitDialog();
        document.dispatchEvent(new CustomEvent("herdharbor:request-upgrade", { detail: { tier: "member" } }));
      }
    });
    const limitDialogTarget = document.body || document.documentElement;
    if (limitDialogTarget) limitDialogTarget.appendChild(limitDialog);
    limitDialog.querySelector("[data-hh-limit-close]")?.focus();
  }

  function enforceAnimalTransition(beforeAnimals, afterAnimals) {
    const result = validateAnimalTransition(beforeAnimals, afterAnimals);
    if (!result.allowed) showJuniorLimit(result);
    return result.allowed;
  }

  function refresh() {
    return window.HerdHarborCloud?.refreshAccess?.() || Promise.resolve(getAccount());
  }

  document.addEventListener("herdharbor:access-profile", (event) => applyAccessProfile(event.detail || {}));
  document.addEventListener("herdharbor:billing-state", (event) => applySubscriptionState(event.detail || {}));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeLimitDialog(); });

  access = normalizedAccess();
  window.HerdHarborMembership = Object.freeze({
    version: release.version || "1.6.1",
    getAccount,
    getAccess: getAccount,
    getRole,
    getTier,
    getSource,
    isOwner,
    isAdmin,
    canAccessAdmin,
    canAdministerMembers: canAccessAdmin,
    getEffectiveEntitlements,
    resolveProfile,
    refresh,
    applyAccessProfile,
    applySubscriptionState,
    isActiveAnimal,
    activeAnimalCount,
    validateAnimalTransition,
    enforceAnimalTransition,
    showJuniorLimit,
    inactiveStatuses: Object.freeze([...INACTIVE_STATUSES]),
    __test: Object.freeze({ resolveEffectiveMembership, normalizedAccess, isExpiredOverride })
  });
})();
