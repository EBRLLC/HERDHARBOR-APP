(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborAnimalProfileRuntime = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const VERSION = "1.8.3";
  const DEFAULT_VIEW = Object.freeze({
    search: "",
    species: "",
    sex: "",
    status: "Active"
  });

  function create(deps = {}) {
    const required = [
      "getState", "getCurrentRoute", "scheduleUiWork", "$", "$$", "esc", "headerHtml",
      "emptyState", "animalVisualHtml", "ageText", "openPedigreeImport", "openModal",
      "closeModal", "field", "selectField", "breedComboboxField", "selectAnimalField",
      "textareaField", "speciesIcon", "breedOptionsFor", "prepareProfileImage", "toast",
      "allowsAnimalTransition", "uid", "rememberBreed", "recordActivity", "saveState",
      "renderCurrentView", "completeWorkflowTasks", "formatDate", "formatMoney",
      "detailField", "navigate", "openPrintPedigreeForm", "ensureQrToolsReady"
    ];
    for (const name of required) {
      if (typeof deps[name] !== "function") throw new Error(`Animal/Profile runtime requires ${name}().`);
    }

    const $ = deps.$;
    const $$ = deps.$$;
    const esc = deps.esc;
    const animalView = { ...DEFAULT_VIEW };
    let qrToolActionPending = false;

    const stateNow = () => deps.getState() || {};
    const animalsNow = () => Array.isArray(stateNow().animals) ? stateNow().animals : [];

    function filterAnimals(animals = animalsNow(), view = animalView) {
      const query = String(view.search || "").toLowerCase();
      const species = String(view.species || "");
      const sex = String(view.sex || "");
      const status = String(view.status || "");
      return (Array.isArray(animals) ? animals : []).filter((animal) => {
        const haystack = [
          animal?.name, animal?.tag, animal?.earTagNumber, animal?.earTagColor,
          animal?.registrationNumber, animal?.tattoo, animal?.breeder, animal?.breed,
          animal?.location, animal?.color
        ].join(" ").toLowerCase();
        return (!query || haystack.includes(query))
          && (!species || animal?.species === species)
          && (!sex || animal?.sex === sex)
          && (!status || animal?.status === status);
      });
    }

    function renderAnimals() {
      const state = stateNow();
      const view = $("#view-animals");
      if (!view) return false;
      view.innerHTML = `
        ${deps.headerHtml(
          "Animals",
          "Keep identity, lineage, location, status, and notes connected to each animal.",
          `<button class="button button-ghost" id="import-pedigree-from-animals">Import pedigree</button>
           <button class="button button-ghost" id="print-animal-qr-cards">Print QR cards</button>
           <button class="button button-primary" id="add-animal">+ Add animal</button>`
        )}
        <div class="toolbar">
          <input id="animal-search" type="search" value="${esc(animalView.search)}" placeholder="Search name, tag, registration, breeder, breed, or location">
          <select id="animal-species"><option value="">All species</option>${(state.settings?.species || []).map((species) => `<option ${species === animalView.species ? "selected" : ""}>${esc(species)}</option>`).join("")}</select>
          <select id="animal-sex"><option value="">Any sex</option>${["Female", "Male", "Unknown"].map((sex) => `<option ${sex === animalView.sex ? "selected" : ""}>${sex}</option>`).join("")}</select>
          <select id="animal-status"><option value="">Any status</option>${["Active", "Breeding", "Growing", "Retired", "For Sale", "Reserved", "Sold", "Deceased", "Archived", "Ancestor Only"].map((status) => `<option ${status === animalView.status ? "selected" : ""}>${status}</option>`).join("")}</select>
        </div>
        <div id="animal-results"></div>`;

      $("#add-animal")?.addEventListener("click", () => openAnimalForm());
      $("#import-pedigree-from-animals")?.addEventListener("click", () => deps.openPedigreeImport());
      $("#print-animal-qr-cards")?.addEventListener("click", (event) => openAnimalQrCardForm("", event.currentTarget));
      $("#animal-search")?.addEventListener("input", (event) => {
        animalView.search = event.currentTarget.value;
        deps.scheduleUiWork("animal-search", () => {
          if (deps.getCurrentRoute() === "animals") renderAnimalResults();
        });
      });
      [["animal-species", "species"], ["animal-sex", "sex"], ["animal-status", "status"]].forEach(([id, fieldName]) => {
        $(`#${id}`)?.addEventListener("change", (event) => {
          animalView[fieldName] = event.currentTarget.value;
          renderAnimalResults();
        });
      });
      renderAnimalResults();
      return true;
    }

    function renderAnimalResults() {
      const container = $("#animal-results");
      if (!container) return false;
      const animals = filterAnimals();

      container.innerHTML = animals.length
        ? `<div class="cards-grid">${animals.map(animalCardHtml).join("")}</div>`
        : deps.emptyState("No matching animals.", "Add a new animal or change the filters.");

      $$("[data-view-animal]", container).forEach((button) => button.addEventListener("click", () => openAnimalDetail(button.dataset.viewAnimal)));
      $$("[data-edit-animal]", container).forEach((button) => button.addEventListener("click", () => openAnimalForm(button.dataset.editAnimal)));
      return true;
    }

    function animalCardHtml(animal) {
      return `<article class="animal-card">
        <div class="animal-card-top">
          <div class="animal-avatar ${animal.photoData ? "has-photo" : ""}">${deps.animalVisualHtml(animal, true)}</div>
          <span class="badge ${["Active", "Breeding", "Growing"].includes(animal.status) ? "green" : ["For Sale", "Reserved"].includes(animal.status) ? "warning" : "gray"}">${esc(animal.status || "Active")}</span>
        </div>
        <h3>${esc(animal.name || "Unnamed animal")}</h3>
        <div class="meta">${esc([animal.earTagNumber ? `Ear tag ${animal.earTagNumber}` : animal.tag, animal.earTagColor, animal.breed, animal.sex].filter(Boolean).join(" · "))}</div>
        <div class="meta">${esc(deps.ageText(animal.dob))}${animal.location ? ` · ${esc(animal.location)}` : ""}</div>
        <div class="animal-card-footer">
          <button class="button button-ghost button-small" data-view-animal="${animal.id}">View</button>
          <button class="button button-ghost button-small" data-edit-animal="${animal.id}">Edit</button>
        </div>
      </article>`;
    }

    function openAnimalForm(id = "") {
      const state = stateNow();
      const animal = (state.animals || []).find((record) => record.id === id) || {};
      let pendingPhotoData = animal.photoData || "";
      let pendingPhotoFileName = animal.photoFileName || "";

      deps.openModal(id ? "Edit animal" : "Add animal", `
        <form id="animal-form">
          <div class="photo-upload-card">
            <div class="photo-preview" id="animal-photo-preview">
              ${pendingPhotoData ? `<img src="${pendingPhotoData}" alt="${esc(animal.name || "Animal")} photo">` : `<span>${deps.speciesIcon(animal.species || "Rabbit")}</span>`}
            </div>
            <div class="photo-upload-copy">
              <strong>Animal photo</strong>
              <p>Upload a JPG, PNG, or WebP photo for this animal. HerdHarbor creates a small compressed profile image for cards and pedigrees. Leave it blank to use the default species icon.</p>
              <div class="photo-upload-actions">
                <label class="button button-primary button-small" for="animal-photo-file">${pendingPhotoData ? "Replace photo" : "Upload photo"}</label>
                <input id="animal-photo-file" class="hidden" type="file" accept="image/jpeg,image/png,image/webp">
                <button type="button" class="button button-ghost button-small" id="use-default-animal-photo" ${pendingPhotoData ? "" : "disabled"}>Use default icon</button>
              </div>
              <div class="brand-file-note" id="animal-photo-status">${pendingPhotoFileName ? esc(pendingPhotoFileName) : "No custom photo selected."}</div>
            </div>
          </div>

          <div class="form-grid two">
            ${deps.field("Name", "name", animal.name, true)}
            ${deps.field("ID or tag", "tag", animal.tag)}
            ${deps.field("Tattoo / ear number", "tattoo", animal.tattoo)}
            ${deps.field("Registration number", "registrationNumber", animal.registrationNumber)}
            ${deps.field("Breeder name", "breeder", animal.breeder)}
            ${deps.selectField("Species", "species", state.settings?.species || [], animal.species || "Rabbit", true)}
            <label class="cattle-ear-field ${String(animal.species || "Rabbit").toLowerCase() === "cattle" ? "" : "hidden"}" ${String(animal.species || "Rabbit").toLowerCase() === "cattle" ? "" : "hidden"}>Ear tag number<input name="earTagNumber" value="${esc(animal.earTagNumber || "")}" ${String(animal.species || "Rabbit").toLowerCase() === "cattle" ? "" : "disabled"}></label>
            <label class="cattle-ear-field ${String(animal.species || "Rabbit").toLowerCase() === "cattle" ? "" : "hidden"}" ${String(animal.species || "Rabbit").toLowerCase() === "cattle" ? "" : "hidden"}>Ear tag color<input name="earTagColor" value="${esc(animal.earTagColor || "")}" placeholder="Blue, yellow, green, or other" ${String(animal.species || "Rabbit").toLowerCase() === "cattle" ? "" : "disabled"}></label>
            ${deps.breedComboboxField(animal.species || "Rabbit", animal.breed)}
            ${deps.selectField("Sex", "sex", ["Female", "Male", "Unknown"], animal.sex || "Unknown", true)}
            ${deps.field("Date of birth", "dob", animal.dob, false, "date")}
            ${deps.field("Birth weight (optional)", "birthWeight", animal.birthWeight, false, "number")}
            ${deps.selectField("Birth weight unit", "birthWeightUnit", ["lb", "lb+oz", "oz", "kg", "g"], animal.birthWeightUnit || "lb")}
            <label class="birth-weight-ounces ${animal.birthWeightUnit === "lb+oz" ? "" : "hidden"}">Birth weight ounces<input name="birthWeightOunces" type="number" min="0" max="15.9" step="0.1" value="${esc(animal.birthWeightOunces || "")}" ${animal.birthWeightUnit === "lb+oz" ? "" : "disabled"}></label>
            ${deps.field("Color or variety", "color", animal.color)}
            ${deps.field("Location / cage / pen", "location", animal.location)}
            ${deps.selectField("Status", "status", ["Active", "Breeding", "Growing", "Retired", "For Sale", "Reserved", "Sold", "Deceased", "Archived", "Ancestor Only"], animal.status || "Active", true)}
            ${deps.field("Asking price (optional)", "askingPrice", animal.askingPrice, false, "number")}
            ${deps.selectAnimalField("Sire", "sireId", animal.sireId, "Male")}
            ${deps.selectAnimalField("Dam", "damId", animal.damId, "Female")}
          </div>
          ${deps.textareaField("Notes", "notes", animal.notes)}
          <div class="modal-actions">
            ${id ? '<button type="button" class="button button-danger" id="delete-animal">Delete</button>' : ""}
            <button type="button" class="button button-ghost" id="cancel-modal">Cancel</button>
            <button type="submit" class="button button-primary">${id ? "Save changes" : "Add animal"}</button>
          </div>
        </form>
      `, "Animal record");

      const photoInput = $("#animal-photo-file");
      const photoPreview = $("#animal-photo-preview");
      const photoStatus = $("#animal-photo-status");
      const defaultButton = $("#use-default-animal-photo");
      const speciesSelect = $('[name="species"]', $("#animal-form"));
      const birthWeightUnit = $('[name="birthWeightUnit"]', $("#animal-form"));
      const birthWeightOunces = $(".birth-weight-ounces", $("#animal-form"));
      const breedList = $("#animal-breed-options");
      const cattleEarFields = $$(".cattle-ear-field", $("#animal-form"));

      const refreshBreedOptions = () => {
        if (!breedList) return;
        breedList.innerHTML = deps.breedOptionsFor(speciesSelect?.value || "Rabbit")
          .map((breed) => `<option value="${esc(breed)}"></option>`)
          .join("");
      };

      const refreshPhotoPreview = () => {
        const currentSpecies = speciesSelect?.value || animal.species || "Rabbit";
        if (photoPreview) {
          photoPreview.innerHTML = pendingPhotoData
            ? `<img src="${pendingPhotoData}" alt="Animal photo preview">`
            : `<span>${deps.speciesIcon(currentSpecies)}</span>`;
        }
        if (photoStatus) photoStatus.textContent = pendingPhotoFileName || "Using the default species icon.";
        if (defaultButton) defaultButton.disabled = !pendingPhotoData;
      };

      const refreshCattleEarFields = () => {
        const isCattle = String(speciesSelect?.value || "").trim().toLowerCase() === "cattle";
        cattleEarFields.forEach((label) => {
          label.hidden = !isCattle;
          label.classList.toggle("hidden", !isCattle);
          const input = $("input", label);
          if (input) input.disabled = !isCattle;
        });
      };

      const refreshBirthWeightFields = () => {
        const usesOunces = birthWeightUnit?.value === "lb+oz";
        birthWeightOunces?.classList.toggle("hidden", !usesOunces);
        const input = birthWeightOunces ? $("input", birthWeightOunces) : null;
        if (input) input.disabled = !usesOunces;
      };

      speciesSelect?.addEventListener("change", () => {
        refreshPhotoPreview();
        refreshBreedOptions();
        refreshCattleEarFields();
      });
      refreshBreedOptions();
      refreshCattleEarFields();
      birthWeightUnit?.addEventListener("change", refreshBirthWeightFields);
      refreshBirthWeightFields();

      photoInput?.addEventListener("change", async () => {
        const file = photoInput.files?.[0];
        if (!file) return;
        try {
          if (photoStatus) photoStatus.textContent = "Preparing photo…";
          const prepared = await deps.prepareProfileImage(file, {
            maxDimension: 560,
            targetBytes: 65000,
            outputType: "image/jpeg",
            background: "#ffffff"
          });
          pendingPhotoData = prepared.dataUrl;
          pendingPhotoFileName = prepared.fileName;
          refreshPhotoPreview();
          deps.toast(prepared.compressed ? "Animal photo compressed and ready." : "Animal photo ready.", "success");
        } catch (error) {
          photoInput.value = "";
          if (photoStatus) photoStatus.textContent = error.message || "The photo could not be prepared.";
          deps.toast(photoStatus?.textContent || "The photo could not be prepared.", "error");
        }
      });

      defaultButton?.addEventListener("click", () => {
        pendingPhotoData = "";
        pendingPhotoFileName = "";
        if (photoInput) photoInput.value = "";
        refreshPhotoPreview();
      });

      $("#cancel-modal")?.addEventListener("click", deps.closeModal);
      $("#animal-form")?.addEventListener("submit", (event) => {
        event.preventDefault();
        const liveState = stateNow();
        const data = Object.fromEntries(new FormData(event.currentTarget));
        data.breed = String(data.breed || "").trim();
        if (String(data.species || "").trim().toLowerCase() !== "cattle") {
          data.earTagNumber = "";
          data.earTagColor = "";
        } else {
          data.earTagNumber = String(data.earTagNumber || "").trim();
          data.earTagColor = String(data.earTagColor || "").trim();
        }
        const askingPrice = data.askingPrice === "" ? NaN : Number(data.askingPrice);
        if (data.askingPrice !== "" && (!Number.isFinite(askingPrice) || askingPrice < 0)) {
          deps.toast("Asking price must be a valid amount of zero or more.", "error");
          return;
        }
        data.askingPrice = Number.isFinite(askingPrice) ? askingPrice.toFixed(2) : "";
        const birthWeight = data.birthWeight === "" ? NaN : Number(data.birthWeight);
        const birthWeightOuncesValue = data.birthWeightOunces === "" ? 0 : Number(data.birthWeightOunces);
        if (data.birthWeight !== "" && (!Number.isFinite(birthWeight) || birthWeight < 0)) {
          deps.toast("Birth weight must be a valid amount of zero or more.", "error");
          return;
        }
        if (data.birthWeightUnit === "lb+oz" && (!Number.isFinite(birthWeightOuncesValue) || birthWeightOuncesValue < 0 || birthWeightOuncesValue >= 16)) {
          deps.toast("Birth weight ounces must be between 0 and less than 16.", "error");
          return;
        }
        data.birthWeight = Number.isFinite(birthWeight) ? String(birthWeight) : "";
        data.birthWeightUnit = ["lb", "lb+oz", "oz", "kg", "g"].includes(data.birthWeightUnit) ? data.birthWeightUnit : "lb";
        data.birthWeightOunces = data.birthWeight && data.birthWeightUnit === "lb+oz" ? String(birthWeightOuncesValue) : "";
        data.photoData = pendingPhotoData;
        data.photoFileName = pendingPhotoFileName;

        if (id) {
          const currentAnimal = (liveState.animals || []).find((record) => record.id === id);
          if (!currentAnimal) return;
          const nextAnimal = { ...currentAnimal, ...data, updatedAt: new Date().toISOString() };
          const nextAnimals = liveState.animals.map((item) => item.id === id ? nextAnimal : item);
          if (!deps.allowsAnimalTransition(liveState.animals, nextAnimals)) return;
          const original = { ...currentAnimal };
          Object.assign(currentAnimal, nextAnimal);
          deps.rememberBreed(data.species, data.breed);
          deps.recordActivity(`Updated ${data.name}.`, "animal");
          if (!deps.saveState("Animal updated.")) {
            Object.keys(currentAnimal).forEach((key) => delete currentAnimal[key]);
            Object.assign(currentAnimal, original);
            liveState.activity?.shift?.();
            return;
          }
        } else {
          const newAnimal = { id: deps.uid("animal"), ...data, createdAt: new Date().toISOString() };
          if (!deps.allowsAnimalTransition(liveState.animals || [], [...(liveState.animals || []), newAnimal])) return;
          liveState.animals.push(newAnimal);
          deps.rememberBreed(data.species, data.breed);
          deps.recordActivity(`Added ${data.name} to animal records.`, "animal");
          if (!deps.saveState("Animal added.")) {
            liveState.animals = liveState.animals.filter((item) => item.id !== newAnimal.id);
            liveState.activity?.shift?.();
            return;
          }
        }
        deps.closeModal();
        deps.renderCurrentView();
      });

      $("#delete-animal")?.addEventListener("click", () => {
        const liveState = stateNow();
        const currentAnimal = (liveState.animals || []).find((record) => record.id === id);
        if (!currentAnimal) return;
        if ((liveState.sales || []).some((sale) => (sale.items || []).some((item) => item.animalId === id))) {
          deps.toast("This animal is connected to a sale record. Keep the animal for invoices, transfers, and buyer history.", "error");
          return;
        }
        if (!root.confirm?.(`Delete ${currentAnimal.name}? This cannot be undone.`)) return;
        const removedBreedingIds = (liveState.breedings || [])
          .filter((record) => record.femaleId === id || record.maleId === id)
          .map((record) => record.id);
        removedBreedingIds.forEach((breedingId) => deps.completeWorkflowTasks("breeding", breedingId));
        liveState.animals = (liveState.animals || []).filter((record) => record.id !== id);
        liveState.breedings = (liveState.breedings || []).filter((record) => record.femaleId !== id && record.maleId !== id);
        liveState.health = (liveState.health || []).filter((record) => record.animalId !== id);
        liveState.pedigrees = (liveState.pedigrees || []).filter((record) => record.subjectAnimalId !== id);
        liveState.pedigreeDrafts = (liveState.pedigreeDrafts || []).filter((record) => record.subjectAnimalId !== id);
        liveState.tasks = (liveState.tasks || []).map((task) => task.animalId === id ? { ...task, animalId: "" } : task);
        deps.recordActivity(`Deleted ${currentAnimal.name}.`, "animal");
        deps.saveState("Animal deleted.");
        deps.closeModal();
        deps.renderCurrentView();
      });
      return true;
    }

    function pedigreePreviewCardHtml(animal, relation, subject = false) {
      const sex = animal?.sex === "Male"
        ? (animal?.species === "Rabbit" ? "♂ Buck" : "♂ Male")
        : animal?.sex === "Female"
          ? (animal?.species === "Rabbit" ? "♀ Doe" : "♀ Female")
          : "Unknown";
      return `<article class="pedigree-preview-card ${subject ? "subject" : ""} ${animal ? "" : "unknown"}">
        <div class="pedigree-preview-heading">
          <div><small>${esc(relation)}</small><strong>${esc(animal?.name || "Unknown")}</strong></div>
          <span class="pedigree-preview-sex">${esc(sex)}</span>
        </div>
        <div class="pedigree-preview-details">
          <span data-field="id"><b>ID:</b> ${esc(animal?.earTagNumber || animal?.tag || animal?.tattoo || "—")}</span>
          <span data-field="dob"><b>DOB:</b> ${esc(animal?.dob ? deps.formatDate(animal.dob) : "—")}</span>
          <span data-field="color"><b>COLOR:</b> ${esc(animal?.color || "—")}</span>
          <span data-field="breed"><b>BREED:</b> ${esc(animal?.breed || "—")}</span>
        </div>
      </article>`;
    }

    function pedigreeRecordPreviewHtml(subject, record = null) {
      const state = stateNow();
      const byId = (id) => (state.animals || []).find((animal) => animal.id === id) || null;
      const ids = record?.ancestorIds || {};
      const sire = byId(ids.sire || subject?.sireId);
      const dam = byId(ids.dam || subject?.damId);
      const sireSire = byId(ids.sireSire || sire?.sireId);
      const sireDam = byId(ids.sireDam || sire?.damId);
      const damSire = byId(ids.damSire || dam?.sireId);
      const damDam = byId(ids.damDam || dam?.damId);
      return `<div class="pedigree-preview-scroll" aria-label="Pedigree chart for ${esc(subject?.name || "animal")}">
        <div class="pedigree-preview-tree">
          <div class="pedigree-preview-node" style="grid-column:1;grid-row:1 / 5">${pedigreePreviewCardHtml(subject, "Animal", true)}</div>
          <div class="pedigree-preview-branch" style="grid-column:2;grid-row:1 / 5"><span class="pedigree-preview-arm top"></span><span class="pedigree-preview-arm bottom"></span></div>
          <div class="pedigree-preview-node" style="grid-column:3;grid-row:1 / 3">${pedigreePreviewCardHtml(sire, "Sire")}</div>
          <div class="pedigree-preview-node" style="grid-column:3;grid-row:3 / 5">${pedigreePreviewCardHtml(dam, "Dam")}</div>
          <div class="pedigree-preview-branch" style="grid-column:4;grid-row:1 / 3"><span class="pedigree-preview-arm top"></span><span class="pedigree-preview-arm bottom"></span></div>
          <div class="pedigree-preview-branch" style="grid-column:4;grid-row:3 / 5"><span class="pedigree-preview-arm top"></span><span class="pedigree-preview-arm bottom"></span></div>
          <div class="pedigree-preview-node" style="grid-column:5;grid-row:1">${pedigreePreviewCardHtml(sireSire, "Sire's sire")}</div>
          <div class="pedigree-preview-node" style="grid-column:5;grid-row:2">${pedigreePreviewCardHtml(sireDam, "Sire's dam")}</div>
          <div class="pedigree-preview-node" style="grid-column:5;grid-row:3">${pedigreePreviewCardHtml(damSire, "Dam's sire")}</div>
          <div class="pedigree-preview-node" style="grid-column:5;grid-row:4">${pedigreePreviewCardHtml(damDam, "Dam's dam")}</div>
        </div>
      </div>`;
    }

    function openAnimalDetail(id) {
      const state = stateNow();
      const animal = (state.animals || []).find((item) => item.id === id);
      if (!animal) return false;
      const sire = (state.animals || []).find((item) => item.id === animal.sireId);
      const dam = (state.animals || []).find((item) => item.id === animal.damId);
      const sireSire = sire ? (state.animals || []).find((item) => item.id === sire.sireId) : null;
      const sireDam = sire ? (state.animals || []).find((item) => item.id === sire.damId) : null;
      const damSire = dam ? (state.animals || []).find((item) => item.id === dam.sireId) : null;
      const damDam = dam ? (state.animals || []).find((item) => item.id === dam.damId) : null;
      const health = (state.health || []).filter((record) => record.animalId === id).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      const breedings = (state.breedings || []).filter((record) => record.femaleId === id || record.maleId === id);
      const pedigreeImports = (state.pedigrees || []).filter((record) => record.subjectAnimalId === id);

      deps.openModal(animal.name, `
        <div class="animal-detail-hero">
          <div class="animal-detail-photo ${animal.photoData ? "has-photo" : ""}">${deps.animalVisualHtml(animal)}</div>
          <div>
            <p class="eyebrow">${esc(animal.species || "Animal")} profile</p>
            <h2 style="margin-bottom:5px">${esc(animal.name)}</h2>
            <p class="muted">${esc([animal.earTagNumber ? `Ear tag ${animal.earTagNumber}` : animal.tag || animal.tattoo, animal.earTagColor, animal.breed, animal.color].filter(Boolean).join(" · ") || "No additional identity details")}</p>
          </div>
        </div>
        <div class="detail-grid">
          ${deps.detailField("Species", animal.species)}
          ${deps.detailField("Breed", animal.breed)}
          ${deps.detailField("Sex", animal.sex)}
          ${deps.detailField("Tag", animal.tag)}
          ${String(animal.species || "").toLowerCase() === "cattle" ? deps.detailField("Ear tag number", animal.earTagNumber) : ""}
          ${String(animal.species || "").toLowerCase() === "cattle" ? deps.detailField("Ear tag color", animal.earTagColor) : ""}
          ${deps.detailField("Tattoo / ear number", animal.tattoo)}
          ${deps.detailField("Registration", animal.registrationNumber)}
          ${deps.detailField("Breeder", animal.breeder)}
          ${deps.detailField("Born", deps.formatDate(animal.dob))}
          ${deps.detailField("Age", deps.ageText(animal.dob))}
          ${deps.detailField("Location", animal.location)}
          ${deps.detailField("Status", animal.status)}
          ${deps.detailField("Asking price", animal.askingPrice ? deps.formatMoney(animal.askingPrice) : "—")}
        </div>
        <h3 style="margin-top:22px">Pedigree preview</h3>
        <div class="pedigree-preview-scroll">
          <div class="pedigree-preview-tree">
            <div class="pedigree-preview-node" style="grid-column:1;grid-row:1 / 5">${pedigreePreviewCardHtml(animal, "Animal", true)}</div>
            <div class="pedigree-preview-branch" style="grid-column:2;grid-row:1 / 5"><span class="pedigree-preview-arm top"></span><span class="pedigree-preview-arm bottom"></span></div>
            <div class="pedigree-preview-node" style="grid-column:3;grid-row:1 / 3">${pedigreePreviewCardHtml(sire, "Sire")}</div>
            <div class="pedigree-preview-node" style="grid-column:3;grid-row:3 / 5">${pedigreePreviewCardHtml(dam, "Dam")}</div>
            <div class="pedigree-preview-branch" style="grid-column:4;grid-row:1 / 3"><span class="pedigree-preview-arm top"></span><span class="pedigree-preview-arm bottom"></span></div>
            <div class="pedigree-preview-branch" style="grid-column:4;grid-row:3 / 5"><span class="pedigree-preview-arm top"></span><span class="pedigree-preview-arm bottom"></span></div>
            <div class="pedigree-preview-node" style="grid-column:5;grid-row:1">${pedigreePreviewCardHtml(sireSire, "Sire's sire")}</div>
            <div class="pedigree-preview-node" style="grid-column:5;grid-row:2">${pedigreePreviewCardHtml(sireDam, "Sire's dam")}</div>
            <div class="pedigree-preview-node" style="grid-column:5;grid-row:3">${pedigreePreviewCardHtml(damSire, "Dam's sire")}</div>
            <div class="pedigree-preview-node" style="grid-column:5;grid-row:4">${pedigreePreviewCardHtml(damDam, "Dam's dam")}</div>
          </div>
        </div>
        <h3 style="margin-top:22px">Notes</h3>
        <p class="muted">${esc(animal.notes || "No notes recorded.")}</p>
        <h3 style="margin-top:22px">Record summary</h3>
        <p class="muted">${health.length} health record${health.length === 1 ? "" : "s"} · ${breedings.length} breeding record${breedings.length === 1 ? "" : "s"} · ${pedigreeImports.length} pedigree import${pedigreeImports.length === 1 ? "" : "s"}</p>
        <div class="modal-actions">
          <button class="button button-ghost" id="detail-close">Close</button>
          <button class="button button-ghost" id="detail-analytics">View analytics</button>
          <button class="button button-ghost" id="detail-print-pedigree">Print sale pedigree</button>
          <button class="button button-ghost" id="detail-print-qr">Print QR card</button>
          <button class="button button-ghost" id="detail-import-pedigree">Build / import pedigree</button>
          <button class="button button-primary" id="detail-edit">Edit animal</button>
        </div>
      `, `${animal.species || "Animal"} record`);

      $("#detail-close")?.addEventListener("click", deps.closeModal);
      $("#detail-analytics")?.addEventListener("click", () => {
        deps.closeModal();
        root.HerdHarborAnalytics?.openAnimal?.(id);
        deps.navigate("analytics");
      });
      $("#detail-print-pedigree")?.addEventListener("click", () => deps.openPrintPedigreeForm(id));
      $("#detail-print-qr")?.addEventListener("click", (event) => openAnimalQrCardForm(id, event.currentTarget));
      $("#detail-import-pedigree")?.addEventListener("click", () => deps.openPedigreeImport(id));
      $("#detail-edit")?.addEventListener("click", () => openAnimalForm(id));
      return true;
    }

    function animalDeepLink(animalId) {
      const location = root.location || {};
      const base = location.hostname === "app.herdharbor.com"
        ? new URL(String(location.origin || "") + String(location.pathname || "/"))
        : new URL("https://app.herdharbor.com/");
      base.searchParams.set("animal", animalId);
      return base.toString();
    }

    function animalQrSvg(animalId) {
      if (typeof root.qrcode !== "function") throw new Error("The QR card tool did not load. Close and reopen HerdHarbor, then try again.");
      const code = root.qrcode(0, "M");
      code.addData(animalDeepLink(animalId));
      code.make();
      return code.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
    }

    function qrCardCandidates() {
      return filterAnimals(animalsNow().filter((animal) => !["Deceased", "Ancestor Only"].includes(animal.status)));
    }

    async function openAnimalQrCardForm(animalId = "", triggerButton = null) {
      if (qrToolActionPending) return false;
      let candidates = animalId
        ? animalsNow().filter((animal) => animal.id === animalId)
        : qrCardCandidates();
      if (!candidates.length) {
        deps.toast("No animals are available for QR cards with the current filters.", "error");
        return false;
      }

      qrToolActionPending = true;
      const originalTriggerText = triggerButton?.textContent || "";
      if (triggerButton) {
        triggerButton.disabled = true;
        triggerButton.textContent = "Loading QR…";
      }
      try {
        await deps.ensureQrToolsReady();
      } catch (error) {
        deps.toast(error.message || "The QR card tool could not be loaded.", "error");
        return false;
      } finally {
        qrToolActionPending = false;
        if (triggerButton) {
          triggerButton.disabled = false;
          triggerButton.textContent = originalTriggerText;
        }
      }

      candidates = animalId
        ? animalsNow().filter((animal) => animal.id === animalId)
        : qrCardCandidates();
      if (!candidates.length) {
        deps.toast("No animals are available for QR cards with the current filters.", "error");
        return false;
      }

      deps.openModal("Print QR animal cards", `
        <form id="animal-qr-form">
          <div class="form-grid two">
            ${deps.selectField("Card layout", "layout", ["Animal card", "Cage / pen card"], "Animal card", true)}
            <label>Animals selected
              <strong id="qr-selected-count">${animalId ? 1 : candidates.length}</strong>
              <small class="muted">Each code opens the matching animal in the signed-in farm account.</small>
            </label>
          </div>
          <div class="sale-animal-picker">
            ${candidates.map((animal) => `
              <label class="sale-animal-choice">
                <input type="checkbox" data-qr-animal value="${animal.id}" checked>
                <span><strong>${esc(animal.name || "Unnamed animal")}</strong><small>${esc([animal.earTagNumber || animal.tag || animal.tattoo, animal.earTagColor, animal.location, animal.status].filter(Boolean).join(" · ") || animal.species || "Animal")}</small></span>
              </label>`).join("")}
          </div>
          <p class="budget-note">A phone camera can scan the printed code. HerdHarbor will ask the tester to sign in before showing private farm records.</p>
          <div class="modal-actions">
            <button type="button" class="button button-ghost" id="cancel-modal">Cancel</button>
            <button type="submit" class="button button-primary">Print selected cards</button>
          </div>
        </form>
      `, "QR animal, cage, and pen cards");
      $(".modal")?.classList.add("modal-wide");
      const updateCount = () => {
        const count = $$('[data-qr-animal]:checked', $("#animal-qr-form")).length;
        const node = $("#qr-selected-count");
        if (node) node.textContent = String(count);
      };
      $$('[data-qr-animal]', $("#animal-qr-form")).forEach((box) => box.addEventListener("change", updateCount));
      $("#cancel-modal")?.addEventListener("click", deps.closeModal);
      $("#animal-qr-form")?.addEventListener("submit", (event) => {
        event.preventDefault();
        const ids = $$('[data-qr-animal]:checked', event.currentTarget).map((box) => box.value);
        if (!ids.length) {
          deps.toast("Choose at least one animal.", "error");
          return;
        }
        try {
          printAnimalQrCards(ids, new FormData(event.currentTarget).get("layout"));
        } catch (error) {
          deps.toast(error.message || "The QR cards could not be created.", "error");
        }
      });
      return true;
    }

    function printAnimalQrCards(animalIds, layout = "Animal card") {
      const state = stateNow();
      const animals = animalIds.map((id) => (state.animals || []).find((animal) => animal.id === id)).filter(Boolean);
      if (!animals.length) return false;
      const popup = root.open?.("", "_blank");
      if (!popup) {
        deps.toast("Allow pop-ups for HerdHarbor to print QR cards.", "error");
        return false;
      }
      popup.opener = null;
      const operationName = state.profile?.operationName || "HerdHarbor";
      const cageLayout = layout === "Cage / pen card";
      popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(operationName)} QR Cards</title><style>
        @page{size:letter;margin:.35in}*{box-sizing:border-box}body{margin:0;color:#142638;background:#fff;font:12px/1.35 Arial,sans-serif}.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.18in}.card{display:grid;grid-template-columns:1.35in 1fr;gap:.16in;min-height:2.25in;padding:.18in;border:2px solid #0d2540;border-radius:12px;break-inside:avoid;page-break-inside:avoid}.qr{display:grid;place-items:center}.qr svg{width:1.3in;height:1.3in}.copy{min-width:0}.eyebrow{margin:0;color:#2e7d7b;font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}h1{margin:3px 0 5px;font-size:20px;line-height:1.05}.location{margin:0 0 7px;padding:6px 8px;color:#fff;background:#0d2540;border-radius:6px;font-size:14px;font-weight:800}.meta{margin:3px 0;color:#455764}.scan{grid-column:1/-1;margin:0;padding-top:5px;border-top:1px solid #ccd5dc;color:#5f6d78;font-size:8px;overflow-wrap:anywhere}.cage{grid-template-columns:1.1in 1fr;min-height:1.75in}.cage .qr svg{width:1.05in;height:1.05in}.cage h1{font-size:17px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}@media(max-width:700px){.cards{grid-template-columns:1fr}}
      </style></head><body><main class="cards">${animals.map((animal) => `
        <article class="card ${cageLayout ? "cage" : ""}">
          <div class="qr">${animalQrSvg(animal.id)}</div>
          <div class="copy"><p class="eyebrow">${esc(operationName)} · ${cageLayout ? "Cage / pen" : "Animal"}</p><h1>${esc(animal.name || "Unnamed animal")}</h1>
            ${cageLayout ? `<p class="location">${esc(animal.location || "Location not recorded")}</p>` : ""}
            <p class="meta"><strong>${esc(animal.earTagNumber || animal.tag || animal.tattoo || "No ID recorded")}</strong> · ${esc([animal.earTagColor, animal.species || "Animal", animal.breed || "Breed not recorded"].filter(Boolean).join(" · "))}</p>
            <p class="meta">${esc([animal.sex, animal.dob ? deps.formatDate(animal.dob) : "", animal.status].filter(Boolean).join(" · "))}</p></div>
          <p class="scan">Scan to open this private HerdHarbor animal record: ${esc(animalDeepLink(animal.id))}</p>
        </article>`).join("")}</main><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),120));<\/script></body></html>`);
      popup.document.close();
      deps.recordActivity(`Opened ${animals.length} printable QR card${animals.length === 1 ? "" : "s"}.`, "animal");
      return true;
    }

    function openEditor(animalId) {
      const id = String(animalId || "").trim();
      if (!id || !animalsNow().some((animal) => String(animal.id) === id)) return false;
      openAnimalForm(id);
      return true;
    }

    function openPedigreePrint(animalId) {
      const id = String(animalId || "").trim();
      if (!id || !animalsNow().some((animal) => String(animal.id) === id)) return false;
      deps.openPrintPedigreeForm(id);
      return true;
    }

    return Object.freeze({
      VERSION,
      renderAnimals,
      renderAnimalResults,
      openAnimalForm,
      openAnimalDetail,
      openAnimalQrCardForm,
      pedigreeRecordPreviewHtml,
      openEditor,
      openPedigreePrint,
      filterAnimals,
      getFilterState: () => ({ ...animalView })
    });
  }

  return Object.freeze({ VERSION, DEFAULT_VIEW, create });
});
