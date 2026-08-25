"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const Base = require("../breeding-intelligence-core.js");
const source = fs.readFileSync(path.join(root, "breeding-pair-hotfix-v1.4.2.js"), "utf8");

// Regression for the v1.4.1 sign-in freeze: the hotfix must never install a
// body-wide MutationObserver that rewrites its own datalist and retriggers itself.
assert.doesNotMatch(source, /MutationObserver/);
assert.doesNotMatch(source, /observe\(document\.body/);

const elements = new Map();
const document = {
  readyState: "complete",
  body: {
    appendChild(element) {
      if (element.id) elements.set(element.id, element);
    }
  },
  getElementById: (id) => elements.get(id) || null,
  createElement: () => ({
    id: "",
    innerHTML: "",
    setAttribute() {},
    removeAttribute() {},
    getAttribute() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  }),
  querySelectorAll: () => [],
  querySelector: () => null,
  addEventListener() {}
};

const window = { HerdHarborBreedingIntelligenceCore: Base };
vm.runInNewContext(source, {
  window,
  document,
  localStorage: { getItem() { return null; }, setItem() {} },
  console
});

const H = window.HerdHarborBreedingPairHotfix;
assert.ok(H);
assert.equal(H.version, "1.4.2");

assert.equal(H.canonicalSex("Male"), "male");
assert.equal(H.canonicalSex("Female"), "female");
assert.equal(H.canonicalSex("Buck"), "male");
assert.equal(H.canonicalSex("Doe"), "female");
assert.equal(H.isPairingRabbit({ species: "Rabbit", status: "Active" }), true);
assert.equal(H.isPairingRabbit({ species: "Rabbit", status: "Breeding" }), true);
assert.equal(H.isPairingRabbit({ species: "Rabbit", status: "Ancestor Only" }), false);
assert.equal(H.isPairingRabbit({ species: "Rabbit", status: "Sold" }), false);
assert.equal(H.isPairingRabbit({ species: "Rabbit", status: "Deceased" }), false);

for (const color of [
  "Black", "Blue", "Chocolate", "Lilac",
  "Black Magpie", "Blue Magpie", "Chocolate Magpie", "Lilac Magpie",
  "Black Harlequin", "Chinchilla", "Red Eyed White (REW)", "Broken Black Magpie"
]) {
  assert.ok(H.standardColors.includes(color), color);
}
assert.ok(H.standardColors.length >= 70);

const rabbit = (id, name, color, sex, status = "Active") => ({
  id, name, species: "Rabbit", color, sex, status
});
const blackMagpieBuck = rabbit("bm", "BM", "Black Magpie", "Male");
const blueMagpieDoe = rabbit("bd", "BD", "Blue Magpie", "Female");
const chocolateBuck = rabbit("cb", "CB", "Chocolate", "Male");
const lilacDoe = rabbit("ld", "LD", "Lilac", "Female");

const magpie = H.analyze(blackMagpieBuck, blueMagpieDoe);
const chocolateLilac = H.analyze(chocolateBuck, lilacDoe);
const names = (result) => result.out.map((outcome) => outcome.name).sort();

assert.deepEqual(Array.from(magpie.inputs), ["Black Magpie", "Blue Magpie"]);
assert.ok(names(magpie).some((name) => /Magpie/.test(name)));
assert.notDeepEqual(names(magpie), names(chocolateLilac));

// Ancestor records/colors are deliberately not prediction inputs.
blackMagpieBuck.sireId = "ancestor1";
blueMagpieDoe.damId = "ancestor2";
const before = names(H.analyze(blackMagpieBuck, blueMagpieDoe));
const ancestor = { id: "ancestor1", species: "Rabbit", status: "Ancestor Only", color: "REW" };
ancestor.color = "Lilac Tort";
assert.deepEqual(before, names(H.analyze(blackMagpieBuck, blueMagpieDoe)));

const bad = H.analyze(rabbit("u", "Unknown", "Mystery Custom Color", "Male"), blueMagpieDoe);
assert.equal(bad.out.length, 0);
assert.equal(bad.bad.length, 1);

assert.match(source, /input\[name="color"\]/);
assert.match(source, /Ancestor colors: NOT used/);
assert.match(source, /stopImmediatePropagation/);
assert.match(source, /focusin/);

console.log("HerdHarbor v1.4.2 Pair Analysis freeze-regression tests passed");
