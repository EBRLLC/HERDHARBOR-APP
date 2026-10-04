(() => {
  "use strict";

  const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
  const MAX_PHOTOS = 6;
  const ALLOWED_IMAGE_TYPES = new Map([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"]
  ]);

  const moneyToCents = (value) => {
    const cleaned = String(value || "").trim();
    if (!cleaned) return null;
    const amount = Number(cleaned);
    return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
  };

  const centsToMoney = (value) => {
    if (value === null || value === undefined || value === "") return "";
    return (Number(value) / 100).toFixed(2);
  };

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  async function rpc(client, name, args = undefined) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data;
  }

  async function signedUrls(client, paths) {
    const safe = Array.isArray(paths) ? paths.filter(Boolean).slice(0, MAX_PHOTOS) : [];
    return Promise.all(safe.map(async (path) => {
      const { data, error } = await client.storage.from("marketplace-public").createSignedUrl(path, 3600);
      return error ? "" : (data?.signedUrl || "");
    }));
  }

  async function uploadPhotos(client, userId, listingId, files) {
    const paths = [];
    for (const [index, file] of files.slice(0, MAX_PHOTOS).entries()) {
      const extension = ALLOWED_IMAGE_TYPES.get(file.type);
      if (!extension) throw new Error("Listing photos must be JPG, PNG, or WebP.");
      if (file.size > MAX_PHOTO_BYTES) throw new Error("Each listing photo must be 8 MB or smaller.");
      const token = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${index}`;
      const path = `${userId}/listings/${listingId}/photo-${index}-${token}.${extension}`;
      const { error } = await client.storage.from("marketplace-public").upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false
      });
      if (error) throw error;
      paths.push(path);
    }
    return paths;
  }

  function listingCard(listing, photoUrl) {
    const location = [listing.location_city, listing.location_region].filter(Boolean).join(", ");
    const price = listing.price_cents == null ? "Price not listed" : new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: listing.currency || "USD",
      maximumFractionDigits: 2
    }).format(Number(listing.price_cents) / 100);
    return `
      <article class="marketplace-listing-card" data-listing-id="${esc(listing.id)}">
        <div class="marketplace-listing-photo">
          ${photoUrl ? `<img src="${esc(photoUrl)}" alt="">` : '<div class="marketplace-listing-photo-empty">HH</div>'}
          <span class="marketplace-state-pill">${esc(listing.state || "draft")}</span>
        </div>
        <div class="marketplace-listing-copy">
          <p class="marketplace-eyebrow">${esc(listing.listing_kind || "individual")}</p>
          <h3>${esc(listing.animal_name || "Unnamed listing")}</h3>
          <p class="marketplace-card-meta">${esc([listing.breed, listing.variety_color, listing.sex].filter(Boolean).join(" · ") || listing.species || "Animal")}</p>
          <p class="marketplace-card-meta">${esc(location || "Location not set")}</p>
          <div class="marketplace-card-footer">
            <strong>${esc(price)}</strong>
            <button type="button" class="marketplace-secondary-button" data-edit-listing="${esc(listing.id)}">Edit</button>
          </div>
        </div>
      </article>
    `;
  }

  async function mount(container, context) {
    if (!container || context?.role !== "owner" || !context?.client || !context?.userId) return;

    container.innerHTML = `
      <section class="marketplace-section-heading marketplace-listing-heading">
        <div>
          <p class="marketplace-eyebrow">Owner Preview</p>
          <h2>Listings</h2>
          <p class="marketplace-muted">Create a listing manually or prefill it from an animal already in HerdHarbor. Saving a Marketplace listing creates a detached snapshot; deleting it cannot delete the source animal.</p>
        </div>
        <div class="marketplace-listing-actions">
          <button type="button" class="marketplace-secondary-button" id="marketplace-create-manual">Create Manual Listing</button>
          <button type="button" class="marketplace-primary-button" id="marketplace-select-herd">Select From My Herd</button>
        </div>
      </section>
      <section id="marketplace-listing-editor" class="marketplace-panel" hidden></section>
      <section id="marketplace-listing-grid" class="marketplace-listing-grid" aria-live="polite"></section>
    `;

    const editor = container.querySelector("#marketplace-listing-editor");
    const grid = container.querySelector("#marketplace-listing-grid");
    let listings = [];
    let herdAnimals = [];

    async function loadListings() {
      listings = await rpc(context.client, "marketplace_owner_listings") || [];
      const cards = await Promise.all(listings.map(async (listing) => {
        const urls = await signedUrls(context.client, listing.photo_paths);
        return listingCard(listing, urls[0] || "");
      }));
      grid.innerHTML = cards.length ? cards.join("") : '<section class="marketplace-panel"><p class="marketplace-muted">No Marketplace listings yet.</p></section>';
      grid.querySelectorAll("[data-edit-listing]").forEach((button) => {
        button.addEventListener("click", () => {
          const listing = listings.find((item) => String(item.id) === button.dataset.editListing);
          openEditor(listing || null, null);
        });
      });
    }

    async function ensureHerdAnimals() {
      if (herdAnimals.length) return herdAnimals;
      herdAnimals = await rpc(context.client, "marketplace_owner_herd_animals") || [];
      return herdAnimals;
    }

    function renderHerdPicker(animals) {
      editor.hidden = false;
      editor.innerHTML = `
        <div class="marketplace-section-heading">
          <div><p class="marketplace-eyebrow">Select From My Herd</p><h2>Choose an animal</h2></div>
          <button type="button" class="marketplace-link-button" data-close-listing-editor>Close</button>
        </div>
        <label class="marketplace-picker-search">Search my herd
          <input type="search" id="marketplace-herd-search" placeholder="Name, breed, color, status">
        </label>
        <div id="marketplace-herd-picker" class="marketplace-herd-picker"></div>
      `;

      const picker = editor.querySelector("#marketplace-herd-picker");
      const search = editor.querySelector("#marketplace-herd-search");
      const draw = () => {
        const q = String(search.value || "").trim().toLowerCase();
        const filtered = animals.filter((animal) => !q || [
          animal.animal_name, animal.species, animal.breed, animal.sex,
          animal.variety_color, animal.herd_status
        ].some((value) => String(value || "").toLowerCase().includes(q)));
        picker.innerHTML = filtered.length ? filtered.map((animal) => `
          <button type="button" class="marketplace-herd-option" data-source-animal="${esc(animal.source_animal_id)}">
            <strong>${esc(animal.animal_name || "Unnamed animal")}</strong>
            <span>${esc([animal.breed, animal.variety_color, animal.sex, animal.herd_status].filter(Boolean).join(" · ") || animal.species || "Animal")}</span>
          </button>
        `).join("") : '<p class="marketplace-muted">No matching eligible animals.</p>';

        picker.querySelectorAll("[data-source-animal]").forEach((button) => {
          button.addEventListener("click", () => {
            const animal = animals.find((item) => String(item.source_animal_id) === button.dataset.sourceAnimal);
            openEditor(null, animal || null);
          });
        });
      };
      search.addEventListener("input", draw);
      editor.querySelector("[data-close-listing-editor]").addEventListener("click", () => { editor.hidden = true; });
      draw();
      editor.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function openEditor(listing = null, sourceAnimal = null) {
      const sourceId = listing?.source_animal_id || sourceAnimal?.source_animal_id || "";
      const listingId = listing?.id || "";
      const asking = listing ? centsToMoney(listing.price_cents) : String(sourceAnimal?.asking_price || "");
      editor.hidden = false;
      editor.innerHTML = `
        <form id="marketplace-listing-form" class="marketplace-profile-form">
          <div class="marketplace-section-heading">
            <div>
              <p class="marketplace-eyebrow">${sourceId ? "Herd Snapshot" : "Manual Listing"}</p>
              <h2>${listingId ? "Edit listing" : "Create listing"}</h2>
            </div>
            <button type="button" class="marketplace-link-button" data-close-listing-editor>Close</button>
          </div>
          <input type="hidden" name="listing_id" value="${esc(listingId)}">
          <input type="hidden" name="source_animal_id" value="${esc(sourceId)}">

          <div class="marketplace-form-row">
            <label>Listing type
              <select name="listing_kind">
                ${["individual","future_offspring","litter_announcement"].map((value) => `<option value="${value}" ${(listing?.listing_kind || "individual") === value ? "selected" : ""}>${value.replaceAll("_"," ")}</option>`).join("")}
              </select>
            </label>
            <label>Marketplace status
              <select name="state">
                ${["draft","available","pending","sold","archived"].map((value) => `<option value="${value}" ${(listing?.state || "draft") === value ? "selected" : ""}>${value}</option>`).join("")}
              </select>
            </label>
          </div>

          <div class="marketplace-form-row">
            <label>Animal name
              <input name="animal_name" maxlength="120" required value="${esc(listing?.animal_name || sourceAnimal?.animal_name || "")}">
            </label>
            <label>Species
              <input name="species" maxlength="80" value="${esc(listing?.species || sourceAnimal?.species || "Rabbit")}">
            </label>
          </div>
          <div class="marketplace-form-row">
            <label>Breed
              <input name="breed" maxlength="120" value="${esc(listing?.breed || sourceAnimal?.breed || "")}">
            </label>
            <label>Sex
              <input name="sex" maxlength="32" value="${esc(listing?.sex || sourceAnimal?.sex || "")}">
            </label>
          </div>
          <div class="marketplace-form-row">
            <label>Date of birth
              <input name="dob" type="date" value="${esc(listing?.dob || sourceAnimal?.dob || "")}">
            </label>
            <label>Color / variety
              <input name="variety_color" maxlength="120" value="${esc(listing?.variety_color || sourceAnimal?.variety_color || "")}">
            </label>
          </div>
          <div class="marketplace-form-row">
            <label>Price
              <input name="price" type="number" min="0" step="0.01" value="${esc(asking)}">
            </label>
            <label>Available from
              <input name="available_from" type="date" value="${esc(listing?.available_from || "")}">
            </label>
          </div>
          <div class="marketplace-form-row">
            <label>City
              <input name="location_city" maxlength="100" value="${esc(listing?.location_city || "")}">
            </label>
            <label>State / region
              <input name="location_region" maxlength="100" value="${esc(listing?.location_region || "")}">
            </label>
          </div>
          <div class="marketplace-form-row">
            <label>Pedigree
              <select name="pedigree_status">
                ${["","none","partial","full"].map((value) => `<option value="${value}" ${(listing?.pedigree_status || "") === value ? "selected" : ""}>${value || "Not specified"}</option>`).join("")}
              </select>
            </label>
            <label>Registration
              <select name="registration_status">
                ${["","none","eligible","registered"].map((value) => `<option value="${value}" ${(listing?.registration_status || "") === value ? "selected" : ""}>${value || "Not specified"}</option>`).join("")}
              </select>
            </label>
          </div>
          <label>Description
            <textarea name="description" maxlength="4000" rows="7">${esc(listing?.description || "")}</textarea>
          </label>
          <label>Photos
            <input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple>
            <small>Up to six JPG, PNG, or WebP photos. Maximum 8 MB each.</small>
          </label>

          <div class="marketplace-form-actions">
            <button type="submit" class="marketplace-primary-button">${listingId ? "Save changes" : "Create listing"}</button>
            ${listingId ? '<button type="button" class="marketplace-danger-button" data-delete-listing>Delete listing</button>' : ""}
            <span id="marketplace-listing-status" class="marketplace-muted" role="status"></span>
          </div>
        </form>
      `;

      const form = editor.querySelector("#marketplace-listing-form");
      const status = editor.querySelector("#marketplace-listing-status");
      editor.querySelector("[data-close-listing-editor]").addEventListener("click", () => { editor.hidden = true; });

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submit = form.querySelector('button[type="submit"]');
        submit.disabled = true;
        status.textContent = "Saving…";
        let uploadedPaths = [];
        try {
          const id = form.elements.listing_id.value || null;
          const savedId = await rpc(context.client, "marketplace_owner_save_listing", {
            listing_id_value: id,
            source_animal_id_value: form.elements.source_animal_id.value || null,
            state_value: form.elements.state.value,
            animal_name_value: form.elements.animal_name.value,
            species_value: form.elements.species.value,
            breed_value: form.elements.breed.value,
            sex_value: form.elements.sex.value,
            dob_value: form.elements.dob.value || null,
            variety_color_value: form.elements.variety_color.value,
            price_cents_value: moneyToCents(form.elements.price.value),
            currency_value: "USD",
            location_city_value: form.elements.location_city.value,
            location_region_value: form.elements.location_region.value,
            description_value: form.elements.description.value,
            pedigree_status_value: form.elements.pedigree_status.value,
            registration_status_value: form.elements.registration_status.value,
            pedigree_visibility_value: "hidden",
            listing_kind_value: form.elements.listing_kind.value,
            available_from_value: form.elements.available_from.value || null
          });

          const files = [...(form.elements.photos.files || [])].slice(0, MAX_PHOTOS);
          if (files.length) {
            uploadedPaths = await uploadPhotos(context.client, context.userId, savedId, files);
            await rpc(context.client, "marketplace_owner_set_listing_photos", {
              listing_id_value: savedId,
              paths_value: uploadedPaths
            });
          }

          status.textContent = "Listing saved.";
          editor.hidden = true;
          await loadListings();
        } catch (error) {
          console.error("Marketplace listing save failed:", error);
          if (uploadedPaths.length) {
            context.client.storage.from("marketplace-public").remove(uploadedPaths).catch(() => {});
          }
          status.textContent = error?.message || "Listing could not be saved.";
        } finally {
          submit.disabled = false;
        }
      });

      editor.querySelector("[data-delete-listing]")?.addEventListener("click", async () => {
        if (!confirm("Delete this Marketplace listing? The source HerdHarbor animal will not be changed.")) return;
        status.textContent = "Deleting…";
        try {
          await rpc(context.client, "marketplace_owner_delete_listing", { listing_id_value: listingId });
          const paths = Array.isArray(listing?.photo_paths) ? listing.photo_paths : [];
          if (paths.length) context.client.storage.from("marketplace-public").remove(paths).catch(() => {});
          editor.hidden = true;
          await loadListings();
        } catch (error) {
          console.error("Marketplace listing delete failed:", error);
          status.textContent = error?.message || "Listing could not be deleted.";
        }
      });

      editor.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    container.querySelector("#marketplace-create-manual").addEventListener("click", () => openEditor(null, null));
    container.querySelector("#marketplace-select-herd").addEventListener("click", async () => {
      editor.hidden = false;
      editor.innerHTML = '<p class="marketplace-muted">Loading eligible animals…</p>';
      try {
        renderHerdPicker(await ensureHerdAnimals());
      } catch (error) {
        console.error("Marketplace herd picker failed:", error);
        editor.innerHTML = '<p class="marketplace-muted">Eligible herd animals could not be loaded.</p>';
      }
    });

    await loadListings();
  }

  window.HerdHarborMarketplaceListings = Object.freeze({ mount });
})();
