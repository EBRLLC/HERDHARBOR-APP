const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const start = html.indexOf("  const PEDIGREE_SLOTS =");
const end = html.indexOf("  function renderPedigrees()", start);
assert.ok(start >= 0 && end > start, "pedigree ancestry source is present");

const source = html.slice(start, end);
const buildResolver = new Function(
  "state",
  `${source}\nreturn existingPedigreeAncestry;`
);

const animals = [
  { id: "child", sireId: "sire", damId: "dam" },
  { id: "sire", sireId: "shared-grandsire", damId: "sire-dam" },
  { id: "dam", sireId: "dam-sire", damId: "shared-grandsire" },
  { id: "shared-grandsire", sireId: "great-sire", damId: "great-dam" },
  { id: "sire-dam", sireId: "", damId: "" },
  { id: "dam-sire", sireId: "", damId: "" },
  { id: "great-sire", sireId: "", damId: "" },
  { id: "great-dam", sireId: "", damId: "" }
];

const resolve = buildResolver({ animals });
const ancestry = resolve("child");

assert.equal(ancestry.sire, "sire");
assert.equal(ancestry.dam, "dam");
assert.equal(ancestry.sireSire, "shared-grandsire");
assert.equal(ancestry.damDam, "shared-grandsire", "linebred ancestors remain in both branches");
assert.equal(ancestry.sireSireSire, "great-sire");
assert.equal(ancestry.damDamDam, "great-dam");

const cyclicResolve = buildResolver({
  animals: [
    { id: "child", sireId: "sire", damId: "" },
    { id: "sire", sireId: "child", damId: "" }
  ]
});
assert.deepEqual(cyclicResolve("child"), { sire: "sire" }, "cycles stop at the repeated animal");

assert.match(
  html,
  /if \(!ownerId \|\| !parentId\) return;/,
  "saving a pedigree does not erase an existing parent link with a blank value"
);

console.log("pedigree inheritance tests passed");

