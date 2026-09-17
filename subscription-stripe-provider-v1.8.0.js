(() => {
  "use strict";

  const INTERVAL_KEY = "herdharbor_subscription_interval_v1";
  const CALL_TIMEOUT_MS = 15000;
  const ACCESS_REFRESH_TIMEOUT_MS = 5000;
  const ACTIVE = new Set(["active", "trialing", "founder", "free_junior", "free_adult", "resubscribed"]);
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
  let checkoutReadyTimer = null;
  let lastMembershipSignature = "";
  let verifiedSnapshotUserId = null;

  function sessionUserId() {
    try { return String(window.HerdHarborCloud?.getSession?.()?.user?.id || ""); }
    catch { return ""; }
  }

  function appReturnUrl() {
    return `${window.location.origin}${window.location.pathname}`;
  }

  function appReadyForBilling() {
    const signedIn = Boolean(sessionUserId());
    const authLocked = document.documentElement.classList.contains("hh-auth-locked");
    return signedIn && !authLocked;
  }

  function money(cents, interval) {
    if (cents === 0) return "Free";
    return `$${(Number(cents) / 100).toFixed(2)}/${interval === "year" ? "yr" : "mo"}`;
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    try { return new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(date); }
    catch { return date.toLocaleDateString(); }
  }

  async function settleWithin(promise, timeoutMs = ACCESS_REFRESH_TIMEOUT_MS) {
    if (!promise || typeof promise.then !== "function") return null;
    let timeoutId = null;
    try {
      return await Promise.race([
        promise,
        new Promise((resolve) => {
          timeoutId = window.setTimeout(() => resolve(null), timeoutMs);
        })
      ]);
    } catch {
      return null;
    } finally {
      if (timeoutId != null) window.clearTimeout(timeoutId);
    }
  }

  async function refreshAccessBounded() {
    const refresh = window.HerdHarborCloud?.refreshAccess;
    if (typeof refresh !== "function") return null;
    return settleWithin(Promise.resolve().then(() => refresh()), ACCESS_REFRESH_TIMEOUT_MS);
  }

  async function call(action, payload = {}) {
    const cloud = window.HerdHarborCloud;
    if (!cloud?.invokeFunction) throw new Error("HerdHarbor secure billing is still starting. Try again in a moment.");
    if (!appReadyForBilling()) throw new Error("HerdHarbor secure billing will be available after sign-in finishes.");

    let timeoutId = null;
    try {
      return await Promise.race([
        cloud.invokeFunction("subscription-billing", { action, ...payload }),
        new Promise((_, reject) => {
          timeoutId = window.setTimeout(() => reject(new Error("The billing service took too long to respond. Try again.")), CALL_TIMEOUT_MS);
        })
      ]);
    } finally {
      if (timeoutId != null) window.clearTimeout(timeoutId);
    }
  }

  function bridgeMembership(snapshot = {}) {
    const status = String(snapshot.status || "not_configured").toLowerCase();
    const tier = String(snapshot.plan || "").toLowerCase();
    const active = ACTIVE.has(status);
    const signature = `${status}|${tier}|${active ? "1" : "0"}`;
    if (signature === lastMembershipSignature) return;
    lastMembershipSignature = signature;
    window.HerdHarborMembership?.applySubscriptionState?.({ status, tier, active });
  }

  const provider = Object.freeze({
    name: "stripe",
    async getSubscriptionSnapshot() {
      if (!appReadyForBilling()) return null;
      const userId = sessionUserId();
      const snapshot = await call("snapshot");
      if (snapshot && userId && userId === sessionUserId()) verifiedSnapshotUserId = userId;
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
      await refreshAccessBounded();
      return result;
    },
    async reactivateSubscription() {
      const result = await call("reactivate");
      await refreshAccessBounded();
      return result;
    }
  });

  function setBillingInterval(next) {
    selectedInterval = next === "year" ? "year" : "month";
    try { localStorage.setItem(INTERVAL_KEY, selectedInterval); } catch {}
    enhancePanel();
  }

  async function beginMemberCheckout(button) {
    if (button) button.disabled = true;
    try {
      const result = await provider.createCheckoutSession({ plan: "member" });
      if (!result?.url) throw new Error("Checkout did not return a secure destination.");
      const url = new URL(result.url, window.location.href);
      if (!/^https?:$/.test(url.protocol)) throw new Error("Billing provider returned an unsafe destination.");
      window.location.assign(url.href);
    } catch (error) {
      const panel = document.getElementById("hh-subscription-engine-panel");
      const heroStatus = panel?.querySelector?.(".hh-subscription-hero p");
      if (heroStatus) heroStatus.textContent = error?.message || "The billing request could not be completed.";
      if (button) button.disabled = false;
    }
  }

  function ensureFreeAdultCard(grid, isCurrent) {
    let card = grid.querySelector("[data-hh-free-adult-card]");
    if (!card) {
      card = document.createElement("article");
      card.className = "hh-subscription-plan-card";
      card.dataset.hhFreeAdultCard = "true";
      grid.insertBefore(card, grid.firstChild);
    }
    card.dataset.current = isCurrent ? "true" : "false";
    card.innerHTML = `
      <div>
        <span class="hh-subscription-kicker">${isCurrent ? "Current access" : "Free plan"}</span>
        <h3>Free Adult</h3>
        <p class="hh-subscription-price">Free</p>
        <p>Up to 5 active animals with the same app features available to the Junior plan, without youth enrollment.</p>
      </div>
      ${isCurrent ? '<span class="hh-subscription-current">Current</span>' : '<span class="hh-subscription-note">Automatically available after your trial or paid membership ends.</span>'}`;
    return card;
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
        setBillingInterval(button.dataset.hhStripeInterval);
      });
    }

    switcher.querySelectorAll("[data-hh-stripe-interval]").forEach((button) => {
      const active = button.dataset.hhStripeInterval === selectedInterval;
      button.classList.toggle("button-primary", active);
      button.classList.toggle("button-ghost", !active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    panel.querySelectorAll(".hh-subscription-plan-card:not([data-hh-free-adult-card])").forEach((card, index) => {
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

    const snapshot = window.HerdHarborSubscriptionEngine?.getState?.() || {};
    const status = String(snapshot.status || "").toLowerCase();
    const freeAdult = snapshot.freeAdult === true || status === "free_adult";
    ensureFreeAdultCard(grid, freeAdult);

    const heroStatus = panel.querySelector(".hh-subscription-hero p");
    const trialDate = formatDate(snapshot.trialEndsAt || snapshot.initialTrialEndsAt);
    if (freeAdult) {
      if (heroStatus) {
        heroStatus.textContent = "Free Adult includes up to 5 active animals. Your existing HerdHarbor records stay available, and you can upgrade to unlimited Member access at any time.";
      }
    } else if (snapshot.initialTrial === true && status === "trialing") {
      if (heroStatus) {
        heroStatus.textContent = trialDate
          ? `Free Member Trial — your free Member access ends ${trialDate}. No credit card is required during your free trial.`
          : "Free Member Trial — no credit card is required during your free trial.";
      }
    } else if (snapshot.subscriptionRequired === true || status === "expired") {
      if (heroStatus) {
        heroStatus.textContent = "Your paid or trial access has ended. HerdHarbor has moved the account to Free Adult with up to 5 active animals; your existing data remains preserved.";
      }
    }

    const memberCard = panel.querySelector('[data-hh-stripe-plan="member"]');
    if (freeAdult && memberCard) {
      memberCard.dataset.current = "false";
      memberCard.querySelector(".hh-subscription-current")?.remove();
    }

    const needsMemberCta = freeAdult || (!snapshot.providerSubscriptionId
      && (snapshot.initialTrial === true || snapshot.subscriptionRequired === true || status === "expired"));
    if (needsMemberCta && memberCard) {
      let button = memberCard.querySelector("[data-hh-trial-member-checkout]");
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "button button-primary";
        button.dataset.hhTrialMemberCheckout = "true";
        memberCard.appendChild(button);
      }
      button.textContent = freeAdult
        ? "Upgrade to Member"
        : (snapshot.subscriptionRequired === true || status === "expired"
          ? "Subscribe to Member"
          : (trialDate ? `Subscribe — billing starts ${trialDate}` : "Subscribe to Member"));
      if (button.dataset.hhTrialCheckoutBound !== "true") {
        button.dataset.hhTrialCheckoutBound = "true";
        button.addEventListener("click", () => void beginMemberCheckout(button));
      }
    }
  }

  function configure() {
    if (configured) return true;
    const engine = window.HerdHarborSubscriptionEngine;
    if (!engine?.configureProvider || !window.HerdHarborCloud?.invokeFunction) return false;
    engine.configureProvider(provider);
    configured = true;
    return true;
  }

  function hasCheckoutResult() {
    try { return Boolean(new URL(window.location.href).searchParams.get("subscription")); }
    catch { return false; }
  }

  async function refreshAfterCheckout() {
    if (successRefreshInFlight || !appReadyForBilling()) return;
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
        if (attempt) await new Promise((resolve) => window.setTimeout(resolve, 1000));
        await refreshAccessBounded();
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

  function stopCheckoutReadyTimer() {
    if (checkoutReadyTimer != null) {
      window.clearInterval(checkoutReadyTimer);
      checkoutReadyTimer = null;
    }
  }

  function refreshCheckoutWhenReady() {
    if (!hasCheckoutResult()) {
      stopCheckoutReadyTimer();
      return;
    }
    if (checkoutReadyTimer != null) return;

    let attempts = 0;
    checkoutReadyTimer = window.setInterval(() => {
      attempts += 1;
      if (appReadyForBilling()) {
        stopCheckoutReadyTimer();
        void refreshAfterCheckout();
      } else if (attempts >= 40) {
        stopCheckoutReadyTimer();
      }
    }, 250);
  }

  function boot() {
    if (!configure()) {
      let attempts = 0;
      const timer = window.setInterval(() => {
        attempts += 1;
        if (configure() || attempts >= 40) window.clearInterval(timer);
      }, 250);
    }

    document.addEventListener("herdharbor:auth-session", (event) => {
      if (event.detail?.signedIn === true) {
        const currentUserId = sessionUserId();
        if (!currentUserId || verifiedSnapshotUserId !== currentUserId) verifiedSnapshotUserId = null;
        configure();
        refreshCheckoutWhenReady();
      } else if (event.detail?.signedIn === false) {
        verifiedSnapshotUserId = null;
        stopCheckoutReadyTimer();
      }
    });

    document.addEventListener("herdharbor:subscription-engine-state", () => window.setTimeout(enhancePanel, 0));
    document.addEventListener("click", (event) => {
      if (event.target?.closest?.("[data-hh-subscription-engine-tab]")) window.setTimeout(enhancePanel, 0);
    }, true);

    window.setTimeout(() => {
      enhancePanel();
      refreshCheckoutWhenReady();
    }, 0);
  }

  window.HerdHarborStripeSnapshotTrust = Object.freeze({
    isVerified: () => Boolean(sessionUserId()) && verifiedSnapshotUserId === sessionUserId()
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();