(() => {
  "use strict";

  const SUPABASE_URL = "https://okynebbksifqppwicghj.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_jxsX6uS9nnh2FOFtlSF9TA_8v6C7C09";
  const APP_SCRIPT = "marketplace-app-v2.0.1.js?v=1";
  const APP_STYLE = "marketplace-v2.0.1.css?v=1";

  const statusNode = document.getElementById("marketplace-gate-status");
  const actionsNode = document.getElementById("marketplace-gate-actions");
  const shellNode = document.getElementById("marketplace-access-shell");
  const rootNode = document.getElementById("marketplace-root");

  function deny(message) {
    if (statusNode) statusNode.textContent = message;
    if (actionsNode) actionsNode.hidden = false;
    if (rootNode) rootNode.hidden = true;
    document.documentElement.dataset.marketplaceAccess = "denied";
  }

  function loadStyle() {
    return new Promise((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = APP_STYLE;
      link.addEventListener("load", resolve, { once: true });
      link.addEventListener("error", () => reject(new Error("Marketplace stylesheet failed to load.")), { once: true });
      document.head.appendChild(link);
    });
  }

  function loadApp() {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = APP_SCRIPT;
      script.async = true;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", () => reject(new Error("Marketplace application failed to load.")), { once: true });
      document.body.appendChild(script);
    });
  }

  async function verifyOwnerPreview() {
    if (!window.supabase?.createClient) {
      deny("Marketplace preview is unavailable because secure account services did not load.");
      return;
    }

    const client = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );

    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    const session = sessionData?.session || null;
    if (sessionError || !session?.user?.id) {
      deny("Sign in to HerdHarbor with the Owner account to open the private Marketplace preview.");
      return;
    }

    const { data: role, error: roleError } = await client.rpc("herdharbor_account_role");
    if (roleError || String(role || "").toLowerCase() !== "owner") {
      deny("Marketplace is currently a private Owner-only preview.");
      return;
    }

    window.HerdHarborMarketplaceContext = Object.freeze({
      client,
      userId: session.user.id,
      role: "owner"
    });

    document.documentElement.dataset.marketplaceAccess = "owner";
    await loadStyle();
    await loadApp();

    if (shellNode) shellNode.hidden = true;
    if (rootNode) rootNode.hidden = false;
    document.dispatchEvent(new CustomEvent("herdharbor:marketplace-owner-ready", {
      detail: { userId: session.user.id }
    }));
  }

  verifyOwnerPreview().catch((error) => {
    console.error("HerdHarbor Marketplace gate failed:", error);
    deny("Marketplace preview could not verify secure access. Return to HerdHarbor and try again.");
  });
})();
