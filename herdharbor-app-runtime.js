
(() => {
  "use strict";

  // The release identity comes from herdharbor-build.js; this fallback must match the current public release.
  const APP_VERSION = window.HerdHarborBuild?.version || "2.0.0";
  const STORAGE_KEY = "herdharbor_pre_alpha_v1";
  const ATTACHMENT_DB = "herdharbor_attachments_v1";
  const ATTACHMENT_STORE = "pedigreeDocuments";

  async function ensureSpreadsheetToolsReady(options = {}) {
    const ensure = window.HerdHarborOptionalTools?.ensureSpreadsheetTools;
    if (typeof ensure !== "function") {
      throw new Error("The Excel tool loader is unavailable. Reload HerdHarbor and try again.");
    }
    const spreadsheet = await ensure(options);
    if (!spreadsheet) throw new Error("The Excel tools did not finish loading. Check your connection and try again.");
    return spreadsheet;
  }

  async function ensureQrToolsReady() {
    const ensure = window.HerdHarborOptionalTools?.ensureQrTools;
    if (typeof ensure !== "function") {
      throw new Error("The QR tool loader is unavailable. Reload HerdHarbor and try again.");
    }
    const qrcode = await ensure();
    if (typeof qrcode !== "function") throw new Error("The QR tool did not finish loading. Check your connection and try again.");
    return qrcode;
  }

  const defaultState = {
    profile: null,
    animals: [],
    breedings: [],
    litters: [],
    pedigrees: [],
    pedigreeDrafts: [],
    health: [],
    tasks: [],
    customers: [],
    sales: [],
    payments: [],
    transfers: [],
    transactions: [],
    productionRecords: [],
    budgetPlans: [],
    annualBudgetPlans: [],
    budgetMonthSettings: {},
    activity: [],
    settings: {
      species: ["Rabbit", "Chicken", "Duck", "Turkey", "Dog", "Horse", "Goat", "Sheep", "Cattle", "Pig", "Other"],
      breedsBySpecies: {},
      analyticsColors: {},
      preferredWeightDisplay: "lb",
      marketAnalyticsConsent: {
        enabled: false,
        consentVersion: "",
        enabledAt: "",
        disabledAt: "",
        includeHistorical: false,
        regionCountry: "US",
        regionCode: "",
        broadRegion: ""
      },
      theme: "system",
      sidebarCollapsed: false
    }
  };

  const canonicalStateStore = window.HerdHarborStateStore || null;
  let state = loadState();
  let lastSavedRaw = canonicalStateStore?.getRaw?.() || localStorage.getItem(STORAGE_KEY) || "";
  const requestedRoute = String(window.location.hash || "").replace(/^#/, "");
  let currentRoute = ["dashboard", "analytics", "animals", "pedigrees", "documents", "marketplace", "breeding", "litters", "health", "symptoms", "tasks", "budget", "sales", "settings", "admin"].includes(requestedRoute)
    ? requestedRoute
    : "dashboard";
  let pendingAdminRoute = requestedRoute === "admin";
  let symptomView = {
    animalId: "",
    species: "",
    search: "",
    urgency: "All"
  };
  let deepLinkHandled = false;

  const PAYMENT_TYPE_OPTIONS = ["Deposit", "Payment"];
  const PAYMENT_METHOD_OPTIONS = ["Cash", "Check", "Card", "Bank transfer", "PayPal / Venmo", "Other"];
  const COMMON_BREEDS = {
    Rabbit: ["American", "American Chinchilla", "American Fuzzy Lop", "Belgian Hare", "Beveren", "Californian", "Champagne d’Argent", "Checkered Giant", "Dutch", "English Angora", "English Lop", "Flemish Giant", "French Angora", "French Lop", "Harlequin", "Havana", "Himalayan", "Holland Lop", "Jersey Wooly", "Lionhead", "Mini Lop", "Mini Rex", "Netherland Dwarf", "New Zealand", "Polish", "Rex", "Satin", "Silver Fox"],
    Chicken: ["Ameraucana", "Australorp", "Brahma", "Cochin", "Cornish", "Easter Egger", "Leghorn", "Marans", "New Hampshire", "Orpington", "Plymouth Rock", "Rhode Island Red", "Silkie", "Sussex", "Wyandotte"],
    Duck: ["American Pekin", "Ancona", "Cayuga", "Indian Runner", "Khaki Campbell", "Mallard", "Muscovy", "Rouen", "Swedish"],
    Turkey: ["Beltsville Small White", "Black", "Blue Slate", "Bourbon Red", "Broad Breasted White", "Bronze", "Narragansett", "Royal Palm"],
    Dog: ["Australian Cattle Dog", "Australian Shepherd", "Beagle", "Belgian Malinois", "Bernese Mountain Dog", "Border Collie", "Boston Terrier", "Boxer", "Bulldog", "Cane Corso", "Chihuahua", "Dachshund", "Doberman Pinscher", "English Shepherd", "German Shepherd Dog", "Golden Retriever", "Great Dane", "Great Pyrenees", "Labrador Retriever", "Mastiff", "Miniature Schnauzer", "Poodle", "Rottweiler", "Siberian Husky", "Yorkshire Terrier"],
    Horse: ["American Paint Horse", "American Quarter Horse", "American Saddlebred", "Andalusian", "Appaloosa", "Arabian", "Belgian", "Clydesdale", "Friesian", "Gypsy Vanner", "Haflinger", "Hanoverian", "Icelandic Horse", "Kentucky Mountain Saddle Horse", "Miniature Horse", "Missouri Fox Trotter", "Morgan", "Mustang", "Paso Fino", "Percheron", "Shetland Pony", "Standardbred", "Tennessee Walking Horse", "Thoroughbred", "Welsh Pony"],
    Goat: ["Alpine", "Angora", "Boer", "Kiko", "LaMancha", "Myotonic", "Nigerian Dwarf", "Nubian", "Pygmy", "Saanen", "Spanish", "Toggenburg"],
    Sheep: ["Cheviot", "Corriedale", "Dorper", "Dorset", "Finnsheep", "Hampshire", "Katahdin", "Lincoln", "Merino", "Rambouillet", "Shetland", "Southdown", "Suffolk"],
    Cattle: ["Angus", "Beefmaster", "Belted Galloway", "Brahman", "Brown Swiss", "Charolais", "Dexter", "Gelbvieh", "Guernsey", "Hereford", "Highland", "Holstein", "Jersey", "Limousin", "Red Angus", "Shorthorn", "Simmental"],
    Pig: ["American Guinea Hog", "Berkshire", "Chester White", "Duroc", "Gloucestershire Old Spots", "Hampshire", "Hereford", "Kunekune", "Landrace", "Large Black", "Mangalitsa", "Poland China", "Tamworth", "Yorkshire"]
  };

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

  const scheduledUiWork = new Map();
  function scheduleUiWork(key, callback) {
    if (scheduledUiWork.has(key)) {
      scheduledUiWork.set(key, callback);
      return;
    }
    scheduledUiWork.set(key, callback);
    const run = window.requestAnimationFrame || ((next) => setTimeout(next, 16));
    run(() => {
      const next = scheduledUiWork.get(key);
      scheduledUiWork.delete(key);
      next?.();
    });
  }

  const lazyScriptPromises = new Map();

  function loadScriptOnce(src, ready = () => false) {
    if (ready()) return Promise.resolve(true);
    if (lazyScriptPromises.has(src)) return lazyScriptPromises.get(src);

    let existing = [...document.scripts].find((script) => {
      try {
        return new URL(script.src, window.location.href).pathname === new URL(src, window.location.href).pathname;
      } catch {
        return false;
      }
    });

    if (existing && !ready()) {
      existing.remove();
      existing = null;
    }

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const finish = () => {
        if (ready()) resolve(true);
        else reject(new Error(`Lazy feature asset loaded without registering: ${src}`));
      };
      const fail = () => reject(new Error(`Lazy feature asset could not load: ${src}`));

      script.addEventListener("load", finish, { once: true });
      script.addEventListener("error", fail, { once: true });
      script.src = src;
      script.async = true;
      script.dataset.hhLazyAsset = "true";
      document.head.appendChild(script);
    }).catch((error) => {
      lazyScriptPromises.delete(src);
      throw error;
    });

    lazyScriptPromises.set(src, promise);
    return promise;
  }

  const lazyStylePromises = new Map();

  function loadStyleOnce(href) {
    const absolute = new URL(href, window.location.href).href;
    const existing = [...document.querySelectorAll('link[rel="stylesheet"]')].find((link) => link.href === absolute);
    if (existing) return Promise.resolve(true);
    if (lazyStylePromises.has(absolute)) return lazyStylePromises.get(absolute);

    const promise = new Promise((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.dataset.hhLazyAsset = "true";
      link.addEventListener("load", () => resolve(true), { once: true });
      link.addEventListener("error", () => reject(new Error(`Lazy feature stylesheet could not load: ${href}`)), { once: true });
      document.head.appendChild(link);
    }).catch((error) => {
      lazyStylePromises.delete(absolute);
      throw error;
    });

    lazyStylePromises.set(absolute, promise);
    return promise;
  }

  function lazyRouteLoadingMarkup(title) {
    return `${headerHtml(title, "Loading this feature only when you need it.")}
      <div class="panel"><p class="muted">Loading…</p></div>`;
  }

  function renderLazyRoute(route, title, loader, render) {
    const target = $(`#view-${route}`);
    if (target) target.innerHTML = lazyRouteLoadingMarkup(title);

    void loader()
      .then(() => {
        if (currentRoute === route) render();
      })
      .catch((error) => {
        console.error(`HerdHarbor could not lazy-load ${route}:`, error);
        if (currentRoute !== route || !target) return;
        target.innerHTML = `${headerHtml(title, "This feature could not finish loading.")}
          ${emptyState("Feature unavailable right now.", "Check your connection and try opening this section again.")}`;
      });
  }

  async function ensureAnalyticsRuntime() {
    await Promise.all([
      loadStyleOnce("analytics-v1.6.1.css?v=2"),
      loadScriptOnce(
        "analytics-v1.6.1.js?v=2",
        () => typeof window.HerdHarborAnalytics?.render === "function"
      )
    ]);
    return window.HerdHarborAnalytics;
  }

  async function ensurePedigreePlatformRuntime() {
    await Promise.all([
      loadStyleOnce("herdharbor-breeder-platform.css?v=1"),
      loadScriptOnce(
        "herdharbor-pedigree-platform.js?v=1",
        () => typeof window.HerdHarborPedigreePlatform?.buildPedigreeGraph === "function"
      )
    ]);
    return window.HerdHarborPedigreePlatform;
  }

  async function ensureDocumentCenterRuntime() {
    await ensurePedigreePlatformRuntime();
    return loadScriptOnce(
      "herdharbor-document-center.js?v=1",
      () => typeof window.HerdHarborDocumentCenter?.renderHub === "function"
    );
  }

  async function ensureDirectTransferRuntime() {
    await Promise.all([
      loadStyleOnce("direct-transfer-v1.8.2.css?v=1"),
      loadScriptOnce(
        "direct-transfer-core-v1.8.2.js?v=1",
        () => typeof window.HerdHarborDirectTransferCore?.buildTransferPayload === "function"
      )
    ]);
    await loadScriptOnce(
      "direct-transfer-v1.8.2.js?v=1",
      () => typeof window.HerdHarborDirectTransfers?.sendSale === "function"
    );
    return window.HerdHarborDirectTransfers;
  }

  const marketplaceActionShims = Object.freeze({
    ensureDocumentCenter: ensureDocumentCenterRuntime,
    ensureDirectTransfer: ensureDirectTransferRuntime
  });

  async function ensureAnimalProfileRuntimeLoaded() {
    await ensurePedigreePlatformRuntime();
    return loadScriptOnce(
      "animal-profile-runtime-v1.8.3.js?v=1",
      () => typeof window.HerdHarborAnimalProfileRuntime?.create === "function"
    );
  }

  function ensureHealthRuntimeLoaded() {
    return loadScriptOnce(
      "health-runtime-v1.8.3.js?v=1",
      () => typeof window.HerdHarborHealthRuntime?.create === "function"
    );
  }

  function ensureProductionReportingRuntimeLoaded() {
    return loadScriptOnce(
      "production-reporting-runtime-v1.8.3.js?v=1",
      () => typeof window.HerdHarborProductionReportingRuntime?.create === "function"
    );
  }

  async function ensureMarketplaceRuntime() {
    await ensurePedigreePlatformRuntime();
    return loadScriptOnce(
      "herdharbor-marketplace.js?v=1",
      () => typeof window.HerdHarborMarketplace?.renderMarketplace === "function"
    );
  }

  function ensureSymptomGuide() {
    return loadScriptOnce(
      "symptom-guide.js?v=1",
      () => Boolean(window.HERDHARBOR_SYMPTOM_GUIDE?.entries?.length)
    );
  }

  function ensureAdminRuntimeLoaded() {
    return loadScriptOnce(
      "herdharbor-admin-v1.6.1.js?v=2",
      () => typeof window.HerdHarborAdmin?.render === "function"
    );
  }

  function ensureSettingsRuntimeLoaded() {
    return loadScriptOnce(
      "settings-runtime-v1.8.3.js?v=1",
      () => typeof window.HerdHarborSettingsRuntime?.create === "function"
    );
  }

  function ensureProfitabilityAnalyticsLoaded() {
    return loadScriptOnce(
      "profitability-analytics-v1.8.3.js?v=1",
      () => typeof window.HerdHarborProfitabilityAnalytics?.operationSummary === "function"
    );
  }

  function loadState() {
    try {
      const storedState = canonicalStateStore?.load?.();
      const parsed = storedState && typeof storedState === "object"
        ? storedState
        : JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!parsed || typeof parsed !== "object") return structuredClone(defaultState);
      return {
        ...structuredClone(defaultState),
        ...parsed,
        breedings: Array.isArray(parsed.breedings) ? parsed.breedings : [],
        litters: Array.isArray(parsed.litters) ? parsed.litters : [],
        pedigreeDrafts: Array.isArray(parsed.pedigreeDrafts) ? parsed.pedigreeDrafts : [],
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        customers: Array.isArray(parsed.customers) ? parsed.customers : [],
        sales: Array.isArray(parsed.sales) ? parsed.sales : [],
        payments: Array.isArray(parsed.payments) ? parsed.payments : [],
        transfers: Array.isArray(parsed.transfers) ? parsed.transfers : [],
        productionRecords: Array.isArray(parsed.productionRecords) ? parsed.productionRecords : [],
        settings: {
          ...defaultState.settings,
          ...(parsed.settings || {}),
          marketAnalyticsConsent: {
            ...defaultState.settings.marketAnalyticsConsent,
            ...(parsed.settings?.marketAnalyticsConsent || {})
          }
        }
      };
    } catch {
      return structuredClone(defaultState);
    }
  }

  function saveState(message = "") {
    try {
      if (!canonicalStateStore?.commit) {
        throw new Error("The canonical HerdHarbor state store is unavailable.");
      }
      const result = canonicalStateStore.commit(state, {
        source: "local",
        reason: message || "state-save"
      });
      if (!result?.ok) throw result?.error || new Error("The local state commit failed.");
      lastSavedRaw = result.rawValue || JSON.stringify(state);
      if (message) toast(message, "success");
      return true;
    } catch (error) {
      toast("This device could not durably save the change. Download a safety backup before adding more records or photos.", "error");
      return false;
    }
  }

  function openAttachmentDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("This browser does not support attachment storage."));
      const request = indexedDB.open(ATTACHMENT_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(ATTACHMENT_STORE)) {
          request.result.createObjectStore(ATTACHMENT_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Attachment storage could not open."));
    });
  }

  async function attachmentRequest(mode, action) {
    const db = await openAttachmentDb();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(ATTACHMENT_STORE, mode);
        const store = transaction.objectStore(ATTACHMENT_STORE);
        const request = action(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("Attachment storage failed."));
        transaction.onabort = () => reject(transaction.error || new Error("Attachment storage was interrupted."));
      });
    } finally {
      db.close();
    }
  }

  const putPedigreeAttachment = (id, document) =>
    attachmentRequest("readwrite", (store) => store.put(document, id));
  const getPedigreeAttachment = (id) =>
    attachmentRequest("readonly", (store) => store.get(id));
  const deletePedigreeAttachment = (id) =>
    attachmentRequest("readwrite", (store) => store.delete(id));

  async function migratePedigreeAttachments() {
    const pending = [];
    state.pedigrees.forEach((record) => {
      if (!record.sourceDataUrl) return;
      pending.push({ id: record.id, record, document: {
        dataUrl: record.sourceDataUrl,
        fileName: record.fileName || "Pedigree source",
        mimeType: record.mimeType || "",
        size: record.fileSize || 0
      }});
    });
    state.pedigreeDrafts.forEach((draft) => {
      if (!draft.sourceDocument?.dataUrl) return;
      pending.push({ id: draft.id, record: draft, document: draft.sourceDocument, draft: true });
    });
    if (!pending.length) return;
    try {
      for (const item of pending) {
        await putPedigreeAttachment(item.id, item.document);
        if (item.draft) item.record.sourceDocument = { ...item.document, dataUrl: "", attachmentStored: true };
        else {
          item.record.sourceDataUrl = "";
          item.record.attachmentStored = true;
        }
      }
      saveState();
      if (currentRoute === "pedigrees") renderPedigrees();
      toast(`${pending.length} pedigree attachment${pending.length === 1 ? " was" : "s were"} moved to expanded device storage.`, "success");
    } catch (error) {
      console.error("Pedigree attachment migration was safely paused:", error);
    }
  }

  async function requestDurableDeviceStorage() {
    try {
      if (navigator.storage?.persist) await navigator.storage.persist();
    } catch (error) {
      console.warn("Persistent device storage was not granted:", error);
    }
  }

  function schedulePedigreeAttachmentMigration() {
    const run = () => { void migratePedigreeAttachments(); };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 1800 });
    } else {
      window.setTimeout(run, 180);
    }
  }

  async function stateWithPedigreeAttachments() {
    const copy = structuredClone(state);
    for (const record of copy.pedigrees || []) {
      if (!record.attachmentStored || record.sourceDataUrl) continue;
      const document = await getPedigreeAttachment(record.id).catch(() => null);
      if (document?.dataUrl) record.sourceDataUrl = document.dataUrl;
    }
    for (const draft of copy.pedigreeDrafts || []) {
      if (!draft.sourceDocument?.attachmentStored || draft.sourceDocument.dataUrl) continue;
      const document = await getPedigreeAttachment(draft.id).catch(() => null);
      if (document?.dataUrl) draft.sourceDocument = document;
    }
    return copy;
  }

  window.HerdHarborAttachments = { stateWithPedigreeAttachments };

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


  function formatMoney(value) {
    const amount = Number(value || 0);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number.isFinite(amount) ? amount : 0);
  }

  function currentMonthKey() {
    return todayISO().slice(0, 7);
  }

  function monthLabel(monthKey) {
    if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return "All time";
    const [year, month] = monthKey.split("-").map(Number);
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric"
    }).format(new Date(year, month - 1, 1));
  }

  function budgetPeriodLabel(periodKey) {
    return /^\d{4}$/.test(String(periodKey || ""))
      ? `Full year ${periodKey}`
      : monthLabel(periodKey);
  }

  function activeAnimals() {
    const membership = typeof window !== "undefined" ? window.HerdHarborMembership : null;
    return state.animals.filter((animal) => membership?.isActiveAnimal?.(animal)
      ?? !["Sold", "Deceased", "Archived", "Ancestor Only"].includes(animal.status));
  }

  function allowsAnimalTransition(beforeAnimals, afterAnimals) {
    const policy = typeof window !== "undefined" ? window.HerdHarborMembership?.enforceAnimalTransition : null;
    return typeof policy === "function" ? policy(beforeAnimals, afterAnimals) : true;
  }

  function transactionSpecies(transaction) {
    if (transaction.species) return transaction.species;
    if (transaction.animalId) {
      return state.animals.find((animal) => animal.id === transaction.animalId)?.species || "";
    }
    return "";
  }

  function transactionScopeLabel(transaction) {
    if (transaction.scope === "Animal") return animalName(transaction.animalId);
    if (transaction.scope === "Species") return transaction.species || "Species";
    return "Whole operation";
  }

  function monthTransactions(monthKey = currentMonthKey()) {
    const key = String(monthKey || "");
    const length = /^\d{4}$/.test(key) ? 4 : 7;
    return state.transactions.filter((transaction) =>
      !key || String(transaction.date || "").slice(0, length) === key
    );
  }

  function operatingExpenseTransactions(monthKey = currentMonthKey()) {
    return monthTransactions(monthKey).filter((transaction) =>
      transaction.type === "Expense" && transaction.classification !== "Capital"
    );
  }

  function budgetSummary(monthKey = currentMonthKey(), speciesFilter = "") {
    const all = monthTransactions(monthKey);
    const active = activeAnimals();
    const totalCount = active.length;
    const speciesCount = speciesFilter
      ? active.filter((animal) => animal.species === speciesFilter).length
      : totalCount;

    const amountForView = (transaction) => {
      const amount = Number(transaction.amount || 0);
      if (!speciesFilter) return amount;
      if (transaction.scope === "Operation") {
        return totalCount > 0 ? amount * (speciesCount / totalCount) : 0;
      }
      return transactionSpecies(transaction) === speciesFilter ? amount : 0;
    };

    const income = all
      .filter((transaction) => transaction.type === "Income")
      .reduce((sum, transaction) => sum + amountForView(transaction), 0);
    const operating = all
      .filter((transaction) => transaction.type === "Expense" && transaction.classification !== "Capital")
      .reduce((sum, transaction) => sum + amountForView(transaction), 0);
    const capital = all
      .filter((transaction) => transaction.type === "Expense" && transaction.classification === "Capital")
      .reduce((sum, transaction) => sum + amountForView(transaction), 0);
    return {
      income,
      operating,
      capital,
      totalExpenses: operating + capital,
      net: income - operating - capital
    };
  }

  function effectiveHeadCount(monthKey = currentMonthKey()) {
    if (/^\d{4}$/.test(String(monthKey || ""))) {
      const yearlyOverrides = Object.entries(state.budgetMonthSettings || {})
        .filter(([key]) => key.startsWith(`${monthKey}-`))
        .map(([, setting]) => Number(setting?.averageHeadCount || 0))
        .filter((count) => count > 0);
      if (yearlyOverrides.length) {
        return yearlyOverrides.reduce((sum, count) => sum + count, 0) / yearlyOverrides.length;
      }
    }
    const override = Number(state.budgetMonthSettings?.[monthKey]?.averageHeadCount || 0);
    return override > 0 ? override : activeAnimals().length;
  }

  function operationCostPerHead(monthKey = currentMonthKey()) {
    const count = effectiveHeadCount(monthKey);
    const expenses = operatingExpenseTransactions(monthKey)
      .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
    return count > 0 ? expenses / count : 0;
  }

  function daysFromNow(dateString) {
    if (!dateString) return null;
    const today = new Date(`${todayISO()}T12:00:00`);
    const target = new Date(`${dateString}T12:00:00`);
    return Math.round((target - today) / 86400000);
  }

  let animalIndexSource = null;
  let animalIndexSize = -1;
  let animalIndex = new Map();

  function animalById(id) {
    if (animalIndexSource !== state.animals || animalIndexSize !== state.animals.length) {
      animalIndexSource = state.animals;
      animalIndexSize = state.animals.length;
      animalIndex = new Map(state.animals.map((animal) => [animal.id, animal]));
    }
    return animalIndex.get(id) || null;
  }

  function animalName(id) {
    return animalById(id)?.name || "Unknown";
  }

  function greatPyreneesOutline() {
    return `<img class="species-outline species-outline-dog" src="great-pyrenees-outline-d7c57423367e.png" alt="Great Pyrenees default image" loading="lazy" decoding="async">`;
  }

  function speciesIcon(species = "") {
    const icons = {
      Rabbit: "🐇", Chicken: "🐔", Duck: "🦆", Turkey: "🦃",
      Dog: greatPyreneesOutline(), Horse: "🐎", Goat: "🐐", Sheep: "🐑",
      Cattle: "🐄", Pig: "🐖", Other: "◈"
    };
    return icons[species] || "◈";
  }

  function animalVisualHtml(animal, compact = false) {
    if (animal?.photoData) {
      return `<img src="${animal.photoData}" alt="${esc(animal.name || "Animal")} photo">`;
    }
    return `<span aria-hidden="true">${speciesIcon(animal?.species)}</span>`;
  }

  function defaultHerdHarborLogo() {
    return $(".brand img")?.src || "";
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


  function resolvedTheme(mode = state.settings?.theme || "system") {
    if (mode === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return mode === "dark" ? "dark" : "light";
  }

  function applyTheme(mode = "system", persist = true) {
    state.settings = { ...defaultState.settings, ...(state.settings || {}), theme: mode };
    const resolved = resolvedTheme(mode);
    document.documentElement.dataset.theme = resolved;
    localStorage.setItem("herdharbor_theme", mode);
    const button = $("#theme-toggle");
    if (button) {
      button.textContent = resolved === "dark" ? "☀" : "☾";
      button.title = resolved === "dark" ? "Switch to light mode" : "Switch to dark mode";
      button.setAttribute("aria-label", button.title);
    }
    if (persist) saveState();
  }

  function toggleTheme() {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  }

  function applySidebarState(persist = false) {
    const collapsed = Boolean(state.settings?.sidebarCollapsed);
    document.body.classList.toggle("sidebar-collapsed", collapsed);
    const button = $("#sidebar-collapse");
    if (button) {
      button.title = collapsed ? "Expand navigation" : "Collapse navigation";
      button.setAttribute("aria-label", button.title);
    }
    if (persist) saveState();
  }

  function toggleSidebarCollapse() {
    state.settings.sidebarCollapsed = !state.settings.sidebarCollapsed;
    applySidebarState(true);
  }

  function currentSyncDetails() {
    return window.HerdHarborCloud?.getSyncDetails?.() || {
      message: navigator.onLine === false
        ? "Offline; records remain protected on this device."
        : "Checking cloud sync…",
      type: "working",
      signedIn: false,
      online: navigator.onLine !== false,
      unsynced: false,
      syncing: true,
      conflict: false,
      lastSyncedAt: ""
    };
  }

  function formatSyncTimestamp(value) {
    if (!value) return "Not confirmed yet";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not confirmed yet";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(date);
  }

  function refreshSyncStatus(details = currentSyncDetails()) {
    const sidebar = $("#sidebar-sync-status");
    const sidebarLabel = $("#sidebar-sync-label");
    const sidebarDetail = $("#sidebar-sync-detail");
    const stateType = details.conflict ? "error" : details.syncing ? "working" : details.type || "info";
    const statusLabel = details.conflict
      ? "Action required"
      : details.syncing
        ? "Syncing"
        : details.unsynced
          ? "Waiting to sync"
          : details.signedIn
            ? "Protected"
            : "Checking";
    const lastSynced = formatSyncTimestamp(details.lastSyncedAt);
    const topbar = $("#topbar-sync");
    const topbarLabel = $("#topbar-sync-label");
    const topbarDetail = $("#topbar-sync-detail");
    if (topbar) topbar.dataset.state = stateType;
    if (topbarLabel) topbarLabel.textContent = details.conflict
      ? "Attention"
      : details.syncing
        ? "Syncing"
        : details.unsynced
          ? "Pending"
          : details.online
            ? "Synced"
            : "Offline";
    if (topbarDetail) topbarDetail.textContent = details.conflict
      ? "Sync needs review"
      : details.unsynced
        ? "Changes pending"
        : details.lastSyncedAt
          ? lastSynced
          : "Cloud Sync";

    if (sidebar) sidebar.dataset.state = stateType;
    if (sidebarLabel) {
      sidebarLabel.textContent = details.conflict
        ? "Sync needs attention"
        : details.unsynced
          ? "Changes waiting to sync"
          : details.online
            ? "Cloud copy protected"
            : "Offline copy protected";
    }
    if (sidebarDetail) {
      sidebarDetail.textContent = details.online
        ? (details.lastSyncedAt ? `Last synced ${lastSynced}` : "Protected account storage")
        : "Will sync after reconnection";
    }

    const message = $("#settings-sync-message");
    const summary = $("#settings-sync-summary");
    const status = $("#settings-sync-status");
    const last = $("#settings-last-synced");
    const connection = $("#settings-sync-connection");
    const pending = $("#settings-sync-pending");
    if (message) message.textContent = details.message || "Checking cloud sync…";
    if (summary) summary.dataset.state = stateType;
    if (status) status.textContent = statusLabel;
    if (last) last.textContent = lastSynced;
    if (connection) connection.textContent = details.online ? "Online" : "Offline";
    if (pending) pending.textContent = details.conflict
      ? "Conflict protected"
      : details.unsynced
        ? "Yes"
        : "No";
  }

  function initialize() {
    state.settings = { ...defaultState.settings, ...(state.settings || {}) };
    state.settings.marketAnalyticsConsent = {
      ...defaultState.settings.marketAnalyticsConsent,
      ...(state.settings.marketAnalyticsConsent || {})
    };
    if (!["lb", "lb+oz", "oz", "kg", "g"].includes(state.settings.preferredWeightDisplay)) {
      state.settings.preferredWeightDisplay = "lb";
    }
    state.settings.species = Array.isArray(state.settings.species)
      ? [...state.settings.species]
      : [...defaultState.settings.species];
    let settingsMigrated = false;
    ["Dog", "Horse"].forEach((requiredSpecies) => {
      if (state.settings.species.some((species) => String(species).toLowerCase() === requiredSpecies.toLowerCase())) return;
      const otherIndex = state.settings.species.findIndex((species) => String(species).toLowerCase() === "other");
      if (otherIndex >= 0) state.settings.species.splice(otherIndex, 0, requiredSpecies);
      else state.settings.species.push(requiredSpecies);
      settingsMigrated = true;
    });
    state.settings.breedsBySpecies = state.settings.breedsBySpecies && typeof state.settings.breedsBySpecies === "object"
      ? state.settings.breedsBySpecies
      : {};
    state.animals.forEach((animal) => {
      const species = String(animal.species || "").trim();
      const breed = String(animal.breed || "").trim();
      if (!species || !breed) return;
      const remembered = Array.isArray(state.settings.breedsBySpecies[species])
        ? state.settings.breedsBySpecies[species]
        : [];
      if (!remembered.some((item) => item.toLowerCase() === breed.toLowerCase())) {
        state.settings.breedsBySpecies[species] = [...remembered, breed].sort((a, b) => a.localeCompare(b));
        settingsMigrated = true;
      }
    });
    state.breedings = Array.isArray(state.breedings) ? state.breedings : [];
    state.litters = Array.isArray(state.litters) ? state.litters : [];
    state.tasks = Array.isArray(state.tasks) ? state.tasks : [];
    state.customers = Array.isArray(state.customers) ? state.customers : [];
    state.sales = Array.isArray(state.sales) ? state.sales : [];
    let salePricingMigrated = false;
    state.sales.forEach((sale) => {
      if (!Array.isArray(sale.items)) return;
      sale.items.forEach((item) => {
        if (item.salePrice === undefined && item.unitPrice !== undefined) {
          item.salePrice = item.unitPrice;
          salePricingMigrated = true;
        }
        if (item.listedPriceAtSale === undefined) {
          item.listedPriceAtSale = null;
          salePricingMigrated = true;
        }
      });
    });
    state.payments = Array.isArray(state.payments) ? state.payments : [];
    state.transfers = Array.isArray(state.transfers) ? state.transfers : [];
    state.pedigreeDrafts = Array.isArray(state.pedigreeDrafts) ? state.pedigreeDrafts : [];
    state.transactions = Array.isArray(state.transactions) ? state.transactions : [];
    state.productionRecords = Array.isArray(state.productionRecords) ? state.productionRecords : [];
    state.budgetPlans = Array.isArray(state.budgetPlans) ? state.budgetPlans : [];
    state.annualBudgetPlans = Array.isArray(state.annualBudgetPlans) ? state.annualBudgetPlans : [];
    state.budgetMonthSettings = state.budgetMonthSettings && typeof state.budgetMonthSettings === "object"
      ? state.budgetMonthSettings
      : {};
    const workflowMigrated = [
      ...state.breedings.map((breeding) => syncBreedingReminders(breeding, { migration: true })),
      ...state.litters.map((litter) => syncBirthReminder(litter, { migration: true }))
    ].some(Boolean);
    if (settingsMigrated || salePricingMigrated || workflowMigrated) saveState();
    applyTheme(state.settings.theme || localStorage.getItem("herdharbor_theme") || "system", false);
    applySidebarState(false);

    $("#onboarding-form").addEventListener("submit", handleOnboarding);
    $("#menu-button").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
    $("#modal-close").addEventListener("click", closeModal);
    $("#modal-backdrop").addEventListener("click", (event) => {
      if (event.target.id === "modal-backdrop") closeModal();
    });
    $("#theme-toggle").addEventListener("click", toggleTheme);
    $("#sidebar-collapse").addEventListener("click", toggleSidebarCollapse);
    $("#feedback-button").addEventListener("click", openFeedbackForm);
    $("#quick-add-button").addEventListener("click", openQuickAdd);
    $("#profile-button").addEventListener("click", () => navigate("settings"));
    $("#topbar-sync").addEventListener("click", () => navigate("settings"));
    document.addEventListener("herdharbor:sync-status", (event) => {
      refreshSyncStatus(event.detail);
    });
    document.addEventListener("herdharbor:membership-change", () => {
      const account = window.HerdHarborMembership?.getAccount?.() || {};
      const allowed = syncAdminNavigation();
      if (pendingAdminRoute && account.backendReady === true) {
        pendingAdminRoute = false;
        if (allowed) {
          navigate("admin");
          return;
        }
      }
      if (currentRoute === "settings") renderSettings();
      if (currentRoute === "admin") renderCurrentView();
    });
    document.addEventListener("herdharbor:request-upgrade", () => {
      if (window.HerdHarborBilling?.enabled?.()) {
        toast("Member upgrade options are loading. Your current records remain unchanged.", "info");
      } else {
        toast("Member upgrades are temporarily unavailable. Your current records remain safe and available.", "info");
      }
    });

    $$(".nav-item, .brand").forEach((item) => {
      item.addEventListener("click", (event) => {
        event.preventDefault();
        navigate(item.dataset.route);
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeModal();
    });

    window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
      if (state.settings.theme === "system") applyTheme("system", false);
    });

    if (state.profile) showApp();
    else showOnboarding();
    refreshSyncStatus();
    syncAdminNavigation();
    requestDurableDeviceStorage();
    schedulePedigreeAttachmentMigration();

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
    const operationLogo = $("#operation-logo");
    if (state.profile?.logoData) {
      operationLogo.src = state.profile.logoData;
      operationLogo.alt = `${state.profile.operationName || "Rabbitry"} logo`;
      operationLogo.classList.remove("hidden");
    } else {
      operationLogo.removeAttribute("src");
      operationLogo.alt = "";
      operationLogo.classList.add("hidden");
    }
    navigate(currentRoute);
    if (!deepLinkHandled) {
      const animalId = new URLSearchParams(window.location.search).get("animal") || "";
      if (animalId) {
        deepLinkHandled = true;
        navigate("animals");
        setTimeout(() => {
          if (state.animals.some((animal) => animal.id === animalId)) openAnimalDetail(animalId);
          else toast("That animal is not available in this signed-in farm account.", "error");
        }, 0);
      }
    }
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
    recordActivity("Created the HerdHarbor workspace.", "setup");
    saveState();
    showApp();
  }

  function syncAdminNavigation() {
    const account = window.HerdHarborMembership?.getAccount?.() || {};
    const allowed = window.HerdHarborMembership?.canAccessAdmin?.() === true;
    const nav = document.querySelector('[data-route="admin"]');
    if (nav) {
      nav.hidden = !allowed;
      nav.setAttribute("aria-hidden", String(!allowed));
    }
    if (!allowed && account.backendReady === true && currentRoute === "admin") {
      pendingAdminRoute = false;
      navigate("dashboard");
    }
    return allowed;
  }

  function navigate(route) {
    if (route !== "admin" && pendingAdminRoute) pendingAdminRoute = false;
    if (route === "admin" && window.HerdHarborMembership?.canAccessAdmin?.() !== true) {
      const account = window.HerdHarborMembership?.getAccount?.() || {};
      currentRoute = "dashboard";
      if (account.backendReady !== true) {
        pendingAdminRoute = true;
      } else {
        pendingAdminRoute = false;
        toast("Admin Members is available only to authorized Owner and Admin accounts.", "error");
      }
      route = "dashboard";
    }
    currentRoute = route || "dashboard";
    try { window.dispatchEvent(new CustomEvent("herdharbor:route-change", { detail: { route: currentRoute } })); } catch {}
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
      analytics: "Analytics",
      animals: "Animal records",
      breeding: "Breeding and pregnancy",
      litters: "Birth and litter records",
      pedigrees: "Pedigree imports",
      documents: "Animal documents",
      marketplace: "Marketplace",
      health: "Health and weights",
      symptoms: "Educational symptom guide",
      tasks: "Tasks and reminders",
      budget: "Budget and cost per head",
      sales: "Sales, customers, and transfers",
      settings: "Workspace settings",
      admin: "Admin · Members"
    })[route] || "Overview";
  }

  function renderCurrentView() {
    const renderers = {
      dashboard: renderDashboard,
      analytics: () => {
        if (typeof window.HerdHarborAnalytics?.render === "function") {
          window.HerdHarborAnalytics.render({ state, saveState, navigate, toast });
          return;
        }
        renderLazyRoute(
          "analytics",
          "Analytics",
          ensureAnalyticsRuntime,
          () => window.HerdHarborAnalytics?.render?.({ state, saveState, navigate, toast })
        );
      },
      animals: renderAnimals,
      breeding: () => {
        if (typeof window.HerdHarborPedigreePlatform?.buildPedigreeGraph === "function") {
          renderBreedings();
          return;
        }
        renderLazyRoute("breeding", "Breeding", ensurePedigreePlatformRuntime, renderBreedings);
      },
      litters: renderLitters,
      pedigrees: () => {
        if (typeof window.HerdHarborPedigreePlatform?.buildPedigreeGraph === "function") {
          renderPedigrees();
          return;
        }
        renderLazyRoute("pedigrees", "Pedigrees", ensurePedigreePlatformRuntime, renderPedigrees);
      },
      documents: () => {
        if (typeof window.HerdHarborDocumentCenter?.renderHub === "function") {
          window.HerdHarborDocumentCenter.renderHub({ target: $("#view-documents"), state, toast, escapeHtml: esc });
          return;
        }
        renderLazyRoute(
          "documents",
          "Documents",
          ensureDocumentCenterRuntime,
          () => window.HerdHarborDocumentCenter?.renderHub?.({ target: $("#view-documents"), state, toast, escapeHtml: esc })
        );
      },
      marketplace: () => {
        if (typeof window.HerdHarborMarketplace?.renderMarketplace === "function") {
          window.HerdHarborMarketplace.renderMarketplace({ target: $("#view-marketplace"), state, toast, actions: marketplaceActionShims });
          return;
        }
        renderLazyRoute(
          "marketplace",
          "Marketplace",
          ensureMarketplaceRuntime,
          () => window.HerdHarborMarketplace?.renderMarketplace?.({ target: $("#view-marketplace"), state, toast, actions: marketplaceActionShims })
        );
      },
      health: renderHealth,
      symptoms: () => {
        if (window.HERDHARBOR_SYMPTOM_GUIDE?.entries?.length) {
          renderSymptoms();
          return;
        }
        renderLazyRoute("symptoms", "Symptom guide", ensureSymptomGuide, renderSymptoms);
      },
      tasks: renderTasks,
      budget: renderBudget,
      sales: () => {
        renderSales();
        void ensureDirectTransferRuntime().catch((error) => {
          console.warn("HerdHarbor Direct Transfer could not load for Sales:", error);
        });
      },
      settings: renderSettings,
      admin: () => {
        if (typeof window.HerdHarborAdmin?.render === "function") {
          window.HerdHarborAdmin.render();
          return;
        }
        renderLazyRoute(
          "admin",
          "Admin",
          ensureAdminRuntimeLoaded,
          () => window.HerdHarborAdmin?.render?.()
        );
      }
    };
    renderers[currentRoute]?.();
  }

  function headerHtml(title, description, actions = "") {
    return `
      <div class="page-header">
        <div>
          <p class="eyebrow">HerdHarbor</p>
          <h2>${esc(title)}</h2>
          <p>${esc(description)}</p>
        </div>
        <div class="header-actions">${actions}</div>
      </div>`;
  }

  function renderDashboard() {
    taskRuntime().syncDerivedAutomation();
    const activeAnimalCount = activeAnimals().length;
    const today = todayISO();
    let openTasks = 0;
    let overdueTasks = 0;
    let dueTodayTasks = 0;
    let openBreedings = 0;
    let dueSoon = 0;
    const todaysWorkCandidates = [];
    const upcomingCandidates = [];

    for (const task of state.tasks) {
      if (task.completed) continue;
      openTasks += 1;
      if (task.dueDate === today) dueTodayTasks += 1;
      else if (task.dueDate && task.dueDate < today) overdueTasks += 1;

      if (task.dueDate && task.dueDate <= today) {
        todaysWorkCandidates.push(task);
      } else if (task.dueDate > today) {
        const recurrence = taskRecurrenceLabel(task);
        upcomingCandidates.push({
          title: task.title,
          subtitle: `${task.category || "Task"} · ${formatDate(task.dueDate)}${recurrence ? ` · ${recurrence}` : ""}`,
          date: task.dueDate,
          icon: "✓",
          tone: "teal"
        });
      }
    }

    for (const breeding of state.breedings) {
      const status = normalizeBreedingStatus(breeding.status);
      if (["Not pregnant", "Delivered", "Cancelled"].includes(status)) continue;
      openBreedings += 1;
      const daysUntilDue = daysFromNow(breeding.dueDate);
      if (daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 14) {
        dueSoon += 1;
      }
      upcomingCandidates.push({
        title: `${animalName(breeding.femaleId)} × ${animalName(breeding.maleId)}`,
        subtitle: `Due ${formatDate(breeding.dueDate)}`,
        date: breeding.dueDate,
        icon: "♡",
        tone: "green"
      });
    }

    const todaysWork = todaysWorkCandidates.sort(taskSort).slice(0, 6);
    const upcoming = upcomingCandidates
      .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"))
      .slice(0, 6);

    const activity = state.activity.slice(0, 6);
    const finance = budgetSummary(currentMonthKey());
    const monthlyCostPerHead = operationCostPerHead(currentMonthKey());

    $("#view-dashboard").innerHTML = `
      ${headerHtml(
        `Good ${greeting()}, ${state.profile.ownerName.split(" ")[0]}.`,
        "Here is the current picture of your operation.",
        `<button class="button button-ghost" data-action="add-task">+ Add task</button>
         <button class="button button-primary" data-action="add-animal">+ Add animal</button>`
      )}
      <section class="dashboard-release-panel" aria-label="HerdHarbor release highlights">
        <div class="dashboard-release-copy">
          <p class="eyebrow">What’s new</p>
          <h3>One connected workflow across HerdHarbor</h3>
          <p>Animal profiles, breeding and litters, Health, tasks, sales, reporting, and analytics now work together together to create a smoother stream from one record to the next.</p>
        </div>
        <div class="dashboard-release-points">
          <span>Animal-first workflows</span>
          <span>Smarter tasks &amp; reminders</span>
          <span>Growth, litter &amp; profitability analytics</span>
          <span>Improved mobile &amp; offline use</span>
        </div>
        <div class="dashboard-ai-soon">
          <strong>More tools on the way</strong>
          <span>Additional assisted workflows are being prepared for a future release.</span>
        </div>
      </section>
      <div class="stats-grid">
        ${statCard("Animals", activeAnimalCount, `${state.animals.length} total records`)}
        ${statCard("Active breedings", openBreedings, `${dueSoon} due within 14 days`)}
        ${statCard("Open tasks", openTasks, `${dueTodayTasks} today · ${overdueTasks} overdue`)}
        ${statCard("Births & litters", state.litters.length, `${state.litters.reduce((sum, l) => sum + Number(l.bornAlive || 0), 0)} live births recorded`)}
      </div>
      <button class="finance-snapshot" id="dashboard-budget-snapshot" type="button" aria-label="Open budget">
        <div><small>${monthLabel(currentMonthKey())} income</small><strong>${formatMoney(finance.income)}</strong></div>
        <div><small>Operating expenses</small><strong>${formatMoney(finance.operating)}</strong></div>
        <div><small>Net after all expenses</small><strong>${formatMoney(finance.net)}</strong></div>
        <div><small>Operating cost per head</small><strong>${formatMoney(monthlyCostPerHead)}</strong></div>
      </button>
      <div class="panel task-today-panel">
        <div class="panel-header">
          <div><h3>Today’s work</h3><small>Overdue tasks stay here until they are finished or rescheduled</small></div>
          <button class="button button-ghost button-small" id="dashboard-view-tasks">View tasks</button>
        </div>
        ${todaysWork.length ? `<div class="list">${todaysWork.map((task) => `
          <div class="list-item">
            <input class="task-check" type="checkbox" data-dashboard-task="${task.id}" aria-label="Complete ${esc(task.title)}">
            <div class="list-item-main">
              <strong>${esc(task.title)}</strong>
              <span>${esc(task.category || "Task")} · ${formatDate(task.dueDate)}${task.animalId ? ` · ${esc(animalName(task.animalId))}` : ""}${taskRecurrenceLabel(task) ? ` · ${esc(taskRecurrenceLabel(task))}` : ""}</span>
            </div>
            <span class="badge ${task.dueDate < today ? "danger" : "green"}">${task.dueDate < today ? "Overdue" : "Today"}</span>
          </div>`).join("")}</div>` : emptyState("Today is clear.", "New and recurring work due today will appear here.")}
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
          ${activity.length ? `<div class="list activity-list">${activity.map((item) => `
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
    $('[data-action="add-task"]', $("#view-dashboard"))?.addEventListener("click", () => openTaskForm());
    $("#dashboard-view-tasks")?.addEventListener("click", () => {
      taskRuntime().setFilterStatus("Today");
      navigate("tasks");
    });
    $("[data-dashboard-task]", $("#view-dashboard")).forEach((box) => box.addEventListener("change", () => {
      const task = state.tasks.find((item) => item.id === box.dataset.dashboardTask);
      if (!task) return;
      const next = setTaskCompleted(task, box.checked);
      recordActivity(`Completed task: ${task.title}.`, "task");
      saveState(next ? `Task completed. Next task scheduled for ${formatDate(next.dueDate)}.` : "Task completed.");
      renderDashboard();
    }));
    $("#dashboard-budget-snapshot")?.addEventListener("click", () => navigate("budget"));
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

  let animalProfileRuntimeInstance = null;

  function animalProfileRuntime() {
    if (animalProfileRuntimeInstance) return animalProfileRuntimeInstance;
    const create = window.HerdHarborAnimalProfileRuntime?.create;
    if (typeof create !== "function") {
      throw new Error("The Animals/Profile runtime module did not load.");
    }
    animalProfileRuntimeInstance = create({
      getState: () => state,
      getCurrentRoute: () => currentRoute,
      scheduleUiWork,
      $,
      $$,
      esc,
      headerHtml,
      emptyState,
      animalVisualHtml,
      ageText,
      openPedigreeImport,
      openModal,
      closeModal,
      field,
      selectField,
      breedComboboxField,
      selectAnimalField,
      textareaField,
      speciesIcon,
      breedOptionsFor,
      prepareProfileImage,
      toast,
      allowsAnimalTransition,
      uid,
      rememberBreed,
      recordActivity,
      saveState,
      renderCurrentView,
      completeWorkflowTasks,
      formatDate,
      formatMoney,
      detailField,
      navigate,
      openPrintPedigreeForm,
      ensureQrToolsReady
    });
    return animalProfileRuntimeInstance;
  }

  function renderAnimals() {
    if (
      typeof window.HerdHarborAnimalProfileRuntime?.create === "function" &&
      typeof window.HerdHarborPedigreePlatform?.buildPedigreeGraph === "function"
    ) {
      return animalProfileRuntime().renderAnimals();
    }
    renderLazyRoute(
      "animals",
      "Animal records",
      ensureAnimalProfileRuntimeLoaded,
      () => animalProfileRuntime().renderAnimals()
    );
  }

  async function openAnimalForm(id = "", defaults = {}) {
    try {
      await ensureAnimalProfileRuntimeLoaded();
      return animalProfileRuntime().openAnimalForm(id, defaults);
    } catch (error) {
      console.error("HerdHarbor could not load Animal records:", error);
      toast("Animal tools could not load. Check your connection and try again.", "error");
      return false;
    }
  }

  async function openAnimalDetail(id) {
    try {
      await ensureAnimalProfileRuntimeLoaded();
      return animalProfileRuntime().openAnimalDetail(id);
    } catch (error) {
      console.error("HerdHarbor could not load Animal records:", error);
      toast("Animal details could not load. Check your connection and try again.", "error");
      return false;
    }
  }

  function pedigreeRecordPreviewHtml(subject, record = null) {
    return animalProfileRuntime().pedigreeRecordPreviewHtml(subject, record);
  }

  function detailField(label, value) {
    return `<div class="detail-field"><small>${esc(label)}</small><strong>${esc(value || "—")}</strong></div>`;
  }

  function completeWorkflowTasks(sourceType, sourceRecordId, now = new Date().toISOString()) {
    let changed = false;
    state.tasks.forEach((task) => {
      if (task.sourceType !== sourceType || task.sourceRecordId !== sourceRecordId || task.completed) return;
      task.completed = true;
      task.completedAt = now;
      task.updatedAt = now;
      changed = true;
    });
    return changed;
  }

  let breedingLitterRuntimeInstance = null;

  function breedingLitterRuntime() {
    if (breedingLitterRuntimeInstance) return breedingLitterRuntimeInstance;
    const create = window.HerdHarborBreedingLitterRuntime?.create;
    if (typeof create !== "function") {
      throw new Error("The Breeding/Litter runtime module did not load.");
    }
    breedingLitterRuntimeInstance = create({
      getState: () => state,
      $,
      $$,
      esc,
      headerHtml,
      statCard,
      emptyState,
      animalName,
      formatDate,
      daysFromNow,
      ensureSpreadsheetToolsReady,
      openModal,
      closeModal,
      selectAnimalField,
      field,
      selectField,
      textareaField,
      todayISO,
      toast,
      navigate,
      uid,
      recordActivity,
      saveState,
      renderCurrentView,
      addDays,
      allowsAnimalTransition,
      rememberBreed,
      completeWorkflowTasks
    });
    return breedingLitterRuntimeInstance;
  }

  function normalizeBreedingStatus(value = "") {
    return breedingLitterRuntime().normalizeBreedingStatus(value);
  }

  function syncBreedingReminders(breeding, options = {}) {
    return breedingLitterRuntime().syncBreedingReminders(breeding, options);
  }

  function syncBirthReminder(litter, options = {}) {
    return breedingLitterRuntime().syncBirthReminder(litter, options);
  }

  function renderBreedings() {
    return breedingLitterRuntime().renderBreedings();
  }

  function openBreedingForm(id = "", defaults = {}) {
    return breedingLitterRuntime().openBreedingForm(id, defaults);
  }

  function renderLitters() {
    return breedingLitterRuntime().renderLitters();
  }

  function openLitterForm(id = "", breedingId = "") {
    return breedingLitterRuntime().openLitterForm(id, breedingId);
  }

  function openRecordBirth(breedingId) {
    return breedingLitterRuntime().openRecordBirth(breedingId);
  }

  const PEDIGREE_SLOTS = [
    { key: "sire", label: "Sire", sex: "Male", generation: "Parents" },
    { key: "dam", label: "Dam", sex: "Female", generation: "Parents" },
    { key: "sireSire", label: "Sire's sire", sex: "Male", generation: "Grandparents" },
    { key: "sireDam", label: "Sire's dam", sex: "Female", generation: "Grandparents" },
    { key: "damSire", label: "Dam's sire", sex: "Male", generation: "Grandparents" },
    { key: "damDam", label: "Dam's dam", sex: "Female", generation: "Grandparents" },
    { key: "sireSireSire", label: "Sire's sire's sire", sex: "Male", generation: "Great-grandparents" },
    { key: "sireSireDam", label: "Sire's sire's dam", sex: "Female", generation: "Great-grandparents" },
    { key: "sireDamSire", label: "Sire's dam's sire", sex: "Male", generation: "Great-grandparents" },
    { key: "sireDamDam", label: "Sire's dam's dam", sex: "Female", generation: "Great-grandparents" },
    { key: "damSireSire", label: "Dam's sire's sire", sex: "Male", generation: "Great-grandparents" },
    { key: "damSireDam", label: "Dam's sire's dam", sex: "Female", generation: "Great-grandparents" },
    { key: "damDamSire", label: "Dam's dam's sire", sex: "Male", generation: "Great-grandparents" },
    { key: "damDamDam", label: "Dam's dam's dam", sex: "Female", generation: "Great-grandparents" }
  ];

  const PEDIGREE_RELATIONS = [
    ["subject", "sireId", "sire"],
    ["subject", "damId", "dam"],
    ["sire", "sireId", "sireSire"],
    ["sire", "damId", "sireDam"],
    ["dam", "sireId", "damSire"],
    ["dam", "damId", "damDam"],
    ["sireSire", "sireId", "sireSireSire"],
    ["sireSire", "damId", "sireSireDam"],
    ["sireDam", "sireId", "sireDamSire"],
    ["sireDam", "damId", "sireDamDam"],
    ["damSire", "sireId", "damSireSire"],
    ["damSire", "damId", "damSireDam"],
    ["damDam", "sireId", "damDamSire"],
    ["damDam", "damId", "damDamDam"]
  ];

  function existingPedigreeAncestry(subjectId) {
    const animalsById = new Map(state.animals.map((animal) => [animal.id, animal]));
    const ancestorIds = {};
    const queue = [{ key: "subject", id: subjectId, path: new Set(subjectId ? [subjectId] : []) }];

    while (queue.length) {
      const current = queue.shift();
      const animal = animalsById.get(current.id);
      if (!animal) continue;

      PEDIGREE_RELATIONS
        .filter(([ownerKey]) => ownerKey === current.key)
        .forEach(([, relationField, parentKey]) => {
          const parentId = String(animal[relationField] || "").trim();
          if (!parentId || !animalsById.has(parentId) || current.path.has(parentId)) return;
          ancestorIds[parentKey] = parentId;
          queue.push({ key: parentKey, id: parentId, path: new Set([...current.path, parentId]) });
        });
    }

    return ancestorIds;
  }

  function renderPedigrees() {
    const imports = state.pedigrees.slice().sort((a,b) => (b.importedAt || "").localeCompare(a.importedAt || ""));
    const drafts = (state.pedigreeDrafts || []).slice().sort((a,b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
    $("#view-pedigrees").innerHTML = `
      ${headerHtml(
        "Pedigrees",
        "Build pedigrees one generation at a time, save unfinished work, and print a professional pedigree when an animal is sold.",
        `<button class="button button-primary" id="import-pedigree">+ Build or import pedigree</button>`
      )}
      <div class="pedigree-intro">
        <div class="pedigree-intro-card"><strong>1. Choose the animal</strong><span>Select an existing animal and optionally add a source photo or PDF.</span></div>
        <div class="pedigree-intro-card"><strong>2. Work generation by generation</strong><span>Parents, grandparents, and great-grandparents are separated into clear steps.</span></div>
        <div class="pedigree-intro-card"><strong>3. Save or print</strong><span>Save drafts for later and print a clean sale pedigree from any completed record.</span></div>
      </div>
      ${drafts.length ? `<div class="panel draft-panel">
        <div class="panel-header"><h3>Unfinished pedigree drafts</h3><small>${drafts.length} saved</small></div>
        <div class="list">${drafts.map((draft) => {
          const subject = state.animals.find((a) => a.id === draft.subjectAnimalId);
          return `<div class="list-item draft-card">
            <div class="list-icon warning">✎</div>
            <div class="list-item-main">
              <strong>${esc(subject?.name || "Untitled pedigree")}</strong>
              <span>Step ${Number(draft.step || 1)} of 5 · Saved ${new Date(draft.savedAt).toLocaleString()}</span>
            </div>
            <div class="list-item-actions">
              <button class="button button-primary button-small" data-resume-pedigree-draft="${draft.id}">Resume</button>
              <button class="button button-danger button-small" data-delete-pedigree-draft="${draft.id}">Delete</button>
            </div>
          </div>`;
        }).join("")}</div>
      </div>` : ""}
      ${imports.length ? `<div class="panel">
        <div class="panel-header"><h3>Completed pedigrees</h3><small>${imports.length} records</small></div>
        <div class="list">${imports.map((p) => {
          const subject = state.animals.find((a) => a.id === p.subjectAnimalId);
          const ancestorCount = Object.values(p.ancestorIds || {}).filter(Boolean).length;
          return `<div class="list-item pedigree-document-card">
            <div class="pedigree-document-icon">${p.mimeType === "application/pdf" ? "PDF" : (p.sourceDataUrl || p.attachmentStored) ? "▧" : "⌘"}</div>
            <div class="list-item-main">
              <strong>${esc(subject?.name || "Deleted animal")}</strong>
              <span>${esc(p.fileName || "Manual pedigree")} · ${ancestorCount} ancestors · ${new Date(p.importedAt).toLocaleString()}</span>
            </div>
            <div class="list-item-actions">
              <button type="button" class="button button-ghost button-small" data-view-pedigree="${p.id}">View</button>
              <button type="button" class="button button-ghost button-small" data-print-pedigree="${p.subjectAnimalId}">Print</button>
              <button type="button" class="button button-danger button-small" data-delete-pedigree="${p.id}">Delete</button>
            </div>
          </div>`;
        }).join("")}</div>
      </div>` : emptyState("No completed pedigrees yet.", "Start the guided builder and save a completed pedigree.")}`;

    $("#import-pedigree").addEventListener("click", () => openPedigreeImport());
    $$('[data-resume-pedigree-draft]', $("#view-pedigrees")).forEach((button) =>
      button.addEventListener("click", () => openPedigreeImport("", button.dataset.resumePedigreeDraft)));
    $$('[data-delete-pedigree-draft]', $("#view-pedigrees")).forEach((button) =>
      button.addEventListener("click", () => deletePedigreeDraft(button.dataset.deletePedigreeDraft)));
    const completedList = $("#view-pedigrees");
    completedList.addEventListener("click", (event) => {
      const viewButton = event.target.closest("[data-view-pedigree]");
      const printButton = event.target.closest("[data-print-pedigree]");
      const deleteButton = event.target.closest("[data-delete-pedigree]");
      if (viewButton) openPedigreeRecord(viewButton.dataset.viewPedigree);
      else if (printButton) openPrintPedigreeForm(printButton.dataset.printPedigree);
      else if (deleteButton) deletePedigreeRecord(deleteButton.dataset.deletePedigree);
    });
  }

  function ancestorCardHtml(slot, initial = {}) {
    const existingId = initial.existingId || "";
    const manual = initial.manual || {};
    const hasManual = Boolean(manual.name || manual.tag || manual.registrationNumber || manual.breed || manual.color || manual.breeder);
    const options = state.animals
      .filter((animal) => !slot.sex || animal.sex === slot.sex || animal.sex === "Unknown")
      .sort((a,b) => (a.name || "").localeCompare(b.name || ""))
      .map((animal) => `<option value="${animal.id}" ${animal.id === existingId ? "selected" : ""}>${esc(animal.name)}${animal.earTagNumber || animal.tag ? ` · ${esc(animal.earTagNumber || animal.tag)}` : ""}</option>`)
      .join("");

    return `<article class="ancestor-card ${existingId ? "linked" : ""}" data-ancestor-card="${slot.key}">
      <div class="ancestor-card-header">
        <strong>${esc(slot.label)}</strong>
        <span class="badge ${slot.sex === "Male" ? "" : "green"}">${slot.sex}</span>
      </div>
      <label>Use an animal already in HerdHarbor
        <select name="${slot.key}_existingId" data-existing-select="${slot.key}">
          <option value="">Unknown or enter a new ancestor</option>
          ${options}
        </select>
      </label>
      <details class="ancestor-manual" ${hasManual ? "open" : ""}>
        <summary>Enter a new ancestor instead</summary>
        <div class="ancestor-fields">
          ${field("Name", `${slot.key}_name`, manual.name || "")}
          ${field("ID / tattoo", `${slot.key}_tag`, manual.tag || "")}
          ${field("Registration", `${slot.key}_registrationNumber`, manual.registrationNumber || "")}
          ${field("Breed", `${slot.key}_breed`, manual.breed || "")}
          ${field("Color / variety", `${slot.key}_color`, manual.color || "")}
          ${field("Breeder", `${slot.key}_breeder`, manual.breeder || "")}
        </div>
      </details>
      <div class="match-hint" data-match-hint="${slot.key}"></div>
      <div class="ancestor-tools"><button type="button" class="text-button" data-clear-ancestor="${slot.key}">Clear / mark unknown</button></div>
    </article>`;
  }

  async function openPedigreeImport(subjectAnimalId = "", draftId = "") {
    if (!state.animals.some((animal) => animal.status !== "Ancestor Only")) {
      toast("Add the animal receiving the pedigree before building it.", "error");
      navigate("animals");
      return;
    }

    const storedDraft = (state.pedigreeDrafts || []).find((draft) => draft.id === draftId) || null;
    const initial = storedDraft?.data || {};
    let sourceDocument = storedDraft?.sourceDocument || null;
    if (storedDraft && sourceDocument?.attachmentStored && !sourceDocument.dataUrl) {
      sourceDocument = await getPedigreeAttachment(storedDraft.id).catch(() => sourceDocument);
    }
    let currentStep = Math.min(5, Math.max(1, Number(storedDraft?.step || 1)));
    const selectedSubjectId = subjectAnimalId || initial.subjectAnimalId || "";

    const subjectOptions = state.animals
      .filter((animal) => animal.status !== "Ancestor Only")
      .sort((a,b) => (a.name || "").localeCompare(b.name || ""))
      .map((animal) => `<option value="${animal.id}" ${animal.id === selectedSubjectId ? "selected" : ""}>${esc(animal.name)}${animal.earTagNumber || animal.tag ? ` · ${esc(animal.earTagNumber || animal.tag)}` : ""}</option>`)
      .join("");

    const slotsFor = (generation) => PEDIGREE_SLOTS
      .filter((slot) => slot.generation === generation)
      .map((slot) => ancestorCardHtml(slot, initial.ancestors?.[slot.key] || {}))
      .join("");

    openModal(storedDraft ? "Resume pedigree draft" : "Build or import pedigree", `
      <form id="pedigree-import-form">
        <div class="pedigree-stepper" aria-label="Pedigree builder steps">
          ${[
            [1, "Animal & source"],
            [2, "Parents"],
            [3, "Grandparents"],
            [4, "Great-grandparents"],
            [5, "Review & save"]
          ].map(([step, label]) => `<button type="button" class="pedigree-step-button" data-wizard-step="${step}"><span>${step}</span><span>${label}</span></button>`).join("")}
        </div>

        <section class="wizard-panel" data-pedigree-step="1">
          <div class="wizard-heading"><h3>Choose the animal and source</h3><p>Start with the animal receiving this pedigree. A source photo or PDF is optional.</p></div>
          <div class="pedigree-warning">Images larger than the browser limit are compressed automatically. PDF files must be 1.25 MB or smaller.</div>
          <div class="form-grid two">
            <label>Animal receiving this pedigree
              <select name="subjectAnimalId" id="pedigree-subject" required>
                <option value="">Choose an animal</option>
                ${subjectOptions}
              </select>
            </label>
            ${field("Source or breeder notes", "sourceNotes", initial.sourceNotes || "")}
          </div>
          <div class="form-grid two" id="pedigree-subject-details">
            ${field("Tattoo / ear number", "subjectTattoo", initial.subjectTattoo || "")}
            ${field("Registration number", "subjectRegistrationNumber", initial.subjectRegistrationNumber || "")}
            ${field("Breeder name", "subjectBreeder", initial.subjectBreeder || "")}
            ${field("Color / variety", "subjectColor", initial.subjectColor || "")}
          </div>
          <div class="pedigree-source-box">
            <input id="pedigree-file" class="hidden" type="file" accept="image/jpeg,image/png,application/pdf">
            <div id="pedigree-drop" class="file-drop" role="button" tabindex="0">
              <div>
                <strong>Drop a pedigree here or choose a file</strong>
                <small>JPG, PNG, or PDF. Large photos will be resized for easier upload.</small>
                <div class="file-actions"><span class="button button-ghost button-small">Choose file</span></div>
              </div>
            </div>
            <div id="pedigree-source-preview" class="pedigree-source-preview" style="margin-top:12px"></div>
          </div>
        </section>

        <section class="wizard-panel" data-pedigree-step="2" hidden>
          <div class="wizard-heading"><h3>Add the parents</h3><p>Select an existing animal, enter a new ancestor, or leave the position unknown.</p></div>
          <div class="ancestor-grid">${slotsFor("Parents")}</div>
        </section>

        <section class="wizard-panel" data-pedigree-step="3" hidden>
          <div class="wizard-heading"><h3>Add the grandparents</h3><p>Work through the sire side and dam side without seeing the entire pedigree at once.</p></div>
          <div class="ancestor-grid">${slotsFor("Grandparents")}</div>
        </section>

        <section class="wizard-panel" data-pedigree-step="4" hidden>
          <div class="wizard-heading"><h3>Add the great-grandparents</h3><p>Unknown ancestors may be left blank. You can save this pedigree as a draft at any time.</p></div>
          <div class="ancestor-grid">${slotsFor("Great-grandparents")}</div>
        </section>

        <section class="wizard-panel" data-pedigree-step="5" hidden>
          <div class="wizard-heading"><h3>Review and confirm</h3><p>Check what will be linked or created before saving the pedigree.</p></div>
          <div id="pedigree-review"></div>
          ${textareaField("Pedigree notes", "notes", initial.notes || "")}
        </section>

        <div class="wizard-footer">
          <button type="button" class="button button-ghost" id="cancel-pedigree-import">Cancel</button>
          <button type="button" class="button button-ghost" id="save-pedigree-draft">Save draft & exit</button>
          <span class="wizard-spacer"></span>
          <button type="button" class="button button-ghost" id="pedigree-previous">Previous</button>
          <button type="button" class="button button-primary" id="pedigree-next">Next</button>
          <button type="submit" class="button button-primary hidden" id="pedigree-confirm">Confirm & save pedigree</button>
        </div>
      </form>`, `Guided pedigree builder`);

    $(".modal").classList.add("modal-wide");
    const form = $("#pedigree-import-form");
    const subjectSelect = $("#pedigree-subject");
    const fileInput = $("#pedigree-file");
    const dropZone = $("#pedigree-drop");
    const preview = $("#pedigree-source-preview");
    let applyingInheritedAncestry = false;

    const applyExistingAncestry = (animalId, ownerKey = "subject", replaceBranch = false) => {
      const inherited = existingPedigreeAncestry(animalId);
      const branchRelations = PEDIGREE_RELATIONS.filter(([key]) => key === ownerKey);
      const descendantKeys = new Set();
      const queue = branchRelations.map(([, , key]) => key);
      while (queue.length) {
        const key = queue.shift();
        if (descendantKeys.has(key)) continue;
        descendantKeys.add(key);
        PEDIGREE_RELATIONS
          .filter(([parentKey]) => parentKey === key)
          .forEach(([, , childKey]) => queue.push(childKey));
      }

      applyingInheritedAncestry = true;
      descendantKeys.forEach((slotKey) => {
        const select = form.elements[`${slotKey}_existingId`];
        if (!select) return;
        const inheritedId = ownerKey === "subject"
          ? inherited[slotKey]
          : inherited[slotKey.slice(ownerKey.length).replace(/^./, (letter) => letter.toLowerCase())];
        if (replaceBranch || select.dataset.inherited === "true" || !select.value) {
          select.value = inheritedId || "";
          select.dataset.inherited = inheritedId ? "true" : "";
          select.dispatchEvent(new Event("change"));
        }
      });
      applyingInheritedAncestry = false;
    };

    const populateSubjectDetails = (force = false) => {
      const subject = state.animals.find((a) => a.id === subjectSelect.value);
      if (!subject) return;
      const values = {
        subjectTattoo: subject.tattoo || "",
        subjectRegistrationNumber: subject.registrationNumber || "",
        subjectBreeder: subject.breeder || "",
        subjectColor: subject.color || ""
      };
      Object.entries(values).forEach(([name, value]) => {
        const input = form.elements[name];
        if (input && (force || !input.value)) input.value = value;
      });
    };
    subjectSelect.addEventListener("change", () => {
      populateSubjectDetails(true);
      applyExistingAncestry(subjectSelect.value, "subject", true);
    });
    populateSubjectDetails(false);

    const renderSource = () => {
      if (!sourceDocument?.dataUrl) {
        preview.innerHTML = `<p class="muted" style="margin:0">No document attached. You can build the pedigree manually.</p>`;
        return;
      }
      preview.innerHTML = `
        <div class="panel-header"><div><strong>${esc(sourceDocument.fileName)}</strong><small>${formatFileSize(sourceDocument.size)}</small></div><button type="button" class="button button-danger button-small" id="remove-pedigree-source">Remove</button></div>
        ${sourceDocument.mimeType === "application/pdf"
          ? `<object data="${sourceDocument.dataUrl}" type="application/pdf"><a href="${sourceDocument.dataUrl}" download="${esc(sourceDocument.fileName)}">Open PDF</a></object>`
          : `<img src="${sourceDocument.dataUrl}" alt="Uploaded pedigree preview">`}`;
      $("#remove-pedigree-source")?.addEventListener("click", () => {
        sourceDocument = null;
        fileInput.value = "";
        renderSource();
      });
    };
    renderSource();

    const handleFile = async (file) => {
      if (!file) return;
      dropZone.classList.add("busy");
      dropZone.querySelector("strong").textContent = "Preparing pedigree document…";
      try {
        sourceDocument = await preparePedigreeDocument(file);
        renderSource();
        toast(sourceDocument.compressed ? "Large photo compressed and attached." : "Pedigree source attached.", "success");
      } catch (error) {
        toast(error.message || "The pedigree document could not be prepared.", "error");
      } finally {
        dropZone.classList.remove("busy", "dragging");
        dropZone.querySelector("strong").textContent = "Drop a pedigree here or choose a file";
      }
    };

    dropZone.addEventListener("click", () => fileInput.click());
    dropZone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        fileInput.click();
      }
    });
    ["dragenter", "dragover"].forEach((name) => dropZone.addEventListener(name, (event) => {
      event.preventDefault();
      dropZone.classList.add("dragging");
    }));
    ["dragleave", "drop"].forEach((name) => dropZone.addEventListener(name, (event) => {
      event.preventDefault();
      dropZone.classList.remove("dragging");
    }));
    dropZone.addEventListener("drop", (event) => handleFile(event.dataTransfer?.files?.[0]));
    fileInput.addEventListener("change", (event) => handleFile(event.target.files?.[0]));

    PEDIGREE_SLOTS.forEach((slot) => {
      const card = $(`[data-ancestor-card="${slot.key}"]`);
      const existingSelect = $(`[data-existing-select="${slot.key}"]`);
      const manualDetails = $(".ancestor-manual", card);
      const manualInputs = $$(`input[name^="${slot.key}_"]`, card);
      const updateCardMode = () => {
        const linked = Boolean(existingSelect.value);
        card.classList.toggle("linked", linked);
        if (linked) {
          const animal = state.animals.find((a) => a.id === existingSelect.value);
          manualDetails.open = false;
          $(`[data-match-hint="${slot.key}"]`).textContent = animal ? `Using existing record: ${animal.name}` : "";
        } else {
          updateDuplicateHint(slot.key);
        }
      };
      existingSelect.addEventListener("change", () => {
        if (!applyingInheritedAncestry) {
          existingSelect.dataset.inherited = "";
          applyExistingAncestry(existingSelect.value, slot.key, true);
        }
        updateCardMode();
      });
      manualInputs.forEach((input) => input.addEventListener("input", () => updateDuplicateHint(slot.key)));
      $(`[data-clear-ancestor="${slot.key}"]`).addEventListener("click", () => {
        existingSelect.value = "";
        existingSelect.dataset.inherited = "";
        manualInputs.forEach((input) => input.value = "");
        manualDetails.open = false;
        $(`[data-match-hint="${slot.key}"]`).textContent = "";
        existingSelect.dispatchEvent(new Event("change"));
      });
      updateCardMode();
    });
    if (!storedDraft && selectedSubjectId) applyExistingAncestry(selectedSubjectId, "subject", false);

    const validateStep = (step) => {
      if (step === 1 && !subjectSelect.value) {
        toast("Choose the animal receiving the pedigree before continuing.", "error");
        subjectSelect.focus();
        return false;
      }
      return true;
    };

    const showStep = (step) => {
      currentStep = Math.min(5, Math.max(1, Number(step)));
      $$('[data-pedigree-step]', form).forEach((panel) => panel.hidden = Number(panel.dataset.pedigreeStep) !== currentStep);
      $$('[data-wizard-step]', form).forEach((button) => {
        const buttonStep = Number(button.dataset.wizardStep);
        button.classList.toggle("active", buttonStep === currentStep);
        button.classList.toggle("complete", buttonStep < currentStep);
      });
      $("#pedigree-previous").classList.toggle("hidden", currentStep === 1);
      $("#pedigree-next").classList.toggle("hidden", currentStep === 5);
      $("#pedigree-confirm").classList.toggle("hidden", currentStep !== 5);
      if (currentStep === 5) renderPedigreeWizardReview(form, sourceDocument);
      $(".modal").scrollTo({ top: 0, behavior: "smooth" });
    };

    $$('[data-wizard-step]', form).forEach((button) => button.addEventListener("click", () => {
      const nextStep = Number(button.dataset.wizardStep);
      if (nextStep > currentStep && !validateStep(currentStep)) return;
      showStep(nextStep);
    }));
    $("#pedigree-previous").addEventListener("click", () => showStep(currentStep - 1));
    $("#pedigree-next").addEventListener("click", () => {
      if (!validateStep(currentStep)) return;
      showStep(currentStep + 1);
    });
    $("#cancel-pedigree-import").addEventListener("click", closeModal);

    $("#save-pedigree-draft").addEventListener("click", async () => {
      if (!subjectSelect.value) return toast("Choose an animal before saving the draft.", "error");
      const data = collectPedigreeFormData(form);
      const draft = {
        id: storedDraft?.id || uid("pedigreeDraft"),
        subjectAnimalId: data.subjectAnimalId,
        step: currentStep,
        data,
        sourceDocument,
        savedAt: new Date().toISOString()
      };
      if (sourceDocument?.dataUrl) {
        try {
          await putPedigreeAttachment(draft.id, sourceDocument);
          draft.sourceDocument = { ...sourceDocument, dataUrl: "", attachmentStored: true };
        } catch (error) {
          return toast(error.message || "The pedigree attachment could not be stored safely.", "error");
        }
      }
      const index = state.pedigreeDrafts.findIndex((item) => item.id === draft.id);
      if (index >= 0) state.pedigreeDrafts[index] = draft;
      else state.pedigreeDrafts.push(draft);
      recordActivity(`Saved a pedigree draft for ${animalName(data.subjectAnimalId)}.`, "pedigree");
      if (!saveState("Pedigree draft saved.")) return;
      closeModal();
      navigate("pedigrees");
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!validateStep(1)) return;
      const data = collectPedigreeFormData(form);
      const subject = state.animals.find((a) => a.id === data.subjectAnimalId);
      if (!subject) return toast("Choose the animal receiving this pedigree.", "error");
      await savePedigreeImport({
        fd: new FormData(form),
        subject,
        draft: data.ancestors,
        sourceDocument,
        draftId: storedDraft?.id || ""
      });
    });

    showStep(currentStep);
  }


  function collectPedigreeFormData(form) {
    const value = (name) => String(form.elements[name]?.value || "").trim();
    const ancestors = {};
    PEDIGREE_SLOTS.forEach((slot) => {
      ancestors[slot.key] = {
        existingId: value(`${slot.key}_existingId`),
        manual: {
          name: value(`${slot.key}_name`),
          tag: value(`${slot.key}_tag`),
          registrationNumber: value(`${slot.key}_registrationNumber`),
          breed: value(`${slot.key}_breed`),
          color: value(`${slot.key}_color`),
          breeder: value(`${slot.key}_breeder`),
          sex: slot.sex
        }
      };
    });
    return {
      subjectAnimalId: value("subjectAnimalId"),
      sourceNotes: value("sourceNotes"),
      subjectTattoo: value("subjectTattoo"),
      subjectRegistrationNumber: value("subjectRegistrationNumber"),
      subjectBreeder: value("subjectBreeder"),
      subjectColor: value("subjectColor"),
      notes: value("notes"),
      ancestors
    };
  }

  function renderPedigreeWizardReview(form, sourceDocument) {
    const data = collectPedigreeFormData(form);
    const subject = state.animals.find((animal) => animal.id === data.subjectAnimalId);
    let linkCount = 0;
    let createCount = 0;
    let unknownCount = 0;
    const duplicateWarnings = [];
    const rows = PEDIGREE_SLOTS.map((slot) => {
      const entry = data.ancestors[slot.key];
      if (entry.existingId) {
        linkCount += 1;
        const animal = state.animals.find((item) => item.id === entry.existingId);
        return `<tr><td>${esc(slot.label)}</td><td><span class="badge green">Existing</span></td><td><strong>${esc(animal?.name || "Unknown")}</strong></td><td>${esc(animal?.earTagNumber || animal?.tag || animal?.tattoo || "—")}</td></tr>`;
      }
      const manual = entry.manual;
      if (manual.name || manual.tag || manual.registrationNumber) {
        createCount += 1;
        const matches = findPedigreeMatches(manual);
        if (matches.length) duplicateWarnings.push(`${slot.label}: ${matches.map((item) => item.name).join(", ")}`);
        return `<tr><td>${esc(slot.label)}</td><td><span class="badge warning">New ancestor</span></td><td><strong>${esc(manual.name || manual.tag || manual.registrationNumber)}</strong></td><td>${esc(manual.tag || "—")}</td></tr>`;
      }
      unknownCount += 1;
      return `<tr><td>${esc(slot.label)}</td><td><span class="badge gray">Unknown</span></td><td>—</td><td>—</td></tr>`;
    }).join("");

    $("#pedigree-review").innerHTML = `
      <div class="review-summary-grid">
        <div class="review-summary-card"><small>Animal</small><strong>${esc(subject?.name || "Not selected")}</strong></div>
        <div class="review-summary-card"><small>Source</small><strong>${esc(sourceDocument?.fileName || "Manual entry")}</strong></div>
        <div class="review-summary-card"><small>Existing links</small><strong>${linkCount}</strong></div>
        <div class="review-summary-card"><small>New / unknown</small><strong>${createCount} new · ${unknownCount} unknown</strong></div>
      </div>
      ${duplicateWarnings.length ? `<div class="pedigree-warning" style="margin-top:14px"><strong>Possible duplicate records:</strong><br>${duplicateWarnings.map(esc).join("<br>")}</div>` : ""}
      <div class="data-table-wrap" style="margin-top:14px"><table class="data-table"><thead><tr><th>Position</th><th>Action</th><th>Animal</th><th>ID / tattoo</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  async function deletePedigreeDraft(id) {
    const draft = state.pedigreeDrafts.find((item) => item.id === id);
    if (!draft) return;
    if (!confirm(`Delete the unfinished pedigree draft for ${animalName(draft.subjectAnimalId)}?`)) return;
    state.pedigreeDrafts = state.pedigreeDrafts.filter((item) => item.id !== id);
    await deletePedigreeAttachment(id).catch(() => {});
    saveState("Pedigree draft deleted.");
    renderPedigrees();
  }

  async function preparePedigreeDocument(file) {
    const type = file.type || "";
    const allowed = ["image/jpeg", "image/png", "application/pdf"];
    if (!allowed.includes(type)) throw new Error("Use a JPG, PNG, or PDF pedigree.");

    if (type === "application/pdf") {
      if (file.size > 1_250_000) throw new Error("PDF pedigrees must be 1.25 MB or smaller in this browser.");
      return {
        fileName: file.name,
        mimeType: type,
        size: file.size,
        dataUrl: await readFileAsDataURL(file),
        compressed: false
      };
    }

    if (file.size <= 900_000) {
      return {
        fileName: file.name,
        mimeType: type,
        size: file.size,
        dataUrl: await readFileAsDataURL(file),
        compressed: false
      };
    }

    const originalUrl = await readFileAsDataURL(file);
    const image = await loadPedigreeImage(originalUrl);
    let width = image.naturalWidth;
    let height = image.naturalHeight;
    const maxDimension = 2000;
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    let quality = .88;
    let blob = await canvasToBlob(canvas, quality);
    while (blob.size > 900_000 && quality > .58) {
      quality -= .08;
      blob = await canvasToBlob(canvas, quality);
    }
    if (blob.size > 1_100_000) throw new Error("This photo is still too large after compression. Crop it closer to the pedigree and try again.");

    return {
      fileName: file.name.replace(/\.(png|jpe?g)$/i, "") + "-compressed.jpg",
      mimeType: "image/jpeg",
      size: blob.size,
      dataUrl: await readFileAsDataURL(blob),
      compressed: true
    };
  }

  function loadPedigreeImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("The image could not be opened."));
      image.src = dataUrl;
    });
  }

  function canvasToBlob(canvas, quality) {
    return new Promise((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("The photo could not be compressed.")),
      "image/jpeg",
      quality
    ));
  }

  async function prepareProfileImage(file, options = {}) {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) throw new Error("Use a JPG, PNG, or WebP image.");

    const maxDimension = Number(options.maxDimension || 720);
    const targetBytes = Number(options.targetBytes || 120000);
    const outputType = options.outputType || "image/jpeg";
    const background = Object.prototype.hasOwnProperty.call(options, "background")
      ? options.background
      : "#ffffff";

    const originalUrl = await readFileAsDataURL(file);
    const image = await loadPedigreeImage(originalUrl);
    let width = image.naturalWidth;
    let height = image.naturalHeight;
    let scale = Math.min(1, maxDimension / Math.max(width, height));
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));

    let quality = .84;
    let blob = null;
    let attempts = 0;

    while (attempts < 10) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: outputType !== "image/jpeg" });
      if (background) {
        context.fillStyle = background;
        context.fillRect(0, 0, width, height);
      } else {
        context.clearRect(0, 0, width, height);
      }
      context.drawImage(image, 0, 0, width, height);
      blob = await canvasToImageBlob(canvas, outputType, quality);

      if (blob.size <= targetBytes) break;
      if (quality > .5) {
        quality -= .08;
      } else {
        width = Math.max(240, Math.round(width * .84));
        height = Math.max(240, Math.round(height * .84));
        quality = .72;
      }
      attempts += 1;
    }

    if (!blob || blob.size > Math.max(targetBytes * 1.5, 220000)) {
      throw new Error("The image is still too large after compression. Crop it closer and try again.");
    }

    const extension = outputType === "image/webp" ? "webp" : "jpg";
    return {
      fileName: file.name.replace(/\.[^.]+$/, "") + `-profile.${extension}`,
      mimeType: outputType,
      size: blob.size,
      dataUrl: await readFileAsDataURL(blob),
      compressed: blob.size < file.size || width !== image.naturalWidth || height !== image.naturalHeight
    };
  }

  function canvasToImageBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("The image could not be compressed.")),
      type,
      quality
    ));
  }

  function formatFileSize(bytes = 0) {
    if (!bytes) return "0 KB";
    if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
    return `${(bytes / 1_000_000).toFixed(2)} MB`;
  }

  function formatStorageBytes(bytes = 0) {
    if (!Number.isFinite(bytes) || bytes < 0) return "Unavailable";
    if (bytes < 1_000) return `${Math.round(bytes)} B`;
    if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(bytes < 10_000 ? 1 : 0)} KB`;
    if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
  }

  async function refreshDeviceStorageSummary() {
    const stateSize = $("#settings-state-size");
    const used = $("#settings-storage-used");
    const available = $("#settings-storage-available");
    const persistence = $("#settings-storage-persistence");
    if (stateSize) stateSize.textContent = formatStorageBytes(new Blob([lastSavedRaw]).size);

    try {
      const estimate = await navigator.storage?.estimate?.();
      const persistent = await navigator.storage?.persisted?.();
      if (used) used.textContent = estimate ? formatStorageBytes(estimate.usage || 0) : "Unavailable";
      if (available) {
        available.textContent = estimate?.quota
          ? formatStorageBytes(Math.max(0, estimate.quota - (estimate.usage || 0)))
          : "Unavailable";
      }
      if (persistence) persistence.textContent = persistent ? "Protected from routine cleanup" : "Browser managed";
    } catch {
      if (used) used.textContent = "Unavailable";
      if (available) available.textContent = "Unavailable";
      if (persistence) persistence.textContent = "Browser managed";
    }
  }

  function updateDuplicateHint(slotKey) {
    const hint = $(`[data-match-hint="${slotKey}"]`);
    const card = $(`[data-ancestor-card="${slotKey}"]`);
    if (!hint || !card) return;
    const manual = {
      name: $(`[name="${slotKey}_name"]`, card)?.value || "",
      tag: $(`[name="${slotKey}_tag"]`, card)?.value || "",
      registrationNumber: $(`[name="${slotKey}_registrationNumber"]`, card)?.value || ""
    };
    const candidates = findPedigreeMatches(manual);
    if (!candidates.length) {
      hint.textContent = "";
      return;
    }
    const candidate = candidates[0];
    hint.innerHTML = `Possible match: ${esc(candidate.name)}${candidate.tag ? ` · ${esc(candidate.tag)}` : ""}
      <button type="button" data-use-pedigree-match="${candidate.id}" data-slot="${slotKey}">Use existing</button>`;
    $(`[data-use-pedigree-match="${candidate.id}"]`, hint)?.addEventListener("click", () => {
      const select = $(`[data-existing-select="${slotKey}"]`);
      select.value = candidate.id;
      select.dispatchEvent(new Event("change"));
    });
  }

  function normalizePedigreeValue(value = "") {
    return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function findPedigreeMatches(manual) {
    const name = normalizePedigreeValue(manual.name);
    const tag = normalizePedigreeValue(manual.tag);
    const registration = normalizePedigreeValue(manual.registrationNumber);
    if (!name && !tag && !registration) return [];
    return state.animals.filter((animal) => {
      return (name && normalizePedigreeValue(animal.name) === name) ||
        (tag && (normalizePedigreeValue(animal.earTagNumber) === tag || normalizePedigreeValue(animal.tag) === tag || normalizePedigreeValue(animal.tattoo) === tag)) ||
        (registration && normalizePedigreeValue(animal.registrationNumber) === registration);
    }).slice(0, 4);
  }

  async function savePedigreeImport({ fd, subject, draft, sourceDocument, draftId = "" }) {
    const backupState = structuredClone(state);
    const ancestorIds = {};
    const now = new Date().toISOString();

    try {
      PEDIGREE_SLOTS.forEach((slot) => {
        const entry = draft[slot.key];
        if (entry.existingId) {
          ancestorIds[slot.key] = entry.existingId;
          return;
        }
        const manual = entry.manual;
        if (!(manual.name || manual.tag || manual.registrationNumber)) {
          ancestorIds[slot.key] = "";
          return;
        }
        const id = uid("animal");
        state.animals.push({
          id,
          name: manual.name || manual.tag || manual.registrationNumber || slot.label,
          tag: manual.tag,
          tattoo: manual.tag,
          registrationNumber: manual.registrationNumber,
          breeder: manual.breeder,
          species: subject.species || "Rabbit",
          breed: manual.breed || subject.breed || "",
          sex: manual.sex,
          dob: "",
          color: manual.color,
          location: "",
          status: "Ancestor Only",
          isAncestorOnly: true,
          sireId: "",
          damId: "",
          notes: `Created from pedigree import for ${subject.name}.`,
          createdAt: now
        });
        ancestorIds[slot.key] = id;
      });

      Object.assign(subject, {
        tattoo: String(fd.get("subjectTattoo") || "").trim(),
        registrationNumber: String(fd.get("subjectRegistrationNumber") || "").trim(),
        breeder: String(fd.get("subjectBreeder") || "").trim(),
        color: String(fd.get("subjectColor") || "").trim(),
        updatedAt: now
      });

      const allIds = { subject: subject.id, ...ancestorIds };
      PEDIGREE_RELATIONS.forEach(([ownerKey, relationField, parentKey]) => {
        const ownerId = allIds[ownerKey];
        const parentId = allIds[parentKey];
        if (!ownerId || !parentId) return;
        const owner = state.animals.find((animal) => animal.id === ownerId);
        if (owner) owner[relationField] = parentId;
      });

      const pedigreeId = uid("pedigree");
      if (sourceDocument?.dataUrl) await putPedigreeAttachment(pedigreeId, sourceDocument);
      state.pedigrees.push({
        id: pedigreeId,
        subjectAnimalId: subject.id,
        ancestorIds,
        sourceNotes: String(fd.get("sourceNotes") || "").trim(),
        notes: String(fd.get("notes") || "").trim(),
        fileName: sourceDocument?.fileName || "Manual pedigree",
        mimeType: sourceDocument?.mimeType || "",
        fileSize: sourceDocument?.size || 0,
        sourceDataUrl: "",
        attachmentStored: Boolean(sourceDocument?.dataUrl),
        importedAt: now,
        mode: "guided-manual-review",
        builderVersion: "0.2.1"
      });

      if (draftId) state.pedigreeDrafts = state.pedigreeDrafts.filter((item) => item.id !== draftId);
      recordActivity(`Completed a pedigree for ${subject.name}.`, "pedigree");

      if (!saveState("Pedigree saved.")) throw new Error("The pedigree could not be stored.");

      closeModal();
      navigate("pedigrees");
    } catch (error) {
      state = backupState;
      saveState();
      toast(error.message || "The pedigree could not be saved.", "error");
    }
  }

  async function openPedigreeRecord(id) {
    try {
      await ensureAnimalProfileRuntimeLoaded();
    } catch (error) {
      console.error("HerdHarbor could not load Animal records for pedigree preview:", error);
      toast("Pedigree preview could not load. Check your connection and try again.", "error");
      return;
    }
    const record = state.pedigrees.find((p) => p.id === id);
    if (!record) return;
    const subject = state.animals.find((a) => a.id === record.subjectAnimalId);
    const ancestorRows = PEDIGREE_SLOTS.map((slot) => {
      const animal = state.animals.find((a) => a.id === record.ancestorIds?.[slot.key]);
      return animal ? `<tr><td>${esc(slot.label)}</td><td><strong>${esc(animal.name)}</strong></td><td>${esc(animal.earTagNumber || animal.tag || animal.tattoo || "—")}</td><td>${esc(animal.registrationNumber || "—")}</td></tr>` : "";
    }).filter(Boolean).join("");

    const storedSource = record.sourceDataUrl || (record.attachmentStored
      ? (await getPedigreeAttachment(record.id).catch(() => null))?.dataUrl || ""
      : "");
    const sourcePreview = storedSource
      ? record.mimeType === "application/pdf"
        ? `<div class="pedigree-source-action panel-header"><div><strong>PDF source attached</strong><small>${esc(record.fileName || "Pedigree source.pdf")}</small></div><a class="button button-ghost" href="${storedSource}" download="${esc(record.fileName || "pedigree-source.pdf")}">Open or download PDF</a></div>`
        : `<img loading="lazy" decoding="async" src="${storedSource}" alt="Pedigree source document">`
      : record.attachmentStored
        ? `<p class="pedigree-warning">This source attachment is not stored on this device. The reviewed ancestry record remains available.</p>`
        : `<p>No source document was attached. This pedigree was entered manually.</p>`;

    openModal(subject?.name || "Pedigree record", `
      <div class="pedigree-warning">Imported with manual review. Automatic OCR was not used.</div>
      <div class="detail-grid" style="margin-top:14px">
        ${detailField("Animal", subject?.name)}
        ${detailField("Imported", new Date(record.importedAt).toLocaleString())}
        ${detailField("Source", record.fileName)}
        ${detailField("Linked ancestors", Object.values(record.ancestorIds || {}).filter(Boolean).length)}
      </div>
      <h3 style="margin-top:22px">Pedigree chart</h3>
      ${pedigreeRecordPreviewHtml(subject, record)}
      <h3 style="margin-top:22px">Pedigree source</h3>
      <div class="pedigree-source-preview">${sourcePreview}</div>
      <h3 style="margin-top:22px">Reviewed ancestry</h3>
      ${ancestorRows ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Position</th><th>Name</th><th>ID / tattoo</th><th>Registration</th></tr></thead><tbody>${ancestorRows}</tbody></table></div>` : `<p class="muted">No ancestors were entered.</p>`}
      <h3 style="margin-top:22px">Notes</h3>
      <p class="muted">${esc(record.notes || record.sourceNotes || "No notes recorded.")}</p>
      <div class="modal-actions">
        <button class="button button-ghost" id="close-pedigree-record">Close</button>
        <button class="button button-ghost" id="print-pedigree-record">Print sale pedigree</button>
        <button class="button button-primary" id="open-pedigree-animal">View animal</button>
      </div>`, "Pedigree import record");

    $(".modal").classList.add("modal-wide");
    $("#close-pedigree-record").addEventListener("click", closeModal);
    $("#print-pedigree-record").addEventListener("click", () => openPrintPedigreeForm(record.subjectAnimalId));
    $("#open-pedigree-animal").addEventListener("click", () => openAnimalDetail(record.subjectAnimalId));
  }

  async function deletePedigreeRecord(id) {
    const record = state.pedigrees.find((p) => p.id === id);
    if (!record) return;
    if (!confirm("Delete this imported pedigree and its attached source document? Linked animal records will remain.")) return;
    state.pedigrees = state.pedigrees.filter((p) => p.id !== id);
    await deletePedigreeAttachment(id).catch(() => {});
    recordActivity(`Deleted a pedigree import for ${animalName(record.subjectAnimalId)}.`, "pedigree");
    saveState("Pedigree import deleted.");
    renderPedigrees();
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }


  function openPrintPedigreeForm(animalId) {
    const animal = state.animals.find((item) => item.id === animalId);
    if (!animal) return toast("The animal record could not be found.", "error");
    openModal("Print sale pedigree", `
      <form id="print-pedigree-form">
        <div class="pedigree-warning">The printed pedigree always uses a clean white page, even when HerdHarbor is in dark mode.</div>
        <div class="form-grid two" style="margin-top:14px">
          ${field("Seller name", "sellerName", state.profile?.ownerName || "", true)}
          ${field("Seller contact", "sellerContact", state.profile?.email || "")}
          ${field("Buyer name", "buyerName", "")}
          ${field("Sale / transfer date", "saleDate", todayISO(), false, "date")}
          ${field("Sale price (optional)", "salePrice", "")}
          ${field("Certificate or transfer number", "transferNumber", "")}
        </div>
        ${textareaField("Sale notes", "saleNotes", "")}
        <div class="modal-actions">
          <button type="button" class="button button-ghost" id="cancel-print-pedigree">Cancel</button>
          <button type="submit" class="button button-primary">Open printable pedigree</button>
        </div>
      </form>`, `${animal.name} · Sale pedigree`);
    $("#cancel-print-pedigree").addEventListener("click", closeModal);
    $("#print-pedigree-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const sale = Object.fromEntries(new FormData(event.currentTarget));
      printSalePedigree(animalId, sale);
    });
  }

  function printSalePedigree(animalId, sale = {}) {
    const subject = state.animals.find((item) => item.id === animalId);
    if (!subject) return toast("The animal record could not be found.", "error");

    const byId = (id) => state.animals.find((item) => item.id === id) || null;
    const savedPedigree = state.pedigrees
      .filter((record) => record.subjectAnimalId === animalId)
      .sort((left, right) => String(right.importedAt || "").localeCompare(String(left.importedAt || "")))[0] || null;
    const ids = savedPedigree?.ancestorIds || {};
    const sire = byId(ids.sire || subject.sireId);
    const dam = byId(ids.dam || subject.damId);
    const sireSire = byId(ids.sireSire || sire?.sireId);
    const sireDam = byId(ids.sireDam || sire?.damId);
    const damSire = byId(ids.damSire || dam?.sireId);
    const damDam = byId(ids.damDam || dam?.damId);
    const greats = {
      sireSireSire: byId(ids.sireSireSire || sireSire?.sireId),
      sireSireDam: byId(ids.sireSireDam || sireSire?.damId),
      sireDamSire: byId(ids.sireDamSire || sireDam?.sireId),
      sireDamDam: byId(ids.sireDamDam || sireDam?.damId),
      damSireSire: byId(ids.damSireSire || damSire?.sireId),
      damSireDam: byId(ids.damSireDam || damSire?.damId),
      damDamSire: byId(ids.damDamSire || damDam?.sireId),
      damDamDam: byId(ids.damDamDam || damDam?.damId)
    };

    const logo = state.profile?.logoData || defaultHerdHarborLogo();
    const subjectPhoto = subject.photoData || "";
    const sexMeta = (animal) => {
      const sex = String(animal?.sex || "Unknown").toLowerCase();
      const isRabbit = String(animal?.species || subject.species || "").toLowerCase() === "rabbit";
      if (sex === "male") return ["♂", isRabbit ? "BUCK" : "MALE"];
      if (sex === "female") return ["♀", isRabbit ? "DOE" : "FEMALE"];
      return ["•", "UNKNOWN"];
    };

    const animalCard = (animal, relation, extraClass = "") => {
      const [sexSymbol, sexLabel] = sexMeta(animal);
      const details = [
        ["ID", animal?.earTagNumber || animal?.tag || animal?.tattoo || "—"],
        ["DOB", animal?.dob ? formatDate(animal.dob) : "—"],
        ["COLOR", animal?.color || "—"],
        ["BREED", animal?.breed || "—"],
        ["REG", animal?.registrationNumber || "—"],
        ["BREEDER", animal?.breeder || "—"]
      ];
      return `<article class="pedigree-node-card ${animal ? "" : "unknown"} ${extraClass}">
        <div class="node-header">
          <div class="node-title"><span class="species-mark">${speciesIcon(animal?.species || subject.species)}</span><div><span class="relation">${esc(relation)}</span><strong>${esc(animal?.name || "Unknown")}</strong></div></div>
          <div class="sex-mark"><span>${sexSymbol}</span><small>${sexLabel}</small></div>
        </div>
        <div class="node-details">${details.map(([label, value]) => {
          const fieldName = label.toLowerCase();
          const protectedValue = label === "COLOR" || label === "BREEDER" ? " pedigree-protected-value" : "";
          return `<div data-field="${fieldName}"><b>${label}:</b><span class="${protectedValue.trim()}" title="${esc(value)}">${esc(value)}</span></div>`;
        }).join("")}</div>
      </article>`;
    };

    const salePrice = sale.salePrice ? `$${esc(sale.salePrice)}` : "—";
    const operationName = state.profile?.operationName || "HerdHarbor Breeder";
    const generatedDate = new Date().toLocaleDateString();

    const printableHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject.name)} Pedigree</title><style>
      @page { size: letter landscape; margin: .2in; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; color: #2f3438; background: #fff; font-family: "Segoe UI", Arial, Helvetica, sans-serif; }
      body { padding: 0; }
      .sheet { width: 100%; height: 8.06in; min-height: 0; max-height: 8.06in; display: flex; flex-direction: column; overflow: hidden; }
      .header { min-height: 58px; display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 0 0 8px; border-bottom: 2px solid #68737b; }
      .brand-print { min-width: 0; display: flex; align-items: center; gap: 11px; }
      .brand-print img { width: 52px; height: 52px; object-fit: contain; padding: 3px; background: #fff; border: 1px solid #d7dce0; border-radius: 6px; }
      .brand-print h1 { margin: 0; color: #27343d; font-size: 20px; line-height: 1.1; }
      .tagline { margin-top: 3px; color: #707980; font-size: 9px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
      .print-subject { display: flex; align-items: center; gap: 10px; text-align: right; }
      .print-subject strong { display: block; color: #242b30; font-size: 14px; }
      .print-subject small { display: block; margin-top: 3px; color: #747d84; font-size: 8px; }
      .print-animal-photo { width: 52px; height: 52px; display: grid; place-items: center; overflow: hidden; color: #fff; background: #40505a; border: 1px solid #cfd5d9; border-radius: 6px; font-size: 24px; }
      .print-animal-photo img { width: 100%; height: 100%; object-fit: cover; }

      .pedigree-tree {
        flex: 1 1 auto;
        min-height: 0;
        display: grid;
        grid-template-columns: minmax(168px,1.18fr) 34px minmax(164px,1.1fr) 34px minmax(158px,1fr) 34px minmax(152px,.96fr);
        grid-template-rows: repeat(8, minmax(0,1fr));
        column-gap: 0;
        padding: 8px 0 6px;
      }
      .pedigree-node { min-width: 0; align-self: center; padding: 2px 0; }
      .pedigree-node-card { width: 100%; padding: 6px 7px; background: #fff; border: 1px solid #c9d0d5; border-radius: 5px; box-shadow: 0 1px 1px rgba(20,31,39,.035); }
      .pedigree-node-card.subject-card { border-color: #7d8991; border-left: 3px solid #4f7776; }
      .pedigree-node-card.unknown { color: #747d84; background: #fafbfb; border-style: dashed; }
      .node-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 6px; padding-bottom: 4px; border-bottom: 1px solid #eef0f2; }
      .node-title { min-width: 0; display: flex; align-items: flex-start; gap: 5px; }
      .species-mark { width: 15px; height: 15px; flex: 0 0 auto; display: grid; place-items: center; color: #65717a; background: #f1f3f4; border-radius: 50%; font-size: 9px; }
      .node-title > div { min-width: 0; }
      .relation { display: block; margin-bottom: 1px; color: #7b858c; font-size: 6.5px; font-weight: 800; letter-spacing: .075em; text-transform: uppercase; }
      .node-title strong { display: block; overflow: hidden; color: #2b3237; font-size: 9px; line-height: 1.12; text-overflow: ellipsis; white-space: nowrap; }
      .sex-mark { flex: 0 0 auto; display: flex; align-items: center; gap: 2px; color: #707980; }
      .sex-mark > span { font-size: 10px; line-height: 1; }
      .sex-mark small { font-size: 5.8px; font-weight: 800; letter-spacing: .05em; }
      .node-details { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 1px 7px; padding-top: 4px; }
      .node-details div { min-width: 0; display: grid; grid-template-columns: auto minmax(0,1fr); gap: 3px; align-items: baseline; font-size: 6.7px; line-height: 1.2; }
      .node-details b { color: #4e575e; font-size: 6px; letter-spacing: .045em; }
      .node-details span { overflow: hidden; color: #505a61; text-overflow: ellipsis; white-space: nowrap; }
      .node-details .pedigree-protected-value { overflow: visible; font-family: inherit; font-size: inherit; line-height: 1.08; text-overflow: clip; white-space: normal; overflow-wrap: anywhere; word-break: normal; }
      .great-node .pedigree-node-card { padding: 4px 6px; }
      .great-node .node-header { padding-bottom: 2px; }
      .great-node .node-details { gap: 0 5px; padding-top: 2px; }
      .great-node .node-details div { font-size: 6.1px; }
      .great-node .node-details b { font-size: 5.5px; }
      .great-node .relation { display: none; }
      .great-node .node-title strong { font-size: 8px; }

      .pedigree-branch { position: relative; align-self: stretch; }
      .pedigree-branch::before { content: ""; position: absolute; left: 50%; top: 25%; bottom: 25%; border-left: 1px solid #aab2b8; }
      .pedigree-branch::after { content: ""; position: absolute; left: 0; top: 50%; width: 50%; border-top: 1px solid #aab2b8; }
      .branch-arm { position: absolute; left: 50%; right: 0; border-top: 1px solid #aab2b8; }
      .branch-arm.top { top: 25%; }
      .branch-arm.bottom { top: 75%; }

      .sale-strip { display: grid; grid-template-columns: repeat(6,minmax(0,1fr)); gap: 5px; padding-top: 7px; border-top: 2px solid #68737b; }
      .sale-field { min-width: 0; padding: 5px 6px; background: #fafafa; border: 1px solid #d9dee2; border-radius: 4px; }
      .sale-field small, .sale-field strong { display: block; }
      .sale-field small { color: #717b82; font-size: 6px; font-weight: 800; letter-spacing: .055em; text-transform: uppercase; }
      .sale-field strong { margin-top: 2px; overflow: hidden; color: #343b40; font-size: 7.5px; text-overflow: ellipsis; white-space: nowrap; }
      .sale-notes { grid-column: 1 / -1; }
      .sale-notes strong { white-space: normal; }
      .certification { display: grid; grid-template-columns: 1.35fr 1fr 1fr; gap: 18px; align-items: end; margin-top: 8px; color: #4d565c; font-size: 7px; }
      .certification p { margin: 0; line-height: 1.35; }
      .signature { padding-top: 10px; border-top: 1px solid #68737b; text-align: center; }
      .footer { display: flex; justify-content: space-between; gap: 20px; margin-top: 7px; color: #7b848a; font-size: 6.5px; }
      .no-print { position: fixed; right: 18px; bottom: 18px; padding: 10px 15px; color: #fff; background: #2e7d7b; border: 0; border-radius: 8px; font-weight: 800; cursor: pointer; box-shadow: 0 5px 18px rgba(0,0,0,.18); }
      @media screen and (max-width: 980px) {
        body { min-width: 980px; }
      }
      @media print {
        html, body { width: 100%; height: 100%; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .sheet, .pedigree-tree { break-inside: avoid; page-break-inside: avoid; }
        .no-print { display: none; }
      }
    </style></head><body><div class="sheet">
      <header class="header">
        <div class="brand-print"><img src="${logo}" alt="${esc(operationName)} logo"><div><h1>${esc(operationName)}</h1><div class="tagline">Four-generation pedigree · Generated by HerdHarbor</div></div></div>
        <div class="print-subject"><div><strong>${esc(subject.name)}</strong><small>${esc([subject.earTagNumber || subject.tag || subject.tattoo, subject.earTagColor, subject.registrationNumber, subject.breed, subject.color].filter(Boolean).join(" · ") || "Pedigree record")}<br>Generated ${generatedDate}</small></div><div class="print-animal-photo">${subjectPhoto ? `<img src="${subjectPhoto}" alt="${esc(subject.name)} photo">` : `<span>${speciesIcon(subject.species)}</span>`}</div></div>
      </header>

      <main class="pedigree-tree" aria-label="Pedigree chart for ${esc(subject.name)}">
        <div class="pedigree-node" style="grid-column:1;grid-row:1 / 9">${animalCard(subject, "Animal", "subject-card")}</div>
        <div class="pedigree-branch" style="grid-column:2;grid-row:1 / 9"><span class="branch-arm top"></span><span class="branch-arm bottom"></span></div>

        <div class="pedigree-node" style="grid-column:3;grid-row:1 / 5">${animalCard(sire, "Sire")}</div>
        <div class="pedigree-node" style="grid-column:3;grid-row:5 / 9">${animalCard(dam, "Dam")}</div>
        <div class="pedigree-branch" style="grid-column:4;grid-row:1 / 5"><span class="branch-arm top"></span><span class="branch-arm bottom"></span></div>
        <div class="pedigree-branch" style="grid-column:4;grid-row:5 / 9"><span class="branch-arm top"></span><span class="branch-arm bottom"></span></div>

        <div class="pedigree-node" style="grid-column:5;grid-row:1 / 3">${animalCard(sireSire, "Sire's sire")}</div>
        <div class="pedigree-node" style="grid-column:5;grid-row:3 / 5">${animalCard(sireDam, "Sire's dam")}</div>
        <div class="pedigree-node" style="grid-column:5;grid-row:5 / 7">${animalCard(damSire, "Dam's sire")}</div>
        <div class="pedigree-node" style="grid-column:5;grid-row:7 / 9">${animalCard(damDam, "Dam's dam")}</div>
        <div class="pedigree-branch" style="grid-column:6;grid-row:1 / 3"><span class="branch-arm top"></span><span class="branch-arm bottom"></span></div>
        <div class="pedigree-branch" style="grid-column:6;grid-row:3 / 5"><span class="branch-arm top"></span><span class="branch-arm bottom"></span></div>
        <div class="pedigree-branch" style="grid-column:6;grid-row:5 / 7"><span class="branch-arm top"></span><span class="branch-arm bottom"></span></div>
        <div class="pedigree-branch" style="grid-column:6;grid-row:7 / 9"><span class="branch-arm top"></span><span class="branch-arm bottom"></span></div>

        <div class="pedigree-node great-node" style="grid-column:7;grid-row:1">${animalCard(greats.sireSireSire, "Sire's sire's sire")}</div>
        <div class="pedigree-node great-node" style="grid-column:7;grid-row:2">${animalCard(greats.sireSireDam, "Sire's sire's dam")}</div>
        <div class="pedigree-node great-node" style="grid-column:7;grid-row:3">${animalCard(greats.sireDamSire, "Sire's dam's sire")}</div>
        <div class="pedigree-node great-node" style="grid-column:7;grid-row:4">${animalCard(greats.sireDamDam, "Sire's dam's dam")}</div>
        <div class="pedigree-node great-node" style="grid-column:7;grid-row:5">${animalCard(greats.damSireSire, "Dam's sire's sire")}</div>
        <div class="pedigree-node great-node" style="grid-column:7;grid-row:6">${animalCard(greats.damSireDam, "Dam's sire's dam")}</div>
        <div class="pedigree-node great-node" style="grid-column:7;grid-row:7">${animalCard(greats.damDamSire, "Dam's dam's sire")}</div>
        <div class="pedigree-node great-node" style="grid-column:7;grid-row:8">${animalCard(greats.damDamDam, "Dam's dam's dam")}</div>
      </main>

      <section class="sale-strip">
        <div class="sale-field"><small>Seller</small><strong>${esc(sale.sellerName || "—")}</strong></div>
        <div class="sale-field"><small>Seller contact</small><strong>${esc(sale.sellerContact || "—")}</strong></div>
        <div class="sale-field"><small>Buyer</small><strong>${esc(sale.buyerName || "—")}</strong></div>
        <div class="sale-field"><small>Sale / transfer date</small><strong>${esc(formatDate(sale.saleDate))}</strong></div>
        <div class="sale-field"><small>Sale price</small><strong>${salePrice}</strong></div>
        <div class="sale-field"><small>Transfer number</small><strong>${esc(sale.transferNumber || "—")}</strong></div>
        <div class="sale-field sale-notes"><small>Sale notes</small><strong>${esc(sale.saleNotes || "—")}</strong></div>
      </section>

      <section class="certification"><p>I certify that this pedigree reflects the records entered for this animal to the best of my knowledge.</p><div class="signature">Seller signature / date</div><div class="signature">Buyer signature / date</div></section>
      <footer class="footer"><span>Created with HerdHarbor · Livestock records without limits.</span><span>HerdHarbor</span></footer>
      <button class="no-print" onclick="window.print()">Print / Save PDF</button>
    </div></body></html>`;
    const mobilePrint = window.matchMedia("(max-width: 760px)").matches ||
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean(window.navigator.standalone);
    if (mobilePrint) {
      openMobilePrintPreview(printableHtml, subject.name);
    } else {
      const popup = window.open("", "_blank");
      if (!popup) {
        openMobilePrintPreview(printableHtml, subject.name);
      } else {
        popup.document.open();
        popup.document.write(printableHtml);
        popup.document.close();
        closeModal();
        try {
          window.HerdHarborPedigreeGenetics?.enhanceDocument?.(popup.document, true, window);
        } catch {}
        setTimeout(() => popup.focus(), 150);
      }
    }
    recordActivity(`Opened a printable sale pedigree for ${subject.name}.`, "pedigree");
    saveState();
  }

  function openMobilePrintPreview(printableHtml, animalName) {
    openModal(`${animalName} pedigree`, `
      <div class="pedigree-warning">Your pedigree is ready below. Tap Print / Save PDF to open your phone's print options.</div>
      <iframe id="pedigree-print-preview" title="Printable pedigree for ${esc(animalName)}" style="width:100%;height:58dvh;margin-top:12px;border:1px solid var(--border);border-radius:10px;background:#fff"></iframe>
      <div class="modal-actions">
        <button type="button" class="button button-ghost" id="close-mobile-print">Close</button>
        <button type="button" class="button button-primary" id="run-mobile-print">Print / Save PDF</button>
      </div>`, "Mobile print preview");
    $(".modal").classList.add("modal-wide");
    const frame = $("#pedigree-print-preview");
    frame.srcdoc = printableHtml;
    $("#close-mobile-print").addEventListener("click", closeModal);
    $("#run-mobile-print").addEventListener("click", () => {
      const printWindow = frame.contentWindow;
      if (!printWindow) return toast("The print preview is still loading. Try again.", "error");
      printWindow.focus();
      printWindow.print();
    });
  }

  let healthRuntimeInstance = null;

  function healthRuntime() {
    if (healthRuntimeInstance) return healthRuntimeInstance;
    const create = window.HerdHarborHealthRuntime?.create;
    if (typeof create !== "function") {
      throw new Error("The Health runtime module did not load.");
    }
    healthRuntimeInstance = create({
      getState: () => state,
      $,
      $$,
      esc,
      headerHtml,
      emptyState,
      formatDate,
      animalName,
      openModal,
      closeModal,
      selectAnimalField,
      field,
      selectField,
      textareaField,
      todayISO,
      toast,
      navigate,
      uid,
      recordActivity,
      saveState,
      renderCurrentView,
      setSymptomSearch: (value) => { symptomView.search = String(value || ""); }
    });
    return healthRuntimeInstance;
  }

  function renderHealth() {
    if (typeof window.HerdHarborHealthRuntime?.create === "function") {
      return healthRuntime().renderHealth();
    }
    renderLazyRoute(
      "health",
      "Health and weights",
      ensureHealthRuntimeLoaded,
      () => healthRuntime().renderHealth()
    );
  }

  function symptomUrgencyClass(urgency = "") {
    if (urgency === "Emergency now") return "emergency";
    if (urgency === "Contact a vet soon") return "soon";
    return "monitor";
  }

  function symptomEntryMatches(entry, species, search, urgency) {
    const speciesMatch = !species || entry.species.includes("All") || entry.species.includes(species);
    const urgencyMatch = urgency === "All" || entry.urgency === urgency;
    const tokens = String(search || "").toLowerCase().split(/\s+/).filter(Boolean);
    if (!speciesMatch || !urgencyMatch) return false;
    if (!tokens.length) return true;
    const searchable = [
      entry.title,
      entry.urgency,
      ...(entry.species || []),
      ...(entry.signs || []),
      ...(entry.concerns || []),
      ...(entry.keywords || [])
    ].join(" ").toLowerCase();
    return tokens.every((token) => searchable.includes(token));
  }

  function renderSymptoms() {
    const guide = window.HERDHARBOR_SYMPTOM_GUIDE;
    if (!guide?.entries?.length) {
      $("#view-symptoms").innerHTML = `${headerHtml("Symptom guide", "Educational animal-health lookup.")}${emptyState("The symptom guide could not load.", "Refresh the app. If the problem continues, contact support and use a veterinarian for health guidance.")}`;
      return;
    }

    const animals = state.animals.slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    const selectedAnimal = animals.find((animal) => animal.id === symptomView.animalId);
    if (selectedAnimal?.species && symptomView.species !== selectedAnimal.species) symptomView.species = selectedAnimal.species;
    const speciesOptions = [...new Set([
      ...(state.settings.species || []),
      ...animals.map((animal) => animal.species).filter(Boolean)
    ])].sort((a, b) => String(a).localeCompare(String(b)));
    const urgencyOrder = { "Emergency now": 0, "Contact a vet soon": 1, "Monitor and call": 2 };
    const matches = guide.entries
      .filter((entry) => symptomEntryMatches(entry, symptomView.species, symptomView.search, symptomView.urgency))
      .slice()
      .sort((a, b) => (urgencyOrder[a.urgency] ?? 9) - (urgencyOrder[b.urgency] ?? 9) || a.title.localeCompare(b.title));
    const hasSpeciesSpecificGuidance = !symptomView.species || guide.entries.some((entry) => entry.species.includes(symptomView.species));
    const selectedAnimalLabel = selectedAnimal ? `${selectedAnimal.name || "Unnamed animal"} · ${selectedAnimal.species || "Species not recorded"}` : "Choose an animal (optional)";

    $("#view-symptoms").innerHTML = `
      ${headerHtml(
        "Symptom guide",
        "Search common signs, see possible concerns, and decide how quickly to call a veterinarian.",
        `<button class="button button-ghost" type="button" id="symptom-back-health">Back to health records</button>`
      )}
      <section class="symptom-safety-banner" role="alert" aria-labelledby="symptom-safety-title">
        <span class="symptom-safety-icon" aria-hidden="true">!</span>
        <div>
          <strong id="symptom-safety-title">This is not veterinary advice or a diagnosis.</strong>
          <p>${esc(guide.disclaimer)} Contact a licensed veterinarian for every health concern. If an animal has trouble breathing, collapses, has a seizure, is bleeding heavily, may be poisoned, has severe bloat/colic, cannot stand, or is rapidly getting worse, seek emergency veterinary help now.</p>
        </div>
      </section>
      <section class="panel symptom-guide-filters" aria-label="Symptom guide filters">
        <label>
          <span>Animal</span>
          <select id="symptom-animal">
            <option value="">${esc(selectedAnimalLabel)}</option>
            ${animals.map((animal) => `<option value="${esc(animal.id)}" ${animal.id === symptomView.animalId ? "selected" : ""}>${esc(animal.name || "Unnamed animal")} · ${esc(animal.species || "No species")}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>Species</span>
          <select id="symptom-species">
            <option value="">All species</option>
            ${speciesOptions.map((species) => `<option value="${esc(species)}" ${species === symptomView.species ? "selected" : ""}>${esc(species)}</option>`).join("")}
          </select>
        </label>
        <label class="symptom-search-field">
          <span>Symptom or sign</span>
          <input id="symptom-search" type="search" autocomplete="off" value="${esc(symptomView.search)}" placeholder="Search not eating, coughing, diarrhea, bloat, limping…">
        </label>
        <label>
          <span>Urgency</span>
          <select id="symptom-urgency">
            ${["All", "Emergency now", "Contact a vet soon", "Monitor and call"].map((urgency) => `<option ${urgency === symptomView.urgency ? "selected" : ""}>${esc(urgency)}</option>`).join("")}
          </select>
        </label>
        <div style="display:flex;align-items:end">
          <button class="button button-ghost" type="button" id="clear-symptom-filters">Clear filters</button>
        </div>
      </section>
      <details class="panel symptom-red-flags" open>
        <summary>Emergency warning signs — contact a veterinarian now</summary>
        <ul>${guide.emergencyRedFlags.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
      </details>
      ${!hasSpeciesSpecificGuidance ? `<aside class="panel symptom-custom-note"><strong>${esc(symptomView.species)} does not have a species-specific guide yet.</strong><p class="muted">General emergency and observation guidance is shown below. Contact a veterinarian experienced with this species; do not rely on another species' guidance.</p></aside>` : ""}
      <div class="symptom-results-heading">
        <h3>Possible concerns — not a diagnosis</h3>
        <span class="muted">${matches.length} ${matches.length === 1 ? "result" : "results"}</span>
      </div>
      <section class="symptom-results" aria-live="polite">
        ${matches.length ? matches.map((entry) => `
          <article class="symptom-card">
            <div class="symptom-card-header">
              <div>
                <span class="symptom-species">${esc(entry.species.includes("All") ? "All species" : entry.species.join(" · "))}</span>
                <h3>${esc(entry.title)}</h3>
              </div>
              <span class="symptom-urgency ${symptomUrgencyClass(entry.urgency)}">${esc(entry.urgency)}</span>
            </div>
            <h4>Signs people may notice</h4>
            <ul>${entry.signs.map((sign) => `<li>${esc(sign)}</li>`).join("")}</ul>
            <h4>Possible concerns — not a diagnosis</h4>
            <ul>${entry.concerns.map((concern) => `<li>${esc(concern)}</li>`).join("")}</ul>
            <h4>What to do</h4>
            <p class="symptom-action">${esc(entry.action)}</p>
            <div class="symptom-card-footer">
              <a href="${esc(entry.source.url)}" target="_blank" rel="noopener noreferrer">${esc(entry.source.label)} ↗</a>
              ${animals.length ? `<button class="button button-ghost button-small" type="button" data-log-symptom="${esc(entry.id)}">Log observation</button>` : ""}
            </div>
          </article>`).join("") : emptyState("No guide entries match those filters.", "Try fewer search words, clear the urgency filter, or contact a veterinarian directly.")}
      </section>
      <p class="symptom-reference-note">HerdHarbor's guide is a static educational reference based on linked veterinary and animal-health sources. It does not use artificial intelligence to diagnose an animal, does not prescribe medication, and does not send symptom searches to HerdHarbor.</p>`;

    $("#symptom-back-health").addEventListener("click", () => navigate("health"));
    $("#symptom-animal").addEventListener("change", (event) => {
      symptomView.animalId = event.target.value;
      const animal = state.animals.find((item) => item.id === symptomView.animalId);
      symptomView.species = animal?.species || symptomView.species;
      renderSymptoms();
    });
    $("#symptom-species").addEventListener("change", (event) => {
      symptomView.species = event.target.value;
      if (selectedAnimal && symptomView.species !== selectedAnimal.species) symptomView.animalId = "";
      renderSymptoms();
    });
    $("#symptom-search").addEventListener("input", (event) => {
      symptomView.search = event.currentTarget.value;
      scheduleUiWork("symptom-search", () => {
        if (currentRoute !== "symptoms") return;
        renderSymptoms();
        $("#symptom-search")?.focus();
        $("#symptom-search")?.setSelectionRange(symptomView.search.length, symptomView.search.length);
      });
    });
    $("#symptom-urgency").addEventListener("change", (event) => {
      symptomView.urgency = event.target.value;
      renderSymptoms();
    });
    $("#clear-symptom-filters").addEventListener("click", () => {
      symptomView = { animalId: "", species: "", search: "", urgency: "All" };
      renderSymptoms();
    });
    $$("[data-log-symptom]", $("#view-symptoms")).forEach((button) => {
      button.addEventListener("click", () => {
        const entry = guide.entries.find((item) => item.id === button.dataset.logSymptom);
        if (!entry) return;
        openHealthForm("", {
          animalId: symptomView.animalId,
          type: "Observation",
          details: `Observed sign to discuss with a veterinarian: ${entry.title}. This note is not a diagnosis.`
        });
      });
    });
  }

  async function openHealthForm(id = "", defaults = {}) {
    try {
      await ensureHealthRuntimeLoaded();
      return healthRuntime().openHealthForm(id, defaults);
    } catch (error) {
      console.error("HerdHarbor could not load Health:", error);
      toast("Health tools could not load. Check your connection and try again.", "error");
      return false;
    }
  }

  let taskRuntimeInstance = null;

  function taskRuntime() {
    if (taskRuntimeInstance) return taskRuntimeInstance;
    const create = window.HerdHarborTaskRuntime?.create;
    if (typeof create !== "function") {
      throw new Error("The Task runtime module did not load.");
    }
    taskRuntimeInstance = create({
      getState: () => state,
      getCurrentRoute: () => currentRoute,
      $,
      $$,
      esc,
      headerHtml,
      statCard,
      emptyState,
      animalName,
      formatDate,
      daysFromNow,
      scheduleUiWork,
      openModal,
      closeModal,
      field,
      selectField,
      selectAnimalField,
      textareaField,
      todayISO,
      addDays,
      uid,
      recordActivity,
      saveState,
      renderCurrentView
    });
    return taskRuntimeInstance;
  }

  function normalizeTaskRecurrence(task = {}) {
    return taskRuntime().normalizeTaskRecurrence(task);
  }

  function taskRecurrenceDays(task = {}) {
    return taskRuntime().taskRecurrenceDays(task);
  }

  function taskNextDueDate(task = {}) {
    return taskRuntime().taskNextDueDate(task);
  }

  function taskRecurrenceLabel(task = {}) {
    return taskRuntime().taskRecurrenceLabel(task);
  }

  function recurringTaskId(seriesId, dueDate) {
    return taskRuntime().recurringTaskId(seriesId, dueDate);
  }

  function ensureNextRecurringTask(task, now = new Date().toISOString()) {
    return taskRuntime().ensureNextRecurringTask(task, now);
  }

  function setTaskCompleted(task, completed, now = new Date().toISOString()) {
    return taskRuntime().setTaskCompleted(task, completed, now);
  }

  function taskSort(left, right) {
    return taskRuntime().taskSort(left, right);
  }

  function filterTasks(tasks = state.tasks, filters = null) {
    return taskRuntime().filterTasks(tasks, filters || taskRuntime().getFilterState());
  }

  function taskStatusMeta(task) {
    return taskRuntime().taskStatusMeta(task);
  }

  function syncDerivedTaskAutomation(now = new Date().toISOString()) {
    return taskRuntime().syncDerivedAutomation(now);
  }

  function renderTasks() {
    return taskRuntime().renderTasks();
  }

  function renderTaskResults() {
    return taskRuntime().renderTaskResults();
  }

  function openTaskForm(id = "") {
    return taskRuntime().openTaskForm(id);
  }

  let productionReportingRuntimeInstance = null;

  function productionReportingRuntime() {
    if (productionReportingRuntimeInstance) return productionReportingRuntimeInstance;
    const create = window.HerdHarborProductionReportingRuntime?.create;
    if (typeof create !== "function") {
      throw new Error("The Production/Reporting runtime module did not load.");
    }
    productionReportingRuntimeInstance = create({
      getState: () => state,
      replaceState: (nextState) => { state = nextState; },
      $,
      $$,
      esc,
      headerHtml,
      statCard,
      emptyState,
      field,
      textareaField,
      selectField,
      formatDate,
      formatMoney,
      toast,
      currentMonthKey,
      budgetPeriodLabel,
      budgetSummary,
      activeAnimals,
      effectiveHeadCount,
      monthLabel,
      monthTransactions,
      operatingExpenseTransactions,
      transactionSpecies,
      transactionScopeLabel,
      animalName,
      todayISO,
      uid,
      recordActivity,
      saveState,
      openModal,
      closeModal,
      renderCurrentView,
      ensureSpreadsheetToolsReady,
      openPaymentForm
    });
    return productionReportingRuntimeInstance;
  }

  function renderBudget() {
    if (
      typeof window.HerdHarborProductionReportingRuntime?.create === "function" &&
      typeof window.HerdHarborProfitabilityAnalytics?.operationSummary === "function"
    ) {
      return productionReportingRuntime().renderBudget();
    }
    renderLazyRoute(
      "budget",
      "Budget and cost per head",
      () => Promise.all([ensureProductionReportingRuntimeLoaded(), ensureProfitabilityAnalyticsLoaded()]),
      () => productionReportingRuntime().renderBudget()
    );
  }

  async function openProductionForm(id = "", options = {}) {
    try {
      await ensureProductionReportingRuntimeLoaded();
      return productionReportingRuntime().openProductionForm(id, options);
    } catch (error) {
      console.error("HerdHarbor could not load Production/Reporting:", error);
      toast("Production tools could not load. Check your connection and try again.", "error");
      return false;
    }
  }

  async function openTransactionForm(id = "", defaultType = "Expense") {
    try {
      await ensureProductionReportingRuntimeLoaded();
      return productionReportingRuntime().openTransactionForm(id, defaultType);
    } catch (error) {
      console.error("HerdHarbor could not load Production/Reporting:", error);
      toast("Budget tools could not load. Check your connection and try again.", "error");
      return false;
    }
  }

  function syncProductionIncome(record) {
    return productionReportingRuntime().syncProductionIncome(record);
  }

  let salesCustomerRuntimeInstance = null;

  function salesCustomerRuntime() {
    if (salesCustomerRuntimeInstance) return salesCustomerRuntimeInstance;
    const create = window.HerdHarborSalesCustomerRuntime?.create;
    if (typeof create !== "function") throw new Error("The Sales/Customer runtime module did not load.");
    salesCustomerRuntimeInstance = create({
      getState: () => state,
      replaceState: (nextState) => { state = nextState; },
      getCurrentRoute: () => currentRoute,
      getAppVersion: () => APP_VERSION,
      $,
      $$,
      esc,
      formatMoney,
      toast,
      headerHtml,
      statCard,
      emptyState,
      field,
      textareaField,
      selectField,
      detailField,
      formatDate,
      todayISO,
      uid,
      recordActivity,
      saveState,
      scheduleUiWork,
      openModal,
      closeModal,
      navigate,
      allowsAnimalTransition,
      rememberBreed
    });
    return salesCustomerRuntimeInstance;
  }

  function customerName(customerId) { return salesCustomerRuntime().customerName(customerId); }
  function saleItems(sale) { return salesCustomerRuntime().saleItems(sale); }
  function saleAnimals(sale) { return salesCustomerRuntime().saleAnimals(sale); }
  function saleSubtotal(sale) { return salesCustomerRuntime().saleSubtotal(sale); }
  function saleTotal(sale) { return salesCustomerRuntime().saleTotal(sale); }
  function salePayments(saleId) { return salesCustomerRuntime().salePayments(saleId); }
  function salePaid(saleId) { return salesCustomerRuntime().salePaid(saleId); }
  function saleBalance(sale) { return salesCustomerRuntime().saleBalance(sale); }
  function saleNumberForId(id, date = todayISO()) { return salesCustomerRuntime().saleNumberForId(id, date); }
  function saleAnimalLabel(sale) { return salesCustomerRuntime().saleAnimalLabel(sale); }
  function syncSalePaymentIncome(payment) { return salesCustomerRuntime().syncSalePaymentIncome(payment); }
  function applySaleAnimalStatuses(sale, previousSale = null) { return salesCustomerRuntime().applySaleAnimalStatuses(sale, previousSale); }
  function renderSales() { return salesCustomerRuntime().renderSales(); }
  function openCustomerForm(id = "") { return salesCustomerRuntime().openCustomerForm(id); }
  function openSaleForm(id = "") { return salesCustomerRuntime().openSaleForm(id); }
  function openSaleDetail(saleId) { return salesCustomerRuntime().openSaleDetail(saleId); }
  function openPaymentForm(saleId, paymentId = "") { return salesCustomerRuntime().openPaymentForm(saleId, paymentId); }
  function deleteSaleRecord(saleId) { return salesCustomerRuntime().deleteSaleRecord(saleId); }
  function printSaleDocument(saleId, documentType) { return salesCustomerRuntime().printSaleDocument(saleId, documentType); }
  function transferableAnimal(animal) { return salesCustomerRuntime().transferableAnimal(animal); }
  function transferRecordKey(value) { return salesCustomerRuntime().transferRecordKey(value); }
  function transferAnimalsForSale(sale) { return salesCustomerRuntime().transferAnimalsForSale(sale); }
  function exportAnimalTransfer(saleId) { return salesCustomerRuntime().exportAnimalTransfer(saleId); }
  function transferMatch(animal) { return salesCustomerRuntime().transferMatch(animal); }
  function handleTransferImport(event) { return salesCustomerRuntime().handleTransferImport(event); }

  let settingsRuntimeInstance = null;

  function settingsRuntime() {
    if (settingsRuntimeInstance) return settingsRuntimeInstance;
    const create = window.HerdHarborSettingsRuntime?.create;
    if (typeof create !== "function") throw new Error("The Settings runtime module did not load.");
    settingsRuntimeInstance = create({
      getState: () => state,
      getDefaultSettings: () => defaultState.settings,
      getCurrentRoute: () => currentRoute,
      getAppVersion: () => APP_VERSION,
      $,
      $$,
      esc,
      headerHtml,
      detailField,
      activeAnimals,
      currentSyncDetails,
      formatSyncTimestamp,
      refreshSyncStatus,
      openModal,
      closeModal,
      field,
      selectField,
      textareaField,
      toast,
      applyTheme,
      saveState,
      showApp,
      prepareProfileImage,
      recordActivity,
      loadDemoData,
      exportData,
      importData,
      handleSpreadsheetImport,
      clearData,
      ensureSpreadsheetToolsReady,
      navigate,
      refreshDeviceStorageSummary
    });
    return settingsRuntimeInstance;
  }

  function renderSettings() {
    if (typeof window.HerdHarborSettingsRuntime?.create === "function") {
      return settingsRuntime().renderSettings();
    }
    renderLazyRoute(
      "settings",
      "Settings",
      ensureSettingsRuntimeLoaded,
      () => settingsRuntime().renderSettings()
    );
  }

  function openFeedbackForm() {
    if (typeof window.HerdHarborSettingsRuntime?.create === "function") {
      return settingsRuntime().openFeedbackForm();
    }
    void ensureSettingsRuntimeLoaded()
      .then(() => settingsRuntime().openFeedbackForm())
      .catch((error) => {
        console.error("HerdHarbor could not load Settings for feedback:", error);
        toast("Feedback tools could not load. Check your connection and try again.", "error");
      });
  }

  let voiceAssistedEntryInstance = null;

  function voiceAssistedEntry() {
    if (voiceAssistedEntryInstance) return voiceAssistedEntryInstance;
    const create = window.HerdHarborVoiceAssistedEntry?.create;
    if (typeof create !== "function") throw new Error("The voice-assisted entry module did not load.");
    voiceAssistedEntryInstance = create({
      getState: () => state,
      openModal,
      closeModal,
      openHealthForm,
      openBreedingForm,
      todayISO,
      esc,
      toast
    });
    return voiceAssistedEntryInstance;
  }

  let photoAssistedEntryInstance = null;

  function photoAssistedEntry() {
    if (photoAssistedEntryInstance) return photoAssistedEntryInstance;
    const create = window.HerdHarborPhotoAssistedEntry?.create;
    if (typeof create !== "function") throw new Error("The photo-assisted entry module did not load.");
    photoAssistedEntryInstance = create({
      getState: () => state,
      openModal,
      closeModal,
      openAnimalForm,
      openHealthForm,
      esc,
      toast
    });
    return photoAssistedEntryInstance;
  }

  function openQuickAdd() {
    openModal("Quick add", `
      <div class="cards-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">
        ${quickCard("Animal", "Create a new animal profile.", "animal")}
        ${quickCard("Breeding", "Record a pairing and due dates.", "breeding")}
        ${quickCard("Birth / litter", "Record delivery, outcomes, weaning, and offspring.", "litter")}
        ${quickCard("Pedigree", "Use the guided builder, attach a source, or resume later.", "pedigree")}
        ${quickCard("Health", "Add a weight, treatment, or observation.", "health")}
        ${quickCard("Voice-assisted entry", "Speak or type a weight, medication, or breeding instruction for review.", "voice")}
        ${quickCard("Photo-assisted entry", "Create a reviewed draft from a registration, vet, weight, or medication image.", "photo")}
        ${quickCard("Task", "Create a chore or reminder.", "task")}
        ${quickCard("Customer", "Save a buyer and contact details.", "customer")}
        ${quickCard("Animal sale", "Reserve or sell animals and prepare documents.", "sale")}
        ${quickCard("Expense", "Record feed, veterinary, supplies, or another cost.", "expense")}
        ${quickCard("Income", "Record an animal sale or other farm income.", "income")}
      </div>`, "Create record");

    $$("[data-quick]").forEach((button) => button.addEventListener("click", () => {
      const type = button.dataset.quick;
      if (type === "animal") openAnimalForm();
      if (type === "breeding") openBreedingForm();
      if (type === "litter") openLitterForm();
      if (type === "pedigree") openPedigreeImport();
      if (type === "health") openHealthForm();
      if (type === "voice") voiceAssistedEntry().open();
      if (type === "photo") photoAssistedEntry().open();
      if (type === "task") openTaskForm();
      if (type === "customer") openCustomerForm();
      if (type === "sale") openSaleForm();
      if (type === "expense") openTransactionForm("", "Expense");
      if (type === "income") openTransactionForm("", "Income");
    }));
  }

  function quickCard(title, text, type) {
    return `<button class="animal-card" data-quick="${type}" style="text-align:left;border:1px solid var(--border)">
      <h3>${title}</h3><p class="muted">${text}</p>
    </button>`;
  }

  function openModal(title, content, kicker = "HerdHarbor") {
    $(".modal").classList.remove("modal-wide");
    $("#modal-title").textContent = title;
    $("#modal-kicker").textContent = kicker;
    $("#modal-content").innerHTML = content;
    $("#modal-backdrop").classList.remove("hidden");
    $("#modal-backdrop").setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    $(".modal").scrollTop = 0;
    setTimeout(() => $("input, select, textarea", $("#modal-content"))?.focus(), 30);
  }

  function closeModal() {
    $(".modal").classList.remove("modal-wide");
    $("#modal-backdrop").classList.add("hidden");
    $("#modal-backdrop").setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    $("#modal-content").innerHTML = "";
  }

  function field(label, name, value = "", required = false, type = "text") {
    const extra = type === "number" ? 'min="0" step="0.01"' : "";
    return `<label>${esc(label)}<input type="${type}" name="${name}" value="${esc(value ?? "")}" ${required ? "required" : ""} ${extra}></label>`;
  }

  function breedOptionsFor(species = "") {
    const common = COMMON_BREEDS[species] || [];
    const remembered = Array.isArray(state.settings?.breedsBySpecies?.[species])
      ? state.settings.breedsBySpecies[species]
      : [];
    const existing = state.animals
      .filter((animal) => animal.species === species && animal.breed)
      .map((animal) => String(animal.breed).trim());
    return [...new Set([...common, ...remembered, ...existing].filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
  }

  function rememberBreed(species = "", breed = "") {
    species = String(species).trim();
    breed = String(breed).trim();
    if (!species || !breed) return;
    state.settings.breedsBySpecies = state.settings.breedsBySpecies && typeof state.settings.breedsBySpecies === "object"
      ? state.settings.breedsBySpecies
      : {};
    const remembered = Array.isArray(state.settings.breedsBySpecies[species])
      ? state.settings.breedsBySpecies[species]
      : [];
    if (!remembered.some((item) => item.toLowerCase() === breed.toLowerCase())) {
      state.settings.breedsBySpecies[species] = [...remembered, breed].sort((a, b) => a.localeCompare(b));
    }
  }

  function breedComboboxField(species = "", value = "") {
    return `<label>Breed
      <input type="text" name="breed" value="${esc(value ?? "")}" list="animal-breed-options" placeholder="Start typing a breed" autocomplete="off" aria-describedby="animal-breed-help">
      <datalist id="animal-breed-options">
        ${breedOptionsFor(species).map((breed) => `<option value="${esc(breed)}"></option>`).join("")}
      </datalist>
      <small id="animal-breed-help" class="muted">Choose a breed or type a new one. New breeds are remembered for this species.</small>
    </label>`;
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
      ${animals.map((a) => `<option value="${a.id}" ${a.id === selected ? "selected" : ""}>${esc(a.name)}${a.earTagNumber || a.tag ? ` · ${esc(a.earTagNumber || a.tag)}` : ""}</option>`).join("")}
    </select></label>`;
  }

  async function handleSpreadsheetImport(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    input.disabled = true;
    try {
      toast("Preparing Excel import…");
      await ensureProductionReportingRuntimeLoaded();
      const spreadsheet = await ensureSpreadsheetToolsReady({ importSupport: true });
      toast("Reading Excel workbook…");
      await spreadsheet.openImport({
        file,
        state,
        species: state.settings.species,
        openModal,
        closeModal,
        toast,
        commit: async (records, metadata) => {
          const previousState = structuredClone(state);
          const animalCount = records.animals.length;
          const breedingRecords = Array.isArray(records.breedings) ? records.breedings : [];
          const birthRecords = Array.isArray(records.litters) ? records.litters : [];
          const breedingCount = breedingRecords.length;
          const birthCount = birthRecords.length;
          const customerRecords = Array.isArray(records.customers) ? records.customers : [];
          const saleRecords = Array.isArray(records.sales) ? records.sales : [];
          const paymentRecords = Array.isArray(records.payments) ? records.payments : [];
          const customerCount = customerRecords.length;
          const saleCount = saleRecords.length;
          const paymentCount = paymentRecords.length;
          const transactionCount = records.transactions.length;
          const productionCount = records.productionRecords.length;
          const annualPlanCount = records.annualBudgetPlans.length;
          const healthCount = records.health.length;
          const total = animalCount + breedingCount + birthCount + customerCount + saleCount + paymentCount + transactionCount + productionCount + annualPlanCount + healthCount;

          if (!allowsAnimalTransition(state.animals, [...state.animals, ...records.animals])) {
            throw new Error("The spreadsheet would exceed the HerdHarbor Junior limit of 5 active animals. No spreadsheet records were imported.");
          }
          state.animals.push(...records.animals);
          state.breedings.push(...breedingRecords);
          state.litters.push(...birthRecords);
          state.customers.push(...customerRecords);
          state.sales.push(...saleRecords);
          saleRecords.forEach((sale) => applySaleAnimalStatuses(sale));
          state.payments.push(...paymentRecords);
          paymentRecords.forEach((payment) => syncSalePaymentIncome(payment));
          records.animals.forEach((animal) => {
            if (!animal.sourceBirthId) return;
            const birth = state.litters.find((record) => record.id === animal.sourceBirthId);
            if (!birth) return;
            birth.offspringIds = [...new Set([...(Array.isArray(birth.offspringIds) ? birth.offspringIds : []), animal.id])];
          });
          state.transactions.push(...records.transactions);
          state.productionRecords.push(...records.productionRecords);
          records.productionRecords.forEach((record) => syncProductionIncome(record));
          state.annualBudgetPlans.push(...records.annualBudgetPlans);
          state.health.push(...records.health);
          const importTime = new Date().toISOString();
          breedingRecords.forEach((record) => syncBreedingReminders(record, { now: importTime }));
          birthRecords.forEach((record) => {
            if (record.breedingId) {
              const breeding = state.breedings.find((item) => item.id === record.breedingId);
              if (breeding) {
                breeding.status = "Delivered";
                breeding.litterId = record.id;
                breeding.updatedAt = importTime;
                syncBreedingReminders(breeding, { now: importTime });
              }
            }
            syncBirthReminder(record, { now: importTime });
          });
          records.animals.forEach((animal) => rememberBreed(animal.species, animal.breed));
          recordActivity(
            `Imported ${total} spreadsheet record${total === 1 ? "" : "s"} from ${metadata.fileName}: ` +
            `${animalCount} animal${animalCount === 1 ? "" : "s"}, ` +
            `${breedingCount} breeding${breedingCount === 1 ? "" : "s"}, ` +
            `${birthCount} birth record${birthCount === 1 ? "" : "s"}, ` +
            `${customerCount} customer${customerCount === 1 ? "" : "s"}, ` +
            `${saleCount} sale${saleCount === 1 ? "" : "s"}, ` +
            `${paymentCount} payment${paymentCount === 1 ? "" : "s"}, ` +
            `${transactionCount} transaction${transactionCount === 1 ? "" : "s"}, ` +
            `${productionCount} production record${productionCount === 1 ? "" : "s"}, ` +
            `${annualPlanCount} annual budget plan${annualPlanCount === 1 ? "" : "s"}, and ` +
            `${healthCount} medical record${healthCount === 1 ? "" : "s"}.`,
            "import"
          );

          if (!saveState()) {
            state = previousState;
            throw new Error("The import was rolled back because this device could not safely save every record.");
          }

          closeModal();
          showApp();
          const skipped = Number(metadata.duplicateCount || 0) + Number(metadata.errorCount || 0);
          toast(
            `${total} spreadsheet record${total === 1 ? "" : "s"} imported` +
            `${skipped ? `; ${skipped} duplicate or invalid row${skipped === 1 ? "" : "s"} skipped` : ""}.`,
            "success"
          );
        }
      });
    } catch (error) {
      toast(error.message || "The Excel workbook could not be imported.", "error");
    } finally {
      input.value = "";
      input.disabled = false;
    }
  }

  async function loadDemoData() {
    if (!confirm("Add sample rabbits, breeding records, health records, and tasks?")) return;
    try {
      await ensureProductionReportingRuntimeLoaded();
    } catch (error) {
      console.error("HerdHarbor could not load Production/Reporting for demo data:", error);
      toast("Demo data could not load its reporting tools. Check your connection and try again.", "error");
      return;
    }
    const buckId = uid("animal");
    const doeId = uid("animal");
    const doe2Id = uid("animal");
    const now = new Date().toISOString();

    const demoAnimals = [
      { id: buckId, name: "Harbor's Atlas", tag: "HH-B01", species: "Rabbit", breed: "Holland Lop", sex: "Male", dob: addDays(todayISO(), -420), color: "Broken black", location: "Barn A · Cage 1", status: "Active", sireId: "", damId: "", notes: "Demo breeding buck.", createdAt: now },
      { id: doeId, name: "Harbor's Willow", tag: "HH-D04", species: "Rabbit", breed: "Holland Lop", sex: "Female", dob: addDays(todayISO(), -360), color: "Tort", location: "Barn A · Cage 4", status: "Active", sireId: "", damId: "", notes: "Demo breeding doe.", createdAt: now },
      { id: doe2Id, name: "Harbor's Clover", tag: "HH-D06", species: "Rabbit", breed: "Holland Lop", sex: "Female", dob: addDays(todayISO(), -300), color: "Blue", location: "Barn A · Cage 6", status: "Active", sireId: "", damId: "", notes: "Demo replacement doe.", createdAt: now }
    ];
    if (!allowsAnimalTransition(state.animals, [...state.animals, ...demoAnimals])) return;
    state.animals.push(...demoAnimals);

    const breedingId = uid("breeding");
    state.breedings.push({
      id: breedingId, femaleId: doeId, maleId: buckId,
      breedingDate: addDays(todayISO(), -20), nestBoxDate: addDays(todayISO(), 8),
      pregnancyCheckDate: addDays(todayISO(), -6), pregnancyCheckStatus: "Positive",
      confirmedDate: addDays(todayISO(), -6), method: "Natural service",
      dueDate: addDays(todayISO(), 11), status: "Confirmed pregnant", notes: "Demo breeding.", createdAt: now
    });

    state.health.push({
      id: uid("health"), animalId: doe2Id, date: addDays(todayISO(), -3),
      type: "Weight", weight: "3.4", weightUnit: "lb",
      followUpDate: addDays(todayISO(), 27), details: "Monthly development weight.", createdAt: now
    });

    syncBreedingReminders(state.breedings.find((record) => record.id === breedingId), { now });
    state.tasks.push(
      { id: uid("task"), title: "Monthly weight check for Clover", category: "Health", dueDate: addDays(todayISO(), 27), animalId: doe2Id, notes: "", completed: false, createdAt: now }
    );

    const demoCustomer = { id: uid("customer"), name: "Demo buyer", phone: "555-0100", email: "buyer@example.com", address: "", notes: "Sample customer record.", createdAt: now, updatedAt: now };
    const demoSaleId = uid("sale");
    const demoSale = {
      id: demoSaleId, saleNumber: saleNumberForId(demoSaleId, todayISO()), transferNumber: `TR-${saleNumberForId(demoSaleId, todayISO()).replace(/^HH-/, "")}`,
      customerId: demoCustomer.id, saleDate: todayISO(), dueDate: todayISO(), status: "Completed",
      items: [{ id: `saleitem_${demoSaleId}_${doe2Id}`, animalId: doe2Id, quantity: "1", unitPrice: "85.00" }],
      discount: "0.00", tax: "0.00", terms: "Paid in full.", notes: "Sample completed animal sale.", createdAt: now, updatedAt: now
    };
    const demoPayment = { id: uid("payment"), saleId: demoSaleId, type: "Payment", date: todayISO(), amount: "85.00", method: "Cash", reference: "", notes: "Demo payment.", transactionId: "", createdAt: now, updatedAt: now };
    state.customers.push(demoCustomer);
    state.sales.push(demoSale);
    state.payments.push(demoPayment);
    applySaleAnimalStatuses(demoSale);
    syncSalePaymentIncome(demoPayment);

    state.transactions.push(
      { id: uid("transaction"), date: todayISO(), type: "Expense", classification: "Operating", category: "Feed", scope: "Species", species: "Rabbit", animalId: "", amount: "42.50", party: "Farm supply store", description: "Rabbit pellets", notes: "Demo budget record.", createdAt: now },
      { id: uid("transaction"), date: todayISO(), type: "Expense", classification: "Operating", category: "Bedding", scope: "Operation", species: "", animalId: "", amount: "18.00", party: "Farm supply store", description: "Bedding", notes: "Demo budget record.", createdAt: now }
    );
    state.budgetPlans.push(
      { id: uid("budget"), month: currentMonthKey(), species: "", category: "Feed", amount: "100.00", createdAt: now },
      { id: uid("budget"), month: currentMonthKey(), species: "", category: "Bedding", amount: "45.00", createdAt: now }
    );

    recordActivity("Loaded HerdHarbor demo data.", "setup");
    saveState("Demo data loaded.");
    renderCurrentView();
  }

  async function exportData() {
    const exportState = await stateWithPedigreeAttachments();
    const payload = JSON.stringify({
      app: "HerdHarbor",
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      data: exportState
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
      if (!allowsAnimalTransition(state.animals, imported.animals)) {
        throw new Error("This backup would exceed the HerdHarbor Junior limit of 5 active animals. No backup records were imported.");
      }
      state = {
        ...structuredClone(defaultState),
        ...imported,
        pedigreeDrafts: Array.isArray(imported.pedigreeDrafts) ? imported.pedigreeDrafts : [],
        customers: Array.isArray(imported.customers) ? imported.customers : [],
        sales: Array.isArray(imported.sales) ? imported.sales : [],
        payments: Array.isArray(imported.payments) ? imported.payments : [],
        transfers: Array.isArray(imported.transfers) ? imported.transfers : [],
        transactions: Array.isArray(imported.transactions) ? imported.transactions : [],
        productionRecords: Array.isArray(imported.productionRecords) ? imported.productionRecords : [],
        budgetPlans: Array.isArray(imported.budgetPlans) ? imported.budgetPlans : [],
        annualBudgetPlans: Array.isArray(imported.annualBudgetPlans) ? imported.annualBudgetPlans : [],
        budgetMonthSettings: imported.budgetMonthSettings && typeof imported.budgetMonthSettings === "object"
          ? imported.budgetMonthSettings
          : {},
        settings: { ...defaultState.settings, ...(imported.settings || {}) }
      };
      await migratePedigreeAttachments();
      saveState("Backup imported.");
      applyTheme(state.settings.theme || "system", false);
      applySidebarState(false);
      showApp();
    } catch (error) {
      toast(error.message || "Could not import backup.", "error");
    } finally {
      event.target.value = "";
    }
  }

  async function clearData() {
    if (!confirm("Clear every local HerdHarbor record on this device?")) return;
    if (!confirm("This cannot be undone unless you exported a backup. Continue?")) return;
    const cleared = canonicalStateStore?.clear?.({ source: "local", reason: "user-cleared-local-data" });
    if (!cleared?.ok) {
      toast("HerdHarbor could not durably record the clear operation on this device.", "error");
      return;
    }
    lastSavedRaw = cleared.rawValue || "{}";
    await new Promise((resolve) => {
      if (!window.indexedDB) return resolve();
      const request = indexedDB.deleteDatabase(ATTACHMENT_DB);
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
    state = structuredClone(defaultState);
    currentRoute = "dashboard";
    showOnboarding();
    toast("Local data cleared.");
  }

  function launchLazyAnimalProfileAction(method, animalId, unavailableMessage) {
    const run = () => {
      const runtime = animalProfileRuntime();
      const action = runtime?.[method];
      if (typeof action !== "function") throw new Error(`Animal/Profile action is unavailable: ${method}`);
      return action.call(runtime, animalId);
    };

    if (
      typeof window.HerdHarborAnimalProfileRuntime?.create === "function" &&
      typeof window.HerdHarborPedigreePlatform?.buildPedigreeGraph === "function"
    ) {
      return run();
    }

    void ensureAnimalProfileRuntimeLoaded()
      .then(run)
      .catch((error) => {
        console.error(`HerdHarbor could not lazy-load Animal/Profile action ${method}:`, error);
        toast(unavailableMessage, "error");
      });
    return true;
  }

  window.HerdHarborApp = Object.freeze({
    getState: () => state,
    commitState: (next, message = "") => {
      if (!next || typeof next !== "object") return false;
      state = next;
      return saveState(message);
    },
    refresh: () => renderCurrentView(),
    toast,
    getAnimalById: animalById,
    getCurrentRoute: () => currentRoute,
    openAnimalEditor: (animalId) => launchLazyAnimalProfileAction(
      "openEditor",
      animalId,
      "Animal editing could not load. Check your connection and try again."
    ),
    openAnimalPedigreePrint: (animalId) => launchLazyAnimalProfileAction(
      "openPedigreePrint",
      animalId,
      "Pedigree printing could not load. Check your connection and try again."
    ),
    openRecordBirth: (breedingId) => openRecordBirth(breedingId)
  });
  try { window.dispatchEvent(new CustomEvent("herdharbor:app-ready")); } catch {}

  initialize();
})();
  