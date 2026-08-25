(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborBreedingIntelligenceCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "1.4.0";
  const EVIDENCE_STATUS = Object.freeze({
    CONFIRMED: "confirmed",
    INFERRED: "inferred",
    POSSIBLE: "possible",
    UNKNOWN: "unknown"
  });
  const EVIDENCE_PRIORITY = Object.freeze({ unknown: 0, possible: 1, inferred: 2, confirmed: 3 });

  const SPECIES_MODULES = Object.create(null);
  const SPECIES_TERMS = Object.freeze({
    Rabbit: { male: "Buck", female: "Doe", birth: "Kindling", offspring: "Kits", group: "Litter" },
    Cattle: { male: "Bull", female: "Cow/Heifer", birth: "Calving", offspring: "Calves", group: "Calving" },
    Goat: { male: "Buck", female: "Doe", birth: "Kidding", offspring: "Kids", group: "Kidding" },
    Goats: { male: "Buck", female: "Doe", birth: "Kidding", offspring: "Kids", group: "Kidding" },
    Sheep: { male: "Ram", female: "Ewe", birth: "Lambing", offspring: "Lambs", group: "Lambing" },
    Poultry: { male: "Rooster/Cock", female: "Hen", birth: "Hatch", offspring: "Chicks", group: "Hatch" },
    Horse: { male: "Stallion", female: "Mare", birth: "Foaling", offspring: "Foals", group: "Foaling" },
    Horses: { male: "Stallion", female: "Mare", birth: "Foaling", offspring: "Foals", group: "Foaling" },
    Swine: { male: "Boar", female: "Sow/Gilt", birth: "Farrowing", offspring: "Piglets", group: "Litter" },
    Dog: { male: "Sire", female: "Dam", birth: "Whelping", offspring: "Puppies", group: "Litter" },
    Dogs: { male: "Sire", female: "Dam", birth: "Whelping", offspring: "Puppies", group: "Litter" }
  });

  const RABBIT_LOCI = Object.freeze({
    A: { name: "Agouti pattern", dominance: ["A", "at", "a"] },
    B: { name: "Black / chocolate pigment", dominance: ["B", "b"] },
    C: { name: "Color expression", dominance: ["C", "cchd", "cchl", "ch", "c"] },
    D: { name: "Dense / dilute", dominance: ["D", "d"] },
    E: { name: "Extension", dominance: ["Es", "E", "ej", "e"] }
  });

  function clean(value) { return String(value == null ? "" : value).trim(); }
  function canonicalSpecies(value) {
    const raw = clean(value).toLowerCase();
    if (raw === "rabbit" || raw === "rabbits") return "Rabbit";
    if (raw === "cattle" || raw === "cow" || raw === "cows") return "Cattle";
    if (raw === "goat" || raw === "goats") return "Goats";
    if (raw === "sheep") return "Sheep";
    if (raw === "poultry" || raw === "chicken" || raw === "chickens") return "Poultry";
    if (raw === "horse" || raw === "horses") return "Horses";
    if (raw === "swine" || raw === "pig" || raw === "pigs") return "Swine";
    if (raw === "dog" || raw === "dogs") return "Dogs";
    return clean(value) || "Other";
  }
  function speciesTerms(species) {
    const key = canonicalSpecies(species);
    return SPECIES_TERMS[key] || { male: "Sire", female: "Dam", birth: "Birth", offspring: "Offspring", group: "Birth record" };
  }
  function registerSpeciesModule(name, module) {
    if (!name || !module || typeof module !== "object") throw new Error("A species module name and object are required.");
    SPECIES_MODULES[canonicalSpecies(name)] = Object.freeze(Object.assign({}, module));
    return SPECIES_MODULES[canonicalSpecies(name)];
  }
  function getSpeciesModule(name) { return SPECIES_MODULES[canonicalSpecies(name)] || null; }

  function rankAllele(locus, allele) {
    const list = RABBIT_LOCI[locus]?.dominance || [];
    const idx = list.indexOf(allele);
    return idx < 0 ? Number.MAX_SAFE_INTEGER : idx;
  }
  function sortPair(locus, pair) {
    const values = Array.isArray(pair) ? pair.slice(0, 2) : ["_", "_"];
    while (values.length < 2) values.push("_");
    return values.sort((a, b) => {
      if (a === "_") return 1;
      if (b === "_") return -1;
      return rankAllele(locus, a) - rankAllele(locus, b);
    });
  }
  function pairKey(locus, pair) { return sortPair(locus, pair).join("/"); }
  function isKnownPair(pair) { return Array.isArray(pair) && pair.length === 2 && pair.every((a) => a && a !== "_"); }
  function dominantAllele(locus, pair) {
    const known = (Array.isArray(pair) ? pair : []).filter((a) => a && a !== "_");
    if (!known.length) return "_";
    return known.slice().sort((a, b) => rankAllele(locus, a) - rankAllele(locus, b))[0];
  }
  function allPairs(locus) {
    const alleles = RABBIT_LOCI[locus].dominance;
    const out = [];
    for (let i = 0; i < alleles.length; i += 1) {
      for (let j = i; j < alleles.length; j += 1) out.push([alleles[i], alleles[j]]);
    }
    return out;
  }
  function pairsMatchingPattern(locus, pattern) {
    const all = allPairs(locus);
    if (!Array.isArray(pattern) || pattern.length !== 2) return all;
    return all.filter((pair) => {
      const p = sortPair(locus, pair);
      const t = pattern.slice();
      const options = [[p[0], p[1]], [p[1], p[0]]];
      return options.some((candidate) => t.every((token, i) => token === "_" || token === candidate[i]));
    });
  }

  const COLOR_CONSTRAINTS = Object.freeze({
    "black": { A: [["a", "a"]], B: [["B", "_"]], C: [["C", "_"]], D: [["D", "_"]], E: [["E", "_"]] },
    "blue": { A: [["a", "a"]], B: [["B", "_"]], C: [["C", "_"]], D: [["d", "d"]], E: [["E", "_"]] },
    "chocolate": { A: [["a", "a"]], B: [["b", "b"]], C: [["C", "_"]], D: [["D", "_"]], E: [["E", "_"]] },
    "lilac": { A: [["a", "a"]], B: [["b", "b"]], C: [["C", "_"]], D: [["d", "d"]], E: [["E", "_"]] },
    "chestnut": { A: [["A", "_"]], B: [["B", "_"]], C: [["C", "_"]], D: [["D", "_"]], E: [["E", "_"]] },
    "chestnut agouti": { A: [["A", "_"]], B: [["B", "_"]], C: [["C", "_"]], D: [["D", "_"]], E: [["E", "_"]] },
    "opal": { A: [["A", "_"]], B: [["B", "_"]], C: [["C", "_"]], D: [["d", "d"]], E: [["E", "_"]] },
    "chocolate agouti": { A: [["A", "_"]], B: [["b", "b"]], C: [["C", "_"]], D: [["D", "_"]], E: [["E", "_"]] },
    "lynx": { A: [["A", "_"]], B: [["b", "b"]], C: [["C", "_"]], D: [["d", "d"]], E: [["E", "_"]] },
    "black otter": { A: [["at", "_"]], B: [["B", "_"]], C: [["C", "_"]], D: [["D", "_"]], E: [["E", "_"]] },
    "blue otter": { A: [["at", "_"]], B: [["B", "_"]], C: [["C", "_"]], D: [["d", "d"]], E: [["E", "_"]] },
    "chocolate otter": { A: [["at", "_"]], B: [["b", "b"]], C: [["C", "_"]], D: [["D", "_"]], E: [["E", "_"]] },
    "lilac otter": { A: [["at", "_"]], B: [["b", "b"]], C: [["C", "_"]], D: [["d", "d"]], E: [["E", "_"]] },
    "black tort": { A: [["a", "a"]], B: [["B", "_"]], C: [["C", "_"]], D: [["D", "_"]], E: [["e", "e"]] },
    "blue tort": { A: [["a", "a"]], B: [["B", "_"]], C: [["C", "_"]], D: [["d", "d"]], E: [["e", "e"]] },
    "chocolate tort": { A: [["a", "a"]], B: [["b", "b"]], C: [["C", "_"]], D: [["D", "_"]], E: [["e", "e"]] },
    "lilac tort": { A: [["a", "a"]], B: [["b", "b"]], C: [["C", "_"]], D: [["d", "d"]], E: [["e", "e"]] },
    "rew": { C: [["c", "c"]] },
    "red eyed white": { C: [["c", "c"]] },
    "red-eyed white": { C: [["c", "c"]] },
    "pointed white": { C: [["ch", "ch"], ["ch", "c"]] },
    "himalayan": { C: [["ch", "ch"], ["ch", "c"]] },
    "californian": { C: [["ch", "ch"], ["ch", "c"]] }
  });

  function normalizeColor(value) { return clean(value).toLowerCase().replace(/\s+/g, " "); }
  function colorConstraints(color) { return COLOR_CONSTRAINTS[normalizeColor(color)] || null; }
  function patternLabelForColor(color) {
    const constraints = colorConstraints(color);
    if (!constraints) return "No validated core A/B/C/D/E pattern is mapped for this recorded color.";
    return Object.keys(RABBIT_LOCI).map((locus) => {
      const entries = constraints[locus];
      if (!entries) return `${locus}_/_`;
      return `${locus}:${entries.map((p) => p.join("")).join(" or ")}`;
    }).join(" · ");
  }

  function normalizeGenetics(genetics) {
    const source = genetics && typeof genetics === "object" ? genetics : {};
    const loci = {};
    Object.keys(RABBIT_LOCI).forEach((locus) => {
      const raw = source.loci?.[locus];
      let pair = Array.isArray(raw) ? raw : raw?.alleles;
      pair = sortPair(locus, Array.isArray(pair) ? pair : ["_", "_"]);
      loci[locus] = { alleles: pair, status: raw?.status || EVIDENCE_STATUS.UNKNOWN, source: raw?.source || "", note: raw?.note || "" };
    });
    return { version: 1, species: "Rabbit", loci, evidence: Array.isArray(source.evidence) ? source.evidence.slice() : [], tests: Array.isArray(source.tests) ? source.tests.slice() : [], conflicts: Array.isArray(source.conflicts) ? source.conflicts.slice() : [], updatedAt: source.updatedAt || null };
  }

  function possiblePairsForLocus(profile, color, locus) {
    const genetics = normalizeGenetics(profile?.genetics);
    const explicit = genetics.loci[locus].alleles;
    let candidates = allPairs(locus);
    if (explicit.some((a) => a && a !== "_")) candidates = pairsMatchingPattern(locus, explicit);
    const constraints = colorConstraints(color);
    if (constraints?.[locus]) {
      const allowed = new Set();
      constraints[locus].forEach((pattern) => pairsMatchingPattern(locus, pattern).forEach((pair) => allowed.add(pairKey(locus, pair))));
      const filtered = candidates.filter((pair) => allowed.has(pairKey(locus, pair)));
      if (filtered.length) candidates = filtered;
    }
    return candidates;
  }

  function gameteDistribution(pair) {
    if (!isKnownPair(pair)) return null;
    const [a, b] = pair;
    if (a === b) return new Map([[a, 1]]);
    return new Map([[a, 0.5], [b, 0.5]]);
  }
  function crossLocus(locus, parent1, parent2) {
    const g1 = gameteDistribution(sortPair(locus, parent1));
    const g2 = gameteDistribution(sortPair(locus, parent2));
    if (!g1 || !g2) return { exact: false, outcomes: [] };
    const totals = new Map();
    g1.forEach((p1, a1) => g2.forEach((p2, a2) => {
      const pair = sortPair(locus, [a1, a2]);
      const key = pairKey(locus, pair);
      totals.set(key, (totals.get(key) || 0) + p1 * p2);
    }));
    return { exact: true, outcomes: Array.from(totals.entries()).map(([key, probability]) => ({ alleles: key.split("/"), probability })) };
  }

  function basePigmentName(Bpair, Dpair) {
    const chocolate = Bpair[0] === "b" && Bpair[1] === "b";
    const dilute = Dpair[0] === "d" && Dpair[1] === "d";
    if (chocolate && dilute) return "Lilac";
    if (chocolate) return "Chocolate";
    if (dilute) return "Blue";
    return "Black";
  }
  function phenotypeFromGenotype(genotype) {
    const A = sortPair("A", genotype.A), B = sortPair("B", genotype.B), C = sortPair("C", genotype.C), D = sortPair("D", genotype.D), E = sortPair("E", genotype.E);
    if (![A, B, C, D, E].every(isKnownPair)) return { name: "Unknown", family: "Unknown", scope: "core" };
    if (C[0] === "c" && C[1] === "c") return { name: "REW", family: "Red-eyed white", scope: "core A/B/C/D/E" };
    const cTop = dominantAllele("C", C);
    if (cTop === "ch") return { name: "Pointed White family", family: "Himalayan/Pointed White", scope: "core A/B/C/D/E" };
    if (cTop === "cchl") return { name: "Shaded family", family: "Shaded", scope: "core A/B/C/D/E" };
    if (cTop === "cchd") return { name: "Chinchilla family", family: "Chinchilla", scope: "core A/B/C/D/E" };
    const aTop = dominantAllele("A", A), eTop = dominantAllele("E", E), pigment = basePigmentName(B, D), nonExtension = E[0] === "e" && E[1] === "e";
    if (nonExtension) {
      if (aTop === "a") return { name: `${pigment} Tort`, family: "Tortoiseshell", scope: "core A/B/C/D/E" };
      if (aTop === "A") return { name: "Orange/Fawn family", family: "Non-extension agouti", scope: "modifier-dependent" };
      return { name: "Non-extension tan-pattern family", family: "Non-extension", scope: "modifier-dependent" };
    }
    if (eTop === "ej") return { name: "Harlequin family", family: "Harlequin/Japanese", scope: "modifier-dependent" };
    if (eTop === "Es" && aTop === "A") return { name: "Steel family", family: "Steel", scope: "modifier-dependent" };
    if (aTop === "A") {
      const names = { Black: "Chestnut Agouti", Blue: "Opal", Chocolate: "Chocolate Agouti", Lilac: "Lynx" };
      return { name: names[pigment], family: "Agouti", scope: "core A/B/C/D/E" };
    }
    if (aTop === "at") return { name: `${pigment} Otter`, family: "Tan pattern", scope: "core A/B/C/D/E" };
    return { name: pigment, family: "Self", scope: "core A/B/C/D/E" };
  }

  function exactCross(parent1, parent2) {
    const lociResults = {};
    for (const locus of Object.keys(RABBIT_LOCI)) {
      const p1 = normalizeGenetics(parent1?.genetics).loci[locus].alleles;
      const p2 = normalizeGenetics(parent2?.genetics).loci[locus].alleles;
      if (!isKnownPair(p1) || !isKnownPair(p2)) return null;
      lociResults[locus] = crossLocus(locus, p1, p2).outcomes;
    }
    let rows = [{ genotype: {}, probability: 1 }];
    Object.keys(RABBIT_LOCI).forEach((locus) => {
      const next = [];
      rows.forEach((row) => lociResults[locus].forEach((outcome) => next.push({ genotype: Object.assign({}, row.genotype, { [locus]: outcome.alleles }), probability: row.probability * outcome.probability })));
      rows = next;
    });
    const byPhenotype = new Map();
    rows.forEach((row) => {
      const phenotype = phenotypeFromGenotype(row.genotype), key = `${phenotype.name}|${phenotype.scope}`;
      const existing = byPhenotype.get(key) || { name: phenotype.name, family: phenotype.family, scope: phenotype.scope, probability: 0, genotypes: [] };
      existing.probability += row.probability;
      existing.genotypes.push({ genotype: row.genotype, probability: row.probability });
      byPhenotype.set(key, existing);
    });
    return Array.from(byPhenotype.values()).sort((a, b) => b.probability - a.probability || a.name.localeCompare(b.name));
  }

  function possibleOffspringPairs(locus, parent1Pairs, parent2Pairs) {
    const out = new Map();
    parent1Pairs.forEach((p1) => parent2Pairs.forEach((p2) => new Set(p1).forEach((a) => new Set(p2).forEach((b) => {
      const pair = sortPair(locus, [a, b]); out.set(pairKey(locus, pair), pair);
    }))));
    return Array.from(out.values());
  }
  function possiblePhenotypes(parent1, parent2, limit) {
    const locusPairs = {};
    Object.keys(RABBIT_LOCI).forEach((locus) => {
      locusPairs[locus] = possibleOffspringPairs(locus, possiblePairsForLocus(parent1, parent1?.color || parent1?.variety, locus), possiblePairsForLocus(parent2, parent2?.color || parent2?.variety, locus));
    });
    let combos = [{ genotype: {} }];
    const max = Number(limit) || 12000;
    for (const locus of Object.keys(RABBIT_LOCI)) {
      const next = [];
      for (const row of combos) {
        for (const pair of locusPairs[locus]) { next.push({ genotype: Object.assign({}, row.genotype, { [locus]: pair }) }); if (next.length >= max) break; }
        if (next.length >= max) break;
      }
      combos = next;
    }
    const names = new Map();
    combos.forEach((row) => { const phenotype = phenotypeFromGenotype(row.genotype); if (phenotype.name !== "Unknown") names.set(`${phenotype.name}|${phenotype.scope}`, phenotype); });
    return Array.from(names.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  function genotypeText(genetics) { const g = normalizeGenetics(genetics); return Object.keys(RABBIT_LOCI).map((locus) => `${locus}:${g.loci[locus].alleles.join("")}`).join(" "); }
  function ancestorMap(animal, animals, maxDepth) {
    const byId = new Map((animals || []).map((a) => [String(a.id), a])), out = new Map();
    function walk(current, depth) {
      if (!current || depth > maxDepth) return;
      [current.sireId, current.damId].filter(Boolean).forEach((id) => { const ancestor = byId.get(String(id)); if (!ancestor) return; const key = String(ancestor.id); const prev = out.get(key); if (!prev || depth < prev.depth) out.set(key, { animal: ancestor, depth }); walk(ancestor, depth + 1); });
    }
    walk(animal, 1); return out;
  }
  function sharedAncestors(parent1, parent2, animals, maxDepth) {
    const a = ancestorMap(parent1, animals, maxDepth || 3), b = ancestorMap(parent2, animals, maxDepth || 3), shared = [];
    a.forEach((left, id) => { const right = b.get(id); if (right) shared.push({ id, name: left.animal.name || left.animal.tag || id, parent1Depth: left.depth, parent2Depth: right.depth }); });
    return shared.sort((x, y) => (x.parent1Depth + x.parent2Depth) - (y.parent1Depth + y.parent2Depth));
  }

  const RECESSIVE_PROOF = Object.freeze({
    A: { allele: "a", colors: ["black", "blue", "chocolate", "lilac", "black tort", "blue tort", "chocolate tort", "lilac tort"] },
    B: { allele: "b", colors: ["chocolate", "lilac", "chocolate agouti", "lynx", "chocolate otter", "lilac otter", "chocolate tort", "lilac tort"] },
    C: { allele: "c", colors: ["rew", "red eyed white", "red-eyed white"] },
    D: { allele: "d", colors: ["blue", "lilac", "opal", "lynx", "blue otter", "lilac otter", "blue tort", "lilac tort"] },
    E: { allele: "e", colors: ["black tort", "blue tort", "chocolate tort", "lilac tort"] }
  });
  function phenotypeProvesHomozygous(color, locus) { const rule = RECESSIVE_PROOF[locus]; return rule && rule.colors.includes(normalizeColor(color)) ? rule.allele : null; }
  function pedigreeEvidence(animal, animals, maxDepth) {
    const byId = new Map((animals || []).map((a) => [String(a.id), a])), evidence = [];
    function inspect(parentId, depth, relation) {
      if (!parentId || depth > (maxDepth || 3)) return;
      const ancestor = byId.get(String(parentId)); if (!ancestor) return;
      Object.keys(RECESSIVE_PROOF).forEach((locus) => { const allele = phenotypeProvesHomozygous(ancestor.color || ancestor.variety, locus); if (!allele) return; evidence.push({ locus, allele, status: depth === 1 ? EVIDENCE_STATUS.CONFIRMED : EVIDENCE_STATUS.POSSIBLE, source: "pedigree", relatedAnimalId: ancestor.id, note: depth === 1 ? `${animal.name || "This rabbit"} must inherit ${allele} at the ${locus} locus from ${ancestor.name || relation}, whose recorded phenotype requires ${allele}${allele}.` : `${allele} appears in the pedigree through ${ancestor.name || relation}; inheritance to ${animal.name || "this rabbit"} is possible but not established.`, depth }); });
      inspect(ancestor.sireId, depth + 1, "sire"); inspect(ancestor.damId, depth + 1, "dam");
    }
    inspect(animal?.sireId, 1, "sire"); inspect(animal?.damId, 1, "dam"); return evidence;
  }
  function offspringEvidenceForParent(parent, mate, offspring) {
    const evidence = [];
    (offspring || []).forEach((child) => Object.keys(RECESSIVE_PROOF).forEach((locus) => { const allele = phenotypeProvesHomozygous(child.color || child.variety, locus); if (!allele) return; evidence.push({ locus, allele, status: EVIDENCE_STATUS.INFERRED, source: "offspring", relatedAnimalId: child.id, mateId: mate?.id || null, note: `${parent?.name || "Parent"} supplied ${allele} at the ${locus} locus to ${child.name || "recorded offspring"}, whose recorded phenotype requires ${allele}${allele}.` }); }));
    const unique = new Map(); evidence.forEach((item) => unique.set(`${item.locus}|${item.allele}|${item.relatedAnimalId}`, item)); return Array.from(unique.values());
  }
  function applyEvidenceToGenetics(genetics, evidenceItems) {
    const out = normalizeGenetics(genetics), conflicts = out.conflicts.slice();
    (evidenceItems || []).forEach((evidence) => {
      if (!RABBIT_LOCI[evidence.locus] || !evidence.allele) return;
      const record = out.loci[evidence.locus], pair = record.alleles.slice(), has = pair.includes(evidence.allele), currentPriority = EVIDENCE_PRIORITY[record.status] || 0, incomingPriority = EVIDENCE_PRIORITY[evidence.status] || 0;
      if (!has && isKnownPair(pair) && currentPriority >= EVIDENCE_PRIORITY.confirmed) conflicts.push({ locus: evidence.locus, existing: pair.slice(), incomingAllele: evidence.allele, evidence, createdAt: new Date().toISOString() });
      else if (!has) { const empty = pair.indexOf("_"); if (empty >= 0) pair[empty] = evidence.allele; else if (!isKnownPair(pair) || incomingPriority > currentPriority) pair[1] = evidence.allele; record.alleles = sortPair(evidence.locus, pair); }
      if (incomingPriority > currentPriority) record.status = evidence.status;
      if (evidence.note) record.note = evidence.note;
      record.source = evidence.source || record.source;
      out.evidence.push(Object.assign({ createdAt: new Date().toISOString() }, evidence));
    });
    out.conflicts = conflicts; out.updatedAt = new Date().toISOString(); return out;
  }

  function previousOffspring(parent1, parent2, animals, births) {
    const parentIds = new Set([String(parent1?.id || ""), String(parent2?.id || "")]);
    const matchingBirthIds = new Set((births || []).filter((birth) => { const ids = new Set([String(birth.sireId || ""), String(birth.damId || "")]); return ids.size === parentIds.size && Array.from(parentIds).every((id) => ids.has(id)); }).map((birth) => String(birth.id)));
    return (animals || []).filter((animal) => { const direct = parentIds.has(String(animal.sireId || "")) && parentIds.has(String(animal.damId || "")); return direct || matchingBirthIds.has(String(animal.sourceBirthId || "")); });
  }
  function performanceForAnimal(animal, breedings, births) {
    const id = String(animal?.id || ""), attempts = (breedings || []).filter((b) => String(b.femaleId || b.damId || "") === id || String(b.maleId || b.sireId || "") === id), delivered = attempts.filter((b) => /delivered|completed/i.test(String(b.status || ""))).length, relevantBirths = (births || []).filter((b) => String(b.damId || "") === id || String(b.sireId || "") === id), sum = (key) => relevantBirths.reduce((total, b) => total + (Number(b[key]) || 0), 0), alive = sum("bornAlive"), weaned = sum("weaned"), stillborn = sum("stillborn");
    return { breedings: attempts.length, successfulBreedings: delivered, births: relevantBirths.length, bornAlive: alive, stillborn, weaned, survivalRate: alive > 0 ? weaned / alive : null, averageLitterSize: relevantBirths.length ? alive / relevantBirths.length : null };
  }
  function deepClone(value) { return JSON.parse(JSON.stringify(value)); }
  function createPredictionSnapshot(analysis, metadata) {
    const now = new Date().toISOString();
    return Object.freeze({ id: `genetics_prediction_${now.replace(/[^0-9]/g, "")}_${Math.random().toString(36).slice(2, 8)}`, version: 1, engineVersion: VERSION, createdAt: now, metadata: deepClone(metadata || {}), analysis: deepClone(analysis) });
  }
  function analyzePairing(parent1, parent2, context) {
    if (canonicalSpecies(parent1?.species) !== "Rabbit" || canonicalSpecies(parent2?.species) !== "Rabbit") return { supported: false, reason: "Rabbit coat-color genetics is the first production genetics module in Alpha v1.4.0." };
    const exact = exactCross(parent1, parent2), possible = exact ? [] : possiblePhenotypes(parent1, parent2), animals = context?.animals || [], births = context?.births || [], offspring = previousOffspring(parent1, parent2, animals, births), colors = new Map();
    offspring.forEach((child) => { const color = clean(child.color || child.variety) || "Unrecorded"; colors.set(color, (colors.get(color) || 0) + 1); });
    const incomplete = [];
    [parent1, parent2].forEach((parent) => { const g = normalizeGenetics(parent.genetics); Object.keys(RABBIT_LOCI).forEach((locus) => { if (!isKnownPair(g.loci[locus].alleles)) incomplete.push({ animalId: parent.id, animalName: parent.name, locus, alleles: g.loci[locus].alleles.slice() }); }); });
    return { supported: true, engineVersion: VERSION, species: "Rabbit", parent1: { id: parent1.id, name: parent1.name, color: parent1.color || parent1.variety || "", genotype: genotypeText(parent1.genetics) }, parent2: { id: parent2.id, name: parent2.name, color: parent2.color || parent2.variety || "", genotype: genotypeText(parent2.genetics) }, exact: Boolean(exact), exactOutcomes: exact || [], possibleOutcomes: possible, incompleteLoci: incomplete, sharedAncestors: sharedAncestors(parent1, parent2, animals, 3), pedigreeEvidence: { parent1: pedigreeEvidence(parent1, animals, 3), parent2: pedigreeEvidence(parent2, animals, 3) }, previousOffspring: Array.from(colors.entries()).map(([color, count]) => ({ color, count })), explanation: exact ? "Both parents have complete A/B/C/D/E genotypes, so the displayed percentages are Mendelian probabilities for the supported core loci. Modifier genes can still affect the visible variety." : "One or more parental alleles are unknown. HerdHarbor therefore shows genetically possible core color families without pretending the missing carrier information is known.", disclaimer: "Predictions use recorded A/B/C/D/E genetics and supported phenotype mappings. Rabbit coat color can involve additional modifier genes, breed-specific expression, incomplete records, and misidentified phenotypes; actual offspring may differ." };
  }

  const RabbitGeneticsModule = registerSpeciesModule("Rabbit", { version: 1, name: "Rabbit coat-color genetics", loci: RABBIT_LOCI, analyzePairing, phenotypeFromGenotype, pedigreeEvidence, offspringEvidenceForParent, sources: [ { title: "Utah State University Extension — Rabbit Breeding and Management", url: "https://extension.usu.edu/small-acreage-livestock/research/rabbit-breeding-and-management-a-guide-for-producers" }, { title: "Utah State University Extension — Basic Rabbit Selection and Breeding Considerations", url: "https://extension.usu.edu/small-acreage-livestock/research/basic-rabbit-selection-and-breeding-consideration" } ] });

  return Object.freeze({ VERSION, EVIDENCE_STATUS, RABBIT_LOCI, RabbitGeneticsModule, canonicalSpecies, speciesTerms, registerSpeciesModule, getSpeciesModule, normalizeGenetics, colorConstraints, patternLabelForColor, possiblePairsForLocus, crossLocus, phenotypeFromGenotype, exactCross, possiblePhenotypes, pedigreeEvidence, offspringEvidenceForParent, applyEvidenceToGenetics, sharedAncestors, previousOffspring, performanceForAnimal, createPredictionSnapshot, analyzePairing, genotypeText, deepClone });
});
