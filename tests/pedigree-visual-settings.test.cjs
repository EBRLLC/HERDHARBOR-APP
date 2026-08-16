"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const script = fs.readFileSync(path.resolve(__dirname, "..", "pedigree-visual.js"), "utf8");
assert.match(script, /const PREF_KEY = "herdharbor_pedigree_visuals_v1"/);
assert.match(script, /localStorage\.setItem\(PREF_KEY/);
assert.match(script, /photoMode: \["off", "compact", "visual"\]/);
assert.match(script, /printPhotos: saved\.printPhotos === true/);

console.log("pedigree visual settings persistence test passed");
