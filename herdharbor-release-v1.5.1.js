(() => {
  "use strict";

  const release = Object.freeze({
    version: window.HerdHarborBuild?.version || "1.6.1",
    buildId: window.HerdHarborBuild?.buildId || "rabbit-genetics-phase2-1",
    build: window.HerdHarborBuild?.build || "1.6.1-alpha-rabbit-genetics-phase2-1",
    howToUrl: "https://herdharbor.com/how-to/",
    featureFlags: Object.freeze({
      adminMemberManagementEnabled: true,
      juniorPlanEnabled: true,
      billingEnabled: false
    }),
    plans: Object.freeze({
      junior: Object.freeze({ label: "Junior", priceMonthly: 0, maxActiveAnimals: 5 }),
      founder: Object.freeze({ label: "Founder", priceMonthly: 7.99, maxActiveAnimals: null }),
      member: Object.freeze({ label: "Member", priceMonthly: 14.99, maxActiveAnimals: null }),
      business: Object.freeze({ label: "Business", priceMonthly: null, maxActiveAnimals: null, reserved: true })
    })
  });

  function createElement(tagName) {
    try { return document.createElement?.(tagName) || null; } catch { return null; }
  }

  function addHelpButton() {
    const theme = document.querySelector?.("#theme-toggle");
    if (!theme || document.querySelector?.("#herdharbor-help-button")) return;
    const button = createElement("button");
    if (!button) return;
    button.id = "herdharbor-help-button";
    button.type = "button";
    button.className = "icon-button help-toggle";
    button.textContent = "?";
    button.title = "Open HerdHarbor How-To Center";
    button.setAttribute("aria-label", "Open HerdHarbor How-To Center");
    button.addEventListener("click", () => {
      const opened = window.open(release.howToUrl, "_blank", "noopener,noreferrer");
      if (!opened) window.location.href = release.howToUrl;
    });
    theme.insertAdjacentElement("afterend", button);
  }

  function addStyles() {
    if (document.querySelector?.("#herdharbor-v151-release-style")) return;
    const style = createElement("style");
    if (!style) return;
    style.id = "herdharbor-v151-release-style";
    style.textContent = ".help-toggle{font-size:1rem;font-weight:900}.topbar-actions .help-toggle{flex:0 0 auto}@media(max-width:620px){.help-toggle{width:40px;min-width:40px}}";
    const target = document.head || document.body || document.documentElement;
    if (target?.appendChild) target.appendChild(style);
  }

  function updateVersionLabels() {
    if (document.documentElement?.dataset) document.documentElement.dataset.herdharborRelease = release.version;
    document.querySelectorAll?.("[data-app-version], .app-version, .version-label").forEach((element) => {
      const current = String(element.textContent || "");
      if (/alpha|version|v\\d/i.test(current)) element.textContent = current.replace(/(?:v)?1\\.\\d+\\.\\d+/gi, "v" + release.version);
    });
    document.querySelectorAll?.(".hh-bi-kicker").forEach((element) => {
      if (/Alpha v/i.test(element.textContent || "")) element.textContent = String(element.textContent).replace(/Alpha v\\d+\\.\\d+\\.\\d+/i, "Alpha v" + release.version);
    });
  }

  function boot() {
    addStyles();
    addHelpButton();
    updateVersionLabels();
  }

  window.HerdHarborRelease = release;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
