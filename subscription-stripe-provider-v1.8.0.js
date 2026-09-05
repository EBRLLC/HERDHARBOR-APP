(() => {
  "use strict";

  const INTERVAL_KEY = "herdharbor_subscription_interval_v1";
  const ACTIVE = new Set(["active", "trialing", "founder", "free_junior", "resubscribed"]);
  const PLAN_ORDER = ["junior", "founder", "member", "business"];
  const PRICING = Object.freeze({
    junior: Object.freeze({ month: 0, year: 0 }),
    founder: Object.freeze({ month: 999, year: 11000 }),
    member: Object.freeze({ month: 1499, year: 15000 }),
    business: Object.freeze({ month: 4999, year: 55000 })
  });

  let selectedInterval = (() => {
    try { return localStorage.getItem(INTERVAL_KEY) === "year" ? "year" : "month"; }
    catch { return "month"; }
  })();
  let configured = false;
  let successRefreshInFlight = false;

  function appReturnUrl() {
    return `${window.location.origin}${window.location.pathname}`;
  }

  function money(cents, interval) {
    if (cents === 0) return "Free";
    return `$${(Number(cents) / 100).toFixed(2)}/${interval === "year" ? "yr" : "mo"}`;
  }

  async function call(action, payload = {}) {
    const cloud = window.HerdHarborCloud;
    if (!cloud?.invokeFunction) throw new Error("HerdHarbor secure billing is still starting. Try again in a moment.");
    return cloud.invokeFunction("subscription-billing", { action, ...payload });
  }

  function bridgeMembership(snapshot = {}) {
    const status = String(snapshot.status || "not_configured").toLowerCase();
    const tier = String(snapshot.plan || "").toLowerCase();
    window.HerdHarborMembership?.applySubscriptionState?.({
      status,
      tier,
      active: ACTIVE.has(status)
    });
  }

  const provider = Object.freeze({
    name: "stripe",
    async getSubscriptionSnapshot() {
      const snapshot = await call("snapshot");
      bridgeMembership(snapshot || {});
      return snapshot;
    },
    createCheckoutSession(payload = {}) {
      const planId = String(payload.plan || payload.planId || "").toLowerCase();
      if (planId === "junior") throw new Error("HerdHarbor Junior is a free youth plan and does not use Stripe checkout.");
      return call("checkout", {
        planId,
        billingInterval: selectedInterval,
        origin: appReturnUrl()
      });
    },
    createPortalSession() {
      return call("portal", { origin: appReturnUrl() });
    },
    async cancelSubscription() {
      const result = await call("cancel");
      await window.HerdHarborCloud?.refreshAccess?.().catch?.(() => {});
      return result;
    },
    async reactivateSubscription() {
      const result = await call("reactivate");
      await window.HerdHarborCloud?.refreshAccess?.().catch?.(() => {});
      return result;
    }
  });

  function setInterval(next) {
    selectedInterval = next === "year" ? "year" : "month";
    try { localStorage.setItem(INTERVAL_KEY, selectedInterval); } catch {}
    enhancePanel();
  }

  function enhancePanel() {
    const panel = document.getElementById("hh-subscription-engine-panel");
    if (!panel || panel.hidden) return;
    const grid = panel.querySelector(".hh-subscription-plan-grid");
    if (!grid) return;

    let switcher = panel.querySelector("[data-hh-stripe-interval-switcher]");
    if (!switcher) {
      switcher = document.createElement("div");
      switcher.className = "hh-subscription-interval-switcher";
      switcher.dataset.hhStripeIntervalSwitcher = "true";
      switcher.setAttribute("role", "group");
      switcher.setAttribute("aria-label", "Billing interval");
      switcher.innerHTML = `
        <button type="button" class="button button-ghost" data-hh-stripe-interval="month">Monthly</button>
        <button type="button" class="button button-ghost" data-hh-stripe-interval="year">Yearly</button>
        <span class="hh-subscription-note">Annual plans renew once per year.</span>`;
      grid.parentElement?.insertBefore(switcher, grid);
      switcher.addEventListener("click", (event) => {
        const button = event.target?.closest?.("[data-hh-stripe-interval]");
        if (!button) return;
        setInterval(button.dataset.hhStripeInterval);
      });
    }

    switcher.querySelectorAll("[data-hh-stripe-interval]").forEach((button) => {
      const active = button.dataset.hhStripeInterval === selectedInterval;
      button.classList.toggle("button-primary", active);
      button.classList.toggle("button-ghost", !active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    panel.querySelectorAll(".hh-subscription-plan-card").forEach((card, index) => {
      const planId = PLAN_ORDER[index];
      if (!planId) return;
      card.dataset.hhStripePlan = planId;
      const price = card.querySelector(".hh-subscription-price");
      if (price) price.textContent = money(PRICING[planId][selectedInterval], selectedInterval);
      const choose = card.querySelector("[data-hh-subscription-select]");
      if (choose && planId === "junior") {
        choose.disabled = true;
        choose.textContent = "Junior enrollment";
        choose.title = "The free Junior plan is managed through HerdHarbor youth enrollment, not Stripe.";
      }
    });
  }

  function configure() {
    if (configured) return true;
    const engine = window.HerdHarborSubscriptionEngine;
    if (!engine?.configureProvider || !window.HerdHarborCloud?.invokeFunction) return false;
    engine.configureProvider(provider);
    configured = true;
    queueMicrotask(() => engine.refresh?.({ force: true }));
    return true;
  }

  async function refreshAfterCheckout() {
    if (successRefreshInFlight) return;
    let url;
    try { url = new URL(window.location.href); } catch { return; }
    const result = url.searchParams.get("subscription");
    if (!result) return;

    url.searchParams.delete("subscription");
    url.searchParams.delete("session_id");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    if (result !== "success") return;

    successRefreshInFlight = true;
    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        if (attempt) await new Promise((resolve) => setTimeout(resolve, 1000));
        await window.HerdHarborCloud?.refreshAccess?.().catch?.(() => {});
        const snapshot = await provider.getSubscriptionSnapshot().catch(() => null);
        if (snapshot && ACTIVE.has(String(snapshot.status || "").toLowerCase())) {
          window.HerdHarborSubscriptionEngine?.applySnapshot?.(snapshot);
          break;
        }
      }
    } finally {
      successRefreshInFlight = false;
    }
  }

  function boot() {
    if (!configure()) {
      let attempts = 0;
      const timer = setInterval(() => {
        attempts += 1;
        if (configure() || attempts >= 40) clearInterval(timer);
      }, 250);
    }

    document.addEventListener("herdharbor:auth-session", (event) => {
      if (event.detail?.signedIn === true) {
        setTimeout(() => {
          configure();
          window.HerdHarborSubscriptionEngine?.refresh?.({ force: true });
          refreshAfterCheckout();
        }, 0);
      }
    });

    document.addEventListener("herdharbor:subscription-engine-state", () => setTimeout(enhancePanel, 0));
    document.addEventListener("click", (event) => {
      if (event.target?.closest?.("[data-hh-subscription-engine-tab]")) setTimeout(enhancePanel, 0);
    }, true);

    setTimeout(() => {
      enhancePanel();
      refreshAfterCheckout();
    }, 0);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
