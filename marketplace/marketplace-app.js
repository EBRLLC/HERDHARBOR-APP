(() => {
  "use strict";

  const SUPABASE_URL = "https://okynebbksifqppwicghj.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_jxsX6uS9nnh2FOFtlSF9TA_8v6C7C09";

  const market = window.HerdHarborMarketplace;
  if (!window.supabase?.createClient || !market) {
    document.querySelector("#market-status").textContent = "Marketplace could not start. Reload the page and try again.";
    return;
  }

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const gateway = market.createGateway(client);

  const form = document.querySelector("#market-search");
  const grid = document.querySelector("#market-grid");
  const status = document.querySelector("#market-status");
  const count = document.querySelector("#market-result-count");
  const dialog = document.querySelector("#market-detail-dialog");
  const detail = document.querySelector("#market-detail");
  const toastNode = document.querySelector("#market-toast");
  const sessionNode = document.querySelector("#market-session");
  let session = null;
  let toastTimer = null;

  function esc(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function money(cents, currency) {
    if (cents === null || cents === undefined || cents === "") return "Contact seller";
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(Number(cents) / 100);
    } catch {
      return "$" + (Number(cents) / 100).toFixed(2);
    }
  }

  function toast(message, type) {
    clearTimeout(toastTimer);
    toastNode.textContent = message || "";
    toastNode.className = "market-toast show" + (type === "error" ? " error" : "");
    toastTimer = setTimeout(() => { toastNode.className = "market-toast"; }, 3600);
  }

  function photoUrl(path) {
    try { return path ? market.publicMediaUrl(path, gateway) : ""; }
    catch { return ""; }
  }

  function card(row) {
    const photo = photoUrl(row.primary_photo_path);
    const meta = [row.species, row.breed, row.sex, row.variety_color].filter(Boolean).join(" · ");
    const location = [row.location_city, row.location_region].filter(Boolean).join(", ");
    return '<article class="market-card">' +
      '<div class="market-card-media">' +
        (photo ? '<img src="' + esc(photo) + '" alt="">' : '<div class="market-card-placeholder">HH</div>') +
        '<span class="market-card-badge">' + esc(row.state || "available") + '</span>' +
      '</div>' +
      '<div class="market-card-body">' +
        '<h3>' + esc(row.animal_name || "Unnamed animal") + '</h3>' +
        '<p class="market-card-meta">' + esc(meta || "Details available in listing") + '</p>' +
        '<strong class="market-card-price">' + esc(money(row.price_cents, row.currency)) + '</strong>' +
        '<p class="market-card-location">' + esc(location || "Location not listed") + '</p>' +
        '<button type="button" class="market-button-secondary" data-listing="' + esc(row.listing_id) + '">View listing</button>' +
      '</div>' +
    '</article>';
  }

  async function refreshSession() {
    const result = await client.auth.getSession();
    session = result?.data?.session || null;
    sessionNode.textContent = session ? "HerdHarbor account connected" : "Public browsing";
  }

  async function runSearch() {
    const data = Object.fromEntries(new FormData(form));
    status.hidden = false;
    status.textContent = "Searching Marketplace…";
    grid.innerHTML = "";
    count.textContent = "";
    try {
      const rows = await market.searchListings({
        search: data.search,
        species: data.species,
        breed: data.breed,
        region: data.region,
        minPriceCents: data.minPrice === "" ? null : Math.round(Number(data.minPrice) * 100),
        maxPriceCents: data.maxPrice === "" ? null : Math.round(Number(data.maxPrice) * 100),
        limit: 48
      }, gateway);
      status.hidden = rows.length > 0;
      status.textContent = rows.length ? "" : "No listings matched those filters.";
      count.textContent = rows.length === 1 ? "1 listing" : rows.length + " listings";
      grid.innerHTML = rows.map(card).join("");
    } catch (error) {
      status.hidden = false;
      status.textContent = "Marketplace listings could not be loaded.";
      toast(error?.message || "Marketplace search failed.", "error");
    }
  }

  function fact(label, value) {
    return '<div class="market-fact"><span>' + esc(label) + '</span><strong>' + esc(value || "Not listed") + '</strong></div>';
  }

  async function openListing(listingId) {
    detail.innerHTML = '<div class="market-detail-shell"><div class="market-status">Loading listing…</div></div>';
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");

    try {
      const row = await market.getListingDetails(listingId, gateway);
      if (!row) throw new Error("Listing is unavailable.");

      const [extension, agreement, pedigree, seller, trust, feedback] = await Promise.all([
        market.getListingExtension(row.listing_id, gateway).catch(() => null),
        market.getPublicAgreement(row.listing_id, gateway).catch(() => null),
        market.getPublicListingPedigree(row.listing_id, gateway).catch(() => null),
        market.getPublicSellerProfile(row.seller_public_id, gateway).catch(() => null),
        market.trustIndicators(row.seller_public_id, gateway).catch(() => null),
        market.sellerFeedbackSummary(row.seller_public_id, gateway).catch(() => null)
      ]);

      const photos = (row.photo_paths || []).map(photoUrl).filter(Boolean);
      const sellerName = row.seller_rabbitry_name || row.seller_display_name || seller?.rabbitry_name || seller?.display_name || "HerdHarbor member";
      const sellerLocation = [row.seller_city || seller?.city, row.seller_region || seller?.region].filter(Boolean).join(", ");
      const rating = Number(feedback?.average_rating || feedback?.average || 0);
      const ratingCount = Number(feedback?.review_count || feedback?.count || 0);
      const pedigreeHtml = pedigree ? market.renderPublicPedigree(pedigree) : "";
      const availability = extension?.available_from ? new Date(extension.available_from + "T00:00:00").toLocaleDateString() : "Now / not specified";

      detail.innerHTML = '<div class="market-detail-shell">' +
        (photos.length ? '<div class="market-detail-gallery">' + photos.map(url => '<img src="' + esc(url) + '" alt="">').join("") + '</div>' : '') +
        '<div class="market-detail-top"><div><p class="market-eyebrow">HerdHarbor listing</p><h2>' + esc(row.animal_name || "Unnamed animal") + '</h2></div><strong class="market-detail-price">' + esc(money(row.price_cents, row.currency)) + '</strong></div>' +
        '<p class="market-detail-description">' + esc(row.description || "No description provided.") + '</p>' +
        '<div class="market-detail-facts">' +
          fact("Species", row.species) +
          fact("Breed", row.breed) +
          fact("Sex", row.sex) +
          fact("Color / variety", row.variety_color) +
          fact("Pedigree", row.pedigree_status) +
          fact("Registration", row.registration_status) +
          fact("Available", availability) +
          fact("Location", [row.location_city, row.location_region].filter(Boolean).join(", ")) +
        '</div>' +
        '<section class="market-detail-section"><h3>Seller</h3><div class="market-seller"><strong>' + esc(sellerName) + '</strong><span>' + esc(sellerLocation || "Location not listed") + '</span>' +
          (seller?.about ? '<p>' + esc(seller.about) + '</p>' : '') +
          (ratingCount ? '<small>' + esc(rating.toFixed(1)) + ' / 5 from ' + esc(ratingCount) + ' verified review' + (ratingCount === 1 ? '' : 's') + '</small>' : '<small>No verified seller reviews yet.</small>') +
          (trust?.marketplace_member_since ? '<small>Marketplace member since ' + esc(new Date(trust.marketplace_member_since).toLocaleDateString()) + '</small>' : '') +
        '</div></section>' +
        (pedigreeHtml ? '<section class="market-detail-section"><h3>Public pedigree</h3><div class="hh-market-pedigree-panel">' + pedigreeHtml + '</div></section>' : '') +
        (agreement ? '<section class="market-detail-section"><h3>' + esc(agreement.title || "Public agreement") + '</h3><div class="market-agreement">' + esc(agreement.body || "") + '</div></section>' : '') +
        '<section class="market-detail-actions">' +
          '<button type="button" class="market-button-secondary" id="market-save-listing">Save listing</button>' +
          '<button type="button" class="market-button" id="market-message-seller">Message seller</button>' +
          '<a class="market-button-secondary" href="../?route=marketplace" target="_blank" rel="noopener">Sell / manage listings</a>' +
        '</section>' +
        '<div id="market-message-host"></div>' +
      '</div>';

      detail.querySelector("#market-save-listing")?.addEventListener("click", async () => {
        if (!session) return toast("Open HerdHarbor and sign in before saving listings.", "error");
        try { await market.saveListing(row.listing_id, gateway); toast("Listing saved."); }
        catch (error) { toast(error?.message || "Listing could not be saved.", "error"); }
      });

      detail.querySelector("#market-message-seller")?.addEventListener("click", async () => {
        if (!session) return toast("Open HerdHarbor and sign in before messaging a seller.", "error");
        try {
          const conversationId = await market.openListingConversation(row.listing_id, gateway);
          const host = detail.querySelector("#market-message-host");
          await market.renderInbox(host, gateway, toast, conversationId);
          host.scrollIntoView?.({ behavior: "smooth", block: "start" });
        } catch (error) {
          toast(error?.message || "Conversation could not be opened.", "error");
        }
      });

      const url = new URL(window.location.href);
      url.searchParams.set("listing", row.listing_id);
      history.replaceState(null, "", url);
    } catch (error) {
      detail.innerHTML = '<div class="market-detail-shell"><div class="market-status">This listing could not be loaded.</div></div>';
      toast(error?.message || "Listing could not be loaded.", "error");
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void runSearch();
  });
  form.addEventListener("reset", () => setTimeout(() => void runSearch(), 0));

  grid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-listing]");
    if (button) void openListing(button.dataset.listing);
  });

  document.querySelector("#market-dialog-close")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    detail.innerHTML = "";
    const url = new URL(window.location.href);
    url.searchParams.delete("listing");
    history.replaceState(null, "", url);
  });

  client.auth.onAuthStateChange((_event, nextSession) => {
    session = nextSession || null;
    sessionNode.textContent = session ? "HerdHarbor account connected" : "Public browsing";
  });

  void refreshSession().then(async () => {
    await runSearch();
    const listing = new URL(window.location.href).searchParams.get("listing");
    if (listing) await openListing(listing);
  });
})();
