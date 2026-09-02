"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const visualJs = fs.readFileSync(path.join(root, "pedigree-visual.js"), "utf8");
const geneticsJs = fs.readFileSync(path.join(root, "pedigree-genetics-v1.6.1.js"), "utf8");
const css = fs.readFileSync(path.join(root, "pedigree-visual.css"), "utf8");

assert.match(visualJs, /class=\"hh-setting-check\"/);
assert.match(visualJs, /id=\"hh-pedigree-sex-colors\"/);
assert.match(visualJs, /id=\"hh-pedigree-print-photos\"/);
assert.match(geneticsJs, /class=\"hh-setting-check\"/);
assert.match(geneticsJs, /id=\"hh-pedigree-print-genetics\"/);

assert.match(css, /\.hh-pedigree-settings\s*\{[\s\S]*?max-width:\s*100%;[\s\S]*?min-width:\s*0;[\s\S]*?overflow:\s*hidden;/);
assert.match(css, /\.hh-pedigree-settings \.hh-setting-row\s*\{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*100%;[\s\S]*?min-width:\s*0;/);
assert.match(css, /\.hh-pedigree-settings \.hh-setting-check\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*24px minmax\(0, 1fr\);[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;/);
assert.match(css, /\.hh-pedigree-settings \.hh-setting-check input\[type=\"checkbox\"\]\s*\{[\s\S]*?width:\s*22px !important;[\s\S]*?min-width:\s*22px !important;[\s\S]*?max-width:\s*22px !important;[\s\S]*?height:\s*22px !important;/);
assert.match(css, /\.hh-pedigree-settings \.hh-setting-check span\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*100%;[\s\S]*?overflow-wrap:\s*anywhere;/);
assert.match(css, /\.hh-pedigree-settings select\s*\{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*100%;[\s\S]*?min-width:\s*0;/);
assert.match(css, /@media \(max-width:\s*620px\)[\s\S]*?\.hh-pedigree-settings/);

console.log("Alpha v1.6.7 mobile pedigree settings containment test passed");
