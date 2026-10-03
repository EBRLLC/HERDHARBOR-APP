"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const Engine = require("../pedigree-engine-v2.0.0.js");
const Renderer = require("../pedigree-renderer-v2.0.0.js");
const css = fs.readFileSync(path.resolve(__dirname, "..", "pedigree-renderer-v2.0.0.css"), "utf8");

function graph(generations) {
  const animals = [{ id: "subject", name: "Ghost", sireId: "sire", damId: "dam" }];
  const make = (id, sireId = "", damId = "") => animals.push({ id, name: id, sireId, damId });
  make("sire", "ss", "sd");
  make("dam", "ds", "dd");
  make("ss", "sss", "ssd");
  make("sd", "sds", "sdd");
  make("ds", "dss", "dsd");
  make("dd", "dds", "ddd");
  for (const id of ["sss","ssd","sds","sdd","dss","dsd","dds","ddd"]) make(id);
  return Engine.buildGraph({ animals, subjectId: "subject", generations });
}

function cardStyle(html, key) {
  const marker = `data-pedigree-key="${key}"`;
  const index = html.indexOf(marker);
  assert.ok(index >= 0, `missing ${key}`);
  const start = html.lastIndexOf("<article", index);
  const end = html.indexOf(">", index);
  return html.slice(start, end + 1);
}

test("four generation print preview assigns hierarchical pedigree row slots", () => {
  const html = Renderer.render({ graph: graph(4), mode: "print-preview" });
  assert.match(html, /data-pedigree-generations="4"/);
  assert.match(html, /--hh-pedigree-slots:8/);

  assert.match(cardStyle(html, "subject"), /--hh-pedigree-row-start:1;--hh-pedigree-row-span:8/);
  assert.match(cardStyle(html, "sire"), /--hh-pedigree-row-start:1;--hh-pedigree-row-span:4/);
  assert.match(cardStyle(html, "dam"), /--hh-pedigree-row-start:5;--hh-pedigree-row-span:4/);
  assert.match(cardStyle(html, "sireSire"), /--hh-pedigree-row-start:1;--hh-pedigree-row-span:2/);
  assert.match(cardStyle(html, "sireDam"), /--hh-pedigree-row-start:3;--hh-pedigree-row-span:2/);
  assert.match(cardStyle(html, "damSire"), /--hh-pedigree-row-start:5;--hh-pedigree-row-span:2/);
  assert.match(cardStyle(html, "damDam"), /--hh-pedigree-row-start:7;--hh-pedigree-row-span:2/);
});

test("print CSS removes desktop minimum column widths and centers branch cards", () => {
  assert.match(css, /mode-print-preview \.hh-pedigree-columns[\s\S]*grid-template-columns:\s*repeat\(var\(--hh-pedigree-generations, 3\), minmax\(0, 1fr\)\)/);
  assert.match(css, /mode-print-preview \.hh-pedigree-generation-cards[\s\S]*grid-template-rows:\s*repeat\(var\(--hh-pedigree-slots, 4\), minmax\(0, 1fr\)\)/);
  assert.match(css, /grid-row:\s*var\(--hh-pedigree-row-start, auto\) \/ span var\(--hh-pedigree-row-span, 1\)/);
  assert.match(css, /align-self:\s*center/);
});

test("great-grandparent print cards use compact presentation without hiding selected fields", () => {
  assert.match(css, /data-generation="3"[\s\S]*hh-pedigree-card-summary/);
  assert.match(css, /data-generation="3"[\s\S]*hh-pedigree-field dd/);
  assert.doesNotMatch(css, /data-generation="3"[\s\S]{0,500}display:\s*none/);
});
