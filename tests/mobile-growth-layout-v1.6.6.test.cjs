"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(root, "analytics-v1.6.1.css"), "utf8");
const js = fs.readFileSync(path.join(root, "analytics-v1.6.1.js"), "utf8");

assert.match(js, /Compare animals and choose stable colors/);
assert.match(css, /@media \(max-width: 700px\)[\s\S]*?\.analytics-growth-controls \{[\s\S]*?max-width: 100%[\s\S]*?overflow: hidden/);
assert.match(css, /\.analytics-growth-controls fieldset \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)[\s\S]*?max-width: 100%[\s\S]*?overflow-x: hidden/);
assert.match(css, /\.analytics-growth-controls fieldset > label \{[\s\S]*?max-width: 100%[\s\S]*?min-width: 0/);
assert.match(css, /\.analytics-color-control span \{ min-width: 0; overflow-wrap: break-word; word-break: normal;/);
assert.match(css, /@supports selector\(fieldset:has\(> \.analytics-color-control\)\)/);
assert.match(css, /fieldset:has\(> \.analytics-color-control\)[\s\S]*?grid-template-columns: 44px minmax\(0, 1fr\)/);

console.log("Alpha v1.6.6 mobile Growth layout guard passed");
