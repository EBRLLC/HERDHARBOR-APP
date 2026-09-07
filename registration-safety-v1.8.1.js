(() => {
  "use strict";

  const VERSION = "1.8.1";
  const MINIMUM_AGE = 18;
  const PENDING_KEY = "herdharbor_pending_registration_v181";
  const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;
  const MAX_BOOT_ATTEMPTS = 80;
  const BOOT_INTERVAL_MS = 250;
  let bootTimer = null;
  let statusInFlight = false;
  let lastCheckedUserId = "";

  function addStyles() {
    if (document.getElementById("hh-registration-safety-style")) return;
    const style = document.createElement("style");
    style.id = "hh-registration-safety-style";
    style.textContent = `
      #hh-registration-fields {
        display: grid;
        gap: 12px;
        margin-bottom: 14px;
      }
      #hh-registration-fields .hh-registration-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      #hh-registration-fields .hh-registration-note {
        margin: 0;
        padding: 10px 12px;
        border: 1px solid rgba(13, 37, 64, .18);
        border-radius: 10px;
        background: rgba(13, 37, 64, .055);
        font-size: .88rem;
        line-height: 1.4;
      }
      #hh-registration-fields .hh-registration-note strong { color: #0D2540; }
      #hh-registration-fields .hh-registration-warning {
        display: none;
        margin: 0;
        padding: 10px 12px;
        border-radius: 10px;
        color: #7A1E1E;
        background: #FFF1F1;
        border: 1px solid #E7B2B2;
        font-size: .88rem;
        line-height: 1.4;
      }
      #hh-registration-fields .hh-registration-warning[data-visible="true"] { display: block; }
      #hh-registration-fields .hh-registration-check {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        font-size: .88rem;
        line-height: 1.35;
      }
      #hh-registration-fields .hh-registration-check input { margin-top: 3px; flex: 0 0 auto; }
      #hh-registration-fields .hh-registration-honeypot {
        position: absolute !important;
        left: -10000px !important;
        width: 1px !important;
        height: 1px !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      #hh-registration-gate {
        position: fixed;
        inset: 0;
        z-index: 100050;
        display: none;
        place-items: center;
        overflow: auto;
        padding: 20px;
        background: rgba(8, 18, 31, .72);
        backdrop-filter: blur(3px);
      }
      #hh-registration-gate[data-visible="true"] { display: grid; }
      #hh-registration-gate .hh-registration-card {
        width: min(680px, 100%);
        max-height: calc(100vh - 40px);
        overflow: auto;
        border-radius: 18px;
        padding: 22px;
        background: var(--surface, #fff);
        color: var(--text, #18212A);
        box-shadow: 0 22px 60px rgba(0,0,0,.28);
      }
      #hh-registration-gate h2 { margin: 0 0 8px; }
      #hh-registration-gate p { line-height: 1.45; }
      #hh-registration-gate form { display: grid; gap: 12px; }
      #hh-registration-gate .hh-registration-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      #hh-registration-gate label { display: grid; gap: 5px; font-weight: 650; }
      #hh-registration-gate input,
      #hh-registration-gate select {
        width: 100%;
        box-sizing: border-box;
      }
      #hh-registration-gate .hh-registration-check {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        font-weight: 500;
      }
      #hh-registration-gate .hh-registration-check input { width: auto; margin-top: 3px; }
      #hh-registration-gate .hh-registration-error {
        min-height: 1.3em;
        color: #9B1C1C;
        font-weight: 700;
      }
      #hh-registration-gate .hh-registration-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }
      @media (max-width: 620px) {
        #hh-registration-fields .hh-registration-grid,
        #hh-registration-gate .hh-registration-grid { grid-template-columns: 1fr; }
        #hh-registration-gate { padding: 10px; }
        #hh-registration-gate .hh-registration-card { max-height: calc(100vh - 20px); padding: 18px; }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function ageFromDate(value, now = new Date()) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    let age = now.getUTCFullYear() - year;
    const currentMonth = now.getUTCMonth() + 1;
    const currentDay = now.getUTCDate();
    if (currentMonth < month || (currentMonth === month && currentDay < day)) age -= 1;
    return age;
  }

  function countryCodeFrom(form) {
    const selected = String(form.querySelector("[data-hh-reg-country]")?.value || "US").toUpperCase();
    if (selected !== "OTHER") return selected;
    return String(form.querySelector("[data-hh-reg-country-other]")?.value || "").trim().toUpperCase();
  }

  function formProfile(form) {
    return {
      firstName: String(form.querySelector("[data-hh-reg-first]")?.value || "").trim(),
      lastName: String(form.querySelector("[data-hh-reg-last]")?.value || "").trim(),
      dateOfBirth: String(form.querySelector("[data-hh-reg-dob]")?.value || ""),
      phone: String(form.querySelector("[data-hh-reg-phone]")?.value || "").trim(),
      countryCode: countryCodeFrom(form),
      region: String(form.querySelector("[data-hh-reg-region]")?.value || "").trim(),
      postalCode: String(form.querySelector("[data-hh-reg-postal]")?.value || "").trim(),
      organizationName: String(form.querySelector("[data-hh-reg-organization]")?.value || "").trim(),
      usageType: String(form.querySelector("[data-hh-reg-usage]")?.value || "adult_self"),
      guardianAttestation: form.querySelector("[data-hh-reg-guardian]")?.checked === true,
      adultAccountHolderCertified: form.querySelector("[data-hh-reg-adult]")?.checked === true,
      accuracyCertified: form.querySelector("[data-hh-reg-accuracy]")?.checked === true,
      website: String(form.querySelector("[data-hh-reg-website]")?.value || "").trim()
    };
  }

  function registrationMarkup({ gate = false } = {}) {
    const prefix = gate ? "hh-gate" : "hh-signup";
    return `
      <div class="hh-registration-note">
        <strong>Adult account holder required.</strong> HerdHarbor accounts must be created and managed by someone age 18 or older. If you are under 18, ask your parent or legal guardian to create the account using their own name, birth date, email, and phone number.
      </div>
      <div class="hh-registration-grid">
        <label>Legal first name<input id="${prefix}-first" data-hh-reg-first autocomplete="given-name" maxlength="80" required></label>
        <label>Legal last name<input id="${prefix}-last" data-hh-reg-last autocomplete="family-name" maxlength="80" required></label>
      </div>
      <div class="hh-registration-grid">
        <label>Date of birth<input id="${prefix}-dob" data-hh-reg-dob type="date" autocomplete="bday" required></label>
        <label>Phone number<input id="${prefix}-phone" data-hh-reg-phone type="tel" autocomplete="tel" maxlength="40" required></label>
      </div>
      <div class="hh-registration-grid">
        <label>Country
          <select id="${prefix}-country" data-hh-reg-country required>
            <option value="US">United States</option>
            <option value="CA">Canada</option>
            <option value="MX">Mexico</option>
            <option value="GB">United Kingdom</option>
            <option value="AU">Australia</option>
            <option value="NZ">New Zealand</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label data-hh-reg-country-other-wrap hidden>2-letter country code<input id="${prefix}-country-other" data-hh-reg-country-other maxlength="2" pattern="[A-Za-z]{2}"></label>
      </div>
      <div class="hh-registration-grid">
        <label>State / province / region<input id="${prefix}-region" data-hh-reg-region autocomplete="address-level1" maxlength="80" required></label>
        <label>ZIP / postal code<input id="${prefix}-postal" data-hh-reg-postal autocomplete="postal-code" maxlength="16" required></label>
      </div>
      <label>Farm, rabbitry, club, or business name <span style="font-weight:400">(optional)</span><input id="${prefix}-organization" data-hh-reg-organization autocomplete="organization" maxlength="120"></label>
      <label>Who will primarily use this account?
        <select id="${prefix}-usage" data-hh-reg-usage required>
          <option value="adult_self">Me / my household</option>
          <option value="farm_business">My farm or business</option>
          <option value="guardian_for_minor">A child or teen I supervise</option>
        </select>
      </label>
      <label class="hh-registration-check" data-hh-reg-guardian-wrap hidden>
        <input type="checkbox" data-hh-reg-guardian>
        <span>I am the parent or legal guardian responsible for the minor's HerdHarbor use, or I am the adult account holder acting with the parent/legal guardian's approval.</span>
      </label>
      <label class="hh-registration-check">
        <input type="checkbox" data-hh-reg-adult required>
        <span>I certify that I am at least 18 years old and I am the adult responsible for this HerdHarbor account.</span>
      </label>
      <label class="hh-registration-check">
        <input type="checkbox" data-hh-reg-accuracy required>
        <span>I certify that the registration information I provided is accurate and I agree to HerdHarbor's account and privacy rules.</span>
      </label>
      <label class="hh-registration-honeypot" aria-hidden="true">Website<input data-hh-reg-website tabindex="-1" autocomplete="off"></label>
      <p class="hh-registration-warning" data-hh-reg-warning></p>
    `;
  }

  function syncConditionalFields(form) {
    const usage = form.querySelector("[data-hh-reg-usage]");
    const guardianWrap = form.querySelector("[data-hh-reg-guardian-wrap]");
    const guardian = form.querySelector("[data-hh-reg-guardian]");
    const country = form.querySelector("[data-hh-reg-country]");
    const countryOtherWrap = form.querySelector("[data-hh-reg-country-other-wrap]");
    const countryOther = form.querySelector("[data-hh-reg-country-other]");

    const guardianNeeded = usage?.value === "guardian_for_minor";
    if (guardianWrap) guardianWrap.hidden = !guardianNeeded;
    if (guardian) guardian.required = guardianNeeded;

    const otherCountry = country?.value === "OTHER";
    if (countryOtherWrap) countryOtherWrap.hidden = !otherCountry;
    if (countryOther) countryOther.required = otherCountry;
  }

  function showAgeWarning(form) {
    const warning = form.querySelector("[data-hh-reg-warning]");
    const dob = form.querySelector("[data-hh-reg-dob]");
    const submit = form.querySelector('button[type="submit"]');
    const age = ageFromDate(dob?.value);
    const blocked = Number.isFinite(age) && age < MINIMUM_AGE;
    if (warning) {
      warning.dataset.visible = blocked ? "true" : "false";
      warning.textContent = blocked
        ? "You cannot create a HerdHarbor account yourself. Ask a parent or legal guardian age 18 or older to create and manage the account using their own information."
        : "";
    }
    if (submit) submit.disabled = blocked;
    return !blocked;
  }

  function validateProfile(form, { showMessage = true } = {}) {
    syncConditionalFields(form);
    const profile = formProfile(form);
    const age = ageFromDate(profile.dateOfBirth);
    const error = (() => {
      if (profile.website) return "Registration could not be completed.";
      if (!profile.firstName || !profile.lastName) return "Enter the adult account holder's legal first and last name.";
      if (!Number.isFinite(age)) return "Enter a valid date of birth.";
      if (age < MINIMUM_AGE) return `The HerdHarbor account holder must be at least ${MINIMUM_AGE}. Ask a parent or legal guardian to create and manage the account.`;
      if (!profile.phone) return "Enter a phone number for the adult account holder.";
      if (!/^[A-Z]{2}$/.test(profile.countryCode)) return "Enter a valid 2-letter country code.";
      if (!profile.region || !profile.postalCode) return "Enter your state/province/region and ZIP/postal code.";
      if (profile.usageType === "guardian_for_minor" && !profile.guardianAttestation) return "The responsible adult must accept the parent/guardian supervision statement.";
      if (!profile.adultAccountHolderCertified || !profile.accuracyCertified) return "Complete both account-holder certifications.";
      return "";
    })();

    if (showMessage) {
      const warning = form.querySelector("[data-hh-reg-warning]");
      if (warning) {
        warning.dataset.visible = error ? "true" : "false";
        warning.textContent = error;
      }
    }
    return { ok: !error, error, profile };
  }

  function writePending(profile) {
    const safe = { ...profile };
    delete safe.website;
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify({ createdAt: Date.now(), profile: safe }));
    } catch {}
  }

  function readPending() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PENDING_KEY) || "null");
      if (!parsed?.createdAt || !parsed.profile) return null;
      if (Date.now() - Number(parsed.createdAt) > PENDING_MAX_AGE_MS) {
        localStorage.removeItem(PENDING_KEY);
        return null;
      }
      return parsed.profile;
    } catch {
      return null;
    }
  }

  function clearPending() {
    try { localStorage.removeItem(PENDING_KEY); } catch {}
  }

  function fillForm(form, profile) {
    if (!profile) return;
    const values = [
      ["[data-hh-reg-first]", profile.firstName],
      ["[data-hh-reg-last]", profile.lastName],
      ["[data-hh-reg-dob]", profile.dateOfBirth],
      ["[data-hh-reg-phone]", profile.phone],
      ["[data-hh-reg-region]", profile.region],
      ["[data-hh-reg-postal]", profile.postalCode],
      ["[data-hh-reg-organization]", profile.organizationName],
      ["[data-hh-reg-usage]", profile.usageType]
    ];
    for (const [selector, value] of values) {
      const node = form.querySelector(selector);
      if (node && value != null) node.value = String(value);
    }
    const country = form.querySelector("[data-hh-reg-country]");
    const supported = ["US", "CA", "MX", "GB", "AU", "NZ"];
    if (country && profile.countryCode) country.value = supported.includes(profile.countryCode) ? profile.countryCode : "OTHER";
    const other = form.querySelector("[data-hh-reg-country-other]");
    if (other && profile.countryCode && !supported.includes(profile.countryCode)) other.value = profile.countryCode;
    const guardian = form.querySelector("[data-hh-reg-guardian]");
    const adult = form.querySelector("[data-hh-reg-adult]");
    const accuracy = form.querySelector("[data-hh-reg-accuracy]");
    if (guardian) guardian.checked = profile.guardianAttestation === true;
    if (adult) adult.checked = profile.adultAccountHolderCertified === true;
    if (accuracy) accuracy.checked = profile.accuracyCertified === true;
    syncConditionalFields(form);
    showAgeWarning(form);
  }

  function installSignupFields() {
    const form = document.getElementById("hh-signup-form");
    if (!form || form.dataset.hhRegistrationSafety === VERSION) return Boolean(form);
    addStyles();

    const wrapper = document.createElement("div");
    wrapper.id = "hh-registration-fields";
    wrapper.innerHTML = registrationMarkup();
    form.prepend(wrapper);
    form.dataset.hhRegistrationSafety = VERSION;

    const dob = form.querySelector("[data-hh-reg-dob]");
    const usage = form.querySelector("[data-hh-reg-usage]");
    const country = form.querySelector("[data-hh-reg-country]");
    dob?.addEventListener("input", () => showAgeWarning(form));
    usage?.addEventListener("change", () => syncConditionalFields(form));
    country?.addEventListener("change", () => syncConditionalFields(form));
    syncConditionalFields(form);

    form.addEventListener("submit", (event) => {
      const result = validateProfile(form);
      if (!result.ok) {
        event.preventDefault();
        event.stopImmediatePropagation();
        result.error && form.querySelector("[data-hh-reg-warning]")?.scrollIntoView?.({ block: "nearest" });
        return;
      }
      writePending(result.profile);
    }, true);

    return true;
  }

  function ensureGate() {
    let gate = document.getElementById("hh-registration-gate");
    if (gate) return gate;
    gate = document.createElement("div");
    gate.id = "hh-registration-gate";
    gate.setAttribute("role", "dialog");
    gate.setAttribute("aria-modal", "true");
    gate.innerHTML = `
      <div class="hh-registration-card">
        <h2>Complete your account</h2>
        <p>Before this new HerdHarbor account can be used, the adult account holder must complete the registration profile. If you are under 18, a parent or legal guardian must complete this using their own information.</p>
        <form id="hh-registration-gate-form">
          ${registrationMarkup({ gate: true })}
          <div class="hh-registration-error" data-hh-registration-error aria-live="polite"></div>
          <div class="hh-registration-actions">
            <button class="hh-auth-button hh-auth-primary" type="submit">Complete account</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(gate);
    const form = gate.querySelector("#hh-registration-gate-form");
    fillForm(form, readPending());
    form.querySelector("[data-hh-reg-dob]")?.addEventListener("input", () => showAgeWarning(form));
    form.querySelector("[data-hh-reg-usage]")?.addEventListener("change", () => syncConditionalFields(form));
    form.querySelector("[data-hh-reg-country]")?.addEventListener("change", () => syncConditionalFields(form));
    form.addEventListener("submit", submitGateProfile);
    return gate;
  }

  async function submitGateProfile(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const errorNode = form.querySelector("[data-hh-registration-error]");
    const submit = form.querySelector('button[type="submit"]');
    const result = validateProfile(form);
    if (!result.ok) {
      if (errorNode) errorNode.textContent = result.error;
      return;
    }
    if (errorNode) errorNode.textContent = "Saving secure registration profile…";
    if (submit) submit.disabled = true;
    try {
      const response = await window.HerdHarborCloud.invokeFunction("registration-profile", {
        action: "complete",
        profile: result.profile
      });
      if (!response?.complete) throw new Error("The registration profile is not complete yet.");
      clearPending();
      hideGate();
      lastCheckedUserId = String(window.HerdHarborCloud?.getSession?.()?.user?.id || "");
      document.dispatchEvent(new CustomEvent("herdharbor:registration-profile", { detail: response }));
    } catch (error) {
      if (errorNode) errorNode.textContent = error?.message || "The registration profile could not be saved.";
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  function showGate() {
    addStyles();
    const gate = ensureGate();
    gate.dataset.visible = "true";
    document.documentElement.dataset.hhRegistrationRequired = "true";
    setTimeout(() => gate.querySelector("[data-hh-reg-first]")?.focus?.(), 0);
  }

  function hideGate() {
    const gate = document.getElementById("hh-registration-gate");
    if (gate) gate.dataset.visible = "false";
    delete document.documentElement.dataset.hhRegistrationRequired;
  }

  async function checkRegistrationStatus({ force = false } = {}) {
    const cloud = window.HerdHarborCloud;
    const userId = String(cloud?.getSession?.()?.user?.id || "");
    if (!userId) {
      lastCheckedUserId = "";
      hideGate();
      return;
    }
    if (!force && lastCheckedUserId === userId) return;
    if (statusInFlight) return;
    statusInFlight = true;
    try {
      const status = await cloud.invokeFunction("registration-profile", { action: "status" });
      if (status?.required && !status?.complete) {
        showGate();
      } else {
        hideGate();
        if (status?.complete) clearPending();
      }
      lastCheckedUserId = userId;
      document.dispatchEvent(new CustomEvent("herdharbor:registration-profile", { detail: status }));
    } catch (error) {
      console.warn("HerdHarbor registration check could not complete:", error);
      // Do not lock established accounts on a transient/offline failure. New accounts
      // are still server-gated before their registration profile can be completed.
    } finally {
      statusInFlight = false;
    }
  }

  function boot() {
    addStyles();
    let attempts = 0;
    bootTimer = window.setInterval(() => {
      attempts += 1;
      if (installSignupFields() || attempts >= MAX_BOOT_ATTEMPTS) {
        window.clearInterval(bootTimer);
        bootTimer = null;
      }
    }, BOOT_INTERVAL_MS);
    installSignupFields();

    document.addEventListener("click", (event) => {
      if (event.target?.closest?.("#hh-signup-tab")) setTimeout(installSignupFields, 0);
    }, true);

    document.addEventListener("herdharbor:auth-session", (event) => {
      if (event.detail?.signedIn === true) void checkRegistrationStatus({ force: true });
      else {
        lastCheckedUserId = "";
        hideGate();
      }
    });

    if (window.HerdHarborCloud?.getSession?.()?.user?.id) void checkRegistrationStatus({ force: true });
  }

  window.HerdHarborRegistrationSafety = Object.freeze({
    version: VERSION,
    minimumAge: MINIMUM_AGE,
    check: () => checkRegistrationStatus({ force: true }),
    __test: Object.freeze({ ageFromDate, validateProfile })
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
