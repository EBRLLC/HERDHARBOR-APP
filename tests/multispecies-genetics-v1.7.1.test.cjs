"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../multispecies-genetics-v1.7.1.js");

const foundationSpecies = ["cattle", "goat", "sheep", "poultry", "swine"];

function animal(id, species, traits = {}, extra = {}) {
  return {
    id,
    name: id,
    species,
    breed: extra.breed || "Test Breed",
    genetics: { species, traits },
    ...extra
  };
}

function record(alleles, status = "dna-confirmed", extra = {}) {
  return { alleles, status, ...extra };
}

test("v1.7.1 exposes a shared genetics contract without shipping non-rabbit gene libraries", () => {
  assert.equal(G.VERSION, "1.7.1");
  assert.equal(G.CONTRACT_VERSION, "1.7.1");
  assert.equal(G.SCHEMA_VERSION, 4);

  const adapters = G.listAdapters();
  assert.deepEqual(adapters.map((row) => row.species), ["rabbit", "cattle", "goat", "sheep", "poultry", "swine"]);
  assert.equal(G.getAdapter("rabbit").status, G.ADAPTER_STATUS.PRODUCTION);
  assert.equal(G.getAdapter("pig").species, "swine");
  assert.equal(G.getAdapter("chicken").species, "poultry");
  assert.ok(G.listTraits("rabbit").length > 0, "rabbit definitions should remain available through the delegated engine");

  for (const species of foundationSpecies) {
    const adapter = G.getAdapter(species);
    assert.ok(adapter, `${species} adapter missing`);
    assert.equal(adapter.status, G.ADAPTER_STATUS.FOUNDATION);
    assert.equal(G.listTraits(species).length, 0, `${species} must not ship unreviewed production traits in v1.7.1`);
    assert.equal(G.listLoci(species).length, 0, `${species} must not ship unreviewed production loci in v1.7.1`);
  }

  assert.equal(G.getAdapter("poultry").chromosomeSystem, "ZW");
  assert.equal(G.getAdapter("poultry").capabilities.sexLinked, true);
  assert.equal(G.getAdapter("cattle").capabilities.sexLinked, false);
});

test("foundation adapters preserve unknown records and refuse to manufacture probabilities", () => {
  const profile = G.normalizeProfile({
    traits: { mystery: record(["A", "a"], "breeder-confirmed") },
    loci: { legacy_locus: { alleles: ["B", "b"] } },
    genomicTests: [{ testName: "Imported test", result: "recorded" }]
  }, "Cattle");

  assert.equal(profile.species, "cattle");
  assert.deepEqual(profile.traits, {});
  assert.deepEqual(profile.unmappedTraits.mystery.alleles, ["A", "a"]);
  assert.deepEqual(profile.unmappedLoci.legacy_locus.alleles, ["B", "b"]);
  assert.equal(profile.genomicTests.length, 1);

  const pairing = G.analyzePairing(animal("bull", "Cattle"), animal("cow", "Cattle"));
  assert.equal(pairing.supported, true);
  assert.equal(pairing.mode, "foundation");
  assert.deepEqual(pairing.analyses, []);
  assert.equal(pairing.compatibility.sameSpecies, true);
  assert.equal(pairing.compatibility.traitDefinitionsAvailable, false);
  assert.equal(pairing.compatibility.exactPredictionsAvailable, false);
  assert.match(pairing.explanation, /intentionally deferred/i);

  const prediction = G.predictOffspring(animal("bull2", "Cattle"), animal("cow2", "Cattle"));
  assert.equal(prediction.mode, "foundation");
  assert.equal(prediction.compatibility.exactPredictionsAvailable, false);

  const incompatible = G.analyzePairing(animal("a", "Cattle"), animal("b", "Goat"));
  assert.equal(incompatible.supported, false);
  assert.equal(incompatible.mode, "incompatible-species");
});

test("species adapters can add reviewed Mendelian, co-dominant, and partial-genotype definitions without changing the shared engine", () => {
  const P = G.createPlatform({ rabbitEngine: null });
  P.registerAdapter({ species: "Horse", label: "Horse", status: P.ADAPTER_STATUS.EXPERIMENTAL, chromosomeSystem: "XY" });
  P.registerLocus("Horse", { id: "simple", name: "Test locus", alleles: ["A", "a"], scientificStatus: "test-only" });
  P.registerTrait("Horse", {
    id: "simple-recessive",
    name: "Test recessive",
    traitType: P.TRAIT_TYPES.MENDELIAN,
    inheritanceModel: P.INHERITANCE_MODELS.AUTOSOMAL_RECESSIVE,
    alleles: ["A", "a"],
    riskAllele: "a",
    condition: true,
    scientificStatus: "test-only",
    phenotypeRules: { "A/A": "Clear", "A/a": "Carrier", "a/a": "Affected" }
  });
  P.registerTrait("Horse", {
    id: "codominant-test",
    name: "Test co-dominant",
    traitType: P.TRAIT_TYPES.MENDELIAN,
    inheritanceModel: P.INHERITANCE_MODELS.CODOMINANT,
    alleles: ["C", "D"],
    scientificStatus: "test-only",
    phenotypeRules: { "C/C": "C", "C/D": "Both", "D/D": "D" }
  });

  const carrierA = animal("h1", "Horse", {
    "simple-recessive": record(["A", "a"]),
    "codominant-test": record(["C", "D"])
  });
  const carrierB = animal("h2", "Horse", {
    "simple-recessive": record(["A", "a"]),
    "codominant-test": record(["C", "D"])
  });
  const result = P.analyzePairing(carrierA, carrierB);
  assert.equal(result.mode, "analysis");

  const recessive = result.analyses.find((row) => row.traitId === "simple-recessive").result;
  assert.equal(recessive.mode, "exact");
  assert.equal(recessive.probabilities, true);
  assert.equal(recessive.outcomes.find((row) => row.carrier === "affected").probability, 0.25);
  assert.equal(recessive.outcomes.find((row) => row.carrier === "carrier").probability, 0.5);
  assert.equal(result.notices[0].probability, 0.25);

  const codominant = result.analyses.find((row) => row.traitId === "codominant-test").result;
  assert.equal(codominant.outcomes.find((row) => row.phenotype === "Both").probability, 0.5);

  const partial = P.analyzePairing(
    animal("h3", "Horse", { "simple-recessive": record(["A", P.UNKNOWN]) }),
    animal("h4", "Horse", { "simple-recessive": record(["A", "a"]) })
  );
  const partialTrait = partial.analyses.find((row) => row.traitId === "simple-recessive").result;
  assert.equal(partialTrait.mode, "partial");
  assert.equal(partialTrait.probabilities, false);
  assert.ok(partial.unknowns.includes("simple-recessive"));
});

test("the shared contract supports both XY and ZW sex-linked inheritance plumbing", () => {
  const xy = G.crossSexLinked({
    chromosomeSystem: "XY",
    phenotypeRules: {}
  }, ["X", "Y"], ["X", "Xr"], { system: "XY" });
  assert.equal(xy.mode, "exact-sex-linked");
  assert.equal(xy.chromosomeSystem, "XY");
  assert.equal(xy.outcomes.filter((row) => row.sex === "male").reduce((sum, row) => sum + row.probability, 0), 0.5);
  assert.equal(xy.outcomes.filter((row) => row.sex === "female").reduce((sum, row) => sum + row.probability, 0), 0.5);

  const zw = G.crossSexLinked({
    chromosomeSystem: "ZW",
    phenotypeRules: {}
  }, ["ZB", "Zb"], ["Zb", "W"], { system: "ZW" });
  assert.equal(zw.mode, "exact-sex-linked");
  assert.equal(zw.chromosomeSystem, "ZW");
  assert.equal(zw.outcomes.filter((row) => row.sex === "male").reduce((sum, row) => sum + row.probability, 0), 0.5);
  assert.equal(zw.outcomes.filter((row) => row.sex === "female").reduce((sum, row) => sum + row.probability, 0), 0.5);
  assert.ok(zw.outcomes.some((row) => row.sex === "female" && row.chromosomes.includes("W")));
});

test("pedigree and offspring evidence interfaces remain species-safe and evidence-ranked", () => {
  const P = G.createPlatform({ rabbitEngine: null });
  P.registerAdapter({ species: "Horse", status: P.ADAPTER_STATUS.EXPERIMENTAL });
  P.registerTrait("Horse", {
    id: "condition",
    name: "Test condition",
    traitType: P.TRAIT_TYPES.MENDELIAN,
    inheritanceModel: P.INHERITANCE_MODELS.AUTOSOMAL_RECESSIVE,
    alleles: ["N", "a"],
    riskAllele: "a",
    condition: true,
    phenotypeRules: { "N/N": "Clear", "N/a": "Carrier", "a/a": "Affected" }
  });

  const sire = animal("sire", "Horse", { condition: record(["N", "a"]) });
  const dam = animal("dam", "Horse", { condition: record(["N", "a"]) });
  const child = animal("child", "Horse", { condition: record(["a", "a"]) }, { sireId: "sire", damId: "dam" });
  const pedigree = P.pedigreeEvidence(child, [sire, dam, child], "condition");
  assert.equal(pedigree.length, 2);
  assert.ok(pedigree.every((row) => row.status === "pedigree-inferred"));

  const offspring = P.offspringEvidenceForParents(sire, dam, [child], "condition");
  assert.equal(offspring.length, 2);
  assert.ok(offspring.every((row) => row.status === "offspring-confirmed"));

  const profile = P.normalizeProfile({ traits: { condition: record(["N", "N"], "dna-confirmed", { source: "lab" }) } }, "Horse");
  const weaker = P.applyEvidence(profile, { traitId: "condition", alleles: ["a", "a"], status: "phenotype-inferred", source: "appearance" });
  assert.deepEqual(weaker.traits.condition.alleles, ["N", "N"]);
  assert.equal(weaker.conflicts.length, 1);
});

test("rabbit analysis delegates to the completed v1.6.1 rabbit genetics engine", () => {
  const core = { A: ["a", "a"], B: ["B", "B"], C: ["C", "C"], D: ["D", "D"], E: ["E", "E"] };
  const result = G.analyzePairing(
    { id: "r1", species: "Rabbit", genetics: { loci: core } },
    { id: "r2", species: "Rabbit", genetics: { loci: core } }
  );
  assert.equal(result.supported, true);
  assert.equal(result.engineVersion, "1.6.1");
  assert.equal(result.platformVersion, "1.7.1");
  assert.equal(result.delegatedTo, "rabbit-genetics-v1.6.1");
  assert.equal(result.adapter.species, "rabbit");
  assert.equal(result.adapter.status, G.ADAPTER_STATUS.PRODUCTION);
});
