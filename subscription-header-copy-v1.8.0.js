(() => {
  "use strict";

  const HEADER_DESCRIPTION = "Manage your plan, billing, referral rewards, and subscription credits.";

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
    if (title && title.textContent !== "Subscriptions") {
      title.textContent = "Subscriptions";
    }

    let description = header.querySelector("p");
    if (!description) {
      description = document.createElement("p");
      header.querySelector("div")?.appendChild(description);
    }
    if (description && description.textContent !== HEADER_DESCRIPTION) {
      description.textContent = HEADER_DESCRIPTION;
    }

    const heroStatus = panel.querySelector(".hh-subscription-hero p");
    if (heroStatus) {
      const current = heroStatus.textContent.trim();
      if (current === "Billing provider connected.") {
        heroStatus.textContent = "Your subscription and billing are ready to manage.";
      } else if (current.startsWith("Payment processing is not connected yet")) {
        heroStatus.textContent = "Billing is not available right now. Your current access is unchanged.";
      }
    }
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
