"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "pedigree-visual.js"), "utf8");
const css = fs.readFileSync(path.join(root, "pedigree-visual.css"), "utf8");
const appRuntime = fs.readFileSync(path.join(root, "herdharbor-app-runtime.js"), "utf8");
const standardPrint = fs.readFileSync(path.join(root, "standard-pedigree-print-v2.0.0.js"), "utf8");
const renderer = fs.readFileSync(path.join(root, "pedigree-renderer-v2.0.0.js"), "utf8");

assert.match(script, /enhanceDocument\(child\.document, true\)/);
assert.match(script, /enhanceDocument\(doc, true\)/);
assert.match(css, /@media print/);

assert.match(appRuntime, /HerdHarborPedigreeEngine/);
assert.match(appRuntime, /HerdHarborStandardPedigreePrint/);
assert.match(appRuntime, /engine\.buildGraph\(/);
assert.match(appRuntime, /standardPrint\.buildHtml\(/);
assert.doesNotMatch(appRuntime, /context\.exporter\.buildDocumentHtml\(/);
assert.doesNotMatch(appRuntime, /renderer\.render\([\s\S]{0,600}printSalePedigree/);

assert.match(standardPrint, /grid-template-columns: \$\{columnTemplate\(generations\)\}/);
assert.match(standardPrint, /return "minmax\(168px,1\.18fr\) 34px minmax\(164px,1\.1fr\) 34px minmax\(158px,1fr\) 34px minmax\(152px,\.96fr\)"/);
assert.match(standardPrint, /grid-template-rows: repeat\(\$\{slots\}, minmax\(0,1fr\)\)/);
assert.match(standardPrint, /@page \{ size: letter landscape; margin: \.2in; \}/);

assert.match(renderer, /"marketplace": Object\.freeze/);

console.log("standard pedigree print geometry and separate shared preview renderer tests passed");
