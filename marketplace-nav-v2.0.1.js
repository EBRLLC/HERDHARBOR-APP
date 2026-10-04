(() => {
  "use strict";

  const nav = document.querySelector("[data-marketplace-nav]");
  if (!nav) return;

  function sync() {
    const membership = window.HerdHarborMembership;
    const access = membership?.getAccount?.() || {};
    const allowed = membership?.isOwner?.() === true
      && access.backendReady === true
      && String(access.accountStatus || "").toLowerCase() === "active";

    nav.hidden = !allowed;
    nav.setAttribute("aria-hidden", String(!allowed));
  }

  document.addEventListener("herdharbor:membership-change", sync);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", sync, { once: true });
  } else {
    sync();
  }
})();
