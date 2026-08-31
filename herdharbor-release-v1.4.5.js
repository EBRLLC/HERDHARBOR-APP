(() => {
  "use strict";
  const RELEASE = "1.4.5";
  const HOW_TO = "https://herdharbor.com/how-to/";
  function addHelpButton() {
    const theme = document.querySelector("#theme-toggle");
    if (!theme || document.querySelector("#herdharbor-help-button")) return;
    const button = document.createElement("button");
    button.id = "herdharbor-help-button";
    button.type = "button";
    button.className = "icon-button help-toggle";
    button.textContent = "?";
    button.title = "Open HerdHarbor How-To Center";
    button.setAttribute("aria-label", "Open HerdHarbor How-To Center");
    button.addEventListener("click", () => {
      const opened = window.open(HOW_TO, "_blank", "noopener,noreferrer");
      if (!opened) window.location.href = HOW_TO;
    });
    theme.insertAdjacentElement("afterend", button);
  }
  function updateVersionLabels() {
    document.documentElement.dataset.herdharborRelease = RELEASE;
    document.querySelectorAll("[data-app-version], .app-version, .version-label").forEach((el) => {
      const text = String(el.textContent || "");
      if (/alpha|version|v\d/i.test(text)) el.textContent = text.replace(/(?:v)?1\.(?:3|4)\.\d+/gi, `v${RELEASE}`);
    });
    document.querySelectorAll(".hh-bi-kicker").forEach((el) => {
      if (/Alpha v/i.test(el.textContent || "")) el.textContent = String(el.textContent).replace(/Alpha v\d+\.\d+\.\d+/i, `Alpha v${RELEASE}`);
    });
  }
  function addStyles() {
    if (document.querySelector("#herdharbor-v145-release-style")) return;
    const style = document.createElement("style");
    style.id = "herdharbor-v145-release-style";
    style.textContent = `.help-toggle{font-size:1rem;font-weight:900}.topbar-actions .help-toggle{flex:0 0 auto}@media(max-width:620px){.help-toggle{width:40px;min-width:40px}}`;
    const target = document.head || document.body || document.documentElement;
    if (target) target.appendChild(style);
  }
  function boot(){ addStyles(); addHelpButton(); updateVersionLabels(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
  window.HerdHarborRelease = Object.freeze({ version: RELEASE, howToUrl: HOW_TO, refresh: boot });
})();
