"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Docs = require("../animal-documents-v2.0.0.js");

test("document center exposes only the two Stack A document types", () => {
  assert.deepEqual(Docs.documentTypes().map((item) => item.id), ["pedigree", "birthCertificate"]);
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
  assert.doesNotMatch(html, /Sale \/ Transfer Record|Health Summary|Breeding Record|Litter Record/);
});

test("document center escapes animal names and shows pedigree count", () => {
  const html = Docs.centerHtml({ animalName: '<Daisy & "Co">', pedigreeCount: 2 });
  assert.match(html, /&lt;Daisy &amp; &quot;Co&quot;&gt;/);
  assert.match(html, /2 saved pedigree imports/);
});

test("document center binds pedigree and birth certificate handlers", () => {
  const listeners = {};
  const buttons = [
    { dataset: { documentAction: "pedigree" }, addEventListener: (_event, fn) => listeners.pedigree = fn },
    { dataset: { documentAction: "birth-certificate" }, addEventListener: (_event, fn) => listeners.birth = fn }
  ];
  let pedigree = 0;
  let birth = 0;
  assert.equal(Docs.bindCenter({ querySelectorAll: () => buttons }, {
    openPedigree: () => pedigree++,
    openBirthCertificate: () => birth++
  }), true);
  listeners.pedigree();
  listeners.birth();
  assert.equal(pedigree, 1);
  assert.equal(birth, 1);
});
