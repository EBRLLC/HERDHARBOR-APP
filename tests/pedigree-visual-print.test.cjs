"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const script = fs.readFileSync(path.resolve(__dirname, "..", "pedigree-visual.js"), "utf8");
const css = fs.readFileSync(path.resolve(__dirname, "..", "pedigree-visual.css"), "utf8");
const html = fs.readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8");
assert.match(script, /enhanceDocument\(child\.document, true\)/);
assert.match(script, /enhanceDocument\(doc, true\)/);
assert.match(script, /function fitPrintSheet\(doc\)/);
assert.match(script, /PRINT_BOUNDS/);
assert.match(script, /sheet\.style\.zoom/);
assert.match(css, /@media print/);
assert.match(css, /size:\s*letter landscape/);
assert.match(css, /hh-pedigree-one-page/);
assert.match(css, /height:\s*8\.04in !important/);
assert.match(css, /"Segoe UI", Arial, Helvetica, sans-serif/);
assert.doesNotMatch(css, /font-size:\s*max\(/);
assert.match(html, /@page \{ size: letter landscape; margin: \.2in; \}/);
assert.match(html, /\.sheet \{ width: 100%; height: 8\.06in; min-height: 0; max-height: 8\.06in;/);
assert.match(css, /0\.52in/);
assert.match(css, /0\.44in/);
assert.match(css, /0\.34in/);

console.log("single-page pedigree print layout and typography test passed");
