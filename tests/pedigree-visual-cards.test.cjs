"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "pedigree-visual.js"), "utf8");
const css = fs.readFileSync(path.join(root, "pedigree-visual.css"), "utf8");
const pwa = fs.readFileSync(path.join(root, "pwa.js"), "utf8");
const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

new Function(script);

assert.match(script, /herdharbor_pedigree_visuals_v1/);
assert.match(script, /herdharbor_pre_alpha_v1/);
assert.match(script, /sexColors: true/);
assert.match(script, /photoMode: "off"/);
assert.match(script, /printPhotos: false/);
assert.match(script, /hh-sex-\$\{sexForCard\(card\)\}/);
assert.match(script, /\["COLOR", "BREEDER"\]/);
assert.match(script, /hh-protected-field/);
assert.match(script, /hh-empty-secondary/);
assert.match(script, /photoDataUrl/);
assert.match(script, /profilePhotoDataUrl/);
assert.match(script, /Missing photos|Missing photo|!src/);
assert.match(script, /generation === 0/);
assert.match(script, /prefs\.printPhotos/);
assert.match(script, /#view-settings/);
assert.match(script, /Pedigree appearance/);
assert.match(script, /Include stored photos on printed pedigrees/);
assert.match(script, /MutationObserver/);
assert.match(script, /window\.open = function/);
assert.match(script, /enhanceDocument\(child\.document, true\)/);

assert.match(css, /\.hh-pedigree-card\.hh-sex-male/);
assert.match(css, /#eff6ff/i);
assert.match(css, /\.hh-pedigree-card\.hh-sex-female/);
assert.match(css, /#fff1f5/i);
assert.match(css, /\.hh-protected-field[\s\S]*?text-overflow: clip !important/);
assert.match(css, /overflow-wrap: anywhere !important/);
assert.match(css, /data-hh-generation="1"[\s\S]*?width: 0\.52in/);
assert.match(css, /data-hh-generation="2"[\s\S]*?width: 0\.44in/);
assert.match(css, /data-hh-generation="3"[\s\S]*?width: 0\.34in/);
assert.match(css, /data-hh-generation="0"[\s\S]*?display: none/);
assert.match(css, /print-color-adjust: exact/);
assert.doesNotMatch(css, /text-overflow:\s*ellipsis/);

assert.match(pwa, /pedigree-visual\.css\?v=1/);
assert.match(pwa, /pedigree-visual\.js\?v=1/);
assert.match(worker, /pedigree-visual\.css\?v=1/);
assert.match(worker, /pedigree-visual\.js\?v=1/);

console.log("pedigree visual card, photo preference, and print protection tests passed");
