(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborDocumentExport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const VERSION = "2.0.0-a5";
  const PAGE_SIZES = Object.freeze({
    letter: Object.freeze({ width: "8.5in", height: "11in" }),
    a4: Object.freeze({ width: "210mm", height: "297mm" })
  });
  const ORIENTATIONS = Object.freeze(["portrait", "landscape"]);

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function escapeHtml(value) {
    return clean(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizePageOptions(options = {}) {
    const pageSize = PAGE_SIZES[clean(options.pageSize)] ? clean(options.pageSize) : "letter";
    const orientation = ORIENTATIONS.includes(clean(options.orientation)) ? clean(options.orientation) : "portrait";
    const margin = clean(options.margin) || ".35in";
    return { pageSize, orientation, margin };
  }

  function pedigreePageOptions(generations) {
    const depth = Number(generations || 4);
    return normalizePageOptions({
      pageSize: "letter",
      orientation: depth >= 4 ? "landscape" : "portrait",
      margin: depth >= 5 ? ".22in" : ".3in"
    });
  }

  function metadataRows(rows = []) {
    return (Array.isArray(rows) ? rows : [])
      .filter((row) => row && clean(row.label))
      .map((row) => {
        const value = clean(row.value) || "—";
        return `<div class="hh-doc-meta-row"><small>${escapeHtml(row.label)}</small><strong>${escapeHtml(value)}</strong></div>`;
      })
      .join("");
  }

  function buildDocumentHtml(options = {}) {
    const page = normalizePageOptions(options.page || {});
    const title = clean(options.title) || "HerdHarbor Document";
    const documentType = clean(options.documentType) || "document";
    const bodyHtml = String(options.bodyHtml || "");
    const metadata = metadataRows(options.metadata);
    const notes = clean(options.notes);
    const generatedLabel = clean(options.generatedLabel);
    const footerLeft = clean(options.footerLeft) || "Created with HerdHarbor";
    const footerRight = clean(options.footerRight) || "HerdHarbor";
    const pageSize = PAGE_SIZES[page.pageSize];
    const pageWidth = page.orientation === "landscape" ? pageSize.height : pageSize.width;
    const pageHeight = page.orientation === "landscape" ? pageSize.width : pageSize.height;

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
@page { size: ${page.pageSize} ${page.orientation}; margin: ${escapeHtml(page.margin)}; }
* { box-sizing: border-box; }
html, body { margin:0; padding:0; color:#27343d; background:#fff; font-family:"Segoe UI",Arial,Helvetica,sans-serif; }
body { min-width:0; }
.hh-doc-page { width:100%; min-height:calc(${pageHeight} - (${escapeHtml(page.margin)} * 2)); max-width:${pageWidth}; margin:0 auto; display:flex; flex-direction:column; }
.hh-doc-header { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; padding-bottom:8px; border-bottom:1.5px solid #68737b; }
.hh-doc-header h1 { margin:0; font-size:18px; line-height:1.15; }
.hh-doc-header small { color:#707980; }
.hh-doc-body { flex:1 1 auto; min-height:0; padding-top:10px; }
.hh-doc-meta { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:6px; margin-top:10px; }
.hh-doc-meta-row { min-width:0; padding:6px 7px; background:#fafafa; border:1px solid #d9dee2; border-radius:5px; }
.hh-doc-meta-row small,.hh-doc-meta-row strong { display:block; }
.hh-doc-meta-row small { color:#717b82; font-size:7px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; }
.hh-doc-meta-row strong { margin-top:2px; font-size:8px; overflow-wrap:anywhere; }
.hh-doc-notes { margin-top:8px; padding:7px; border:1px solid #d9dee2; border-radius:5px; font-size:8px; overflow-wrap:anywhere; }
.hh-doc-footer { display:flex; justify-content:space-between; gap:16px; margin-top:8px; padding-top:6px; border-top:1px solid #d9dee2; color:#7b848a; font-size:6.5px; }
.hh-doc-actions { position:fixed; right:16px; bottom:16px; display:flex; gap:8px; z-index:20; }
.hh-doc-actions button { min-height:40px; padding:8px 12px; color:#fff; background:#2e7d7b; border:0; border-radius:8px; font-weight:800; cursor:pointer; }
.hh-doc-page .hh-pedigree-renderer { margin-top:0; overflow:visible; }
.hh-doc-page .hh-pedigree-columns { min-width:0; }
.hh-doc-page .hh-pedigree-card { break-inside:avoid; page-break-inside:avoid; }
.hh-doc-page .hh-pedigree-card-details[hidden] { display:block !important; }
.hh-doc-page .hh-pedigree-toggle { display:none !important; }
@media print {
  html,body { width:100%; height:auto; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .hh-doc-page { break-after:page; page-break-after:always; }
  .hh-doc-page:last-child { break-after:auto; page-break-after:auto; }
  .hh-doc-body,.hh-pedigree-renderer,.hh-pedigree-columns { break-inside:avoid; page-break-inside:avoid; }
  .hh-doc-actions { display:none !important; }
}
</style>
<link rel="stylesheet" href="pedigree-renderer-v2.0.0.css?v=1">
</head>
<body data-hh-document-type="${escapeHtml(documentType)}">
<section class="hh-doc-page" data-hh-document-page="1">
  <header class="hh-doc-header">
    <div><h1>${escapeHtml(title)}</h1>${generatedLabel ? `<small>${escapeHtml(generatedLabel)}</small>` : ""}</div>
    <small>${escapeHtml(documentType)}</small>
  </header>
  <main class="hh-doc-body">${bodyHtml}</main>
  ${metadata ? `<section class="hh-doc-meta">${metadata}</section>` : ""}
  ${notes ? `<section class="hh-doc-notes">${escapeHtml(notes)}</section>` : ""}
  <footer class="hh-doc-footer"><span>${escapeHtml(footerLeft)}</span><span>${escapeHtml(footerRight)}</span></footer>
</section>
<div class="hh-doc-actions"><button type="button" onclick="window.print()">Print / Save PDF</button></div>
</body>
</html>`;
  }

  function openPrintWindow(html, options = {}) {
    const popup = root?.open?.("", "_blank");
    if (!popup) return null;
    popup.document.open();
    popup.document.write(String(html || ""));
    popup.document.close();
    if (options.autoFocus !== false) root.setTimeout?.(() => popup.focus?.(), 120);
    return popup;
  }

  function loadFrame(frame, html) {
    if (!frame) return false;
    frame.srcdoc = String(html || "");
    return true;
  }

  function printFrame(frame) {
    const target = frame?.contentWindow;
    if (!target) return false;
    target.focus?.();
    target.print?.();
    return true;
  }

  return Object.freeze({
    VERSION,
    PAGE_SIZES,
    ORIENTATIONS,
    normalizePageOptions,
    pedigreePageOptions,
    buildDocumentHtml,
    openPrintWindow,
    loadFrame,
    printFrame
  });
});
