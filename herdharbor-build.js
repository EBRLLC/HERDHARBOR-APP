(function (root) {
  "use strict";
  root.HerdHarborBuild = Object.freeze({
    product: "HerdHarbor",
    channel: "Alpha",
    version: "1.8.1",
    buildId: "october-subscription-launch-referrals-credits-4",
    build: "1.8.1-alpha-october-subscription-launch-referrals-credits-4"
  });

  // Alpha v1.8.1 remains the release identity. v1.8.2 flow layers are additive UX architecture over the stable domain engines.
  if (!root.document) return;
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
                      addScript("hh-breeding-next-action-core-v182", "breeding-next-action-core-v1.8.2.js?v=1", () => {
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
