(() => {
  "use strict";

  const VERSION = "1.8.0";
  const STORAGE_KEY = "herdharbor_subscription_engine_v1";
  const APP_STATE_KEY = "herdharbor_pre_alpha_v1";
  const REFRESH_MAX_AGE_MS = 5 * 60 * 1000;
  const AUTH_SETTLE_MS = 1200;
  const ACTIVE_STATUSES = new Set(["active", "trialing", "founder", "free_junior", "resubscribed"]);
  const TERMINAL_STATUSES = new Set(["canceled", "expired", "unpaid", "incomplete_expired"]);
  const PLAN_ORDER = ["junior", "founder", "member", "business"];
  const DEFAULT_PLANS = Object.freeze({
    junior: Object.freeze({ id: "junior", label: "Junior", priceMonthly: 0, maxActiveAnimals: 5 }),
    founder: Object.freeze({ id: "founder", label: "Founder", priceMonthly: 7.99, maxActiveAnimals: null }),
    member: Object.freeze({ id: "member", label: "Member", priceMonthly: 14.99, maxActiveAnimals: null }),
    business: Object.freeze({ id: "business", label: "Business", priceMonthly: 49.99, maxActiveAnimals: null })
  });
  const REFERRAL_RULES = Object.freeze([
    Object.freeze({ threshold: 5, freeMonths: 1, label: "5 active referrals = 1 month free" }),
    Object.freeze({ threshold: 20, freeMonths: 3, label: "20 active referrals = 3 months free" })
  ]);

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
  const asIso = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  };
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const escapeHtml = (value = "") => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  let provider = null;
  let panel = null;
  let navButton = null;
  let observer = null;
  let authSignedIn = null;
  let lastAuthEventAt = 0;
  let lastRefreshAt = 0;
  let refreshInFlight = null;
  let diagnostics = [];
  let toastTimer = null;

  function planCatalog() {
    const releasePlans = window.HerdHarborRelease?.plans || {};
    const result = {};
    PLAN_ORDER.forEach((id) => {
      const fallback = DEFAULT_PLANS[id];
      const supplied = releasePlans[id] || {};
      result[id] = {
        ...fallback,
        ...supplied,
        id,
        label: supplied.label || fallback.label,
        priceMonthly: supplied.priceMonthly ?? fallback.priceMonthly
      };
    });
    return result;
  }

  function defaultState() {
    return {
      version: VERSION,
      status: "not_configured",
      plan: null,
      billingInterval: "month",
      priceCents: null,
      currency: "usd",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      trialEndsAt: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      gracePeriodEndsAt: null,
      provider: "none",
      providerCustomerId: null,
      providerSubscriptionId: null,
      nextInvoice: null,
      referral: {
        successfulReferrals: 0,
        freeMonthsEarned: 0,
        freeMonthsUsed: 0,
        freeMonthsRemaining: 0
      },
      paymentHistory: [],
      promotion: null,
      refreshedAt: null,
      source: "local_engine"
    };
  }

  function normalizeState(input = {}) {
    const base = defaultState();
    const referral = input.referral || {};
    const payments = Array.isArray(input.paymentHistory) ? input.paymentHistory.slice(0, 50) : [];
    return {
      ...base,
      ...input,
      version: VERSION,
      status: normalize(input.status || base.status),
      plan: PLAN_ORDER.includes(normalize(input.plan)) ? normalize(input.plan) : null,
      billingInterval: ["month", "year"].includes(normalize(input.billingInterval)) ? normalize(input.billingInterval) : "month",
      priceCents: input.priceCents == null ? null : Math.max(0, Math.round(finite(input.priceCents))),
      currency: normalize(input.currency || "usd") || "usd",
      currentPeriodStart: asIso(input.currentPeriodStart),
      currentPeriodEnd: asIso(input.currentPeriodEnd),
      trialEndsAt: asIso(input.trialEndsAt),
      canceledAt: asIso(input.canceledAt),
      gracePeriodEndsAt: asIso(input.gracePeriodEndsAt),
      cancelAtPeriodEnd: input.cancelAtPeriodEnd === true,
      provider: String(input.provider || "none"),
      providerCustomerId: input.providerCustomerId ? String(input.providerCustomerId) : null,
      providerSubscriptionId: input.providerSubscriptionId ? String(input.providerSubscriptionId) : null,
      referral: {
        successfulReferrals: Math.max(0, Math.floor(finite(referral.successfulReferrals))),
        freeMonthsEarned: Math.max(0, Math.floor(finite(referral.freeMonthsEarned))),
        freeMonthsUsed: Math.max(0, Math.floor(finite(referral.freeMonthsUsed))),
        freeMonthsRemaining: Math.max(0, Math.floor(finite(referral.freeMonthsRemaining)))
      },
      paymentHistory: payments.map((row) => ({
        id: String(row?.id || ""),
        createdAt: asIso(row?.createdAt),
        amountCents: Math.max(0, Math.round(finite(row?.amountCents))),
        currency: normalize(row?.currency || input.currency || "usd") || "usd",
        status: normalize(row?.status || "unknown"),
        description: String(row?.description || "Subscription payment")
      })),
      refreshedAt: asIso(input.refreshedAt),
      source: String(input.source || "local_engine")
    };
  }

  function readStoredState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  let state = normalizeState(readStoredState());

  function persistState(next = state) {
    try {
      const safe = normalizeState(next);
      // Provider IDs are safe references. Never persist payment credentials, tokens,
      // CVC data, bank details, or provider secrets in the browser.
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    } catch {}
  }

  function publish(next, { persist = true } = {}) {
    state = normalizeState({ ...state, ...(next || {}) });
    if (persist) persistState(state);
    document.dispatchEvent(new CustomEvent("herdharbor:subscription-engine-state", { detail: getState() }));
    if (panel?.isConnected) renderPanel();
    return getState();
  }

  function getState() {
    return clone(state);
  }

  function getAccountSnapshot() {
    const account = window.HerdHarborMembership?.getAccount?.() || {};
    const plans = planCatalog();
    const tier = normalize(account.effectiveMembershipTier || account.membershipTier || "");
    let animalCount = null;
    try {
      const local = JSON.parse(localStorage.getItem(APP_STATE_KEY) || "{}");
      const animals = Array.isArray(local.animals) ? local.animals : [];
      animalCount = window.HerdHarborMembership?.activeAnimalCount?.(animals);
      if (!Number.isFinite(animalCount)) {
        animalCount = animals.filter((animal) => !["sold", "deceased", "archived", "ancestor only"]
          .includes(normalize(animal?.status || "active"))).length;
      }
    } catch {}
    return {
      signedIn: authSignedIn,
      role: normalize(account.accountRole || "user"),
      tier: tier || null,
      planLabel: plans[tier]?.label || (tier ? titleCase(tier) : "Not resolved"),
      membershipSource: normalize(account.membershipSource || "default"),
      accountStatus: normalize(account.accountStatus || "active"),
      backendReady: account.backendReady === true,
      activeAnimalCount: Number.isFinite(animalCount) ? animalCount : null,
      maxActiveAnimals: account.maxActiveAnimals ?? plans[tier]?.maxActiveAnimals ?? null
    };
  }

  function configureProvider(nextProvider) {
    const valid = nextProvider
      && typeof nextProvider.getSubscriptionSnapshot === "function";
    provider = valid ? nextProvider : null;
    return publish({
      provider: provider?.name || "none",
      status: provider ? state.status : (state.status === "not_configured" ? "not_configured" : state.status)
    });
  }

  function providerCapability(name) {
    return Boolean(provider && typeof provider[name] === "function");
  }

  async function refresh({ force = false } = {}) {
    if (refreshInFlight) return refreshInFlight;
    const age = Date.now() - lastRefreshAt;
    if (!force && lastRefreshAt && age < 15000) return getState();

    refreshInFlight = (async () => {
      try {
        if (!provider) {
          lastRefreshAt = Date.now();
          const membership = window.HerdHarborMembership?.getAccount?.() || {};
          const legacyStatus = normalize(membership.subscriptionStatus || "");
          const nextStatus = legacyStatus && legacyStatus !== "not_configured"
            ? legacyStatus
            : state.status;
          const nextPlan = state.plan || (normalize(membership.membershipSource) === "subscription"
            ? normalize(membership.effectiveMembershipTier)
            : null);
          return publish({
            status: nextStatus || "not_configured",
            plan: PLAN_ORDER.includes(nextPlan) ? nextPlan : state.plan,
            provider: "none",
            refreshedAt: new Date().toISOString(),
            source: "membership_bridge"
          });
        }

        const snapshot = await provider.getSubscriptionSnapshot();
        lastRefreshAt = Date.now();
        return publish({
          ...normalizeState({ ...state, ...(snapshot || {}) }),
          provider: provider.name || "configured",
          refreshedAt: new Date().toISOString(),
          source: "provider"
        });
      } catch (error) {
        lastRefreshAt = Date.now();
        window.HerdHarborMonitoring?.captureOperationalFailure?.("subscription_engine_refresh_failure", {
          module: "subscription_engine",
          operation: "refresh",
          result: "failure"
        }, error);
        showToast(error?.message || "Subscription status could not be refreshed.", "error");
        return publish({
          status: state.status === "not_configured" ? "unavailable" : state.status,
          refreshedAt: new Date().toISOString()
        });
      } finally {
        refreshInFlight = null;
        diagnostics = runDiagnostics();
        if (panel?.isConnected) renderPanel();
      }
    })();

    return refreshInFlight;
  }

  async function performProviderAction(action, payload = {}) {
    if (!providerCapability(action)) {
      showToast("Payments are not connected yet. Your current HerdHarbor access is unchanged.", "info");
      return null;
    }
    try {
      const result = await provider[action](payload);
      if (result?.url) {
        const url = new URL(result.url, window.location.href);
        if (!/^https?:$/.test(url.protocol)) throw new Error("Billing provider returned an unsafe destination.");
        window.location.assign(url.href);
        return result;
      }
      await refresh({ force: true });
      return result;
    } catch (error) {
      window.HerdHarborMonitoring?.captureOperationalFailure?.("subscription_engine_action_failure", {
        module: "subscription_engine",
        operation: action,
        result: "failure"
      }, error);
      showToast(error?.message || "The billing request could not be completed.", "error");
      return null;
    }
  }

  function referralProjection(successfulReferrals = state.referral.successfulReferrals) {
    const count = Math.max(0, Math.floor(finite(successfulReferrals)));
    const achieved = REFERRAL_RULES.filter((rule) => count >= rule.threshold);
    const next = REFERRAL_RULES.find((rule) => count < rule.threshold) || null;
    return {
      count,
      achieved: clone(achieved),
      next: next ? { ...next, remaining: next.threshold - count } : null
    };
  }

  function formatMoney(cents, currency = "usd") {
    if (cents == null || !Number.isFinite(Number(cents))) return "—";
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: String(currency || "usd").toUpperCase()
      }).format(Number(cents) / 100);
    } catch {
      return `$${(Number(cents) / 100).toFixed(2)}`;
    }
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
  }

  function titleCase(value) {
    return String(value || "")
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function statusTone(status = state.status) {
    const normalized = normalize(status);
    if (ACTIVE_STATUSES.has(normalized)) return "good";
    if (["past_due", "unpaid", "incomplete", "unavailable"].includes(normalized)) return "warn";
    if (TERMINAL_STATUSES.has(normalized)) return "bad";
    return "neutral";
  }

  function appShellVisible() {
    const shell = document.getElementById("app-shell");
    if (!shell) return false;
    return !shell.classList.contains("hidden") && shell.getAttribute("aria-hidden") !== "true";
  }

  function authSurfaceVisible() {
    const candidates = [
      document.getElementById("auth-shell"),
      document.getElementById("auth-screen"),
      document.querySelector(".auth-shell"),
      document.querySelector(".auth-screen"),
      document.querySelector("[data-auth-screen]")
    ].filter(Boolean);
    return candidates.some((node) => {
      const style = window.getComputedStyle?.(node);
      return !node.classList.contains("hidden")
        && node.getAttribute("aria-hidden") !== "true"
        && style?.display !== "none"
        && style?.visibility !== "hidden";
    });
  }

  function runDiagnostics() {
    const results = [];
    const push = (id, ok, label, detail) => results.push({ id, ok: Boolean(ok), label, detail });

    const shellExists = Boolean(document.getElementById("app-shell"));
    const shellVisible = appShellVisible();
    const authVisible = authSurfaceVisible();
    push("app-shell", shellExists, "Application shell", shellExists ? "Found" : "Missing");
    push(
      "auth-screen-conflict",
      !(shellVisible && authVisible),
      "Sign-in screen isolation",
      shellVisible && authVisible ? "App and sign-in surfaces are both visible." : "No overlapping sign-in surface detected."
    );
    push(
      "auth-session-shell",
      authSignedIn == null || authSignedIn === shellVisible || (!authSignedIn && !shellVisible),
      "Session-to-screen consistency",
      authSignedIn == null
        ? "Waiting for auth session signal."
        : `Auth says ${authSignedIn ? "signed in" : "signed out"}; app shell is ${shellVisible ? "visible" : "hidden"}.`
    );

    const duplicateTabs = document.querySelectorAll("[data-hh-subscription-engine-tab]").length;
    const duplicatePanels = document.querySelectorAll("#hh-subscription-engine-panel").length;
    push("single-tab", duplicateTabs <= 1, "Subscription tab uniqueness", `${duplicateTabs} tab instance${duplicateTabs === 1 ? "" : "s"}.`);
    push("single-panel", duplicatePanels <= 1, "Subscription panel uniqueness", `${duplicatePanels} panel instance${duplicatePanels === 1 ? "" : "s"}.`);

    const buildVersion = String(window.HerdHarborBuild?.version || "");
    push("build-version", buildVersion === VERSION, "Release identity", buildVersion ? `Build reports v${buildVersion}.` : "Build metadata unavailable.");

    const refreshAge = state.refreshedAt ? Date.now() - new Date(state.refreshedAt).getTime() : Infinity;
    push(
      "fresh-state",
      !appShellVisible() || refreshAge <= REFRESH_MAX_AGE_MS,
      "Subscription state freshness",
      Number.isFinite(refreshAge) ? `Last refreshed ${Math.max(0, Math.round(refreshAge / 1000))} seconds ago.` : "Not refreshed yet."
    );

    const suspiciousKeys = [];
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = String(localStorage.key(i) || "");
        if (/stripe.*(secret|private)|card.*(number|cvc|cvv)|payment.*secret/i.test(key)) suspiciousKeys.push(key);
      }
    } catch {}
    push(
      "sensitive-storage",
      suspiciousKeys.length === 0,
      "Sensitive browser storage",
      suspiciousKeys.length ? "Potentially sensitive payment-storage keys were detected." : "No payment-secret key names detected."
    );

    push(
      "legacy-isolation",
      window.HerdHarborBilling !== window.HerdHarborSubscriptionEngine,
      "Legacy billing isolation",
      "The v1.8.0 engine uses a separate namespace from legacy billing."
    );
    return results;
  }

  function diagnosticsSummary() {
    const rows = diagnostics.length ? diagnostics : runDiagnostics();
    const failed = rows.filter((row) => !row.ok);
    return {
      ok: failed.length === 0,
      total: rows.length,
      passed: rows.length - failed.length,
      failed: clone(failed),
      results: clone(rows)
    };
  }

  function scheduleStaleScreenRepair(reason = "visibility") {
    window.clearTimeout(scheduleStaleScreenRepair.timer);
    scheduleStaleScreenRepair.timer = window.setTimeout(async () => {
      const shellVisible = appShellVisible();
      const authVisible = authSurfaceVisible();
      const mismatch = authSignedIn != null && (
        (authSignedIn && !shellVisible && !authVisible) ||
        (!authSignedIn && shellVisible)
      );
      const overlap = shellVisible && authVisible;

      if (mismatch || overlap) {
        try {
          await window.HerdHarborMembership?.refresh?.();
        } catch {}
        document.dispatchEvent(new CustomEvent("herdharbor:stale-screen-detected", {
          detail: { source: "subscription_engine", reason, mismatch, overlap }
        }));
      }
      await refresh({ force: true });
      diagnostics = runDiagnostics();
      syncVisibility();
    }, AUTH_SETTLE_MS);
  }

  function ensureNavButton() {
    const nav = document.querySelector(".main-nav");
    if (!nav) return null;

    const existing = document.querySelector("[data-hh-subscription-engine-tab]");
    if (existing) {
      navButton = existing;
      return existing;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "nav-item hh-subscription-nav";
    button.dataset.hhSubscriptionEngineTab = "true";
    button.title = "Subscription";
    button.setAttribute("aria-controls", "hh-subscription-engine-panel");
    button.setAttribute("aria-expanded", "false");
    button.innerHTML = '<span class="nav-icon" aria-hidden="true">◎</span><span>Subscription</span>';

    const admin = nav.querySelector('[data-route="admin"]');
    if (admin) nav.insertBefore(button, admin);
    else nav.appendChild(button);

    navButton = button;
    return button;
  }

  function ensurePanel() {
    if (panel?.isConnected) return panel;
    const existing = document.getElementById("hh-subscription-engine-panel");
    if (existing) {
      panel = existing;
      return panel;
    }

    panel = document.createElement("section");
    panel.id = "hh-subscription-engine-panel";
    panel.className = "hh-subscription-panel";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "hh-subscription-title");
    (document.body || document.documentElement).appendChild(panel);
    return panel;
  }

  function closePanel({ restoreFocus = true } = {}) {
    if (!panel) return;
    panel.hidden = true;
    document.documentElement.classList.remove("hh-subscription-open");
    navButton?.setAttribute("aria-expanded", "false");
    if (restoreFocus) navButton?.focus?.();
  }

  async function openPanel() {
    ensurePanel();
    panel.hidden = false;
    document.documentElement.classList.add("hh-subscription-open");
    navButton?.setAttribute("aria-expanded", "true");
    diagnostics = runDiagnostics();
    renderPanel();
    panel.querySelector("[data-hh-subscription-close]")?.focus?.();
    await refresh({ force: true });
  }

  function showToast(message, tone = "info") {
    let toast = document.getElementById("hh-subscription-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "hh-subscription-toast";
      toast.className = "hh-subscription-toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      (document.body || document.documentElement).appendChild(toast);
    }
    toast.dataset.tone = tone;
    toast.textContent = String(message || "");
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toast.hidden = true; }, 4500);
  }

  function renderPanel() {
    if (!panel) return;
    const account = getAccountSnapshot();
    const plans = planCatalog();
    const currentPlan = state.plan || account.tier;
    const plan = plans[currentPlan] || null;
    const referral = referralProjection();
    const diag = diagnosticsSummary();
    const paymentRows = state.paymentHistory.length
      ? state.paymentHistory.slice(0, 8).map((row) => `
          <tr>
            <td>${escapeHtml(formatDate(row.createdAt))}</td>
            <td>${escapeHtml(row.description)}</td>
            <td>${escapeHtml(formatMoney(row.amountCents, row.currency))}</td>
            <td><span class="hh-subscription-pill" data-tone="${statusTone(row.status)}">${escapeHtml(titleCase(row.status))}</span></td>
          </tr>`).join("")
      : '<tr><td colspan="4" class="hh-subscription-empty">No payment history is available yet.</td></tr>';

    const diagnosticRows = diag.results.map((row) => `
      <li data-ok="${row.ok ? "true" : "false"}">
        <span class="hh-subscription-check" aria-hidden="true">${row.ok ? "✓" : "!"}</span>
        <div><strong>${escapeHtml(row.label)}</strong><span>${escapeHtml(row.detail)}</span></div>
      </li>`).join("");

    const planCards = PLAN_ORDER.map((id) => {
      const item = plans[id];
      const active = id === currentPlan;
      const monthly = item.priceMonthly == null ? "Contact us" : item.priceMonthly === 0 ? "Free" : `$${Number(item.priceMonthly).toFixed(2)}/mo`;
      return `
        <article class="hh-subscription-plan-card" data-current="${active ? "true" : "false"}">
          <div>
            <span class="hh-subscription-kicker">${active ? "Current access" : "Plan"}</span>
            <h3>${escapeHtml(item.label)}</h3>
            <p class="hh-subscription-price">${escapeHtml(monthly)}</p>
            <p>${item.maxActiveAnimals ? `Up to ${item.maxActiveAnimals} active animals.` : "Unlimited active animals."}</p>
          </div>
          ${active
            ? '<span class="hh-subscription-current">Current</span>'
            : `<button type="button" class="button button-ghost" data-hh-subscription-select="${escapeHtml(id)}">Choose ${escapeHtml(item.label)}</button>`}
        </article>`;
    }).join("");

    panel.innerHTML = `
      <div class="hh-subscription-backdrop" data-hh-subscription-close></div>
      <div class="hh-subscription-shell">
        <header class="hh-subscription-header">
          <div>
            <span class="hh-subscription-kicker">HerdHarbor Alpha v${VERSION}</span>
            <h2 id="hh-subscription-title">Subscription</h2>
            <p>Standalone subscription management that reads your HerdHarbor account without replacing existing membership or sign-in systems.</p>
          </div>
          <button type="button" class="icon-button hh-subscription-close" data-hh-subscription-close aria-label="Close subscription">×</button>
        </header>

        <div class="hh-subscription-content">
          <section class="hh-subscription-hero">
            <div>
              <span class="hh-subscription-kicker">Account status</span>
              <div class="hh-subscription-status-line">
                <h3>${escapeHtml(plan?.label || account.planLabel || "HerdHarbor")}</h3>
                <span class="hh-subscription-pill" data-tone="${statusTone()}">${escapeHtml(titleCase(state.status))}</span>
              </div>
              <p>${state.cancelAtPeriodEnd
                ? `Cancellation is scheduled for ${escapeHtml(formatDate(state.currentPeriodEnd))}.`
                : state.currentPeriodEnd
                  ? `Current billing period ends ${escapeHtml(formatDate(state.currentPeriodEnd))}.`
                  : provider ? "Billing provider connected." : "Payment processing is not connected yet; existing access remains unchanged."}</p>
            </div>
            <div class="hh-subscription-actions">
              <button type="button" class="button button-primary" data-hh-subscription-refresh>Refresh</button>
              <button type="button" class="button button-ghost" data-hh-subscription-manage ${providerCapability("createPortalSession") ? "" : "disabled"}>Manage billing</button>
            </div>
          </section>

          <div class="hh-subscription-stat-grid">
            <article><span>Signed in</span><strong>${account.signedIn == null ? "Checking…" : account.signedIn ? "Yes" : "No"}</strong></article>
            <article><span>Account role</span><strong>${escapeHtml(titleCase(account.role))}</strong></article>
            <article><span>Active animals</span><strong>${account.activeAnimalCount == null ? "—" : escapeHtml(account.activeAnimalCount)}</strong></article>
            <article><span>Next payment</span><strong>${state.nextInvoice?.amountCents != null ? escapeHtml(formatMoney(state.nextInvoice.amountCents, state.nextInvoice.currency || state.currency)) : "—"}</strong></article>
          </div>

          <section class="hh-subscription-section">
            <div class="hh-subscription-section-heading">
              <div><span class="hh-subscription-kicker">Plans</span><h3>Choose the right HerdHarbor access</h3></div>
              <span class="hh-subscription-note">Payment credentials are never stored by HerdHarbor.</span>
            </div>
            <div class="hh-subscription-plan-grid">${planCards}</div>
          </section>

          <section class="hh-subscription-grid-two">
            <article class="hh-subscription-card">
              <span class="hh-subscription-kicker">Referral credits</span>
              <h3>${escapeHtml(state.referral.freeMonthsRemaining)} free month${state.referral.freeMonthsRemaining === 1 ? "" : "s"} available</h3>
              <p>${escapeHtml(referral.count)} active referral${referral.count === 1 ? "" : "s"} recorded.</p>
              <div class="hh-subscription-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${referral.next?.threshold || referral.count || 1}" aria-valuenow="${referral.count}">
                <span style="width:${referral.next ? Math.min(100, (referral.count / referral.next.threshold) * 100) : 100}%"></span>
              </div>
              <p class="hh-subscription-note">${referral.next
                ? `${referral.next.remaining} more active referral${referral.next.remaining === 1 ? "" : "s"} to reach: ${escapeHtml(referral.next.label)}.`
                : "All currently configured referral milestones have been reached."}</p>
              <ul class="hh-subscription-rule-list">${REFERRAL_RULES.map((rule) => `<li>${escapeHtml(rule.label)}</li>`).join("")}</ul>
            </article>

            <article class="hh-subscription-card">
              <span class="hh-subscription-kicker">Access bridge</span>
              <h3>${escapeHtml(account.planLabel)}</h3>
              <dl class="hh-subscription-details">
                <div><dt>Membership source</dt><dd>${escapeHtml(titleCase(account.membershipSource))}</dd></div>
                <div><dt>Account status</dt><dd>${escapeHtml(titleCase(account.accountStatus))}</dd></div>
                <div><dt>Backend verified</dt><dd>${account.backendReady ? "Yes" : "Not yet"}</dd></div>
                <div><dt>Animal allowance</dt><dd>${account.maxActiveAnimals == null ? "Unlimited" : escapeHtml(account.maxActiveAnimals)}</dd></div>
              </dl>
            </article>
          </section>

          <section class="hh-subscription-section">
            <div class="hh-subscription-section-heading">
              <div><span class="hh-subscription-kicker">Billing activity</span><h3>Recent payments</h3></div>
            </div>
            <div class="hh-subscription-table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Status</th></tr></thead>
                <tbody>${paymentRows}</tbody>
              </table>
            </div>
          </section>

          <section class="hh-subscription-section">
            <div class="hh-subscription-section-heading">
              <div><span class="hh-subscription-kicker">Release guardrails</span><h3>Sign-in & stale-screen diagnostics</h3></div>
              <span class="hh-subscription-pill" data-tone="${diag.ok ? "good" : "warn"}">${diag.passed}/${diag.total} checks passed</span>
            </div>
            <ul class="hh-subscription-diagnostics">${diagnosticRows}</ul>
          </section>

          <section class="hh-subscription-danger">
            <div>
              <span class="hh-subscription-kicker">Subscription controls</span>
              <h3>${state.cancelAtPeriodEnd ? "Subscription scheduled to end" : "Cancel or reactivate"}</h3>
              <p>Cancellation never deletes animal records. HerdHarbor access policy remains controlled by the existing membership system.</p>
            </div>
            ${state.cancelAtPeriodEnd
              ? `<button type="button" class="button button-ghost" data-hh-subscription-reactivate ${providerCapability("reactivateSubscription") ? "" : "disabled"}>Reactivate</button>`
              : `<button type="button" class="button button-ghost" data-hh-subscription-cancel ${providerCapability("cancelSubscription") ? "" : "disabled"}>Cancel at period end</button>`}
          </section>
        </div>
      </div>`;

    bindPanelActions();
  }

  function bindPanelActions() {
    panel?.querySelectorAll("[data-hh-subscription-close]").forEach((node) => {
      node.addEventListener("click", () => closePanel());
    });
    panel?.querySelector("[data-hh-subscription-refresh]")?.addEventListener("click", () => refresh({ force: true }));
    panel?.querySelector("[data-hh-subscription-manage]")?.addEventListener("click", () => performProviderAction("createPortalSession"));
    panel?.querySelector("[data-hh-subscription-cancel]")?.addEventListener("click", () => performProviderAction("cancelSubscription", { atPeriodEnd: true }));
    panel?.querySelector("[data-hh-subscription-reactivate]")?.addEventListener("click", () => performProviderAction("reactivateSubscription"));
    panel?.querySelectorAll("[data-hh-subscription-select]").forEach((node) => {
      node.addEventListener("click", () => {
        performProviderAction("createCheckoutSession", { plan: node.dataset.hhSubscriptionSelect, interval: "month" });
      });
    });
  }

  function syncVisibility() {
    ensureNavButton();
    const shouldShow = appShellVisible();
    if (navButton) {
      navButton.hidden = !shouldShow;
      navButton.setAttribute("aria-hidden", shouldShow ? "false" : "true");
      if (!shouldShow && panel && !panel.hidden) closePanel({ restoreFocus: false });
    }
  }

  function bindEvents() {
    if (document.documentElement.dataset.hhSubscriptionEngineBound === "true") return;
    document.documentElement.dataset.hhSubscriptionEngineBound = "true";

    document.addEventListener("click", (event) => {
      const trigger = event.target?.closest?.("[data-hh-subscription-engine-tab]");
      if (!trigger) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openPanel();
    }, true);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && panel && !panel.hidden) closePanel();
    });

    document.addEventListener("herdharbor:auth-session", (event) => {
      authSignedIn = event.detail?.signedIn === true;
      lastAuthEventAt = Date.now();
      syncVisibility();
      scheduleStaleScreenRepair("auth-session");
    });

    ["herdharbor:membership-change", "herdharbor:access-profile", "herdharbor:billing-state"].forEach((name) => {
      document.addEventListener(name, () => {
        if (panel && !panel.hidden) renderPanel();
      });
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") scheduleStaleScreenRepair("visibility");
    });
    window.addEventListener("focus", () => scheduleStaleScreenRepair("focus"));

    observer = new MutationObserver(() => syncVisibility());
    const shell = document.getElementById("app-shell");
    if (shell) observer.observe(shell, { attributes: true, attributeFilter: ["class", "aria-hidden"] });

    window.setInterval(() => {
      if (document.visibilityState === "visible" && appShellVisible()) {
        const refreshed = state.refreshedAt ? new Date(state.refreshedAt).getTime() : 0;
        if (!refreshed || Date.now() - refreshed > REFRESH_MAX_AGE_MS) scheduleStaleScreenRepair("age");
      }
    }, 60 * 1000);
  }

  function boot() {
    ensureNavButton();
    ensurePanel();
    bindEvents();
    syncVisibility();
    diagnostics = runDiagnostics();
    refresh({ force: true });
  }

  window.HerdHarborSubscriptionEngine = Object.freeze({
    version: VERSION,
    getState,
    getAccountSnapshot,
    getPlans: () => clone(planCatalog()),
    getReferralRules: () => clone(REFERRAL_RULES),
    referralProjection,
    configureProvider,
    refresh,
    open: openPanel,
    close: closePanel,
    runDiagnostics: () => clone(runDiagnostics()),
    getDiagnostics: diagnosticsSummary,
    applySnapshot: (snapshot) => publish(snapshot),
    __test: Object.freeze({
      normalizeState,
      referralProjection,
      statusTone,
      planCatalog,
      storageKey: STORAGE_KEY
    })
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();