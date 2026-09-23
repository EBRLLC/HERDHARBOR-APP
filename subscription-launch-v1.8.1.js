(() => {
  "use strict";

  const VERSION = "1.8.2";
  const HARD_LAUNCH_AT = "2026-10-01T00:00:00-04:00";
  const MEMBER_TRIAL_TIER = "member";
  const FREE_ADULT_MAX_ACTIVE_ANIMALS = 5;
  const ACTIVE_PAID_STATUSES = new Set(["active", "trialing", "past_due", "founder", "resubscribed"]);
  const PAID_TIERS = new Set(["founder", "member", "business"]);
  const BACKEND_FREE_ADULT_STATUSES = new Set(["free_adult", "expired", "canceled", "unpaid", "incomplete_expired"]);

  const original = window.HerdHarborMembership;
  if (!original || window.HerdHarborSubscriptionLaunch) return;

  let freeAdultLimitDialog = null;

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
      memberTrialTier: MEMBER_TRIAL_TIER,
      freeAdultMaxActiveAnimals: FREE_ADULT_MAX_ACTIVE_ANIMALS
    });
  }

  function hasPaidSubscription(snapshot = subscriptionSnapshot()) {
    if (!trustedSnapshot(snapshot) || snapshot.initialTrial === true || snapshot.freeAdult === true) return false;
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

  function isFreeAdult(snapshot = subscriptionSnapshot()) {
    if (!trustedSnapshot(snapshot)) return false;
    const status = normalize(snapshot.status);
    return snapshot.freeAdult === true
      || status === "free_adult"
      || snapshot.subscriptionRequired === true
      || BACKEND_FREE_ADULT_STATUSES.has(status);
  }

  function hasBackendFreeAdult(base = {}) {
    if (base.backendReady !== true) return false;
    return BACKEND_FREE_ADULT_STATUSES.has(normalize(base.subscriptionStatus));
  }

  function freeAdultAccount(base = {}, snapshot = subscriptionSnapshot(), policy = policyState()) {
    const snapshotTrusted = trustedSnapshot(snapshot);
    return {
      ...base,
      effectiveMembershipTier: MEMBER_TRIAL_TIER,
      membershipSource: "free_adult",
      subscriptionStatus: "free_adult",
      maxActiveAnimals: FREE_ADULT_MAX_ACTIVE_ANIMALS,
      trialEndsAt: snapshotTrusted ? (snapshot.trialEndsAt || snapshot.initialTrialEndsAt || null) : null,
      initialTrialStartsAt: snapshotTrusted ? (snapshot.initialTrialStartsAt || null) : null,
      subscriptionRequired: false,
      readOnly: false,
      accessMode: "free_adult",
      backendTrialVerified: snapshotTrusted || base.backendReady === true,
      subscriptionLaunch: policy
    };
  }

  function remainingDays(endsAt, serverNow) {
    const end = asTime(endsAt);
    const now = asTime(serverNow);
    if (end == null || now == null || end <= now) return 0;
    return Math.max(1, Math.ceil((end - now) / (24 * 60 * 60 * 1000)));
  }

  function experienceState(now = new Date()) {
    const snapshot = subscriptionSnapshot();
    const account = resolveAccount(now);
    const trusted = trustedSnapshot(snapshot);
    const serverNow = trusted && snapshot.serverNow ? snapshot.serverNow : null;
    const mode = normalize(account.accessMode);
    const status = normalize(account.subscriptionStatus || snapshot.status);

    if (["owner", "admin"].includes(normalize(account.accountRole))
      || ["manual_override", "founder"].includes(normalize(account.membershipSource))
      || normalize(account.effectiveMembershipTier) === "founder") {
      return Object.freeze({
        key: "protected_access",
        label: normalize(account.effectiveMembershipTier) === "founder" ? "Founder access" : "Protected access",
        upgradeAvailable: false,
        verified: account.backendReady === true || trusted
      });
    }

    if (mode === "junior" || normalize(account.effectiveMembershipTier) === "junior") {
      return Object.freeze({
        key: "junior",
        label: "Junior",
        upgradeAvailable: true,
        maxActiveAnimals: 5,
        verified: account.backendReady === true || trusted
      });
    }

    if (mode === "trial" && trusted) {
      const endsAt = account.trialEndsAt || snapshot.initialTrialEndsAt || snapshot.trialEndsAt || null;
      return Object.freeze({
        key: "trial_active",
        label: "Free Member Trial",
        endsAt,
        daysRemaining: remainingDays(endsAt, serverNow),
        upgradeAvailable: true,
        verified: true
      });
    }

    if (mode === "paid") {
      const ending = trusted && snapshot.cancelAtPeriodEnd === true;
      return Object.freeze({
        key: ending ? "paid_access_ending" : "paid_member",
        label: ending ? "Member access ending" : "Paid Member",
        endsAt: ending ? (snapshot.currentPeriodEnd || null) : null,
        upgradeAvailable: false,
        verified: trusted || hasBackendPaidSubscription(account)
      });
    }

    if (mode === "free_adult" || hasBackendFreeAdult(account)) {
      return Object.freeze({
        key: "free_adult",
        label: "Free Adult",
        maxActiveAnimals: FREE_ADULT_MAX_ACTIVE_ANIMALS,
        upgradeAvailable: true,
        verified: account.backendTrialVerified === true || account.backendReady === true || trusted
      });
    }

    if (status === "unavailable") {
      return Object.freeze({
        key: "status_unavailable",
        label: "Subscription status unavailable",
        upgradeAvailable: false,
        verified: false
      });
    }

    return Object.freeze({
      key: "checking",
      label: "Checking subscription status",
      upgradeAvailable: false,
      verified: false
    });
  }

  function resolveAccount(now = new Date()) {
    const base = original.getAccount();
    const snapshot = subscriptionSnapshot();
    const policy = policyState(now, snapshot);
    const role = normalize(base.accountRole || "user");
    const currentSource = normalize(base.membershipSource);

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

    if (isJunior(base, snapshot)) {
      return {
        ...base,
        effectiveMembershipTier: "junior",
        membershipSource: currentSource || "junior",
        subscriptionStatus: trustedSnapshot(snapshot) ? normalize(snapshot.status || "free_junior") : base.subscriptionStatus,
        maxActiveAnimals: 5,
        subscriptionRequired: false,
        readOnly: false,
        accessMode: "junior",
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
        accessMode: "paid",
        subscriptionLaunch: policy
      };
    }

    if (isFreeAdult(snapshot) || hasBackendFreeAdult(base)) {
      return freeAdultAccount(base, snapshot, policy);
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
        accessMode: "trial",
        backendTrialVerified: true,
        subscriptionLaunch: policy
      };
    }

    // An unverified browser snapshot can never create or extend a trial.
    // Keep the already-resolved account usable while the asynchronous server
    // snapshot settles, but do not attach trial dates or Free Adult status until
    // a trusted provider snapshot or fresh account_access state proves them.
    return {
      ...base,
      backendTrialVerified: false,
      accessMode: "pending",
      subscriptionLaunch: policy
    };
  }

  function validateAnimalTransition(beforeAnimals = [], afterAnimals = []) {
    const before = original.activeAnimalCount(beforeAnimals);
    const after = original.activeAnimalCount(afterAnimals);
    const current = resolveAccount();
    const configuredLimit = Number(current.maxActiveAnimals);
    const limit = current.maxActiveAnimals == null || !Number.isFinite(configuredLimit)
      ? null
      : Math.max(0, configuredLimit);
    return {
      allowed: limit === null || after <= limit || after <= before,
      before,
      after,
      limit,
      remaining: limit === null ? null : Math.max(0, limit - after)
    };
  }

  function closeFreeAdultLimit() {
    freeAdultLimitDialog?.remove?.();
    freeAdultLimitDialog = null;
  }

  function showFreeAdultLimit(details = {}) {
    closeFreeAdultLimit();
    if (typeof document.createElement !== "function") return;
    freeAdultLimitDialog = document.createElement("div");
    freeAdultLimitDialog.className = "hh-membership-backdrop";
    freeAdultLimitDialog.innerHTML = `
      <section class="hh-membership-dialog" role="dialog" aria-modal="true" aria-labelledby="hh-free-adult-limit-title">
        <span class="hh-membership-kicker">HerdHarbor Free</span>
        <h2 id="hh-free-adult-limit-title">Your free herd is full</h2>
        <p>Free Adult includes up to 5 active animals. Your existing records stay available. Archive or mark an animal as sold when it leaves your herd, or upgrade to Member for unlimited active animals.</p>
        ${Number.isFinite(details.before) ? `<p class="hh-membership-usage"><strong>${details.before} active animal${details.before === 1 ? "" : "s"}</strong> · 5 included</p>` : ""}
        <div class="hh-membership-actions">
          <button type="button" class="button button-primary" data-hh-free-upgrade-member>Upgrade to Member</button>
          <button type="button" class="button button-ghost" data-hh-free-limit-close>Not Now</button>
        </div>
      </section>`;
    freeAdultLimitDialog.addEventListener("click", (event) => {
      if (event.target === freeAdultLimitDialog || event.target.closest?.("[data-hh-free-limit-close]")) closeFreeAdultLimit();
      if (event.target.closest?.("[data-hh-free-upgrade-member]")) {
        closeFreeAdultLimit();
        document.dispatchEvent(new CustomEvent("herdharbor:request-upgrade", { detail: { tier: "member", source: "free_adult_limit" } }));
      }
    });
    const target = document.body || document.documentElement;
    target?.appendChild?.(freeAdultLimitDialog);
    freeAdultLimitDialog.querySelector?.("[data-hh-free-limit-close]")?.focus?.();
  }

  function enforceAnimalTransition(beforeAnimals, afterAnimals) {
    const result = validateAnimalTransition(beforeAnimals, afterAnimals);
    if (!result.allowed) {
      const current = resolveAccount();
      if (normalize(current.membershipSource) === "free_adult") showFreeAdultLimit(result);
      else original.showJuniorLimit?.(result);
    }
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
    freeAdultMaxActiveAnimals: FREE_ADULT_MAX_ACTIVE_ANIMALS,
    getPolicy: () => policyState(),
    getAccount: () => clone(resolveAccount()),
    getExperienceState: () => clone(experienceState()),
    __test: Object.freeze({
      policyState,
      trustedSnapshot,
      hasPaidSubscription,
      hasBackendPaidSubscription,
      hasBackendFreeAdult,
      isFounder,
      isJunior,
      isFreeAdult,
      freeAdultAccount,
      remainingDays,
      experienceState,
      resolveAccount,
      validateAnimalTransition
    })
  });

  document.documentElement.dataset.hhSubscriptionLaunch = VERSION;
  document.addEventListener("herdharbor:subscription-engine-state", () => {
    document.dispatchEvent(new CustomEvent("herdharbor:membership-change", { detail: wrapped.getAccount() }));
  });
  document.dispatchEvent(new CustomEvent("herdharbor:membership-change", { detail: wrapped.getAccount() }));
  document.dispatchEvent(new CustomEvent("herdharbor:subscription-launch-policy", { detail: policyState() }));
})();