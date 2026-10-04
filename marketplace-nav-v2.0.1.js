(() => {
  "use strict";

  const nav = document.querySelector("[data-marketplace-nav]");
  if (!nav) return;

  const MARKETPLACE_ORIGIN = "https://herdharbor.com";
  const HANDOFF_TTL_MS = 30000;
  const pendingHandoffs = new Map();

  function session() {
    return window.HerdHarborCloud?.getSession?.() || null;
  }

  function sync() {
    const signedIn = Boolean(session()?.user?.id);
    nav.hidden = !signedIn;
    nav.setAttribute("aria-hidden", String(!signedIn));
  }

  function nonce() {
    return globalThis.crypto?.randomUUID?.()
      || Array.from(globalThis.crypto?.getRandomValues?.(new Uint32Array(4)) || [Date.now()])
        .map((value) => Number(value).toString(16))
        .join("-");
  }

  function prune() {
    const now = Date.now();
    for (const [key, handoff] of pendingHandoffs) {
      if (!handoff || handoff.expiresAt <= now || handoff.window?.closed) {
        pendingHandoffs.delete(key);
      }
    }
  }

  async function createTicket() {
    const invoke = window.HerdHarborCloud?.invokeFunction;
    if (typeof invoke !== "function") throw new Error("Marketplace SSO service is unavailable.");
    const payload = await invoke("marketplace-sso-ticket", {});
    const tokenHash = String(payload?.tokenHash || "");
    const verificationType = String(payload?.verificationType || "");
    if (!tokenHash || verificationType !== "magiclink") {
      throw new Error("Marketplace SSO ticket is invalid.");
    }
    return { tokenHash, verificationType };
  }

  nav.addEventListener("click", (event) => {
    const activeSession = session();
    if (!activeSession?.user?.id) return;

    event.preventDefault();
    prune();

    const handoffNonce = nonce();
    const target = new URL(nav.href, window.location.href);
    target.hash = "app-sso=" + encodeURIComponent(handoffNonce);

    const opened = window.open(target.href, "_blank");
    const ticketPromise = createTicket();

    if (!opened) {
      void ticketPromise.then((ticket) => {
        const fallback = new URL(nav.href, window.location.href);
        fallback.hash = "sso-ticket=" + encodeURIComponent(ticket.tokenHash);
        window.location.assign(fallback.href);
      }).catch(() => window.location.assign(nav.href));
      return;
    }

    const handoff = {
      window: opened,
      userId: String(activeSession.user.id),
      ticket: ticketPromise,
      delivered: false,
      expiresAt: Date.now() + HANDOFF_TTL_MS
    };
    pendingHandoffs.set(handoffNonce, handoff);

    window.setTimeout(async () => {
      const pending = pendingHandoffs.get(handoffNonce);
      if (!pending || pending.delivered || pending.expiresAt <= Date.now()) return;
      try {
        const ticket = await pending.ticket;
        if (!pendingHandoffs.has(handoffNonce) || pending.delivered) return;
        const fallback = new URL(nav.href, window.location.href);
        fallback.hash = "sso-ticket=" + encodeURIComponent(ticket.tokenHash);
        pending.window.location.href = fallback.href;
        pendingHandoffs.delete(handoffNonce);
      } catch {
        pendingHandoffs.delete(handoffNonce);
      }
    }, 1500);
  });

  window.addEventListener("message", async (event) => {
    if (event.origin !== MARKETPLACE_ORIGIN) return;
    if (event.data?.type !== "herdharbor:marketplace-sso-request") return;

    prune();
    const handoffNonce = String(event.data?.nonce || "");
    const handoff = pendingHandoffs.get(handoffNonce);
    if (!handoff || event.source !== handoff.window) return;

    const activeSession = session();
    if (!activeSession?.user?.id || String(activeSession.user.id) !== handoff.userId) {
      pendingHandoffs.delete(handoffNonce);
      return;
    }

    try {
      const ticket = await handoff.ticket;
      if (!pendingHandoffs.has(handoffNonce) || handoff.expiresAt <= Date.now()) return;

      handoff.delivered = true;
      event.source.postMessage({
        type: "herdharbor:marketplace-sso-ticket",
        nonce: handoffNonce,
        tokenHash: ticket.tokenHash,
        verificationType: ticket.verificationType
      }, MARKETPLACE_ORIGIN);

      // If the website never confirms completion, retry once after its
      // handshake timeout using the same one-time token in the URL fragment.
      window.setTimeout(async () => {
        const pending = pendingHandoffs.get(handoffNonce);
        if (!pending || pending.expiresAt <= Date.now()) return;
        try {
          const recoveryTicket = await pending.ticket;
          if (!pendingHandoffs.has(handoffNonce)) return;
          const fallback = new URL(nav.href, window.location.href);
          fallback.hash = "sso-ticket=" + encodeURIComponent(recoveryTicket.tokenHash);
          pending.window.location.href = fallback.href;
          pendingHandoffs.delete(handoffNonce);
        } catch {
          pendingHandoffs.delete(handoffNonce);
        }
      }, 6000);
    } catch {
      pendingHandoffs.delete(handoffNonce);
    }
  });

  window.addEventListener("message", (event) => {
    if (event.origin !== MARKETPLACE_ORIGIN) return;
    if (event.data?.type !== "herdharbor:marketplace-sso-complete") return;

    const handoffNonce = String(event.data?.nonce || "");
    const handoff = pendingHandoffs.get(handoffNonce);
    if (!handoff || event.source !== handoff.window) return;
    pendingHandoffs.delete(handoffNonce);
  });

  document.addEventListener("herdharbor:membership-change", sync);
  document.addEventListener("herdharbor:auth-session", sync);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", sync, { once: true });
  } else {
    sync();
  }
})();