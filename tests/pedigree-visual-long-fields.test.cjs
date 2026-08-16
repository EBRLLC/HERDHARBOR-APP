"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const script = fs.readFileSync(path.resolve(__dirname, "..", "pedigree-visual.js"), "utf8");
const css = fs.readFileSync(path.resolve(__dirname, "..", "pedigree-visual.css"), "utf8");
assert.match(script, /\["COLOR", "BREEDER"\]/);
assert.match(script, /\[data-field="\$\{fieldName\}"\]/);
assert.match(css, /\.hh-pedigree-card \.hh-protected-field \{/);
assert.match(css, /white-space: normal !important/);
assert.match(css, /overflow: visible !important/);
assert.match(css, /text-overflow: clip !important/);
assert.match(css, /overflow-wrap: anywhere !important/);
assert.doesNotMatch(css, /\.hh-protected-field \*/);
assert.doesNotMatch(css, /ellipsis/);

console.log("pedigree long color and breeder field protection test passed");
