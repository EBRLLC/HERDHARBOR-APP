"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const engine = read("pedigree-engine-v2.0.0.js");
const renderer = read("pedigree-renderer-v2.0.0.js");
const standardPrint = read("standard-pedigree-print-v2.0.0.js");
const customization = read("pedigree-customization-v2.0.0.js");
const documents = read("pedigree-documents-v2.0.0.js");
const exporter = read("document-export-v2.0.0.js");
const birth = read("birth-certificate-v2.0.0.js");
const animalDocs = read("animal-documents-v2.0.0.js");
const profile = read("animal-profile-runtime-v1.8.3.js");
const app = read("herdharbor-app-runtime.js");
const index = read("index.html");
const sw = read("service-worker.js");

test("canonical engine is shared while standard printing and preview rendering stay separate", () => {
  assert.match(engine, /function buildGraph\(/);
  assert.match(profile, /HerdHarborPedigreeRenderer/);
  assert.match(renderer, /"marketplace": Object\.freeze/);
  assert.match(app, /HerdHarborStandardPedigreePrint/);
  assert.match(app, /standardPrint\.buildHtml\(/);
  assert.match(app, /engine\.buildGraph\(/);
});

test("Standard is always the built-in default pedigree template", () => {
  assert.match(customization, /const DEFAULT_TEMPLATE = "Standard"/);
  assert.match(customization, /"Standard": Object\.freeze/);
  assert.match(app, /templateConfig\?\.\("Standard"\)/);
  assert.match(app, /printControlsHtml\(config\)/);
  assert.match(app, /readPrintControls\(configHost, config\)/);
});

test("3 4 and 5 generation customization remains supported", () => {
  assert.match(customization, /GENERATION_OPTIONS = Object\.freeze\(\[3, 4, 5\]\)/);
  assert.match(standardPrint, /generations === 3/);
  assert.match(standardPrint, /generations === 5/);
  assert.match(standardPrint, /\(generation \* 2\) \+ 1/);
});

test("original four-generation standard geometry is protected", () => {
  assert.match(standardPrint, /minmax\(168px,1\.18fr\) 34px minmax\(164px,1\.1fr\) 34px minmax\(158px,1fr\) 34px minmax\(152px,\.96fr\)/);
  assert.match(standardPrint, /const sheetHeight = mobilePrint \? \(generations === 5 \? "9\.45in" : "9\.25in"\) : pageHeight\(generations\)/);
  assert.match(standardPrint, /height: \$\{sheetHeight\}/);
  assert.match(standardPrint, /return generations === 5 \? "8\.02in" : "8\.06in"/);
  assert.match(standardPrint, /@media screen and \(max-width: 980px\) \{ body \{ min-width: 980px; \} \}/);
});

test("saved branding and explicit contact privacy remain intact", () => {
  assert.match(documents, /saveTemplate/);
  assert.match(documents, /rabbitryName/);
  assert.match(documents, /website/);
  assert.match(documents, /social/);
  assert.match(documents, /includeEmail: false/);
  assert.match(documents, /includePhone: false/);
  assert.match(documents, /includeAddress: false/);
  assert.doesNotMatch(app, /field\("Seller contact", "sellerContact", state\.profile\?\.email/);
});

test("Birth Certificate continues to use shared document export infrastructure", () => {
  assert.match(birth, /HerdHarborDocumentExport|buildDocumentHtml/);
  assert.match(exporter, /@page \{ size:/);
  assert.match(birth, /newOwner/);
  assert.match(birth, /goHomeDate/);
  assert.match(birth, /breederNote/);
  assert.match(birth, /signature/);
  assert.doesNotMatch(birth, /state\.profile\?\.(email|phone|address)/);
});

test("animal document center exposes Pedigree and Birth Certificate", () => {
  assert.match(animalDocs, /id: "pedigree"/);
  assert.match(animalDocs, /id: "birthCertificate"/);
  assert.match(profile, /HerdHarborAnimalDocuments\?\.centerHtml/);
  assert.match(profile, /HerdHarborAnimalDocuments\?\.bindCenter/);
});

test("optional document assets remain outside the bounded required shell", () => {
  const block = sw.match(/const REQUIRED_SHELL = \[([\s\S]*?)\];/);
  assert.ok(block);
  const required = [...block[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.ok(required.length <= 45, `required shell grew to ${required.length}`);
  assert.ok(!required.some((entry) => /document-export|birth-certificate|animal-documents|standard-pedigree-print/.test(entry)));
  for (const asset of [
    "document-export-v2.0.0.js",
    "birth-certificate-v2.0.0.js",
    "animal-documents-v2.0.0.js",
    "standard-pedigree-print-v2.0.0.js"
  ]) assert.match(sw, new RegExp(asset.replace(/[.]/g, "\\.")));
});

test("shell loads standard print before the application runtime", () => {
  const standardIndex = index.indexOf("standard-pedigree-print-v2.0.0.js");
  const runtimeIndex = index.indexOf("herdharbor-app-runtime.js");
  assert.ok(standardIndex >= 0 && runtimeIndex > standardIndex);
});
