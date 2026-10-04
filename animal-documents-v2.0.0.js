(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborAnimalDocuments = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "2.0.0-a7";

  const DOCUMENT_TYPES = Object.freeze([
    Object.freeze({
      id: "pedigree",
      label: "Pedigree",
      description: "Preview, customize, print, or save this animal's pedigree as PDF.",
      actionLabel: "Open pedigree",
      action: "pedigree",
      available: true
    }),
    Object.freeze({
      id: "birthCertificate",
      label: "Birth Certificate",
      description: "Create a breeder birth certificate with selected fields and branding.",
      actionLabel: "Create certificate",
      action: "birth-certificate",
      available: true
    })
  ]);

  const FUTURE_DOCUMENT_TYPES = Object.freeze([
    Object.freeze({ id: "saleTransferRecord", label: "Sale / Transfer Record" }),
    Object.freeze({ id: "animalInformationSheet", label: "Animal Information Sheet" }),
    Object.freeze({ id: "healthSummary", label: "Health Summary" }),
    Object.freeze({ id: "breedingRecord", label: "Breeding Record" }),
    Object.freeze({ id: "litterRecord", label: "Litter Record" })
  ]);

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

  function documentTypes() {
    return DOCUMENT_TYPES.map((item) => ({ ...item }));
  }

  function futureDocumentTypes() {
    return FUTURE_DOCUMENT_TYPES.map((item) => ({ ...item }));
  }

  function centerHtml(options = {}) {
    const animalName = clean(options.animalName) || "this animal";
    const pedigreeCount = Number(options.pedigreeCount || 0);
    return `<section class="hh-animal-documents" data-hh-animal-documents>
      <div class="hh-animal-documents-heading">
        <div>
          <h3>Documents</h3>
          <p>Create breeder documents for ${escapeHtml(animalName)} from one place.</p>
        </div>
        <small>${pedigreeCount} saved pedigree import${pedigreeCount === 1 ? "" : "s"}</small>
      </div>
      <div class="hh-animal-document-grid">
        ${DOCUMENT_TYPES.map((item) => `<article class="hh-animal-document-card" data-document-type="${escapeHtml(item.id)}">
          <div>
            <strong>${escapeHtml(item.label)}</strong>
            <p>${escapeHtml(item.description)}</p>
          </div>
          <button type="button" class="button button-ghost button-small" data-document-action="${escapeHtml(item.action)}">${escapeHtml(item.actionLabel)}</button>
        </article>`).join("")}
      </div>
    </section>`;
  }

  function bindCenter(rootElement, handlers = {}) {
    if (!rootElement?.querySelectorAll) return false;
    rootElement.querySelectorAll("[data-document-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.documentAction;
        if (action === "pedigree") handlers.openPedigree?.();
        if (action === "birth-certificate") handlers.openBirthCertificate?.();
      });
    });
    return true;
  }

  return Object.freeze({
    VERSION,
    DOCUMENT_TYPES,
    FUTURE_DOCUMENT_TYPES,
    documentTypes,
    futureDocumentTypes,
    centerHtml,
    bindCenter
  });
});
