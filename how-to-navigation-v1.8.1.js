(() => {
  "use strict";

  const HOW_TO_URL = "/how-to/";

  function createNavItem() {
    const link = document.createElement("a");
    link.id = "herdharbor-how-to-nav";
    link.className = "nav-item";
    link.href = HOW_TO_URL;
    link.title = "How To Center";
    link.setAttribute("aria-label", "Open HerdHarbor How To Center");
    link.innerHTML = '<span class="nav-icon" aria-hidden="true">?</span><span>How To</span>';
    return link;
  }

  function addSidebarLink() {
    const nav = document.querySelector(".main-nav");
    if (!nav || document.getElementById("herdharbor-how-to-nav")) return;

    const accountLabel = [...nav.querySelectorAll(".nav-group-label")]
      .find((node) => String(node.textContent || "").trim().toLowerCase() === "account");

    const supportLabel = document.createElement("div");
    supportLabel.className = "nav-group-label";
    supportLabel.id = "herdharbor-how-to-group";
    supportLabel.textContent = "Help";

    if (accountLabel) {
      nav.insertBefore(supportLabel, accountLabel);
      nav.insertBefore(createNavItem(), accountLabel);
    } else {
      nav.appendChild(supportLabel);
      nav.appendChild(createNavItem());
    }
  }

  function addDashboardShortcut() {
    const dashboard = document.getElementById("view-dashboard");
    if (!dashboard || document.getElementById("herdharbor-how-to-shortcut")) return;

    const shortcut = document.createElement("a");
    shortcut.id = "herdharbor-how-to-shortcut";
    shortcut.href = HOW_TO_URL;
    shortcut.className = "hh-how-to-shortcut";
    shortcut.innerHTML = '<span class="hh-how-to-shortcut-icon" aria-hidden="true">?</span><span><strong>Need help with a HerdHarbor task?</strong><small>Open step-by-step guides for pedigrees, litters, health records, genetics, subscriptions, and more.</small></span><b>How To Center →</b>';

    const header = dashboard.querySelector(".page-header");
    if (header?.nextSibling) header.parentNode.insertBefore(shortcut, header.nextSibling);
    else dashboard.prepend(shortcut);
  }

  function addStyles() {
    if (document.getElementById("herdharbor-how-to-v181-style")) return;
    const style = document.createElement("style");
    style.id = "herdharbor-how-to-v181-style";
    style.textContent = `
      .main-nav a.nav-item{text-decoration:none}
      .hh-how-to-shortcut{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:14px;margin:0 0 20px;padding:16px 18px;color:var(--ink);background:var(--teal-soft);border:1px solid rgba(46,125,123,.24);border-radius:16px;text-decoration:none}
      .hh-how-to-shortcut:hover{border-color:rgba(46,125,123,.5)}
      .hh-how-to-shortcut-icon{width:38px;height:38px;display:grid;place-items:center;color:#fff;background:var(--teal);border-radius:11px;font-weight:950}
      .hh-how-to-shortcut strong,.hh-how-to-shortcut small{display:block}
      .hh-how-to-shortcut strong{color:var(--navy)}
      .hh-how-to-shortcut small{margin-top:3px;color:var(--muted)}
      .hh-how-to-shortcut b{color:var(--teal);font-size:.82rem;white-space:nowrap}
      html[data-theme="dark"] .hh-how-to-shortcut{background:#123844;border-color:rgba(143,209,204,.25)}
      html[data-theme="dark"] .hh-how-to-shortcut strong{color:#F1F5F7}
      html[data-theme="dark"] .hh-how-to-shortcut small{color:#B9C7D0}
      @media(max-width:620px){.hh-how-to-shortcut{grid-template-columns:auto minmax(0,1fr)}.hh-how-to-shortcut b{grid-column:2;white-space:normal}}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function refresh() {
    addSidebarLink();
    addDashboardShortcut();
  }

  function boot() {
    addStyles();
    refresh();
    const dashboard = document.getElementById("view-dashboard");
    if (dashboard && typeof MutationObserver === "function") {
      const observer = new MutationObserver(() => addDashboardShortcut());
      observer.observe(dashboard, { childList: true, subtree: false });
    }
  }

  window.HerdHarborHowTo = Object.freeze({ version: "1.8.1", url: HOW_TO_URL, refresh });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
