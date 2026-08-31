(() => {
  "use strict";

  const release = window.HerdHarborRelease || {};
  const ACTIVE_STATES = new Set(["active", "trialing", "resubscribed", "founder", "free_junior"]);
  let provider = null;
  let refreshInFlight = null;
  let state = { status: "not_configured", tier: null, active: false, provider: "none", refreshedAt: null };

  function normalize(value = "") { return String(value ?? "").trim().toLowerCase(); }

  function publish(next) {
    state = { ...state, ...next, refreshedAt: new Date().toISOString() };
    document.dispatchEvent(new CustomEvent("herdharbor:billing-state", { detail: getState() }));
    return getState();
  }

  function getState() { return { ...state }; }

  function configureProvider(nextProvider) {
    provider = nextProvider && typeof nextProvider.getCustomerInfo === "function" ? nextProvider : null;
    return publish({ provider: provider?.name || "none", status: provider ? "ready" : "not_configured", tier: null, active: false });
  }

  function tierFromCustomerInfo(info = {}) {
    const active = info?.entitlements?.active || {};
    if (active.founder || active.herdharbor_founder) return "founder";
    if (active.business || active.herdharbor_business) return "business";
    if (active.member || active.herdharbor_member) return "member";
    if (active.junior || active.herdharbor_junior) return "junior";
    return null;
  }

  async function refresh() {
    if (release.featureFlags?.billingEnabled !== true) {
      return publish({ status: "not_configured", tier: null, active: false, provider: provider?.name || "none" });
    }
    if (!provider) return publish({ status: "unavailable", tier: null, active: false, provider: "none" });
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      try {
        const info = await provider.getCustomerInfo();
        const tier = tierFromCustomerInfo(info);
        const status = normalize(info?.status || (tier ? "active" : "expired"));
        return publish({ status, tier, active: Boolean(tier) && ACTIVE_STATES.has(status), provider: provider.name || "configured" });
      } catch (error) {
        window.HerdHarborMonitoring?.captureOperationalFailure?.("subscription_provider_failure", {
          module: "subscription",
          operation: "refresh_entitlements",
          result: "failure"
        }, error);
        return publish({ status: "unavailable", tier: null, active: false, provider: provider.name || "configured" });
      } finally {
        refreshInFlight = null;
      }
    })();
    return refreshInFlight;
  }

  window.HerdHarborBilling = Object.freeze({
    version: release.version || "1.6.1",
    enabled: () => release.featureFlags?.billingEnabled === true,
    plans: release.plans || {},
    configureProvider,
    refresh,
    getState,
    __test: Object.freeze({ tierFromCustomerInfo })
  });

  publish(state);
})();
