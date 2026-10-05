(function (root, factory) {
  const api = factory(
    root,
    typeof module === "object" && module.exports ? require("./pedigree-engine-v2.0.0.js") : root?.HerdHarborPedigreeEngine,
    typeof module === "object" && module.exports ? require("./pedigree-renderer-v2.0.0.js") : root?.HerdHarborPedigreeRenderer,
    typeof module === "object" && module.exports ? require("./birth-certificate-v2.0.0.js") : root?.HerdHarborBirthCertificate,
    typeof module === "object" && module.exports ? require("./document-export-v2.0.0.js") : root?.HerdHarborDocumentExport
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborNewOwnerPackage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root, Engine, Renderer, BirthCertificate, Exporter) {
  "use strict";

  const VERSION = "2.0.0-e4";

  function clean(value, max = 320) {
    return String(value == null ? "" : value).trim().replace(/\s+/g, " ").slice(0, max);
  }

  function esc(value) {
    return clean(value, 2000)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeSections(value = {}) {
    return {
      summary: value.summary !== false,
      birthCertificate: value.birthCertificate !== false,
      pedigree: value.pedigree !== false,
      transferReceipt: value.transferReceipt !== false
    };
  }

  function identity(animal = {}) {
    return clean(animal.earTagNumber || animal.tag || animal.tattoo || animal.registrationNumber, 160);
  }

  function informationSummaryHtml(animal = {}) {
    const rows = [
      ["Animal", clean(animal.name, 160) || "Unnamed animal"],
      ["ID / tattoo", identity(animal) || "—"],
      ["Species", clean(animal.species, 100) || "—"],
      ["Breed", clean(animal.breed, 160) || "—"],
      ["Sex", clean(animal.sex, 40) || "—"],
      ["DOB", clean(animal.dob, 32) || "—"],
      ["Variety / color", clean(animal.variety || animal.color, 160) || "—"],
      ["Registration", clean(animal.registrationNumber, 160) || "—"]
    ];
    return `<section data-hh-new-owner-summary><h2>Animal information</h2><div class="hh-doc-meta">${rows.map(([label,value]) => `<div class="hh-doc-meta-row"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`).join("")}</div></section>`;
  }

  function transferReceiptHtml(transfer = {}) {
    const rows = [
      ["Transfer number", clean(transfer.transferNumber, 160) || "—"],
      ["Transfer date", clean(transfer.transferDate, 40) || "—"],
      ["Seller", clean(transfer.sellerName, 160) || "—"],
      ["Buyer", clean(transfer.buyerName, 160) || "—"]
    ];
    return `<section data-hh-new-owner-transfer><h2>Transfer handoff</h2><div class="hh-doc-meta">${rows.map(([label,value]) => `<div class="hh-doc-meta-row"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`).join("")}</div></section>`;
  }

  function buildPackageHtml(input = {}) {
    if (!Engine?.buildGraph || !Renderer?.render || !BirthCertificate?.certificateBodyHtml || !Exporter?.buildDocumentHtml) {
      throw new Error("The shared HerdHarbor document engines are required.");
    }
    const animal = input.animal || {};
    const animals = Array.isArray(input.animals) ? input.animals : [];
    const subjectId = clean(animal.id, 200);
    if (!subjectId) throw new Error("A source animal is required.");

    const sections = normalizeSections(input.sections);
    const branding = input.branding && typeof input.branding === "object" ? input.branding : {};
    const formatDate = typeof input.formatDate === "function" ? input.formatDate : (value) => clean(value);
    const body = [];

    if (sections.summary) body.push(informationSummaryHtml(animal));

    if (sections.transferReceipt) {
      body.push(transferReceiptHtml(input.transfer || {}));
    }

    if (sections.birthCertificate) {
      const birthOptions = BirthCertificate.normalizeOptions({
        ...(input.birthOptions || {}),
        newOwner: clean(input.transfer?.buyerName, 160) || clean(input.birthOptions?.newOwner, 160),
        goHomeDate: clean(input.transfer?.transferDate, 40) || clean(input.birthOptions?.goHomeDate, 40),
        publicReference: input.publicReference?.enabled === true
          ? {
              enabled: true,
              url: clean(input.publicReference.url, 500),
              label: clean(input.publicReference.label, 120) || "Public transfer reference"
            }
          : { enabled: false, url: "", label: "" }
      });
      body.push(BirthCertificate.certificateBodyHtml({
        animal,
        sire: input.sire || null,
        dam: input.dam || null,
        branding,
        options: birthOptions,
        formatDate
      }));
    }

    if (sections.pedigree) {
      const generations = Math.max(2, Math.min(5, Number(input.generations || 4)));
      const graph = Engine.buildGraph({
        animals,
        subject: animal,
        subjectId,
        ancestorIds: input.ancestorIds || {},
        generations
      });
      body.push(`<section data-hh-new-owner-pedigree><h2>Pedigree</h2>${Renderer.render({
        graph,
        mode: "transfer-preview",
        interactive: false,
        branding,
        formatDate
      })}</section>`);
    }

    const title = `${clean(animal.name, 160) || "Animal"} New Owner Package`;
    return Exporter.buildDocumentHtml({
      title,
      documentType: "New Owner Package",
      page: { pageSize: "letter", orientation: "portrait", margin: ".35in" },
      bodyHtml: `<div data-hh-new-owner-package>${body.join('<hr style="margin:18px 0;border:0;border-top:1px solid #d9dee2">')}</div>`,
      stylesheets: ["birth-certificate-v2.0.0.css?v=1"],
      generatedLabel: clean(input.generatedLabel, 160),
      footerLeft: "Created with HerdHarbor",
      footerRight: clean(branding.rabbitryName, 160) || "HerdHarbor"
    });
  }

  return Object.freeze({
    VERSION,
    normalizeSections,
    informationSummaryHtml,
    transferReceiptHtml,
    buildPackageHtml
  });
});
