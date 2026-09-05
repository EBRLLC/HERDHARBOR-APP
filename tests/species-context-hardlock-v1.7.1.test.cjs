"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const uiSource = fs.readFileSync(path.resolve(__dirname, "../multispecies-genetics-ui-v1.7.1.js"), "utf8");
const contractDoc = fs.readFileSync(path.resolve(__dirname, "../SPECIES-CONTEXT-DESIGN.md"), "utf8");

function loadSpeciesContext(state = { animals: [] }) {
  const context = {
    console,
    localStorage: {
      getItem() { return JSON.stringify(state); }
    },
    document: {
      readyState: "loading",
      addEventListener() {},
      querySelector() { return null; }
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(uiSource, context, { filename: "multispecies-genetics-ui-v1.7.1.js" });
  return context.HerdHarborSpeciesContext;
}

test("HH-SPECIES-CONTEXT-001 is a hardlocked current-farm design contract", () => {
  const ctx = loadSpeciesContext();
  assert.ok(ctx);
  assert.equal(ctx.version, "1.7.1");
  assert.equal(ctx.hardlocked, true);
  assert.equal(ctx.contract.id, "HH-SPECIES-CONTEXT-001");
  assert.equal(ctx.contract.hardlocked, true);
  assert.equal(ctx.defaultScope, "current-active-farm");
  assert.equal(ctx.contract.historicalOverride, "explicit-reason-required");
  assert.equal(Array.from(ctx.excludedCurrentStatuses).join(","), "Sold,Deceased,Archived,Ancestor Only");
});

test("operational species context includes current farm animals and excludes historical/reference records", () => {
  const state = {
    animals: [
      { id: "a", species: "Cattle", status: "Active" },
      { id: "b", species: "Cattle", status: "Breeding" },
      { id: "g", species: "Goat", status: "Growing" },
      { id: "r", species: "Rabbit", status: "Retired" },
      { id: "f", species: "Cattle", status: "For Sale" },
      { id: "v", species: "Goat", status: "Reserved" },
      { id: "sold", species: "Rabbit", status: "Sold" },
      { id: "dead", species: "Sheep", status: "Deceased" },
      { id: "archived", species: "Swine", status: "Archived" },
      { id: "ancestor", species: "Rabbit", status: "Ancestor Only" }
    ]
  };
  const ctx = loadSpeciesContext(state);
  assert.equal(ctx.currentAnimals(state).map(animal => animal.id).join(","), "a,b,g,r,f,v");
  assert.equal(ctx.currentSpecies(state).sort().join(","), "cattle,goat,rabbit");
});

test("historical species inclusion requires an explicit reason", () => {
  const state = {
    animals: [
      { id: "current", species: "Cattle", status: "Active" },
      { id: "old", species: "Rabbit", status: "Sold" }
    ]
  };
  const ctx = loadSpeciesContext(state);
  assert.throws(() => ctx.animalsForSurface(state, { includeHistorical: true }), /explicit reason/i);
  assert.equal(ctx.animalsForSurface(state, { includeHistorical: true, reason: "historical sales report" }).map(animal => animal.id).join(","), "current,old");
});

test("Breeding genetics consumes the shared species context instead of enumerating every supported adapter", () => {
  assert.match(uiSource, /HerdHarborSpeciesContext/);
  assert.match(uiSource, /SpeciesContext\.groupCurrentAnimalsBySpecies/);
  assert.doesNotMatch(uiSource, /listAdapters\(\).*data-hh-genetics-species/s);
});

test("the architecture document locks the rule against static species UI", () => {
  assert.match(contractDoc, /Status: \*\*HARDLOCKED\*\*/);
  assert.match(contractDoc, /must derive visible species from the animals currently on that farm/i);
  assert.match(contractDoc, /Sold/);
  assert.match(contractDoc, /Deceased/);
  assert.match(contractDoc, /Archived/);
  assert.match(contractDoc, /Ancestor Only/);
  assert.match(contractDoc, /not a per-user preference/i);
});
