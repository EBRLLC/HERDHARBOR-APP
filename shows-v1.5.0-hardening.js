(() => {
  "use strict";
  const STORAGE_KEY = "herdharbor_pre_alpha_v1";
  const RETURN_KEY = "herdharbor_v150_return_shows";
  const PAGE_SIZE = 24;
  let editContext = { showId: "", projectId: "", exhibitorId: "" };
  let scheduled = false;

  const q = (s, r = document) => r.querySelector(s);
  const qa = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clean = (v) => String(v == null ? "" : v).trim();
  const read = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; } };
  const now = () => new Date().toISOString();
  const fmtDate = (v) => { if (!v) return "—"; const d = new Date(`${String(v).slice(0, 10)}T12:00:00`); return Number.isNaN(d.getTime()) ? esc(v) : d.toLocaleDateString(); };
  const animalName = (s, id) => s.animals?.find((a) => a.id === id)?.name || "—";
  const exhibitorName = (s, id) => { const e = s.exhibitors?.find((x) => x.id === id); return e ? clean(e.preferredName) || [e.firstName, e.lastName].filter(Boolean).join(" ") || "Unnamed exhibitor" : "—"; };
  const awardLabel = (a) => a?.awardType === "Other" ? (a.customAward || "Other") : (a?.awardType || "Other");
  const resultPlacement = (r) => r?.placement === "Custom" ? (r.customPlacement || "Custom") : (r?.placementNumber && Number(r.placementNumber) > 10 ? ordinal(Number(r.placementNumber)) : (r?.placement || "—"));
  const ordinal = (n) => { const v = n % 100; return `${n}${["th", "st", "nd", "rd"][(v - 20) % 10] || ["th", "st", "nd", "rd"][v] || "th"}`; };
  const showType = (sh) => sh?.showType === "Other" ? (sh.customShowType || "Other") : (sh?.showType || "Other");

  function write(state, message) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    try { sessionStorage.setItem(RETURN_KEY, JSON.stringify({ tab: "shows", year: String(new Date().getFullYear()), message })); } catch {}
    location.reload();
  }

  function modal(title, html, kicker = "Shows") {
    const back = q("#modal-backdrop"), content = q("#modal-content"), heading = q("#modal-title"), kick = q("#modal-kicker");
    if (!back || !content || !heading) return;
    heading.textContent = title;
    if (kick) kick.textContent = kicker;
    content.innerHTML = html;
    back.classList.remove("hidden");
    back.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }
  function closeModal() { q("#modal-backdrop")?.classList.add("hidden"); q("#modal-backdrop")?.setAttribute("aria-hidden", "true"); document.body.classList.remove("modal-open"); if (q("#modal-content")) q("#modal-content").innerHTML = ""; }
  function toast(message, type = "success") { const host = q("#toast-region"); if (!host) return alert(message); const n = document.createElement("div"); n.className = `toast ${type}`; n.textContent = message; host.appendChild(n); setTimeout(() => n.remove(), 3500); }
  function actions(primary = "Save") { return `<div class="form-actions"><button type="button" class="button button-ghost" data-hh-hardening-cancel>Cancel</button><button type="submit" class="button button-primary">${esc(primary)}</button></div>`; }
  function bindCancel(root = document) { qa("[data-hh-hardening-cancel]", root).forEach((b) => b.addEventListener("click", closeModal)); }
  function stat(label, value) { return `<article class="stat-card"><span class="label">${esc(label)}</span><strong class="value">${esc(value)}</strong></article>`; }

  function animalHistory(state, animalId) {
    const entries = (state.showEntries || []).filter((e) => e.animalId === animalId);
    const ids = new Set(entries.map((e) => e.id));
    const results = (state.showResults || []).filter((r) => ids.has(r.entryId));
    const resultIds = new Set(results.map((r) => r.id));
    const awards = (state.showAwards || []).filter((a) => ids.has(a.entryId) || resultIds.has(a.resultId) || a.animalId === animalId);
    return { entries, results, awards, shows: new Set(entries.map((e) => e.showId)), firsts: results.filter((r) => r.placement === "1st" || Number(r.placementNumber) === 1).length, championships: awards.filter((a) => /champion|best of breed|best in show|division champion/i.test(awardLabel(a))).length };
  }

  function openAnimalHistory(animalId) {
    const s = read(), a = (s.animals || []).find((x) => x.id === animalId), h = animalHistory(s, animalId);
    const rows = h.entries.slice().sort((x, y) => String((s.shows || []).find((z) => z.id === y.showId)?.startDate || "").localeCompare(String((s.shows || []).find((z) => z.id === x.showId)?.startDate || "")));
    modal(`${a?.name || "Animal"} · Show History`, `<div class="stats-grid">${stat("Shows entered", h.shows.size)}${stat("Classes entered", h.entries.length)}${stat("First-place finishes", h.firsts)}${stat("Championships", h.championships)}${stat("Total awards", h.awards.length)}</div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Show</th><th>Date</th><th>Class</th><th>Placement</th><th>Awards</th></tr></thead><tbody>${rows.map((e) => { const sh = (s.shows || []).find((x) => x.id === e.showId); const rs = (s.showResults || []).filter((r) => r.entryId === e.id); const aw = (s.showAwards || []).filter((x) => x.entryId === e.id); return `<tr><td>${esc(sh?.name || "—")}</td><td>${fmtDate(sh?.startDate)}</td><td>${esc(e.className || e.division || "—")}</td><td>${esc(rs.map(resultPlacement).join(", ") || "—")}</td><td>${esc(aw.map(awardLabel).join(", ") || "—")}</td></tr>`; }).join("")}</tbody></table></div><div class="form-actions"><button type="button" class="button button-primary" data-hh-hardening-cancel>Close</button></div>`, "Animal Show History");
    bindCancel();
  }

  function openEditResult(entryId, resultId) {
    const s = read(), r = (s.showResults || []).find((x) => x.id === resultId); if (!r) return toast("Result not found.", "error");
    const placements = ["1st","2nd","3rd","4th","5th","6th","7th","8th","9th","10th","Participated","Did Not Place","Disqualified","Custom"];
    modal("Edit result", `<form id="hh-hardening-result-form"><div class="form-grid two"><label>Placement<select name="placement">${placements.map((p) => `<option value="${esc(p)}" ${p === r.placement ? "selected" : ""}>${esc(p)}</option>`).join("")}</select></label><label>Numeric placement beyond 10th<input name="placementNumber" type="number" min="1" step="1" value="${esc(r.placementNumber || "")}"></label><label>Custom placement<input name="customPlacement" value="${esc(r.customPlacement || "")}"></label><label>Judge<input name="judge" value="${esc(r.judge || "")}"></label><label>Score<input name="score" value="${esc(r.score || "")}"></label></div><label>Judge comments<textarea name="comments" rows="3">${esc(r.comments || "")}</textarea></label><label>Strengths<textarea name="strengths" rows="2">${esc(r.strengths || "")}</textarea></label><label>Areas for improvement<textarea name="improvements" rows="2">${esc(r.improvements || "")}</textarea></label><label>Notes<textarea name="notes" rows="2">${esc(r.notes || "")}</textarea></label>${attachmentManagerHtml(r.attachments || [], "result", resultId)}${actions("Save result")}</form>`, "Shows · Result");
    bindCancel(); bindAttachmentRemovers();
    q("#hh-hardening-result-form").addEventListener("submit", (e) => { e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget)); if (data.placementNumber && (!Number.isInteger(Number(data.placementNumber)) || Number(data.placementNumber) < 1)) return toast("Numeric placement must be a positive whole number.", "error"); const state = read(), target = (state.showResults || []).find((x) => x.id === resultId); Object.assign(target, data, { entryId, updatedAt: now() }); write(state, "Result updated."); });
  }

  function openAddAward(entryId, resultId = "") {
    const s = read(), entry = (s.showEntries || []).find((e) => e.id === entryId); if (!entry) return;
    const types = ["Champion","Reserve Champion","Grand Champion","Reserve Grand Champion","Best of Breed","Best Opposite Sex","Best in Show","Reserve Best in Show","Best Junior","Best Senior","Showmanship Champion","Showmanship Reserve","Division Champion","Class Winner","Blue Ribbon","Red Ribbon","White Ribbon","Purple Ribbon","Other"];
    const sh = (s.shows || []).find((x) => x.id === entry.showId);
    modal("Add award", `<form id="hh-hardening-award-form"><div class="form-grid two"><label>Award<select name="awardType">${types.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join("")}</select></label><label>Custom award<input name="customAward"></label><label>Date<input name="date" type="date" value="${esc(sh?.startDate || new Date().toISOString().slice(0,10))}"></label></div><label>Notes<textarea name="notes" rows="3"></textarea></label>${actions("Add award")}</form>`, "Shows · Award"); bindCancel();
    q("#hh-hardening-award-form").addEventListener("submit", (e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.currentTarget)); if (d.awardType === "Other" && !clean(d.customAward)) return toast("Enter a custom award name.", "error"); const st = read(); if (!Array.isArray(st.showAwards)) st.showAwards = []; st.showAwards.push({ id: `award_${Date.now()}_${Math.random().toString(36).slice(2,7)}`, ...d, resultId, entryId, showId: entry.showId, animalId: entry.animalId, exhibitorId: entry.exhibitorId, createdAt: now() }); write(st, "Award added."); });
  }

  function attachmentManagerHtml(items, ownerType, ownerId) {
    if (!items.length) return `<p class="muted">No attachments on this record.</p>`;
    return `<div class="list hh-hardening-attachments">${items.map((a, i) => `<div class="list-item"><div class="list-item-main"><strong>${esc(a.name || `Attachment ${i+1}`)}</strong><span>${Math.round((Number(a.size)||0)/1024)} KB</span></div><div class="list-item-actions"><a class="button button-ghost button-small" href="${esc(a.dataUrl || "")}" download="${esc(a.name || "attachment")}">Open</a><button type="button" class="button button-danger button-small" data-remove-attachment="${i}" data-owner-type="${ownerType}" data-owner-id="${esc(ownerId)}">Remove</button></div></div>`).join("")}</div>`;
  }
  function bindAttachmentRemovers(root = document) { qa("[data-remove-attachment]", root).forEach((b) => b.addEventListener("click", () => removeAttachment(b.dataset.ownerType, b.dataset.ownerId, Number(b.dataset.removeAttachment)))); }
  function removeAttachment(type, id, index) {
    if (!confirm("Remove this attachment from the record?")) return;
    const s = read(); const collection = type === "show" ? s.shows : s.showResults; const row = (collection || []).find((x) => x.id === id); if (!row || !Array.isArray(row.attachments)) return; row.attachments.splice(index, 1); row.updatedAt = now(); write(s, "Attachment removed.");
  }
  function openShowAttachmentManager(showId) { const s = read(), sh = (s.shows || []).find((x) => x.id === showId); if (!sh) return; modal(`${sh.name} · Attachments`, `${attachmentManagerHtml(sh.attachments || [], "show", showId)}<div class="form-actions"><button class="button button-primary" data-hh-hardening-cancel>Close</button></div>`, "Shows · Documents"); bindCancel(); bindAttachmentRemovers(); }
  function openProjectPhotoManager(projectId) { const s = read(), p = (s.showProjects || []).find((x) => x.id === projectId), photos = (s.projectPhotos || []).filter((x) => x.projectId === projectId); modal(`${p?.projectName || "Project"} · Photos`, `${photos.length ? `<div class="list">${photos.map((ph) => `<div class="list-item"><div class="list-item-main"><strong>${esc(ph.category || "Photo")} · ${esc(ph.caption || "")}</strong><span>${fmtDate(ph.date)}</span></div><div class="list-item-actions"><button class="button button-danger button-small" data-remove-project-photo="${ph.id}">Remove</button></div></div>`).join("")}</div>` : `<p class="muted">No project photos.</p>`}<div class="form-actions"><button class="button button-primary" data-hh-hardening-cancel>Close</button></div>`, "Shows · Project"); bindCancel(); qa("[data-remove-project-photo]").forEach((b) => b.addEventListener("click", () => { if (!confirm("Remove this project photo?")) return; const st = read(); st.projectPhotos = (st.projectPhotos || []).filter((x) => x.id !== b.dataset.removeProjectPhoto); write(st, "Project photo removed."); })); }

  function addEntryEnhancements() {
    const s = read();
    qa("#view-shows .hh-show-entry-row").forEach((row) => {
      if (row.dataset.hhHardening === "1") return;
      const edit = q("[data-edit-entry]", row); if (!edit) return; const entryId = edit.dataset.editEntry; const entry = (s.showEntries || []).find((x) => x.id === entryId); if (!entry) return;
      const actionsHost = q(".list-item-actions", row); if (!actionsHost) return;
      const history = document.createElement("button"); history.type = "button"; history.className = "button button-ghost button-small"; history.textContent = "Animal history"; history.addEventListener("click", () => openAnimalHistory(entry.animalId)); actionsHost.appendChild(history);
      (s.showResults || []).filter((r) => r.entryId === entryId).forEach((r) => { const eb = document.createElement("button"); eb.type = "button"; eb.className = "button button-ghost button-small"; eb.textContent = `Edit ${resultPlacement(r)}`; eb.addEventListener("click", () => openEditResult(entryId, r.id)); actionsHost.appendChild(eb); const ab = document.createElement("button"); ab.type = "button"; ab.className = "button button-ghost button-small"; ab.textContent = "Award for result"; ab.addEventListener("click", () => openAddAward(entryId, r.id)); actionsHost.appendChild(ab); });
      row.dataset.hhHardening = "1";
    });
  }

  function addShowAttachmentButton() {
    const add = q("#view-shows [data-add-entry-for]"); if (!add) return; const showId = add.dataset.addEntryFor; const panels = qa("#view-shows .panel"); const info = panels.find((p) => /Show Information/i.test(p.textContent || "")); if (!info || info.dataset.hhAttachments === "1") return; const header = q(".panel-header", info); const b = document.createElement("button"); b.type = "button"; b.className = "button button-ghost button-small"; b.textContent = "Manage attachments"; b.addEventListener("click", () => openShowAttachmentManager(showId)); (header || info).appendChild(b); info.dataset.hhAttachments = "1";
  }
  function addProjectPhotoButton() { const report = q("#view-shows [data-project-report]"); if (!report) return; const projectId = report.dataset.projectReport; const panels = qa("#view-shows .panel"); const panel = panels.find((p) => /Notes & Photos/i.test(p.textContent || "")); if (!panel || panel.dataset.hhPhotoManager === "1") return; const header = q(".panel-header", panel); const b = document.createElement("button"); b.type = "button"; b.className = "button button-ghost button-small"; b.textContent = "Manage photos"; b.addEventListener("click", () => openProjectPhotoManager(projectId)); (header || panel).appendChild(b); panel.dataset.hhPhotoManager = "1"; }

  function advancedFilterHtml(s) {
    const animals = [...(s.animals || [])].sort((a,b) => clean(a.name).localeCompare(clean(b.name)));
    const exhibitors = [...(s.exhibitors || [])].sort((a,b) => exhibitorName(s,a.id).localeCompare(exhibitorName(s,b.id)));
    const projects = [...(s.showProjects || [])];
    const orgs = [...new Set((s.shows || []).map((x) => clean(x.organization)).filter(Boolean))].sort();
    return `<div class="hh-shows-advanced-filters"><label>Exhibitor<select data-hh-filter="exhibitor"><option value="">All exhibitors</option>${exhibitors.map((e) => `<option value="${e.id}">${esc(exhibitorName(s,e.id))}</option>`).join("")}</select></label><label>Animal<select data-hh-filter="animal"><option value="">All animals</option>${animals.map((a) => `<option value="${a.id}">${esc(a.name || a.id)}</option>`).join("")}</select></label><label>Species<input data-hh-filter="species" placeholder="All species"></label><label>Breed<input data-hh-filter="breed" placeholder="All breeds"></label><label>Organization<select data-hh-filter="organization"><option value="">All organizations</option>${orgs.map((o) => `<option>${esc(o)}</option>`).join("")}</select></label><label>Placement<input data-hh-filter="placement" placeholder="1st, Participated..."></label><label>Award<input data-hh-filter="award" placeholder="Champion, ribbon..."></label><label>Project<select data-hh-filter="project"><option value="">All projects</option>${projects.map((p) => `<option value="${p.id}">${esc(p.projectName)}</option>`).join("")}</select></label></div>`;
  }
  function addAdvancedShowFilters() {
    const base = q("#view-shows .hh-shows-filter-grid"); if (!base || q("#view-shows .hh-shows-advanced-filters")) return; const s = read(); base.insertAdjacentHTML("afterend", advancedFilterHtml(s)); qa("#view-shows [data-hh-filter]").forEach((x) => x.addEventListener("input", applyShowFilters)); applyShowFilters();
  }
  function applyShowFilters() {
    const s = read(); const filters = Object.fromEntries(qa("#view-shows [data-hh-filter]").map((el) => [el.dataset.hhFilter, clean(el.value).toLowerCase()]));
    const cards = qa("#view-shows .hh-shows-card-grid > .animal-card"); let visible = [];
    cards.forEach((card) => { const id = q("[data-view-show]", card)?.dataset.viewShow; const sh = (s.shows || []).find((x) => x.id === id); const entries = (s.showEntries || []).filter((e) => e.showId === id); const entryIds = new Set(entries.map((e) => e.id)); const results = (s.showResults || []).filter((r) => entryIds.has(r.entryId)); const awards = (s.showAwards || []).filter((a) => a.showId === id || entryIds.has(a.entryId)); let ok = true;
      if (filters.exhibitor) ok &&= entries.some((e) => e.exhibitorId === filters.exhibitor);
      if (filters.animal) ok &&= entries.some((e) => e.animalId === filters.animal);
      if (filters.species) ok &&= entries.some((e) => clean((s.animals || []).find((a) => a.id === e.animalId)?.species).toLowerCase().includes(filters.species));
      if (filters.breed) ok &&= entries.some((e) => clean((s.animals || []).find((a) => a.id === e.animalId)?.breed).toLowerCase().includes(filters.breed));
      if (filters.organization) ok &&= clean(sh?.organization).toLowerCase() === filters.organization;
      if (filters.placement) ok &&= results.some((r) => resultPlacement(r).toLowerCase().includes(filters.placement));
      if (filters.award) ok &&= awards.some((a) => awardLabel(a).toLowerCase().includes(filters.award));
      if (filters.project) ok &&= entries.some((e) => e.projectId === filters.project);
      card.hidden = !ok; if (ok) visible.push(card);
    });
    paginate(visible, "shows");
  }

  function paginate(items, key) {
    if (!items.length) return;
    const host = items[0].parentElement; if (!host) return;
    let pager = host.nextElementSibling; if (!pager || !pager.classList.contains("hh-shows-pager")) { pager = document.createElement("div"); pager.className = "hh-shows-pager"; host.insertAdjacentElement("afterend", pager); }
    const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE)); const requested = Number(pager.dataset.page || 1); const page = Math.min(pageCount, Math.max(1, requested)); pager.dataset.page = String(page);
    items.forEach((item, i) => item.hidden = i < (page - 1) * PAGE_SIZE || i >= page * PAGE_SIZE);
    pager.innerHTML = items.length > PAGE_SIZE ? `<button class="button button-ghost button-small" ${page <= 1 ? "disabled" : ""} data-page-prev>Previous</button><span>Page ${page} of ${pageCount} · ${items.length} records</span><button class="button button-ghost button-small" ${page >= pageCount ? "disabled" : ""} data-page-next>Next</button>` : `<span>${items.length} records</span>`;
    q("[data-page-prev]", pager)?.addEventListener("click", () => { pager.dataset.page = String(page - 1); if (key === "shows") applyShowFilters(); else paginate(items, key); });
    q("[data-page-next]", pager)?.addEventListener("click", () => { pager.dataset.page = String(page + 1); if (key === "shows") applyShowFilters(); else paginate(items, key); });
  }
  function paginateOtherCards() { const cards = qa("#view-shows > .cards-grid:not(.hh-shows-card-grid) > .animal-card"); if (cards.length > PAGE_SIZE) paginate(cards, "other"); }

  function addExhibitorFilters() {
    const heading = q("#view-shows .page-header h2"); if (!heading || /Exhibitors$/i.test(heading.textContent || "") || q("#view-shows .hh-exhibitor-history-filters")) return;
    const table = q("#view-shows .data-table"); if (!table || !/Achievement History/i.test(q("#view-shows .panel-header")?.textContent || "")) return;
    const s = read(); const rows = qa("tbody tr", table); const years = [...new Set((s.shows || []).map((x) => clean(x.startDate).slice(0,4)).filter(Boolean))].sort((a,b)=>b.localeCompare(a));
    table.parentElement.insertAdjacentHTML("beforebegin", `<div class="hh-exhibitor-history-filters"><label>Year<select data-eh="year"><option value="">All years</option>${years.map((y)=>`<option>${y}</option>`).join("")}</select></label><label>Species<input data-eh="species" placeholder="All species"></label><label>Animal<input data-eh="animal" placeholder="All animals"></label><label>Organization<input data-eh="organization" placeholder="All organizations"></label><label>Show type<input data-eh="showType" placeholder="All show types"></label></div>`);
    qa("#view-shows [data-eh]").forEach((el) => el.addEventListener("input", () => { const f = Object.fromEntries(qa("#view-shows [data-eh]").map((x) => [x.dataset.eh, clean(x.value).toLowerCase()])); rows.forEach((tr) => { const cells = qa("td", tr); const sh = (s.shows || []).find((x) => clean(x.name) === clean(cells[0]?.textContent)); const animal = (s.animals || []).find((x) => clean(x.name) === clean(cells[1]?.textContent)); let ok = true; if (f.year) ok &&= clean(sh?.startDate).startsWith(f.year); if (f.species) ok &&= clean(animal?.species).toLowerCase().includes(f.species); if (f.animal) ok &&= clean(animal?.name).toLowerCase().includes(f.animal); if (f.organization) ok &&= clean(sh?.organization).toLowerCase().includes(f.organization); if (f.showType) ok &&= showType(sh).toLowerCase().includes(f.showType); tr.hidden = !ok; }); }));
  }

  function installArchiveConfirmation() {
    document.addEventListener("click", (e) => { const b = e.target.closest("[data-edit-show],[data-edit-project],[data-edit-exhibitor]"); if (!b) return; if (b.dataset.editShow) editContext.showId = b.dataset.editShow; if (b.dataset.editProject) editContext.projectId = b.dataset.editProject; if (b.dataset.editExhibitor) editContext.exhibitorId = b.dataset.editExhibitor; }, true);
    document.addEventListener("submit", (e) => { const form = e.target; const state = read(); if (form.id === "hh-show-form" && editContext.showId) { const old = (state.shows || []).find((x) => x.id === editContext.showId); const next = new FormData(form).get("status"); if (old?.status !== "Archived" && next === "Archived" && !confirm("Archive this show? Historical entries, results, awards, and linked Finance records will remain available.")) { e.preventDefault(); e.stopImmediatePropagation(); } }
      if (form.id === "hh-project-form" && editContext.projectId) { const old = (state.showProjects || []).find((x) => x.id === editContext.projectId); const next = new FormData(form).get("status"); if (old?.status !== "Archived" && next === "Archived" && !confirm("Archive this project? Historical project records will remain available.")) { e.preventDefault(); e.stopImmediatePropagation(); } }
      if (form.id === "hh-exhibitor-form" && editContext.exhibitorId) { const old = (state.exhibitors || []).find((x) => x.id === editContext.exhibitorId); const next = new FormData(form).get("status"); if (old?.status !== "Inactive" && next === "Inactive" && !confirm("Mark this exhibitor inactive? Historical achievement records will remain available.")) { e.preventDefault(); e.stopImmediatePropagation(); } }
    }, true);
  }

  function enhance() {
    scheduled = false;
    if (!q("#view-shows.active")) return;
    addEntryEnhancements(); addShowAttachmentButton(); addProjectPhotoButton(); addAdvancedShowFilters(); addExhibitorFilters(); paginateOtherCards();
  }
  function schedule() { if (scheduled) return; scheduled = true; requestAnimationFrame(enhance); }

  function start() {
    installArchiveConfirmation();
    document.addEventListener("click", (e) => { if (e.target.closest("[data-shows-tab],[data-view-show],[data-view-exhibitor],[data-view-project],[data-back-shows],[data-back-exhibitors],[data-back-projects]")) setTimeout(schedule, 0); });
    if (!window.__hhShowsHardeningObserver) {
      const attachObserver = () => {
        const target = document.body;
        if (!target) return false;
        if (!window.__hhShowsHardeningObserver) {
          const observer = new MutationObserver(schedule);
          observer.observe(target, { childList: true, subtree: true });
          window.__hhShowsHardeningObserver = observer;
        }
        return true;
      };
      if (!attachObserver()) document.addEventListener("DOMContentLoaded", attachObserver, { once: true });
    }
    window.addEventListener("hashchange", schedule); schedule();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
})();