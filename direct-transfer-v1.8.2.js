(() => {
  "use strict";

  const STORAGE_KEY = "herdharbor_pre_alpha_v1";
  const FUNCTION_NAME = "animal-transfer";
  const POLL_MS = 60_000;
  const Core = window.HerdHarborDirectTransferCore;
  if (!Core) return;

  let identity = null;
  let inbox = [];
  let outbox = [];
  let lastRefreshAt = 0;
  let refreshInFlight = null;
  let observer = null;
  let chip = null;

  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const clean = (value) => String(value == null ? "" : value).trim();
  const formatDate = (value) => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : String(value);
  };

  function readState() {
    try {
      const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      state.animals = Array.isArray(state.animals) ? state.animals : [];
      state.sales = Array.isArray(state.sales) ? state.sales : [];
      state.customers = Array.isArray(state.customers) ? state.customers : [];
      state.transfers = Array.isArray(state.transfers) ? state.transfers : [];
      return state;
    } catch {
      return { animals: [], sales: [], customers: [], transfers: [] };
    }
  }

  async function persistState(nextState) {
    const before = readState();
    const validator = window.HerdHarborMembership?.validateAnimalTransition;
    if (typeof validator === "function") {
      const result = validator(before.animals || [], nextState.animals || []);
      if (!result?.allowed) {
        window.HerdHarborMembership?.showJuniorLimit?.(result);
        throw new Error(result?.message || "This transfer would exceed the active-animal limit for the current membership.");
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    const saved = await window.HerdHarborCloud?.syncNow?.();
    return saved !== false;
  }

  async function api(action, body = {}) {
    if (!window.HerdHarborCloud?.invokeFunction) throw new Error("The secure HerdHarbor transfer service is not ready yet.");
    return window.HerdHarborCloud.invokeFunction(FUNCTION_NAME, { action, ...body });
  }

  function toast(message, type = "info") {
    const node = document.createElement("div");
    node.className = `hh-direct-toast ${type}`;
    node.textContent = message;
    document.body.appendChild(node);
    requestAnimationFrame(() => node.classList.add("show"));
    setTimeout(() => {
      node.classList.remove("show");
      setTimeout(() => node.remove(), 250);
    }, 4200);
  }

  function closeModal() {
    document.querySelector("#hh-direct-transfer-modal")?.remove();
  }

  function openModal(title, body, subtitle = "HerdHarbor Direct Transfer") {
    closeModal();
    const overlay = document.createElement("div");
    overlay.id = "hh-direct-transfer-modal";
    overlay.className = "hh-direct-modal-backdrop";
    overlay.innerHTML = `
      <section class="hh-direct-modal" role="dialog" aria-modal="true" aria-labelledby="hh-direct-modal-title">
        <header>
          <div><span>${esc(subtitle)}</span><h2 id="hh-direct-modal-title">${esc(title)}</h2></div>
          <button type="button" class="hh-direct-close" data-hh-direct-close aria-label="Close">×</button>
        </header>
        <div class="hh-direct-modal-body">${body}</div>
      </section>`;
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay || event.target.closest?.("[data-hh-direct-close]")) closeModal();
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function customerForSale(state, sale) {
    return state.customers.find((customer) => String(customer.id) === String(sale?.customerId)) || {};
  }

  function saleSubjectLabels(state, sale) {
    return (Array.isArray(sale?.items) ? sale.items : []).map((item) => {
      const animal = state.animals.find((record) => String(record.id) === String(item.animalId));
      return animal?.name || animal?.tag || animal?.tattoo || "Unnamed animal";
    });
  }

  async function ensureIdentity() {
    if (identity) return identity;
    const response = await api("identity");
    identity = response?.identity || response || null;
    return identity;
  }

  async function refreshTransfers(force = false) {
    if (refreshInFlight) return refreshInFlight;
    if (!force && Date.now() - lastRefreshAt < POLL_MS) return { identity, inbox, outbox };
    refreshInFlight = (async () => {
      const [identityResult, inboxResult, outboxResult] = await Promise.all([
        api("identity"),
        api("inbox"),
        api("outbox")
      ]);
      identity = identityResult?.identity || identityResult || null;
      inbox = Array.isArray(inboxResult?.transfers) ? inboxResult.transfers : [];
      outbox = Array.isArray(outboxResult?.transfers) ? outboxResult.transfers : [];
      lastRefreshAt = Date.now();
      updateNavBadge();
      renderSalesEnhancements();
      return { identity, inbox, outbox };
    })();
    try {
      return await refreshInFlight;
    } finally {
      refreshInFlight = null;
    }
  }

  function updateNavBadge() {
    const pendingCount = inbox.filter((row) => row.status === "pending").length;
    const nav = document.querySelector('[data-route="sales"]');
    if (nav) {
      let badge = nav.querySelector(".hh-direct-nav-badge");
      if (!badge && pendingCount) {
        badge = document.createElement("span");
        badge.className = "hh-direct-nav-badge";
        nav.appendChild(badge);
      }
      if (badge) {
        badge.textContent = String(pendingCount);
        badge.hidden = !pendingCount;
      }
    }
    if (!chip) {
      chip = document.createElement("button");
      chip.type = "button";
      chip.className = "hh-direct-incoming-chip";
      chip.hidden = true;
      chip.addEventListener("click", () => {
        document.querySelector('[data-route="sales"]')?.click();
        setTimeout(() => renderSalesEnhancements(), 80);
      });
      document.body.appendChild(chip);
    }
    chip.textContent = pendingCount === 1 ? "1 incoming animal transfer" : `${pendingCount} incoming animal transfers`;
    chip.hidden = !pendingCount;
  }

  function transferCard(row, incoming = true) {
    const names = Array.isArray(row.subjectNames) && row.subjectNames.length ? row.subjectNames.join(", ") : `${row.subjectCount || 1} animal${Number(row.subjectCount || 1) === 1 ? "" : "s"}`;
    const status = String(row.status || "pending");
    return `<article class="hh-direct-card" data-hh-transfer-id="${esc(row.id)}">
      <div class="hh-direct-card-main">
        <strong>${esc(names)}</strong>
        <span>${incoming ? `From ${esc(row.senderDisplayName || "HerdHarbor member")}` : `To ${esc(row.recipientDisplayName || "HerdHarbor member")}`}</span>
        <small>${esc(row.sourceSaleNumber || row.transferId || "")}${row.saleDate ? ` · ${esc(formatDate(row.saleDate))}` : ""} · ${esc(status)}</small>
      </div>
      <div class="hh-direct-card-actions">
        ${incoming && status === "pending" ? `<button type="button" class="button button-primary" data-hh-review-transfer="${esc(row.id)}">Review</button>` : ""}
        ${!incoming && status === "pending" ? `<button type="button" class="button button-ghost" data-hh-cancel-transfer="${esc(row.id)}">Cancel</button>` : ""}
      </div>
    </article>`;
  }

  function panelHtml() {
    const pending = inbox.filter((row) => row.status === "pending");
    const recentOut = outbox.slice(0, 5);
    return `
      <section class="panel hh-direct-transfer-panel" id="hh-direct-transfer-panel">
        <div class="panel-header hh-direct-panel-header">
          <div>
            <h3>HerdHarbor Direct Transfer</h3>
            <small>Send sold animals, 3-generation pedigrees, and transferable genetics directly between member accounts.</small>
          </div>
          <button type="button" class="button button-ghost" id="hh-direct-refresh">Refresh</button>
        </div>
        <div class="hh-direct-identity">
          <span>Your member transfer code</span>
          <strong>${esc(identity?.memberCode || "Loading…")}</strong>
          <small>Share this code with a seller instead of your email when you prefer.</small>
        </div>
        <div class="hh-direct-columns">
          <div>
            <h4>Incoming transfers ${pending.length ? `<span class="hh-direct-count">${pending.length}</span>` : ""}</h4>
            ${pending.length ? pending.map((row) => transferCard(row, true)).join("") : '<p class="hh-direct-empty">No pending animal transfers.</p>'}
          </div>
          <div>
            <h4>Recent sent transfers</h4>
            ${recentOut.length ? recentOut.map((row) => transferCard(row, false)).join("") : '<p class="hh-direct-empty">No direct transfers sent yet.</p>'}
          </div>
        </div>
      </section>`;
  }

  function injectSaleButtons() {
    const state = readState();
    document.querySelectorAll("#view-sales .data-table tbody tr").forEach((row) => {
      if (row.querySelector("[data-hh-direct-send]")) return;
      const saleNumber = clean(row.querySelector("td:first-child strong")?.textContent);
      const sale = state.sales.find((record) => clean(record.saleNumber) === saleNumber);
      if (!sale || String(sale.status).toLowerCase() !== "completed") return;
      const actionCell = row.querySelector("td:last-child");
      if (!actionCell) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button-ghost hh-direct-row-button";
      button.dataset.hhDirectSend = sale.id;
      button.textContent = "Send to member";
      actionCell.appendChild(button);
    });
  }

  function bindPanel() {
    const panel = document.querySelector("#hh-direct-transfer-panel");
    if (!panel || panel.dataset.bound === "1") return;
    panel.dataset.bound = "1";
    panel.addEventListener("click", async (event) => {
      const review = event.target.closest?.("[data-hh-review-transfer]");
      if (review) return openIncomingReview(review.dataset.hhReviewTransfer);
      const cancel = event.target.closest?.("[data-hh-cancel-transfer]");
      if (cancel) return cancelOutgoing(cancel.dataset.hhCancelTransfer);
      if (event.target.closest?.("#hh-direct-refresh")) {
        const button = event.target.closest("#hh-direct-refresh");
        button.disabled = true;
        try { await refreshTransfers(true); } catch (error) { toast(error.message, "error"); }
        finally { button.disabled = false; }
      }
    });
  }

  function renderSalesEnhancements() {
    const host = document.querySelector("#view-sales");
    if (!host || !host.offsetParent) return;
    const existing = document.querySelector("#hh-direct-transfer-panel");
    if (existing) existing.outerHTML = panelHtml();
    else {
      const toolbar = host.querySelector(".toolbar");
      if (toolbar) toolbar.insertAdjacentHTML("beforebegin", panelHtml());
      else host.insertAdjacentHTML("afterbegin", panelHtml());
    }
    bindPanel();
    injectSaleButtons();
  }

  function openSendTransfer(saleId) {
    const state = readState();
    const sale = state.sales.find((record) => String(record.id) === String(saleId));
    if (!sale) return toast("That sale could not be found.", "error");
    if (String(sale.status).toLowerCase() !== "completed") return toast("Complete the sale before transferring an animal to another account.", "error");
    const customer = customerForSale(state, sale);
    const subjects = saleSubjectLabels(state, sale);
    const host = openModal("Send sold animal to a member", `
      <div class="hh-direct-summary">
        <strong>${esc(sale.saleNumber || sale.transferNumber)}</strong>
        <span>${esc(subjects.join(", ") || "Animal sale")}</span>
        <small>The buyer will receive the animal record, available 3-generation pedigree, transferable genetics, and provenance. Your private notes, financial records, health notes, and customer records are not sent.</small>
      </div>
      <label class="hh-direct-field">Buyer email or HerdHarbor member code
        <div class="hh-direct-lookup-row">
          <input id="hh-direct-recipient" value="${esc(customer.email || "")}" placeholder="buyer@example.com or HH-XXXXXXXXXX" autocomplete="off">
          <button type="button" class="button button-primary" id="hh-direct-find-member">Find member</button>
        </div>
      </label>
      <div id="hh-direct-member-result" class="hh-direct-member-result" hidden></div>
      <p class="hh-direct-help">The buyer must accept the transfer before the animal is added to their HerdHarbor account.</p>`);

    let resolved = null;
    const lookup = host.querySelector("#hh-direct-recipient");
    const result = host.querySelector("#hh-direct-member-result");
    const findButton = host.querySelector("#hh-direct-find-member");
    const find = async () => {
      const recipient = clean(lookup.value);
      if (!recipient) return toast("Enter the buyer's HerdHarbor email or member code.", "error");
      findButton.disabled = true;
      result.hidden = false;
      result.innerHTML = "<span>Looking for member…</span>";
      try {
        const response = await api("resolve", { recipient });
        if (!response?.recipient) {
          resolved = null;
          result.innerHTML = '<strong>No matching HerdHarbor member found.</strong><span>Confirm the buyer email/code, or use the existing downloadable transfer file for a non-member buyer.</span>';
          return;
        }
        resolved = response.recipient;
        result.innerHTML = `
          <div><strong>${esc(resolved.displayName || "HerdHarbor member")}</strong><span>${esc(resolved.maskedEmail || resolved.memberCode || "Verified member")}</span></div>
          <button type="button" class="button button-primary" id="hh-direct-send-confirmed">Send transfer</button>`;
        result.querySelector("#hh-direct-send-confirmed").addEventListener("click", () => sendResolvedTransfer(sale.id, recipient, resolved));
      } catch (error) {
        resolved = null;
        result.innerHTML = `<strong>Member lookup failed.</strong><span>${esc(error.message)}</span>`;
      } finally {
        findButton.disabled = false;
      }
    };
    findButton.addEventListener("click", find);
    lookup.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); find(); }
    });
  }

  async function sendResolvedTransfer(saleId, recipientLookup, recipient) {
    const button = document.querySelector("#hh-direct-send-confirmed");
    if (button) { button.disabled = true; button.textContent = "Sending…"; }
    try {
      const state = readState();
      const me = await ensureIdentity();
      const payload = Core.buildTransferPayload(state, saleId, {
        operationName: me?.displayName || state.profile?.operationName || "",
        ownerName: state.profile?.ownerName || "",
        memberCode: me?.memberCode || ""
      });
      const response = await api("create", { recipient: recipientLookup, payload });
      const transfer = response?.transfer;
      if (!transfer?.id) throw new Error("The secure transfer service did not return a transfer record.");

      const sale = state.sales.find((record) => String(record.id) === String(saleId));
      const now = new Date().toISOString();
      const already = state.transfers.some((record) => record.serverTransferId === transfer.id);
      if (!already) {
        const subjectIds = Array.isArray(sale?.items) ? sale.items.map((item) => item.animalId).filter(Boolean) : [];
        state.transfers.push({
          id: `transfer_sent_${transfer.id}`,
          direction: "Sent",
          channel: "HerdHarbor Direct",
          transferId: payload.transferId,
          sourceSaleNumber: payload.sale?.saleNumber || "",
          serverTransferId: transfer.id,
          recipientName: recipient?.displayName || transfer.recipientDisplayName || "HerdHarbor member",
          animalIds: subjectIds,
          status: transfer.status || "pending",
          createdAt: now
        });
        subjectIds.forEach((animalId) => {
          const animal = state.animals.find((record) => String(record.id) === String(animalId));
          if (!animal) return;
          const history = Array.isArray(animal.ownershipHistory) ? animal.ownershipHistory : [];
          if (!history.some((row) => row?.transferId === payload.transferId)) {
            history.push({
              type: "transfer",
              date: sale?.saleDate || now,
              transferId: payload.transferId,
              sourceSaleNumber: payload.sale?.saleNumber || "",
              from: me?.displayName || state.profile?.operationName || "Seller",
              to: recipient?.displayName || transfer.recipientDisplayName || "HerdHarbor member"
            });
          }
          animal.ownershipHistory = history.slice(-25);
          animal.updatedAt = now;
        });
        try { await persistState(state); } catch (error) { console.warn("Direct transfer sent; local history will retry cloud sync.", error); }
      }
      closeModal();
      toast(`Transfer sent to ${recipient?.displayName || "the buyer"}. They can accept it from Sales & Customers.`, "success");
      await refreshTransfers(true);
    } catch (error) {
      toast(error.message || "The transfer could not be sent.", "error");
      if (button) { button.disabled = false; button.textContent = "Send transfer"; }
    }
  }

  async function openIncomingReview(transferId) {
    try {
      const response = await api("preview", { transferId });
      const transfer = response?.transfer;
      if (!transfer) throw new Error("That transfer is no longer available.");
      const subjectNames = Array.isArray(transfer.subjectNames) ? transfer.subjectNames : [];
      const host = openModal("Incoming animal transfer", `
        <div class="hh-direct-summary">
          <strong>${esc(subjectNames.join(", ") || `${transfer.subjectCount || 1} animal${Number(transfer.subjectCount || 1) === 1 ? "" : "s"}`)}</strong>
          <span>From ${esc(transfer.senderDisplayName || "HerdHarbor member")}</span>
          <small>${esc(transfer.sourceSaleNumber || transfer.transferId || "")}${transfer.saleDate ? ` · ${esc(formatDate(transfer.saleDate))}` : ""}</small>
        </div>
        <div class="hh-direct-review-grid">
          <div><span>Pedigree</span><strong>${Number(transfer.pedigreeRecordCount || 0)} animal records</strong><small>Subject animal plus available ancestors, up to 3 generations.</small></div>
          <div><span>Genetics</span><strong>${transfer.includesGenetics ? "Included" : "No profile recorded"}</strong><small>Only transferable structured genetics are included.</small></div>
        </div>
        <div class="hh-direct-privacy-note"><strong>Not transferred:</strong> seller financial data, customer records, private notes, health notes, and unrelated records.</div>
        <div class="hh-direct-modal-actions">
          <button type="button" class="button button-ghost" id="hh-direct-decline">Decline</button>
          <button type="button" class="button button-primary" id="hh-direct-accept">Accept & add to my animals</button>
        </div>`);
      host.querySelector("#hh-direct-decline")?.addEventListener("click", () => declineIncoming(transfer.id));
      host.querySelector("#hh-direct-accept")?.addEventListener("click", () => acceptIncoming(transfer.id));
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function acceptIncoming(transferId) {
    const button = document.querySelector("#hh-direct-accept");
    if (button) { button.disabled = true; button.textContent = "Adding animal…"; }
    try {
      const prepared = await api("prepare_accept", { transferId });
      const transfer = prepared?.transfer;
      if (!transfer?.payload) throw new Error("The transfer payload could not be loaded.");
      const current = readState();
      const applied = Core.applyIncomingTransfer(current, transfer.payload, {
        serverTransferId: transfer.id,
        senderDisplayName: transfer.senderDisplayName,
        recipientDisplayName: identity?.displayName || ""
      });
      const synced = await persistState(applied.state);
      if (!synced) {
        throw new Error("The animal is protected on this device, but cloud sync has not completed. The transfer will stay pending until you retry while online.");
      }
      await api("complete_accept", { transferId: transfer.id });
      closeModal();
      toast(applied.alreadyImported ? "Transfer confirmed." : "Animal and pedigree added to your HerdHarbor account.", "success");
      setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      toast(error.message || "The transfer could not be accepted.", "error");
      if (button) { button.disabled = false; button.textContent = "Accept & add to my animals"; }
    }
  }

  async function declineIncoming(transferId) {
    if (!window.confirm("Decline this animal transfer? The seller will see that it was declined.")) return;
    try {
      await api("decline", { transferId });
      closeModal();
      toast("Transfer declined.", "success");
      await refreshTransfers(true);
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function cancelOutgoing(transferId) {
    if (!window.confirm("Cancel this pending direct transfer? The buyer will no longer be able to accept it.")) return;
    try {
      await api("cancel", { transferId });
      toast("Pending transfer cancelled.", "success");
      await refreshTransfers(true);
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function bindGlobalClicks() {
    document.addEventListener("click", (event) => {
      const send = event.target.closest?.("[data-hh-direct-send]");
      if (send) {
        event.preventDefault();
        openSendTransfer(send.dataset.hhDirectSend);
      }
    });
  }

  function observeApp() {
    if (observer || !document.body) return;
    observer = new MutationObserver(() => {
      if (document.querySelector("#view-sales")?.offsetParent) renderSalesEnhancements();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  async function initialize() {
    bindGlobalClicks();
    observeApp();
    try {
      await refreshTransfers(true);
    } catch (error) {
      console.warn("HerdHarbor Direct Transfer inbox is temporarily unavailable:", error);
    }
    renderSalesEnhancements();
    window.addEventListener("focus", () => refreshTransfers(false).catch(() => {}));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refreshTransfers(false).catch(() => {});
    });
  }

  function waitForCloud(attempt = 0) {
    if (window.HerdHarborCloud?.invokeFunction && window.HerdHarborCloud?.getSession?.()?.user?.id) {
      initialize();
      return;
    }
    if (attempt > 120) return;
    setTimeout(() => waitForCloud(attempt + 1), 250);
  }

  window.HerdHarborDirectTransfers = Object.freeze({
    refresh: () => refreshTransfers(true),
    sendSale: openSendTransfer,
    review: openIncomingReview,
    getIdentity: () => identity,
    getInbox: () => inbox.slice(),
    getOutbox: () => outbox.slice()
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => waitForCloud(), { once: true });
  else waitForCloud();
})();
