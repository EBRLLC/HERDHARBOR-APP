"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "pedigree-visual.js"), "utf8");
const css = fs.readFileSync(path.join(root, "pedigree-visual.css"), "utf8");
const appRuntime = fs.readFileSync(path.join(root, "herdharbor-app-runtime.js"), "utf8");
const exporter = fs.readFileSync(path.join(root, "document-export-v2.0.0.js"), "utf8");

assert.match(script, /enhanceDocument\(child\.document, true\)/);
assert.match(script, /enhanceDocument\(doc, true\)/);
assert.match(css, /@media print/);

assert.match(appRuntime, /HerdHarborPedigreeEngine/);
assert.match(appRuntime, /HerdHarborPedigreeRenderer/);
assert.match(appRuntime, /HerdHarborDocumentExport/);
assert.match(appRuntime, /engine\.buildGraph\(/);
assert.match(appRuntime, /renderer\.render\(/);
assert.match(appRuntime, /exporter\.buildDocumentHtml\(/);
assert.match(appRuntime, /exporter\.pedigreePageOptions/);
assert.doesNotMatch(appRuntime, /grid-template-columns: minmax\(168px,1\.18fr\)/);
assert.doesNotMatch(appRuntime, /function animalCard\(animal, relation/);

assert.match(exporter, /@page \{ size: \$\{page\.pageSize\} \$\{page\.orientation\}/);
assert.match(exporter, /Print \/ Save PDF/);
assert.match(exporter, /page-break-after:always/);
assert.match(exporter, /break-inside:avoid/);
assert.match(exporter, /pedigree-renderer-v2\.0\.0\.css\?v=1/);

console.log("shared pedigree print/PDF export architecture test passed");
