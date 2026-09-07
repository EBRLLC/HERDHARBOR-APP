(() => {
  "use strict";

  function applySubscriptionHeaderCopy() {
    const panel = document.getElementById("hh-subscription-engine-panel");
    if (!panel) return;

    const header = panel.querySelector(".hh-subscription-header");
    if (!header) return;

    const kicker = header.querySelector(".hh-subscription-kicker");
    if (kicker && kicker.textContent !== "HERDHARBOR") {
      kicker.textContent = "HERDHARBOR";
    }

    const title = header.querySelector("#hh-subscription-title");
    if (title && title.textContent !== "Subscription") {
      title.textContent = "Subscription";
    }

    const description = header.querySelector("p");
    if (description) description.remove();
  }

  function scheduleApply() {
    window.setTimeout(applySubscriptionHeaderCopy, 0);
  }

  function boot() {
    applySubscriptionHeaderCopy();

    // Event-driven only. Do not observe the Subscription DOM: renderPanel()
    // replaces panel children, and a subtree MutationObserver can accidentally
    // create self-triggering UI loops when presentation helpers rewrite text.
    document.addEventListener("herdharbor:subscription-engine-state", scheduleApply);
    document.addEventListener("herdharbor:membership-change", scheduleApply);
    document.addEventListener("herdharbor:access-profile", scheduleApply);
    document.addEventListener("click", (event) => {
      if (event.target?.closest?.("[data-hh-subscription-engine-tab]")) scheduleApply();
    }, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
