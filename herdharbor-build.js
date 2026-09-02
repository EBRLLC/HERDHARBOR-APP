(function (root) {
  "use strict";
  root.HerdHarborBuild = Object.freeze({
    product: "HerdHarbor",
    channel: "Alpha",
    version: "1.6.7",
    buildId: "completion-debt-1",
    build: "1.6.7-alpha-completion-debt-1"
  });

  // Alpha v1.7.0 development feature layer. The application-wide release
  // identity remains pinned until this review branch is approved and cut.
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
  addStyle("hh-arba-v170-style", "standards-v1.7.0.css?v=1.7.0");
  addScript("hh-arba-v170-registry", "standards-registry-v1.7.0.js?v=1.7.0", () => {
    addScript("hh-arba-v170-ui", "standards-ui-v1.7.0.js?v=1.7.0");
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
