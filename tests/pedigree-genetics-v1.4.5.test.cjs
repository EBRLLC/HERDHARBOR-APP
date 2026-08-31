"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Engine = require("../rabbit-genetics-runtime-v1.5.1.js");
const PedigreeGenetics = require("../pedigree-genetics-v1.5.1.js");

const root = path.resolve(__dirname, "..");
const uiSource = fs.readFileSync(path.join(root, "pedigree-genetics-v1.5.1.js"), "utf8");
const css = fs.readFileSync(path.join(root, "pedigree-genetics-v1.5.1.css"), "utf8");
const visualCss = fs.readFileSync(path.join(root, "pedigree-visual.css"), "utf8");
const notes = fs.readFileSync(path.join(root, "RELEASE_NOTES-v1.5.1.md"), "utf8");

function locus(alleles, source = "breeder", status = "confirmed") {
  return { alleles, source, status };
}
function rabbit(id, name, color, sex = "Male", genetics = null, extra = {}) {
  return { id, name, color, sex, species: "Rabbit", breed: "Holland Lop", status: "Active", genetics, ...extra };
}
function row(profile, locusName) {
  return profile.rows.find((item) => item.locus === locusName);
}

const fullGenetics = {
  loci: {
    A: locus(["a", "a"]),
    B: locus(["B", "b"]),
    C: locus(["C", "cchd"]),
    D: locus(["D", "d"]),
    E: locus(["E", "ej"]),
    En: locus(["en", "en"]),
    V: locus(["V", "v"])
  },
  vienna: { status: "Vienna Carrier (VC)", source: "breeder" }
};
const annie = rabbit("annie", "Annie", "Black", "Female", fullGenetics);
let state = { animals: [annie], births: [] };
let profile = PedigreeGenetics.profileForAnimal(annie, state, Engine, "full");
assert.equal(profile.genotypeText, "A:aa B:Bb C:Ccchd D:Dd E:Eej En:enen V:Vv", "fully known genotype displays all seven loci");
assert.ok(profile.rows.every((item) => item.kind === "proven"), "entered full genotype is visually classified as proven");

const partial = rabbit("partial", "Partial", "Black", "Male", { loci: { B: locus(["B", "_"]) } });
state = { animals: [partial], births: [] };
profile = PedigreeGenetics.profileForAnimal(partial, state, Engine, "known");
assert.equal(row(profile, "B").text, "B_", "partial entered genotype keeps its underscore");
assert.equal(row(profile, "A").text, "aa", "phenotype-proven genetics remain visible in Known Only");
assert.equal(row(profile, "En").text, "__", "unsupported loci remain unresolved");
assert.equal(row(profile, "V").text, "__", "unknown Vienna remains unresolved");

const phenotypeOnly = rabbit("phenotype", "Phenotype Only", "Black", "Female", null);
state = { animals: [phenotypeOnly], births: [] };
profile = PedigreeGenetics.profileForAnimal(phenotypeOnly, state, Engine, "full");
assert.equal(row(profile, "A").text, "aa", "phenotype-only Black infers self at A");
assert.equal(row(profile, "B").text, "B_", "phenotype-only Black keeps unresolved B recessive status");
assert.equal(row(profile, "C").text, "C_", "phenotype-only Black keeps unresolved C recessive status");
assert.equal(row(profile, "D").text, "D_", "phenotype-only Black keeps unresolved D recessive status");
assert.equal(row(profile, "E").text, "E_", "phenotype-only Black keeps unresolved E recessive status");

const chocolateSire = rabbit("choc-sire", "Chocolate Sire", "Chocolate", "Male", null);
const pedigreeChild = rabbit("ped-child", "Pedigree Child", "Black", "Female", null, { sireId: chocolateSire.id });
state = { animals: [pedigreeChild, chocolateSire], births: [] };
const fullPedigree = PedigreeGenetics.profileForAnimal(pedigreeChild, state, Engine, "full");
const knownPedigree = PedigreeGenetics.profileForAnimal(pedigreeChild, state, Engine, "known");
assert.equal(row(fullPedigree, "B").text, "Bb", "direct-parent pedigree evidence adds the required chocolate-carrier allele");
assert.equal(row(fullPedigree, "B").kind, "inferred", "pedigree-only carrier evidence is visually inferred");
assert.equal(row(knownPedigree, "B").text, "B_", "Known Only removes the pedigree-only b while preserving phenotype-proven B");

const parent = rabbit("parent", "Parent", "Black", "Male", null);
const mate = rabbit("mate", "Mate", "Chocolate", "Female", null);
const child = rabbit("child", "Chocolate Child", "Chocolate", "Female", null, { sireId: parent.id, damId: mate.id });
state = { animals: [parent, mate, child], births: [] };
const offspringProfile = PedigreeGenetics.profileForAnimal(parent, state, Engine, "known");
assert.equal(row(offspringProfile, "B").text, "Bb", "offspring-proven carrier evidence updates pedigree lettering");
assert.equal(row(offspringProfile, "B").kind, "proven", "offspring-proven evidence is classified as proven");

const offProfile = PedigreeGenetics.profileForAnimal(annie, { animals: [annie], births: [] }, Engine, "off");
assert.equal(offProfile.rows.length, 0, "Off hides pedigree genetics");
const fakeStorage = { getItem: () => null };
assert.deepEqual(PedigreeGenetics.loadPreferences(fakeStorage), { mode: "full", printGenetics: true }, "rabbit pedigree genetics defaults to Full Inferred and print On");

assert.match(uiSource, /Show Genetics on Pedigree/);
assert.match(uiSource, />Off<\/option>/);
assert.match(uiSource, />Known Only<\/option>/);
assert.match(uiSource, />Full Inferred<\/option>/);
assert.match(uiSource, /Include Genetics on Printed Pedigree/);
assert.match(uiSource, /smallestContaining\(card,'COLOR'\)/, "on-screen genetics is anchored under the color/identity area");
assert.match(uiSource, /enhanceDocument\(child\.document,true/, "printed pedigrees receive genetics before print");
assert.match(uiSource, /hh-pedigree-genetics-dialog/, "genetics line opens evidence detail panel");
assert.match(uiSource, /Entered Genetics remains separate from Inferred Genetics/);
assert.match(uiSource, /MutationObserver/);
assert.match(uiSource, /herdharbor:genetics-ready/);
assert.match(uiSource, /setInterval/, "same-tab record changes trigger automatic pedigree recalculation");

assert.match(css, /\.hh-genotype-line\{display:flex;flex-wrap:wrap/);
assert.match(css, /\.hh-genetics-locus\{[^}]*white-space:nowrap[^}]*word-break:keep-all[^}]*overflow-wrap:normal/, "alleles never split inside cchd/cchl");
assert.match(css, /\.hh-pedigree-card\.hh-has-photo \.hh-pedigree-genetics\{clear:both\}/, "genetics clears stored pedigree photos instead of overlapping them");
assert.match(css, /data-hh-generation="3"[^}]*\.hh-pedigree-genetics\{font-size:\.61em/, "fourth-generation screen genetics stays compact");
assert.match(css, /hh-pedigree-print-document \.hh-pedigree-card\[data-hh-generation="3"\] \.hh-pedigree-genetics\{font-size:5\.9px\}/, "fourth-generation print genetics has an explicit readable compact size");
assert.match(visualCss, /width: 10\.6in !important/);
assert.match(visualCss, /height: 8\.04in !important/, "existing single-page four-generation print bounds remain intact");
assert.doesNotMatch(css, /hh-protected-field[^}]*font-size:/, "new genetics styling does not shrink breeder/color protected fields");

assert.match(notes, /Genetics on Pedigrees/);
assert.match(notes, /Full Inferred/);
assert.match(notes, /Known Only/);

console.log("Alpha v1.5.1 pedigree genetics display and inference tests passed");
