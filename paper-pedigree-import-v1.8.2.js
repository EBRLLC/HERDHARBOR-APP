(function (root) {
  "use strict";

  const VERSION = "1.8.2";
  const DIALOG_ID = "hh-paper-pedigree-dialog";
  const STYLE_ID = "hh-paper-pedigree-style";
  const MAX_PREVIEW_DIMENSION = 2400;
  const JPEG_QUALITY = 0.9;
  const ATTACHMENT_DB = "herdharbor_attachments_v1";
  const ATTACHMENT_STORE = "pedigreeDocuments";
  const ROLE_LABELS = Object.freeze({
    subject: "Animal",
    sire: "Sire",
    dam: "Dam",
    sireSire: "Sire's sire",
    sireDam: "Sire's dam",
    damSire: "Dam's sire",
    damDam: "Dam's dam",
    sireSireSire: "Sire's sire's sire",
    sireSireDam: "Sire's sire's dam",
    sireDamSire: "Sire's dam's sire",
    sireDamDam: "Sire's dam's dam",
    damSireSire: "Dam's sire's sire",
    damSireDam: "Dam's sire's dam",
    damDamSire: "Dam's dam's sire",
    damDamDam: "Dam's dam's dam"
  });
  const EDITABLE_FIELDS = Object.freeze([
    ["name", "Name"],
    ["registrationNumber", "Registration #"],
    ["tattoo", "Tattoo"],
    ["tag", "Tag / ear #"],
    ["breed", "Breed"],
    ["color", "Color / variety"],
    ["dob", "DOB"],
    ["breeder", "Breeder"]
  ]);

  let selectedFile = null;
  let preparedImage = null;
  let extraction = null;
  let observer = null;

  const clean = (value) => String(value == null ? "" : value).trim();
  const esc = (value) => clean(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);

  function core() {
    return root.HerdHarborPaperPedigreeImportCore || null;
  }

  function app() {
    return root.HerdHarborApp || null;
  }

  function cloud() {
    return root.HerdHarborCloud || null;
  }

  function addStyles() {
    if (root.document?.getElementById(STYLE_ID)) return;
    const style = root.document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${DIALOG_ID} { width:min(1100px,calc(100vw - 24px)); max-height:calc(100vh - 24px); padding:0; border:0; border-radius:18px; background:var(--surface,#fff); color:var(--text,#18212A); box-shadow:0 24px 80px rgba(0,0,0,.3); }
      #${DIALOG_ID}::backdrop { background:rgba(7,19,31,.68); backdrop-filter:blur(3px); }
      .hh-pp-shell { display:grid; max-height:calc(100vh - 24px); grid-template-rows:auto 1fr auto; }
      .hh-pp-head,.hh-pp-foot { display:flex; align-items:center; gap:12px; padding:16px 18px; border-color:var(--border,#d7dee3); background:var(--surface,#fff); }
      .hh-pp-head { justify-content:space-between; border-bottom:1px solid var(--border,#d7dee3); }
      .hh-pp-foot { justify-content:flex-end; border-top:1px solid var(--border,#d7dee3); flex-wrap:wrap; }
      .hh-pp-head h2 { margin:0; font-size:1.25rem; }
      .hh-pp-body { overflow:auto; padding:18px; display:grid; gap:16px; }
      .hh-pp-upload { display:grid; grid-template-columns:minmax(0,1fr) minmax(260px,.7fr); gap:16px; }
      .hh-pp-drop { padding:22px; border:2px dashed var(--border,#c7d0d7); border-radius:16px; background:rgba(13,37,64,.035); text-align:center; }
      .hh-pp-drop input { max-width:100%; }
      .hh-pp-preview { min-height:180px; display:grid; place-items:center; border:1px solid var(--border,#d7dee3); border-radius:16px; overflow:hidden; background:rgba(13,37,64,.025); }
      .hh-pp-preview img { display:block; max-width:100%; max-height:360px; object-fit:contain; }
      .hh-pp-notice { padding:12px 14px; border-radius:12px; background:#FFF7E3; color:#6C4A00; border:1px solid #E9D39B; line-height:1.45; }
      .hh-pp-status { min-height:1.4em; font-weight:650; }
      .hh-pp-status[data-type="error"] { color:#9B1C1C; }
      .hh-pp-status[data-type="success"] { color:#23633B; }
      .hh-pp-grid { display:grid; gap:12px; }
      .hh-pp-card { padding:14px; border:1px solid var(--border,#d7dee3); border-radius:14px; }
      .hh-pp-card[data-review="true"] { border-color:#D6A541; box-shadow:inset 3px 0 #D6A541; }
      .hh-pp-card h3 { margin:0 0 10px; font-size:1rem; }
      .hh-pp-fields { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; }
      .hh-pp-fields label { display:grid; gap:4px; font-size:.82rem; font-weight:700; }
      .hh-pp-fields input { width:100%; box-sizing:border-box; }
      .hh-pp-low { color:#8A5A00; font-size:.75rem; font-weight:600; }
      .hh-pp-conflicts { padding:12px 14px; border-radius:12px; border:1px solid #E6B2B2; background:#FFF2F2; color:#7A1E1E; }
      .hh-pp-generation { margin:10px 0 0; font-size:.78rem; letter-spacing:.08em; text-transform:uppercase; color:var(--muted,#657480); font-weight:800; }
      @media(max-width:800px){ .hh-pp-upload{grid-template-columns:1fr}.hh-pp-fields{grid-template-columns:repeat(2,minmax(0,1fr))}.hh-pp-foot .button{flex:1 1 150px} }
      @media(max-width:520px){ .hh-pp-fields{grid-template-columns:1fr} }
      html[data-theme="dark"] .hh-pp-notice { background:#332B1D; color:#E7D2A5; border-color:rgba(231,210,165,.2); }
      html[data-theme="dark"] .hh-pp-conflicts { background:#351F22; color:#F4C7C7; border-color:#6D3B41; }
    `;
    (root.document.head || root.document.documentElement).appendChild(style);
  }

  function ensureDialog() {
    addStyles();
    let dialog = root.document.getElementById(DIALOG_ID);
    if (dialog) return dialog;
    dialog = root.document.createElement("dialog");
    dialog.id = DIALOG_ID;
    (root.document.body || root.document.documentElement).appendChild(dialog);
    dialog.addEventListener("close", reset);
    return dialog;
  }

  function reset() {
    selectedFile = null;
    preparedImage = null;
    extraction = null;
  }

  function setStatus(message, type = "") {
    const box = root.document.querySelector(`#${DIALOG_ID} .hh-pp-status`);
    if (!box) return;
    box.textContent = message || "";
    box.dataset.type = type;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("The pedigree image could not be opened."));
      reader.onload = () => resolve(String(reader.result || ""));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("The pedigree image could not be decoded."));
      image.src = dataUrl;
    });
  }

  function openAttachmentDb() {
    return new Promise((resolve, reject) => {
      if (!root.indexedDB) return reject(new Error("This browser does not support pedigree attachment storage."));
      const request = root.indexedDB.open(ATTACHMENT_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(ATTACHMENT_STORE)) request.result.createObjectStore(ATTACHMENT_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Pedigree attachment storage could not open."));
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
        request.onerror = () => reject(request.error || new Error("Pedigree attachment storage failed."));
        transaction.onabort = () => reject(transaction.error || new Error("Pedigree attachment storage was interrupted."));
      });
    } finally {
      db.close();
    }
  }

  const putPedigreeAttachment = (id, document) => attachmentRequest("readwrite", (store) => store.put(document, id));
  const deletePedigreeAttachment = (id) => attachmentRequest("readwrite", (store) => store.delete(id));

  async function prepareImage(file) {
    if (!file || !["image/jpeg", "image/png"].includes(file.type)) {
      throw new Error("Automatic reading currently supports JPG and PNG pedigree photos.");
    }
    const originalDataUrl = await readFileAsDataUrl(file);
    const image = await loadImage(originalDataUrl);
    const largest = Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height);
    if (largest <= MAX_PREVIEW_DIMENSION && originalDataUrl.length <= 8_500_000) {
      return { dataUrl: originalDataUrl, mimeType: file.type, fileName: file.name, size: file.size };
    }
    const ratio = Math.min(1, MAX_PREVIEW_DIMENSION / Math.max(1, largest));
    const canvas = root.document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * ratio));
    canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * ratio));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the pedigree image.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    return { dataUrl, mimeType: "image/jpeg", fileName: file.name.replace(/\.[^.]+$/, "") + ".jpg", size: Math.round(dataUrl.length * 0.75) };
  }

  function roleGeneration(role) {
    const meta = core()?.ROLE_PATHS?.find?.((row) => row.role === role);
    return Number(meta?.generation || 0);
  }

  function asCoreExtraction(raw) {
    const list = Array.isArray(raw?.nodes) ? raw.nodes : [];
    return {
      ...raw,
      nodes: Object.fromEntries(list.map((node) => [node.role, node]))
    };
  }

  function confidenceFor(node, field) {
    const score = Number(node?.confidence?.[field]);
    return Number.isFinite(score) ? score : null;
  }

  function reviewCard(node) {
    const generation = roleGeneration(node.role);
    const fields = EDITABLE_FIELDS.map(([field, label]) => {
      const score = confidenceFor(node, field);
      const low = clean(node[field]) && score != null && score < 0.72;
      return `<label>${esc(label)}<input data-pp-field="${esc(field)}" value="${esc(node[field] || "")}">${low ? `<span class="hh-pp-low">Please verify this field</span>` : ""}</label>`;
    }).join("");
    return `<article class="hh-pp-card" data-pp-role="${esc(node.role)}" data-review="${node.reviewRequired ? "true" : "false"}">
      <h3>${esc(ROLE_LABELS[node.role] || node.role)}${generation ? ` <span class="muted">· generation ${generation}</span>` : ""}</h3>
      <div class="hh-pp-fields">${fields}</div>
    </article>`;
  }

  function renderReview(normalized) {
    const target = root.document.querySelector(`#${DIALOG_ID} [data-pp-review]`);
    if (!target) return;
    const present = (normalized?.nodes || []).filter((node) => node.present);
    let lastGeneration = -1;
    const html = [];
    for (const node of present) {
      const generation = roleGeneration(node.role);
      if (generation !== lastGeneration) {
        html.push(`<div class="hh-pp-generation">${generation === 0 ? "Animal" : generation === 1 ? "Parents" : generation === 2 ? "Grandparents" : "Great-grandparents"}</div>`);
        lastGeneration = generation;
      }
      html.push(reviewCard(node));
    }
    target.innerHTML = html.join("") || `<div class="hh-pp-notice">No pedigree animals were read from this photo.</div>`;
    const commit = root.document.querySelector(`#${DIALOG_ID} [data-pp-commit]`);
    if (commit) commit.disabled = !present.some((node) => node.role === "subject");
  }

  function collectReviewedExtraction() {
    const base = extraction ? JSON.parse(JSON.stringify(extraction)) : null;
    if (!base) return null;
    const byRole = new Map((base.nodes || []).map((node) => [node.role, node]));
    root.document.querySelectorAll(`#${DIALOG_ID} [data-pp-role]`).forEach((card) => {
      const node = byRole.get(card.dataset.ppRole);
      if (!node) return;
      card.querySelectorAll("[data-pp-field]").forEach((input) => {
        node[input.dataset.ppField] = clean(input.value);
        if (node.confidence) node.confidence[input.dataset.ppField] = 1;
      });
    });
    return base;
  }

  function renderPlanProblems(plan) {
    const box = root.document.querySelector(`#${DIALOG_ID} [data-pp-problems]`);
    if (!box) return;
    const messages = [];
    for (const conflict of plan?.conflicts || []) {
      if (conflict.type === "ambiguous-match") {
        messages.push(`${ROLE_LABELS[conflict.role] || conflict.role}: more than one existing animal matches this pedigree entry. Edit the identifying fields so the match is unambiguous.`);
      } else if (conflict.type === "field-conflict") {
        const fields = (conflict.fields || []).map((row) => row.field).join(", ");
        messages.push(`${ROLE_LABELS[conflict.role] || conflict.role}: an existing animal with the same identifier has different ${fields}. HerdHarbor will not overwrite it automatically.`);
      }
    }
    box.innerHTML = messages.length ? `<div class="hh-pp-conflicts"><strong>Resolve before import</strong><br>${messages.map(esc).join("<br>")}</div>` : "";
    return messages.length;
  }

  async function readPedigree() {
    if (!selectedFile) return setStatus("Choose a JPG or PNG pedigree photo first.", "error");
    if (!cloud()?.getSession?.()?.user?.id) return setStatus("Sign in before using automatic pedigree reading.", "error");
    const button = root.document.querySelector(`#${DIALOG_ID} [data-pp-read]`);
    if (button) button.disabled = true;
    setStatus("Preparing and reading the pedigree…");
    try {
      preparedImage = await prepareImage(selectedFile);
      const preview = root.document.querySelector(`#${DIALOG_ID} [data-pp-preview]`);
      if (preview) preview.innerHTML = `<img src="${preparedImage.dataUrl}" alt="Selected paper pedigree">`;
      const response = await cloud().invokeFunction("paper-pedigree-extract", preparedImage);
      if (!response?.extraction) throw new Error(response?.error || "The pedigree reader returned no draft.");
      extraction = response.extraction;
      const normalized = core().normalizeExtraction(asCoreExtraction(extraction));
      renderReview(normalized);
      const warnings = [...new Set([...(response.extraction.warnings || []), ...(normalized.warnings || [])])];
      setStatus(warnings.length ? `Draft ready. Review every field; ${warnings.length} item${warnings.length === 1 ? "" : "s"} need extra attention.` : "Draft ready. Review every field before importing.", warnings.length ? "" : "success");
    } catch (error) {
      setStatus(error?.message || "HerdHarbor could not read that pedigree photo.", "error");
    } finally {
      if (button) button.disabled = false;
    }
  }

  function makePedigreeRecord(nextState, result, reviewed, file) {
    nextState.pedigrees = Array.isArray(nextState.pedigrees) ? nextState.pedigrees : [];
    const ancestorIds = {};
    for (const action of result.plan.actions || []) {
      if (action.role !== "subject" && action.animalId) ancestorIds[action.role] = action.animalId;
    }
    const importedAt = new Date().toISOString();
    const id = `pedigree_ai_${String(reviewed.extractionId || Date.now()).replace(/[^a-z0-9_-]/gi, "").slice(0, 80)}`;
    const record = {
      id,
      subjectAnimalId: result.subjectAnimalId,
      ancestorIds,
      sourceNotes: "Imported from a paper pedigree photo after member review.",
      notes: "",
      fileName: file?.fileName || reviewed.sourceName || "Paper pedigree.jpg",
      mimeType: file?.mimeType || "image/jpeg",
      fileSize: Number(file?.size || 0),
      sourceDataUrl: "",
      attachmentStored: Boolean(file?.dataUrl),
      importedAt,
      mode: "ai-photo-reviewed",
      builderVersion: "1.0"
    };
    nextState.pedigrees.push(record);
    return record;
  }

  async function commitReviewedPedigree() {
    const reviewed = collectReviewedExtraction();
    if (!reviewed) return setStatus("Read a pedigree photo before importing.", "error");
    const current = app()?.getState?.();
    if (!current || !core()) return setStatus("HerdHarbor is not ready to import this pedigree.", "error");
    const plan = core().buildImportPlan(current, asCoreExtraction(reviewed));
    if (renderPlanProblems(plan) || !plan.canCommit) {
      setStatus("Resolve the highlighted pedigree conflicts before importing.", "error");
      return;
    }
    const commitButton = root.document.querySelector(`#${DIALOG_ID} [data-pp-commit]`);
    if (commitButton) commitButton.disabled = true;
    let storedAttachmentId = "";
    try {
      const applied = core().applyImportPlan(current, plan);
      const subject = applied.state.animals.find((row) => String(row.id) === String(applied.subjectAnimalId));
      if (subject && String(subject.status || "").toLowerCase().includes("ancestor")) subject.status = "Active";
      const record = makePedigreeRecord(applied.state, { ...applied, plan }, reviewed, preparedImage);
      if (preparedImage?.dataUrl) {
        await putPedigreeAttachment(record.id, preparedImage);
        storedAttachmentId = record.id;
      }
      const saved = app().commitState(applied.state, "Paper pedigree imported.");
      if (saved === false) throw new Error("HerdHarbor could not save the reviewed pedigree.");
      setStatus("Paper pedigree imported successfully.", "success");
      root.setTimeout(() => ensureDialog().close(), 700);
    } catch (error) {
      if (storedAttachmentId) await deletePedigreeAttachment(storedAttachmentId).catch(() => {});
      setStatus(error?.message || "The reviewed pedigree could not be imported.", "error");
      if (commitButton) commitButton.disabled = false;
    }
  }

  function open() {
    if (!core() || !app()) return;
    const dialog = ensureDialog();
    reset();
    dialog.innerHTML = `<div class="hh-pp-shell">
      <header class="hh-pp-head"><div><small class="muted">HerdHarbor paper pedigree</small><h2>Import pedigree from a photo</h2></div><button type="button" class="button button-ghost" data-pp-close>Close</button></header>
      <div class="hh-pp-body">
        <div class="hh-pp-notice"><strong>Review required.</strong> Automatic reading can misread printed or handwritten pedigree information. HerdHarbor will show the extracted draft before anything is added to your records.</div>
        <div class="hh-pp-upload">
          <div class="hh-pp-drop"><strong>Choose a clear photo of the pedigree</strong><p class="muted">JPG or PNG. Photograph the page straight-on with all names and identifiers visible.</p><input type="file" accept="image/jpeg,image/png" data-pp-file></div>
          <div class="hh-pp-preview" data-pp-preview><span class="muted">Photo preview</span></div>
        </div>
        <div><button type="button" class="button button-primary" data-pp-read>Read pedigree photo</button></div>
        <div class="hh-pp-status" data-type=""></div>
        <div data-pp-problems></div>
        <div class="hh-pp-grid" data-pp-review></div>
      </div>
      <footer class="hh-pp-foot"><button type="button" class="button button-ghost" data-pp-close>Cancel</button><button type="button" class="button button-primary" data-pp-commit disabled>Review complete — import pedigree</button></footer>
    </div>`;
    dialog.querySelectorAll("[data-pp-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
    dialog.querySelector("[data-pp-file]")?.addEventListener("change", async (event) => {
      selectedFile = event.target.files?.[0] || null;
      extraction = null;
      preparedImage = null;
      const review = dialog.querySelector("[data-pp-review]");
      if (review) review.innerHTML = "";
      const commit = dialog.querySelector("[data-pp-commit]");
      if (commit) commit.disabled = true;
      if (!selectedFile) return;
      try {
        const localPreview = await readFileAsDataUrl(selectedFile);
        const preview = dialog.querySelector("[data-pp-preview]");
        if (preview) preview.innerHTML = `<img src="${localPreview}" alt="Selected paper pedigree">`;
        setStatus("Photo selected. Nothing has been added to your records yet.");
      } catch (error) {
        setStatus(error?.message || "The photo could not be opened.", "error");
      }
    });
    dialog.querySelector("[data-pp-read]")?.addEventListener("click", readPedigree);
    dialog.querySelector("[data-pp-commit]")?.addEventListener("click", commitReviewedPedigree);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function injectLaunchers() {
    const importButton = root.document.querySelector("#import-pedigree");
    if (importButton && !root.document.querySelector("#hh-ai-pedigree-import")) {
      const button = root.document.createElement("button");
      button.type = "button";
      button.id = "hh-ai-pedigree-import";
      button.className = "button button-primary";
      button.textContent = "Import paper pedigree photo";
      button.addEventListener("click", open);
      importButton.insertAdjacentElement("afterend", button);
    }

    const quickPedigree = root.document.querySelector('[data-quick="pedigree"]');
    if (quickPedigree?.parentElement && !quickPedigree.parentElement.querySelector("[data-pp-quick]")) {
      const button = root.document.createElement("button");
      button.type = "button";
      button.className = "animal-card";
      button.dataset.ppQuick = "true";
      button.style.cssText = "text-align:left;border:1px solid var(--border)";
      button.innerHTML = "<h3>Paper pedigree photo</h3><p class=\"muted\">Read a pedigree photo, review it, and create the animal plus ancestry.</p>";
      button.addEventListener("click", open);
      quickPedigree.insertAdjacentElement("afterend", button);
    }
  }

  function start() {
    addStyles();
    injectLaunchers();
    if (observer) return;
    observer = new MutationObserver(() => injectLaunchers());
    observer.observe(root.document.documentElement, { childList: true, subtree: true });
  }

  root.HerdHarborPaperPedigreeImport = Object.freeze({ VERSION, open, start });
  if (root.document?.readyState === "loading") root.document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})(typeof globalThis !== "undefined" ? globalThis : this);
