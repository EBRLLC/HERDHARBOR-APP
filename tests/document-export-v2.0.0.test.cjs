"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Exporter = require("../document-export-v2.0.0.js");

test("pedigree export chooses stable page orientation by generation depth", () => {
  assert.equal(Exporter.pedigreePageOptions(3).orientation, "portrait");
  assert.equal(Exporter.pedigreePageOptions(4).orientation, "landscape");
  assert.equal(Exporter.pedigreePageOptions(5).orientation, "landscape");
});

test("document HTML is deterministic for identical inputs", () => {
  const options = {
    title: "Daisy Pedigree",
    documentType: "pedigree",
    page: Exporter.pedigreePageOptions(4),
    bodyHtml: '<div class="hh-pedigree-renderer">TREE</div>',
    metadata: [{ label: "Buyer", value: "Jane" }],
    notes: "Long name handling remains delegated to the shared renderer.",
    generatedLabel: "Generated 2026-10-03"
  };
  assert.equal(Exporter.buildDocumentHtml(options), Exporter.buildDocumentHtml(options));
});

test("print/PDF wrapper uses fixed page sizing and shared pedigree renderer markup", () => {
  const html = Exporter.buildDocumentHtml({
    title: "Pedigree",
    documentType: "pedigree",
    page: { pageSize: "letter", orientation: "landscape", margin: ".25in" },
    bodyHtml: '<div data-hh-pedigree-renderer><strong>Very Long Animal Name That Must Not Be Truncated</strong></div>'
  });
  assert.match(html, /@page { size: letter landscape; margin: .25in; }/);
  assert.match(html, /data-hh-pedigree-renderer/);
  assert.match(html, /Very Long Animal Name That Must Not Be Truncated/);
  assert.match(html, /Print \/ Save PDF/);
  assert.match(html, /pedigree-renderer-v2\.0\.0\.css\?v=1/);
});

test("missing optional metadata renders safely", () => {
  const html = Exporter.buildDocumentHtml({
    title: "Pedigree",
    bodyHtml: "<div>Tree</div>",
    metadata: [
      { label: "Seller", value: "" },
      { label: "Buyer", value: null }
    ]
  });
  assert.match(html, /Seller/);
  assert.match(html, /Buyer/);
  assert.match(html, /—/);
});

test("pagination rules are predictable and regression-testable", () => {
  const html = Exporter.buildDocumentHtml({
    title: "Pedigree",
    bodyHtml: "<div>Tree</div>"
  });
  assert.match(html, /data-hh-document-page="1"/);
  assert.match(html, /break-after:page/);
  assert.match(html, /page-break-after:always/);
  assert.match(html, /break-inside:avoid/);
});
