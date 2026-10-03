"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Engine = require("../pedigree-engine-v2.0.0.js");
const Renderer = require("../pedigree-renderer-v2.0.0.js");

const root = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(root, "pedigree-renderer-v2.0.0.css"), "utf8");

function cardFor(html, key) {
  const keyIndex = html.indexOf(`data-pedigree-key="${key}"`);
  assert.ok(keyIndex >= 0, `missing pedigree card ${key}`);
  const start = html.lastIndexOf("<article", keyIndex);
  const end = html.indexOf("</article>", keyIndex);
  assert.ok(start >= 0 && end > keyIndex, `incomplete pedigree card ${key}`);
  return html.slice(start, end + "</article>".length);
}

function graph() {
  return Engine.buildGraph({
    animals: [
      {
        id: "subject",
        name: "A Very Long Registered Animal Name That Must Remain Fully Readable",
        species: "Rabbit",
        sex: "Female",
        dob: "2025-01-02",
        breed: "Holland Lop",
        color: "Black Tort",
        breeder: "Bluegrass Rabbitry",
        registrationNumber: "R-100",
        gcNumber: "GC-9",
        currentWeight: "3 lb 4 oz",
        genotype: "aa B_ C_ D_ ee",
        photoData: "data:image/png;base64,AAAA",
        sireId: "shared",
        damId: "shared"
      },
      { id: "shared", name: "Shared Ancestor", species: "Rabbit", sex: "Male", sireId: "", damId: "" }
    ],
    subjectId: "subject",
    generations: 3
  });
}

test("renderer exposes all explicit reuse modes", () => {
  for (const mode of ["private-herd", "print-preview", "marketplace", "transfer-preview", "relationship-analysis"]) {
    assert.ok(Renderer.MODES[mode], mode);
  }
});

test("private herd renderer consumes the canonical graph and emits one reusable tree", () => {
  const html = Renderer.render({ graph: graph(), mode: "private-herd" });
  assert.match(html, /data-hh-pedigree-renderer/);
  assert.match(html, /data-pedigree-mode="private-herd"/);
  assert.match(html, /data-pedigree-key="subject"/);
  assert.match(html, /data-pedigree-key="sire"/);
  assert.match(html, /data-pedigree-key="dam"/);
  assert.match(html, /Repeated ancestor/);
  assert.match(html, /Also appears as sire/);
});

test("collapsed ancestor cards keep details hidden while subject starts expanded", () => {
  const html = Renderer.render({ graph: graph(), mode: "private-herd" });
  const subject = cardFor(html, "subject");
  const sire = cardFor(html, "sire");
  assert.match(subject, /is-expanded/);
  assert.doesNotMatch(subject, /hh-pedigree-card-details" hidden/);
  assert.match(sire, /aria-expanded="false"/);
  assert.match(sire, /hh-pedigree-card-details" hidden/);
});

test("unknown ancestors remain explicit instead of fabricating ancestry", () => {
  const html = Renderer.render({
    graph: Engine.buildGraph({ animals: [{ id: "subject", name: "Solo" }], subjectId: "subject", generations: 3 }),
    mode: "private-herd"
  });
  assert.match(html, /data-pedigree-status="unknown"/);
  assert.match(html, /Unknown ancestor/);
});

test("mode/config fields control available detail rows and photos", () => {
  const full = Renderer.render({
    graph: graph(),
    mode: "private-herd",
    fields: ["name", "prefix", "sex", "dob", "breed", "color", "weight", "registrationNumber", "gcNumber", "genotype", "photo"]
  });
  for (const label of ["Rabbitry / prefix", "DOB", "Breed", "Variety / color", "Weight", "Registration", "GC number", "Genotype"]) {
    assert.ok(full.includes(label), label);
  }
  assert.match(full, /class="hh-pedigree-photo"/);

  const minimal = Renderer.render({ graph: graph(), mode: "relationship-analysis", fields: ["name", "sex"] });
  assert.doesNotMatch(minimal, /class="hh-pedigree-photo"/);
  assert.doesNotMatch(minimal, /Registration/);
  assert.doesNotMatch(minimal, /Genotype/);
});

test("long names are emitted intact and CSS wraps instead of truncating", () => {
  const longName = "A Very Long Registered Animal Name That Must Remain Fully Readable";
  const html = Renderer.render({ graph: graph(), mode: "private-herd" });
  assert.ok(html.includes(longName));
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(css, /hh-pedigree-card-title strong[\s\S]{0,220}text-overflow:\s*ellipsis/);
});

test("mobile interaction uses touch-sized controls and responsive horizontal generations", () => {
  assert.match(css, /\.hh-pedigree-toggle[\s\S]*?width:\s*44px/);
  assert.match(css, /touch-action:\s*manipulation/);
  assert.match(css, /@media \(max-width:\s*760px\)/);
  assert.match(css, /82vw/);
  assert.match(css, /scroll-snap-align:\s*start/);
});

test("print-preview mode is non-interactive but uses the same renderer", () => {
  const html = Renderer.render({ graph: graph(), mode: "print-preview" });
  assert.match(html, /mode-print-preview/);
  assert.doesNotMatch(html, /data-hh-pedigree-toggle/);
});
