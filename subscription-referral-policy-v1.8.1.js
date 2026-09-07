(() => {
  "use strict";

  const VERSION = "1.8.1";
  const SUPABASE_URL = "https://okynebbksifqppwicghj.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_jxsX6uS9nnh2FOFtlSF9TA_8v6C7C09";
  const PUBLIC_REFERRAL_URL = `${SUPABASE_URL}/functions/v1/registration-referral`;
  const CHOICE_KEY = "herdharbor_registration_choice_v181";
  const INTERVAL_KEY = "herdharbor_subscription_interval_v1";
  const MAX_CHOICE_AGE_MS = 24 * 60 * 60 * 1000;

  let signupInstalled = false;
  let lastValidatedCode = "";
  let lastValidationValid = false;
  let referralSnapshot = null;
  let referralRefreshInFlight = null;

  // v1.8.1 public billing is month-to-month. Set this before the Stripe provider
  // initializes so a stale yearly browser preference can never drive checkout.
  try { localStorage.setItem(INTERVAL_KEY, "month"); } catch {}

  const esc = (value = "") => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const normalizeReferral = (value = "") => String(value || "").trim().toUpperCase();

  function addStyles() {
    if (document.getElementById("hh-referral-policy-style")) return;
    const style = document.createElement("style");
    style.id = "hh-referral-policy-style";
    style.textContent = `
      .hh-signup-choice { display:grid; gap:10px; margin:0 0 14px; }
      .hh-signup-choice h3 { margin:0; color:#0D2540; font-size:1rem; }
      .hh-signup-plan-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
      .hh-signup-plan { position:relative; display:grid; gap:4px; min-height:86px; padding:11px; border:1px solid rgba(13,37,64,.18); border-radius:12px; background:rgba(255,255,255,.75); cursor:pointer; }
      .hh-signup-plan:has(input:checked) { border-color:#2E7D7B; box-shadow:0 0 0 2px rgba(46,125,123,.14); }
      .hh-signup-plan input { position:absolute; top:10px; right:10px; width:auto !important; min-height:auto !important; }
      .hh-signup-plan strong { color:#0D2540; padding-right:22px; }
      .hh-signup-plan small { color:#65727E; line-height:1.3; }
      .hh-signup-plan[data-coming-soon="true"] { opacity:.62; cursor:not-allowed; }
      .hh-signup-referral { display:grid; gap:5px; }
      .hh-signup-referral-row { display:flex; gap:8px; align-items:center; }
      .hh-signup-referral-row input { flex:1 1 auto; text-transform:uppercase; }
      .hh-referral-status { min-height:1.2em; margin:0; font-size:.84rem; font-weight:700; }
      .hh-referral-status[data-tone="success"] { color:#24643F; }
      .hh-referral-status[data-tone="error"] { color:#9B1C1C; }
      .hh-referral-status[data-tone="info"] { color:#0D5870; }
      .hh-referral-code-box { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin:10px 0; }
      .hh-referral-code-box code { padding:8px 10px; border-radius:8px; background:rgba(13,37,64,.08); font-size:1rem; font-weight:800; letter-spacing:.04em; }
      .hh-referral-progress-label { font-weight:800; color:#0D2540; }
      @media (max-width:620px) { .hh-signup-plan-grid { grid-template-columns:1fr; } }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function choiceMarkup(context = "signup") {
    const prefix = context === "gate" ? "hh-gate-choice" : "hh-signup-choice";
    return `
      <section class="hh-signup-choice" data-hh-registration-choice="${context}">
        <h3>Choose your HerdHarbor plan</h3>
        <div class="hh-signup-plan-grid" role="radiogroup" aria-label="HerdHarbor plan">
          <label class="hh-signup-plan">
            <input id="${prefix}-junior" type="radio" name="${prefix}-plan" value="junior" data-hh-signup-plan checked>
            <strong>Junior</strong><small>Free · core HerdHarbor access.</small>
          </label>
          <label class="hh-signup-plan">
            <input id="${prefix}-member" type="radio" name="${prefix}-plan" value="member" data-hh-signup-plan>
            <strong>Member</strong><small>$14.99/month · month-to-month subscription.</small>
          </label>
          <label class="hh-signup-plan" data-coming-soon="true" aria-disabled="true">
            <input id="${prefix}-business" type="radio" name="${prefix}-plan" value="business" disabled>
            <strong>Business</strong><small>Coming Soon</small>
          </label>
        </div>
        <label class="hh-signup-referral">Referred by <span class="hh-registration-note">Optional — leave this blank if nobody referred you.</span>
          <div class="hh-signup-referral-row"><input type="text" maxlength="11" autocomplete="off" spellcheck="false" placeholder="HH-1234ABCD" data-hh-referral-input></div>
        </label>
        <p class="hh-referral-status" data-hh-referral-status aria-live="polite"></p>
      </section>`;
  }

  function readChoice() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CHOICE_KEY) || "null");
      if (!parsed?.createdAt || !parsed.choice) return null;
      if (Date.now() - Number(parsed.createdAt) > MAX_CHOICE_AGE_MS) {
        localStorage.removeItem(CHOICE_KEY);
        return null;
      }
      return parsed.choice;
    } catch { return null; }
  }

  function writeChoice(choice) {
    try { localStorage.setItem(CHOICE_KEY, JSON.stringify({ createdAt: Date.now(), choice })); } catch {}
  }

  function clearChoice() {
    try { localStorage.removeItem(CHOICE_KEY); } catch {}
  }

  function formChoice(form) {
    const plan = String(form.querySelector("[data-hh-signup-plan]:checked")?.value || "junior").toLowerCase();
    return {
      requestedPlan: plan === "member" ? "member" : "junior",
      referralCode: normalizeReferral(form.querySelector("[data-hh-referral-input]")?.value || "")
    };
  }

  function fillChoice(form, choice = readChoice()) {
    if (!form || !choice) return;
    const plan = choice.requestedPlan === "member" ? "member" : "junior";
    const radio = form.querySelector(`[data-hh-signup-plan][value="${plan}"]`);
    if (radio) radio.checked = true;
    const referral = form.querySelector("[data-hh-referral-input]");
    if (referral) referral.value = normalizeReferral(choice.referralCode || "");
  }

  function status(form, message = "", tone = "") {
    const target = form?.querySelector?.("[data-hh-referral-status]");
    if (!target) return;
    target.textContent = message;
    target.dataset.tone = tone;
  }

  async function validateReferralPublic(code) {
    const normalized = normalizeReferral(code);
    if (!normalized) return { valid: true, blank: true };
    const response = await fetch(PUBLIC_REFERRAL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY
      },
      body: JSON.stringify({ action: "validate", referralCode: normalized })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Referral validation is temporarily unavailable. Clear the referral field to continue without a referral.");
    return data;
  }

  function bindReferralInput(form) {
    const input = form.querySelector("[data-hh-referral-input]");
    if (!input || input.dataset.hhReferralBound === "1") return;
    input.dataset.hhReferralBound = "1";
    input.addEventListener("input", () => {
      input.value = normalizeReferral(input.value).replace(/[^A-Z0-9-]/g, "").slice(0, 11);
      lastValidatedCode = "";
      lastValidationValid = false;
      status(form, input.value ? "Referral ID will be verified before signup." : "", "info");
    });
    input.addEventListener("blur", async () => {
      const code = normalizeReferral(input.value);
      if (!code) return status(form, "", "");
      status(form, "Checking referral ID…", "info");
      try {
        const result = await validateReferralPublic(code);
        lastValidatedCode = code;
        lastValidationValid = result.valid === true;
        status(form, result.valid ? "Referral ID verified." : "Invalid referral ID. Check it or clear the field to continue.", result.valid ? "success" : "error");
      } catch (error) {
        lastValidatedCode = "";
        lastValidationValid = false;
        status(form, error.message || "Referral ID could not be checked.", "error");
      }
    });
  }

  async function interceptSignup(event) {
    const form = event.currentTarget;
    if (form.dataset.hhReferralResume === "1") {
      delete form.dataset.hhReferralResume;
      writeChoice(formChoice(form));
      return;
    }

    const choice = formChoice(form);
    writeChoice(choice);
    if (!choice.referralCode) return; // Blank referral never delays or blocks signup.
    if (choice.referralCode === lastValidatedCode && lastValidationValid) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    status(form, "Checking referral ID…", "info");
    try {
      const result = await validateReferralPublic(choice.referralCode);
      lastValidatedCode = choice.referralCode;
      lastValidationValid = result.valid === true;
      if (!result.valid) {
        status(form, "Invalid referral ID. Check it or clear the field to continue.", "error");
        window.alert("Invalid referral ID. Check the code or remove it to continue signup.");
        form.querySelector("[data-hh-referral-input]")?.focus?.();
        return;
      }
      status(form, "Referral ID verified.", "success");
      form.dataset.hhReferralResume = "1";
      form.requestSubmit();
    } catch (error) {
      status(form, error.message || "Referral ID could not be checked. Clear the field to continue without a referral.", "error");
    }
  }

  function installSignup() {
    const form = document.getElementById("hh-signup-form");
    if (!form) return false;
    if (!form.querySelector('[data-hh-registration-choice="signup"]')) {
      addStyles();
      const wrapper = document.createElement("div");
      wrapper.innerHTML = choiceMarkup("signup");
      const node = wrapper.firstElementChild;
      const registrationFields = form.querySelector("#hh-registration-fields");
      if (registrationFields?.nextSibling) form.insertBefore(node, registrationFields.nextSibling);
      else form.prepend(node);
      fillChoice(form);
      bindReferralInput(form);
      form.addEventListener("submit", interceptSignup, true);
    }
    signupInstalled = true;
    return true;
  }

  async function completeGateChoice(form) {
    const choice = formChoice(form);
    writeChoice(choice);
    return window.HerdHarborCloud.invokeFunction("registration-referral", {
      action: "complete",
      requestedPlan: choice.requestedPlan,
      referralCode: choice.referralCode || null
    });
  }

  async function interceptGate(event) {
    const form = event.currentTarget;
    if (form.dataset.hhReferralGateResume === "1") {
      delete form.dataset.hhReferralGateResume;
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    status(form, "Saving plan and referral choice…", "info");
    try {
      const result = await completeGateChoice(form);
      if (!result?.complete) throw new Error("The signup choice could not be saved.");
      status(form, result.referredBy ? "Referral ID verified and attached to this account." : "Signup choice saved.", "success");
      referralSnapshot = { ...(referralSnapshot || {}), referral: { ...(referralSnapshot?.referral || {}), code: result.referralCode } };
      form.dataset.hhReferralGateResume = "1";
      if (submit) submit.disabled = false;
      form.requestSubmit();
    } catch (error) {
      const message = error?.message || "The signup choice could not be saved.";
      status(form, message, "error");
      const baseError = form.querySelector("[data-hh-registration-error]");
      if (baseError) baseError.textContent = message;
      if (/invalid referral/i.test(message)) window.alert("Invalid referral ID. Check the code or remove it to continue signup.");
      if (submit) submit.disabled = false;
    }
  }

  function installGate() {
    const form = document.getElementById("hh-registration-gate-form");
    if (!form) return false;
    if (!form.querySelector('[data-hh-registration-choice="gate"]')) {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = choiceMarkup("gate");
      const node = wrapper.firstElementChild;
      const error = form.querySelector("[data-hh-registration-error]");
      form.insertBefore(node, error || null);
      fillChoice(form);
      bindReferralInput(form);
      form.addEventListener("submit", interceptGate, true);
    }
    return true;
  }

  async function refreshReferralSnapshot() {
    if (referralRefreshInFlight) return referralRefreshInFlight;
    if (!window.HerdHarborCloud?.getSession?.()?.user?.id || !window.HerdHarborCloud?.invokeFunction) return null;
    referralRefreshInFlight = window.HerdHarborCloud.invokeFunction("subscription-billing", { action: "snapshot" })
      .then((snapshot) => {
        referralSnapshot = snapshot || null;
        return referralSnapshot;
      })
      .catch(() => null)
      .finally(() => { referralRefreshInFlight = null; });
    return referralRefreshInFlight;
  }

  function enhanceReferralCard() {
    const panel = document.getElementById("hh-subscription-engine-panel");
    if (!panel || panel.hidden) return;
    const cards = [...panel.querySelectorAll(".hh-subscription-plan-card")];
    if (cards[1]) cards[1].hidden = true; // Founder is internal/admin only.
    if (cards[3]) {
      cards[3].dataset.hhComingSoon = "true";
      const choose = cards[3].querySelector("[data-hh-subscription-select]");
      if (choose) {
        choose.disabled = true;
        choose.textContent = "Coming Soon";
        choose.title = "HerdHarbor Business is coming soon.";
      }
    }
    panel.querySelector(".hh-subscription-interval-switcher")?.setAttribute("hidden", "");

    const referralCard = [...panel.querySelectorAll(".hh-subscription-card")]
      .find((card) => card.querySelector(".hh-subscription-kicker")?.textContent?.trim() === "Referral credits");
    if (!referralCard) return;
    const referral = referralSnapshot?.referral || {};
    const qualified = Math.max(0, Number(referral.qualifiedReferrals ?? referral.successfulReferrals ?? 0));
    const pending = Math.max(0, Number(referral.pendingReferrals || 0));
    const progress = qualified % 5;
    const remaining = Math.max(0, Number(referral.freeMonthsRemaining || 0));
    const code = referral.code || "Loading…";
    referralCard.innerHTML = `
      <span class="hh-subscription-kicker">Referral credits</span>
      <h3>${esc(remaining)} free Member month${remaining === 1 ? "" : "s"} available</h3>
      <div class="hh-referral-code-box"><span>Your Referral ID</span><code>${esc(code)}</code>${referral.code ? '<button type="button" class="button button-ghost" data-hh-copy-referral>Copy</button>' : ""}</div>
      <p><strong>${esc(qualified)}</strong> qualified referral${qualified === 1 ? "" : "s"}${pending ? ` · ${esc(pending)} awaiting qualification` : ""}.</p>
      <div class="hh-subscription-progress" role="progressbar" aria-valuemin="0" aria-valuemax="5" aria-valuenow="${progress}"><span style="width:${Math.min(100,(progress/5)*100)}%"></span></div>
      <p class="hh-referral-progress-label">${progress} of 5 qualified referrals toward your next free month.</p>
      <p class="hh-subscription-note">Every 5 qualified referrals = 1 Member subscription month credit. A referral qualifies only after the referred Member completes the first successful paid monthly renewal.</p>`;
    referralCard.querySelector("[data-hh-copy-referral]")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(String(referral.code));
        window.HerdHarborSubscriptionEngine?.showToast?.("Referral ID copied.", "success");
      } catch {
        window.prompt("Copy your HerdHarbor Referral ID:", String(referral.code));
      }
    });
  }

  async function enhanceSubscriptionPanel() {
    enhanceReferralCard();
    await refreshReferralSnapshot();
    enhanceReferralCard();
  }

  function boot() {
    addStyles();
    installSignup();
    installGate();
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      installSignup();
      installGate();
      if (attempts >= 120) window.clearInterval(timer);
    }, 250);

    document.addEventListener("click", (event) => {
      if (event.target?.closest?.("#hh-signup-tab")) setTimeout(installSignup, 0);
      if (event.target?.closest?.("[data-hh-subscription-engine-tab]")) setTimeout(() => void enhanceSubscriptionPanel(), 0);
    }, true);
    document.addEventListener("herdharbor:auth-session", (event) => {
      if (event.detail?.signedIn === false) {
        referralSnapshot = null;
        clearChoice();
      } else {
        setTimeout(installGate, 0);
      }
    });
    document.addEventListener("herdharbor:registration-profile", (event) => {
      if (event.detail?.complete === true) clearChoice();
    });
    document.addEventListener("herdharbor:subscription-engine-state", () => setTimeout(enhanceReferralCard, 0));
  }

  window.HerdHarborReferralPolicy = Object.freeze({
    version: VERSION,
    validateReferral: validateReferralPublic,
    refresh: refreshReferralSnapshot,
    getSnapshot: () => referralSnapshot ? JSON.parse(JSON.stringify(referralSnapshot)) : null
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
