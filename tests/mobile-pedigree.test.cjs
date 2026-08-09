"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8");

assert.match(html, /data-view-pedigree="\$\{p\.id\}"/);
assert.match(html, /event\.target\.closest\("\[data-view-pedigree\]"\)/);
assert.match(html, /openPedigreeRecord\(viewButton\.dataset\.viewPedigree\)/);
assert.match(html, /type="button" class="button button-ghost button-small" data-view-pedigree/);
assert.match(html, /\.pedigree-document-card \.list-item-actions \.button \{[\s\S]*?min-height: 44px/);
assert.match(html, /max-height: calc\(100dvh - env\(safe-area-inset-top, 0px\)\)/);
assert.match(html, /padding: 18px 18px calc\(18px \+ env\(safe-area-inset-bottom, 0px\)\)/);
assert.match(html, /document\.body\.classList\.add\("modal-open"\)/);
assert.match(html, /document\.body\.classList\.remove\("modal-open"\)/);
assert.doesNotMatch(html, /<object data="\$\{record\.sourceDataUrl\}" type="application\/pdf"/);
assert.match(html, /Open or download PDF/);
assert.match(html, /loading="lazy" decoding="async"/);
assert.match(html, /touch-action: manipulation/);
assert.match(html, /content-visibility: auto/);
assert.match(html, /prefers-reduced-motion: reduce/);
assert.match(html, /\.modal-backdrop \{[\s\S]*?backdrop-filter: none/);

console.log("mobile pedigree interaction and viewport tests passed");
