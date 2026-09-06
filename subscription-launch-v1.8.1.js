(function (root, factory) {
  "use strict";
  const api = factory(root || {});
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root?.document) root.HerdHarborSubscriptionLaunch = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const VERSION = "1.8.1";
  const HARD_LAUNCH_AT = "2026-10-01T04:00:00.000Z"; // Oct 1, 2026 at midnight EDT.
  const HARD_LAUNCH_MS = Date.parse(HARD_LAUNCH_AT);
  const ACTIVE_STATUSES = new Set(["active", "resubscribed", "founder", "free_junior"]);
  const VALID_PLANS = new Set(["junior", "founder", "member", "business"]);
  const PRELAUNCH_MESSAGE = "Subscriptions launch October 1. Your HerdHarbor Launch Trial stays free through September 30.";

  let configured = false;
  let lastSnapshot = null;
  let lastRemoteProfile = null;
  let applyingEntitlement = false;
  let launchTimer = null;

  const normalize = (value = "") => String(value ?? "").trim().toLowerCase();
  const timeValue = (value) => {
    if (value instanceof Date) return value.getTime();
    if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
    const parsed = value ? new Date(value).getTime() : Date.now();
    return Number.isFinite(parsed) ? parsed : NaN;
  };

  function phase(at = Date.now()) {
    return timeValue(at) < HARD_LAUNCH_MS ? "launch_trial" : "subscriptions_live";
  }

  function subscriptionsRequired(at = Date.now()) {
    return phase(at) === "subscriptions_live";
  }

  function signupEligible(createdAt) {
    const created = timeValue(createdAt);
    return Number.isFinite(created) && created < HARD_LAUNCH_MS;
  }

  function trialActive(trialEndsAt = HARD_LAUNCH_AT, at = Date.now()) {
    const ends = timeValue(trialEndsAt);
    const current = timeValue(at);
    return Number.isFinite(ends) && Number.isFinite(current) && current < ends;
  }

  function launchPolicy(at = Date.now()) {
    return Object.freeze({
      version: VERSION,
      phase: phase(at),
      hardLaunchAt: HARD_LAUNCH_AT,
      trialEndsAt: HARD_LAUNCH_AT,
      freeThrough: "2026-09-30",
      autoCharge: false
    });
  }

  function normalizeSnapshot(input = {}, at = Date.now()) {
    const snapshot = { ...(input || {}) };
    const status = normalize(snapshot.status || "not_configured");
    const trialEndsAt = snapshot.trialEndsAt || snapshot.trial_ends_at || null;
    const expiredLaunchTrial = status === "trialing" && trialEndsAt && !trialActive(trialEndsAt, at);
    snapshot.status = expiredLaunchTrial ? "expired" : status;
    snapshot.plan = expiredLaunchTrial ? null : (VALID_PLANS.has(normalize(snapshot.plan)) ? normalize(snapshot.plan) : null);
    snapshot.trialEndsAt = trialEndsAt || null;
    snapshot.launchTrialExpired = expiredLaunchTrial;
    snapshot.launchPolicy = launchPolicy(at);
    return snapshot;
  }

  function snapshotIsEntitled(input = {}, at = Date.now()) {
    const snapshot = normalizeSnapshot(input, at);
    if (!VALID_PLANS.has(normalize(snapshot.plan))) return false;
    if (snapshot.status === "trialing") return trialActive(snapshot.trialEndsAt, at);
    return ACTIVE_STATUSES.has(snapshot.status);
  }

  function originUrl() {
    try {
      return `${root.location.origin}${root.location.pathname}`;
    } catch {
      return "";
    }
  }

  async function invoke(action, body = {}) {
    const cloud = root.HerdHarborCloud;
    if (!cloud?.invokeFunction) throw new Error("The secure HerdHarbor subscription service is not ready yet.");
    return cloud.invokeFunction("subscription-billing", { action, ...body });
  }

  function provider() {
    return Object.freeze({
      name: "stripe",
      async getSubscriptionSnapshot() {
        const snapshot = normalizeSnapshot(await invoke("snapshot"));
        lastSnapshot = snapshot;
        queueMicrotask(() => reconcileEntitlement(snapshot));
        return snapshot;
      },
      async createCheckoutSession({ plan, interval = "month" } = {}) {
        if (!subscriptionsRequired()) throw new Error(PRELAUNCH_MESSAGE);
        return invoke("checkout", {
          planId: normalize(plan),
          billingInterval: normalize(interval) || "month",
          origin: originUrl()
        });
      },
      async createPortalSession() {
        return invoke("portal", { origin: originUrl() });
      },
      async cancelSubscription() {
        return invoke("cancel");
      },
      async reactivateSubscription() {
        return invoke("reactivate");
      }
    });
  }

  function manualAccessIsProtected(profile = {}, at = Date.now()) {
    const source = normalize(profile.membership_source || profile.membershipSource || "");
    const tier = normalize(profile.membership_tier || profile.membershipTier || "");
    if (source === "founder" || tier === "founder" && source === "founder") return true;
    if (source !== "manual_override") return false;
    const expiresAt = profile.override_expires_at || profile.overrideExpiresAt;
    if (!expiresAt) return true;
    const expires = timeValue(expiresAt);
    return Number.isFinite(expires) && expires > timeValue(at);
  }

  function baseAccessProfile() {
    return lastRemoteProfile || root.HerdHarborCloud?.getAccessProfile?.() || null;
  }

  function reconcileEntitlement(input = lastSnapshot || root.HerdHarborSubscriptionEngine?.getState?.(), at = Date.now()) {
    if (!subscriptionsRequired(at)) return null;
    const membership = root.HerdHarborMembership;
    if (!membership?.applyAccessProfile) return null;
    const base = baseAccessProfile();
    if (!base || manualAccessIsProtected(base, at)) return membership.getAccount?.() || null;

    const snapshot = normalizeSnapshot(input || {}, at);
    const entitled = snapshotIsEntitled(snapshot, at);
    const tier = entitled ? normalize(snapshot.plan) : "junior";
    const source = entitled ? "subscription" : "default";
    const current = membership.getAccount?.() || {};
    if (
      normalize(current.effectiveMembershipTier) === tier &&
      normalize(current.membershipSource) === source &&
      normalize(current.subscriptionStatus) === snapshot.status
    ) return current;

    applyingEntitlement = true;
    try {
      return membership.applyAccessProfile({
        ...base,
        membership_tier: tier,
        membership_source: source,
        subscription_status: snapshot.status || "not_configured"
      });
    } finally {
      applyingEntitlement = false;
    }
  }

  function bannerMarkup() {
    if (!subscriptionsRequired()) {
      return `<strong>Launch Trial</strong><span>Free through September 30. Subscriptions launch October 1, 2026. No payment is required during the launch trial, and you will not be automatically charged on October 1.</span>`;
    }
    return `<strong>Subscriptions are live</strong><span>The launch trial ended October 1. Choose a paid plan for unlimited HerdHarbor access, or continue on Junior with up to 5 active animals.</span>`;
  }

  function decoratePanel() {
    const panel = root.document?.getElementById?.("hh-subscription-engine-panel");
    if (!panel || panel.hidden) return;
    const content = panel.querySelector?.(".hh-subscription-content");
    if (!content) return;
    let banner = panel.querySelector?.("#hh-subscription-launch-banner");
    if (!banner) {
      banner = root.document.createElement("div");
      banner.id = "hh-subscription-launch-banner";
      banner.className = "hh-subscription-launch-banner";
      content.prepend(banner);
    }
    const markup = bannerMarkup();
    if (banner.innerHTML !== markup) banner.innerHTML = markup;
    banner.dataset.phase = phase();

    panel.querySelectorAll?.("[data-hh-subscription-select]").forEach((button) => {
      const beforeLaunch = !subscriptionsRequired();
      if (beforeLaunch) {
        if (!button.dataset.hhLaunchOriginalText) button.dataset.hhLaunchOriginalText = button.textContent || "Choose plan";
        button.disabled = true;
        button.textContent = "Available Oct 1";
        button.title = PRELAUNCH_MESSAGE;
      } else if (button.dataset.hhLaunchOriginalText) {
        button.disabled = false;
        button.textContent = button.dataset.hhLaunchOriginalText;
        button.removeAttribute("title");
      }
    });

    const state = normalizeSnapshot(lastSnapshot || root.HerdHarborSubscriptionEngine?.getState?.() || {});
    if (state.status === "trialing" && !subscriptionsRequired()) {
      const heroPill = panel.querySelector?.(".hh-subscription-hero .hh-subscription-pill");
      if (heroPill) heroPill.textContent = "Launch Trial";
    }
  }

  function scheduleDecorate() {
    const defer = typeof root.queueMicrotask === "function" ? root.queueMicrotask.bind(root) : (fn) => root.setTimeout(fn, 0);
    defer(decoratePanel);
  }

  function scheduleLaunchBoundary() {
    if (!root.setTimeout) return;
    if (launchTimer) root.clearTimeout?.(launchTimer);
    const remaining = HARD_LAUNCH_MS - Date.now();
    if (remaining <= 0) {
      reconcileEntitlement();
      scheduleDecorate();
      return;
    }
    launchTimer = root.setTimeout(async () => {
      try { await root.HerdHarborSubscriptionEngine?.refresh?.({ force: true }); } catch {}
      reconcileEntitlement();
      scheduleDecorate();
    }, Math.min(remaining + 250, 2147483647));
  }

  function configure() {
    if (configured) return true;
    const engine = root.HerdHarborSubscriptionEngine;
    const cloud = root.HerdHarborCloud;
    if (!engine?.configureProvider || !cloud?.invokeFunction) return false;
    engine.configureProvider(provider());
    configured = true;
    void engine.refresh?.({ force: true });
    return true;
  }

  function boot() {
    if (!root.document) return;
    const tryConfigure = () => {
      if (configure()) return;
      root.setTimeout?.(tryConfigure, 250);
    };
    tryConfigure();

    root.document.addEventListener("herdharbor:access-profile", (event) => {
      if (!applyingEntitlement) lastRemoteProfile = { ...(event.detail || {}) };
      if (subscriptionsRequired()) queueMicrotask(() => reconcileEntitlement());
    });
    root.document.addEventListener("herdharbor:subscription-engine-state", (event) => {
      lastSnapshot = normalizeSnapshot(event.detail || {});
      if (subscriptionsRequired()) queueMicrotask(() => reconcileEntitlement(lastSnapshot));
      scheduleDecorate();
    });
    root.document.addEventListener("click", (event) => {
      if (event.target?.closest?.("[data-hh-subscription-engine-tab]")) root.setTimeout?.(decoratePanel, 0);
    }, true);
    root.addEventListener?.("focus", () => {
      if (subscriptionsRequired()) void root.HerdHarborSubscriptionEngine?.refresh?.({ force: true });
      scheduleDecorate();
    });
    root.setInterval?.(() => {
      if (subscriptionsRequired()) reconcileEntitlement();
    }, 60 * 1000);

    scheduleLaunchBoundary();
    root.document.documentElement.dataset.hhSubscriptionPhase = phase();
  }

  const api = Object.freeze({
    version: VERSION,
    hardLaunchAt: HARD_LAUNCH_AT,
    phase,
    subscriptionsRequired,
    signupEligible,
    trialActive,
    launchPolicy,
    normalizeSnapshot,
    snapshotIsEntitled,
    reconcileEntitlement,
    configure,
    __test: Object.freeze({ manualAccessIsProtected, prelaunchMessage: PRELAUNCH_MESSAGE })
  });

  if (root.document) {
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", boot, { once: true });
    else boot();
  }
  return api;
});