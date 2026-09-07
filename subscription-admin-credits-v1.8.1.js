(() => {
  "use strict";

  const VERSION = "1.8.1";
  const PANEL_ID = "hh-admin-subscription-credits";
  const MAX_ENHANCE_ATTEMPTS = 40;
  let selectedUserId = "";
  let enhanceTimer = null;
  let requestSequence = 0;

  const esc = (value = "") => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  function canAdminister() {
    return window.HerdHarborMembership?.canAccessAdmin?.() === true;
  }

  function addStyles() {
    if (document.getElementById("hh-admin-credit-style")) return;
    const style = document.createElement("style");
    style.id = "hh-admin-credit-style";
    style.textContent = `
      #${PANEL_ID} .hh-admin-credit-stats {
        display:grid;
        grid-template-columns:repeat(3,minmax(0,1fr));
        gap:10px;
        margin:12px 0 16px;
      }
      #${PANEL_ID} .hh-admin-credit-stat {
        padding:12px;
        border:1px solid rgba(13,37,64,.12);
        border-radius:10px;
        background:rgba(13,37,64,.04);
      }
      #${PANEL_ID} .hh-admin-credit-stat span,
      #${PANEL_ID} .hh-admin-credit-stat strong { display:block; }
      #${PANEL_ID} .hh-admin-credit-stat span { font-size:.8rem; color:var(--muted,#65727E); }
      #${PANEL_ID} .hh-admin-credit-stat strong { margin-top:4px; font-size:1.25rem; color:var(--navy,#0D2540); }
      #${PANEL_ID} form { display:grid; gap:10px; }
      #${PANEL_ID} .hh-admin-credit-row { display:grid; grid-template-columns:minmax(110px,160px) 1fr; gap:10px; }
      #${PANEL_ID} .hh-admin-credit-note { margin:8px 0 0; color:var(--muted,#65727E); font-size:.88rem; line-height:1.45; }
      #${PANEL_ID} .hh-admin-credit-status { min-height:1.3em; margin:8px 0 0; font-weight:700; }
      #${PANEL_ID} .hh-admin-credit-status[data-tone="success"] { color:#24643F; }
      #${PANEL_ID} .hh-admin-credit-status[data-tone="error"] { color:#9B1C1C; }
      @media (max-width:620px) {
        #${PANEL_ID} .hh-admin-credit-stats,
        #${PANEL_ID} .hh-admin-credit-row { grid-template-columns:1fr; }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function setStatus(message = "", tone = "") {
    const node = document.querySelector(`#${PANEL_ID} [data-hh-admin-credit-status]`);
    if (!node) return;
    node.textContent = message;
    node.dataset.tone = tone;
  }

  function statMarkup(snapshot = {}) {
    return `
      <div class="hh-admin-credit-stat"><span>Available</span><strong>${esc(snapshot.available ?? 0)}</strong></div>
      <div class="hh-admin-credit-stat"><span>Reserved</span><strong>${esc(snapshot.reserved ?? 0)}</strong></div>
      <div class="hh-admin-credit-stat"><span>Used</span><strong>${esc(snapshot.applied ?? 0)}</strong></div>`;
  }

  function panelMarkup() {
    return `
      <article class="hh-admin-detail-card" id="${PANEL_ID}">
        <h2>Subscription credits</h2>
        <p>Add complimentary Member months without changing the member's permanent tier. One credit equals one Member subscription month.</p>
        <div class="hh-admin-credit-stats" data-hh-admin-credit-stats>${statMarkup()}</div>
        <form data-hh-admin-credit-form>
          <div class="hh-admin-credit-row">
            <label>Member months
              <input type="number" min="1" max="60" step="1" value="1" required data-hh-admin-credit-months>
            </label>
            <label>Reason
              <input type="text" maxlength="500" placeholder="Referral adjustment, promotion, customer service credit…" required data-hh-admin-credit-reason>
            </label>
          </div>
          <div class="action-row">
            <button class="button button-primary" type="submit">Add Member month credit</button>
            <button class="button button-ghost" type="button" data-hh-admin-credit-refresh>Refresh balance</button>
          </div>
        </form>
        <p class="hh-admin-credit-note">Credits are auditable and stack. When a credit is reserved for a Stripe renewal, HerdHarbor can safely announce that renewal as $0.00. Founder access is not granted through subscription credits.</p>
        <p class="hh-admin-credit-status" data-hh-admin-credit-status role="status" aria-live="polite"></p>
      </article>`;
  }

  async function secureCall(action, payload = {}) {
    if (!window.HerdHarborCloud?.invokeFunction) throw new Error("The secure subscription service is still starting.");
    return window.HerdHarborCloud.invokeFunction("subscription-billing", { action, ...payload });
  }

  async function loadBalance() {
    const userId = selectedUserId;
    const panel = document.getElementById(PANEL_ID);
    if (!userId || !panel || !canAdminister()) return;
    const sequence = ++requestSequence;
    setStatus("Loading subscription credits…");
    try {
      const snapshot = await secureCall("admin_credit_snapshot", { userId });
      if (sequence !== requestSequence || selectedUserId !== userId) return;
      const stats = panel.querySelector("[data-hh-admin-credit-stats]");
      if (stats) stats.innerHTML = statMarkup(snapshot || {});
      setStatus(`${Number(snapshot?.remaining || 0)} Member month credit${Number(snapshot?.remaining || 0) === 1 ? "" : "s"} currently remaining.`, "success");
    } catch (error) {
      if (sequence !== requestSequence) return;
      setStatus(error?.message || "Subscription credits could not be loaded.", "error");
    }
  }

  async function grantCredits(event) {
    event.preventDefault();
    const userId = selectedUserId;
    const form = event.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    const months = Math.trunc(Number(form.querySelector("[data-hh-admin-credit-months]")?.value || 0));
    const reason = String(form.querySelector("[data-hh-admin-credit-reason]")?.value || "").trim();
    if (!userId) return setStatus("Choose a member account first.", "error");
    if (months < 1 || months > 60) return setStatus("Add between 1 and 60 Member months at a time.", "error");
    if (reason.length < 3) return setStatus("Enter a short reason for the credit.", "error");

    if (!window.confirm(`Add ${months} Member month credit${months === 1 ? "" : "s"} to this account? This action is recorded in the admin audit log.`)) return;
    if (submit) submit.disabled = true;
    setStatus("Adding Member month credit…");
    try {
      const result = await secureCall("admin_credit", { userId, months, reason });
      if (selectedUserId !== userId) return;
      const stats = document.querySelector(`#${PANEL_ID} [data-hh-admin-credit-stats]`);
      if (stats) stats.innerHTML = statMarkup(result || {});
      const reasonInput = document.querySelector(`#${PANEL_ID} [data-hh-admin-credit-reason]`);
      if (reasonInput) reasonInput.value = "";
      setStatus(`${months} Member month credit${months === 1 ? " was" : "s were"} added. The change is recorded in the admin audit log.`, "success");
    } catch (error) {
      setStatus(error?.message || "The subscription credit could not be added.", "error");
    } finally {
      if (submit && document.contains(submit)) submit.disabled = false;
    }
  }

  function bindPanel(panel) {
    if (!panel || panel.dataset.hhAdminCreditBound === VERSION) return;
    panel.dataset.hhAdminCreditBound = VERSION;
    panel.querySelector("[data-hh-admin-credit-form]")?.addEventListener("submit", grantCredits);
    panel.querySelector("[data-hh-admin-credit-refresh]")?.addEventListener("click", loadBalance);
    void loadBalance();
  }

  function enhance() {
    if (!selectedUserId || !canAdminister()) return false;
    const detail = document.querySelector("#view-admin .hh-admin-detail");
    if (!detail) return false;
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      addStyles();
      const holder = document.createElement("div");
      holder.innerHTML = panelMarkup();
      panel = holder.firstElementChild;
      const history = [...detail.querySelectorAll(".hh-admin-detail-card")]
        .find((card) => card.querySelector("h2")?.textContent?.trim() === "Administrative history");
      detail.insertBefore(panel, history || null);
    }
    bindPanel(panel);
    return true;
  }

  function stopEnhanceTimer() {
    if (enhanceTimer != null) {
      window.clearInterval(enhanceTimer);
      enhanceTimer = null;
    }
  }

  function scheduleEnhance() {
    stopEnhanceTimer();
    let attempts = 0;
    enhanceTimer = window.setInterval(() => {
      attempts += 1;
      if (enhance() || attempts >= MAX_ENHANCE_ATTEMPTS) stopEnhanceTimer();
    }, 100);
    setTimeout(() => { if (enhance()) stopEnhanceTimer(); }, 0);
  }

  function boot() {
    addStyles();
    document.addEventListener("click", (event) => {
      const member = event.target?.closest?.("[data-hh-member-id]");
      if (member?.dataset?.hhMemberId) {
        selectedUserId = String(member.dataset.hhMemberId);
        scheduleEnhance();
        return;
      }
      if (event.target?.closest?.("#hh-admin-back")) {
        selectedUserId = "";
        requestSequence += 1;
        stopEnhanceTimer();
      }
    }, true);

    // Built-in admin changes re-render the detail view. Re-attach the credit
    // card after those explicit actions without observing the whole document.
    document.addEventListener("submit", (event) => {
      if (event.target?.closest?.("#hh-admin-role-form, #hh-admin-membership-form")) {
        setTimeout(scheduleEnhance, 250);
      }
    }, true);
    document.addEventListener("herdharbor:auth-session", (event) => {
      if (event.detail?.signedIn === false) {
        selectedUserId = "";
        requestSequence += 1;
        stopEnhanceTimer();
      }
    });
  }

  window.HerdHarborAdminSubscriptionCredits = Object.freeze({
    version: VERSION,
    refresh: loadBalance
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
