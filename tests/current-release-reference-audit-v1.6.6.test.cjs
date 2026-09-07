"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

// v1.6.6 is now a historical shipped hotfix. This test protects the fix itself
// without requiring retired release-note or acceptance snapshots to remain in
// the live tree.
const css = read("analytics-v1.6.1.css");
const js = read("analytics-v1.6.1.js");
const mobileGuard = read("tests/mobile-growth-layout-v1.6.6.test.cjs");

assert.match(js, /Compare animals and choose stable colors/);
assert.match(css, /@media \(max-width: 700px\)[\s\S]*?\.analytics-growth-controls \{[\s\S]*?max-width: 100%[\s\S]*?overflow: hidden/);
assert.match(css, /\.analytics-growth-controls fieldset \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)[\s\S]*?max-width: 100%[\s\S]*?overflow-x: hidden/);
assert.match(css, /\.analytics-color-control span \{ min-width: 0; overflow-wrap: break-word; word-break: normal;/);
assert.match(css, /@supports selector\(fieldset:has\(> \.analytics-color-control\)\)/);
assert.match(mobileGuard, /Alpha v1\.6\.6 mobile Growth layout guard passed/);

console.log("Alpha v1.6.6 shipped mobile Growth hotfix preservation audit passed");
