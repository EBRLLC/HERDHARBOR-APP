(() => {
  "use strict";

  const SELECTOR = "[data-hh-subscription-engine-tab]";

  function sidebarIsVisible() {
    const nav = document.querySelector(".main-nav");
    if (!nav) return false;
    const style = window.getComputedStyle?.(nav);
    if (style?.display === "none" || style?.visibility === "hidden") return false;
    return nav.getClientRects().length > 0;
  }

  function revealForSignedInApp() {
    if (!sidebarIsVisible()) return;
    const tab = document.querySelector(SELECTOR);
    if (!tab) return;
    tab.hidden = false;
    tab.removeAttribute("hidden");
    tab.setAttribute("aria-hidden", "false");
  }

  function onAuthSession(event) {
    if (event.detail?.signedIn === true) {
      window.setTimeout(revealForSignedInApp, 0);
    }
  }

  function boot() {
    document.addEventListener("herdharbor:auth-session", onAuthSession);
    document.addEventListener("herdharbor:membership-change", revealForSignedInApp);
    window.addEventListener("focus", revealForSignedInApp);

    // Passive initial check only. This helper never shows or hides auth surfaces,
    // never changes the app shell, and never modifies the auth/session state.
    revealForSignedInApp();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
