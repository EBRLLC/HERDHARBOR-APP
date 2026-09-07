(() => {
  "use strict";

  const VERSION = "1.8.1";
  const PANEL_ID = "hh-admin-subscription-health";
  const MAX_ENHANCE_ATTEMPTS = 40;
  let selectedUserId = "";
  let timer = null;
  let requestSequence = 0;

  const esc = (value = "") => String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const title = (value = "") => String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  const date = (value) => {
    if (!value) return "—";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
  };

  function canAdminister() { return window.HerdHarborMembership?.canAccessAdmin?.() === true; }
  async function secureCall(action, payload = {}) {
    if (!window.HerdHarborCloud?.invokeFunction) throw new Error("The secure subscription service is still starting.");
    return window.HerdHarborCloud.invokeFunction("subscription-billing", { action, ...payload });
  }

  function addStyles() {
    if (document.getElementById("hh-admin-subscription-health-style")) return;
    const style = document.createElement("style");
    style.id = "hh-admin-subscription-health-style";
    style.textContent = `
      #${PANEL_ID} .hh-health-banner{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:12px;margin:10px 0 14px;background:rgba(36,100,63,.08);border:1px solid rgba(36,100,63,.2)}
      #${PANEL_ID} .hh-health-banner[data-ok=false]{background:rgba(155,28,28,.07);border-color:rgba(155,28,28,.2)}
      #${PANEL_ID} .hh-health-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:12px 0}
      #${PANEL_ID} .hh-health-stat{padding:11px;border-radius:10px;border:1px solid rgba(13,37,64,.12);background:rgba(13,37,64,.035)}
      #${PANEL_ID} .hh-health-stat span,#${PANEL_ID} .hh-health-stat strong{display:block}#${PANEL_ID} .hh-health-stat span{font-size:.78rem;color:var(--muted,#65727E)}
      #${PANEL_ID} .hh-health-stat strong{margin-top:3px;color:var(--navy,#0D2540)}
      #${PANEL_ID} .hh-health-flags{margin:10px 0;padding-left:20px;color:#9B1C1C}#${PANEL_ID} .hh-health-ok{color:#24643F;font-weight:750}
      #${PANEL_ID} .hh-health-meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0;font-size:.88rem}#${PANEL_ID} .hh-health-meta div{padding:9px;border-radius:9px;background:rgba(13,37,64,.035)}
      #${PANEL_ID} .hh-health-status{min-height:1.3em;margin:8px 0 0;font-weight:700}#${PANEL_ID} .hh-health-status[data-tone=error]{color:#9B1C1C}#${PANEL_ID} .hh-health-status[data-tone=success]{color:#24643F}
      @media(max-width:700px){#${PANEL_ID} .hh-health-grid{grid-template-columns:1fr 1fr}#${PANEL_ID} .hh-health-meta{grid-template-columns:1fr}}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function baseMarkup() {
    return `<article class="hh-admin-detail-card" id="${PANEL_ID}">
      <h2>Subscription health</h2>
      <p>Live entitlement, Stripe, referral, notification, and webhook reconciliation for this member.</p>
      <div data-hh-subscription-health-body><p>Loading subscription health…</p></div>
      <div class="action-row">
        <button class="button button-ghost" type="button" data-hh-health-refresh>Refresh health</button>
        <button class="button button-ghost" type="button" data-hh-health-retry hidden>Retry failed emails</button>
      </div>
      <p class="hh-health-status" data-hh-health-status role="status" aria-live="polite"></p>
    </article>`;
  }

  function render(snapshot = {}) {
    const body = document.querySelector(`#${PANEL_ID} [data-hh-subscription-health-body]`);
    if (!body) return;
    const sub = snapshot.subscription || {};
    const account = snapshot.account || {};
    const credits = snapshot.credits || {};
    const entitlement = snapshot.creditEntitlement || null;
    const referrals = snapshot.referrals || {};
    const notifications = snapshot.notifications || {};
    const webhook = snapshot.webhook || {};
    const flags = Array.isArray(snapshot.flags) ? snapshot.flags : [];
    body.innerHTML = `
      <div class="hh-health-banner" data-ok="${snapshot.healthy === true ? "true" : "false"}"><strong>${snapshot.healthy === true ? "Subscription state reconciled" : `${flags.length} item${flags.length === 1 ? "" : "s"} need attention`}</strong><span>Checked ${esc(date(snapshot.checkedAt))}</span></div>
      ${flags.length ? `<ul class="hh-health-flags">${flags.map((flag) => `<li>${esc(flag)}</li>`).join("")}</ul>` : '<p class="hh-health-ok">No entitlement, notification, or webhook mismatch detected.</p>'}
      <div class="hh-health-grid">
        <div class="hh-health-stat"><span>Effective tier</span><strong>${esc(title(account.membership_tier || "—"))}</strong></div>
        <div class="hh-health-stat"><span>Access source</span><strong>${esc(title(account.membership_source || "—"))}</strong></div>
        <div class="hh-health-stat"><span>Stripe status</span><strong>${esc(title(sub.status || "Not configured"))}</strong></div>
        <div class="hh-health-stat"><span>Credits remaining</span><strong>${esc(credits.remaining ?? 0)}</strong></div>
        <div class="hh-health-stat"><span>Qualified referrals</span><strong>${esc(referrals.qualified ?? 0)}</strong></div>
        <div class="hh-health-stat"><span>Failed emails</span><strong>${esc(notifications.failed ?? 0)}</strong></div>
      </div>
      <div class="hh-health-meta">
        <div><strong>Paid through</strong><br>${esc(date(sub.current_period_end))}</div>
        <div><strong>Credit Member access through</strong><br>${esc(date(entitlement?.ends_at))}</div>
        <div><strong>Referral lifecycle</strong><br>${esc(referrals.pending ?? 0)} pending · ${esc(referrals.reversed ?? 0)} reversed · ${esc(referrals.expired ?? 0)} expired</div>
        <div><strong>Webhook exceptions</strong><br>${esc(webhook.failed ?? 0)} failed · ${esc(webhook.processing ?? 0)} processing</div>
      </div>`;
    const retry = document.querySelector(`#${PANEL_ID} [data-hh-health-retry]`);
    if (retry) retry.hidden = Number(notifications.failed || 0) < 1;
  }

  function setStatus(value = "", tone = "") {
    const node = document.querySelector(`#${PANEL_ID} [data-hh-health-status]`);
    if (!node) return;
    node.textContent = value;
    node.dataset.tone = tone;
  }

  async function loadHealth() {
    const userId = selectedUserId;
    if (!userId || !canAdminister()) return;
    const sequence = ++requestSequence;
    setStatus("Checking subscription health…");
    try {
      const snapshot = await secureCall("admin_subscription_health", { userId });
      if (sequence !== requestSequence || selectedUserId !== userId) return;
      render(snapshot);
      setStatus(snapshot?.healthy ? "Subscription state is healthy." : "Review the items shown above.", snapshot?.healthy ? "success" : "error");
    } catch (error) {
      if (sequence !== requestSequence) return;
      setStatus(error?.message || "Subscription health could not be loaded.", "error");
    }
  }

  async function retryFailed() {
    const userId = selectedUserId;
    if (!userId) return;
    const button = document.querySelector(`#${PANEL_ID} [data-hh-health-retry]`);
    if (button) button.disabled = true;
    setStatus("Retrying failed transactional emails…");
    try {
      const result = await secureCall("admin_retry_notifications", { userId });
      setStatus(`${Number(result?.sent || 0)} email${Number(result?.sent || 0) === 1 ? "" : "s"} sent; ${Number(result?.remainingFailed || 0)} still failed.`, Number(result?.remainingFailed || 0) ? "error" : "success");
      await loadHealth();
    } catch (error) { setStatus(error?.message || "Failed notifications could not be retried.", "error"); }
    finally { if (button && document.contains(button)) button.disabled = false; }
  }

  function bind(panel) {
    if (!panel || panel.dataset.hhHealthBound === VERSION) return;
    panel.dataset.hhHealthBound = VERSION;
    panel.querySelector("[data-hh-health-refresh]")?.addEventListener("click", loadHealth);
    panel.querySelector("[data-hh-health-retry]")?.addEventListener("click", retryFailed);
    void loadHealth();
  }

  function enhance() {
    if (!selectedUserId || !canAdminister()) return false;
    const detail = document.querySelector("#view-admin .hh-admin-detail");
    if (!detail) return false;
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      addStyles();
      const holder = document.createElement("div");
      holder.innerHTML = baseMarkup();
      panel = holder.firstElementChild;
      const credits = document.getElementById("hh-admin-subscription-credits");
      if (credits?.nextSibling) detail.insertBefore(panel, credits.nextSibling);
      else detail.appendChild(panel);
    }
    bind(panel);
    return true;
  }

  function stopTimer() { if (timer != null) { window.clearInterval(timer); timer = null; } }
  function schedule() {
    stopTimer();
    let attempts = 0;
    timer = window.setInterval(() => { attempts += 1; if (enhance() || attempts >= MAX_ENHANCE_ATTEMPTS) stopTimer(); }, 100);
    setTimeout(() => { if (enhance()) stopTimer(); }, 0);
  }

  function boot() {
    addStyles();
    document.addEventListener("click", (event) => {
      const member = event.target?.closest?.("[data-hh-member-id]");
      if (member?.dataset?.hhMemberId) { selectedUserId = String(member.dataset.hhMemberId); schedule(); return; }
      if (event.target?.closest?.("#hh-admin-back")) { selectedUserId = ""; requestSequence += 1; stopTimer(); }
    }, true);
    document.addEventListener("submit", (event) => {
      if (event.target?.closest?.("#hh-admin-role-form, #hh-admin-membership-form, [data-hh-admin-credit-form]")) setTimeout(schedule, 250);
    }, true);
    document.addEventListener("herdharbor:auth-session", (event) => {
      if (event.detail?.signedIn === false) { selectedUserId = ""; requestSequence += 1; stopTimer(); }
    });
  }

  window.HerdHarborAdminSubscriptionHealth = Object.freeze({ version: VERSION, refresh: loadHealth });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
