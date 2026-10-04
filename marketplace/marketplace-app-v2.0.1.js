(() => {
  "use strict";

  const context = window.HerdHarborMarketplaceContext;
  const root = document.getElementById("marketplace-root");
  if (!context?.client || context.role !== "owner" || !context.userId || !root) return;

  const FEATURES = Object.freeze({
    listings: Object.freeze({
      script: "marketplace-listings-v2.0.1.js?v=1",
      globalName: "HerdHarborMarketplaceListings",
      rootId: "marketplace-listings-root"
    }),
    profile: Object.freeze({
      script: "marketplace-profile-v2.0.1.js?v=1",
      globalName: "HerdHarborMarketplaceProfile",
      rootId: "marketplace-profile-root"
    })
  });

  function loadScript(src, globalName) {
    return new Promise((resolve, reject) => {
      if (window[globalName]?.mount) {
        resolve();
        return;
      }

      const base = src.split("?")[0];
      const existing = [...document.scripts].find((script) => script.src.includes(base));
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", () => reject(new Error(`Marketplace feature failed to load: ${src}`)), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", () => reject(new Error(`Marketplace feature failed to load: ${src}`)), { once: true });
      document.body.appendChild(script);
    });
  }

  root.innerHTML = `
    <header class="marketplace-topbar">
      <a class="marketplace-brand" href="../" aria-label="Return to HerdHarbor">HerdHarbor</a>
      <nav class="marketplace-topnav" aria-label="Marketplace preview sections">
        <button type="button" data-marketplace-section="listings" class="active">Listings</button>
        <button type="button" data-marketplace-section="profile">Seller Profile</button>
      </nav>
      <span class="marketplace-preview-badge">Owner Preview</span>
    </header>
    <main class="marketplace-main">
      <section class="marketplace-hero">
        <p class="marketplace-eyebrow">HerdHarbor Marketplace</p>
        <h1>Manage your Marketplace presence.</h1>
        <p>This remains a private Owner-only preview. Listings are detached Marketplace snapshots and never become another HerdHarbor sync client.</p>
      </section>

      <section id="marketplace-listings-root" class="marketplace-feature-root" aria-live="polite">
        <section class="marketplace-panel"><p class="marketplace-muted">Loading Marketplace listings…</p></section>
      </section>

      <section id="marketplace-profile-root" class="marketplace-feature-root" aria-live="polite" hidden>
        <section class="marketplace-panel"><p class="marketplace-muted">Loading seller profile…</p></section>
      </section>
    </main>
  `;

  const mounted = new Set();

  async function mountFeature(name) {
    const feature = FEATURES[name];
    const featureRoot = document.getElementById(feature.rootId);
    if (!feature || !featureRoot || mounted.has(name)) return;

    try {
      await loadScript(feature.script, feature.globalName);
      const runtime = window[feature.globalName];
      if (!runtime?.mount) throw new Error(`Marketplace ${name} runtime is unavailable.`);
      await runtime.mount(featureRoot, context);
      mounted.add(name);
    } catch (error) {
      console.error(`HerdHarbor Marketplace ${name} startup failed:`, error);
      featureRoot.innerHTML = '<section class="marketplace-panel"><p class="marketplace-muted">This Marketplace section could not be loaded.</p></section>';
    }
  }

  function showFeature(name) {
    for (const [featureName, feature] of Object.entries(FEATURES)) {
      const node = document.getElementById(feature.rootId);
      if (node) node.hidden = featureName !== name;
    }
    document.querySelectorAll("[data-marketplace-section]").forEach((button) => {
      button.classList.toggle("active", button.dataset.marketplaceSection === name);
    });
    mountFeature(name);
  }

  document.querySelectorAll("[data-marketplace-section]").forEach((button) => {
    button.addEventListener("click", () => showFeature(button.dataset.marketplaceSection));
  });

  showFeature("listings");

  window.HerdHarborMarketplace = Object.freeze({
    phase: "C3",
    access: "owner-preview",
    userId: context.userId,
    showFeature
  });
})();
