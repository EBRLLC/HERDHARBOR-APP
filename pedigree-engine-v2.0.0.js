(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HerdHarborPedigreeEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "2.0.0-a1";
  const DEFAULT_GENERATIONS = 4;
  const MAX_GENERATIONS = 8;
  const RELATIONS = Object.freeze([
    Object.freeze({ key: "sire", field: "sireId", sex: "Male" }),
    Object.freeze({ key: "dam", field: "damId", sex: "Female" })
  ]);

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeIdentityPart(value) {
    return clean(value)
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function identityForAnimal(animal) {
    if (!animal || typeof animal !== "object") return "";
    const id = clean(animal.id);
    if (id) return `id:${id}`;

    const species = normalizeIdentityPart(animal.species);
    const stableFields = [
      ["registration", animal.registrationNumber || animal.registration || animal.regNumber || animal.regNo],
      ["tattoo", animal.tattoo],
      ["ear-tag", animal.earTagNumber || animal.earTag],
      ["tag", animal.tag]
    ];
    for (const [kind, raw] of stableFields) {
      const value = normalizeIdentityPart(raw);
      if (value) return `${kind}:${species || "animal"}:${value}`;
    }
    return "";
  }

  function normalizeGenerations(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return DEFAULT_GENERATIONS;
    return Math.max(1, Math.min(MAX_GENERATIONS, Math.trunc(number)));
  }

  function slotKey(path) {
    if (!Array.isArray(path) || !path.length) return "subject";
    return path.map((part, index) => {
      const value = clean(part).toLowerCase();
      return index === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
    }).join("");
  }

  function relationLabel(path) {
    if (!Array.isArray(path) || !path.length) return "Animal";
    const words = path.map((part) => part === "sire" ? "sire" : "dam");
    return words.map((word, index) => index === 0
      ? word.charAt(0).toUpperCase() + word.slice(1)
      : `'s ${word}`).join("");
  }

  function parseReference(value) {
    if (value == null || value === "") return { kind: "empty", id: "" };
    if (typeof value === "string" || typeof value === "number") {
      const id = clean(value);
      return id ? { kind: "id", id } : { kind: "empty", id: "" };
    }
    return { kind: "malformed", id: "", valueType: typeof value };
  }

  function buildAnimalIndex(animals) {
    const index = new Map();
    const duplicateIds = new Set();
    for (const animal of Array.isArray(animals) ? animals : []) {
      const id = clean(animal && animal.id);
      if (!id) continue;
      if (index.has(id)) {
        duplicateIds.add(id);
        continue;
      }
      index.set(id, animal);
    }
    return { index, duplicateIds: [...duplicateIds].sort() };
  }

  function makeNode({ path, generation, relation, status, animal = null, referenceId = "", repeatOf = "", issue = "" }) {
    const key = slotKey(path);
    const animalId = clean(animal && animal.id);
    const identity = animal ? (identityForAnimal(animal) || `slot:${key}`) : (
      referenceId ? `${status}:${referenceId}:${key}` : `${status}:${key}`
    );
    return {
      key,
      path: [...path],
      generation,
      relation,
      status,
      animalId,
      identity,
      referenceId: clean(referenceId),
      repeatOf: clean(repeatOf),
      issue: clean(issue),
      animal: animal || null
    };
  }

  function buildGraph(options = {}) {
    const animals = Array.isArray(options.animals) ? options.animals : [];
    const generations = normalizeGenerations(options.generations ?? options.depth);
    const ancestorIdsInput = options.ancestorIds && typeof options.ancestorIds === "object"
      ? options.ancestorIds
      : {};
    const subjectId = clean(options.subjectId || options.subject?.id);
    const { index, duplicateIds } = buildAnimalIndex(animals);
    const issues = duplicateIds.map((id) => ({
      type: "duplicate-id",
      key: "subject",
      referenceId: id,
      message: `Duplicate animal id "${id}" was ignored after the first record.`
    }));

    const subject = subjectId ? (index.get(subjectId) || options.subject || null) : (options.subject || null);
    const rootStatus = subject ? "known" : (subjectId ? "missing-reference" : "unknown");
    const root = makeNode({
      path: [],
      generation: 0,
      relation: "Animal",
      status: rootStatus,
      animal: subject,
      referenceId: subject ? "" : subjectId,
      issue: subjectId && !subject ? "Subject animal reference was not found." : ""
    });

    if (root.issue) {
      issues.push({
        type: "missing-subject",
        key: "subject",
        referenceId: subjectId,
        message: root.issue
      });
    }

    const nodes = [root];
    const byKey = { subject: root };
    const ancestorIds = {};
    const firstPathById = new Map();
    if (subject && clean(subject.id)) firstPathById.set(clean(subject.id), "subject");

    const queue = [{
      node: root,
      animal: subject,
      path: [],
      branchIds: new Set(subject && clean(subject.id) ? [clean(subject.id)] : [])
    }];

    const maxAncestorDepth = Math.max(0, generations - 1);
    while (queue.length) {
      const current = queue.shift();
      if (current.path.length >= maxAncestorDepth) continue;

      for (const relation of RELATIONS) {
        const childPath = [...current.path, relation.key];
        const key = slotKey(childPath);
        const overridePresent = Object.prototype.hasOwnProperty.call(ancestorIdsInput, key);
        const sourceValue = overridePresent
          ? ancestorIdsInput[key]
          : current.animal?.[relation.field];
        const parsed = parseReference(sourceValue);

        let child;
        let childAnimal = null;
        let nextBranchIds = new Set(current.branchIds);

        if (parsed.kind === "malformed") {
          child = makeNode({
            path: childPath,
            generation: childPath.length,
            relation: relationLabel(childPath),
            status: "malformed-reference",
            issue: `${relation.field} must be a string or number reference.`
          });
          issues.push({
            type: "malformed-reference",
            key,
            referenceId: "",
            message: child.issue
          });
        } else if (parsed.kind === "empty") {
          child = makeNode({
            path: childPath,
            generation: childPath.length,
            relation: relationLabel(childPath),
            status: "unknown"
          });
        } else if (current.branchIds.has(parsed.id)) {
          childAnimal = index.get(parsed.id) || null;
          child = makeNode({
            path: childPath,
            generation: childPath.length,
            relation: relationLabel(childPath),
            status: "cycle",
            animal: childAnimal,
            referenceId: parsed.id,
            repeatOf: firstPathById.get(parsed.id) || "",
            issue: `Circular pedigree reference detected for "${parsed.id}".`
          });
          issues.push({
            type: "cycle",
            key,
            referenceId: parsed.id,
            message: child.issue
          });
        } else {
          childAnimal = index.get(parsed.id) || null;
          if (!childAnimal) {
            child = makeNode({
              path: childPath,
              generation: childPath.length,
              relation: relationLabel(childPath),
              status: "missing-reference",
              referenceId: parsed.id,
              issue: `Referenced animal "${parsed.id}" was not found.`
            });
            issues.push({
              type: "missing-reference",
              key,
              referenceId: parsed.id,
              message: child.issue
            });
          } else {
            const repeatOf = firstPathById.get(parsed.id) || "";
            child = makeNode({
              path: childPath,
              generation: childPath.length,
              relation: relationLabel(childPath),
              status: repeatOf ? "repeat" : "known",
              animal: childAnimal,
              referenceId: parsed.id,
              repeatOf
            });
            ancestorIds[key] = parsed.id;
            if (!repeatOf) firstPathById.set(parsed.id, key);
            nextBranchIds.add(parsed.id);
          }
        }

        nodes.push(child);
        byKey[key] = child;
        const traversableAnimal = child.status === "known" || child.status === "repeat"
          ? childAnimal
          : null;
        queue.push({
          node: child,
          animal: traversableAnimal,
          path: childPath,
          branchIds: nextBranchIds
        });
      }
    }

    const expectedAncestorSlots = Math.pow(2, maxAncestorDepth + 1) - 2;
    const knownAncestorSlots = nodes.filter((node) =>
      node.generation > 0 && (node.status === "known" || node.status === "repeat")
    ).length;
    const uniqueKnownAncestors = new Set(nodes
      .filter((node) => node.generation > 0 && (node.status === "known" || node.status === "repeat"))
      .map((node) => node.animalId)
      .filter(Boolean)).size;
    const unknownAncestorSlots = Math.max(0, expectedAncestorSlots - knownAncestorSlots);
    const coverage = expectedAncestorSlots === 0 ? 1 : knownAncestorSlots / expectedAncestorSlots;

    return {
      version: VERSION,
      subjectId,
      generations,
      maxAncestorDepth,
      root,
      nodes,
      byKey,
      ancestorIds,
      issues,
      completeness: {
        expectedAncestorSlots,
        knownAncestorSlots,
        unknownAncestorSlots,
        uniqueKnownAncestors,
        coverage,
        percent: Math.round(coverage * 10000) / 100
      }
    };
  }

  function occurrenceForNode(node) {
    if (!node || node.generation <= 0 || !node.animal) return null;
    const identity = identityForAnimal(node.animal);
    if (!identity) return null;
    return {
      identity,
      animalId: clean(node.animal.id),
      animal: node.animal,
      key: node.key,
      path: [...node.path],
      relation: node.relation,
      depth: node.generation,
      status: node.status
    };
  }

  function lineageProfile(options = {}) {
    const graph = buildGraph(options);
    const occurrenceMap = new Map();

    for (const node of graph.nodes) {
      const occurrence = occurrenceForNode(node);
      if (!occurrence) continue;
      if (!occurrenceMap.has(occurrence.identity)) {
        occurrenceMap.set(occurrence.identity, {
          identity: occurrence.identity,
          animalId: occurrence.animalId,
          animal: occurrence.animal,
          occurrences: []
        });
      }
      occurrenceMap.get(occurrence.identity).occurrences.push(occurrence);
    }

    const ancestors = [...occurrenceMap.values()].map((row) => {
      const occurrences = row.occurrences
        .slice()
        .sort((a, b) => a.depth - b.depth || a.key.localeCompare(b.key));
      return {
        identity: row.identity,
        animalId: row.animalId,
        animal: row.animal,
        occurrences,
        occurrenceCount: occurrences.length,
        repeated: occurrences.length > 1,
        closestDepth: occurrences[0]?.depth || null,
        closestOccurrences: occurrences.filter((item) => item.depth === occurrences[0]?.depth)
      };
    }).sort((a, b) =>
      (a.closestDepth || Number.MAX_SAFE_INTEGER) - (b.closestDepth || Number.MAX_SAFE_INTEGER) ||
      clean(a.animal?.name).localeCompare(clean(b.animal?.name)) ||
      a.identity.localeCompare(b.identity)
    );

    return {
      graph,
      generations: graph.generations,
      maxAncestorDepth: graph.maxAncestorDepth,
      ancestors,
      byIdentity: Object.fromEntries(ancestors.map((row) => [row.identity, row])),
      repeatedAncestors: ancestors.filter((row) => row.repeated),
      completeness: { ...graph.completeness },
      issues: graph.issues.slice()
    };
  }

  function sharedAncestorAnalysis(options = {}) {
    const animals = Array.isArray(options.animals) ? options.animals : [];
    const generations = normalizeGenerations(options.generations ?? options.depth ?? DEFAULT_GENERATIONS);
    const animalA = options.animalA || animals.find((item) => clean(item?.id) === clean(options.animalAId)) || null;
    const animalB = options.animalB || animals.find((item) => clean(item?.id) === clean(options.animalBId)) || null;

    const profileA = lineageProfile({ animals, subject: animalA, subjectId: animalA?.id || options.animalAId, generations });
    const profileB = lineageProfile({ animals, subject: animalB, subjectId: animalB?.id || options.animalBId, generations });
    const shared = [];

    for (const rowA of profileA.ancestors) {
      const rowB = profileB.byIdentity[rowA.identity];
      if (!rowB) continue;
      const pathPairs = [];
      for (const occurrenceA of rowA.occurrences) {
        for (const occurrenceB of rowB.occurrences) {
          pathPairs.push({
            animalA: occurrenceA,
            animalB: occurrenceB,
            totalDepth: occurrenceA.depth + occurrenceB.depth
          });
        }
      }
      pathPairs.sort((left, right) =>
        left.totalDepth - right.totalDepth ||
        left.animalA.depth - right.animalA.depth ||
        left.animalA.key.localeCompare(right.animalA.key) ||
        left.animalB.key.localeCompare(right.animalB.key)
      );
      const closestTotalDepth = pathPairs[0]?.totalDepth ?? null;
      shared.push({
        identity: rowA.identity,
        animalId: rowA.animalId || rowB.animalId,
        animal: rowA.animal || rowB.animal,
        name: clean(rowA.animal?.name || rowB.animal?.name || rowA.animalId || rowB.animalId),
        animalAOccurrences: rowA.occurrences,
        animalBOccurrences: rowB.occurrences,
        animalARepeated: rowA.repeated,
        animalBRepeated: rowB.repeated,
        pathPairs,
        pathPairCount: pathPairs.length,
        closestTotalDepth,
        closestPathPairs: pathPairs.filter((pair) => pair.totalDepth === closestTotalDepth)
      });
    }

    shared.sort((left, right) =>
      (left.closestTotalDepth ?? Number.MAX_SAFE_INTEGER) - (right.closestTotalDepth ?? Number.MAX_SAFE_INTEGER) ||
      left.name.localeCompare(right.name) ||
      left.identity.localeCompare(right.identity)
    );

    return {
      version: VERSION,
      method: "canonical-pedigree-shared-ancestor-path-analysis",
      generations,
      maxAncestorDepth: Math.max(profileA.maxAncestorDepth, profileB.maxAncestorDepth),
      animalA: {
        id: clean(animalA?.id || options.animalAId),
        name: clean(animalA?.name),
        profile: profileA
      },
      animalB: {
        id: clean(animalB?.id || options.animalBId),
        name: clean(animalB?.name),
        profile: profileB
      },
      sharedAncestors: shared,
      sharedAncestorCount: shared.length,
      totalSharedPathPairs: shared.reduce((sum, row) => sum + row.pathPairCount, 0),
      closestRelationshipPaths: shared.flatMap((row) =>
        row.closestPathPairs.map((pair) => ({
          ancestorIdentity: row.identity,
          ancestorId: row.animalId,
          ancestorName: row.name,
          animalA: pair.animalA,
          animalB: pair.animalB,
          totalDepth: pair.totalDepth
        }))
      ).sort((left, right) =>
        left.totalDepth - right.totalDepth ||
        left.ancestorName.localeCompare(right.ancestorName) ||
        left.animalA.key.localeCompare(right.animalA.key)
      ),
      completeness: {
        animalA: { ...profileA.completeness },
        animalB: { ...profileB.completeness }
      },
      issues: {
        animalA: profileA.issues.slice(),
        animalB: profileB.issues.slice()
      }
    };
  }

  function coefficientValue(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return Math.round(number * 1e12) / 1e12;
  }

  function pedigreeCalculationOrder(options = {}) {
    const animals = Array.isArray(options.animals) ? options.animals : [];
    const generations = normalizeGenerations(options.generations ?? options.depth ?? DEFAULT_GENERATIONS);
    const animalA = options.animalA || animals.find((item) => clean(item?.id) === clean(options.animalAId)) || null;
    const animalB = options.animalB || animals.find((item) => clean(item?.id) === clean(options.animalBId)) || null;
    const { index } = buildAnimalIndex(animals);
    const included = new Set();

    for (const subject of [animalA, animalB]) {
      const subjectId = clean(subject?.id);
      if (!subjectId) continue;
      included.add(subjectId);
      const graph = buildGraph({ animals, subject, subjectId, generations });
      for (const node of graph.nodes) {
        if (node.animalId && (node.status === "known" || node.status === "repeat")) included.add(node.animalId);
      }
    }

    const visiting = new Set();
    const visited = new Set();
    const order = [];
    const issues = [];

    function visit(id, childId = "") {
      const key = clean(id);
      if (!key || visited.has(key) || !included.has(key)) return;
      if (visiting.has(key)) {
        issues.push({
          type: "cycle",
          animalId: clean(childId),
          referenceId: key,
          message: `Circular pedigree edge involving "${key}" was excluded from the relationship calculation.`
        });
        return;
      }
      const animal = index.get(key);
      if (!animal) return;
      visiting.add(key);
      for (const relation of RELATIONS) {
        const parsed = parseReference(animal[relation.field]);
        if (parsed.kind !== "id" || !included.has(parsed.id) || !index.has(parsed.id)) continue;
        if (visiting.has(parsed.id)) {
          issues.push({
            type: "cycle",
            animalId: key,
            referenceId: parsed.id,
            field: relation.field,
            message: `Circular pedigree edge ${key} → ${parsed.id} was excluded from the relationship calculation.`
          });
          continue;
        }
        visit(parsed.id, key);
      }
      visiting.delete(key);
      visited.add(key);
      order.push(key);
    }

    [...included].sort().forEach((id) => visit(id));

    return {
      generations,
      animalA,
      animalB,
      includedIds: [...included].sort(),
      order,
      index,
      issues
    };
  }

  function numeratorRelationshipMatrix(options = {}) {
    const pedigree = pedigreeCalculationOrder(options);
    const order = pedigree.order;
    const position = new Map(order.map((id, index) => [id, index]));
    const matrix = Array.from({ length: order.length }, () => Array(order.length).fill(0));
    const parentRows = [];

    for (let i = 0; i < order.length; i += 1) {
      const animal = pedigree.index.get(order[i]);
      const sireRef = parseReference(animal?.sireId);
      const damRef = parseReference(animal?.damId);
      const sireIndex = sireRef.kind === "id" && position.has(sireRef.id) && position.get(sireRef.id) < i
        ? position.get(sireRef.id)
        : null;
      const damIndex = damRef.kind === "id" && position.has(damRef.id) && position.get(damRef.id) < i
        ? position.get(damRef.id)
        : null;

      for (let j = 0; j < i; j += 1) {
        const sireContribution = sireIndex == null ? 0 : matrix[sireIndex][j];
        const damContribution = damIndex == null ? 0 : matrix[damIndex][j];
        matrix[i][j] = coefficientValue(0.5 * (sireContribution + damContribution));
        matrix[j][i] = matrix[i][j];
      }

      const parentalRelationship = sireIndex != null && damIndex != null
        ? matrix[sireIndex][damIndex]
        : 0;
      matrix[i][i] = coefficientValue(1 + (0.5 * parentalRelationship));
      parentRows.push({
        animalId: order[i],
        sireId: sireIndex == null ? "" : order[sireIndex],
        damId: damIndex == null ? "" : order[damIndex],
        sireRecordedButUnavailable: sireRef.kind === "id" && sireIndex == null,
        damRecordedButUnavailable: damRef.kind === "id" && damIndex == null,
        inbreedingCoefficient: coefficientValue(matrix[i][i] - 1)
      });
    }

    return {
      ...pedigree,
      position,
      matrix,
      parentRows
    };
  }

  function pedigreeRelationshipAnalysis(options = {}) {
    const shared = sharedAncestorAnalysis(options);
    const calculation = numeratorRelationshipMatrix(options);
    const animalAId = clean(calculation.animalA?.id || options.animalAId);
    const animalBId = clean(calculation.animalB?.id || options.animalBId);
    const indexA = calculation.position.get(animalAId);
    const indexB = calculation.position.get(animalBId);
    const relationshipCoefficient = indexA == null || indexB == null
      ? null
      : coefficientValue(calculation.matrix[indexA][indexB]);
    const kinshipCoefficient = relationshipCoefficient == null
      ? null
      : coefficientValue(relationshipCoefficient / 2);
    const projectedOffspringPedigreeCoi = kinshipCoefficient;

    const inbreedingById = Object.fromEntries(calculation.parentRows.map((row) => [
      row.animalId,
      row.inbreedingCoefficient
    ]));

    const sharedAncestryUsed = shared.sharedAncestors.map((row) => ({
      identity: row.identity,
      animalId: row.animalId,
      name: row.name,
      pathPairCount: row.pathPairCount,
      closestTotalDepth: row.closestTotalDepth,
      animalAOccurrences: row.animalAOccurrences,
      animalBOccurrences: row.animalBOccurrences,
      ancestorPedigreeCoi: row.animalId && Object.prototype.hasOwnProperty.call(inbreedingById, row.animalId)
        ? inbreedingById[row.animalId]
        : null
    }));

    const directAncestryUsed = [];
    const identityA = identityForAnimal(calculation.animalA);
    const identityB = identityForAnimal(calculation.animalB);
    const aInB = identityA ? shared.animalB.profile.byIdentity[identityA] : null;
    const bInA = identityB ? shared.animalA.profile.byIdentity[identityB] : null;
    if (aInB) {
      directAncestryUsed.push({
        type: "direct-ancestor",
        ancestorOf: "animalB",
        identity: identityA,
        animalId: animalAId,
        name: clean(calculation.animalA?.name),
        occurrences: aInB.occurrences,
        closestDepth: aInB.closestDepth,
        ancestorPedigreeCoi: Object.prototype.hasOwnProperty.call(inbreedingById, animalAId)
          ? inbreedingById[animalAId]
          : null
      });
    }
    if (bInA) {
      directAncestryUsed.push({
        type: "direct-ancestor",
        ancestorOf: "animalA",
        identity: identityB,
        animalId: animalBId,
        name: clean(calculation.animalB?.name),
        occurrences: bInA.occurrences,
        closestDepth: bInA.closestDepth,
        ancestorPedigreeCoi: Object.prototype.hasOwnProperty.call(inbreedingById, animalBId)
          ? inbreedingById[animalBId]
          : null
      });
    }

    return {
      version: VERSION,
      method: "tabular-numerator-relationship-matrix",
      label: "Pedigree COI",
      animalA: {
        id: animalAId,
        name: clean(calculation.animalA?.name),
        individualPedigreeCoi: indexA == null ? null : coefficientValue(calculation.matrix[indexA][indexA] - 1)
      },
      animalB: {
        id: animalBId,
        name: clean(calculation.animalB?.name),
        individualPedigreeCoi: indexB == null ? null : coefficientValue(calculation.matrix[indexB][indexB] - 1)
      },
      relationshipCoefficient,
      kinshipCoefficient,
      projectedOffspringPedigreeCoi,
      generationsAnalyzed: calculation.generations,
      ancestorGenerationsAnalyzed: Math.max(0, calculation.generations - 1),
      pedigreeCompleteness: {
        animalA: { ...shared.completeness.animalA },
        animalB: { ...shared.completeness.animalB }
      },
      sharedAncestorCount: shared.sharedAncestorCount,
      sharedAncestors: shared.sharedAncestors,
      closestRelationshipPaths: shared.closestRelationshipPaths,
      totalSharedPathPairs: shared.totalSharedPathPairs,
      sharedAncestryUsed,
      directAncestryUsed,
      ancestryUsedInCalculation: [...directAncestryUsed, ...sharedAncestryUsed],
      repeatedSharedAncestorCount: sharedAncestryUsed.filter((row) =>
        row.animalAOccurrences.length > 1 || row.animalBOccurrences.length > 1
      ).length,
      calculationPopulation: calculation.order.map((id, index) => ({
        animalId: id,
        individualPedigreeCoi: coefficientValue(calculation.matrix[index][index] - 1)
      })),
      issues: [
        ...shared.issues.animalA,
        ...shared.issues.animalB,
        ...calculation.issues
      ],
      assumptions: {
        missingAncestry: "Unrecorded or unavailable ancestors contribute no known coancestry to this recorded-pedigree calculation; pedigree completeness is reported so the result is not presented as complete ancestry.",
        coefficientType: "Pedigree COI calculated from recorded parentage. This is not genomic COI."
      }
    };
  }

  function legacyAncestorIds(options = {}) {
    return { ...buildGraph(options).ancestorIds };
  }

  return Object.freeze({
    VERSION,
    DEFAULT_GENERATIONS,
    MAX_GENERATIONS,
    RELATIONS,
    identityForAnimal,
    normalizeGenerations,
    slotKey,
    relationLabel,
    buildGraph,
    lineageProfile,
    sharedAncestorAnalysis,
    numeratorRelationshipMatrix,
    pedigreeRelationshipAnalysis,
    legacyAncestorIds
  });
});
