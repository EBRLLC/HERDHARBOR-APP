"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const engine = read("pedigree-engine-v2.0.0.js");
const renderer = read("pedigree-renderer-v2.0.0.js");
const customization = read("pedigree-customization-v2.0.0.js");
const documents = read("pedigree-documents-v2.0.0.js");
const exporter = read("document-export-v2.0.0.js");
const birth = read("birth-certificate-v2.0.0.js");
const animalDocs = read("animal-documents-v2.0.0.js");
const profile = read("animal-profile-runtime-v1.8.3.js");
const app = read("herdharbor-app-runtime.js");
const index = read("index.html");
const sw = read("service-worker.js");

test("Stack A has one canonical pedigree engine and one reusable renderer", () => {
  assert.match(engine, /function buildGraph\(/);
  assert.match(profile, /HerdHarborPedigreeEngine/);
  assert.match(profile, /HerdHarborPedigreeRenderer/);
  assert.match(app, /HerdHarborPedigreeEngine/);
  assert.match(app, /HerdHarborPedigreeRenderer/);
  assert.match(app, /engine\.buildGraph\(/);
  assert.match(app, /renderer\.render\(/);
  assert.doesNotMatch(app, /function animalCard\(animal, relation/);
});

test("3 4 and 5 generation customization stays supported through export", () => {
  assert.match(customization, /generations/);
  assert.match(customization, /3/);
  assert.match(customization, /4/);
  assert.match(customization, /5/);
  assert.match(exporter, /depth >= 4 \? "landscape" : "portrait"/);
  assert.match(exporter, /depth >= 5 \? "\.22in" : "\.3in"/);
});

test("saved templates branding and explicit contact privacy remain intact", () => {
  assert.match(documents, /saveTemplate/);
  assert.match(documents, /renameTemplate/);
  assert.match(documents, /duplicateTemplate/);
  assert.match(documents, /deleteTemplate/);
  assert.match(documents, /rabbitryName/);
  assert.match(documents, /website/);
  assert.match(documents, /social/);
  assert.match(documents, /includeEmail: false/);
  assert.match(documents, /includePhone: false/);
  assert.match(documents, /includeAddress: false/);
  assert.doesNotMatch(app, /field\("Seller contact", "sellerContact", state\.profile\?\.email/);
});

test("PDF and print use the shared renderer foundation with stable layout rules", () => {
  assert.match(app, /exporter\.buildDocumentHtml\(/);
  assert.match(exporter, /@page \{ size:/);
  assert.match(exporter, /page-break-after:always/);
  assert.match(exporter, /break-inside:avoid/);
  assert.match(exporter, /Print \/ Save PDF/);
  assert.match(exporter, /pedigree-renderer-v2\.0\.0\.css\?v=1/);
});

test("Birth Certificate uses shared export, supports missing optional data, and does not auto-inject private contact", () => {
  assert.match(birth, /HerdHarborDocumentExport|buildDocumentHtml/);
  assert.match(birth, /newOwner/);
  assert.match(birth, /goHomeDate/);
  assert.match(birth, /breederNote/);
  assert.match(birth, /signature/);
  assert.match(birth, /publicReference/);
  assert.match(birth, /Email, phone, and exact address are not added here/);
  assert.doesNotMatch(birth, /state\.profile\?\.(email|phone|address)/);
});

test("animal document center exposes only Pedigree and Birth Certificate now", () => {
  assert.match(animalDocs, /id: "pedigree"/);
  assert.match(animalDocs, /id: "birthCertificate"/);
  assert.match(profile, /HerdHarborAnimalDocuments\?\.centerHtml/);
  assert.match(profile, /HerdHarborAnimalDocuments\?\.bindCenter/);
  assert.doesNotMatch(profile, /id="detail-print-pedigree"/);
  assert.doesNotMatch(profile, /id="detail-birth-certificate"/);
});

test("future document types are extension metadata only", () => {
  for (const id of [
    "saleTransferRecord",
    "animalInformationSheet",
    "healthSummary",
    "breedingRecord",
    "litterRecord"
  ]) assert.match(animalDocs, new RegExp(`id: "${id}"`));
  assert.match(animalDocs, /FUTURE_DOCUMENT_TYPES/);
});

test("Stack A assets preserve bounded required shell and use runtime cache for optional document features", () => {
  const block = sw.match(/const REQUIRED_SHELL = \[([\s\S]*?)\];/);
  assert.ok(block);
  const required = [...block[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.ok(required.length <= 45, `required shell grew to ${required.length}`);
  assert.ok(!required.some((entry) => /document-export|birth-certificate|animal-documents/.test(entry)));
  for (const asset of [
    "document-export-v2.0.0.js",
    "birth-certificate-v2.0.0.js",
    "animal-documents-v2.0.0.js"
  ]) assert.match(sw, new RegExp(asset.replace(/[.]/g, "\\.")));
});

test("A4-A7 document modules do not introduce sync authority or Marketplace behavior", () => {
  // A2 intentionally exposes a future marketplace renderer mode; later document phases must not
  // add Marketplace behavior or sync authority of their own.
  for (const source of [documents, exporter, birth, animalDocs]) {
    assert.doesNotMatch(source, /HerdHarborCloud|cloud-sync|normalized authority|Marketplace|marketplace/i);
  }
});

test("shell loads the complete document stack in dependency order", () => {
  const names = [
    "pedigree-engine-v2.0.0.js",
    "pedigree-customization-v2.0.0.js",
    "pedigree-documents-v2.0.0.js",
    "pedigree-renderer-v2.0.0.js",
    "document-export-v2.0.0.js",
    "birth-certificate-v2.0.0.js",
    "animal-documents-v2.0.0.js",
    "animal-profile-runtime-v1.8.3.js"
  ];
  let prior = -1;
  for (const name of names) {
    const current = index.indexOf(name);
    assert.ok(current > prior, `${name} must load after its dependency`);
    prior = current;
  }
});
