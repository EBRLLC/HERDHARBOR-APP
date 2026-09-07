(() => {
  "use strict";

  const VERSION = "1.8.1";
  const RULE = Object.freeze({
    threshold: 5,
    freeMonths: 1,
    continuous: true,
    label: "Every 5 qualified referrals = 1 month free"
  });
  const engine = window.HerdHarborSubscriptionEngine;
  if (!engine || window.HerdHarborSubscriptionCloseout) return;

  function referralProjection(successfulReferrals = engine.getState?.()?.referral?.successfulReferrals || 0) {
    const count = Math.max(0, Math.floor(Number(successfulReferrals || 0)));
    const cycles = Math.floor(count / 5);
    const progress = count % 5;
    return {
      count,
      cycles,
      achieved: cycles ? [{ ...RULE, threshold: cycles * 5, freeMonths: cycles }] : [],
      next: {
        ...RULE,
        threshold: (cycles + 1) * 5,
        remaining: progress === 0 ? 5 : 5 - progress,
        progress
      }
    };
  }

  const wrapped = Object.freeze({
    ...engine,
    getReferralRules: () => [{ ...RULE }],
    referralProjection
  });
  window.HerdHarborSubscriptionEngine = wrapped;

  function enhanceCreditState() {
    const panel = document.getElementById("hh-subscription-engine-panel");
    if (!panel || panel.hidden) return;
    const state = wrapped.getState?.() || {};
    if (String(state.status || "").toLowerCase() !== "credit_active") return;
    const statusLine = panel.querySelector(".hh-subscription-status-line .hh-subscription-pill");
    if (statusLine) {
      statusLine.dataset.tone = "good";
      statusLine.textContent = "Member Credit Active";
    }
    const hero = panel.querySelector(".hh-subscription-hero > div:first-child > p");
    if (hero && state.currentPeriodEnd) {
      const end = new Date(state.currentPeriodEnd);
      hero.textContent = Number.isNaN(end.getTime())
        ? "A complimentary Member month is active."
        : `A complimentary Member month is active through ${end.toLocaleDateString()}.`;
    }
  }

  document.addEventListener("herdharbor:subscription-engine-state", () => setTimeout(enhanceCreditState, 0));
  document.addEventListener("click", (event) => {
    if (event.target?.closest?.("[data-hh-subscription-engine-tab]")) setTimeout(enhanceCreditState, 0);
  }, true);

  window.HerdHarborSubscriptionCloseout = Object.freeze({ version: VERSION, referralProjection, referralRule: RULE });
})();
