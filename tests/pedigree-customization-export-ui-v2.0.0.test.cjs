"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.resolve(__dirname, "..", "herdharbor-app-runtime.js"), "utf8");

test("pedigree print flow exposes customization directly in the export modal", () => {
  assert.match(source, /openModal\("Customize pedigree"/);
  assert.match(source, /id="pedigree-export-customization"/);
  assert.match(source, /customization\.controlsHtml\(config\)/);
  assert.match(source, /name === "template"/);
  assert.match(source, /customization\.templateConfig/);
  assert.match(source, /customization\.readControls\(configHost, config\)/);
});

test("pedigree export modal includes a live preview before printing", () => {
  assert.match(source, /id="pedigree-export-preview"/);
  assert.match(source, /buildPedigreePrintableHtml\(animalId, saleValues\(\), config\)/);
  assert.match(source, /exporter\?\.loadFrame\?\.\(preview, html\)/);
  assert.match(source, /Print \/ Save PDF/);
});

test("per-export customization overrides defaults without replacing saved defaults", () => {
  assert.match(source, /function pedigreeExportContext\(animalId, overrideConfig = null\)/);
  assert.match(source, /const config = overrideConfig && customization\?\.normalize/);
  assert.match(source, /printSalePedigree\(animalId, saleValues\(\), config\)/);
  assert.doesNotMatch(source, /savePreferences\(localStorage, config\)[\s\S]{0,500}pedigree-export-customization/);
});

test("sale contact remains blank by default", () => {
  assert.match(source, /field\("Seller contact", "sellerContact", ""\)/);
  assert.doesNotMatch(source, /field\("Seller contact", "sellerContact", state\.profile\?\.email/);
});
