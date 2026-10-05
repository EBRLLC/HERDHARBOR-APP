"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Package = require("../new-owner-package-v2.0.0.js");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const animal = { id: "a", name: "Daisy", species: "Rabbit", breed: "Holland Lop", sex: "Female", dob: "2026-01-01", color: "Blue", sireId: "s", damId: "d", notes: "SECRET SELLER NOTE" };
const animals = [
  animal,
  { id: "s", name: "Sire", species: "Rabbit" },
  { id: "d", name: "Dam", species: "Rabbit" }
];

test("E4 New Owner Package composes canonical document engines", () => {
  const html = Package.buildPackageHtml({
    animal,
    animals,
    sire: animals[1],
    dam: animals[2],
    branding: { rabbitryName: "Example Rabbitry" },
    transfer: { buyerName: "Buyer", sellerName: "Seller", transferNumber: "TR-1", transferDate: "2026-10-05" },
    generations: 3,
    formatDate: (value) => value
  });
  assert.match(html, /New Owner Package/);
  assert.match(html, /data-hh-birth-certificate/);
  assert.match(html, /data-hh-pedigree-renderer/);
  assert.match(html, /data-hh-new-owner-summary/);
  assert.match(html, /data-hh-new-owner-transfer/);
  assert.doesNotMatch(html, /SECRET SELLER NOTE/);
});

test("E4 package can disable sections without duplicating renderers", () => {
  const html = Package.buildPackageHtml({
    animal,
    animals,
    sections: { birthCertificate: false, pedigree: false },
    transfer: { buyerName: "Buyer" }
  });
  assert.doesNotMatch(html, /data-hh-birth-certificate/);
  assert.doesNotMatch(html, /data-hh-pedigree-renderer/);
  assert.match(html, /data-hh-new-owner-summary/);
});

test("E4 implementation imports and calls shared engines instead of embedding PDF or pedigree engines", () => {
  const source = read("new-owner-package-v2.0.0.js");
  assert.match(source, /require\("\.\/pedigree-engine-v2\.0\.0\.js"\)/);
  assert.match(source, /require\("\.\/pedigree-renderer-v2\.0\.0\.js"\)/);
  assert.match(source, /require\("\.\/birth-certificate-v2\.0\.0\.js"\)/);
  assert.match(source, /require\("\.\/document-export-v2\.0\.0\.js"\)/);
  assert.match(source, /Engine\.buildGraph/);
  assert.match(source, /Renderer\.render/);
  assert.match(source, /BirthCertificate\.certificateBodyHtml/);
  assert.match(source, /Exporter\.buildDocumentHtml/);
  assert.doesNotMatch(source, /jsPDF|pdfmake|PDFDocument|window\.print/);
});

test("E4 package UI explicitly excludes private account and Marketplace data", () => {
  const runtime = read("herdharbor-app-runtime.js");
  assert.match(runtime, /Private notes, health notes, customer records, billing data, and Marketplace messages are excluded/);
  assert.match(runtime, /openNewOwnerPackageForm/);
  assert.match(read("index.html"), /new-owner-package-v2\.0\.0\.js/);
});
