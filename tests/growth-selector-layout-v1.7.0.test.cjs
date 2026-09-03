const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "analytics-v1.6.1.css"), "utf8");

test("v1.7.0 growth animal selector keeps readable desktop card widths", () => {
  assert.match(
    css,
    /\.analytics-growth-controls fieldset\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(180px,\s*1fr\)\);[^}]*max-height:\s*320px;[^}]*overflow-y:\s*auto;/s
  );
  assert.match(
    css,
    /\.analytics-growth-controls fieldset > label\s*\{[^}]*grid-template-columns:\s*24px\s+minmax\(0,\s*1fr\);[^}]*min-width:\s*0;[^}]*box-sizing:\s*border-box;/s
  );
});

test("v1.7.0 growth animal names wrap by words instead of one character at a time", () => {
  assert.doesNotMatch(
    css,
    /\.analytics-color-control span\s*\{[^}]*overflow-wrap:\s*anywhere;/s
  );
  assert.match(
    css,
    /\.analytics-color-control span\s*\{[^}]*overflow-wrap:\s*break-word;[^}]*word-break:\s*normal;/s
  );
});
