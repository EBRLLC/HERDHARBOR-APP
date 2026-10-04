(() => {
  "use strict";

  const context = window.HerdHarborMarketplaceContext;
  const root = document.getElementById("marketplace-root");
  if (!context?.client || context.role !== "owner" || !context.userId || !root) return;

  root.innerHTML = `
    <header class="marketplace-topbar">
      <a class="marketplace-brand" href="../" aria-label="Return to HerdHarbor">HerdHarbor</a>
      <span class="marketplace-preview-badge">Owner Preview</span>
    </header>
    <main class="marketplace-main">
      <section class="marketplace-hero">
        <p class="marketplace-eyebrow">Marketplace Web Core</p>
        <h1>Marketplace foundation is active.</h1>
        <p>This private surface is isolated from normal HerdHarbor startup. Seller profiles, listings, search, and pedigree preview will be added in the next Stack C phases.</p>
      </section>
      <section class="marketplace-panel" aria-labelledby="marketplace-c1-title">
        <h2 id="marketplace-c1-title">C1 security boundary</h2>
        <ul>
          <li>Owner account access only.</li>
          <li>Marketplace data remains server-native and separate from private herd sync.</li>
          <li>No public Marketplace reads are enabled.</li>
          <li>Marketplace-specific runtime loads only after the Owner gate passes.</li>
        </ul>
      </section>
    </main>
  `;

  window.HerdHarborMarketplace = Object.freeze({
    phase: "C1",
    access: "owner-preview",
    userId: context.userId
  });
})();
