"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Core = require("../rabbit-genetics-v1.6.1.js");
const Inheritance = require("../rabbit-genetics-inheritance-v2.0.3.js");
const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const rabbit = (id, color = "", loci = {}, extra = {}) => ({
  id, name: id, species: "Rabbit", color,
  genetics: { loci: Object.fromEntries(Object.entries(loci)
    .map(([locus, alleles]) => [locus, { alleles, status: "confirmed", source: "breeder" }])) },
  ...extra
});
const locus = (animal, name) => animal.genetics?.loci?.[name];

test("exact parental cross and visible kit color become reversible inferred genotype", () => {
  const sire = rabbit("sire", "Black", { D: ["D", "d"] });
  const dam = rabbit("dam", "Blue", { D: ["d", "d"] });
  const kit = rabbit("kit", "Black", {}, { sireId: "sire", damId: "dam" });
  const state = { animals: [sire, dam, kit] };
  const first = Inheritance.reconcile(state, Core);
  assert.ok(first.changed > 0);
  assert.deepEqual(locus(kit, "D").alleles, ["D", "d"]);
  assert.equal(locus(kit, "D").source, Inheritance.SOURCE);
  assert.equal(locus(kit, "D").status, "strongly-inferred");
  assert.match(locus(kit, "D").note, /not DNA-confirmed/);
  const saved = JSON.stringify(state);
  assert.equal(Inheritance.reconcile(state, Core).changed, 0);
  assert.equal(JSON.stringify(state), saved, "no duplicate writes on unrelated saves");
  assert.equal(kit.sireId, "sire");
  assert.equal(kit.damId, "dam");
});

test("unresolved Mendelian outcomes must not be assigned to individual kits", () => {
  const sire = rabbit("sire", "", { D: ["D", "d"] });
  const dam = rabbit("dam", "", { D: ["D", "d"] });
  const kit = rabbit("kit", "", {}, { sireId: "sire", damId: "dam" });
  Inheritance.reconcile({ animals: [sire, dam, kit] }, Core);
  assert.equal(locus(kit, "D"), undefined);
});

test("homozygous offspring provides necessary carrier evidence to non-blue parents", () => {
  const sire = rabbit("sire", "Black");
  const dam = rabbit("dam", "Black");
  const kit = rabbit("kit", "Blue", {}, { sireId: "sire", damId: "dam" });
  Inheritance.reconcile({ animals: [sire, dam, kit] }, Core);
  assert.deepEqual(locus(sire, "D").alleles, ["D", "d"]);
  assert.deepEqual(locus(dam, "D").alleles, ["D", "d"]);
  assert.equal(locus(sire, "D").source, Inheritance.SOURCE);
});

test("a changed parent genotype retracts stale automatic inheritance, never overrides entered evidence", () => {
  const sire = rabbit("sire", "Black", { D: ["D", "d"] });
  const dam = rabbit("dam", "Blue", { D: ["d", "d"] });
  const kit = rabbit("kit", "Black", {}, { sireId: "sire", damId: "dam" });
  const state = { animals: [sire, dam, kit] };
  Inheritance.reconcile(state, Core);
  assert.deepEqual(locus(kit, "D").alleles, ["D", "d"]);
  sire.color = "Blue";
  sire.genetics.loci.D = { alleles: ["d", "d"], status: "confirmed", source: "dna" };
  Inheritance.reconcile(state, Core);
  assert.equal(locus(kit, "D"), undefined);
  assert.ok(kit.genetics.conflicts.some(c => c.source === Inheritance.SOURCE && c.locus === "D"));
  kit.genetics.loci.D = { alleles: ["D", "D"], status: "confirmed", source: "genetic-test" };
  Inheritance.reconcile(state, Core);
  assert.deepEqual(locus(kit, "D").alleles, ["D", "D"]);
  assert.equal(locus(kit, "D").source, "genetic-test");
});

test("missing parent records, wrong species, and cross-species IDs do not invent inheritance", () => {
  const dog = { id: "dog", name: "dog", species: "Dog", genetics: { loci: { D: { alleles: ["X", "X"] } } } };
  const kit = rabbit("kit", "", {}, { sireId: "dog", damId: "missing" });
  const before = JSON.stringify(dog);
  const result = Inheritance.reconcile({ animals: [dog, kit] }, Core);
  assert.equal(result.changed, 0);
  assert.equal(JSON.stringify(dog), before);
  assert.equal(locus(kit, "D"), undefined);
});

test("core app and PWA load the same inheritance script before saving animal records", () => {
  const html = read("index.html");
  const worker = read("service-worker.js");
  const runtime = read("herdharbor-app-runtime.js");
  const ui = read("rabbit-genetics-ui-advanced-v1.6.1.js");
  assert.ok(html.indexOf('rabbit-genetics-inheritance-v2.0.3.js?v=1') <
            html.indexOf('herdharbor-app-runtime.js?v=6'));
  assert.match(worker, /rabbit-genetics-inheritance-v2\.0\.3\.js\?v=1/);
  assert.match(runtime, /HerdHarborRabbitInheritance/);
  assert.match(runtime, /canonicalStateStore\.commit\(nextState/);
  assert.match(ui, /app\.commitState\(state\)/);
});
