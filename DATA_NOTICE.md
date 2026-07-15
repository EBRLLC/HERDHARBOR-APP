(() => {
  "use strict";

  const STORAGE_KEY = "herdharbor_pre_alpha_v1";

  const defaultState = {
    profile: null,
    animals: [],
    breedings: [],
    litters: [],
    health: [],
    tasks: [],
    activity: [],
    settings: {
      species: ["Rabbit", "Chicken", "Duck", "Turkey", "Goat", "Sheep", "Cattle", "Pig", "Other"]
    }
  };

  let state = loadState();
  let currentRoute = "dashboard";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const uid = (prefix = "id") => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const addDays = (dateString, days) => {
    const d = new Date(`${dateString}T12:00:00`);
    d.setDate(d.getDate() + Number(days));
    return d.toISOString().slice(0, 10);
  };
  const esc = (value = "") =>
    String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[char]);

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(defaultState);
      return { ...structuredClone(defaultState), ...JSON.parse(raw) };
    } catch {
      return structuredClone(defaultState);
    }
  }

  function saveState(message = "") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (message) toast(message, "success");
  }

  function toast(message, type = "") {
    const region = $("#toast-region");
    const node = document.createElement("div");
    node.className = `toast ${type}`;
    node.textContent = message;
    region.appendChild(node);
    setTimeout(() => node.remove(), 3200);
  }

  function formatDate(dateString) {
    if (!dateString) return "—";
    const date = new Date(`${dateString}T12:00:00`);
    return new Intl.DateTimeFormat("en-US", {
      month: "short", day: "numeric", year: "numeric"
    }).format(date);
  }

  function daysFromNow(dateString) {
    if (!dateString) return null;
    const today = new Date(`${todayISO()}T12:00:00`);
    const target = new Date(`${dateString}T12:00:00`);
    return Math.round((target - today) / 86400000);
  }

  function animalName(id) {
    return state.animals.find((a) => a.id === id)?.name || "Unknown";
  }

  function speciesIcon(species = "") {
    const icons = {
      Rabbit: "🐇", Chicken: "🐔", Duck: "🦆", Turkey: "🦃",
      Goat: "🐐", Sheep: "🐑", Cattle: "🐄", Pig: "🐖", Other: "◈"
    };
    return icons[species] || "◈";
  }

  function ageText(dob) {
    if (!dob) return "Age unknown";
    const diff = Math.max(0, Math.floor((new Date() - new Date(`${dob}T12:00:00`)) / 86400000));
    if (diff < 60) return `${diff} days`;
    if (diff < 730) return `${Math.floor(diff / 30.44)} months`;
    const years = Math.floor(diff / 365.25);
    return `${years} year${years === 1 ? "" : "s"}`;
  }

  function recordActivity(text, type = "record") {
    state.activity.unshift({
      id: uid("activity"),
      text,
      type,
      date: new Date().toISOString()
    });
    state.activity = state.activity.slice(0, 30);
  }

  function initialize() {
    $("#onboarding-form").addEventListener("submit", handleOnboarding);
    $("#menu-button").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
    $("#modal-close").addEventListener("click", closeModal);
    $("#modal-backdrop").addEventListener("click", (event) => {
      if (event.target.id === "modal-backdrop") closeModal();
    });
    $("#quick-add-button").addEventListener("click", openQuickAdd);
    $("#profile-button").addEventListener("click", () => navigate("settings"));

    $$(".nav-item, .brand").forEach((item) => {
      item.addEventListener("click", (event) => {
        event.preventDefault();
        navigate(item.dataset.route);
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeModal();
    });

    if (state.profile) showApp();
    else showOnboarding();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    }
  }

  function showOnboarding() {
    $("#onboarding").classList.remove("hidden");
    $("#app-shell").classList.add("hidden");
  }

  function showApp() {
    $("#onboarding").classList.add("hidden");
    $("#app-shell").classList.remove("hidden");
    $("#operation-name").textContent = state.profile.operationName;
    $("#profile-initials").textContent = initials(state.profile.ownerName);
    navigate(currentRoute);
  }

  function initials(name = "") {
    return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "HH";
  }

  function handleOnboarding(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    state.profile = {
      operationName: data.get("operationName").trim(),
      ownerName: data.get("ownerName").trim(),
      email: data.get("email").trim(),
      createdAt: new Date().toISOString()
    };
    recordActivity("Created the HerdHarbor pre-alpha workspace.", "setup");
    saveState();
    showApp();
  }

  function navigate(route) {
    currentRoute = route || "dashboard";
    $$(".view").forEach((view) => view.classList.remove("active"));
    $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.route === currentRoute));
    const target = $(`#view-${currentRoute}`);
    if (target) target.classList.add("active");
    $("#page-subtitle").textContent = routeTitle(currentRoute);
    $("#sidebar").classList.remove("open");
    renderCurrentView();
    location.hash = currentRoute;
  }

  function routeTitle(route) {
    return ({
      dashboard: "Overview",
      animals: "Animal records",
      breeding: "Breeding records",
      litters: "Litter records",
      health: "Health and weights",
      tasks: "Tasks and reminders",
      settings: "Workspace settings"
    })[route] || "Overview";
  }

  function renderCurrentView() {
    const renderers = {
      dashboard: renderDashboard,
      animals: renderAnimals,
      breeding: renderBreedings,
      litters: renderLitters,
      health: renderHealth,
      tasks: renderTasks,
      settings: renderSettings
    };
    renderers[currentRoute]?.();
  }

  function headerHtml(title, description, actions = "") {
    return `
      <div class="page-header">
        <div>
          <p class="eyebrow">HerdHarbor pre-alpha</p>
          <h2>${esc(title)}</h2>
          <p>${esc(description)}</p>
        </div>
        <div class="header-actions">${actions}</div>
      </div>`;
  }

  function renderDashboard() {
    const activeAnimals = state.animals.filter((a) => a.status !== "Sold" && a.status !== "Deceased").length;
    const openBreedings = state.breedings.filter((b) => !["Completed", "Cancelled"].includes(b.status)).length;
    const openTasks = state.tasks.filter((t) => !t.completed).length;
    const dueSoon = state.breedings.filter((b) => {
      const d = daysFromNow(b.dueDate);
      return !["Completed", "Cancelled"].includes(b.status) && d !== null && d >= 0 && d <= 14;
    }).length;

    const upcoming = [
      ...state.tasks.filter((t) => !t.completed).map((t) => ({
        title: t.title,
        subtitle: `${t.category || "Task"} · ${formatDate(t.dueDate)}`,
        date: t.dueDate,
        icon: "✓",
        tone: daysFromNow(t.dueDate) < 0 ? "warning" : "teal"
      })),
      ...state.breedings.filter((b) => !["Completed", "Cancelled"].includes(b.status)).map((b) => ({
        title: `${animalName(b.femaleId)} × ${animalName(b.maleId)}`,
        subtitle: `Due ${formatDate(b.dueDate)}`,
        date: b.dueDate,
        icon: "♡",
        tone: "green"
      }))
    ].sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999")).slice(0, 6);

    const activity = state.activity.slice(0, 6);

    $("#view-dashboard").innerHTML = `
      ${headerHtml(
        `Good ${greeting()}, ${state.profile.ownerName.split(" ")[0]}.`,
        "Here is the current picture of your operation.",
        `<button class="button button-primary" data-action="add-animal">+ Add animal</button>`
      )}
      <div class="stats-grid">
        ${statCard("Animals", activeAnimals, `${state.animals.length} total records`)}
        ${statCard("Active breedings", openBreedings, `${dueSoon} due within 14 days`)}
        ${statCard("Open tasks", openTasks, `${state.tasks.filter((t) => !t.completed && daysFromNow(t.dueDate) < 0).length} overdue`)}
        ${statCard("Litters", state.litters.length, `${state.litters.reduce((sum, l) => sum + Number(l.bornAlive || 0), 0)} live births recorded`)}
      </div>
      <div class="dashboard-grid">
        <div class="panel">
          <div class="panel-header">
            <h3>Upcoming</h3>
            <small>Tasks and breeding dates</small>
          </div>
          ${upcoming.length ? `<div class="list">${upcoming.map((item) => listItemHtml(item)).join("")}</div>` : emptyState("Nothing is due yet.", "Add a breeding record or task to see upcoming dates.")}
        </div>
        <div class="panel">
          <div class="panel-header">
            <h3>Recent activity</h3>
            <small>Last ${activity.length}</small>
          </div>
          ${activity.length ? `<div class="list">${activity.map((item) => `
            <div class="list-item">
              <div class="list-icon navy">•</div>
              <div class="list-item-main">
                <strong>${esc(item.text)}</strong>
                <span>${new Date(item.date).toLocaleString()}</span>
              </div>
            </div>`).join("")}</div>` : emptyState("No activity yet.", "Your recent changes will appear here.")}
        </div>
      </div>`;

    $('[data-action="add-animal"]', $("#view-dashboard"))?.addEventListener("click", () => openAnimalForm());
  }

  function greeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "morning";
    if (hour < 18) return "afternoon";
    return "evening";
  }

  function statCard(label, value, note) {
    return `<article class="stat-card">
      <span class="label">${esc(label)}</span>
      <strong class="value">${esc(value)}</strong>
      <span class="note">${esc(note)}</span>
    </article>`;
  }

  function listItemHtml(item) {
    return `<div class="list-item">
      <div class="list-icon ${item.tone === "green" ? "green" : item.tone === "warning" ? "warning" : ""}">${item.icon}</div>
      <div class="list-item-main">
        <strong>${esc(item.title)}</strong>
        <span>${esc(item.subtitle)}</span>
      </div>
    </div>`;
  }

  function emptyState(title, text) {
    return `<div class="empty-state"><strong>${esc(title)}</strong><p>${esc(text)}</p></div>`;
  }

  function renderAnimals() {
    $("#view-animals").innerHTML = `
      ${headerHtml(
        "Animals",
        "Keep identity, lineage, location, status, and notes connected to each animal.",
        `<button class="button button-primary" id="add-animal">+ Add animal</button>`
      )}
      <div class="toolbar">
        <input id="animal-search" type="search" placeholder="Search name, tag, breed, or location">
        <select id="animal-species"><option value="">All species</option>${state.settings.species.map((s) => `<option>${esc(s)}</option>`).join("")}</select>
        <select id="animal-sex"><option value="">Any sex</option><option>Female</option><option>Male</option><option>Unknown</option></select>
        <select id="animal-status"><option value="">Any status</option><option>Active</option><option>For Sale</option><option>Sold</option><option>Deceased</option></select>
      </div>
      <div id="animal-results"></div>`;

    $("#add-animal").addEventListener("click", () => openAnimalForm());
    ["animal-search", "animal-species", "animal-sex", "animal-status"].forEach((id) => {
      $(`#${id}`).addEventListener("input", renderAnimalResults);
      $(`#${id}`).addEventListener("change", renderAnimalResults);
    });
    renderAnimalResults();
  }

  function renderAnimalResults() {
    const root = $("#animal-results");
    if (!root) return;
    const query = ($("#animal-search")?.value || "").toLowerCase();
    const species = $("#animal-species")?.value || "";
    const sex = $("#animal-sex")?.value || "";
    const status = $("#animal-status")?.value || "";

    const animals = state.animals.filter((a) => {
      const haystack = [a.name, a.tag, a.breed, a.location, a.color].join(" ").toLowerCase();
      return (!query || haystack.includes(query)) &&
        (!species || a.species === species) &&
        (!sex || a.sex === sex) &&
        (!status || a.status === status);
    });

    root.innerHTML = animals.length ? `<div class="cards-grid">${animals.map(animalCardHtml).join("")}</div>` :
      emptyState("No matching animals.", "Add a new animal or change the filters.");

    $$("[data-view-animal]", root).forEach((button) => button.addEventListener("click", () => openAnimalDetail(button.dataset.viewAnimal)));
    $$("[data-edit-animal]", root).forEach((button) => button.addEventListener("click", () => openAnimalForm(button.dataset.editAnimal)));
  }

  function animalCardHtml(a) {
    return `<article class="animal-card">
      <div class="animal-card-top">
        <div class="animal-avatar">${speciesIcon(a.species)}</div>
        <span class="badge ${a.status === "Active" ? "green" : a.status === "For Sale" ? "warning" : "gray"}">${esc(a.status || "Active")}</span>
      </div>
      <h3>${esc(a.name || "Unnamed animal")}</h3>
      <div class="meta">${esc([a.tag, a.breed, a.sex].filter(Boolean).join(" · "))}</div>
      <div class="meta">${esc(ageText(a.dob))}${a.location ? ` · ${esc(a.location)}` : ""}</div>
      <div class="animal-card-footer">
        <button class="button button-ghost button-small" data-view-animal="${a.id}">View</button>
        <button class="button button-ghost button-small" data-edit-animal="${a.id}">Edit</button>
      </div>
    </article>`;
  }

  function openAnimalForm(id = "") {
    const animal = state.animals.find((a) => a.id === id) || {};
    openModal(id ? "Edit animal" : "Add animal", `
      <form id="animal-form">
        <div class="form-grid two">
          ${field("Name", "name", animal.name, true)}
          ${field("ID or tag", "tag", animal.tag)}
          ${selectField("Species", "species", state.settings.species, animal.species || "Rabbit", true)}
          ${field("Breed", "breed", animal.breed)}
          ${selectField("Sex", "sex", ["Female", "Male", "Unknown"], animal.sex || "Unknown", true)}
          ${field("Date of birth", "dob", animal.dob, false, "date")}
          ${field("Color or variety", "color", animal.color)}
          ${field("Location / cage / pen", "location", animal.location)}
          ${selectField("Status", "status", ["Active", "For Sale", "Sold", "Deceased"], animal.status || "Active", true)}
          ${selectAnimalField("Sire", "sireId", animal.sireId, "Male")}
          ${selectAnimalField("Dam", "damId", animal.damId, "Female")}
        </div>
        ${textareaField("Notes", "notes", animal.notes)}
        <div class="modal-actions">
          ${id ? `<button type="button" class="button button-danger" id="delete-animal">Delete</button>` : ""}
          <button type="button" class="button button-ghost" id="cancel-modal">Cancel</button>
          <button type="submit" class="button button-primary">${id ? "Save changes" : "Add animal"}</button>
        </div>
      </form>
    `, "Animal record");

    $("#cancel-modal").addEventListener("click", closeModal);
    $("#animal-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      if (id) {
        Object.assign(animal, data, { updatedAt: new Date().toISOString() });
        recordActivity(`Updated ${data.name}.`, "animal");
      } else {
        state.animals.push({ id: uid("animal"), ...data, createdAt: new Date().toISOString() });
        recordActivity(`Added ${data.name} to animal records.`, "animal");
      }
      saveState(id ? "Animal updated." : "Animal added.");
      closeModal();
      renderCurrentView();
    });

    $("#delete-animal")?.addEventListener("click", () => {
      if (!confirm(`Delete ${animal.name}? This cannot be undone.`)) return;
      state.animals = state.animals.filter((a) => a.id !== id);
      state.breedings = state.breedings.filter((b) => b.femaleId !== id && b.maleId !== id);
      state.health = state.health.filter((h) => h.animalId !== id);
      state.tasks = state.tasks.map((t) => t.animalId === id ? { ...t, animalId: "" } : t);
      recordActivity(`Deleted ${animal.name}.`, "animal");
      saveState("Animal deleted.");
      closeModal();
      renderCurrentView();
    });
  }

  function openAnimalDetail(id) {
    const a = state.animals.find((item) => item.id === id);
    if (!a) return;
    const sire = state.animals.find((x) => x.id === a.sireId);
    const dam = state.animals.find((x) => x.id === a.damId);
    const sireSire = sire ? state.animals.find((x) => x.id === sire.sireId) : null;
    const sireDam = sire ? state.animals.find((x) => x.id === sire.damId) : null;
    const damSire = dam ? state.animals.find((x) => x.id === dam.sireId) : null;
    const damDam = dam ? state.animals.find((x) => x.id === dam.damId) : null;
    const health = state.health.filter((h) => h.animalId === id).sort((x,y) => (y.date || "").localeCompare(x.date || ""));
    const breedings = state.breedings.filter((b) => b.femaleId === id || b.maleId === id);

    openModal(a.name, `
      <div class="detail-grid">
        ${detailField("Species", a.species)}
        ${detailField("Breed", a.breed)}
        ${detailField("Sex", a.sex)}
        ${detailField("Tag", a.tag)}
        ${detailField("Born", formatDate(a.dob))}
        ${detailField("Age", ageText(a.dob))}
        ${detailField("Location", a.location)}
        ${detailField("Status", a.status)}
      </div>
      <h3 style="margin-top:22px">Pedigree preview</h3>
      <div class="pedigree-grid">
        <div class="pedigree-cell"><div><strong>${esc(a.name)}</strong><small>Animal</small></div></div>
        <div>
          <div class="pedigree-cell"><div><strong>${esc(sire?.name || "Unknown sire")}</strong><small>Sire</small></div></div>
          <div class="pedigree-cell" style="margin-top:10px"><div><strong>${esc(dam?.name || "Unknown dam")}</strong><small>Dam</small></div></div>
        </div>
        <div>
          ${[sireSire, sireDam, damSire, damDam].map((x, i) => `<div class="pedigree-cell" style="${i ? "margin-top:6px" : ""}"><div><strong>${esc(x?.name || "Unknown")}</strong><small>${["Sire's sire","Sire's dam","Dam's sire","Dam's dam"][i]}</small></div></div>`).join("")}
        </div>
      </div>
      <h3 style="margin-top:22px">Notes</h3>
      <p class="muted">${esc(a.notes || "No notes recorded.")}</p>
      <h3 style="margin-top:22px">Record summary</h3>
      <p class="muted">${health.length} health record${health.length === 1 ? "" : "s"} · ${breedings.length} breeding record${breedings.length === 1 ? "" : "s"}</p>
      <div class="modal-actions">
        <button class="button button-ghost" id="detail-close">Close</button>
        <button class="button button-primary" id="detail-edit">Edit animal</button>
      </div>
    `, `${a.species || "Animal"} record`);

    $("#detail-close").addEventListener("click", closeModal);
    $("#detail-edit").addEventListener("click", () => openAnimalForm(id));
  }

  function detailField(label, value) {
    return `<div class="detail-field"><small>${esc(label)}</small><strong>${esc(value || "—")}</strong></div>`;
  }

  function renderBreedings() {
    const rows = state.breedings.slice().sort((a,b) => (b.breedingDate || "").localeCompare(a.breedingDate || ""));
    $("#view-breeding").innerHTML = `
      ${headerHtml(
        "Breeding",
        "Track pairings, expected dates, nest-box timing, and outcomes.",
        `<button class="button button-primary" id="add-breeding">+ Add breeding</button>`
      )}
      ${rows.length ? `<div class="panel data-table-wrap">
        <table class="data-table">
          <thead><tr><th>Pairing</th><th>Bred</th><th>Nest box</th><th>Due</th><th>Status</th><th></th></tr></thead>
          <tbody>${rows.map((b) => `
            <tr>
              <td><strong>${esc(animalName(b.femaleId))}</strong> × ${esc(animalName(b.maleId))}</td>
              <td>${formatDate(b.breedingDate)}</td>
              <td>${formatDate(b.nestBoxDate)}</td>
              <td>${formatDate(b.dueDate)}</td>
              <td><span class="badge ${b.status === "Completed" ? "gray" : "green"}">${esc(b.status)}</span></td>
              <td><button class="button button-ghost button-small" data-edit-breeding="${b.id}">Edit</button></td>
            </tr>`).join("")}</tbody>
        </table>
      </div>` : emptyState("No breeding records yet.", "Add a pairing to calculate due and nest-box dates.")}`;

    $("#add-breeding").addEventListener("click", () => openBreedingForm());
    $$("[data-edit-breeding]", $("#view-breeding")).forEach((button) =>
      button.addEventListener("click", () => openBreedingForm(button.dataset.editBreeding)));
  }

  function openBreedingForm(id = "") {
    if (!state.animals.length) {
      toast("Add animals before creating a breeding record.", "error");
      navigate("animals");
      return;
    }
    const breeding = state.breedings.find((b) => b.id === id) || {};
    openModal(id ? "Edit breeding" : "Add breeding", `
      <form id="breeding-form">
        <div class="form-grid two">
          ${selectAnimalField("Female / dam", "femaleId", breeding.femaleId, "Female", true)}
          ${selectAnimalField("Male / sire", "maleId", breeding.maleId, "Male", true)}
          ${field("Breeding date", "breedingDate", breeding.breedingDate || todayISO(), true, "date")}
          ${field("Nest-box date", "nestBoxDate", breeding.nestBoxDate || "", false, "date")}
          ${field("Expected due date", "dueDate", breeding.dueDate || "", true, "date")}
          ${selectField("Status", "status", ["Bred", "Confirmed", "Due Soon", "Completed", "Cancelled"], breeding.status || "Bred", true)}
        </div>
        ${textareaField("Notes", "notes", breeding.notes)}
        <div class="modal-actions">
          ${id ? `<button type="button" class="button button-danger" id="delete-breeding">Delete</button>` : ""}
          <button type="button" class="button button-ghost" id="cancel-modal">Cancel</button>
          <button type="submit" class="button button-primary">${id ? "Save changes" : "Add breeding"}</button>
        </div>
      </form>`, "Breeding record");

    const breedingDateInput = $('[name="breedingDate"]');
    const dueDateInput = $('[name="dueDate"]');
    const nestInput = $('[name="nestBoxDate"]');
    const femaleInput = $('[name="femaleId"]');

    const calculateRabbitDates = () => {
      const female = state.animals.find((a) => a.id === femaleInput.value);
      if (female?.species === "Rabbit" && breedingDateInput.value) {
        if (!dueDateInput.value) dueDateInput.value = addDays(breedingDateInput.value, 31);
        if (!nestInput.value) nestInput.value = addDays(breedingDateInput.value, 28);
      }
    };
    femaleInput.addEventListener("change", calculateRabbitDates);
    breedingDateInput.addEventListener("change", () => {
      dueDateInput.value = "";
      nestInput.value = "";
      calculateRabbitDates();
    });
    calculateRabbitDates();

    $("#cancel-modal").addEventListener("click", closeModal);
    $("#breeding-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      if (data.femaleId === data.maleId) return toast("Select two different animals.", "error");
      if (id) Object.assign(breeding, data, { updatedAt: new Date().toISOString() });
      else state.breedings.push({ id: uid("breeding"), ...data, createdAt: new Date().toISOString() });
      recordActivity(`${id ? "Updated" : "Added"} breeding: ${animalName(data.femaleId)} × ${animalName(data.maleId)}.`, "breeding");
      saveState(id ? "Breeding updated." : "Breeding added.");
      closeModal();
      renderCurrentView();
    });

    $("#delete-breeding")?.addEventListener("click", () => {
      if (!confirm("Delete this breeding record?")) return;
      state.breedings = state.breedings.filter((b) => b.id !== id);
      saveState("Breeding deleted.");
      closeModal();
      renderCurrentView();
    });
  }

  function renderLitters() {
    const rows = state.litters.slice().sort((a,b) => (b.birthDate || "").localeCompare(a.birthDate || ""));
    $("#view-litters").innerHTML = `
      ${headerHtml(
        "Litters",
        "Record births, outcomes, weaning, and notes from each pairing.",
        `<button class="button button-primary" id="add-litter">+ Add litter</button>`
      )}
      ${rows.length ? `<div class="cards-grid">${rows.map((l) => `
        <article class="animal-card">
          <div class="animal-card-top">
            <div class="animal-avatar">◉</div>
            <span class="badge green">${formatDate(l.birthDate)}</span>
          </div>
          <h3>${esc(animalName(l.damId))} × ${esc(animalName(l.sireId))}</h3>
          <div class="meta">${Number(l.bornAlive || 0)} born alive · ${Number(l.stillborn || 0)} stillborn</div>
          <div class="meta">${Number(l.weaned || 0)} weaned</div>
          <div class="animal-card-footer">
            <span class="badge">${Number(l.bornAlive || 0)} live</span>
            <button class="button button-ghost button-small" data-edit-litter="${l.id}">Edit</button>
          </div>
        </article>`).join("")}</div>` : emptyState("No litters recorded.", "Add the result of a breeding when the litter arrives.")}`;

    $("#add-litter").addEventListener("click", () => openLitterForm());
    $$("[data-edit-litter]", $("#view-litters")).forEach((button) =>
      button.addEventListener("click", () => openLitterForm(button.dataset.editLitter)));
  }

  function openLitterForm(id = "") {
    const litter = state.litters.find((l) => l.id === id) || {};
    openModal(id ? "Edit litter" : "Add litter", `
      <form id="litter-form">
        <div class="form-grid two">
          ${selectAnimalField("Dam", "damId", litter.damId, "Female", true)}
          ${selectAnimalField("Sire", "sireId", litter.sireId, "Male", true)}
          ${field("Birth date", "birthDate", litter.birthDate || todayISO(), true, "date")}
          ${field("Born alive", "bornAlive", litter.bornAlive || 0, true, "number")}
          ${field("Stillborn", "stillborn", litter.stillborn || 0, false, "number")}
          ${field("Weaned", "weaned", litter.weaned || 0, false, "number")}
        </div>
        ${textareaField("Notes", "notes", litter.notes)}
        <div class="modal-actions">
          ${id ? `<button type="button" class="button button-danger" id="delete-litter">Delete</button>` : ""}
          <button type="button" class="button button-ghost" id="cancel-modal">Cancel</button>
          <button type="submit" class="button button-primary">${id ? "Save changes" : "Add litter"}</button>
        </div>
      </form>`, "Litter record");

    $("#cancel-modal").addEventListener("click", closeModal);
    $("#litter-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      if (id) Object.assign(litter, data, { updatedAt: new Date().toISOString() });
      else state.litters.push({ id: uid("litter"), ...data, createdAt: new Date().toISOString() });
      recordActivity(`${id ? "Updated" : "Recorded"} litter for ${animalName(data.damId)}.`, "litter");
      saveState(id ? "Litter updated." : "Litter added.");
      closeModal();
      renderCurrentView();
    });
    $("#delete-litter")?.addEventListener("click", () => {
      if (!confirm("Delete this litter record?")) return;
      state.litters = state.litters.filter((l) => l.id !== id);
      saveState("Litter deleted.");
      closeModal();
      renderCurrentView();
    });
  }

  function renderHealth() {
    const rows = state.health.slice().sort((a,b) => (b.date || "").localeCompare(a.date || ""));
    $("#view-health").innerHTML = `
      ${headerHtml(
        "Health and weights",
        "Keep weights, treatments, medications, observations, and follow-up dates together.",
        `<button class="button button-primary" id="add-health">+ Add health record</button>`
      )}
      ${rows.length ? `<div class="panel data-table-wrap">
        <table class="data-table">
          <thead><tr><th>Date</th><th>Animal</th><th>Type</th><th>Details</th><th>Weight</th><th>Follow-up</th><th></th></tr></thead>
          <tbody>${rows.map((h) => `
            <tr>
              <td>${formatDate(h.date)}</td>
              <td><strong>${esc(animalName(h.animalId))}</strong></td>
              <td><span class="badge">${esc(h.type)}</span></td>
              <td>${esc(h.details)}</td>
              <td>${esc(h.weight ? `${h.weight} ${h.weightUnit || "lb"}` : "—")}</td>
              <td>${formatDate(h.followUpDate)}</td>
              <td><button class="button button-ghost button-small" data-edit-health="${h.id}">Edit</button></td>
            </tr>`).join("")}</tbody>
        </table>
      </div>` : emptyState("No health records yet.", "Add a weight, treatment, medication, or observation.")}`;

    $("#add-health").addEventListener("click", () => openHealthForm());
    $$("[data-edit-health]", $("#view-health")).forEach((button) =>
      button.addEventListener("click", () => openHealthForm(button.dataset.editHealth)));
  }

  function openHealthForm(id = "") {
    if (!state.animals.length) {
      toast("Add an animal before creating health records.", "error");
      navigate("animals");
      return;
    }
    const health = state.health.find((h) => h.id === id) || {};
    openModal(id ? "Edit health record" : "Add health record", `
      <form id="health-form">
        <div class="form-grid two">
          ${selectAnimalField("Animal", "animalId", health.animalId, "", true)}
          ${field("Date", "date", health.date || todayISO(), true, "date")}
          ${selectField("Record type", "type", ["Weight", "Treatment", "Medication", "Vaccination", "Observation", "Veterinary visit"], health.type || "Observation", true)}
          ${field("Weight", "weight", health.weight, false, "number")}
          ${selectField("Weight unit", "weightUnit", ["lb", "oz", "kg", "g"], health.weightUnit || "lb")}
          ${field("Follow-up date", "followUpDate", health.followUpDate, false, "date")}
        </div>
        ${textareaField("Details", "details", health.details, true)}
        <div class="modal-actions">
          ${id ? `<button type="button" class="button button-danger" id="delete-health">Delete</button>` : ""}
          <button type="button" class="button button-ghost" id="cancel-modal">Cancel</button>
          <button type="submit" class="button button-primary">${id ? "Save changes" : "Add record"}</button>
        </div>
      </form>`, "Health record");

    $("#cancel-modal").addEventListener("click", closeModal);
    $("#health-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      if (id) Object.assign(health, data, { updatedAt: new Date().toISOString() });
      else state.health.push({ id: uid("health"), ...data, createdAt: new Date().toISOString() });
      recordActivity(`${id ? "Updated" : "Added"} ${data.type.toLowerCase()} record for ${animalName(data.animalId)}.`, "health");
      saveState(id ? "Health record updated." : "Health record added.");
      closeModal();
      renderCurrentView();
    });
    $("#delete-health")?.addEventListener("click", () => {
      if (!confirm("Delete this health record?")) return;
      state.health = state.health.filter((h) => h.id !== id);
      saveState("Health record deleted.");
      closeModal();
      renderCurrentView();
    });
  }

  function renderTasks() {
    const rows = state.tasks.slice().sort((a,b) => Number(a.completed) - Number(b.completed) || (a.dueDate || "").localeCompare(b.dueDate || ""));
    const complete = rows.filter((t) => t.completed).length;
    const percentage = rows.length ? Math.round((complete / rows.length) * 100) : 0;

    $("#view-tasks").innerHTML = `
      ${headerHtml(
        "Tasks and reminders",
        "Track daily chores, breeding milestones, health follow-ups, and recurring work.",
        `<button class="button button-primary" id="add-task">+ Add task</button>`
      )}
      <div class="panel" style="margin-bottom:18px">
        <div class="panel-header"><h3>Completion</h3><small>${complete} of ${rows.length} complete</small></div>
        <div class="progress-track"><div class="progress-bar" style="width:${percentage}%"></div></div>
      </div>
      ${rows.length ? `<div class="panel">
        <div class="list">${rows.map((t) => `
          <div class="list-item">
            <input class="task-check" type="checkbox" data-toggle-task="${t.id}" ${t.completed ? "checked" : ""} aria-label="Mark task complete">
            <div class="list-item-main">
              <strong style="${t.completed ? "text-decoration:line-through;opacity:.65" : ""}">${esc(t.title)}</strong>
              <span>${esc(t.category || "Task")} · ${formatDate(t.dueDate)}${t.animalId ? ` · ${esc(animalName(t.animalId))}` : ""}</span>
            </div>
            <span class="badge ${t.completed ? "gray" : daysFromNow(t.dueDate) < 0 ? "danger" : "green"}">${t.completed ? "Done" : daysFromNow(t.dueDate) < 0 ? "Overdue" : "Open"}</span>
            <button class="button button-ghost button-small" data-edit-task="${t.id}">Edit</button>
          </div>`).join("")}</div>
      </div>` : emptyState("No tasks yet.", "Add chores, reminders, or follow-up work.")}`;

    $("#add-task").addEventListener("click", () => openTaskForm());
    $$("[data-toggle-task]", $("#view-tasks")).forEach((box) => box.addEventListener("change", () => {
      const task = state.tasks.find((t) => t.id === box.dataset.toggleTask);
      task.completed = box.checked;
      recordActivity(`${box.checked ? "Completed" : "Reopened"} task: ${task.title}.`, "task");
      saveState();
      renderTasks();
    }));
    $$("[data-edit-task]", $("#view-tasks")).forEach((button) =>
      button.addEventListener("click", () => openTaskForm(button.dataset.editTask)));
  }

  function openTaskForm(id = "") {
    const task = state.tasks.find((t) => t.id === id) || {};
    openModal(id ? "Edit task" : "Add task", `
      <form id="task-form">
        <div class="form-grid two">
          ${field("Task title", "title", task.title, true)}
          ${selectField("Category", "category", ["Feeding", "Cleaning", "Breeding", "Nest box", "Weaning", "Health", "Maintenance", "Other"], task.category || "Other", true)}
          ${field("Due date", "dueDate", task.dueDate || todayISO(), true, "date")}
          ${selectAnimalField("Linked animal", "animalId", task.animalId)}
        </div>
        ${textareaField("Notes", "notes", task.notes)}
        <label style="margin-top:14px"><span><input type="checkbox" name="completed" value="true" ${task.completed ? "checked" : ""}> Mark complete</span></label>
        <div class="modal-actions">
          ${id ? `<button type="button" class="button button-danger" id="delete-task">Delete</button>` : ""}
          <button type="button" class="button button-ghost" id="cancel-modal">Cancel</button>
          <button type="submit" class="button button-primary">${id ? "Save changes" : "Add task"}</button>
        </div>
      </form>`, "Task record");

    $("#cancel-modal").addEventListener("click", closeModal);
    $("#task-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const fd = new FormData(event.currentTarget);
      const data = Object.fromEntries(fd);
      data.completed = fd.get("completed") === "true";
      if (id) Object.assign(task, data, { updatedAt: new Date().toISOString() });
      else state.tasks.push({ id: uid("task"), ...data, createdAt: new Date().toISOString() });
      recordActivity(`${id ? "Updated" : "Added"} task: ${data.title}.`, "task");
      saveState(id ? "Task updated." : "Task added.");
      closeModal();
      renderCurrentView();
    });
    $("#delete-task")?.addEventListener("click", () => {
      if (!confirm("Delete this task?")) return;
      state.tasks = state.tasks.filter((t) => t.id !== id);
      saveState("Task deleted.");
      closeModal();
      renderCurrentView();
    });
  }

  function renderSettings() {
    $("#view-settings").innerHTML = `
      ${headerHtml("Settings", "Manage your local pre-alpha workspace and move data in or out.")}
      <div class="settings-grid">
        <article class="settings-card">
          <h3>Operation profile</h3>
          <p>Update the name and contact information used in this workspace.</p>
          <div class="detail-grid">
            ${detailField("Operation", state.profile.operationName)}
            ${detailField("Owner", state.profile.ownerName)}
            ${detailField("Email", state.profile.email)}
            ${detailField("Storage", "This device only")}
          </div>
          <div class="action-row"><button class="button button-primary" id="edit-profile">Edit profile</button></div>
        </article>

        <article class="settings-card">
          <h3>Demo data</h3>
          <p>Load realistic sample records to test the workflow. Existing records will be kept.</p>
          <div class="action-row"><button class="button button-secondary" id="load-demo">Load demo data</button></div>
        </article>

        <article class="settings-card">
          <h3>Export and import</h3>
          <p>Download a full JSON backup or restore a prior HerdHarbor pre-alpha backup.</p>
          <div class="action-row">
            <button class="button button-primary" id="export-data">Export backup</button>
            <label class="button button-ghost" for="import-file">Import backup</label>
            <input class="hidden" id="import-file" type="file" accept="application/json">
          </div>
        </article>

        <article class="settings-card">
          <h3>Danger zone</h3>
          <p>Clear all local records and return to the onboarding screen. Export first if you need a backup.</p>
          <div class="action-row"><button class="button button-danger" id="clear-data">Clear all data</button></div>
        </article>

        <article class="settings-card">
          <h3>Pre-alpha limitations</h3>
          <p>This build has no user accounts, cloud sync, payment system, shared access, or guaranteed data recovery. It is for private workflow testing only.</p>
        </article>

        <article class="settings-card">
          <h3>Build information</h3>
          <p>HerdHarbor pre-alpha v0.1 · Local-first static prototype · ${new Date().toLocaleDateString()}</p>
        </article>
      </div>`;

    $("#edit-profile").addEventListener("click", openProfileForm);
    $("#load-demo").addEventListener("click", loadDemoData);
    $("#export-data").addEventListener("click", exportData);
    $("#import-file").addEventListener("change", importData);
    $("#clear-data").addEventListener("click", clearData);
  }

  function openProfileForm() {
    openModal("Edit operation profile", `
      <form id="profile-form">
        <div class="form-grid">
          ${field("Operation name", "operationName", state.profile.operationName, true)}
          ${field("Owner name", "ownerName", state.profile.ownerName, true)}
          ${field("Email", "email", state.profile.email, true, "email")}
        </div>
        <div class="modal-actions">
          <button type="button" class="button button-ghost" id="cancel-modal">Cancel</button>
          <button type="submit" class="button button-primary">Save profile</button>
        </div>
      </form>`, "Workspace settings");
    $("#cancel-modal").addEventListener("click", closeModal);
    $("#profile-form").addEventListener("submit", (event) => {
      event.preventDefault();
      Object.assign(state.profile, Object.fromEntries(new FormData(event.currentTarget)));
      saveState("Profile updated.");
      closeModal();
      showApp();
    });
  }

  function openQuickAdd() {
    openModal("Quick add", `
      <div class="cards-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">
        ${quickCard("Animal", "Create a new animal profile.", "animal")}
        ${quickCard("Breeding", "Record a pairing and due dates.", "breeding")}
        ${quickCard("Litter", "Record birth and outcome details.", "litter")}
        ${quickCard("Health", "Add a weight, treatment, or observation.", "health")}
        ${quickCard("Task", "Create a chore or reminder.", "task")}
      </div>`, "Create record");

    $$("[data-quick]").forEach((button) => button.addEventListener("click", () => {
      const type = button.dataset.quick;
      if (type === "animal") openAnimalForm();
      if (type === "breeding") openBreedingForm();
      if (type === "litter") openLitterForm();
      if (type === "health") openHealthForm();
      if (type === "task") openTaskForm();
    }));
  }

  function quickCard(title, text, type) {
    return `<button class="animal-card" data-quick="${type}" style="text-align:left;border:1px solid var(--border)">
      <h3>${title}</h3><p class="muted">${text}</p>
    </button>`;
  }

  function openModal(title, content, kicker = "HerdHarbor") {
    $("#modal-title").textContent = title;
    $("#modal-kicker").textContent = kicker;
    $("#modal-content").innerHTML = content;
    $("#modal-backdrop").classList.remove("hidden");
    $("#modal-backdrop").setAttribute("aria-hidden", "false");
    setTimeout(() => $("input, select, textarea", $("#modal-content"))?.focus(), 30);
  }

  function closeModal() {
    $("#modal-backdrop").classList.add("hidden");
    $("#modal-backdrop").setAttribute("aria-hidden", "true");
    $("#modal-content").innerHTML = "";
  }

  function field(label, name, value = "", required = false, type = "text") {
    const extra = type === "number" ? 'min="0" step="0.01"' : "";
    return `<label>${esc(label)}<input type="${type}" name="${name}" value="${esc(value ?? "")}" ${required ? "required" : ""} ${extra}></label>`;
  }

  function textareaField(label, name, value = "", required = false) {
    return `<label>${esc(label)}<textarea name="${name}" ${required ? "required" : ""}>${esc(value ?? "")}</textarea></label>`;
  }

  function selectField(label, name, options, selected = "", required = false) {
    return `<label>${esc(label)}<select name="${name}" ${required ? "required" : ""}>
      ${required ? "" : '<option value="">None / not set</option>'}
      ${options.map((option) => `<option value="${esc(option)}" ${option === selected ? "selected" : ""}>${esc(option)}</option>`).join("")}
    </select></label>`;
  }

  function selectAnimalField(label, name, selected = "", sex = "", required = false) {
    const animals = state.animals.filter((a) => !sex || a.sex === sex);
    return `<label>${esc(label)}<select name="${name}" ${required ? "required" : ""}>
      <option value="">${required ? "Choose an animal" : "None / not set"}</option>
      ${animals.map((a) => `<option value="${a.id}" ${a.id === selected ? "selected" : ""}>${esc(a.name)}${a.tag ? ` · ${esc(a.tag)}` : ""}</option>`).join("")}
    </select></label>`;
  }

  function loadDemoData() {
    if (!confirm("Add sample rabbits, breeding records, health records, and tasks?")) return;
    const buckId = uid("animal");
    const doeId = uid("animal");
    const doe2Id = uid("animal");
    const now = new Date().toISOString();

    state.animals.push(
      { id: buckId, name: "Harbor's Atlas", tag: "HH-B01", species: "Rabbit", breed: "Holland Lop", sex: "Male", dob: addDays(todayISO(), -420), color: "Broken black", location: "Barn A · Cage 1", status: "Active", sireId: "", damId: "", notes: "Demo breeding buck.", createdAt: now },
      { id: doeId, name: "Harbor's Willow", tag: "HH-D04", species: "Rabbit", breed: "Holland Lop", sex: "Female", dob: addDays(todayISO(), -360), color: "Tort", location: "Barn A · Cage 4", status: "Active", sireId: "", damId: "", notes: "Demo breeding doe.", createdAt: now },
      { id: doe2Id, name: "Harbor's Clover", tag: "HH-D06", species: "Rabbit", breed: "Holland Lop", sex: "Female", dob: addDays(todayISO(), -300), color: "Blue", location: "Barn A · Cage 6", status: "Active", sireId: "", damId: "", notes: "Demo replacement doe.", createdAt: now }
    );

    const breedingId = uid("breeding");
    state.breedings.push({
      id: breedingId, femaleId: doeId, maleId: buckId,
      breedingDate: addDays(todayISO(), -20), nestBoxDate: addDays(todayISO(), 8),
      dueDate: addDays(todayISO(), 11), status: "Confirmed", notes: "Demo breeding.", createdAt: now
    });

    state.health.push({
      id: uid("health"), animalId: doe2Id, date: addDays(todayISO(), -3),
      type: "Weight", weight: "3.4", weightUnit: "lb",
      followUpDate: addDays(todayISO(), 27), details: "Monthly development weight.", createdAt: now
    });

    state.tasks.push(
      { id: uid("task"), title: "Place nest box for Willow", category: "Nest box", dueDate: addDays(todayISO(), 8), animalId: doeId, notes: "", completed: false, createdAt: now },
      { id: uid("task"), title: "Monthly weight check for Clover", category: "Health", dueDate: addDays(todayISO(), 27), animalId: doe2Id, notes: "", completed: false, createdAt: now }
    );

    recordActivity("Loaded HerdHarbor demo data.", "setup");
    saveState("Demo data loaded.");
    renderCurrentView();
  }

  function exportData() {
    const payload = JSON.stringify({
      app: "HerdHarbor Pre-Alpha",
      version: "0.1",
      exportedAt: new Date().toISOString(),
      data: state
    }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `herdharbor-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Backup downloaded.", "success");
  }

  async function importData(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const imported = parsed.data || parsed;
      if (!imported.profile || !Array.isArray(imported.animals)) throw new Error("Invalid backup structure.");
      if (!confirm("Replace current local data with this backup?")) return;
      state = { ...structuredClone(defaultState), ...imported };
      saveState("Backup imported.");
      showApp();
    } catch (error) {
      toast(error.message || "Could not import backup.", "error");
    } finally {
      event.target.value = "";
    }
  }

  function clearData() {
    if (!confirm("Clear every local HerdHarbor record on this device?")) return;
    if (!confirm("This cannot be undone unless you exported a backup. Continue?")) return;
    localStorage.removeItem(STORAGE_KEY);
    state = structuredClone(defaultState);
    currentRoute = "dashboard";
    showOnboarding();
    toast("Local data cleared.");
  }

  initialize();
})();