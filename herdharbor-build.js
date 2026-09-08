(function (root) {
  "use strict";
  root.HerdHarborBuild = Object.freeze({
    product: "HerdHarbor",
    channel: "Alpha",
    version: "1.8.1",
    buildId: "october-subscription-launch-referrals-credits-4",
    build: "1.8.1-alpha-october-subscription-launch-referrals-credits-4"
  });

  const AUTH_FETCH_TIMEOUT_MS = 12000;
  const SIGN_IN_WATCHDOG_MS = 15000;
  const SUPABASE_HOST = "okynebbksifqppwicghj.supabase.co";
  const originalFetch = typeof root.fetch === "function" ? root.fetch.bind(root) : null;

  function isCriticalAuthUrl(input) {
    try {
      const raw = typeof input === "string" ? input : input?.url;
      if (!raw) return false;
      const url = new URL(raw, root.location?.href || "https://app.herdharbor.com/");
      if (url.hostname !== SUPABASE_HOST) return false;
      const path = url.pathname.replace(/\/+$/, "");
      return path.startsWith("/auth/v1/")
        || path === "/rest/v1/herdharbor_user_data"
        || path === "/rest/v1/account_access"
        || path === "/rest/v1/rpc/herdharbor_account_role";
    } catch { return false; }
  }

  function recoverableNetworkResponse(input, error, timedOut = false) {
    if (typeof root.Response !== "function") throw error;
    const message = timedOut
      ? "The secure HerdHarbor connection timed out. Please try again."
      : "The secure HerdHarbor connection is temporarily unavailable. Please try again.";
    const payload = {
      message,
      msg: message,
      error: timedOut ? "secure_connection_timeout" : "secure_connection_unavailable",
      error_description: message,
      code: timedOut ? "HH_SECURE_TIMEOUT" : "HH_SECURE_NETWORK"
    };
    try {
      return new root.Response(JSON.stringify(payload), {
        status: timedOut ? 504 : 503,
        statusText: timedOut ? "Gateway Timeout" : "Service Unavailable",
        headers: { "Content-Type": "application/json" }
      });
    } catch {
      throw error;
    }
  }

  function recoverSignInForm(form) {
    const doc = root.document;
    if (!doc || !form || typeof form.querySelectorAll !== "function") return false;
    if (!doc.documentElement?.classList?.contains?.("hh-auth-locked")) return false;
    if (form.isConnected === false) return false;
    const controls = Array.from(form.querySelectorAll("button, input"));
    if (!controls.some((control) => control.disabled)) return false;
    controls.forEach((control) => { control.disabled = false; });
    const box = doc.querySelector?.("#hh-auth-message");
    if (box) {
      box.textContent = "Sign in is taking too long. Check your connection and try again.";
      if (box.dataset) box.dataset.type = "error";
      box.setAttribute?.("role", "alert");
    }
    return true;
  }

  root.HerdHarborAuthResilience = Object.freeze({
    timeoutMs: AUTH_FETCH_TIMEOUT_MS,
    watchdogMs: SIGN_IN_WATCHDOG_MS,
    isCriticalAuthUrl,
    recoverableNetworkResponse,
    recoverSignInForm
  });
  if (originalFetch && typeof root.AbortController === "function") {
    root.fetch = function herdHarborBoundedAuthFetch(input, init) {
      if (!isCriticalAuthUrl(input)) return originalFetch(input, init);
      const controller = new root.AbortController();
      const upstreamSignal = init?.signal || (input && typeof input === "object" ? input.signal : null);
      let timedOut = false;
      let upstreamAborted = Boolean(upstreamSignal?.aborted);
      const forwardAbort = () => {
        upstreamAborted = true;
        controller.abort(upstreamSignal?.reason);
      };
      if (upstreamSignal?.aborted) forwardAbort();
      else upstreamSignal?.addEventListener?.("abort", forwardAbort, { once: true });
      const timer = root.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, AUTH_FETCH_TIMEOUT_MS);
      const nextInit = { ...(init || {}), signal: controller.signal };
      return Promise.resolve()
        .then(() => originalFetch(input, nextInit))
        .catch((error) => {
          if (upstreamAborted) throw error;
          return recoverableNetworkResponse(input, error, timedOut);
        })
        .finally(() => {
          root.clearTimeout(timer);
          upstreamSignal?.removeEventListener?.("abort", forwardAbort);
        });
    };
  }

  if (!root.document) return;
  root.document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!form || form.id !== "hh-signin-form") return;
    root.setTimeout(() => recoverSignInForm(form), SIGN_IN_WATCHDOG_MS);
  }, true);
  root.addEventListener?.("unhandledrejection", (event) => {
    if (!event?.reason || !["AbortError", "TypeError"].includes(event.reason.name)) return;
    const form = root.document.querySelector?.("#hh-signin-form");
    if (form) recoverSignInForm(form);
  });

  const target = document.head || document.documentElement;
  function addStyle(id, href) {
    if (document.getElementById(id)) return;
    const node = document.createElement("link");node.id = id;node.rel = "stylesheet";node.href = href;target.appendChild(node);
  }
  function addScript(id, src, onload) {
    if (document.getElementById(id)) { onload?.(); return; }
    const node = document.createElement("script");node.id = id;node.src = src;node.async = false;if (onload) node.addEventListener("load", onload, { once: true });target.appendChild(node);
  }
  addStyle("hh-arba-v170-style", "standards-v1.7.0.css?v=1.7.1");
  addStyle("hh-reference-guides-v170-style", "reference-guides-v1.7.0.css?v=1.7.1");
  addStyle("hh-health-intelligence-v171-style", "health-intelligence-v1.7.1.css?v=1.7.1");
  addStyle("hh-phase1-workflow-v171-style", "workflow-phase1-v1.7.1.css?v=2");
  addStyle("hh-flow-phase1-v182-style", "flow-phase1-v1.8.2.css?v=1");
  addStyle("hh-flow-phase2-v182-style", "flow-phase2-v1.8.2.css?v=1");
  addStyle("hh-flow-phase2-lifecycle-v182-style", "flow-phase2-lifecycle-v1.8.2.css?v=1");
  addStyle("hh-flow-phase2-profile-finish-v182-style", "flow-phase2-profile-finish-v1.8.2.css?v=1");
  addStyle("hh-breeding-litter-workspace-v182-style", "breeding-litter-workspace-v1.8.2.css?v=1");
  addStyle("hh-litter-sale-transfer-v182-style", "litter-sale-transfer-v1.8.2.css?v=1");
  addStyle("hh-breeding-next-action-v182-style", "breeding-next-action-v1.8.2.css?v=1");
  addStyle("hh-breeding-performance-v182-style", "breeding-performance-dashboard-v1.8.2.css?v=2");
  addStyle("hh-genetics-v2-phase1-v182-style", "genetics-v2-phase1-v1.8.2.css?v=1");
  addStyle("hh-genetics-v2-phase2-v182-style", "genetics-v2-phase2-v1.8.2.css?v=1");
  addStyle("hh-genetics-v2-phase3-v182-style", "genetics-v2-phase3-v1.8.2.css?v=1");
  addStyle("hh-subscription-engine-v180-style", "subscription-engine-v1.8.0.css?v=1");
  addStyle("hh-subscription-member-ui-v180-style", "subscription-member-ui-v1.8.0.css?v=1");
  addStyle("hh-mobile-viewport-v180-style", "mobile-viewport-hotfix-v1.8.0.css?v=1");
  addStyle("hh-direct-transfer-v182-style", "direct-transfer-v1.8.2.css?v=1");

  addScript("hh-direct-transfer-core-v182", "direct-transfer-core-v1.8.2.js?v=1", () => { addScript("hh-direct-transfer-v182", "direct-transfer-v1.8.2.js?v=1"); });
  addScript("hh-genetics-v2-phase1-core-v182", "genetics-v2-phase1-core-v1.8.2.js?v=1", () => {
    addScript("hh-genetics-v2-phase1-v182", "genetics-v2-phase1-v1.8.2.js?v=1", () => {
      addScript("hh-genetics-v2-phase2-core-v182", "genetics-v2-phase2-core-v1.8.2.js?v=1", () => {
        addScript("hh-genetics-v2-phase2-v182", "genetics-v2-phase2-v1.8.2.js?v=1", () => {
          addScript("hh-genetics-v2-phase3-core-v182", "genetics-v2-phase3-core-v1.8.2.js?v=1", () => { addScript("hh-genetics-v2-phase3-v182", "genetics-v2-phase3-v1.8.2.js?v=1"); });
        });
      });
    });
  });
  addScript("hh-how-to-navigation-v181", "how-to-navigation-v1.8.1.js?v=1");
  addScript("hh-registration-safety-v181", "registration-safety-v1.8.1.js?v=1", () => { addScript("hh-subscription-referral-policy-v181", "subscription-referral-policy-v1.8.1.js?v=1"); });
  addScript("hh-admin-subscription-credits-v181", "subscription-admin-credits-v1.8.1.js?v=1");
  addScript("hh-arba-v170-registry", "standards-registry-v1.7.0.js?v=1.7.1", () => {
    addScript("hh-arba-v170-ui", "standards-ui-v1.7.0.js?v=1.7.1", () => { addScript("hh-arba-public-v170", "standards-public-reference-v1.7.0.js?v=1.7.1"); });
  });
  addScript("hh-youth-guides-v170", "shows-youth-guides-v1.7.0.js?v=1.7.1");
  addScript("hh-health-intelligence-v171", "health-intelligence-v1.7.1.js?v=1.7.1", () => {
    addScript("hh-v171-stability-hotfix", "herdharbor-v1.7.1-stability-hotfix.js?v=2", () => {
      addScript("hh-phase1-workflow-v171", "workflow-phase1-v1.7.1.js?v=2", () => {
        addScript("hh-flow-phase1-v182", "flow-phase1-v1.8.2.js?v=1", () => {
          addScript("hh-flow-phase2-v182", "flow-phase2-v1.8.2.js?v=1", () => {
            addScript("hh-flow-phase2-lifecycle-v182", "flow-phase2-lifecycle-v1.8.2.js?v=1", () => {
              addScript("hh-breeding-litter-workspace-v182", "breeding-litter-workspace-v1.8.2.js?v=1", () => {
                addScript("hh-breeding-litter-workspace-integration-v182", "breeding-litter-workspace-integration-v1.8.2.js?v=1", () => {
                  addScript("hh-litter-sale-transfer-core-v182", "litter-sale-transfer-core-v1.8.2.js?v=1", () => {
                    addScript("hh-litter-sale-transfer-v182", "litter-sale-transfer-v1.8.2.js?v=1", () => {
                      addScript("hh-breeding-next-action-core-v182", "breeding-next-action-core-v1.8.2.js?v=2", () => {
                        addScript("hh-breeding-next-action-v182", "breeding-next-action-v1.8.2.js?v=1", () => {
                          addScript("hh-breeding-performance-core-v182", "breeding-performance-core-v1.8.2.js?v=1", () => {
                            addScript("hh-breeding-performance-dashboard-v182", "breeding-performance-dashboard-v1.8.2.js?v=1", () => {
                              addScript("hh-flow-phase2-profile-finish-v182", "flow-phase2-profile-finish-v1.8.2.js?v=1", () => { addScript("hh-flow-phase1-completion-v182", "flow-phase1-completion-v1.8.2.js?v=1"); });
                            });
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
  addScript("hh-subscription-launch-v181", "subscription-launch-v1.8.1.js?v=1", () => {
    addScript("hh-subscription-engine-v180", "subscription-engine-v1.8.0.js?v=1", () => {
      addScript("hh-subscription-tab-visibility-v180", "subscription-tab-visibility-v1.8.0.js?v=2", () => {
        addScript("hh-subscription-header-copy-v180", "subscription-header-copy-v1.8.0.js?v=3", () => {
          addScript("hh-subscription-stripe-provider-v180", "subscription-stripe-provider-v1.8.0.js?v=1", () => { addScript("hh-subscription-stripe-launch-bridge-v181", "subscription-stripe-launch-bridge-v1.8.1.js?v=1"); });
        });
      });
    });
  });
})(typeof globalThis !== "undefined" ? globalThis : this);