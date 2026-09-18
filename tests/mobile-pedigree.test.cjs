"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8");
const appRuntime = fs.readFileSync(path.resolve(__dirname, "..", "herdharbor-app-runtime.js"), "utf8");
const shellCss = fs.readFileSync(path.resolve(__dirname, "..", "herdharbor-index-shell.css"), "utf8");

assert.match(appRuntime, /data-view-pedigree="\$\{p\.id\}"/);
assert.match(appRuntime, /event\.target\.closest\("\[data-view-pedigree\]"\)/);
assert.match(appRuntime, /openPedigreeRecord\(viewButton\.dataset\.viewPedigree\)/);
assert.match(appRuntime, /function pedigreeRecordPreviewHtml\(subject, record = null\)/);
assert.match(appRuntime, /const ids = record\?\.ancestorIds \|\| \{\}/);
assert.match(appRuntime, /Pedigree chart/);
assert.match(appRuntime, /type="button" class="button button-ghost button-small" data-view-pedigree/);
assert.match(shellCss, /\.pedigree-document-card \.list-item-actions \.button \{[\s\S]*?min-height: 44px/);
assert.match(shellCss, /max-height: calc\(100dvh - env\(safe-area-inset-top, 0px\)\)/);
assert.match(shellCss, /padding: 18px 18px calc\(18px \+ env\(safe-area-inset-bottom, 0px\)\)/);
assert.match(appRuntime, /document\.body\.classList\.add\("modal-open"\)/);
assert.match(appRuntime, /document\.body\.classList\.remove\("modal-open"\)/);
assert.doesNotMatch(appRuntime, /<object data="\$\{record\.sourceDataUrl\}" type="application\/pdf"/);
assert.match(appRuntime, /Open or download PDF/);
assert.match(appRuntime, /loading="lazy" decoding="async"/);
assert.match(shellCss, /touch-action: manipulation/);
assert.match(shellCss, /content-visibility: auto/);
assert.match(shellCss, /prefers-reduced-motion: reduce/);
assert.match(shellCss, /\.modal-backdrop \{[\s\S]*?backdrop-filter: none/);
assert.match(appRuntime, /function openMobilePrintPreview\(printableHtml, animalName\)/);
assert.match(appRuntime, /id="pedigree-print-preview"/);
assert.match(appRuntime, /frame\.contentWindow/);
assert.match(appRuntime, /printWindow\.print\(\)/);
assert.match(appRuntime, /window\.matchMedia\("\(display-mode: standalone\)"\)/);
assert.match(appRuntime, /const ids = savedPedigree\?\.ancestorIds \|\| \{\}/);
assert.match(appRuntime, /byId\(ids\.sire \|\| subject\.sireId\)/);

console.log("mobile pedigree interaction and viewport tests passed");
