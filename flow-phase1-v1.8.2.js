(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborFlowPhase1 = api;
  if (root && root.document) api.install();
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const VERSION = "1.8.2";
  const CURRENT_STATUSES = Object.freeze(["Active", "Breeding", "Growing", "Retired", "For Sale", "Reserved"]);
  const MODES = Object.freeze({
    current: new Set(CURRENT_STATUSES.map((value) => value.toLowerCase())),
    "for-sale": new Set(["for sale"]),
    sold: new Set(["sold"]),
    all: null
  });

  let animalMode = "current";
  let observer = null;
  let queued = false;
  let installed = false;

  const clean = (value) => String(value == null ? "" : value).trim();
  const lower = (value) => clean(value).toLowerCase();

  function statusVisible(status, mode = animalMode) {
    const allowed = Object.prototype.hasOwnProperty.call(MODES, mode) ? MODES[mode] : MODES.current;
    return allowed === null ? true : allowed.has(lower(status));
  }

  function eventTarget(key, state = {}, health = {}) {
    const parts = clean(key).split(":");
    const source = parts[0] || "";
    const id = parts[1] || "";
    if (!source || !id) return { kind: "route", route: "dashboard" };

    if (source === "episode") {
      const record = (health.episodes || []).find((row) => String(row.id) === id);
      return record?.animalId
        ? { kind: "animal", animalId: String(record.animalId), tab: "health", label: record.concern || "Health episode" }
        : { kind: "route", route: "health" };
    }
    if (source === "care") {
      const record = (health.careRecords || []).find((row) => String(row.id) === id);
      return record?.animalId
        ? { kind: "animal", animalId: String(record.animalId), tab: "health", label: record.product || record.type || "Care record" }
        : { kind: "route", route: "health" };
    }
    if (source === "health") {
      const record = (state.health || []).find((row) => String(row.id) === id);
      return record?.animalId
        ? { kind: "animal", animalId: String(record.animalId), tab: "health", label: record.type || "Health record" }
        : { kind: "route", route: "health" };
    }
    if (source === "task") {
      const task = (state.tasks || []).find((row) => String(row.id) === id);
      if (task?.animalId && task.sourceType === "breeding") {
        return { kind: "animal", animalId: String(task.animalId), tab: "breeding", label: task.title || "Breeding task" };
      }
      return { kind: "record", route: "tasks", id, label: task?.title || "Task" };
    }
    if (source === "show") return { kind: "record", route: "shows", id, label: "Show" };
    if (source === "group") return { kind: "route", route: "health" };
    return { kind: "route", route: source === "shows" ? "shows" : "tasks" };
  }

  function stateNow() {
    try { return root.HerdHarborApp?.getState?.() || {}; } catch { return {}; }
  }

  function healthNow(state = stateNow()) {
    try { return root.HerdHarborHealthIntelligence?.readHealthState?.() || state.healthIntelligence || {}; }
    catch { return state.healthIntelligence || {}; }
  }

  function toast(message, type = "info") {
    try { root.HerdHarborApp?.toast?.(message, type); } catch {}
  }

  function clickRoute(route) {
    const button = root.document?.querySelector(`.nav-item[data-route="${route}"]`);
    if (!button) return false;
    button.click();
    return true;
  }

  function waitFor(selector, callback, attempt = 0) {
    const node = root.document?.querySelector(selector);
    if (node) {
      callback(node);
      return;
    }
    if (attempt >= 45) return;
    root.setTimeout?.(() => waitFor(selector, callback, attempt + 1), 50);
  }

  function resetAnimalFilters() {
    const host = root.document?.querySelector("#view-animals");
    if (!host) return;
    const search = host.querySelector("#animal-search");
    const species = host.querySelector("#animal-species");
    const sex = host.querySelector("#animal-sex");
    const status = host.querySelector("#animal-status");
    if (search && search.value) {
      search.value = "";
      search.dispatchEvent(new Event("input", { bubbles: true }));
    }
    [species, sex, status].forEach((field) => {
      if (!field || !field.value) return;
      field.value = "";
      field.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function openAnimalTarget(target) {
    if (!target?.animalId) return false;
    if (!clickRoute("animals")) return false;
    waitFor("#view-animals #animal-results", () => {
      resetAnimalFilters();
      root.setTimeout?.(() => {
        waitFor(`[data-view-animal="${CSS.escape(target.animalId)}"]`, (button) => {
          button.click();
          waitFor(".hh-p1-profile-hub", (hub) => {
            const tab = hub.querySelector(`[data-hh-p1-tab="${target.tab || "overview"}"]`);
            tab?.click();
            const panel = hub.querySelector(`[data-hh-p1-panel="${target.tab || "overview"}"]`);
            if (panel && target.label) {
              const needle = lower(target.label);
              const row = Array.from(panel.querySelectorAll(".hh-p1-record-list article"))
                .find((item) => lower(item.textContent).includes(needle));
              if (row) {
                row.classList.add("hh-flow-target-record");
                row.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
                root.setTimeout?.(() => row.classList.remove("hh-flow-target-record"), 3200);
              }
            }
          });
        });
      }, 30);
    });
    return true;
  }

  function openRecordTarget(target) {
    if (!clickRoute(target.route)) return false;
    const selectors = target.route === "tasks"
      ? [`[data-edit-task="${target.id}"]`, `[data-task-id="${target.id}"]`, `[data-task="${target.id}"]`]
      : [`[data-edit-show="${target.id}"]`, `[data-show-id="${target.id}"]`, `[data-show="${target.id}"]`];
    const tryOpen = (attempt = 0) => {
      for (const selector of selectors) {
        const node = root.document?.querySelector(selector);
        if (node) {
          node.click();
          return;
        }
      }
      if (attempt < 20) root.setTimeout?.(() => tryOpen(attempt + 1), 60);
    };
    tryOpen();
    return true;
  }

  function openTodayEvent(key) {
    const state = stateNow();
    const target = eventTarget(key, state, healthNow(state));
    if (target.kind === "animal") return openAnimalTarget(target);
    if (target.kind === "record") return openRecordTarget(target);
    return clickRoute(target.route);
  }

  function ensureQuickFilterBar(host) {
    let bar = host.querySelector(".hh-flow-animal-filters");
    if (bar) return bar;
    const toolbar = host.querySelector(".toolbar");
    if (!toolbar) return null;
    bar = root.document.createElement("div");
    bar.className = "hh-flow-animal-filters";
    bar.setAttribute("aria-label", "Animal record view");
    bar.innerHTML = [
      ["current", "Current"],
      ["for-sale", "For sale"],
      ["sold", "Sold"],
      ["all", "All"]
    ].map(([mode, label]) =>
      `<button type="button" class="button button-small ${mode === animalMode ? "button-primary" : "button-ghost"}" data-hh-flow-animal-mode="${mode}" aria-pressed="${mode === animalMode}">${label}</button>`
    ).join("");
    toolbar.insertAdjacentElement("afterend", bar);
    bar.addEventListener("click", (event) => {
      const button = event.target.closest?.("[data-hh-flow-animal-mode]");
      if (!button) return;
      animalMode = button.dataset.hhFlowAnimalMode || "current";
      bar.querySelectorAll("[data-hh-flow-animal-mode]").forEach((item) => {
        const active = item.dataset.hhFlowAnimalMode === animalMode;
        item.setAttribute("aria-pressed", String(active));
        item.classList.toggle("button-primary", active);
        item.classList.toggle("button-ghost", !active);
      });
      applyAnimalMode(host);
    });
    return bar;
  }

  function applyAnimalMode(host = root.document?.querySelector("#view-animals")) {
    if (!host) return false;
    const rootResults = host.querySelector("#animal-results");
    if (!rootResults) return false;
    const cards = Array.from(rootResults.querySelectorAll(".animal-card"));
    let visible = 0;
    cards.forEach((card) => {
      const status = clean(card.querySelector(".badge")?.textContent);
      const show = statusVisible(status, animalMode);
      card.hidden = !show;
      if (show) visible += 1;
    });
    rootResults.querySelector(".hh-flow-empty")?.remove();
    if (cards.length && visible === 0) {
      const empty = root.document.createElement("div");
      empty.className = "empty-state hh-flow-empty";
      empty.innerHTML = `<strong>No ${animalMode === "current" ? "current" : animalMode.replace("-", " ")} animals match.</strong><p>Change the quick view or the search filters.</p>`;
      rootResults.appendChild(empty);
    }
    return true;
  }

  function enhanceAnimals() {
    const host = root.document?.querySelector("#view-animals");
    if (!host || !host.classList.contains("active")) return false;
    const status = host.querySelector("#animal-status");
    if (!status || !host.querySelector("#animal-results")) return false;

    if (!host.dataset.hhFlowCurrentInitialized) {
      host.dataset.hhFlowCurrentInitialized = "1";
      if (status.value === "Active") {
        status.value = "";
        status.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }
    ensureQuickFilterBar(host);
    applyAnimalMode(host);
    return true;
  }

  function enhanceAddAnimal() {
    const form = root.document?.querySelector("#animal-form");
    if (!form || form.dataset.hhFlowSimple === "1") return false;
    const title = clean(root.document?.querySelector("#modal-title")?.textContent);
    if (title !== "Add animal") return false;

    form.dataset.hhFlowSimple = "1";
    const essential = new Set(["name", "species", "sex", "tag", "tattoo", "status"]);
    const grid = form.querySelector(".form-grid.two");
    if (!grid) return false;

    Array.from(grid.children).forEach((child) => {
      const field = child.matches?.("[name]") ? child : child.querySelector?.("[name]");
      const name = field?.getAttribute?.("name");
      if (name && !essential.has(name)) child.classList.add("hh-flow-advanced-field");
    });
    form.querySelector(".photo-upload-card")?.classList.add("hh-flow-advanced-field");
    const notes = form.querySelector("textarea[name='notes']")?.closest("label");
    notes?.classList.add("hh-flow-advanced-field");

    const intro = root.document.createElement("div");
    intro.className = "hh-flow-add-animal-intro";
    intro.innerHTML = `<strong>Start with the basics.</strong><span>Name, species, sex, ID, and status are enough to create the record. Add pedigree, registration, birth details, pricing, and photos when you need them.</span>
      <button type="button" class="button button-ghost button-small" data-hh-flow-more-animal aria-expanded="false">Show more details</button>`;
    grid.insertAdjacentElement("beforebegin", intro);
    intro.querySelector("[data-hh-flow-more-animal]")?.addEventListener("click", (event) => {
      const expanded = form.classList.toggle("hh-flow-show-advanced");
      event.currentTarget.setAttribute("aria-expanded", String(expanded));
      event.currentTarget.textContent = expanded ? "Hide extra details" : "Show more details";
    });
    return true;
  }

  function enhanceIncomingTransfers() {
    const panel = root.document?.querySelector("#hh-p1-today");
    const count = Number(root.document?.querySelector('.nav-item[data-route="sales"] .hh-direct-nav-badge')?.textContent || 0);
    if (!panel) return false;
    let row = panel.querySelector(".hh-flow-transfer-alert");
    if (!count) {
      row?.remove();
      return false;
    }
    if (!row) {
      row = root.document.createElement("button");
      row.type = "button";
      row.className = "hh-flow-transfer-alert";
      row.addEventListener("click", () => clickRoute("sales"));
      const head = panel.querySelector(".hh-p1-today-head");
      if (head) head.insertAdjacentElement("afterend", row);
      else panel.prepend(row);
    }
    row.innerHTML = `<strong>${count} incoming animal transfer${count === 1 ? "" : "s"} waiting</strong><span>Review and accept the animal, pedigree, genetics, and provenance from the seller.</span><b>Review</b>`;
    return true;
  }

  function enhance() {
    enhanceAnimals();
    enhanceAddAnimal();
    enhanceIncomingTransfers();
  }

  function runEnhance() {
    queued = false;
    const body = root.document?.body;
    if (observer && body) observer.disconnect();
    try { enhance(); }
    finally { if (observer && body) observer.observe(body, { childList: true, subtree: true, characterData: true }); }
  }

  function scheduleEnhance() {
    if (queued) return;
    queued = true;
    if (typeof root.requestAnimationFrame === "function") root.requestAnimationFrame(runEnhance);
    else root.setTimeout?.(runEnhance, 0);
  }

  function install() {
    if (installed || !root.document) return API;
    installed = true;

    root.document.addEventListener("click", (event) => {
      const today = event.target.closest?.("[data-hh-p1-event]");
      if (!today) return;
      event.preventDefault();
      event.stopPropagation();
      openTodayEvent(today.dataset.hhP1Event || "");
    }, true);

    root.addEventListener?.("herdharbor:app-ready", scheduleEnhance);
    root.addEventListener?.("herdharbor:health-intelligence-changed", scheduleEnhance);
    observer = new root.MutationObserver(scheduleEnhance);
    if (root.document.body) observer.observe(root.document.body, { childList: true, subtree: true, characterData: true });
    scheduleEnhance();
    return API;
  }

  function uninstall() {
    observer?.disconnect?.();
    observer = null;
    queued = false;
    installed = false;
  }

  const API = Object.freeze({
    VERSION,
    CURRENT_STATUSES,
    statusVisible,
    eventTarget,
    install,
    uninstall
  });
  return API;
});
