(function (root) {
  "use strict";
  root.HerdHarborBuild = Object.freeze({
    product: "HerdHarbor",
    channel: "Alpha",
    version: "1.8.0",
    buildId: "subscription-engine-7",
    build: "1.8.0-alpha-subscription-engine-7"
  });

  // Alpha v1.8.0 adds the standalone Subscription Engine while preserving the v1.7.1 stable domain engines, Phase 1 workflow, and v1.7.0 ARBA layers.
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
  addStyle("hh-subscription-engine-v180-style", "subscription-engine-v1.8.0.css?v=1");
  addStyle("hh-subscription-member-ui-v180-style", "subscription-member-ui-v1.8.0.css?v=2");
  addScript("hh-arba-v170-registry", "standards-registry-v1.7.0.js?v=1.7.1", () => {
    addScript("hh-arba-v170-ui", "standards-ui-v1.7.0.js?v=1.7.1", () => {
      addScript("hh-arba-public-v170", "standards-public-reference-v1.7.0.js?v=1.7.1");
    });
  });
  addScript("hh-youth-guides-v170", "shows-youth-guides-v1.7.0.js?v=1.7.1");
  addScript("hh-health-intelligence-v171", "health-intelligence-v1.7.1.js?v=1.7.1", () => {
    addScript("hh-v171-stability-hotfix", "herdharbor-v1.7.1-stability-hotfix.js?v=2", () => {
      addScript("hh-phase1-workflow-v171", "workflow-phase1-v1.7.1.js?v=2");
    });
  });
  addScript("hh-subscription-engine-v180", "subscription-engine-v1.8.0.js?v=1", () => {
    addScript("hh-subscription-tab-visibility-v180", "subscription-tab-visibility-v1.8.0.js?v=2", () => {
      addScript("hh-subscription-header-copy-v180", "subscription-header-copy-v1.8.0.js?v=2", () => {
        addScript("hh-subscription-stripe-provider-v180", "subscription-stripe-provider-v1.8.0.js?v=2");
      });
    });
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
