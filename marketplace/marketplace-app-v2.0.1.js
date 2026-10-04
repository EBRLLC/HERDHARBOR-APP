(() => {
  "use strict";

  const context = window.HerdHarborMarketplaceContext;
  const root = document.getElementById("marketplace-root");
  if (!context?.client || context.role !== "owner" || !context.userId || !root) return;

  const PROFILE_SCRIPT = "marketplace-profile-v2.0.1.js?v=1";

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = [...document.scripts].find((script) => script.src.includes(src.split("?")[0]));
      if (existing) {
        if (window.HerdHarborMarketplaceProfile) resolve();
        else existing.addEventListener("load", resolve, { once: true });
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
      <span class="marketplace-preview-badge">Owner Preview</span>
    </header>
    <main class="marketplace-main">
      <section class="marketplace-hero">
        <p class="marketplace-eyebrow">Marketplace Web Core</p>
        <h1>Build your Marketplace seller profile.</h1>
        <p>This remains a private Owner-only preview. The profile is intentionally limited to fields that can later be public without exposing HerdHarbor account or herd-management data.</p>
      </section>
      <div id="marketplace-profile-root" class="marketplace-feature-root" aria-live="polite">
        <section class="marketplace-panel"><p class="marketplace-muted">Loading seller profile…</p></section>
      </div>
    </main>
  `;

  const featureRoot = document.getElementById("marketplace-profile-root");

  loadScript(PROFILE_SCRIPT)
    .then(() => {
      if (!window.HerdHarborMarketplaceProfile?.mount) {
        throw new Error("Marketplace profile runtime is unavailable.");
      }
      return window.HerdHarborMarketplaceProfile.mount(featureRoot, context);
    })
    .catch((error) => {
      console.error("HerdHarbor Marketplace profile startup failed:", error);
      if (featureRoot) {
        featureRoot.innerHTML = '<section class="marketplace-panel"><p class="marketplace-muted">Seller profile could not be loaded.</p></section>';
      }
    });

  window.HerdHarborMarketplace = Object.freeze({
    phase: "C2",
    access: "owner-preview",
    userId: context.userId
  });
})();
