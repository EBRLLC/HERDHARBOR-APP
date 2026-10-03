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
        queue.push({
          node: child,
          animal: childAnimal,
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
    legacyAncestorIds
  });
});
