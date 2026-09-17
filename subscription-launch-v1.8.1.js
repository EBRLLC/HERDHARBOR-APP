(() => {
  "use strict";

  const VERSION = "1.8.2";
  const HARD_LAUNCH_AT = "2026-10-01T00:00:00-04:00";
  const MEMBER_TRIAL_TIER = "member";
  const ACTIVE_PAID_STATUSES = new Set(["active", "trialing", "past_due", "founder", "resubscribed"]);
  const PAID_TIERS = new Set(["founder", "member", "business"]);

  const original = window.HerdHarborMembership;
  if (!original || window.HerdHarborSubscriptionLaunch) return;

  const clone = (value) => {
    try {
      return typeof structuredClone === "function"
        ? structuredClone(value)
        : JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  };
  const normalize = (value = "") => String(value ?? "").trim().toLowerCase();
  const asTime = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.getTime();
  };

  function subscriptionSnapshot() {
    try {
      return window.HerdHarborSubscriptionEngine?.getState?.() || {};
    } catch {
      return {};
    }
  }

  function trustedSnapshot(snapshot = subscriptionSnapshot()) {
    try {
      return Boolean(snapshot) && window.HerdHarborStripeSnapshotTrust?.isVerified?.() === true;
    } catch {
      return false;
    }
  }

  function policyState(now = new Date(), snapshot = subscriptionSnapshot()) {
    const trusted = trustedSnapshot(snapshot);
    const serverNow = trusted ? asTime(snapshot.serverNow) : null;
    const fallbackNow = asTime(now);
    const effectiveNow = serverNow ?? fallbackNow ?? Date.now();
    const launch = asTime(snapshot.hardLaunchAt || HARD_LAUNCH_AT) ?? asTime(HARD_LAUNCH_AT);
    return Object.freeze({
      version: VERSION,
      hardLaunchAt: HARD_LAUNCH_AT,
      hardLaunchActive: effectiveNow >= launch,
      preLaunchWindow: effectiveNow < launch,
      serverAuthoritative: trusted && serverNow != null,
      memberTrialTier: MEMBER_TRIAL_TIER
    });
  }

  function hasPaidSubscription(snapshot = subscriptionSnapshot()) {
    if (!trustedSnapshot(snapshot) || snapshot.initialTrial === true) return false;
    const status = normalize(snapshot.status);
    const plan = normalize(snapshot.plan);
    return Boolean(snapshot.providerSubscriptionId)
      && ACTIVE_PAID_STATUSES.has(status)
      && PAID_TIERS.has(plan);
  }

  function hasBackendPaidSubscription(base = {}) {
    const status = normalize(base.subscriptionStatus);
    const tier = normalize(base.membershipTier || base.effectiveMembershipTier);
    const source = normalize(base.storedMembershipSource || base.membershipSource);
    return source === "subscription"
      && ACTIVE_PAID_STATUSES.has(status)
      && PAID_TIERS.has(tier);
  }

  function isFounder(base = {}) {
    const source = normalize(base.membershipSource);
    const storedSource = normalize(base.storedMembershipSource || source);
    return source === "founder" || storedSource === "founder" || normalize(base.membershipTier) === "founder";
  }

  function isJunior(base = {}, snapshot = subscriptionSnapshot()) {
    const storedTier = normalize(base.membershipTier || base.effectiveMembershipTier);
    return storedTier === "junior"
      || (trustedSnapshot(snapshot) && normalize(snapshot.requestedPlan) === "junior")
      || (trustedSnapshot(snapshot) && normalize(snapshot.status) === "free_junior" && normalize(snapshot.plan) === "junior");
  }

  function resolveAccount(now = new Date()) {
    const base = original.getAccount();
    const snapshot = subscriptionSnapshot();
    const policy = policyState(now, snapshot);
    const role = normalize(base.accountRole || "user");
    const currentSource = normalize(base.membershipSource);

    // Admin authorization is deliberately not rewritten by subscription policy.
    if (role === "owner" || role === "admin" || currentSource === "manual_override") {
      return { ...base, subscriptionLaunch: policy };
    }

    if (isFounder(base)) {
      return {
        ...base,
        effectiveMembershipTier: "founder",
        membershipSource: "founder",
        maxActiveAnimals: null,
        subscriptionLaunch: policy
      };
    }

    // Junior is an intentional youth enrollment path, never the fallback for an
    // expired adult trial.
    if (isJunior(base, snapshot)) {
      return {
        ...base,
        effectiveMembershipTier: "junior",
        membershipSource: currentSource || "junior",
        subscriptionStatus: trustedSnapshot(snapshot) ? normalize(snapshot.status || "free_junior") : base.subscriptionStatus,
        maxActiveAnimals: 5,
        subscriptionRequired: false,
        readOnly: false,
        subscriptionLaunch: policy
      };
    }

    const livePaid = hasPaidSubscription(snapshot);
    const backendPaid = hasBackendPaidSubscription(base);
    if (livePaid || backendPaid) {
      const paidTier = livePaid
        ? normalize(snapshot.plan)
        : normalize(base.membershipTier || base.effectiveMembershipTier);
      const paidStatus = livePaid
        ? normalize(snapshot.status)
        : normalize(base.subscriptionStatus);
      return {
        ...base,
        effectiveMembershipTier: paidTier || MEMBER_TRIAL_TIER,
        membershipSource: "subscription",
        subscriptionStatus: paidStatus || "active",
        maxActiveAnimals: null,
        trialEndsAt: trustedSnapshot(snapshot) ? (snapshot.initialTrialEndsAt || snapshot.trialEndsAt || null) : null,
        subscriptionRequired: false,
        readOnly: false,
        subscriptionLaunch: policy
      };
    }

    if (trustedSnapshot(snapshot) && normalize(snapshot.status) === "trialing" && normalize(snapshot.plan) === MEMBER_TRIAL_TIER) {
      return {
        ...base,
        effectiveMembershipTier: MEMBER_TRIAL_TIER,
        membershipSource: "initial_trial",
        subscriptionStatus: "trialing",
        maxActiveAnimals: null,
        trialEndsAt: snapshot.trialEndsAt || snapshot.initialTrialEndsAt || null,
        initialTrialStartsAt: snapshot.initialTrialStartsAt || null,
        subscriptionRequired: false,
        readOnly: false,
        backendTrialVerified: true,
        subscriptionLaunch: policy
      };
    }

    if (trustedSnapshot(snapshot) && (snapshot.subscriptionRequired === true || normalize(snapshot.status) === "expired")) {
      return {
        ...base,
        // Keep the adult account a Member account. Expiration changes access
        // state; it never converts an adult account into Junior.
        effectiveMembershipTier: MEMBER_TRIAL_TIER,
        membershipSource: "subscription_required",
        subscriptionStatus: "expired",
        maxActiveAnimals: null,
        trialEndsAt: snapshot.trialEndsAt || snapshot.initialTrialEndsAt || null,
        initialTrialStartsAt: snapshot.initialTrialStartsAt || null,
        subscriptionRequired: true,
        readOnly: true,
        accessMode: "subscription_required",
        backendTrialVerified: true,
        subscriptionLaunch: policy
      };
    }

    // Before October 1 preserve the existing launch promise even while the
    // billing snapshot is still settling. This fallback never manufactures a
    // rolling trial end; rolling trial dates only come from the backend.
    if (policy.preLaunchWindow) {
      return {
        ...base,
        effectiveMembershipTier: MEMBER_TRIAL_TIER,
        membershipSource: "launch_trial_fallback",
        subscriptionStatus: "trialing",
        maxActiveAnimals: null,
        trialEndsAt: HARD_LAUNCH_AT,
        subscriptionRequired: false,
        readOnly: false,
        backendTrialVerified: false,
        subscriptionLaunch: policy
      };
    }

    // Billing is intentionally fail-open for authentication resilience. A
    // temporary billing outage must not block sign-in or destroy access state.
    // Once the trusted backend snapshot arrives it resolves trial/paid/expired.
    return {
      ...base,
      backendTrialVerified: false,
      subscriptionLaunch: policy
    };
  }

  function validateAnimalTransition(beforeAnimals = [], afterAnimals = []) {
    const before = original.activeAnimalCount(beforeAnimals);
    const after = original.activeAnimalCount(afterAnimals);
    const current = resolveAccount();
    const limit = current.effectiveMembershipTier === "junior" ? 5 : null;
    return {
      allowed: limit === null || after <= limit || after <= before,
      before,
      after,
      limit,
      remaining: limit === null ? null : Math.max(0, limit - after)
    };
  }

  function enforceAnimalTransition(beforeAnimals, afterAnimals) {
    const result = validateAnimalTransition(beforeAnimals, afterAnimals);
    if (!result.allowed) original.showJuniorLimit?.(result);
    return result.allowed;
  }

  function getEffectiveEntitlements() {
    const current = resolveAccount();
    return {
      tier: current.effectiveMembershipTier,
      maxActiveAnimals: current.maxActiveAnimals,
      features: clone(current.features),
      subscriptionRequired: current.subscriptionRequired === true,
      readOnly: current.readOnly === true,
      accessMode: current.accessMode || "normal"
    };
  }

  const wrapped = Object.freeze({
    ...original,
    version: VERSION,
    getAccount: () => clone(resolveAccount()),
    getAccess: () => clone(resolveAccount()),
    getRole: () => resolveAccount().accountRole,
    getTier: () => resolveAccount().effectiveMembershipTier,
    getSource: () => resolveAccount().membershipSource,
    isOwner: () => normalize(resolveAccount().accountRole) === "owner",
    isAdmin: () => normalize(resolveAccount().accountRole) === "admin",
    getEffectiveEntitlements,
    validateAnimalTransition,
    enforceAnimalTransition
  });

  window.HerdHarborMembership = wrapped;
  window.HerdHarborSubscriptionLaunch = Object.freeze({
    version: VERSION,
    hardLaunchAt: HARD_LAUNCH_AT,
    memberTrialTier: MEMBER_TRIAL_TIER,
    getPolicy: () => policyState(),
    getAccount: () => clone(resolveAccount()),
    __test: Object.freeze({
      policyState,
      trustedSnapshot,
      hasPaidSubscription,
      hasBackendPaidSubscription,
      isFounder,
      isJunior,
      resolveAccount
    })
  });

  document.documentElement.dataset.hhSubscriptionLaunch = VERSION;
  document.addEventListener("herdharbor:subscription-engine-state", () => {
    document.dispatchEvent(new CustomEvent("herdharbor:membership-change", { detail: wrapped.getAccount() }));
  });
  document.dispatchEvent(new CustomEvent("herdharbor:membership-change", { detail: wrapped.getAccount() }));
  document.dispatchEvent(new CustomEvent("herdharbor:subscription-launch-policy", { detail: policyState() }));
})();
