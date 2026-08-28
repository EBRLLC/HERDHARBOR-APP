"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const spreadsheet = fs.readFileSync(path.join(root, "spreadsheet-import.js"), "utf8");

const gates = html.match(/allowsAnimalTransition\(/g) || [];
assert.ok(gates.length >= 7, "all active-animal creation/import/reactivation paths use the centralized Junior gate");
assert.match(html, /if \(!allowsAnimalTransition\(state\.animals, \[\.\.\.state\.animals, newAnimal\]\)\) return;/, "new animal path is gated");
assert.match(html, /if \(!allowsAnimalTransition\(state\.animals, nextAnimals\)\) return;/, "animal edit/reactivation path is gated");
assert.match(html, /openOffspringCreator[\s\S]*?allowsAnimalTransition\(state\.animals, \[\.\.\.state\.animals, \.\.\.created\]\)/, "offspring creation is gated");
assert.match(html, /handleTransferImport[\s\S]*?allowsAnimalTransition\(state\.animals, \[\.\.\.state\.animals, \.\.\.added\]\)/, "transfer import is gated");
assert.match(html, /handleSpreadsheetImport[\s\S]*?allowsAnimalTransition\(state\.animals, \[\.\.\.state\.animals, \.\.\.records\.animals\]\)/, "spreadsheet import is gated");
assert.match(html, /loadDemoData[\s\S]*?allowsAnimalTransition\(state\.animals, \[\.\.\.state\.animals, \.\.\.demoAnimals\]\)/, "demo records cannot bypass the limit");
assert.match(html, /\["Sold", "Deceased", "Archived", "Ancestor Only"\]/);
assert.match(html, /<option[^>]*>Archived<\/option>|"Archived", "Ancestor Only"/);
assert.match(spreadsheet, /"Archived"/);
assert.match(spreadsheet, /Active,Breeding,Growing,Retired,For Sale,Reserved,Sold,Deceased,Archived,Ancestor Only/);
assert.doesNotMatch(html, /slice\(0,\s*5\)|splice\([^\n]*active/i, "downgrades do not delete or hide animals");

console.log("Alpha v1.5.1 Junior animal-entry and data-preservation tests passed");
