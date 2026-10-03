"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8");
const appRuntime = fs.readFileSync(path.resolve(__dirname, "..", "herdharbor-app-runtime.js"), "utf8");
const animalProfileRuntime = fs.readFileSync(path.resolve(__dirname, "..", "animal-profile-runtime-v1.8.3.js"), "utf8");
const shellCss = fs.readFileSync(path.resolve(__dirname, "..", "herdharbor-index-shell.css"), "utf8");

assert.match(appRuntime, /data-view-pedigree="\$\{p\.id\}"/);
assert.match(appRuntime, /event\.target\.closest\("\[data-view-pedigree\]"/);
assert.match(appRuntime, /openPedigreeRecord\(viewButton\.dataset\.viewPedigree\)/);
assert.match(appRuntime, /function pedigreeRecordPreviewHtml\(subject, record = null\)/);
assert.match(animalProfileRuntime, /function pedigreeRecordPreviewHtml\(subject, record = null\)/);
assert.match(animalProfileRuntime, /root\.HerdHarborPedigreeEngine/);
assert.match(animalProfileRuntime, /root\.HerdHarborPedigreeRenderer/);
assert.match(animalProfileRuntime, /ancestorIds: record\?\.ancestorIds \|\| \{\}/);
assert.match(animalProfileRuntime, /mode: "private-herd"/);
assert.match(appRuntime, /Pedigree chart/);
assert.match(shellCss, /touch-action: manipulation/);
assert.match(shellCss, /content-visibility: auto/);
assert.match(appRuntime, /function openMobilePrintPreview\(printableHtml, animalName\)/);
assert.match(appRuntime, /id="pedigree-print-preview"/);
assert.match(appRuntime, /HerdHarborDocumentExport/);
assert.match(appRuntime, /exporter\?\.loadFrame\?\./);
assert.match(appRuntime, /exporter\?\.printFrame\?\./);
assert.match(appRuntime, /window\.matchMedia\("\(display-mode: standalone\)"\)/);
assert.match(appRuntime, /ancestorIds: savedPedigree\?\.ancestorIds \|\| \{\}/);
assert.match(appRuntime, /HerdHarborStandardPedigreePrint/);
assert.match(appRuntime, /standardPrint\.buildHtml\(/);
assert.match(html, /standard-pedigree-print-v2\.0\.0\.js\?v=1/);

console.log("mobile pedigree interaction and standard print path tests passed");
