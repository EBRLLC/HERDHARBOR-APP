"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const Genetics = require("../multispecies-genetics-v1.7.1.js");
const source = fs.readFileSync(path.resolve(__dirname, "../multispecies-genetics-ui-v1.7.1.js"), "utf8");

function loadUi(state = { animals: [] }) {
  const context = {
    console,
    HerdHarborGeneticsPlatform: Genetics,
    localStorage: {
      getItem() { return JSON.stringify(state); }
    },
    document: {
      readyState: "loading",
      addEventListener() {},
      querySelector() { return null; },
      createElement() { throw new Error("dialog DOM should not be needed by render-only tests"); },
      body: null,
      documentElement: null
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "multispecies-genetics-ui-v1.7.1.js" });
  return context.HerdHarborMultiSpeciesGeneticsUI;
}

test("shared genetics UI exposes the v1.7.1 foundation surface", () => {
  const UI = loadUi();
  assert.ok(UI);
  assert.equal(UI.version, "1.7.1");
  assert.equal(typeof UI.open, "function");
  assert.equal(typeof UI.render, "function");
  assert.equal(typeof UI.activeAnimals, "function");
  assert.equal(typeof UI.breedingSpecies, "function");
  assert.equal(typeof UI.renderBreeding, "function");
});

test("foundation UI clearly reports architecture-only status and preserves unclassified records", () => {
  const UI = loadUi();
  const html = UI.render({
    id: "c1",
    name: "Example Cow",
    species: "Cattle",
    breed: "Angus",
    genetics: {
      traits: {
        imported_marker: { alleles: ["A", "a"], status: "breeder-confirmed" }
      }
    }
  });

  assert.match(html, /Cattle Genetics/);
  assert.match(html, /Alpha v1\.7\.1 · Shared genetics API/);
  assert.match(html, /Foundation ready/);
  assert.match(html, /Architecture first\./);
  assert.match(html, /Reviewed loci<\/small><strong>0<\/strong>/);
  assert.match(html, /Reviewed traits<\/small><strong>0<\/strong>/);
  assert.match(html, /No species-specific gene library bundled yet\./);
  assert.match(html, /v1\.7\.2/);
  assert.match(html, /1<\/strong> unclassified trait record/);
  assert.match(html, /Unknown and partial genetics stay unknown/);
  assert.doesNotMatch(html, /25%|50%|75%|100%/);
});

test("poultry foundation UI advertises ZW and sex-linked capability without inventing a poultry gene library", () => {
  const UI = loadUi();
  const html = UI.render({ id: "p1", name: "Hen", species: "Poultry", genetics: {} });
  assert.match(html, /Poultry Genetics/);
  assert.match(html, /<small>Chromosomes<\/small><strong>ZW<\/strong>/);
  assert.match(html, /Sex-linked/);
  assert.match(html, /Reviewed traits<\/small><strong>0<\/strong>/);
  assert.match(html, /v1\.7\.4/);
});

test("rabbit remains routed to the existing rabbit genetics profile instead of the shared foundation dialog", () => {
  assert.match(source, /if\(species==='rabbit'\)/);
  assert.match(source, /HerdHarborRabbitGeneticsV2\?\.openProfile/);
  assert.match(source, /HerdHarborBreedingIntelligence\?\.openGeneticProfile/);
  assert.match(source, /HerdHarborGeneticsPlatform/);
});

test("Breeding genetics only exposes species represented by current active animals", () => {
  const state = {
    animals: [
      { id: "c1", name: "Daisy", species: "Cattle", breed: "Angus", status: "Active" },
      { id: "c2", name: "Mabel", species: "Cow", breed: "Hereford", status: "Breeding" },
      { id: "r-old", name: "Old Rabbit", species: "Rabbit", status: "Sold" },
      { id: "g-old", name: "Old Goat", species: "Goat", status: "Deceased" },
      { id: "r-ancestor", name: "Rabbit Ancestor", species: "Rabbit", status: "Ancestor Only" }
    ]
  };
  const UI = loadUi(state);
  const groups = UI.breedingSpecies(state);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].species, "cattle");
  assert.equal(groups[0].animals.map(animal => animal.id).join(","), "c1,c2");

  const html = UI.renderBreeding(state);
  assert.match(html, /Cattle/);
  assert.match(html, /2 active animals/);
  assert.doesNotMatch(html, /Rabbit genetics|Goat genetics|Poultry genetics|Swine genetics/);
});

test("Breeding genetics creates one species tab for each species the farm currently has", () => {
  const state = {
    animals: [
      { id: "g1", name: "Hazel", species: "Goat", status: "Active" },
      { id: "c1", name: "Daisy", species: "Cows", status: "Active" },
      { id: "r1", name: "Penny", species: "Rabbits", status: "Active" },
      { id: "horse1", name: "Scout", species: "Horse", status: "Active" }
    ]
  };
  const UI = loadUi(state);
  const groups = UI.breedingSpecies(state);
  assert.equal(groups.map(group => group.species).join(","), "cattle,goat,rabbit");

  const html = UI.renderBreeding(state);
  assert.match(html, /data-hh-genetics-species="cattle"/);
  assert.match(html, /data-hh-genetics-species="goat"/);
  assert.match(html, /data-hh-genetics-species="rabbit"/);
  assert.doesNotMatch(html, /data-hh-genetics-species="poultry"/);
  assert.doesNotMatch(html, /data-hh-genetics-species="swine"/);
  assert.doesNotMatch(html, /data-hh-genetics-species="horse"/);
  assert.match(html, /Daisy/);
  assert.match(html, /Hazel/);
  assert.match(html, /Penny/);
});

test("Breeding genetics renders nothing when the farm has no active animals with a genetics adapter", () => {
  const state = {
    animals: [
      { id: "r1", name: "Sold Rabbit", species: "Rabbit", status: "Sold" },
      { id: "h1", name: "Horse", species: "Horse", status: "Active" }
    ]
  };
  const UI = loadUi(state);
  assert.equal(UI.renderBreeding(state), "");
});
