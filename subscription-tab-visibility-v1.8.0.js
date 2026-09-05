(() => {
  "use strict";

  const SELECTOR = "[data-hh-subscription-engine-tab]";

  function keepSubscriptionTabVisible() {
    const nav = document.querySelector(".main-nav");
    if (!nav) return;

    const tab = nav.querySelector(SELECTOR) || document.querySelector(SELECTOR);
    if (!tab) return;

    if (tab.hidden) tab.hidden = false;
    if (tab.hasAttribute("hidden")) tab.removeAttribute("hidden");
    tab.setAttribute("aria-hidden", "false");
  }

  function boot() {
    keepSubscriptionTabVisible();

    const observer = new MutationObserver(() => keepSubscriptionTabVisible());
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "aria-hidden", "class"]
    });

    document.addEventListener("herdharbor:auth-session", keepSubscriptionTabVisible);
    document.addEventListener("herdharbor:stale-screen-detected", keepSubscriptionTabVisible);
    window.addEventListener("focus", keepSubscriptionTabVisible);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
