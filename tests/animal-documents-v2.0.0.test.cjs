"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Docs = require("../animal-documents-v2.0.0.js");

test("document center exposes the canonical printable document types", () => {
  assert.deepEqual(Docs.documentTypes().map((item) => item.id), ["pedigree", "birthCertificate", "newOwnerPackage"]);
  assert.ok(Docs.documentTypes().every((item) => item.available === true));
});

test("future document types are extension metadata only and are not rendered", () => {
  assert.deepEqual(Docs.futureDocumentTypes().map((item) => item.id), [
    "saleTransferRecord",
    "animalInformationSheet",
    "healthSummary",
    "breedingRecord",
    "litterRecord"
  ]);
  const html = Docs.centerHtml({ animalName: "Daisy", pedigreeCount: 1 });
  assert.match(html, /Pedigree/);
  assert.match(html, /Birth Certificate/);
  assert.match(html, /New Owner Package/);
  assert.doesNotMatch(html, /Sale \/ Transfer Record|Health Summary|Breeding Record|Litter Record/);
});

test("document center escapes animal names and shows pedigree count", () => {
  const html = Docs.centerHtml({ animalName: '<Daisy & "Co">', pedigreeCount: 2 });
  assert.match(html, /&lt;Daisy &amp; &quot;Co&quot;&gt;/);
  assert.match(html, /2 saved pedigree imports/);
});

test("document center binds pedigree, birth certificate and New Owner Package handlers", () => {
  const listeners = {};
  const buttons = [
    { dataset: { documentAction: "pedigree" }, addEventListener: (_event, fn) => listeners.pedigree = fn },
    { dataset: { documentAction: "birth-certificate" }, addEventListener: (_event, fn) => listeners.birth = fn },
    { dataset: { documentAction: "new-owner-package" }, addEventListener: (_event, fn) => listeners.package = fn }
  ];
  let pedigree = 0;
  let birth = 0;
  let packageCount = 0;
  assert.equal(Docs.bindCenter({ querySelectorAll: () => buttons }, {
    openPedigree: () => pedigree++,
    openBirthCertificate: () => birth++,
    openNewOwnerPackage: () => packageCount++
  }), true);
  listeners.pedigree();
  listeners.birth();
  listeners.package();
  assert.equal(pedigree, 1);
  assert.equal(birth, 1);
  assert.equal(packageCount, 1);
});
