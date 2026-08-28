(() => {
  "use strict";

  let members = [];
  let selectedMember = null;
  let filters = { search: "", tier: "", role: "", status: "" };
  let requestSequence = 0;

  const esc = (value = "") => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  const titleCase = (value = "") => String(value || "—").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  const formatDate = (value) => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  };

  function canAdminister() {
    return window.HerdHarborMembership?.canAccessAdmin?.() === true;
  }

  function normalizeMember(row = {}) {
    const userId = row.user_id || row.account_id || row.id || "";
    const usage = row.active_animal_count;
    const storedMembershipTier = String(row.membership_tier || "member").toLowerCase();
    const storedMembershipSource = String(row.membership_source || "default").toLowerCase();
    const effective = window.HerdHarborMembership?.resolveProfile?.(row, {}) || {
      tier: storedMembershipTier,
      source: storedMembershipSource,
      overrideExpired: false
    };
    return {
      ...row,
      userId,
      name: row.name || row.display_name || row.full_name || "",
      email: row.email || "",
      accountRole: String(row.account_role || "user").toLowerCase(),
      membershipTier: String(effective.tier || storedMembershipTier).toLowerCase(),
      membershipSource: String(effective.source || storedMembershipSource).toLowerCase(),
      storedMembershipTier,
      storedMembershipSource,
      overrideExpired: effective.overrideExpired === true,
      accountStatus: String(row.account_status || "active").toLowerCase(),
      subscriptionStatus: String(row.subscription_status || "not_configured").toLowerCase(),
      overrideExpiresAt: row.override_expires_at || null,
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
      lastLoginAt: row.last_login_at || row.last_sign_in_at || null,
      activeAnimalCount: usage !== null && usage !== undefined && usage !== "" && Number.isFinite(Number(usage))
        ? Number(usage)
        : null
    };
  }

  function root() { return document.querySelector("#view-admin"); }

  function setStatus(message = "", type = "") {
    const target = root()?.querySelector("#hh-admin-status");
    if (!target) return;
    target.textContent = message;
    target.className = `hh-admin-status${type ? ` ${type}` : ""}`;
  }

  function syncNavigation() {
    const allowed = canAdminister();
    const nav = document.querySelector("[data-route='admin']");
    if (nav) {
      nav.hidden = !allowed;
      nav.setAttribute("aria-hidden", String(!allowed));
    }
    if (!allowed && root()?.classList.contains("active")) {
      document.querySelector("[data-route='dashboard']")?.click();
    }
  }

  function deniedMarkup() {
    return `
      <div class="page-header"><div><p class="eyebrow">Account security</p><h1>Admin</h1><p>This area is available only to authorized HerdHarbor Owner and Admin accounts.</p></div></div>
      <article class="hh-admin-panel"><h2>Access denied</h2><p>Your account cannot open the member directory. Supabase also enforces this permission through Row Level Security.</p></article>`;
  }

  function listMarkup() {
    return `
      <div class="page-header">
        <div><p class="eyebrow">Admin</p><h1>Members</h1><p>Manage account roles and membership access without opening private farm records.</p></div>
        <div class="action-row"><button class="button button-ghost" id="hh-admin-refresh" type="button">Refresh members</button></div>
      </div>
      <section class="hh-admin-panel">
        <div class="hh-admin-filters" aria-label="Member filters">
          <label>Search<input id="hh-admin-search" type="search" maxlength="160" value="${esc(filters.search)}" placeholder="Name, email, or account ID"></label>
          <label>Tier<select id="hh-admin-tier"><option value="">All tiers</option>${["junior", "founder", "member", "business"].map((value) => `<option value="${value}" ${filters.tier === value ? "selected" : ""}>${titleCase(value)}</option>`).join("")}</select></label>
          <label>Role<select id="hh-admin-role"><option value="">All roles</option>${["owner", "admin", "user"].map((value) => `<option value="${value}" ${filters.role === value ? "selected" : ""}>${titleCase(value)}</option>`).join("")}</select></label>
          <label>Status<select id="hh-admin-account-status"><option value="">All statuses</option>${["active", "disabled"].map((value) => `<option value="${value}" ${filters.status === value ? "selected" : ""}>${titleCase(value)}</option>`).join("")}</select></label>
        </div>
        <p class="hh-admin-privacy-note">The directory shows account-administration fields only. It does not grant access to a member's animals, health records, customers, finances, or farm notes.</p>
        <div id="hh-admin-member-list" class="hh-admin-list" aria-live="polite"><div class="hh-admin-empty">Loading member accounts…</div></div>
        <p id="hh-admin-status" class="hh-admin-status" role="status" aria-live="polite"></p>
      </section>`;
  }

  function memberLabel(member) {
    return member.name || member.email || (member.userId ? `Account ${member.userId.slice(0, 8)}` : "HerdHarbor account");
  }

  function renderRows() {
    const list = root()?.querySelector("#hh-admin-member-list");
    if (!list) return;
    if (!members.length) {
      list.innerHTML = `<div class="hh-admin-empty"><strong>No matching accounts</strong><p>Try clearing one of the search filters.</p></div>`;
      return;
    }
    list.innerHTML = members.map((member) => `
      <button type="button" class="hh-admin-member" data-hh-member-id="${esc(member.userId)}">
        <span class="hh-admin-member-primary"><strong>${esc(memberLabel(member))}</strong><small>${esc(member.email || member.userId)}</small></span>
        <span><small>Tier</small>${esc(titleCase(member.membershipTier))}</span>
        <span><small>Role</small>${esc(titleCase(member.accountRole))}</span>
        <span><small>Animals</small>${member.activeAnimalCount === null ? "—" : `${member.activeAnimalCount}${member.membershipTier === "junior" ? "/5" : ""}`}</span>
        <span><small>Status</small>${esc(titleCase(member.accountStatus))}</span>
      </button>`).join("");
    list.querySelectorAll("[data-hh-member-id]").forEach((button) => {
      button.addEventListener("click", () => openMember(button.dataset.hhMemberId));
    });
  }

  async function loadMembers() {
    if (!canAdminister()) return render();
    const sequence = ++requestSequence;
    setStatus("Loading members…");
    try {
      const rows = await window.HerdHarborCloud?.listMembers?.({ ...filters, limit: 250 });
      if (sequence !== requestSequence) return;
      members = (Array.isArray(rows) ? rows : []).map(normalizeMember);
      renderRows();
      setStatus(`${members.length} member account${members.length === 1 ? "" : "s"} shown.`, "success");
    } catch (error) {
      if (sequence !== requestSequence) return;
      members = [];
      renderRows();
      setStatus(error.message || "The member directory could not be loaded.", "error");
    }
  }

  function bindList() {
    root()?.querySelector("#hh-admin-refresh")?.addEventListener("click", loadMembers);
    const applyFilters = () => {
      filters = {
        search: root().querySelector("#hh-admin-search").value.trim(),
        tier: root().querySelector("#hh-admin-tier").value,
        role: root().querySelector("#hh-admin-role").value,
        status: root().querySelector("#hh-admin-account-status").value
      };
      loadMembers();
    };
    let searchTimer = null;
    root()?.querySelector("#hh-admin-search")?.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(applyFilters, 250);
    });
    ["#hh-admin-tier", "#hh-admin-role", "#hh-admin-account-status"].forEach((selector) => {
      root()?.querySelector(selector)?.addEventListener("change", applyFilters);
    });
  }

  function auditMarkup(audit = []) {
    if (!audit.length) return `<div class="hh-admin-empty">No administrative changes are available for this account.</div>`;
    return `<div class="hh-admin-audit">${audit.map((entry) => {
      const action = entry.action || entry.action_type || "Administrative change";
      const previousRole = entry.previous_role || entry.previous_account_role;
      const nextRole = entry.new_role || entry.new_account_role;
      const previousTier = entry.previous_membership || entry.previous_membership_tier;
      const nextTier = entry.new_membership || entry.new_membership_tier;
      const actor = entry.acting_admin_name || entry.acting_admin_email || entry.acting_admin_role
        || entry.actor_name || entry.actor_email || entry.acting_admin_id || entry.actor_user_id || "Authorized administrator";
      const expiration = entry.override_expires_at || entry.new_override_expires_at || entry.expires_at;
      const summary = previousRole || nextRole
        ? `${titleCase(previousRole)} → ${titleCase(nextRole)}`
        : previousTier || nextTier
          ? `${titleCase(previousTier)} → ${titleCase(nextTier)}`
          : "Recorded by the secure admin service";
      return `<article><strong>${esc(titleCase(action))}</strong><p>${esc(summary)}</p><small>${esc(formatDate(entry.created_at || entry.changed_at || entry.timestamp))} · Changed by ${esc(actor)}${expiration ? ` · Expires ${esc(formatDate(expiration))}` : ""}${entry.reason ? ` · ${esc(entry.reason)}` : ""}</small></article>`;
    }).join("")}</div>`;
  }

  function detailMarkup(member, audit = []) {
    const owner = member.accountRole === "owner";
    const usage = member.activeAnimalCount === null
      ? "Not exposed by the current secure account directory"
      : `${member.activeAnimalCount} active animal${member.activeAnimalCount === 1 ? "" : "s"}${member.membershipTier === "junior" ? " of 5" : ""}`;
    return `
      <div class="page-header">
        <div><p class="eyebrow">Admin · Members</p><h1>${esc(memberLabel(member))}</h1><p>${esc(member.email || member.userId)}</p></div>
        <div class="action-row"><button class="button button-ghost" id="hh-admin-back" type="button">Back to members</button></div>
      </div>
      <section class="hh-admin-detail">
        ${owner ? `<div class="hh-admin-owner"><strong>OWNER</strong><span>Protected account</span></div>` : ""}
        <div class="hh-admin-detail-grid">
          <article class="hh-admin-detail-card"><h2>Account</h2><dl>
            <dt>Name</dt><dd>${esc(member.name || "Not available")}</dd>
            <dt>Email</dt><dd>${esc(member.email || "Not exposed by the secure directory")}</dd>
            <dt>Account ID</dt><dd>${esc(member.userId)}</dd>
            <dt>Created</dt><dd>${esc(formatDate(member.createdAt))}</dd>
            <dt>Last login</dt><dd>${esc(formatDate(member.lastLoginAt))}</dd>
            <dt>Status</dt><dd>${esc(titleCase(member.accountStatus))}</dd>
          </dl></article>
          <article class="hh-admin-detail-card"><h2>Membership</h2><dl>
            <dt>Current tier</dt><dd>${esc(titleCase(member.membershipTier))}</dd>
            <dt>Source</dt><dd>${esc(titleCase(member.membershipSource))}</dd>
            <dt>Manual override</dt><dd>${esc(member.storedMembershipSource === "manual_override" ? (member.overrideExpired ? "Expired" : "Active") : "Not set")}</dd>
            <dt>Subscription</dt><dd>${esc(titleCase(member.subscriptionStatus))}</dd>
            <dt>Override expires</dt><dd>${esc(formatDate(member.overrideExpiresAt))}</dd>
            <dt>Active usage</dt><dd>${esc(usage)}</dd>
            <dt>Entitlement</dt><dd>${esc(member.membershipTier === "junior" ? "Core access · 5 active animals" : "Full current access · unlimited animals")}</dd>
          </dl></article>
        </div>
        <article class="hh-admin-detail-card hh-admin-controls"><h2>Administration</h2>
          ${owner ? `<p>The Owner role is protected by Supabase and cannot be assigned, removed, demoted, or disabled here.</p>` : `
            <div class="hh-admin-control-grid">
              <form id="hh-admin-role-form">
                <h3>Account role</h3>
                <label>Role<select id="hh-admin-next-role"><option value="user" ${member.accountRole === "user" ? "selected" : ""}>User</option><option value="admin" ${member.accountRole === "admin" ? "selected" : ""}>Admin</option></select></label>
                <label>Reason (optional)<textarea id="hh-admin-role-reason" maxlength="500" placeholder="Why is this role changing?"></textarea></label>
                <button class="button button-secondary" type="submit">Save account role</button>
              </form>
              <form id="hh-admin-membership-form">
                <h3>Membership override</h3>
                <label>Tier<select id="hh-admin-next-tier">${["junior", "founder", "member", "business"].map((tier) => `<option value="${tier}" ${member.membershipTier === tier ? "selected" : ""}>${titleCase(tier)}</option>`).join("")}</select></label>
                <label>Override<select id="hh-admin-override-mode"><option value="permanent">Permanent</option><option value="until_date">Until date</option><option value="manual">Until manually removed</option></select></label>
                <label id="hh-admin-expiration-label" hidden>Expiration<input id="hh-admin-override-expires" type="datetime-local"></label>
                <label>Reason (optional)<textarea id="hh-admin-membership-reason" maxlength="500" placeholder="Founding tester, complimentary access, or support correction"></textarea></label>
                <div class="action-row"><button class="button button-primary" type="submit">Save membership</button><button class="button button-ghost" id="hh-admin-automatic" type="button">Return to Automatic</button></div>
              </form>
            </div>`}
          <p id="hh-admin-status" class="hh-admin-status" role="status" aria-live="polite"></p>
        </article>
        <article class="hh-admin-detail-card"><h2>Administrative history</h2>${auditMarkup(audit)}</article>
      </section>`;
  }

  async function openMember(userId) {
    if (!canAdminister()) return render();
    const base = members.find((member) => member.userId === userId) || normalizeMember({ user_id: userId });
    root().innerHTML = `<div class="hh-admin-empty">Loading protected account details…</div>`;
    try {
      const detail = await window.HerdHarborCloud?.getMemberDetail?.(userId);
      selectedMember = normalizeMember({ ...base, ...(detail?.member || detail || {}) });
      root().innerHTML = detailMarkup(selectedMember, detail?.audit || []);
      bindDetail();
    } catch (error) {
      root().innerHTML = detailMarkup(base, []);
      bindDetail();
      setStatus(error.message || "Some account details could not be loaded.", "error");
    }
  }

  function bindDetail() {
    root()?.querySelector("#hh-admin-back")?.addEventListener("click", render);
    const mode = root()?.querySelector("#hh-admin-override-mode");
    mode?.addEventListener("change", () => {
      root().querySelector("#hh-admin-expiration-label").hidden = mode.value !== "until_date";
    });
    root()?.querySelector("#hh-admin-role-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const role = root().querySelector("#hh-admin-next-role").value;
      const reason = root().querySelector("#hh-admin-role-reason").value.trim();
      setStatus("Saving account role…");
      try {
        await window.HerdHarborCloud.setMemberRole({ userId: selectedMember.userId, accountRole: role, reason });
        setStatus("Account role saved and audit entry recorded.", "success");
        await loadAndReopen();
      } catch (error) { setStatus(error.message || "The role could not be changed.", "error"); }
    });
    root()?.querySelector("#hh-admin-membership-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const tier = root().querySelector("#hh-admin-next-tier").value;
      const overrideMode = root().querySelector("#hh-admin-override-mode").value;
      const localExpiration = root().querySelector("#hh-admin-override-expires").value;
      if (overrideMode === "until_date" && !localExpiration) return setStatus("Choose an expiration date for this override.", "error");
      const expiresAt = overrideMode === "until_date" ? new Date(localExpiration).toISOString() : null;
      const reason = root().querySelector("#hh-admin-membership-reason").value.trim();
      setStatus("Saving membership override…");
      try {
        await window.HerdHarborCloud.setMemberMembership({ userId: selectedMember.userId, membershipTier: tier, expiresAt, reason });
        setStatus("Membership override saved and audit entry recorded.", "success");
        await loadAndReopen();
      } catch (error) { setStatus(error.message || "The membership could not be changed.", "error"); }
    });
    root()?.querySelector("#hh-admin-automatic")?.addEventListener("click", async () => {
      const reason = root().querySelector("#hh-admin-membership-reason").value.trim();
      if (!window.confirm("Return this account to automatic membership? Until billing launches, Automatic resolves to Member.")) return;
      setStatus("Returning membership to Automatic…");
      try {
        await window.HerdHarborCloud.returnMemberToAutomatic(selectedMember.userId, reason);
        setStatus("Automatic Member access restored and audit entry recorded.", "success");
        await loadAndReopen();
      } catch (error) { setStatus(error.message || "Automatic membership could not be restored.", "error"); }
    });
  }

  async function loadAndReopen() {
    const userId = selectedMember?.userId;
    const rows = await window.HerdHarborCloud.listMembers({});
    members = (Array.isArray(rows) ? rows : []).map(normalizeMember);
    if (userId) await openMember(userId);
  }

  function render() {
    const target = root();
    if (!target) return;
    syncNavigation();
    if (!canAdminister()) {
      target.innerHTML = deniedMarkup();
      return;
    }
    selectedMember = null;
    target.innerHTML = listMarkup();
    bindList();
    loadMembers();
  }

  document.addEventListener("herdharbor:membership-change", syncNavigation);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", syncNavigation, { once: true });
  else syncNavigation();

  window.HerdHarborAdmin = Object.freeze({ render, refresh: loadMembers, normalizeMember, canAccess: canAdminister });
})();
