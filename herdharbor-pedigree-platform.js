(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborPedigreePlatform = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "1.0.0";
  const DEFAULT_GENERATIONS = 4;
  const MAX_GENERATIONS = 8;
  const PARENT_FIELDS = Object.freeze([
    Object.freeze({ relation: "sire", field: "sireId", sex: "Male" }),
    Object.freeze({ relation: "dam", field: "damId", sex: "Female" })
  ]);

  function asId(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  function identityOf(animal) {
    if (!animal || typeof animal !== "object") return "";
    return asId(animal.id || animal.uuid || animal.recordId || animal.record_id);
  }

  function clampGenerations(value) {
    const number = Number(value || DEFAULT_GENERATIONS);
    if (!Number.isFinite(number)) return DEFAULT_GENERATIONS;
    return Math.max(1, Math.min(MAX_GENERATIONS, Math.trunc(number)));
  }

  function clonePublicAnimal(animal) {
    if (!animal || typeof animal !== "object") return null;
    return {
      id: identityOf(animal),
      name: String(animal.name || ""),
      sex: String(animal.sex || "Unknown"),
      species: String(animal.species || ""),
      dob: String(animal.dob || ""),
      breed: String(animal.breed || ""),
      color: String(animal.color || animal.variety || ""),
      variety: String(animal.variety || animal.color || ""),
      weight: animal.weight ?? animal.currentWeight ?? "",
      registrationNumber: String(animal.registrationNumber || ""),
      gcNumber: String(animal.gcNumber || animal.grandChampionNumber || ""),
      genotype: String(animal.genotype || ""),
      photoData: String(animal.photoData || animal.photoUrl || ""),
      breeder: String(animal.breeder || animal.rabbitry || animal.prefix || ""),
      rabbitry: String(animal.rabbitry || animal.breeder || animal.prefix || ""),
      sireId: asId(animal.sireId),
      damId: asId(animal.damId)
    };
  }

  function expectedAncestorSlots(generations) {
    if (generations <= 1) return 0;
    return Math.pow(2, generations) - 2;
  }

  function buildPedigreeGraph(input) {
    const options = input && typeof input === "object" ? input : {};
    const animals = Array.isArray(options.animals) ? options.animals : [];
    const generations = clampGenerations(options.generations);
    const rootId = asId(options.rootId || options.animalId);
    const byId = new Map();
    const duplicateIds = [];

    for (const animal of animals) {
      const id = identityOf(animal);
      if (!id) continue;
      if (byId.has(id)) {
        duplicateIds.push(id);
        continue;
      }
      byId.set(id, animal);
    }

    const nodes = [];
    const occurrences = new Map();
    const problems = [];
    let knownAncestorCount = 0;

    function addOccurrence(id, path) {
      if (!id) return;
      if (!occurrences.has(id)) occurrences.set(id, []);
      occurrences.get(id).push(path);
    }

    function visit(id, generation, path, relation, lineage) {
      const normalizedId = asId(id);
      const record = normalizedId ? byId.get(normalizedId) : null;
      const cycle = Boolean(normalizedId && lineage.has(normalizedId));
      const missingReference = Boolean(normalizedId && !record);
      const node = {
        path,
        generation,
        relation,
        identityId: normalizedId,
        known: Boolean(record) && !cycle,
        cycle,
        missingReference,
        expectedSex: relation === "sire" ? "Male" : relation === "dam" ? "Female" : "",
        animal: record && !cycle ? clonePublicAnimal(record) : null
      };
      nodes.push(node);

      if (generation > 0 && node.known) knownAncestorCount += 1;
      if (node.known) addOccurrence(normalizedId, path);
      if (cycle) {
        problems.push({ type: "cycle", path, identityId: normalizedId });
        return;
      }
      if (missingReference) problems.push({ type: "missing-reference", path, identityId: normalizedId });
      if (generation >= generations - 1) return;

      const nextLineage = new Set(lineage);
      if (normalizedId) nextLineage.add(normalizedId);

      for (const parent of PARENT_FIELDS) {
        const parentPath = path + "." + parent.relation;
        const parentId = record ? asId(record[parent.field]) : "";
        visit(parentId, generation + 1, parentPath, parent.relation, nextLineage);
      }
    }

    visit(rootId, 0, "root", "subject", new Set());

    const repeatedAncestors = [];
    for (const entry of [...occurrences.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const id = entry[0];
      const paths = entry[1].slice().sort();
      if (id === rootId || paths.length < 2) continue;
      repeatedAncestors.push({
        identityId: id,
        count: paths.length,
        paths
      });
    }

    const expected = expectedAncestorSlots(generations);
    const coverage = expected ? knownAncestorCount / expected : 1;
    return {
      version: VERSION,
      rootId,
      generations,
      ancestorDepth: Math.max(0, generations - 1),
      nodes,
      repeatedAncestors,
      coverage: {
        knownAncestorCount,
        expectedAncestorCount: expected,
        ratio: coverage,
        percent: Number((coverage * 100).toFixed(2))
      },
      problems: problems.sort((a, b) => {
        const typeOrder = String(a.type).localeCompare(String(b.type));
        return typeOrder || String(a.path).localeCompare(String(b.path));
      }),
      duplicateInputIds: [...new Set(duplicateIds)].sort()
    };
  }

  function nodeAt(graph, path) {
    if (!graph || !Array.isArray(graph.nodes)) return null;
    return graph.nodes.find(function (node) { return node.path === path; }) || null;
  }

  function occurrencesOf(graph, identityId) {
    const id = asId(identityId);
    if (!id || !graph || !Array.isArray(graph.nodes)) return [];
    return graph.nodes.filter(function (node) {
      return node.known && node.identityId === id;
    }).map(function (node) {
      return { path: node.path, generation: node.generation, relation: node.relation };
    });
  }

  return Object.freeze({
    VERSION,
    DEFAULT_GENERATIONS,
    MAX_GENERATIONS,
    PARENT_FIELDS,
    identityOf,
    clonePublicAnimal,
    expectedAncestorSlots,
    buildPedigreeGraph,
    nodeAt,
    occurrencesOf
  });
});
