(() => {
  "use strict";

  const VERSION = "1.8.1";
  const TRIAL_BEGINS_AT = "2026-09-06T00:00:00-04:00";
  const HARD_LAUNCH_AT = "2026-10-01T00:00:00-04:00";
  const MEMBER_TRIAL_TIER = "member";
  const POST_LAUNCH_FREE_TIER = "junior";
  const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "founder", "resubscribed"]);
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
    return Number.isNaN(date.getTime()) ? Date.now() : date.getTime();
  };

  function policyState(now = new Date()) {
    const time = asTime(now);
    const launch = asTime(HARD_LAUNCH_AT);
    return Object.freeze({
      version: VERSION,
      trialBeginsAt: TRIAL_BEGINS_AT,
      hardLaunchAt: HARD_LAUNCH_AT,
      trialActive: time < launch,
      hardLaunchActive: time >= launch,
      memberTrialTier: MEMBER_TRIAL_TIER,
      postLaunchFreeTier: POST_LAUNCH_FREE_TIER
    });
  }

  function subscriptionSnapshot() {
    try {
      return window.HerdHarborSubscriptionEngine?.getState?.() || {};
    } catch {
      return {};
    }
  }

  function hasPaidSubscription(snapshot = subscriptionSnapshot()) {
    const status = normalize(snapshot.status);
    const plan = normalize(snapshot.plan);
    return ACTIVE_SUBSCRIPTION_STATUSES.has(status) && PAID_TIERS.has(plan);
  }

  function hasBackendPaidSubscription(base = {}) {
    const status = normalize(base.subscriptionStatus);
    const tier = normalize(base.membershipTier || base.effectiveMembershipTier);
    const source = normalize(base.storedMembershipSource || base.membershipSource);
    return source === "subscription"
      && ACTIVE_SUBSCRIPTION_STATUSES.has(status)
      && PAID_TIERS.has(tier);
  }

  function resolveAccount(now = new Date()) {
    const base = original.getAccount();
    const policy = policyState(now);
    const role = normalize(base.accountRole || "user");
    const currentSource = normalize(base.membershipSource);
    const storedSource = normalize(base.storedMembershipSource || currentSource);
    const snapshot = subscriptionSnapshot();

    // Internal owner/admin accounts and live manual overrides remain untouched.
    if (role === "owner" || role === "admin" || currentSource === "manual_override") {
      return { ...base, subscriptionLaunch: policy };
    }

    // Founder access is permanent and is not converted into a launch trial.
    if (currentSource === "founder" || storedSource === "founder" || normalize(base.membershipTier) === "founder") {
      return {
        ...base,
        effectiveMembershipTier: "founder",
        membershipSource: "founder",
        maxActiveAnimals: null,
        subscriptionLaunch: policy
      };
    }

    // Through 11:59 PM ET on September 30, every signed-up HerdHarbor member
    // receives full Member access regardless of signup date or payment state.
    if (policy.trialActive) {
      return {
        ...base,
        effectiveMembershipTier: MEMBER_TRIAL_TIER,
        membershipSource: "launch_trial",
        subscriptionStatus: "trialing",
        maxActiveAnimals: null,
        launchTrialActive: true,
        launchTrialEndsAt: HARD_LAUNCH_AT,
        subscriptionHardLaunchAt: HARD_LAUNCH_AT,
        subscriptionLaunch: policy
      };
    }

    // October 1, 2026 is the hard subscription launch. Prefer the live Stripe
    // engine snapshot, but also honor the webhook-synchronized account_access
    // subscription state while the browser provider is still settling after sign-in.
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
        effectiveMembershipTier: paidTier,
        membershipSource: "subscription",
        subscriptionStatus: paidStatus,
        maxActiveAnimals: null,
        launchTrialActive: false,
        launchTrialEndsAt: HARD_LAUNCH_AT,
        subscriptionHardLaunchAt: HARD_LAUNCH_AT,
        subscriptionLaunch: policy
      };
    }

    return {
      ...base,
      effectiveMembershipTier: POST_LAUNCH_FREE_TIER,
      membershipSource: "launch_required",
      subscriptionStatus: normalize(snapshot.status || base.subscriptionStatus || "not_configured"),
      maxActiveAnimals: 5,
      launchTrialActive: false,
      launchTrialEndsAt: HARD_LAUNCH_AT,
      subscriptionHardLaunchAt: HARD_LAUNCH_AT,
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
      features: clone(current.features)
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
    trialBeginsAt: TRIAL_BEGINS_AT,
    hardLaunchAt: HARD_LAUNCH_AT,
    memberTrialTier: MEMBER_TRIAL_TIER,
    postLaunchFreeTier: POST_LAUNCH_FREE_TIER,
    getPolicy: () => policyState(),
    getAccount: () => clone(resolveAccount()),
    __test: Object.freeze({ policyState, hasPaidSubscription, hasBackendPaidSubscription, resolveAccount })
  });

  document.documentElement.dataset.hhSubscriptionLaunch = VERSION;
  document.dispatchEvent(new CustomEvent("herdharbor:membership-change", { detail: wrapped.getAccount() }));
  document.dispatchEvent(new CustomEvent("herdharbor:subscription-launch-policy", { detail: policyState() }));
})();
