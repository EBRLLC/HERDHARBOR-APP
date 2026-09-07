(() => {
  "use strict";

  const VERSION = "1.8.1";
  const SUPABASE_URL = "https://okynebbksifqppwicghj.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_jxsX6uS9nnh2FOFtlSF9TA_8v6C7C09";
  const VALIDATE_URL = `${SUPABASE_URL}/functions/v1/registration-referral`;
  const CHOICE_KEY = "herdharbor_registration_choice_v181";
  const CHOICE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
  const INTERVAL_KEY = "herdharbor_subscription_interval_v1";
  let lastCode = "";
  let lastCodeValid = false;
  let snapshot = null;
  let snapshotInFlight = null;

  try { localStorage.setItem(INTERVAL_KEY, "month"); } catch {}

  const esc = (value = "") => String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const referral = (value = "") => String(value || "").trim().toUpperCase();

  function styles() {
    if (document.getElementById("hh-referral-policy-style")) return;
    const style = document.createElement("style");
    style.id = "hh-referral-policy-style";
    style.textContent = `
      .hh-signup-choice{display:grid;gap:10px;margin:0 0 14px}.hh-signup-choice h3{margin:0;color:#0D2540;font-size:1rem}
      .hh-signup-plan-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.hh-signup-plan{position:relative;display:grid;gap:4px;min-height:86px;padding:11px;border:1px solid rgba(13,37,64,.18);border-radius:12px;background:rgba(255,255,255,.75);cursor:pointer}
      .hh-signup-plan input{position:absolute;top:10px;right:10px;width:auto!important;min-height:auto!important}.hh-signup-plan strong{color:#0D2540;padding-right:22px}.hh-signup-plan small{color:#65727E;line-height:1.3}.hh-signup-plan[data-coming-soon=true]{opacity:.62;cursor:not-allowed}
      .hh-signup-referral{display:grid;gap:5px}.hh-signup-referral input{text-transform:uppercase}.hh-referral-status{min-height:1.2em;margin:0;font-size:.84rem;font-weight:700}.hh-referral-status[data-tone=success]{color:#24643F}.hh-referral-status[data-tone=error]{color:#9B1C1C}.hh-referral-status[data-tone=info]{color:#0D5870}
      .hh-referral-code-box{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0}.hh-referral-code-box code{padding:8px 10px;border-radius:8px;background:rgba(13,37,64,.08);font-size:1rem;font-weight:800;letter-spacing:.04em}.hh-referral-progress-label{font-weight:800;color:#0D2540}
      @media(max-width:620px){.hh-signup-plan-grid{grid-template-columns:1fr}}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function markup(context) {
    const name = context === "gate" ? "hh-gate-plan" : "hh-signup-plan";
    return `
      <section class="hh-signup-choice" data-hh-registration-choice="${context}">
        <h3>Choose your HerdHarbor plan</h3>
        <div class="hh-signup-plan-grid" role="radiogroup" aria-label="HerdHarbor plan">
          <label class="hh-signup-plan"><input type="radio" name="${name}" value="junior" data-hh-signup-plan checked><strong>Junior</strong><small>Free · core HerdHarbor access.</small></label>
          <label class="hh-signup-plan"><input type="radio" name="${name}" value="member" data-hh-signup-plan><strong>Member</strong><small>$14.99/month · month-to-month subscription.</small></label>
          <label class="hh-signup-plan" data-coming-soon="true" aria-disabled="true"><input type="radio" name="${name}" value="business" disabled><strong>Business</strong><small>Coming Soon</small></label>
        </div>
        <label class="hh-signup-referral">Referred by <span class="hh-registration-note">Optional — leave this blank if nobody referred you.</span>
          <input type="text" maxlength="11" autocomplete="off" spellcheck="false" placeholder="HH-1234ABCD" data-hh-referral-input>
        </label>
        <p class="hh-referral-status" data-hh-referral-status aria-live="polite"></p>
      </section>`;
  }

  function readChoice() {
    try {
      const value = JSON.parse(localStorage.getItem(CHOICE_KEY) || "null");
      if (!value?.createdAt || !value.choice) return null;
      if (Date.now() - Number(value.createdAt) > CHOICE_MAX_AGE_MS) {
        localStorage.removeItem(CHOICE_KEY);
        return null;
      }
      return value.choice;
    } catch { return null; }
  }

  function saveChoice(choice) {
    try { localStorage.setItem(CHOICE_KEY, JSON.stringify({ createdAt: Date.now(), choice })); } catch {}
  }
  function clearChoice() { try { localStorage.removeItem(CHOICE_KEY); } catch {} }

  function formChoice(form) {
    return {
      requestedPlan: form.querySelector("[data-hh-signup-plan]:checked")?.value === "member" ? "member" : "junior",
      referralCode: referral(form.querySelector("[data-hh-referral-input]")?.value || "")
    };
  }

  function fillChoice(form, supplied = null) {
    const choice = supplied || readChoice();
    if (!choice) return false;
    const plan = choice.requestedPlan === "member" ? "member" : "junior";
    const radio = form.querySelector(`[data-hh-signup-plan][value="${plan}"]`);
    if (radio) radio.checked = true;
    const input = form.querySelector("[data-hh-referral-input]");
    if (input) input.value = referral(choice.referralCode || "");
    return true;
  }

  function message(form, text = "", tone = "") {
    const node = form.querySelector("[data-hh-referral-status]");
    if (!node) return;
    node.textContent = text;
    node.dataset.tone = tone;
  }

  async function publicCall(payload, { keepalive = false } = {}) {
    const response = await fetch(VALIDATE_URL, {
      method: "POST",
      keepalive,
      headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY },
      body: JSON.stringify(payload)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Registration service is temporarily unavailable.");
    return body;
  }

  async function validate(code) {
    const normalized = referral(code);
    if (!normalized) return { valid: true, blank: true };
    return publicCall({ action: "validate", referralCode: normalized });
  }

  async function stageChoice(choice, email, { keepalive = false } = {}) {
    const normalizedEmail = String(email || "").trim();
    if (!normalizedEmail) return null;
    return publicCall({
      action: "stage",
      email: normalizedEmail,
      requestedPlan: choice.requestedPlan,
      referralCode: choice.referralCode || null
    }, { keepalive });
  }

  function bindInput(form) {
    const input = form.querySelector("[data-hh-referral-input]");
    if (!input || input.dataset.hhReferralBound === "1") return;
    input.dataset.hhReferralBound = "1";
    input.addEventListener("input", () => {
      input.value = referral(input.value).replace(/[^A-Z0-9-]/g, "").slice(0, 11);
      lastCode = "";
      lastCodeValid = false;
      message(form, input.value ? "Referral ID will be verified before signup." : "", "info");
    });
    input.addEventListener("blur", async () => {
      const code = referral(input.value);
      if (!code) return message(form);
      message(form, "Checking referral ID…", "info");
      try {
        const result = await validate(code);
        lastCode = code;
        lastCodeValid = result.valid === true;
        message(form, result.valid ? "Referral ID verified." : "Invalid referral ID. Check it or clear the field to continue.", result.valid ? "success" : "error");
      } catch (error) {
        lastCode = "";
        lastCodeValid = false;
        message(form, error?.message || "Referral ID could not be checked.", "error");
      }
    });
  }

  async function signupSubmit(event) {
    const form = event.currentTarget;
    const choice = formChoice(form);
    const email = form.querySelector("#hh-signup-email")?.value || "";
    saveChoice(choice);
    if (form.dataset.hhReferralResume === "1") {
      delete form.dataset.hhReferralResume;
      return;
    }

    // A blank referral must never delay signup. Stage the plan opportunistically
    // with keepalive so a cross-device email confirmation can still restore it.
    if (!choice.referralCode) {
      void stageChoice(choice, email, { keepalive: true }).catch(() => null);
      return;
    }
    if (choice.referralCode === lastCode && lastCodeValid) {
      event.preventDefault();
      event.stopImmediatePropagation();
      message(form, "Saving referral choice…", "info");
      try {
        await stageChoice(choice, email);
        form.dataset.hhReferralResume = "1";
        form.requestSubmit();
      } catch (error) {
        message(form, error?.message || "Referral choice could not be saved. Clear the field to continue without a referral.", "error");
      }
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    message(form, "Checking referral ID…", "info");
    try {
      const result = await validate(choice.referralCode);
      lastCode = choice.referralCode;
      lastCodeValid = result.valid === true;
      if (!result.valid) {
        message(form, "Invalid referral ID. Check it or clear the field to continue.", "error");
        window.alert("Invalid referral ID. Check the code or remove it to continue signup.");
        form.querySelector("[data-hh-referral-input]")?.focus?.();
        return;
      }
      await stageChoice(choice, email);
      message(form, "Referral ID verified and saved for email confirmation.", "success");
      form.dataset.hhReferralResume = "1";
      form.requestSubmit();
    } catch (error) {
      message(form, error?.message || "Referral ID could not be checked. Clear the field to continue without a referral.", "error");
    }
  }

  function installSignup() {
    const form = document.getElementById("hh-signup-form");
    if (!form || form.querySelector('[data-hh-registration-choice="signup"]')) return Boolean(form);
    const holder = document.createElement("div");
    holder.innerHTML = markup("signup");
    const registration = form.querySelector("#hh-registration-fields");
    if (registration?.nextSibling) form.insertBefore(holder.firstElementChild, registration.nextSibling);
    else form.prepend(holder.firstElementChild);
    fillChoice(form);
    bindInput(form);
    form.addEventListener("submit", signupSubmit, true);
    return true;
  }

  async function hydrateRemoteChoice(form) {
    if (!form || readChoice() || !window.HerdHarborCloud?.invokeFunction) return;
    try {
      const status = await window.HerdHarborCloud.invokeFunction("registration-referral", { action: "status" });
      if (status?.complete || !status?.stagedChoice) return;
      fillChoice(form, status.stagedChoice);
      saveChoice(status.stagedChoice);
      if (status.stagedChoice.referralCode) message(form, "Referral ID restored from your signup and will be attached when you continue.", "success");
    } catch {}
  }

  async function gateSubmit(event) {
    const form = event.currentTarget;
    if (form.dataset.hhReferralGateResume === "1") {
      delete form.dataset.hhReferralGateResume;
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const choice = formChoice(form);
    saveChoice(choice);
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    message(form, "Saving plan and referral choice…", "info");
    try {
      const result = await window.HerdHarborCloud.invokeFunction("registration-referral", {
        action: "complete",
        requestedPlan: choice.requestedPlan,
        referralCode: choice.referralCode || null
      });
      if (!result?.complete) throw new Error("The signup choice could not be saved.");
      message(form, result.referredBy ? "Referral ID verified and attached to this account." : "Signup choice saved.", "success");
      form.dataset.hhReferralGateResume = "1";
      if (submit) submit.disabled = false;
      form.requestSubmit();
    } catch (error) {
      const text = error?.message || "The signup choice could not be saved.";
      message(form, text, "error");
      const baseError = form.querySelector("[data-hh-registration-error]");
      if (baseError) baseError.textContent = text;
      if (/invalid referral/i.test(text)) window.alert("Invalid referral ID. Check the code or remove it to continue signup.");
      if (submit) submit.disabled = false;
    }
  }

  function installGate() {
    const form = document.getElementById("hh-registration-gate-form");
    if (!form || form.querySelector('[data-hh-registration-choice="gate"]')) return Boolean(form);
    const holder = document.createElement("div");
    holder.innerHTML = markup("gate");
    form.insertBefore(holder.firstElementChild, form.querySelector("[data-hh-registration-error]") || null);
    fillChoice(form);
    bindInput(form);
    form.addEventListener("submit", gateSubmit, true);
    void hydrateRemoteChoice(form);
    return true;
  }

  async function refreshSnapshot() {
    if (snapshotInFlight) return snapshotInFlight;
    if (!window.HerdHarborCloud?.getSession?.()?.user?.id || !window.HerdHarborCloud?.invokeFunction) return null;
    snapshotInFlight = window.HerdHarborCloud.invokeFunction("subscription-billing", { action: "snapshot" })
      .then((value) => (snapshot = value || null)).catch(() => null)
      .finally(() => { snapshotInFlight = null; });
    return snapshotInFlight;
  }

  function enhancePanel() {
    const panel = document.getElementById("hh-subscription-engine-panel");
    if (!panel || panel.hidden) return;
    const plans = [...panel.querySelectorAll(".hh-subscription-plan-card")];
    if (plans[1]) plans[1].hidden = true;
    if (plans[3]) {
      const button = plans[3].querySelector("[data-hh-subscription-select]");
      if (button) { button.disabled = true; button.textContent = "Coming Soon"; button.title = "HerdHarbor Business is coming soon."; }
    }
    panel.querySelector(".hh-subscription-interval-switcher")?.setAttribute("hidden", "");

    const card = [...panel.querySelectorAll(".hh-subscription-card")]
      .find((node) => node.querySelector(".hh-subscription-kicker")?.textContent?.trim() === "Referral credits");
    if (!card) return;
    const data = snapshot?.referral || {};
    const qualified = Math.max(0, Number(data.qualifiedReferrals ?? data.successfulReferrals ?? 0));
    const pending = Math.max(0, Number(data.pendingReferrals || 0));
    const progress = qualified % 5;
    const remaining = Math.max(0, Number(data.freeMonthsRemaining || 0));
    const creditEnd = snapshot?.creditEntitlement?.endsAt;
    card.innerHTML = `
      <span class="hh-subscription-kicker">Referral credits</span><h3>${remaining} free Member month${remaining === 1 ? "" : "s"} available</h3>
      <div class="hh-referral-code-box"><span>Your Referral ID</span><code>${esc(data.code || "Loading…")}</code>${data.code ? '<button type="button" class="button button-ghost" data-hh-copy-referral>Copy</button>' : ""}</div>
      ${creditEnd ? `<p><strong>Member credit active through ${esc(new Date(creditEnd).toLocaleDateString())}.</strong></p>` : ""}
      <p><strong>${qualified}</strong> qualified referral${qualified === 1 ? "" : "s"}${pending ? ` · ${pending} awaiting qualification` : ""}.</p>
      <div class="hh-subscription-progress" role="progressbar" aria-valuemin="0" aria-valuemax="5" aria-valuenow="${progress}"><span style="width:${Math.min(100, progress * 20)}%"></span></div>
      <p class="hh-referral-progress-label">${progress} of 5 qualified referrals toward your next free month.</p>
      <p class="hh-subscription-note">Every 5 qualified referrals = 1 Member subscription month credit. A referral qualifies after the referred Member completes the first successful monthly renewal.</p>`;
    card.querySelector("[data-hh-copy-referral]")?.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(String(data.code)); }
      catch { window.prompt("Copy your HerdHarbor Referral ID:", String(data.code)); }
    });
  }

  async function refreshPanel() { enhancePanel(); await refreshSnapshot(); enhancePanel(); }

  function boot() {
    styles();
    installSignup();
    installGate();
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1; installSignup(); installGate();
      if (attempts >= 120) window.clearInterval(timer);
    }, 250);
    document.addEventListener("click", (event) => {
      if (event.target?.closest?.("#hh-signup-tab")) setTimeout(installSignup, 0);
      if (event.target?.closest?.("[data-hh-subscription-engine-tab]")) setTimeout(() => void refreshPanel(), 0);
    }, true);
    document.addEventListener("herdharbor:auth-session", (event) => {
      if (event.detail?.signedIn === false) {
        snapshot = null;
      } else setTimeout(installGate, 0);
    });
    document.addEventListener("herdharbor:registration-profile", (event) => {
      if (event.detail?.complete === true) clearChoice();
    });
    document.addEventListener("herdharbor:subscription-engine-state", () => setTimeout(enhancePanel, 0));
  }

  window.HerdHarborReferralPolicy = Object.freeze({
    version: VERSION,
    validateReferral: validate,
    stageChoice,
    refresh: refreshSnapshot,
    getSnapshot: () => snapshot ? JSON.parse(JSON.stringify(snapshot)) : null
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
})();
