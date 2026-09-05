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

  function boot() {
    applySubscriptionHeaderCopy();

    const panel = document.getElementById("hh-subscription-engine-panel");
    if (!panel) return;

    const observer = new MutationObserver(() => applySubscriptionHeaderCopy());
    observer.observe(panel, { childList: true, subtree: true });

    document.addEventListener("herdharbor:subscription-engine-state", () => {
      queueMicrotask(applySubscriptionHeaderCopy);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
