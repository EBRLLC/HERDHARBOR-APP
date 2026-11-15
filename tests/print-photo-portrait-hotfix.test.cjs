"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(name) {
  return fs.readFileSync(path.join(__dirname, "..", name), "utf8");
}

test("birth certificate photo preserves tall images without cropping", () => {
  const css = read("birth-certificate-v2.0.0.css");
  assert.match(css, /\.hh-birth-photo\s*\{[^}]*object-fit:\s*contain\s*;/);
});

test("visual pedigree ancestor photos preserve original aspect ratios", () => {
  const css = read("pedigree-visual.css");
  assert.match(css, /\.hh-pedigree-thumb\s*\{[^}]*object-fit:\s*contain\s*;/);
});

test("pedigree renderer photo preserves original aspect ratio", () => {
  const css = read("pedigree-renderer-v2.0.0.css");
  assert.match(css, /\.hh-pedigree-photo\s*\{[^}]*object-fit:\s*contain\s*;/);
});

test("standard pedigree print header photo preserves original aspect ratio", () => {
  const js = read("standard-pedigree-print-v2.0.0.js");
  assert.match(js, /\.print-animal-photo img\s*\{[^}]*object-fit:\s*contain\s*;/);
});
