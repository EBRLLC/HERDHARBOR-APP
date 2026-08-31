(() => {
  "use strict";
  const PAGE_SIZE = 24;
  let scheduled = false;
  const q = (s, r = document) => r.querySelector(s);
  const qa = (s, r = document) => Array.from(r.querySelectorAll(s));

  function paginateRows() {
    const rows = qa("#view-shows .hh-show-entry-row");
    if (!rows.length) return;
    const list = rows[0].parentElement;
    if (!list) return;
    let pager = list.nextElementSibling;
    if (!pager || !pager.classList.contains("hh-show-entry-pager")) {
      pager = document.createElement("div");
      pager.className = "hh-shows-pager hh-show-entry-pager";
      list.insertAdjacentElement("afterend", pager);
    }
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const page = Math.min(pages, Math.max(1, Number(pager.dataset.page || 1)));
    pager.dataset.page = String(page);
    rows.forEach((row, index) => {
      row.hidden = index < (page - 1) * PAGE_SIZE || index >= page * PAGE_SIZE;
    });
    pager.innerHTML = rows.length > PAGE_SIZE
      ? `<button class="button button-ghost button-small" ${page <= 1 ? "disabled" : ""} data-entry-prev>Previous</button><span>Entries ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, rows.length)} of ${rows.length}</span><button class="button button-ghost button-small" ${page >= pages ? "disabled" : ""} data-entry-next>Next</button>`
      : `<span>${rows.length} entries</span>`;
    q("[data-entry-prev]", pager)?.addEventListener("click", () => { pager.dataset.page = String(page - 1); paginateRows(); });
    q("[data-entry-next]", pager)?.addEventListener("click", () => { pager.dataset.page = String(page + 1); paginateRows(); });
  }

  function lazyImages() {
    qa("#view-shows img").forEach((img) => {
      if (!img.loading) img.loading = "lazy";
      img.decoding = "async";
    });
  }

  function enhance() {
    scheduled = false;
    if (!q("#view-shows.active")) return;
    paginateRows();
    lazyImages();
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(enhance);
  }
  function start() {
    if (!window.__hhShowsPerformanceObserver) {
      const attachObserver = () => {
        const target = document.body;
        if (!target) return false;
        if (!window.__hhShowsPerformanceObserver) {
          const observer = new MutationObserver(schedule);
          observer.observe(target, { childList: true, subtree: true });
          window.__hhShowsPerformanceObserver = observer;
        }
        return true;
      };
      if (!attachObserver()) document.addEventListener("DOMContentLoaded", attachObserver, { once: true });
    }
    window.addEventListener("hashchange", schedule);
    schedule();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();