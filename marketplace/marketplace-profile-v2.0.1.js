(() => {
  "use strict";

  const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
  const ALLOWED_AVATAR_TYPES = new Map([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"]
  ]);

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function speciesText(value) {
    return Array.isArray(value) ? value.join("\n") : "";
  }

  function parseSpecies(text) {
    return [...new Set(
      String(text || "")
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )].slice(0, 40);
  }

  async function signedAvatarUrl(client, path) {
    if (!path) return "";
    const { data, error } = await client.storage
      .from("marketplace-public")
      .createSignedUrl(path, 60 * 60);
    if (error) return "";
    return data?.signedUrl || "";
  }

  async function uploadAvatar(client, userId, file) {
    if (!file) return "";
    const extension = ALLOWED_AVATAR_TYPES.get(file.type);
    if (!extension) throw new Error("Use a JPG, PNG, or WebP image.");
    if (file.size > MAX_AVATAR_BYTES) throw new Error("Avatar/logo must be 5 MB or smaller.");

    const token = globalThis.crypto?.randomUUID?.() || String(Date.now());
    const path = `${userId}/profiles/avatar-${token}.${extension}`;
    const { error } = await client.storage
      .from("marketplace-public")
      .upload(path, file, { cacheControl: "3600", contentType: file.type, upsert: false });
    if (error) throw error;
    return path;
  }

  async function loadEditor(client) {
    const { data, error } = await client.rpc("marketplace_owner_profile_editor");
    if (error) throw error;
    return Array.isArray(data) ? (data[0] || null) : data;
  }

  async function loadPreview(client) {
    const { data, error } = await client.rpc("marketplace_owner_profile_preview");
    if (error) throw error;
    return Array.isArray(data) ? (data[0] || null) : data;
  }

  function renderPreview(host, profile, avatarUrl) {
    if (!profile) {
      host.innerHTML = '<p class="marketplace-muted">Save your seller profile to generate the privacy-safe public preview.</p>';
      return;
    }

    const location = [profile.city, profile.region].filter(Boolean).join(", ");
    const breeds = Array.isArray(profile.species_breeds) ? profile.species_breeds : [];
    const avatar = avatarUrl
      ? `<img class="marketplace-profile-avatar" src="${escapeHtml(avatarUrl)}" alt="">`
      : '<div class="marketplace-profile-avatar marketplace-profile-avatar--empty" aria-hidden="true">HH</div>';

    host.innerHTML = `
      <article class="marketplace-profile-card">
        <div class="marketplace-profile-heading">
          ${avatar}
          <div>
            <p class="marketplace-eyebrow">Public Preview</p>
            <h3>${escapeHtml(profile.rabbitry_name || profile.display_name || "HerdHarbor Seller")}</h3>
            ${profile.rabbitry_name && profile.display_name ? `<p>${escapeHtml(profile.display_name)}</p>` : ""}
          </div>
        </div>
        ${location ? `<p class="marketplace-profile-location">${escapeHtml(location)}</p>` : ""}
        ${profile.about ? `<p class="marketplace-profile-about">${escapeHtml(profile.about)}</p>` : ""}
        ${breeds.length ? `<div class="marketplace-tags">${breeds.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
        <dl class="marketplace-profile-meta">
          <div><dt>Marketplace status</dt><dd>${escapeHtml(profile.marketplace_status || "active")}</dd></div>
          <div><dt>Verification</dt><dd>${escapeHtml(profile.verification_status || "none")}</dd></div>
          <div><dt>Active listings</dt><dd>${Number(profile.active_listing_count || 0)}</dd></div>
        </dl>
      </article>
    `;
  }

  async function mount(container, context) {
    if (!container || context?.role !== "owner" || !context?.client || !context?.userId) return;

    container.innerHTML = `
      <section class="marketplace-profile-grid">
        <form id="marketplace-profile-form" class="marketplace-panel marketplace-profile-form">
          <div class="marketplace-section-heading">
            <div>
              <p class="marketplace-eyebrow">Seller Profile</p>
              <h2>Marketplace profile</h2>
            </div>
            <span class="marketplace-preview-badge marketplace-preview-badge--light">Owner Preview</span>
          </div>
          <p class="marketplace-muted">Only broad public-facing information belongs here. Email, phone, exact address, billing, subscription data, and private herd records are not profile fields.</p>

          <label>Display name
            <input name="display_name" maxlength="100" autocomplete="name">
          </label>
          <label>Rabbitry / farm name
            <input name="rabbitry_name" maxlength="120" autocomplete="organization">
          </label>
          <div class="marketplace-form-row">
            <label>City
              <input name="city" maxlength="100" autocomplete="address-level2">
            </label>
            <label>State / region
              <input name="region" maxlength="100" autocomplete="address-level1">
            </label>
          </div>
          <label>About
            <textarea name="about" maxlength="1200" rows="6"></textarea>
          </label>
          <label>Species / breeds raised
            <textarea name="species_breeds" rows="5" placeholder="One per line or comma-separated"></textarea>
          </label>
          <label>Avatar / logo
            <input name="avatar" type="file" accept="image/jpeg,image/png,image/webp">
            <small>JPG, PNG, or WebP. Maximum 5 MB.</small>
          </label>

          <div class="marketplace-form-actions">
            <button type="submit" class="marketplace-primary-button">Save profile</button>
            <span id="marketplace-profile-status" class="marketplace-muted" role="status"></span>
          </div>
        </form>

        <section class="marketplace-panel">
          <div class="marketplace-section-heading">
            <div>
              <p class="marketplace-eyebrow">Privacy-safe view</p>
              <h2>Public Preview</h2>
            </div>
          </div>
          <div id="marketplace-profile-preview"></div>
        </section>
      </section>
    `;

    const form = container.querySelector("#marketplace-profile-form");
    const status = container.querySelector("#marketplace-profile-status");
    const previewHost = container.querySelector("#marketplace-profile-preview");
    let editor = null;
    let currentAvatarUrl = "";

    async function refresh() {
      const [editorProfile, previewProfile] = await Promise.all([
        loadEditor(context.client),
        loadPreview(context.client)
      ]);
      editor = editorProfile;

      if (editor) {
        form.elements.display_name.value = editor.display_name || "";
        form.elements.rabbitry_name.value = editor.rabbitry_name || "";
        form.elements.city.value = editor.city || "";
        form.elements.region.value = editor.region || "";
        form.elements.about.value = editor.about || "";
        form.elements.species_breeds.value = speciesText(editor.species_breeds);
        currentAvatarUrl = await signedAvatarUrl(context.client, editor.avatar_path || "");
      } else {
        currentAvatarUrl = "";
      }

      renderPreview(previewHost, previewProfile, currentAvatarUrl);
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      status.textContent = "Saving…";
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;

      let uploadedPath = "";
      try {
        const file = form.elements.avatar.files?.[0] || null;
        uploadedPath = file
          ? await uploadAvatar(context.client, context.userId, file)
          : (editor?.avatar_path || "");

        const { error } = await context.client.rpc("marketplace_owner_save_profile", {
          display_name_value: form.elements.display_name.value,
          rabbitry_name_value: form.elements.rabbitry_name.value,
          avatar_path_value: uploadedPath,
          city_value: form.elements.city.value,
          region_value: form.elements.region.value,
          about_value: form.elements.about.value,
          species_breeds_value: parseSpecies(form.elements.species_breeds.value)
        });
        if (error) throw error;

        const priorAvatar = editor?.avatar_path || "";
        form.elements.avatar.value = "";
        await refresh();

        if (priorAvatar && uploadedPath && priorAvatar !== uploadedPath) {
          context.client.storage.from("marketplace-public").remove([priorAvatar]).catch(() => {});
        }

        status.textContent = "Profile saved.";
      } catch (error) {
        console.error("Marketplace profile save failed:", error);
        if (uploadedPath && uploadedPath !== (editor?.avatar_path || "")) {
          context.client.storage.from("marketplace-public").remove([uploadedPath]).catch(() => {});
        }
        status.textContent = error?.message || "Profile could not be saved.";
      } finally {
        submit.disabled = false;
      }
    });

    try {
      await refresh();
    } catch (error) {
      console.error("Marketplace profile load failed:", error);
      status.textContent = "Profile could not be loaded.";
      renderPreview(previewHost, null, "");
    }
  }

  window.HerdHarborMarketplaceProfile = Object.freeze({ mount });
})();
