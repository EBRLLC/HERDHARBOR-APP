(function (root) {
  "use strict";
  root.HerdHarborBuild = Object.freeze({
    product: "HerdHarbor",
    channel: "Alpha",
    version: "1.7.1",
    buildId: "multispecies-genetics-foundation-1",
    build: "1.7.1-alpha-multispecies-genetics-foundation-1"
  });

  // Alpha v1.7.1 Multi-Species Genetics Foundation; v1.7.1 ARBA + youth show layers remain preserved.
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
  addScript("hh-arba-v170-registry", "standards-registry-v1.7.0.js?v=1.7.1", () => {
    addScript("hh-arba-v170-ui", "standards-ui-v1.7.0.js?v=1.7.1", () => {
      addScript("hh-arba-public-v170", "standards-public-reference-v1.7.0.js?v=1.7.1");
    });
  });
  addScript("hh-youth-guides-v170", "shows-youth-guides-v1.7.0.js?v=1.7.1");
})(typeof globalThis !== "undefined" ? globalThis : this);
