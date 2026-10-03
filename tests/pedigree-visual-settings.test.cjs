"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "pedigree-visual.js"), "utf8");
const customization = fs.readFileSync(path.join(root, "pedigree-customization-v2.0.0.js"), "utf8");

assert.match(script, /const PREF_KEY = "herdharbor_pedigree_visuals_v1"/);
assert.match(customization, /const PREF_KEY = "herdharbor_pedigree_visuals_v1"/);
assert.match(script, /HerdHarborPedigreeCustomization/);
assert.match(script, /customization\.savePreferences\(localStorage, config\)/);
assert.match(script, /customization\.templateConfig/);
assert.match(script, /Pedigree defaults/);
assert.match(customization, /photoMode: normalized\.photos \? "compact" : "off"/);
assert.match(customization, /printPhotos: normalized\.photos/);
assert.doesNotMatch(customization, /herdharbor_pedigree_visuals_v2|herdharbor_pedigree_customization/);

console.log("pedigree customization reuses the established appearance preference store");
