"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const script = fs.readFileSync(path.resolve(__dirname, "..", "pedigree-visual.js"), "utf8");
const css = fs.readFileSync(path.resolve(__dirname, "..", "pedigree-visual.css"), "utf8");
assert.match(script, /enhanceDocument\(child\.document, true\)/);
assert.match(script, /enhanceDocument\(doc, true\)/);
assert.match(css, /@media print/);
assert.match(css, /0\.52in/);
assert.match(css, /0\.44in/);
assert.match(css, /0\.34in/);

console.log("pedigree print visual test passed");
