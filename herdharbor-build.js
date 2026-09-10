(function (root) {
  "use strict";
  root.HerdHarborBuild = Object.freeze({
    product: "HerdHarbor",
    channel: "Alpha",
    version: "1.8.2",
    buildId: "cloud-sync-v2-baseline-recovery-2",
    build: "1.8.2-alpha-cloud-sync-v2-baseline-recovery-2"
  });

  // Keep authentication and the first cloud hydration from waiting forever while
  // the application is intentionally hidden behind the auth lock.
  const AUTH_FETCH_TIMEOUT_MS = 12000;
  const SIGN_IN_WATCHDOG_MS = 15000;
  const SUPABASE_HOST = "okynebbksifqppwicghj.supabase.co";
  const originalFetch = typeof root.fetch === "function" ? root.fetch.bind(root) : null;

  const CLOUD_STATE_KEY = "herdharbor_pre_alpha_v1";
  const CLOUD_ACTIVE_OWNER_KEY = "herdharbor_active_user_v1";
  const cloudBaseKey = (userId) => `herdharbor_user_cloud_base_${userId}`;
  const cloudDirtyKey = (userId) => `herdharbor_user_dirty_${userId}`;
  const cloudVersionKey = (userId) => `herdharbor_user_cloud_version_${userId}`;

  function isReadableCloudState(rawValue) {
    if (!rawValue) return false;
    try {
      const parsed = JSON.parse(rawValue);
      return Boolean(parsed && typeof parsed === "object");
    } catch {
      return false;
    }
  }

  function dispatchBaselineRestored(userId, reason) {
    try {
      root.dispatchEvent?.(new CustomEvent("herdharbor:cloud-baseline-restored", {
        detail: { userId, reason }
      }));
    } catch {}
  }

  function restoreMissingCloudBaseline(storage, reason = "startup") {
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") return false;
    try {
      const userId = storage.getItem(CLOUD_ACTIVE_OWNER_KEY);
      if (!userId) return false;
      if (storage.getItem(cloudBaseKey(userId))) return false;
      if (storage.getItem(cloudDirtyKey(userId)) === "1") return false;
      if (!storage.getItem(cloudVersionKey(userId))) return false;

      const activeRaw = storage.getItem(CLOUD_STATE_KEY);
      if (!isReadableCloudState(activeRaw)) return false;

      storage.setItem(cloudBaseKey(userId), activeRaw);
      dispatchBaselineRestored(userId, reason);
      return true;
    } catch {
      return false;
    }
  }

  function captureMissingBaselineBeforeMutation(storage, originalSetItem, previousRaw, reason) {
    try {
      const userId = storage.getItem(CLOUD_ACTIVE_OWNER_KEY);
      if (!userId) return false;
      if (storage.getItem(cloudBaseKey(userId))) return false;
      if (storage.getItem(cloudDirtyKey(userId)) === "1") return false;
      if (!storage.getItem(cloudVersionKey(userId))) return false;
      if (!isReadableCloudState(previousRaw)) return false;

      originalSetItem.call(storage, cloudBaseKey(userId), previousRaw);
      dispatchBaselineRestored(userId, reason);
      return true;
    } catch {
      return false;
    }
  }

  // Cloud Sync V2 guard. The cloud runtime performs protected three-way merges
  // using a local copy of the last confirmed cloud state. If that baseline is
  // missing while the account is otherwise clean, the older runtime interprets
  // the next edit as an unsafe two-device conflict. Rebuild only a provably safe
  // baseline: there must be a known cloud version, no dirty/unsynced flag, and a
  // readable active state owned by the signed-in account. Dirty states are never
  // guessed or overwritten.
  function installCloudSyncV2BaselineGuard() {
    if (root.__HH_CLOUD_SYNC_V2_BASELINE_GUARD__) return;
    const storage = root.localStorage;
    const StorageCtor = root.Storage;
    if (!storage || !StorageCtor?.prototype?.setItem) return;

    root.__HH_CLOUD_SYNC_V2_BASELINE_GUARD__ = true;
    restoreMissingCloudBaseline(storage, "startup");

    const originalStorageSetItem = StorageCtor.prototype.setItem;
    const originalStorageRemoveItem = StorageCtor.prototype.removeItem;

    StorageCtor.prototype.setItem = function herdHarborCloudSyncV2SetItem(key, value) {
      if (this === storage && key === CLOUD_STATE_KEY) {
        try {
          const previousRaw = storage.getItem(CLOUD_STATE_KEY);
          if (previousRaw !== value) {
            captureMissingBaselineBeforeMutation(
              storage,
              originalStorageSetItem,
              previousRaw,
              "before-local-edit"
            );
          }
        } catch {}
      }
      return originalStorageSetItem.call(this, key, value);
    };

    if (typeof originalStorageRemoveItem === "function") {
      StorageCtor.prototype.removeItem = function herdHarborCloudSyncV2RemoveItem(key) {
        if (this === storage && key === CLOUD_STATE_KEY) {
          try {
            captureMissingBaselineBeforeMutation(
              storage,
              originalStorageSetItem,
              storage.getItem(CLOUD_STATE_KEY),
              "before-local-clear"
            );
          } catch {}
        }
        return originalStorageRemoveItem.call(this, key);
      };
    }

    root.HerdHarborCloudSyncV2 = Object.freeze({
      version: "2.0",
      release: "1.8.2",
      restoreMissingBaseline: () => restoreMissingCloudBaseline(storage, "manual")
    });
  }

  installCloudSyncV2BaselineGuard();

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
    } catch {
      return false;
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
    recoverSignInForm
  });

  if (originalFetch && typeof root.AbortController === "function") {
    root.fetch = function herdHarborBoundedAuthFetch(input, init) {
      if (!isCriticalAuthUrl(input)) return originalFetch(input, init);
      const controller = new root.AbortController();
      const upstreamSignal = init?.signal || (input && typeof input === "object" ? input.signal : null);
      const forwardAbort = () => controller.abort(upstreamSignal?.reason);
      if (upstreamSignal?.aborted) forwardAbort();
      else upstreamSignal?.addEventListener?.("abort", forwardAbort, { once: true });
      const timer = root.setTimeout(() => controller.abort(), AUTH_FETCH_TIMEOUT_MS);
      const nextInit = { ...(init || {}), signal: controller.signal };
      return Promise.resolve(originalFetch(input, nextInit)).finally(() => {
        root.clearTimeout(timer);
        upstreamSignal?.removeEventListener?.("abort", forwardAbort);
      });
    };
  }

  // Alpha v1.8.2 is the release identity. All current flow layers remain additive UX architecture over the stable domain engines.
  if (!root.document) return;

  root.document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!form || form.id !== "hh-signin-form") return;
    root.setTimeout(() => recoverSignInForm(form), SIGN_IN_WATCHDOG_MS);
  }, true);

  root.addEventListener?.("unhandledrejection", (event) => {
    if (event?.reason?.name !== "AbortError") return;
    const form = root.document.querySelector?.("#hh-signin-form");
    if (form) recoverSignInForm(form);
  });

  const target = document.head || document.documentElement;
  function addStyle(id, href) {
    if (document.getElementById(id)) return;
    const node = document.createElement("link");
    node.id = id;
    node.rel = "stylesheet";
    node.href = href;
    target.appendChild(node);
  }
  function addScript(id, src, onload) {
    if (document.getElementById(id)) { onload?.(); return; }
    const node = document.createElement("script");
    node.id = id;
    node.src = src;
    node.async = false;
    if (onload) node.addEventListener("load", onload, { once: true });
    target.appendChild(node);
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
  addStyle("hh-subscription-engine-v180-style", "subscription-engine-v1.8.0.css?v=1");
  addStyle("hh-subscription-member-ui-v180-style", "subscription-member-ui-v1.8.0.css?v=1");
  addStyle("hh-mobile-viewport-v180-style", "mobile-viewport-hotfix-v1.8.0.css?v=1");
  addStyle("hh-direct-transfer-v182-style", "direct-transfer-v1.8.2.css?v=1");
  addScript("hh-direct-transfer-core-v182", "direct-transfer-core-v1.8.2.js?v=1", () => {
    addScript("hh-direct-transfer-v182", "direct-transfer-v1.8.2.js?v=1");
  });
  addScript("hh-how-to-navigation-v181", "how-to-navigation-v1.8.1.js?v=1");
  addScript("hh-registration-safety-v181", "registration-safety-v1.8.1.js?v=1", () => {
    addScript("hh-subscription-referral-policy-v181", "subscription-referral-policy-v1.8.1.js?v=1");
  });
  addScript("hh-admin-subscription-credits-v181", "subscription-admin-credits-v1.8.1.js?v=1");
  addScript("hh-arba-v170-registry", "standards-registry-v1.7.0.js?v=1.7.1", () => {
    addScript("hh-arba-v170-ui", "standards-ui-v1.7.0.js?v=1.7.1", () => {
      addScript("hh-arba-public-v170", "standards-public-reference-v1.7.0.js?v=1.7.1");
    });
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
                              addScript("hh-flow-phase2-profile-finish-v182", "flow-phase2-profile-finish-v1.8.2.js?v=1", () => {
                                addScript("hh-flow-phase1-completion-v182", "flow-phase1-completion-v1.8.2.js?v=1");
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
  });
  addScript("hh-subscription-launch-v181", "subscription-launch-v1.8.1.js?v=1", () => {
    addScript("hh-subscription-engine-v180", "subscription-engine-v1.8.0.js?v=1", () => {
      addScript("hh-subscription-tab-visibility-v180", "subscription-tab-visibility-v1.8.0.js?v=2", () => {
        addScript("hh-subscription-header-copy-v180", "subscription-header-copy-v1.8.0.js?v=3", () => {
          addScript("hh-subscription-stripe-provider-v180", "subscription-stripe-provider-v1.8.0.js?v=1", () => {
            addScript("hh-subscription-stripe-launch-bridge-v181", "subscription-stripe-launch-bridge-v1.8.1.js?v=1");
          });
        });
      });
    });
  });
})(typeof globalThis !== "undefined" ? globalThis : this);